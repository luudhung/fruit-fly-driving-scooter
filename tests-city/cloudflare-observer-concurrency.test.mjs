import * as Journal from '../cloudflare/src/local-host-journal.mjs';
import * as Delta from '../worker/local-host-delta.mjs';
import {localHostSnapshot} from '../worker/local-host-state.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
// Evaluate the real adapter with a minimal Cloudflare/engine boundary so a
// deliberately blocked persistence operation can be controlled deterministically.
function fixture({recentCheckpoint=false,scheduler,onTick=()=>{}}={}){
 let source=fs.readFileSync(new URL('../cloudflare/src/index.mjs',import.meta.url),'utf8');
 source=source.replace(/^export \{FlyWire[^\n]*\n/m,'').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\n/gm,'');
 source=source.slice(0,source.indexOf('\nexport default')).replace('export class CivilizationWorld','class CivilizationWorld');
 let release,saveStarted=false,saveCalls=0,ticks=0,reads=0,alarmReads=0,neuralUpdates=0,fullSaves=0,loads=0;
 const waiting=new Promise(resolve=>{release=resolve;});let state={worldId:'OBSERVER-WORLD',mapVersion:36,simulationAgeSeconds:10,timeScale:120,flies:[{id:'A',alive:true,brain:{id:'B'}},{id:'D',alive:false,brain:{id:'ARCHIVED'}}]};
 const deps={...Journal,...Delta,localHostSnapshot,MAP_VERSION:36,scheduler,DurableObject:class{},loadSnapshot:async(_storage,{mapResident}={})=>{loads++;assert.equal(typeof mapResident,'function');return{state:{...state,flies:state.flies.map(mapResident).filter(Boolean)},lastWallClockMs:Date.now()-5000,savedAtMs:recentCheckpoint?Date.now():0,stats:{chunks:1}};},saveSnapshot:async()=>{fullSaves++;throw Error('background must not recompress the archive');},saveLocalHostBase:async(...args)=>{saveStarted=true;saveCalls++;assert.equal(args[2],null,'background save cannot retain a browser lease');await waiting;return Journal.saveLocalHostBase(...args);},exportSnapshot:async()=>'',freshState:()=>state,restoreState:next=>{state=next;},getRawState:()=>state,getState:options=>{reads++;return{population:1,simulationAgeSeconds:state.simulationAgeSeconds,flies:state.flies,selected:options.selectedId,compactObserver:options.compactObserver};},tick:({gameSeconds})=>{ticks++;state.simulationAgeSeconds+=gameSeconds;onTick(ticks);},mortalityReport:()=>({}),snapshotLooksUsable:()=>true,setNeuralSyncEnabled:()=>{},getSimulationConfig:()=>({gameSecondsPerRealSecond:120}),getNeuralAgents:()=>[],applyNeuralOutputs:outputs=>{neuralUpdates++;return{applied:outputs.length};},getNeuralStatus:()=>({}),markNeuralCycleFailed:()=>{},neuralActors:()=>state.flies.filter(f=>f.alive)};
 const Class=new Function(...Object.keys(deps),source+'\nreturn CivilizationWorld;')(...Object.values(deps));
 const records=new Map();let nextAlarm=Date.now()+5000;const storage={get:async key=>records.get(key),put:async(key,value)=>records.set(key,value),delete:async key=>records.delete(key),getAlarm:async()=>{alarmReads++;return nextAlarm;},setAlarm:async at=>{nextAlarm=at;}};storage.transaction=async fn=>fn(storage);
 const ctx={storage,blockConcurrencyWhile:fn=>fn(),waitUntil:()=>{}};const world=new Class(ctx,{NEURAL_ENABLED:'0'});
 return{world,get state(){return state;},release,get loads(){return loads;},get fullSaves(){return fullSaves;},get saved(){return saveCalls;},get saving(){return saveStarted;},get ticks(){return ticks;},get reads(){return reads;},get alarmReads(){return alarmReads;},get neuralUpdates(){return neuralUpdates;}};
}
async function waitUntil(predicate){for(let i=0;i<100&&!predicate();i++)await new Promise(resolve=>setTimeout(resolve,1));assert.ok(predicate(),'operation did not reach the expected boundary');}
test('health and observer reads finish while an alarm checkpoint is blocked, without advancing simulation or saving again',async()=>{
 const t=fixture();await t.world.ready;const alarm=t.world.alarm();
 await waitUntil(()=>t.saving);
 const ticks=t.ticks,alarmReads=t.alarmReads;
 try{
  const response=await Promise.race([t.world.fetch(new Request('https://test/api/civilization/state?view=observer&selected=A')),new Promise(resolve=>setTimeout(()=>resolve(null),100))]);
  assert.ok(response,'observer waited for the persistence queue');assert.equal(response.status,200);const data=await response.json();assert.equal(data.selected,'A');assert.equal(data.simulationAgeSeconds,t.state.simulationAgeSeconds);
  const health=await t.world.fetch(new Request('https://test/health'));assert.equal((await health.json()).population,1);
  const brief=await (await t.world.fetch(new Request('https://test/health?view=brief'))).json();
  assert.equal(brief.ok,true);assert.equal(brief.simulationAgeSeconds,t.state.simulationAgeSeconds);assert.equal(brief.neural,undefined);
  const compact=await (await t.world.fetch(new Request('https://test/api/civilization/state?view=observer&transport=compact'))).json();
  assert.equal(compact.compactObserver,true);

  const neural=await t.world.fetch(new Request('https://test/api/civilization/neural'));assert.equal((await neural.json()).brains.length,1);
  assert.equal(t.saved,1);assert.equal(t.ticks,ticks);assert.equal(t.alarmReads,alarmReads);
 }finally{t.release();await alarm;}
});
test('neural progress and completion use the ordinary city checkpoint cadence',async()=>{
 const t=fixture({recentCheckpoint:true});await t.world.ready;
 for(const complete of [false,true]){
  const result=await t.world.applyNeuralBatch({outputs:[{id:'A'}],complete});assert.equal(result.applied,1);
 }
 assert.equal(t.neuralUpdates,2);assert.equal(t.saved,0);assert.equal(t.ticks,0);
 // A due neural progress update still checkpoints the city rather than losing
 // the existing durability cadence altogether.
 t.world.lastPersistMs=0;const update=t.world.applyNeuralBatch({outputs:[],complete:false});
 try{await waitUntil(()=>t.saving);assert.equal(t.saved,1);}finally{t.release();await update;}
});
for(const mode of ['scheduler','timer fallback'])test(`background alarm completes one atomic tick before serving observers with ${mode}`,async()=>{
 let observe,observedTicks,observedAge,observationError;const observed=new Promise(resolve=>{observe=resolve;});let waits=0;
 const scheduler=mode==='scheduler'?{wait:delay=>{assert.equal(delay,0);waits++;return new Promise(resolve=>setTimeout(resolve,delay));}}:undefined;
 const t=fixture({recentCheckpoint:true,scheduler,onTick:count=>{if(count===1)setTimeout(async()=>{
  try{const response=await t.world.fetch(new Request('https://test/api/civilization/state?view=observer'));const data=await response.json();observedTicks=t.ticks;observedAge=data.simulationAgeSeconds;}catch(error){observationError=error;}finally{observe();}
 },0);}});await t.world.ready;
 const before=t.state.simulationAgeSeconds;const advance=t.world.advanceTo(t.world.lastWallClockMs+5000,'alarm');
 await observed;if(observationError)throw observationError;
 assert.equal(observedTicks,1,'observer could only run after the whole alarm');assert.equal(observedAge,before+600,'observer saw an incomplete tick');
 const result=await advance;assert.equal(t.ticks,1);assert.equal(result.steps,1);assert.equal(result.advancedGameSeconds,600);assert.equal(t.state.simulationAgeSeconds,before+600);assert.equal(t.saved,0);
 assert.equal(waits,0);assert.equal(t.loads,1);assert.equal(t.fullSaves,0);assert.deepEqual(t.state.flies.map(f=>f.id),['A']);
});
test('preflight never waits for an active simulation writer',async()=>{
 const t=fixture();await t.world.ready;let unlock;const block=new Promise(resolve=>{unlock=resolve;});const write=t.world.withLock(()=>block);
 try{const response=await t.world.fetch(new Request('https://test/api/civilization/state',{method:'OPTIONS'}));assert.equal(response.status,204);}finally{unlock();await write;}
});

test('the next background alarm is scheduled after its work, including archive-only and failed batches',async()=>{
 for(const mode of ['normal','archive','failed']){
  const t=fixture({recentCheckpoint:true});await t.world.ready;const order=[];
  t.world.ctx.storage.setAlarm=async()=>{order.push('scheduled');};
  t.world.compactHistoryIfDue=async()=>{order.push('archive');return mode==='archive';};
  t.world.advanceTo=async()=>{order.push('simulation');if(mode==='failed')throw Error('isolated recoverable batch error');};
  t.world.persistIfDue=async()=>{order.push('saved');};
  await t.world.alarm();
  assert.deepEqual(order,mode==='archive'?['archive','scheduled']:mode==='failed'?['archive','simulation','scheduled']:['archive','simulation','saved','scheduled']);
 }
});
