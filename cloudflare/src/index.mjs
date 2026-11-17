import {MAP_VERSION} from '../../worker/city-map.mjs';
import {projectLocalDocument,applyLocalDelta,localDocumentState} from '../../worker/local-host-delta.mjs';
import {loadLocalHostJournal,clearLocalHostJournal,saveLocalHostBase,appendLocalHostDelta,localHostExportStream} from './local-host-journal.mjs';
import {LOCAL_HOST_TTL_MS,localHostSnapshot,mergeLocalHostCheckpoint,localHostClaimStream} from '../../worker/local-host-state.mjs';
export {FlyWireBrainShard,FlyWireNeuralCoordinator} from "./neural/objects.mjs";
import { DurableObject } from "cloudflare:workers";
import {loadSnapshot, saveSnapshot, saveSnapshotMapped, exportSnapshot, exportSnapshotMapped} from "./civilization-snapshot.mjs";
import {handleConflictControl} from '../../worker/conflict-control.mjs';
import {
  freshState,
  restoreState,
  getRawState,
  getState,
  tick,
  mortalityReport,
  snapshotLooksUsable,
  setNeuralSyncEnabled,
  getSimulationConfig,
  getNeuralAgents,applyNeuralOutputs,getNeuralStatus,markNeuralCycleFailed,neuralActors,countries,
} from "../../worker/civilization-engine.mjs";

const DEFAULT_WORLD_ID = "WORLD-A";
const DEFAULT_ALARM_INTERVAL_MS = 5_000;
const DEFAULT_IDLE_MAX_STEPS = 90;
const ACTIVE_PERSIST_INTERVAL_MS = 60_000;
const MAX_RECOVERY_SECONDS = 15;

setNeuralSyncEnabled(false);

function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "cache-control": "no-store",
    ...extra,
  };
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders({
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    }),
  });
}

export class CivilizationWorld extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.lastWallClockMs = Date.now();
    this.lastPersistMs = 0;
    this.storageStats = null;
    this.nextAlarmAtMs = null;
    this.queue = Promise.resolve();
    this.localHost=null;this.localEpoch=0;this.localDocument=null;this.localObserver=null;this.localJournalMeta=null;this.archiveDormant=false;
    this.baseKnownIds=new Set();this.baseAliveIds=new Set();

    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      const storedKnown=new Set(),storedAlive=new Set();
      const mapResident=f=>{storedKnown.add(f.id);if(f.alive){storedAlive.add(f.id);return f;}return null;};
      const saved=await loadSnapshot(this.ctx.storage,{mapResident});
      this.archiveDormant=true;
      if(saved&&!snapshotLooksUsable(saved.state))throw Error('Invalid saved civilization state');
      let base;
      if(saved){
        base=saved.state;this.storageStats=saved.stats;this.lastWallClockMs=saved.lastWallClockMs;this.lastPersistMs=saved.savedAtMs;
      }else{
        freshState();base=getRawState();this.lastWallClockMs=Date.now();
        this.storageStats=await saveSnapshot(this.ctx.storage,base,this.lastWallClockMs);this.lastPersistMs=Date.now();
      }
      this.baseKnownIds=storedKnown.size?storedKnown:new Set(base.flies.map(f=>f.id));
      this.baseAliveIds=storedAlive.size?storedAlive:new Set(base.flies.filter(f=>f.alive).map(f=>f.id));
      // Reconstruct against the persisted schema BEFORE the engine migrates maps.
      // A new map release must preserve every already-acknowledged browser save.
      const journal=await loadLocalHostJournal(this.ctx.storage,base,saved?.savedAtMs||0);
      this.localHost=await this.ctx.storage.get('localHostLease')||null;
      this.localEpoch=Math.max(Number(this.localHost?.epoch||0),Number(journal?.meta?.epoch||0));
      const compatibleOwner=this.localHost?.protocol===3&&Number(journal?.meta?.mapVersion??base.mapVersion)===MAP_VERSION;
      if(journal&&!journal.stale){
        this.localJournalMeta=journal.meta;this.lastWallClockMs=journal.lastWallClockMs;
        if(compatibleOwner&&this.localHost.expiresAt>Date.now()){
          restoreState(base);this.localDocument=journal.document;this.localObserver=journal.observer;
        }else restoreState(journal.state);
      }else{
        restoreState(base);
        if(journal?.stale)await clearLocalHostJournal(this.ctx.storage);
      }
      if(this.localHost&&!compatibleOwner){
        this.localHost.leaving=true;this.localHost.expiresAt=Math.min(this.localHost.expiresAt,Date.now()+15000);
        await this.ctx.storage.put('localHostLease',this.localHost);
      }
      await this.ensureAlarm();
    });
    if(env.NEURAL_ENABLED==='1'&&env.NEURAL_COORDINATOR){
      ctx.waitUntil(this.ready.then(()=>env.NEURAL_COORDINATOR.getByName(env.CIV_WORLD_ID||DEFAULT_WORLD_ID).ensureRunning()).catch(error=>console.error(JSON.stringify({event:'neural_start_failed',error:String(error)}))));
    }
  }

  withLock(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  alarmIntervalMs() {
    const configured = Number(this.env.CIV_ALARM_INTERVAL_MS || DEFAULT_ALARM_INTERVAL_MS);
    return Math.max(5_000, Math.min(60_000, configured));
  }

  idleMaxSteps() {
    const configured = Number(this.env.CIV_IDLE_MAX_STEPS || DEFAULT_IDLE_MAX_STEPS);
    return Math.max(10, Math.min(600, Math.floor(configured)));
  }

  async ensureAlarm() {
    const current = await this.ctx.storage.getAlarm();
    const now = Date.now();
    const interval = this.alarmIntervalMs();
    if (current == null || current < now - 2 * interval || current > now + interval + 1000) {
      const next = now + interval;
      await this.ctx.storage.setAlarm(next);
      this.nextAlarmAtMs=next;return next;
    }
    this.nextAlarmAtMs=current;return current;
  }

  async materializeLocalDocument(){
    if(this.localDocument){
      const document=this.journalDocument(this.localDocument),locations=getRawState().locations;
      // Historical brains are already durable in the framed base. Neither
      // owner expiry nor background cognition needs to load them back into RAM.
      restoreState({...localDocumentState(document),locations});
      this.localDocument=null;this.localObserver=null;
    }
    // Release acknowledges the journal first. Replay accepted commands only
    // after this later archive hydration, retaining receipts across a crash.
    for(const command of this.localJournalMeta?.pendingCommands||[])countries.requestConflict(command);
  }

  journalDocument(document){
    // Preserve deaths since the last full base without copying historical brains.
    const recentDead=getRawState().flies.filter(f=>!f.alive&&(this.baseAliveIds.has(f.id)||!this.baseKnownIds.has(f.id)));
    return {world:document.world,actors:{...Object.fromEntries(recentDead.map(f=>[f.id,f])),...document.actors}};
  }

  async advanceTo(nowMs, reason = "request") {
    await this.ready;
    if(this.localHost&&this.localHost.expiresAt>nowMs)return {elapsedRealSeconds:0,steps:0,localHost:true};
    await this.materializeLocalDocument();
    if(this.localHost){
      for(const command of this.localHost.commands||[])countries.requestConflict(command);
      this.localHost=null;
      await this.ctx.storage.delete('localHostLease');
    }
    const elapsedRealSeconds = Math.max(0, (nowMs - this.lastWallClockMs) / 1000);
    if (elapsedRealSeconds < 0.75) return { elapsedRealSeconds, steps: 0 };

    const raw = getRawState();
    if (!snapshotLooksUsable(raw)) throw new Error("Invalid civilization state before tick");

    // A long outage resumes from the checkpoint. Compressing days into one
    // alarm would jump over daily events and age residents before they can act.
    const sampledSeconds = Math.min(elapsedRealSeconds, Math.max(MAX_RECOVERY_SECONDS, this.alarmIntervalMs() / 1000 * 2));
    const skippedRealSeconds = elapsedRealSeconds - sampledSeconds;
    // One complete social step advances the elapsed clock. Repeating the full
    // population pass 4–6 times caused the free DO's alarm CPU watchdog to reset
    // this world before its progress could be saved.
    const decisionBudget = 1;
    const maxSteps = decisionBudget;
    const steps = Math.min(
      maxSteps,
      Math.max(1, Math.floor(sampledSeconds)),
    );
    const timeScale = Number(getRawState()?.timeScale || getSimulationConfig().gameSecondsPerRealSecond || 120);
    const totalGameSeconds = sampledSeconds * timeScale;
    const gameSecondsPerStep = Math.max(1, totalGameSeconds / steps);

    const ageBefore=Number(getRawState().simulationAgeSeconds||0);
    for (let index = 0; index < steps; index += 1) {
      await tick({ gameSeconds: gameSecondsPerStep, syncBrain: false,serialized:true });
      // Each tick is atomic. Yield between completed ticks so observer events
      // can run; awaiting an already-resolved tick only drains microtasks.
      if (index + 1 < steps) {
        if (typeof scheduler !== 'undefined' && typeof scheduler.wait === 'function') await scheduler.wait(0);
        else await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    this.lastWallClockMs = nowMs;
    getRawState().updatedAt = new Date(nowMs).toISOString();
    if (skippedRealSeconds > 0) console.warn(JSON.stringify({event: "city_clock_resumed", skippedRealSeconds}));
    return this.lastAdvance = {
      elapsedRealSeconds, skippedRealSeconds, steps, gameSecondsPerStep,
      advancedGameSeconds: Number(getRawState().simulationAgeSeconds || 0) - ageBefore,
    };
  }

  async persistIfDue(force = false) {
    if(this.localHost&&this.localHost.expiresAt>Date.now())return this.storageStats;
    const now = Date.now();
    if (!force && now - this.lastPersistMs < ACTIVE_PERSIST_INTERVAL_MS) return this.storageStats;
    await this.materializeLocalDocument();
    const observer=getState({observer:true,compactObserver:true});
    const document=this.journalDocument(projectLocalDocument(localHostSnapshot(getRawState())));
    this.localJournalMeta=await saveLocalHostBase(this.ctx.storage,document,null,{
      observer,lastWallClockMs:this.lastWallClockMs,epoch:this.localEpoch,
      sequence:this.localJournalMeta?.sequence||0,
    });
    this.lastPersistMs = now;
    return this.storageStats;
  }

  async compactHistoryIfDue(){
    if(this.localHost&&this.localHost.expiresAt>Date.now())return false;
    await this.materializeLocalDocument();
    const state=getRawState(),dead=state.flies.filter(f=>!f.alive);
    if(dead.length<32)return false;
    const document=this.journalDocument(projectLocalDocument(state));
    // This is a separate alarm work unit: stream the old archive, replace only
    // current identities, then evict completed deaths without dropping history.
    this.storageStats=await saveSnapshotMapped(this.ctx.storage,document,this.lastWallClockMs);
    await clearLocalHostJournal(this.ctx.storage);this.localJournalMeta=null;
    for(const id of Object.keys(document.actors))this.baseKnownIds.add(id);
    const living=state.flies.filter(f=>f.alive);
    this.baseAliveIds=new Set(living.map(f=>f.id));
    restoreState({...state,flies:living});this.lastPersistMs=Date.now();
    return true;
  }

  async alarm() {
    return this.withLock(async () => {
      await this.ready;
      this.nextAlarmAtMs=Date.now()+this.alarmIntervalMs();
      await this.ctx.storage.setAlarm(this.nextAlarmAtMs);
      try {
        if(await this.compactHistoryIfDue())return;
        await this.advanceTo(Date.now(), "alarm");
        await this.persistIfDue(false);
      } catch (error) {
        console.error(JSON.stringify({event: "city_alarm_failed", error: String(error)}));
      }
    });
  }

  async watchdog() {
    return this.withLock(async () => {
      await this.ready;
      await this.ensureAlarm();
    });
  }

  hostingStatus(){
    const lease=this.localHost,active=Boolean(lease&&lease.expiresAt>Date.now());
    return {active,mode:active?'browser':'background',sequence:lease?.sequence||this.localJournalMeta?.sequence||0,savedAt:this.localJournalMeta?.savedAtMs||null,expiresAt:lease?.expiresAt||null,lastCheckpointError:this.lastCheckpointError||null};
  }

  async localHostingStatus(){
    await this.ready;
    return this.hostingStatus();
  }

  async getNeuralInputs(){
    await this.ready;
    return this.withLock(async()=>{if(this.localHost&&this.localHost.expiresAt>Date.now())return {worldId:this.env.CIV_WORLD_ID||DEFAULT_WORLD_ID,agents:[]};await this.materializeLocalDocument();return {worldId:this.env.CIV_WORLD_ID||DEFAULT_WORLD_ID,agents:getNeuralAgents({refreshPerception:true})};});
  }
  async applyNeuralBatch(batch){
    await this.ready;
    // Brain shards persist their own neural checkpoints. City progress follows
    // the normal snapshot cadence instead of recompressing the city per batch.
    return this.withLock(async()=>{if(this.localHost&&this.localHost.expiresAt>Date.now())return {applied:0,localHost:true};await this.materializeLocalDocument();const status=applyNeuralOutputs(batch.outputs,batch);await this.persistIfDue(false);return status;});
  }
  async neuralCycleFailed(details){
    await this.ready;
    return this.withLock(async()=>{if(!this.localHost||this.localHost.expiresAt<=Date.now()){await this.materializeLocalDocument();markNeuralCycleFailed(details);}return getNeuralStatus();});
  }

  readObservation(url) {
    const nextAlarmAtMs=this.nextAlarmAtMs;
    const advance={...(this.lastAdvance||{}),snapshotAgeSeconds:Math.max(0,(Date.now()-this.lastWallClockMs)/1000)};
    if(url.pathname==='/api/civilization/neural'){
      const status=getNeuralStatus(),freshFor=Math.max(120000,Number(status.intervalMs||1000)*3);
      return json({...status,brains:neuralActors().map(f=>{
        const fc=f.brain?.fullConnectome;
        return {id:f.id,kind:f.kind||'resident',brainId:f.brain?.id,connected:Boolean(fc?.connected&&fc.fullConnectome&&Date.now()-Number(fc.lastSyncAt||0)<=freshFor),neurons:fc?.neurons||0,edges:fc?.edges||0,steps:fc?.neuralStepsTotal||0,spikesThisBatch:fc?.spikesThisBatch||0,lastSyncAt:fc?.lastSyncAt||0};
      })});
    }
    if(url.pathname==='/health'){
      const state=this.localDocument?localDocumentState(this.localDocument):getRawState();
      if(url.searchParams.get('view')==='brief'){
        return json({ok:snapshotLooksUsable(state),worldId:this.env.CIV_WORLD_ID||DEFAULT_WORLD_ID,
          simulationAgeSeconds:Number(state?.simulationAgeSeconds||0),snapshotAgeSeconds:advance.snapshotAgeSeconds,hosting:this.hostingStatus()});
      }
      return json({ok:snapshotLooksUsable(state),service:'fruit-fly-civilization-cloudflare',runtime:'cloudflare-durable-object',worldId:this.env.CIV_WORLD_ID||DEFAULT_WORLD_ID,simulationStatus:state?'SYNTHETIC_CIVILIZATION_LIVE':'STARTING',population:state?.flies?.filter(f=>f.alive).length||0,simulationAgeSeconds:Number(state?.simulationAgeSeconds||0),persistence:'DURABLE_OBJECT_SQLITE',alarmIntervalMs:this.alarmIntervalMs(),nextAlarmAtMs,sampledCatchup:advance,hosting:this.hostingStatus(),storage:this.storageStats,neural:getNeuralStatus()});
    }
    const observer=url.searchParams.get('view')==='observer';
    if(this.localDocument&&this.localObserver){
      const payload={...this.localObserver,runtime:{platform:'cloudflare-durable-object',persistence:'sqlite-delta-journal',alarmIntervalMs:this.alarmIntervalMs(),nextAlarmAtMs,sampledCatchup:advance}};
      return json(payload);
    }
    const payload=getState({observer,compactObserver:observer&&url.searchParams.get('transport')==='compact',selectedId:url.searchParams.get('selected')});
    payload.runtime={platform:'cloudflare-durable-object',persistence:'sqlite-gzip-chunks',alarmIntervalMs:this.alarmIntervalMs(),nextAlarmAtMs,sampledCatchup:advance};
    return json(payload);
  }

  async localSession(request,url){
    await this.ready;
    const path=url.pathname,checkpoint=path.endsWith('/checkpoint');
    if(checkpoint&&request.headers.get('content-type')!=='application/x-city-delta+gzip')return json({error:'local_protocol_update_required'},409);
    let body;
    try{
      // Delta uploads are bounded and decoded before entering the mutation queue.
      const stream=checkpoint?request.body.pipeThrough(new DecompressionStream('gzip')):request.body;
      let bytes=0;const limit=checkpoint?12*1024*1024:4096;
      const bounded=stream.pipeThrough(new TransformStream({transform(chunk,controller){bytes+=chunk.byteLength;if(bytes>limit)throw Error('local request too large');controller.enqueue(chunk);}}));
      body=await new Response(bounded).json();
    }catch{return json({error:'invalid_local_request'},400);}
    return this.withLock(async()=>{
      const now=Date.now(),claim=path.endsWith('/claim'),lease=this.localHost;
      if(claim){
        if(body.clientProtocol!==3)return json({granted:false,updateRequired:true});
        const resuming=lease?.leaving&&body.resume?.token===lease.token&&body.resume?.epoch===lease.epoch;
        if(lease&&lease.expiresAt>now&&!resuming)return json({granted:false,expiresAt:lease.expiresAt,sequence:lease.sequence});
        // Only the same closing tab may skip its leave grace period. Other
        // devices cannot replace an active owner, even if they retry rapidly.
        if(resuming)this.localHost={...lease,expiresAt:now};
        // Resume actual simulation time from the durable checkpoint BEFORE
        // agreeing a new delta base. Otherwise a reload between alarms starts
        // at an older clock (five real seconds are ten game minutes).
        await this.advanceTo(now,'local_claim');
        let raw=getRawState();
        // Build the initial observer BEFORE agreeing the base. Active reads then
        // serve this record, so no observer normalizer mutates the shared base.
        const initialObserver=getState({observer:true,compactObserver:true});
        const recentDead=raw.flies.filter(f=>!f.alive&&(this.baseAliveIds.has(f.id)||!this.baseKnownIds.has(f.id)));
        // Historical deaths remain intact in SQLite. Drop their heavy in-memory
        // models and rebuild all service maps before subsequent COW updates.
        raw.flies=raw.flies.filter(f=>f.alive||recentDead.includes(f));
        restoreState(raw);raw=getRawState();this.archiveDormant=true;
        const document=projectLocalDocument(localHostSnapshot(raw));
        const next={protocol:3,mapVersion:raw.mapVersion,token:crypto.randomUUID(),epoch:++this.localEpoch,sequence:0,startedAt:now,baseAge:Number(raw.simulationAgeSeconds),expiresAt:now+LOCAL_HOST_TTL_MS,commands:[]};
        const journalDocument=this.journalDocument(document);
        this.localDocument=document;this.localObserver=initialObserver;
        try{
          this.localJournalMeta=await saveLocalHostBase(this.ctx.storage,journalDocument,next,{lastWallClockMs:this.lastWallClockMs,observer:initialObserver});
        }catch(error){
          this.localDocument=null;this.localObserver=null;this.localHost=null;
          throw error;
        }
        this.localDocument=document;this.localHost=next;this.localObserver=initialObserver;
        return new Response(localHostClaimStream(localDocumentState(document),next).pipeThrough(new CompressionStream('gzip')),{encodeBody:'manual',headers:corsHeaders({'content-type':'application/json','content-encoding':'gzip','access-control-expose-headers':'x-city-host-token,x-city-host-epoch','x-city-host-token':next.token,'x-city-host-epoch':String(next.epoch)})});
      }
      if(!lease||lease.expiresAt<=now||body.token!==lease.token||body.epoch!==lease.epoch)return json({error:'local_session_replaced'},409);
      if(path.endsWith('/heartbeat')){
        const renewed={...lease,expiresAt:lease.leaving?lease.expiresAt:now+LOCAL_HOST_TTL_MS};
        await this.ctx.storage.put('localHostLease',renewed);this.localHost=renewed;
        return json({ok:true,expiresAt:renewed.expiresAt,sequence:renewed.sequence,commands:renewed.commands||[]});
      }
      if(path.endsWith('/leave')){
        const leaving={...lease,leaving:true,expiresAt:Math.min(lease.expiresAt,now+15000)};
        await this.ctx.storage.put('localHostLease',leaving);this.localHost=leaving;
        return json({ok:true});
      }
      if(checkpoint){
        if(!Number.isSafeInteger(body.sequence)||body.sequence<1||!Number.isSafeInteger(body.baseSequence))return json({error:'invalid_local_sequence'},400);
        if(body.sequence<=lease.sequence)return json({ok:true,duplicate:true,sequence:lease.sequence,commands:lease.commands||[]});
        if(body.baseSequence!==lease.sequence||body.sequence!==lease.sequence+1)return json({error:'local_save_base_changed'},409);
        try{
          if(!this.localDocument)throw Error('local delta base unavailable');
          const nextDocument=applyLocalDelta(this.localDocument,body.patch);
          // Validation reads canonical documents without mutating their agreed base.
          mergeLocalHostCheckpoint(localDocumentState(this.localDocument),localDocumentState(nextDocument),lease,now);
          const acknowledged=new Set(Array.isArray(body.acknowledgedCommands)?body.acknowledgedCommands:[]);
          const updated={...lease,sequence:body.sequence,commands:(lease.commands||[]).filter(c=>!acknowledged.has(c.requestId)),expiresAt:lease.leaving?lease.expiresAt:now+LOCAL_HOST_TTL_MS};
          const observer=body.observer||this.localObserver;
          const document=this.journalDocument(nextDocument);
          // This small atomic journal write is the acknowledgement boundary.
          // Full historical archives are never encoded in a five-second save.
          const journalBody=body.release?{...body,releaseCommands:updated.commands}:body;
          const meta=await appendLocalHostDelta(this.ctx.storage,document,journalBody,body.release?null:updated,observer);
          this.localDocument=nextDocument;this.localObserver=observer;this.localJournalMeta=meta;
          this.lastWallClockMs=meta.lastWallClockMs;this.lastCheckpointError=null;
          this.localHost=body.release?null:updated;
          // A release is already durable and fenced. Do not hydrate the large
          // archive while this request still pins its patch/observer buffers;
          // the next alarm, claim or neural RPC materializes after they are freed.
          return json({ok:true,sequence:body.sequence,savedAt:meta.savedAtMs,commands:updated.commands});
        }catch(error){
          this.lastCheckpointError={at:now,error:String(error)};
          console.warn(JSON.stringify({event:'local_checkpoint_rejected',...this.lastCheckpointError}));
          return json({error:String(error)},422);
        }
      }
      return json({error:'unknown_local_operation'},404);
    });
  }

  async fetch(request) {
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders()});
    const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname.startsWith('/api/civilization/local/'))return this.localSession(request,url);
    if(request.method==='GET'&&['/health','/api/civilization/state','/api/civilization/neural'].includes(url.pathname)){
      await this.ready;
      // A read is synchronous against the last complete JS step. It must not
      // queue behind gzip/storage, force a save, advance time, or issue SQLite I/O.
      return this.readObservation(url);
    }
    return this.withLock(async () => {
      await this.ready;

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      const url = new URL(request.url);
      // Observing checkpoints does not force additional city decision work.
      // Observers read the world; the background alarm owns its cadence, independent of viewers.
      const observing=request.method==="GET";
      const advance=observing?{...(this.lastAdvance||{}),snapshotAgeSeconds:Math.max(0,(Date.now()-this.lastWallClockMs)/1000)}:await this.advanceTo(Date.now(),"request");
      const nextAlarmAtMs = await this.ensureAlarm();

      if(url.pathname==='/api/civilization/conflict'&&request.method==='POST'){
        const lease=this.localHost&&this.localHost.expiresAt>Date.now()?this.localHost:null;
        const result=await handleConflictControl(request,{
          requestConflict:command=>{
            if(!lease)return countries.requestConflict(command);
            lease.commands||=[];
            if(!lease.commands.some(c=>c.requestId===command.requestId)){
              if(lease.commands.length>=32)return {accepted:false,reason:'conflict queue is full'};
              lease.commands.push(command);
            }
            return {accepted:true,requestId:command.requestId,status:'queued'};
          },
          persist:()=>lease?this.ctx.storage.put('localHostLease',lease):this.persistIfDue(true),
        });
        return json(result.body,result.status);
      }

      if (url.pathname === "/api/civilization/mortality") {
        const report = mortalityReport();
        return json({
          worldId: this.env.CIV_WORLD_ID || DEFAULT_WORLD_ID,
          source: "durable civilization snapshot",
          recordedDeaths: report.recordedDeaths,
          causes: Object.entries(report.byCause || {})
            .map(([cause, count]) => ({ cause, count }))
            .sort((a, b) => b.count - a.count),
          riskAtDeath: report.riskAtDeath,
          note: report.note,
        });
      }

      if (url.pathname === "/api/civilization/events") {
        const state = getRawState();
        const body = [
          `event: connected\ndata: ${JSON.stringify({ worldId: this.env.CIV_WORLD_ID || DEFAULT_WORLD_ID })}\n`,
          `event: recent-events\ndata: ${JSON.stringify({ events: state?.events?.slice(-40) || [] })}\n`,
        ].join("\n");
        return new Response(body, {
          status: 200,
          headers: corsHeaders({
            "content-type": "text/event-stream; charset=utf-8",
          }),
        });
      }

      if (url.pathname === "/api/civilization/export") {
        if(this.localDocument||this.archiveDormant){
          // Re-read the durable accepted document so an asynchronous export is
          // isolated from later handoff/engine ticks and never drops archives.
          const journal=await loadLocalHostJournal(this.ctx.storage,getRawState());
          const document=journal&&!journal.stale?journal.document:this.journalDocument(projectLocalDocument(localHostSnapshot(getRawState())));
          return new Response(await exportSnapshotMapped(this.ctx.storage,this.env.CIV_WORLD_ID||DEFAULT_WORLD_ID,document),{headers:corsHeaders({'content-type':'application/json; charset=utf-8'})});
        }
        await this.persistIfDue(true);
        const body = await exportSnapshot(this.ctx.storage, this.env.CIV_WORLD_ID || DEFAULT_WORLD_ID);
        return new Response(body, {
          headers: corsHeaders({"content-type": "application/json; charset=utf-8"}),
        });
      }

      if (url.pathname === "/api/civilization/import" && request.method === "POST") {
        const adminToken = String(this.env.CIV_ADMIN_TOKEN || "");
        const auth = request.headers.get("authorization") || "";
        if (!adminToken || auth !== `Bearer ${adminToken}`) {
          return json({ error: "unauthorized" }, 401);
        }
        const body = await request.json();
        if (!snapshotLooksUsable(body?.state)) {
          return json({ error: "invalid_snapshot" }, 400);
        }
        restoreState(body.state);
        this.lastWallClockMs = Date.now();
        await this.persistIfDue(true);
        return json({
          ok: true,
          importedSimulationAgeSeconds: Number(getRawState().simulationAgeSeconds || 0),
          population: getRawState().flies.filter((fly) => fly.alive).length,
        });
      }

      return json({
        error: "not_found",
        endpoints: [
          "/health",
          "/api/civilization/state",
          "/api/civilization/mortality",
          "/api/civilization/events",
          "/api/civilization/export",
        ],
      }, 404);
    });
  }
}

export default {
  scheduled(_event, env, ctx) {
    ctx.waitUntil(env.CIVILIZATION.getByName(env.CIV_WORLD_ID || DEFAULT_WORLD_ID).watchdog());
  },
  fetch(request, env) {
    const worldId = env.CIV_WORLD_ID || DEFAULT_WORLD_ID;
    const id = env.CIVILIZATION.idFromName(worldId);
    return env.CIVILIZATION.get(id).fetch(request);
  },
};
