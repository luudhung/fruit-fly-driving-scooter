import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LOCAL_HOST_TTL_MS,localHostSnapshot,mergeLocalHostCheckpoint} from '../worker/local-host-state.mjs';

function fixture(){
 let commands=[];
 let state={worldId:'WORLD-A',mapVersion:36,simulationAgeSeconds:10000,timeScale:120,flies:[
  {id:'A',alive:true,x:0,z:0,health:100,brain:{id:'B'}},
  {id:'D',alive:false,x:2,z:3,health:0,brain:{id:'ARCHIVED'}},
 ]},ticks=0,saves=0;
 let source=fs.readFileSync(new URL('../cloudflare/src/index.mjs',import.meta.url),'utf8');
 source=source.replace(/^export \{FlyWire[^\n]*\n/m,'').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\n/gm,'');
 source=source.slice(0,source.indexOf('\nexport default')).replace('export class CivilizationWorld','class CivilizationWorld');
 const deps={LOCAL_HOST_TTL_MS,localHostSnapshot,mergeLocalHostCheckpoint,DurableObject:class{},
 loadSnapshot:async()=>({state,lastWallClockMs:Date.now(),savedAtMs:Date.now(),stats:{}}),
 saveSnapshot:async()=>{saves++;return{};},exportSnapshot:()=>'',freshState:()=>state,
 restoreState:s=>{state=s;},getRawState:()=>state,getState:()=>({}),snapshotLooksUsable:()=>true,setNeuralSyncEnabled:()=>{},
 countries:{requestConflict:command=>{if(!commands.some(c=>c.requestId===command.requestId))commands.push(command);return {accepted:true,requestId:command.requestId};}},getSimulationConfig:()=>({gameSecondsPerRealSecond:120}),neuralActors:()=>state.flies.filter(f=>f.alive),
 tick:async()=>{ticks++;},getNeuralAgents:()=>[],applyNeuralOutputs:()=>({}),markNeuralCycleFailed:()=>{},getNeuralStatus:()=>({})};
 const Class=new Function(...Object.keys(deps),source+'\nreturn CivilizationWorld;')(...Object.values(deps));
 const metadata=new Map();
 const ctx={storage:{get:async key=>metadata.get(key),put:async(key,value)=>metadata.set(key,structuredClone(value)),delete:async key=>metadata.delete(key),getAlarm:async()=>Date.now()+5000,setAlarm:async()=>{}},blockConcurrencyWhile:fn=>fn(),waitUntil:()=>{}};
 const world=new Class(ctx,{NEURAL_ENABLED:'0'});
 const post=(path,body)=>world.fetch(new Request('https://city/api/civilization/local/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
 const claim=async()=>{
  const response=await post('claim',{clientId:'test'});
  const data=response.headers.get('content-encoding')==='gzip'?await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json():await response.json();
  if(data.granted){assert.equal(response.headers.get('x-city-host-token'),data.lease.token);assert.equal(Number(response.headers.get('x-city-host-epoch')),data.lease.epoch);}
  return data;
 };
 const save=async body=>{
  const packed=await new Response(new Blob([JSON.stringify(body)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return world.fetch(new Request('https://city/api/civilization/local/checkpoint',{method:'POST',body:packed}));
 };
 return {world,claim,post,save,metadata,commands,get state(){return state;},get ticks(){return ticks;},get saves(){return saves;}};
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
 assert.equal(t.saves,1);
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
 assert.equal((await t.save({...next.lease,sequence:2,state:fast})).status,422);
});


test('heartbeats persist ownership and a closing tab shortens the fallback deadline',async()=>{
 const t=fixture();await t.world.ready;const {lease}=await t.claim();
 assert.equal(t.metadata.get('localHostLease').token,lease.token);
 await t.post('heartbeat',lease);
 assert.ok(t.metadata.get('localHostLease').expiresAt>Date.now()+100000);
 assert.equal((await t.post('leave',lease)).status,200);
 assert.ok(t.metadata.get('localHostLease').expiresAt<=Date.now()+15000);
 t.world.localHost.expiresAt=Date.now()-1;
 t.world.lastWallClockMs=Date.now()-4000;
 await t.world.alarm();
 assert.ok(t.ticks>0);
 assert.equal(t.metadata.has('localHostLease'),false);
});

test('invalid bodies and checkpoint sequences do not evict a valid host',async()=>{
 const t=fixture();await t.world.ready;const {lease,state}=await t.claim();
 const broken=await t.world.fetch(new Request('https://city/api/civilization/local/checkpoint',{method:'POST',body:'not gzip'}));
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
 assert.deepEqual(t.commands,[command]);
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
