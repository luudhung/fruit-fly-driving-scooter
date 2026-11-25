import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LOCAL_HOST_CHECKPOINT_MS,LOCAL_HOST_HEARTBEAT_MS} from '../worker/local-host-state.mjs';
import {projectLocalDocument,diffLocalDocument,applyLocalDelta} from '../worker/local-host-delta.mjs';

function fixture(options={}){
 const initial={worldId:'CLIENT-TEST',mapVersion:36,simulationAgeSeconds:10000,timeScale:120,flies:[{id:'FLY-A',alive:true,x:1,y:1.1,z:2,health:95,money:150,brain:{id:'BRAIN-A',memory:{visits:[]}}}]};
 const lease={protocol:3,token:'test-owner',epoch:4,sequence:0};
 let state=structuredClone(initial),remote=structuredClone(projectLocalDocument(initial)),sequence=0,now=1000,receiptLost=false,heartbeatResolve,compressionCalls=0;
 const intervals=[],timeouts=[],messages=[],calls=[],packets=[];
 const deferredHeartbeat=new Promise(resolve=>{heartbeatResolve=resolve;});
 const fetch=async(url,init)=>{
  const path=new URL(url).pathname.split('/').at(-1);calls.push(path);
  if(path==='claim')return Response.json({granted:true,lease,state:structuredClone(initial)});
  if(path==='heartbeat'){
   if(options.holdHeartbeat)await deferredHeartbeat;
   return Response.json({ok:true,sequence,commands:[]});
  }
  if(path==='leave')return Response.json({ok:true});
  assert.equal(path,'checkpoint');
  assert.equal(init.headers['content-type'],'application/x-city-delta+gzip');
  const bytes=Buffer.from(init.body),payload=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
  packets.push({bytes:Buffer.from(bytes),payload});
  if(options.fenceCheckpoint)return Response.json({error:'local_session_replaced'},{status:409});
  if(options.rejectCheckpoint)return Response.json({error:'invalid_local_request'},{status:400});
  if(payload.sequence>sequence){
   assert.equal(payload.sequence,sequence+1);assert.equal(payload.baseSequence,sequence);
   remote=applyLocalDelta(remote,payload.patch);sequence=payload.sequence;
  }
  if(options.loseReceiptOnce&&!receiptLost){receiptLost=true;throw Error('connection ended after durable commit');}
  if(options.failEveryCheckpoint)throw Error('cloud unavailable');
  return Response.json({ok:true,sequence,commands:[]});
 };
 const self={};
 const deps={restoreState:s=>{state=structuredClone(s);state.restoredLocally=true;},getRawState:()=>state,
  getState:()=>({simulationAgeSeconds:state.simulationAgeSeconds,flies:structuredClone(state.flies)}),
  tick:async({gameSeconds})=>{state.simulationAgeSeconds+=gameSeconds;},setNeuralSyncEnabled:()=>{},countries:{requestConflict:()=>({accepted:true})},
  LOCAL_HOST_CHECKPOINT_MS,LOCAL_HOST_HEARTBEAT_MS,projectLocalDocument,diffLocalDocument,
  postMessage:message=>messages.push(structuredClone(message)),self,fetch,
  setInterval:(callback,ms)=>{intervals.push({callback,ms});return intervals.length;},
  setTimeout:(callback,ms)=>{timeouts.push({callback,ms,active:true});return timeouts.length;},clearTimeout:id=>{if(timeouts[id-1])timeouts[id-1].active=false;},performance:{now:()=>now},Date:class extends Date{static now(){return now;}},
  CompressionStream:class{constructor(format){if(options.holdCompressionOnce&&compressionCalls++===0)return new TransformStream({transform(){},flush(){return new Promise(()=>{});}});return new CompressionStream(format);}},
  console:{warn:()=>{},error:()=>{}},
 };
 const source=fs.readFileSync(new URL('../worker/local-city-host.mjs',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'');
 const run=new Function(...Object.keys(deps),source+'\nreturn {save,heartbeat,advance};')(...Object.values(deps));
 return {...run,intervals,messages,calls,packets,get state(){return state;},get remote(){return remote;},setNow:value=>{now=value;},resolveHeartbeat:()=>heartbeatResolve(),fireTimeout:ms=>{const timer=timeouts.find(timer=>timer.active&&timer.ms===ms);assert.ok(timer,'expected active timeout');timer.active=false;timer.callback();},
  start:()=>self.onmessage({data:{type:'start',api:'https://city.test',selectedId:null}}),release:()=>self.onmessage({data:{type:'release'}})};
}
async function until(check){for(let i=0;i<100&&!check();i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(check(),'asynchronous worker operation did not finish');}

test('progress saves have their own five-real-second timer and do not wait for a slow heartbeat',async()=>{
 const t=fixture({holdHeartbeat:true});await t.start();
 assert.deepEqual(t.intervals.map(timer=>timer.ms),[750,5000,5000]);
 assert.equal(LOCAL_HOST_CHECKPOINT_MS,5000);
 t.setNow(6000);const heartbeat=t.heartbeat();await until(()=>t.calls.includes('heartbeat'));
 t.state.simulationAgeSeconds+=600;t.state.flies[0].x=12;
 t.intervals[2].callback();await until(()=>t.messages.some(message=>message.type==='saved'));
 assert.equal(t.packets.length,1);assert.equal(t.remote.actors['FLY-A'].x,12);
 assert.equal(t.messages.some(message=>message.type==='contact'),false,'checkpoint did not depend on the heartbeat response');
 t.resolveHeartbeat();await heartbeat;
});

test('a lost receipt retries identical bytes and advances the delta base only after acknowledgment',async()=>{
 const t=fixture({loseReceiptOnce:true});await t.start();
 t.state.simulationAgeSeconds+=120;t.state.flies[0].x=8;
 assert.equal(await t.save(),false);assert.equal(t.messages.some(message=>message.type==='saved'),false);
 assert.equal(t.remote.actors['FLY-A'].x,8,'the first request committed even though its receipt was lost');
 t.state.simulationAgeSeconds+=120;t.state.flies[0].x=22;t.state.flies[0].money-=3;
 assert.equal(await t.save(),true);
 assert.deepEqual(t.packets[1].bytes,t.packets[0].bytes,'retry must not silently replace an already committed sequence');
 assert.equal(t.remote.actors['FLY-A'].x,22,'retry recovery immediately flushes the latest step without waiting another five seconds');
 assert.deepEqual(t.packets.map(packet=>[packet.payload.baseSequence,packet.payload.sequence]),[[0,1],[0,1],[1,2]]);
 assert.equal(t.remote.actors['FLY-A'].x,22);assert.equal(t.remote.actors['FLY-A'].money,147);
 assert.equal(t.remote.actors['FLY-A'].brain.id,'BRAIN-A');
});

test('closing after a lost regular receipt retries it before sending the latest final delta and stops heartbeats',async()=>{
 const t=fixture({loseReceiptOnce:true});await t.start();
 t.state.simulationAgeSeconds+=120;t.state.flies[0].x=8;assert.equal(await t.save(),false);
 t.state.simulationAgeSeconds+=120;t.state.flies[0].x=35;
 await t.release();
 assert.deepEqual(t.packets.map(packet=>[packet.payload.sequence,packet.payload.release]),[[1,false],[1,false],[2,true]]);
 assert.deepEqual(t.packets[1].bytes,t.packets[0].bytes);
 assert.equal(t.remote.actors['FLY-A'].x,35);
 const before=t.calls.length;await t.heartbeat();t.intervals[2].callback();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(t.calls.length,before,'a stopped session must not keep the cloud paused');
 assert.equal(t.messages.at(-1).type,'released');
});

test('a final-save failure sends a small leave request and does not renew ownership forever',async()=>{
 const t=fixture({failEveryCheckpoint:true});await t.start();
 await t.release();assert.equal(t.calls.at(-1),'leave');
 const before=t.calls.length;await t.heartbeat();assert.equal(t.calls.length,before);
 assert.equal(t.messages.at(-1).type,'released');
});

test('a fenced worker stops simulation ownership instead of posting more checkpoints or heartbeats',async()=>{
 const t=fixture({fenceCheckpoint:true});await t.start();assert.equal(await t.save(),false);
 assert.ok(t.messages.some(message=>message.type==='fenced'));
 const before=t.calls.length;await t.heartbeat();assert.equal(await t.save(),false);assert.equal(t.calls.length,before);
});

test('persistent invalid checkpoint requests stop renewing ownership but retain exact retry bytes and recover after a durable receipt',async()=>{
 const options={rejectCheckpoint:true},t=fixture(options);await t.start();
 t.state.simulationAgeSeconds+=600;t.state.flies[0].x=12;
 assert.equal(await t.save(),false);t.setNow(60000);await t.heartbeat();assert.equal(t.calls.filter(path=>path==='heartbeat').length,1,'initial acknowledgment grace allows transient slow saves');
 t.setNow(62000);assert.equal(await t.save(),false);await t.heartbeat();
 assert.equal(t.calls.filter(path=>path==='heartbeat').length,1,'a reachable but broken writer cannot pause the cloud forever');
 assert.deepEqual(t.packets[1].bytes,t.packets[0].bytes);assert.equal(t.messages.some(message=>message.type==='saved'),false);assert.equal(t.remote.actors['FLY-A'].x,1);
 options.rejectCheckpoint=false;t.state.simulationAgeSeconds+=120;t.state.flies[0].x=28;t.setNow(70000);
 assert.equal(await t.save(),true);assert.deepEqual(t.packets[2].bytes,t.packets[0].bytes);assert.equal(t.remote.actors['FLY-A'].x,28,'after retrying the rejected packet, the latest step is saved immediately');
 await t.heartbeat();assert.equal(t.calls.filter(path=>path==='heartbeat').length,2,'only a newly acknowledged durable save restores renewal');
});

test('a stalled gzip preparation times out, releases checkpointBusy and cannot overwrite a later successful packet',async()=>{
 const t=fixture({holdCompressionOnce:true});await t.start();t.state.simulationAgeSeconds+=120;
 const stalled=t.save();await until(()=>t.calls.length===1);t.fireTimeout(55000);assert.equal(await stalled,false);assert.equal(t.packets.length,0);
 t.state.simulationAgeSeconds+=120;t.state.flies[0].x=45;assert.equal(await t.save(),true);assert.equal(t.remote.actors['FLY-A'].x,45);assert.deepEqual(t.packets.map(packet=>packet.payload.sequence),[1]);
});
