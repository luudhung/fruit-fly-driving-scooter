import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as Delta from '../worker/local-host-delta.mjs';
import * as Journal from '../cloudflare/src/local-host-journal.mjs';
import {LOCAL_HOST_TTL_MS,localHostSnapshot,mergeLocalHostCheckpoint,localHostClaimStream,localHostCheckpointStream,readLocalHostCheckpoint} from '../worker/local-host-state.mjs';

function fixture(){
 let commands=[];
 let state={worldId:'WORLD-A',mapVersion:36,simulationAgeSeconds:10000,timeScale:120,flies:[
  {id:'A',alive:true,x:0,z:0,health:100,brain:{id:'B'}},
  {id:'D',alive:false,x:2,z:3,health:0,brain:{id:'ARCHIVED'}},
 ]},ticks=0,saves=0,loads=[],mappedSaves=0,mappedGate=null,failMapped=false;
 state.flies[1].brain.memory={episodes:[{at:9000,text:'Archived resident lifetime memory'}]};
 state.history=[{type:'death',residentId:'D',at:9000}];
 let source=fs.readFileSync(new URL('../cloudflare/src/index.mjs',import.meta.url),'utf8');
 source=source.replace(/^export \{FlyWire[^\n]*\n/m,'').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\n/gm,'');
 source=source.slice(0,source.indexOf('\nexport default')).replace('export class CivilizationWorld','class CivilizationWorld');
 let savedBase=structuredClone(state),baseSavedAt=Date.now();
 const deps={...Delta,...Journal,MAP_VERSION:36,LOCAL_HOST_TTL_MS,localHostSnapshot,mergeLocalHostCheckpoint,localHostClaimStream,localHostCheckpointStream,readLocalHostCheckpoint,DurableObject:class{},
 loadSnapshotHeader:async()=>({state:structuredClone({...savedBase,flies:[]}),lastWallClockMs:Date.now(),savedAtMs:baseSavedAt,stats:{}}),
 loadSnapshot:async(_storage,{mapResident}={})=>{loads.push(mapResident);const snapshot=structuredClone(savedBase);if(mapResident)snapshot.flies=snapshot.flies.map(mapResident).filter(Boolean);return {state:snapshot,lastWallClockMs:Date.now(),savedAtMs:baseSavedAt,stats:{}};},
 saveSnapshot:async()=>{saves++;return{};},exportSnapshot:()=>Journal.localHostExportStream(savedBase,Delta.projectLocalDocument(savedBase),'WORLD-A'),
 saveSnapshotMapped:async(_storage,document)=>{mappedSaves++;if(mappedGate)await mappedGate;if(failMapped){failMapped=false;throw Error('mapped publication failed');}const merged=await new Response(Journal.localHostExportStream(savedBase,document,'WORLD-A')).json();savedBase=merged.state;baseSavedAt=Date.now();return{chunks:1};},
 exportSnapshotMapped:(_storage,worldId,document)=>Journal.localHostExportStream(savedBase,document,worldId),freshState:()=>state,
 restoreState:s=>{state=s;},getRawState:()=>state,getState:()=>({}),snapshotLooksUsable:()=>true,setNeuralSyncEnabled:()=>{},
 countries:{requestConflict:command=>{if(!commands.some(c=>c.requestId===command.requestId))commands.push(command);return {accepted:true,requestId:command.requestId};}},getSimulationConfig:()=>({gameSecondsPerRealSecond:120}),neuralActors:()=>state.flies.filter(f=>f.alive),
 tick:async({gameSeconds})=>{ticks++;state.simulationAgeSeconds+=gameSeconds;},getNeuralAgents:()=>[],applyNeuralOutputs:()=>({}),markNeuralCycleFailed:()=>{},getNeuralStatus:()=>({})};
 const Class=new Function(...Object.keys(deps),source+'\nreturn CivilizationWorld;')(...Object.values(deps));
 const metadata=new Map();let failTransaction=false;
 const baseStorage={get:async key=>structuredClone(metadata.get(key)),put:async(key,value)=>metadata.set(key,structuredClone(value)),delete:async key=>metadata.delete(key)};
 const storage={...baseStorage,transaction:async fn=>{const copy=new Map([...metadata].map(([k,v])=>[k,structuredClone(v)]));const tx={get:async k=>structuredClone(copy.get(k)),put:async(k,v)=>{if(failTransaction){failTransaction=false;throw Error('disk unavailable');}copy.set(k,structuredClone(v));},delete:async k=>copy.delete(k)};const result=await fn(tx);metadata.clear();for(const [k,v]of copy)metadata.set(k,v);return result;}};
 const ctx={storage:{...storage,getAlarm:async()=>Date.now()+5000,setAlarm:async()=>{}},blockConcurrencyWhile:fn=>fn(),waitUntil:()=>{}};
 const world=new Class(ctx,{NEURAL_ENABLED:'0'});
 const post=(path,body)=>world.fetch(new Request('https://city/api/civilization/local/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
 const claim=async()=>{
  const response=await post('claim',{clientId:'test',clientProtocol:3});
  const data=response.headers.get('content-encoding')==='gzip'?await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json():await response.json();
  if(data.granted){assert.equal(response.headers.get('x-city-host-token'),data.lease.token);assert.equal(Number(response.headers.get('x-city-host-epoch')),data.lease.epoch);}
  return data;
 };
 let baseline=null;
 const save=async body=>{
  const {state:incoming,...metadata}=body;
  if(!baseline)baseline=Delta.projectLocalDocument(localHostSnapshot(savedBase));
  const next=Delta.projectLocalDocument(incoming);
  const document={...metadata,baseSequence:Number(metadata.baseSequence??metadata.sequence-1),patch:Delta.diffLocalDocument(baseline,next)};
  const packed=await new Response(new Blob([JSON.stringify(document)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const response=await world.fetch(new Request('https://city/api/civilization/local/checkpoint',{method:'POST',headers:{'content-type':'application/x-city-delta+gzip'},body:packed}));
  if(response.ok&&!metadata.retry)baseline=structuredClone(next);
  return response;
 };
 const restart=version=>{const nextDeps={...deps,MAP_VERSION:version,restoreState:s=>{state=s;state.mapVersion=version;}};const Next=new Function(...Object.keys(nextDeps),source+'\nreturn CivilizationWorld;')(...Object.values(nextDeps));return new Next(ctx,{NEURAL_ENABLED:'0'});};
 return {world,claim,post,save,restart,metadata,commands,loads,get savedBase(){return savedBase;},failNext:()=>{failTransaction=true;},failNextMapped:()=>{failMapped=true;},holdMapped(){let release;mappedGate=new Promise(r=>{release=r;});return release;},get mappedSaves(){return mappedSaves;},get state(){return state;},get ticks(){return ticks;},get saves(){return saves;}};
}

const assertArchiveRetained=t=>{
 assert.equal(t.state.flies.some(f=>f.id==='D'),false,'historical brain models stay out of live engine/service maps');
 assert.equal(t.savedBase.flies.find(f=>f.id==='D').brain.id,'ARCHIVED');
 assert.deepEqual(t.savedBase.flies.find(f=>f.id==='D').brain.memory.episodes,[{at:9000,text:'Archived resident lifetime memory'}]);
 assert.deepEqual(t.savedBase.history,[{type:'death',residentId:'D',at:9000}]);
};

test('cold background startup always streams only living residents while retaining the full durable archive',async()=>{
 const t=fixture();await t.world.ready;
 assert.equal(t.loads.length,1);assert.equal(typeof t.loads[0],'function');
 assert.deepEqual(t.state.flies.map(f=>f.id),['A']);assertArchiveRetained(t);
});

const recentDeath=i=>({id:'RECENT-DEAD-'+i,alive:false,x:i,z:2,health:0,brain:{id:'RECENT-BRAIN-'+i,memory:{episodes:[{at:10000,text:'Final lifetime memory '+i}]}}});

test('thirty-two recent deaths compact in their own alarm work unit and prune only after durable publication',async()=>{
 const t=fixture();await t.world.ready;
 t.state.flies.push(...Array.from({length:31},(_,i)=>recentDeath(i)));
 assert.equal(await t.world.compactHistoryIfDue(),false);assert.equal(t.mappedSaves,0);
 t.state.flies.push(recentDeath(31));t.state.flies[0].x=52;
 await t.world.persistIfDue(true);assert.ok(t.metadata.has('local-save:meta'));
 const unblock=t.holdMapped(),reads=t.loads.length,beforeTicks=t.ticks;
 const alarm=t.world.alarm();
 for(let i=0;i<30&&!t.mappedSaves;i++)await new Promise(r=>setTimeout(r,1));
 assert.equal(t.mappedSaves,1);assert.ok(t.metadata.has('local-save:meta'),'the only durable recent deaths cannot be deleted before replacement publication');
 assert.equal(t.state.flies.filter(f=>!f.alive).length,32);assert.equal(t.savedBase.flies.some(f=>f.id==='RECENT-DEAD-0'),false);
 unblock();await alarm;
 assert.equal(t.ticks,beforeTicks,'archive gzip and simulation ticking occupy different alarm events');
 assert.equal(t.loads.length,reads,'compaction streams the durable base without hydrating its archive into the engine');
 assert.ok(t.metadata.has('local-save:meta'));assert.ok(t.world.localJournalMeta,'keep a living journal so the next cold start avoids the full archive');
 assert.deepEqual(t.state.flies.map(f=>f.id),['A']);assert.equal(t.state.flies[0].x,52);assertArchiveRetained(t);
 for(let i=0;i<32;i++){
  const dead=t.savedBase.flies.find(f=>f.id==='RECENT-DEAD-'+i);
  assert.equal(dead.alive,false);assert.deepEqual(dead.brain,recentDeath(i).brain);assert.ok(t.world.baseKnownIds.has(dead.id));
 }
 assert.deepEqual([...t.world.baseAliveIds],['A']);
 const cold=t.restart(36);await cold.ready;
 assert.deepEqual(t.state.flies.map(f=>f.id),['A']);assert.equal(t.state.flies[0].x,52);assertArchiveRetained(t);
 assert.equal(t.savedBase.flies.filter(f=>!f.alive).length,33);assert.equal(t.saves,0);assert.equal(t.loads.length,reads,'restart reads the living journal and base header only');assert.equal(await cold.compactHistoryIfDue(),false,'already archived deaths are not compacted again after restart');
});

test('failed archive publication retains the journal and all recent brain records for a safe retry',async()=>{
 const t=fixture();await t.world.ready;t.state.flies.push(...Array.from({length:32},(_,i)=>recentDeath(i)));
 await t.world.persistIfDue(true);const journal=structuredClone(t.metadata.get('local-save:meta'));
 t.failNextMapped();await assert.rejects(t.world.compactHistoryIfDue(),/mapped publication failed/);
 assert.deepEqual(t.metadata.get('local-save:meta'),journal);assert.equal(t.state.flies.filter(f=>!f.alive).length,32);
 assert.equal(t.savedBase.flies.some(f=>f.id==='RECENT-DEAD-0'),false);assert.equal(t.ticks,0);
 assert.equal(await t.world.compactHistoryIfDue(),true);assert.equal(t.savedBase.flies.filter(f=>!f.alive).length,33);
 assert.deepEqual(t.state.flies.map(f=>f.id),['A']);assertArchiveRetained(t);
});

test('a live browser owner prevents background history compaction even above its threshold',async()=>{
 const t=fixture();await t.world.ready;const {lease}=await t.claim();
 t.state.flies.push(...Array.from({length:32},(_,i)=>recentDeath(i)));
 assert.equal(await t.world.compactHistoryIfDue(),false);await t.world.alarm();
 assert.equal(t.mappedSaves,0);assert.equal(t.ticks,0);assert.equal(t.world.localHost.token,lease.token);
 assert.equal(t.state.flies.filter(f=>!f.alive).length,32);assert.ok(t.metadata.has('local-save:meta'));
});

test('an active browser lease pauses idle simulation and excludes a second writer',async()=>{
 const t=fixture();await t.world.ready;
 const first=await t.claim();assert.equal(first.granted,true);
 assert.equal(first.state.flies.length,1,'archived residents stay in durable storage');
 assert.equal(t.state.flies.some(f=>f.id==='D'),false,'historical heavy models are evicted from engine/service memory while hosting');
 assert.equal((await t.claim()).granted,false);
 assert.equal((await t.world.localHostingStatus()).active,true);
 assert.deepEqual((await t.world.getNeuralInputs()).agents,[]);
 assert.equal((await t.world.applyNeuralBatch({outputs:[]})).localHost,true);
 t.world.lastWallClockMs=Date.now()-8000;
 await t.world.alarm();assert.equal(t.ticks,0);
 const heartbeat=await t.post('heartbeat',first.lease);assert.equal(heartbeat.status,200);
 assert.equal((await t.post('heartbeat',{...first.lease,token:'wrong'})).status,409);
});

test('checkpoint release journals progress, preserves archived identities and fences late browser writes',async()=>{
 const t=fixture();await t.world.ready;
 const {lease,state}=await t.claim();state.simulationAgeSeconds+=120;state.flies[0].x=9;
 const checkpoint={...lease,sequence:1,state,release:true};
 const receipt=await t.save(checkpoint);assert.equal(receipt.status,200);
 assert.equal(t.world.localHost,null);
 await t.world.materializeLocalDocument();
 assert.equal(t.state.simulationAgeSeconds,10120);
 assert.equal(t.state.flies[0].x,9);
 assertArchiveRetained(t);
 assert.equal(t.saves,0,'local saves journal deltas instead of recompressing the archive');
 assert.equal((await t.save(checkpoint)).status,409);
 t.world.lastWallClockMs=Date.now()-4000;await t.world.alarm();assert.ok(t.ticks>0);
});

test('retries are idempotent and expired owners cannot overwrite the next owner',async()=>{
 const t=fixture();await t.world.ready;const first=await t.claim();
 const request={...first.lease,sequence:1,state:first.state};
 assert.equal((await t.save(request)).status,200);
 const duplicate=await (await t.save(request)).json();assert.equal(duplicate.duplicate,true);
 t.world.localHost.expiresAt=Date.now()-1;
 const next=await t.claim();assert.equal(next.granted,true);
 assert.notEqual(next.lease.token,first.lease.token);
 assert.equal((await t.save({...request,sequence:2})).status,409);
 const corrupt=structuredClone(next.state);corrupt.flies[0].brain.id='replacement';
 assert.equal((await t.save({...next.lease,sequence:1,state:corrupt})).status,422);
 const fast=structuredClone(next.state);fast.simulationAgeSeconds+=1e8;
 assert.equal((await t.save({...next.lease,sequence:1,state:fast})).status,422);
});


test('heartbeats persist ownership and a closing tab shortens the fallback deadline',async()=>{
 const t=fixture();await t.world.ready;const {lease}=await t.claim();
 assert.equal(t.metadata.get('localHostLease').token,lease.token);
 await t.post('heartbeat',lease);
 assert.ok(t.metadata.get('localHostLease').expiresAt>Date.now()+100000);
 assert.equal((await t.post('leave',lease)).status,200);
 const leavingAt=t.metadata.get('localHostLease').expiresAt;
 assert.ok(leavingAt<=Date.now()+15000);
 await t.post('heartbeat',lease);
 assert.equal(t.metadata.get('localHostLease').expiresAt,leavingAt,'a stopped worker cannot renew a closing lease');
 t.world.localHost.expiresAt=Date.now()-1;
 t.world.lastWallClockMs=Date.now()-4000;
 await t.world.alarm();
 assert.ok(t.ticks>0);
 assert.equal(t.metadata.has('localHostLease'),false);
});

test('the same closing tab resumes immediately with clock catch-up, while other tabs cannot replace the owner',async()=>{
 const t=fixture();await t.world.ready;const first=await t.claim();
 first.state.simulationAgeSeconds+=120;first.state.flies[0].money=37;
 assert.equal((await t.save({...first.lease,sequence:1,state:first.state})).status,200);
 const resume={token:first.lease.token,epoch:first.lease.epoch};
 const beforeLeave=await (await t.post('claim',{clientProtocol:3})).json();assert.equal(beforeLeave.granted,false,'another device cannot take over the active owner');
 await t.post('leave',resume);
 assert.equal((await (await t.post('claim',{clientProtocol:3,resume:{...resume,token:'wrong'}})).json()).granted,false);
 assert.equal((await (await t.post('claim',{clientProtocol:3,resume:{...resume,epoch:resume.epoch+1}})).json()).granted,false);
 t.world.lastWallClockMs=Date.now()-5000;
 const response=await t.post('claim',{clientProtocol:3,resume});
 const next=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
 assert.equal(next.granted,true);assert.notEqual(next.lease.token,first.lease.token);
 assert.ok(next.state.simulationAgeSeconds>=first.state.simulationAgeSeconds+600,'five real seconds are advanced through the actual engine before the new base is agreed');
 assert.equal(next.state.flies.find(f=>f.id==='A').money,37);
 assert.equal((await t.post('heartbeat',resume)).status,409,'late old-tab writes are fenced');
 assert.equal(t.metadata.get('localHostLease').token,next.lease.token);
});

test('a hard reload with the same private credential resumes even when its leave beacon was lost',async()=>{
 const t=fixture();await t.world.ready;const {lease,state}=await t.claim();state.simulationAgeSeconds+=120;state.flies[0].money=41;
 assert.equal((await t.save({...lease,sequence:1,state})).status,200);
 assert.equal((await (await t.post('claim',{clientProtocol:3,resume:{token:lease.token,epoch:lease.epoch+1}})).json()).granted,false);
 const response=await t.post('claim',{clientProtocol:3,resume:{token:lease.token,epoch:lease.epoch}});
 const next=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
 assert.equal(next.granted,true);assert.ok(next.lease.epoch>lease.epoch);assert.equal(next.state.flies[0].money,41);
 assert.equal((await t.post('heartbeat',{token:lease.token,epoch:lease.epoch})).status,409);
 assert.equal(t.metadata.get('localHostLease').token,next.lease.token);
});

test('claiming an expired session between alarms advances from its latest durable save rather than rewinding the clock',async()=>{
 const t=fixture();await t.world.ready;const {lease,state}=await t.claim();state.simulationAgeSeconds+=120;
 assert.equal((await t.save({...lease,sequence:1,state})).status,200);
 t.world.localHost.expiresAt=Date.now()-1;t.world.lastWallClockMs=Date.now()-4000;
 const next=await t.claim();assert.equal(next.granted,true);
 assert.ok(next.state.simulationAgeSeconds>=state.simulationAgeSeconds+480);assert.equal(t.ticks,1);
});

test('checkpoint clock tracks the captured simulation step, including upload latency, rather than resetting to receipt time',async()=>{
 const t=fixture();await t.world.ready;const {lease,state}=await t.claim();
 const anchor=Date.now()-6000;
 t.world.localHost.startedAt=anchor;
 t.world.localJournalMeta.lastWallClockMs=anchor;
 const stored=t.metadata.get('local-save:meta');stored.lastWallClockMs=anchor;
 state.simulationAgeSeconds+=120;
 assert.equal((await t.save({...lease,sequence:1,state,stateAtMs:Date.now()+1e9})).status,200,'client supplied timing cannot override the server lease clock');
 assert.equal(t.metadata.get('local-save:meta').lastWallClockMs,anchor+1000);
 assert.ok(t.metadata.get('local-save:meta').savedAtMs>=anchor+6000);
});

test('invalid bodies and checkpoint sequences do not evict a valid host',async()=>{
 const t=fixture();await t.world.ready;const {lease,state}=await t.claim();
 const broken=await t.world.fetch(new Request('https://city/api/civilization/local/checkpoint',{method:'POST',headers:{'content-type':'application/x-city-delta+gzip'},body:'not gzip'}));
 assert.equal(broken.status,400);
 assert.equal((await t.save({...lease,state,sequence:'bad'})).status,400);
 assert.equal(t.world.localHost.token,lease.token);
});


test('a durable lease survives instance rehydration without resuming background ticks',async()=>{
 const t=fixture();await t.world.ready;const {lease}=await t.claim();
 const fresh=new t.world.constructor(t.world.ctx,t.world.env);await fresh.ready;
 assert.equal(fresh.localHost.token,lease.token);
 fresh.lastWallClockMs=Date.now()-4000;await fresh.alarm();
 assert.equal(t.ticks,0);
 const heartbeat=await fresh.fetch(new Request('https://city/api/civilization/local/heartbeat',{method:'POST',body:JSON.stringify(lease)}));
 assert.equal(heartbeat.status,200);
});

test('gameplay commands accepted during hosting are delivered to the browser and retained across checkpoints',async()=>{
 const t=fixture();await t.world.ready;const {lease,state}=await t.claim();
 const command={requestId:'LOCAL-COMMAND-1',fromCountryId:'hansdrex',toCountryId:'north-city',quick:true};
 // Model the accepted command inbox; the real HTTP control has its own bounded,
 // origin-checked tests. A fresh checkpoint must not erase this accepted action.
 t.world.localHost.commands=[command];
 const heartbeat=await(await t.post('heartbeat',lease)).json();
 assert.deepEqual(heartbeat.commands,[command]);
 state.simulationAgeSeconds+=120;
 assert.equal((await t.save({...lease,sequence:1,state})).status,200);
 assert.deepEqual(t.commands,[],'queued actions are applied by the owning client, not injected into its agreed delta base');
 assert.equal(t.metadata.get('localHostLease').commands[0].requestId,command.requestId);
});


test('the neural coordinator does no background brain work while a browser owns the city',async()=>{
 let source=fs.readFileSync(new URL('../cloudflare/src/neural/objects.mjs',import.meta.url),'utf8');
 source=source.slice(source.indexOf('export class FlyWireNeuralCoordinator')).replace('export class','class');
 const Class=new Function('DurableObject',source+';return FlyWireNeuralCoordinator;')(class{constructor(ctx,env){this.ctx=ctx;this.env=env;}});
 let inputs=0,shards=0,nextAlarm=0;
 const cycle={id:'pending',agents:[{brain_id:'B1'}],cursor:0,completed:0,steps:16};
 const world={localHostingStatus:async()=>({active:true}),getNeuralInputs:async()=>{inputs++;return{agents:[]};}};
 const ctx={storage:{get:async()=>cycle,setAlarm:async at=>{nextAlarm=at;}}};
 const coordinator=new Class(ctx,{CIVILIZATION:{getByName:()=>world},NEURAL_BRAINS:{getByName:()=>{shards++;throw Error('must not run');}}});
 await coordinator.alarm();
 assert.equal(inputs,0);assert.equal(shards,0);
 assert.equal(cycle.cursor,0,'the paused neural checkpoint is preserved');
 assert.ok(nextAlarm>Date.now()+50000);
});


test('older viewers remain observers and cannot trigger a buffered whole-world upload',async()=>{
 const t=fixture();await t.world.ready;
 const old=await(await t.post('claim',{clientId:'old-viewer'})).json();
 assert.equal(old.granted,false);assert.equal(old.updateRequired,true);assert.equal(t.world.localHost,null);
 const first=await t.claim();
 const response=await t.world.fetch(new Request('https://city/api/civilization/local/checkpoint',{method:'POST',body:'legacy-body-is-not-read'}));
 assert.equal(response.status,409);assert.equal(t.world.localHost.token,first.lease.token);
});


test('an acknowledged browser save is replayed before a later map migration and the old owner is fenced',async()=>{
 const t=fixture();await t.world.ready;const {lease,state}=await t.claim();state.simulationAgeSeconds+=120;state.flies[0].x=17;
 assert.equal((await t.save({...lease,sequence:1,state})).status,200);
 const upgraded=t.restart(37);await upgraded.ready;
 assert.equal(t.state.simulationAgeSeconds,10120);assert.equal(t.state.mapVersion,37);assert.equal(t.state.flies[0].x,17);
 assertArchiveRetained(t);
 assert.equal(upgraded.localHost.leaving,true);assert.equal(upgraded.localDocument,null);
});

test('a lost receipt can retry the identical delta without duplicating finance or losing the next five-second update',async()=>{
 const t=fixture();await t.world.ready;const {lease,state}=await t.claim();state.simulationAgeSeconds+=600;state.flies[0].money=42;
 const request={...lease,sequence:1,state,retry:true};assert.equal((await t.save(request)).status,200);
 const count=t.metadata.size;const response=await(await t.save(request)).json();assert.equal(response.duplicate,true);assert.equal(t.metadata.size,count);
 // The real client advances its baseline only after this exact retry is acknowledged.
 const cold=t.restart(36);await cold.ready;assert.equal(cold.localDocument.actors.A.money,42);assert.equal(cold.localDocument.world.simulationAgeSeconds,10600);
});


test('a failed initial durable claim cannot leave a phantom local owner or mutable delta base',async()=>{
 const t=fixture();await t.world.ready;t.failNext();
 await assert.rejects(t.claim(),/disk unavailable/);
 assert.equal(t.world.localHost,null);assert.equal(t.world.localDocument,null);assert.equal(t.world.localObserver,null);
 assert.equal(t.metadata.get('localHostLease'),undefined);
 assert.equal((await t.claim()).granted,true);
});


test('recent deaths before claim survive deferred engine adoption without reviving the old base resident',async()=>{
 const t=fixture();await t.world.ready;
 t.state.flies[0].alive=false;t.state.flies[0].health=0;
 t.state.flies.push({id:'C',alive:true,x:2,z:3,health:100,brain:{id:'BC'}});
 const {lease,state}=await t.claim();assert.deepEqual(state.flies.map(f=>f.id),['C']);
 state.simulationAgeSeconds+=120;assert.equal((await t.save({...lease,sequence:1,state,release:true})).status,200);
 await t.world.materializeLocalDocument();
 assert.equal(t.state.flies.find(f=>f.id==='A').alive,false);assert.equal(t.state.flies.find(f=>f.id==='A').health,0);
 assertArchiveRetained(t);assert.equal(t.state.flies.find(f=>f.id==='C').brain.id,'BC');
 t.world.lastPersistMs=0;await t.world.persistIfDue(true);
 const cold=t.restart(36);await cold.ready;
 assert.equal(t.state.flies.find(f=>f.id==='A').alive,false,'background journal replay cannot revive a recent death from the old full base');
 assert.equal(t.state.flies.find(f=>f.id==='C').brain.id,'BC');assertArchiveRetained(t);assert.equal(t.saves,0);
});

test('full exports retain archived identities, models and history while overlaying the latest living checkpoint',async()=>{
 const t=fixture();await t.world.ready;const {lease,state}=await t.claim();state.simulationAgeSeconds+=120;state.flies[0].x=46;
 assert.equal((await t.save({...lease,sequence:1,state,release:true})).status,200);
 const reads=t.loads.length;
 const response=await t.world.fetch(new Request('https://city/api/civilization/export'));
 assert.equal(response.status,200);const full=(await response.json()).state;
 assert.equal(full.flies.find(f=>f.id==='A').x,46);assert.equal(full.simulationAgeSeconds,10120);
 assert.equal(full.flies.find(f=>f.id==='D').brain.id,'ARCHIVED');
 assert.deepEqual(full.flies.find(f=>f.id==='D').brain.memory,t.savedBase.flies.find(f=>f.id==='D').brain.memory);
 assert.deepEqual(full.history,t.savedBase.history);assert.equal(t.loads.length,reads);assert.equal(t.saves,0);assertArchiveRetained(t);
});


test('an expired host adopts living progress before neural persistence without loading or recompressing archived brains',async()=>{
 const t=fixture();await t.world.ready;const {lease,state}=await t.claim();state.simulationAgeSeconds+=120;state.flies[0].x=24;
 assert.equal((await t.save({...lease,sequence:1,state})).status,200);
 t.world.localHost.expiresAt=Date.now()-1;t.world.lastPersistMs=0;
 const reads=t.loads.length;await t.world.applyNeuralBatch({outputs:[]});
 assert.equal(t.state.flies.find(f=>f.id==='A').x,24);assertArchiveRetained(t);
 assert.equal(t.loads.length,reads,'neural RPC must not reload the dead archive');assert.equal(t.saves,0,'background durability uses a living overlay instead of full archive gzip');
 assert.ok(t.metadata.get('local-save:meta'));assert.equal(t.metadata.has('localHostLease'),false);
 const replay=await Journal.loadLocalHostJournal(t.world.ctx.storage,t.savedBase,0);
 assert.equal(replay.document.actors.A.x,24);assert.equal(replay.state.flies.find(f=>f.id==='D').brain.id,'ARCHIVED');
});


test('release acknowledges before engine adoption and the next alarm resumes without loading the dead archive',async()=>{
 const t=fixture();await t.world.ready;const {lease,state}=await t.claim();state.simulationAgeSeconds+=120;state.flies[0].x=31;
 let releaseHydration,started=false;const gate=new Promise(r=>{releaseHydration=r;});
 const hydrate=t.world.materializeLocalDocument.bind(t.world);
 t.world.materializeLocalDocument=async()=>{started=true;await gate;return hydrate();};
 const response=await Promise.race([t.save({...lease,sequence:1,state,release:true}),new Promise(r=>setTimeout(()=>r(null),100))]);
 assert.ok(response,'a release response waited for the large archive');assert.equal(response.status,200);assert.equal(started,false);
 assert.equal(t.metadata.get('localHostLease'),undefined);assert.equal(t.world.localDocument.world.simulationAgeSeconds,10120);
 const alarm=t.world.alarm();for(let i=0;i<30&&!started;i++)await new Promise(r=>setTimeout(r,1));assert.equal(started,true);
 const reads=t.loads.length;releaseHydration();await alarm;
 assert.equal(t.state.flies.find(f=>f.id==='A').x,31);assertArchiveRetained(t);assert.equal(t.loads.length,reads);assert.equal(t.saves,0);
});

test('queued commands survive a durable release and a cold restart before deferred engine adoption',async()=>{
 const t=fixture();await t.world.ready;const {lease,state}=await t.claim();
 const command={requestId:'RELEASE-COMMAND-1',fromCountryId:'hansdrex',toCountryId:'north-city',quick:true};
 t.world.localHost.commands=[command];state.simulationAgeSeconds+=120;
 assert.equal((await t.save({...lease,sequence:1,state,release:true})).status,200);
 assert.deepEqual(t.commands,[],'release must acknowledge before adopting the engine document');
 assert.deepEqual(t.metadata.get('local-save:meta').pendingCommands,[command]);
 const cold=t.restart(36);await cold.ready;await cold.materializeLocalDocument();
 assert.deepEqual(t.commands,[command]);assertArchiveRetained(t);
});


test('a live export freezes only current identities without claiming ownership, loading archives or writing a checkpoint',async()=>{
 const t=fixture();await t.world.ready;const before=t.saves,reads=t.loads.length,ticks=t.ticks;
 const response=await t.world.fetch(new Request('https://city/api/civilization/export?view=live'));
 const body=await response.json();assert.equal(body.state.flies.length,1);assert.equal(body.state.flies[0].id,'A');assert.equal(t.saves,before);assert.equal(t.loads.length,reads);assert.equal(t.ticks,ticks);assert.equal(t.world.localHost,null);assertArchiveRetained(t);
});

test('automatic death cleanup checkpoints a counted death and ancestor name without resurrecting the omitted private actor',()=>{
 const current={worldId:'W',mapVersion:36,simulationAgeSeconds:100,timeScale:120,deaths:0,flies:[{id:'A',alive:true,x:0,z:0,health:90,brain:{id:'B'}}]},incoming={...current,historyCleanupVersion:1,simulationAgeSeconds:110,deaths:1,ancestors:{A:{name:'Ancestor',parents:[]}},flies:[{id:'C',alive:true,x:1,z:2,health:90,brain:{id:'C-BRAIN'}}]},lease={baseAge:100,startedAt:0};
 const merged=mergeLocalHostCheckpoint(current,incoming,lease,1000);assert.deepEqual(merged.flies.map(f=>f.id),['C']);assert.equal(merged.ancestors.A.name,'Ancestor');
 assert.throws(()=>mergeLocalHostCheckpoint(current,{...incoming,deaths:0},lease,1000),/missing living/);assert.throws(()=>mergeLocalHostCheckpoint(current,{...incoming,ancestors:{}},lease,1000),/missing living/);
});
