export {FlyWireBrainShard,FlyWireNeuralCoordinator} from "./neural/objects.mjs";
import { DurableObject } from "cloudflare:workers";
import {loadSnapshot, saveSnapshot, exportSnapshot} from "./civilization-snapshot.mjs";
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
  getNeuralAgents,applyNeuralOutputs,getNeuralStatus,markNeuralCycleFailed,neuralActors,
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

    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      const saved = await loadSnapshot(this.ctx.storage);
      if (saved) {
        if (!snapshotLooksUsable(saved.state)) throw new Error("Invalid saved civilization state");
        restoreState(saved.state);
        this.storageStats = saved.stats;
        this.lastWallClockMs = saved.lastWallClockMs;
        this.lastPersistMs = saved.savedAtMs;
      } else {
        freshState();
        this.lastWallClockMs = Date.now();
        this.storageStats = await saveSnapshot(
          this.ctx.storage,
          getRawState(),
          this.lastWallClockMs,
        );
        this.lastPersistMs = Date.now();
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

  async advanceTo(nowMs, reason = "request") {
    await this.ready;
    const elapsedRealSeconds = Math.max(0, (nowMs - this.lastWallClockMs) / 1000);
    if (elapsedRealSeconds < 0.75) return { elapsedRealSeconds, steps: 0 };

    const raw = getRawState();
    if (!snapshotLooksUsable(raw)) throw new Error("Invalid civilization state before tick");

    // A long outage resumes from the checkpoint. Compressing days into one
    // alarm would jump over daily events and age residents before they can act.
    const sampledSeconds = Math.min(elapsedRealSeconds, Math.max(MAX_RECOVERY_SECONDS, this.alarmIntervalMs() / 1000 * 2));
    const skippedRealSeconds = elapsedRealSeconds - sampledSeconds;
    const population = neuralActors().length;
    const decisionBudget = Math.max(4, Math.min(24, Math.floor(6000/Math.max(1,population))));
    const maxSteps = reason === "alarm" ? Math.min(this.idleMaxSteps(),decisionBudget) : decisionBudget;
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
    const now = Date.now();
    if (!force && now - this.lastPersistMs < ACTIVE_PERSIST_INTERVAL_MS) return this.storageStats;
    this.storageStats = await saveSnapshot(
      this.ctx.storage,
      getRawState(),
      this.lastWallClockMs,
    );
    this.lastPersistMs = now;
    return this.storageStats;
  }

  async alarm() {
    return this.withLock(async () => {
      await this.ready;
      this.nextAlarmAtMs=Date.now()+this.alarmIntervalMs();
      await this.ctx.storage.setAlarm(this.nextAlarmAtMs);
      try {
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

  async getNeuralInputs(){
    await this.ready;
    return this.withLock(async()=>({worldId:this.env.CIV_WORLD_ID||DEFAULT_WORLD_ID,agents:getNeuralAgents()}));
  }
  async applyNeuralBatch(batch){
    await this.ready;
    return this.withLock(async()=>{const status=applyNeuralOutputs(batch.outputs,batch);await this.persistIfDue(true);return status;});
  }
  async neuralCycleFailed(details){
    await this.ready;
    return this.withLock(async()=>{markNeuralCycleFailed(details);return getNeuralStatus();});
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
      const state=getRawState();
      return json({ok:snapshotLooksUsable(state),service:'fruit-fly-civilization-cloudflare',runtime:'cloudflare-durable-object',worldId:this.env.CIV_WORLD_ID||DEFAULT_WORLD_ID,simulationStatus:state?'SYNTHETIC_CIVILIZATION_LIVE':'STARTING',population:state?.flies?.filter(f=>f.alive).length||0,simulationAgeSeconds:Number(state?.simulationAgeSeconds||0),persistence:'DURABLE_OBJECT_SQLITE',alarmIntervalMs:this.alarmIntervalMs(),nextAlarmAtMs,sampledCatchup:advance,storage:this.storageStats,neural:getNeuralStatus()});
    }
    const payload=getState({observer:url.searchParams.get('view')==='observer',selectedId:url.searchParams.get('selected')});
    payload.runtime={platform:'cloudflare-durable-object',persistence:'sqlite-gzip-chunks',alarmIntervalMs:this.alarmIntervalMs(),nextAlarmAtMs,sampledCatchup:advance};
    return json(payload);
  }

  async fetch(request) {
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders()});
    const url=new URL(request.url);
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
