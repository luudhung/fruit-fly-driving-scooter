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
 ]},ticks=0,saves=0;
 let source=fs.readFileSync(new URL('../cloudflare/src/index.mjs',import.meta.url),'utf8');
 source=source.replace(/^export \{FlyWire[^\n]*\n/m,'').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\n/gm,'');
 source=source.slice(0,source.indexOf('\nexport default')).replace('export class CivilizationWorld','class CivilizationWorld');
 const savedBase=structuredClone(state),baseSavedAt=Date.now();
 const deps={...Delta,...Journal,MAP_VERSION:36,LOCAL_HOST_TTL_MS,localHostSnapshot,mergeLocalHostCheckpoint,localHostClaimStream,readLocalHostCheckpoint,DurableObject:class{},
 loadSnapshot:async()=>({state:structuredClone(savedBase),lastWallClockMs:Date.now(),savedAtMs:baseSavedAt,stats:{}}),
 saveSnapshot:async()=>{saves++;return{};},exportSnapshot:()=>'',freshState:()=>state,
 restoreState:s=>{state=s;},getRawState:()=>state,getState:()=>({}),snapshotLooksUsable:()=>true,setNeuralSyncEnabled:()=>{},
 countries:{requestConflict:command=>{if(!commands.some(c=>c.requestId===command.requestId))commands.push(command);return {accepted:true,requestId:command.requestId};}},getSimulationConfig:()=>({gameSecondsPerRealSecond:120}),neuralActors:()=>state.flies.filter(f=>f.alive),
 tick:async()=>{ticks++;},getNeuralAgents:()=>[],applyNeuralOutputs:()=>({}),markNeuralCycleFailed:()=>{},getNeuralStatus:()=>({})};
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
 return {world,claim,post,save,restart,metadata,commands,failNext:()=>{failTransaction=true;},get state(){return state;},get ticks(){return ticks;},get saves(){return saves;}};
}

test('an active browser lease pauses idle simulation and excludes a second writer',async()=>{
 const t=fixture();await t.world.ready;
 const first=await t.claim();assert.equal(first.granted,true);
 assert.equal(first.state.flies.length,1,'archived residents stay in durable storage');
 assert.equal((await t.claim()).granted,false);
 assert.equal((await t.world.localHostingStatus()).active,true);
 assert.deepEqual((await t.world.getNeuralInputs()).agents,[]);
 assert.equal((await t.world.applyNeuralBatch({outputs:[]})).localHost,true);
 t.world.lastWallClockMs=Date.now()-8000;
 await t.world.alarm();assert.equal(t.ticks,0);
 const heartbeat=await t.post('heartbeat',first.lease);assert.equal(heartbeat.status,200);
 assert.equal((await t.post('heartbeat',{...first.lease,token:'wrong'})).status,409);
});

test('checkpoint release preserves archive and identities, saves once, and fences late browser writes',async()=>{
 const t=fixture();await t.world.ready;
 const {lease,state}=await t.claim();state.simulationAgeSeconds+=120;state.flies[0].x=9;
 const checkpoint={...lease,sequence:1,state,release:true};
 const receipt=await t.save(checkpoint);assert.equal(receipt.status,200);
 assert.equal(t.state.simulationAgeSeconds,10120);
 assert.equal(t.state.flies[0].x,9);
 assert.equal(t.state.flies.find(f=>f.id==='D').brain.id,'ARCHIVED');
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
 assert.equal(t.state.flies.find(f=>f.id==='D').brain.id,'ARCHIVED');
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
