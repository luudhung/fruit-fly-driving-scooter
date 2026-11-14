import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
// Evaluate the real adapter with a minimal Cloudflare/engine boundary so a
// deliberately blocked persistence operation can be controlled deterministically.
function fixture({recentCheckpoint=false,scheduler,onTick=()=>{}}={}){
 let source=fs.readFileSync(new URL('../cloudflare/src/index.mjs',import.meta.url),'utf8');
 source=source.replace(/^export \{FlyWire[^\n]*\n/m,'').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\n/gm,'');
 source=source.slice(0,source.indexOf('\nexport default')).replace('export class CivilizationWorld','class CivilizationWorld');
 let release,saveStarted=false,saveCalls=0,ticks=0,reads=0,alarmReads=0,neuralUpdates=0;
 const waiting=new Promise(resolve=>{release=resolve;}),state={simulationAgeSeconds:10,timeScale:120,flies:[{id:'A',alive:true,brain:{id:'B'}}]};
 const deps={scheduler,DurableObject:class{},loadSnapshot:async()=>({state,lastWallClockMs:Date.now()-5000,savedAtMs:recentCheckpoint?Date.now():0,stats:{chunks:1}}),saveSnapshot:async()=>{saveStarted=true;saveCalls++;await waiting;return{chunks:1};},exportSnapshot:async()=>'',freshState:()=>state,restoreState:()=>{},getRawState:()=>state,getState:options=>{reads++;return{population:1,simulationAgeSeconds:state.simulationAgeSeconds,flies:state.flies,selected:options.selectedId};},tick:({gameSeconds})=>{ticks++;state.simulationAgeSeconds+=gameSeconds;onTick(ticks);},mortalityReport:()=>({}),snapshotLooksUsable:()=>true,setNeuralSyncEnabled:()=>{},getSimulationConfig:()=>({gameSecondsPerRealSecond:120}),getNeuralAgents:()=>[],applyNeuralOutputs:outputs=>{neuralUpdates++;return{applied:outputs.length};},getNeuralStatus:()=>({}),markNeuralCycleFailed:()=>{},neuralActors:()=>state.flies};
 const Class=new Function(...Object.keys(deps),source+'\nreturn CivilizationWorld;')(...Object.values(deps));
 let nextAlarm=Date.now()+5000;const storage={getAlarm:async()=>{alarmReads++;return nextAlarm;},setAlarm:async at=>{nextAlarm=at;}};
 const ctx={storage,blockConcurrencyWhile:fn=>fn(),waitUntil:()=>{}};const world=new Class(ctx,{NEURAL_ENABLED:'0'});
 return{world,state,release,get saved(){return saveCalls;},get saving(){return saveStarted;},get ticks(){return ticks;},get reads(){return reads;},get alarmReads(){return alarmReads;},get neuralUpdates(){return neuralUpdates;}};
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
for(const mode of ['scheduler','timer fallback'])test(`observer runs between complete synchronous ticks with ${mode}`,async()=>{
 let observe,observedTicks,observedAge,observationError;const observed=new Promise(resolve=>{observe=resolve;});let waits=0;
 const scheduler=mode==='scheduler'?{wait:delay=>{assert.equal(delay,0);waits++;return new Promise(resolve=>setTimeout(resolve,delay));}}:undefined;
 const t=fixture({recentCheckpoint:true,scheduler,onTick:count=>{if(count===1)setTimeout(async()=>{
  try{const response=await t.world.fetch(new Request('https://test/api/civilization/state?view=observer'));const data=await response.json();observedTicks=t.ticks;observedAge=data.simulationAgeSeconds;}catch(error){observationError=error;}finally{observe();}
 },0);}});await t.world.ready;
 const before=t.state.simulationAgeSeconds;const advance=t.world.advanceTo(t.world.lastWallClockMs+5000,'alarm');
 await observed;if(observationError)throw observationError;
 assert.equal(observedTicks,1,'observer could only run after the whole alarm');assert.equal(observedAge,before+120,'observer saw an incomplete tick');
 const result=await advance;assert.equal(t.ticks,5);assert.equal(result.steps,5);assert.equal(result.advancedGameSeconds,600);assert.equal(t.state.simulationAgeSeconds,before+600);assert.equal(t.saved,0);
 if(mode==='scheduler')assert.equal(waits,4);
});
test('preflight never waits for an active simulation writer',async()=>{
 const t=fixture();await t.world.ready;let unlock;const block=new Promise(resolve=>{unlock=resolve;});const write=t.world.withLock(()=>block);
 try{const response=await t.world.fetch(new Request('https://test/api/civilization/state',{method:'OPTIONS'}));assert.equal(response.status,204);}finally{unlock();await write;}
});
