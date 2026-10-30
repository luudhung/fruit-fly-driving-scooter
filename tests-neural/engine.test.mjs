import test from 'node:test';
import assert from 'node:assert/strict';
import {packConnectome} from '../tools/pack-connectome.mjs';
import {parsePackedGraph,createNeuralState,stepNeuralGraph,runNeuralBatch,neuralSnapshotBytes} from '../cloudflare/src/neural/engine.mjs';
import {freshState,getNeuralAgents,applyNeuralOutputs,getNeuralStatus,getRawState} from '../worker/civilization-engine.mjs';
function fixture(){
 const n=6,rows=[[[3,2],[0,-.5],[3,0]],[[0,4],[2,.25]],[[1,-2],[5,1]],[[2,8]],[[3,2]],[[4,.5]]],e=rows.reduce((a,v)=>a+v.length,0);
 const buffer=new ArrayBuffer(64+n*32+(n+1)*4+e*8),b=new Uint8Array(buffer),d=new DataView(buffer);b.set(new TextEncoder().encode('WGFLYBRN'));
 d.setUint32(8,1,true);d.setUint32(12,n,true);d.setUint32(16,e,true);
 for(let i=0;i<n;i++){d.setFloat32(64+i*32,i-2,true);d.setUint32(64+i*32+20,i===0?1:i===1?10:i===2?6:4,true);d.setUint32(64+i*32+16,i===2?7:i===4?2:0,true);}
 let k=0;const off=64+n*32,col=off+4*(n+1),weight=col+e*4;
 for(let i=0;i<n;i++){d.setUint32(off+i*4,k,true);for(const [pre,w]of rows[i]){d.setUint32(col+k*4,pre,true);d.setFloat32(weight+k*4,w,true);k++;}}
 d.setUint32(off+n*4,e,true);return {buffer,rows,n,e};
}
function graph(){const f=fixture(),p=packConnectome(new Uint8Array(f.buffer));return {...f,graph:parsePackedGraph(p.bytes),packed:p};}
const sense={brain_id:'BRAIN-000001',target_dx:40,target_dz:-20,hunger:90,energy:45,stress:80,health:70,excitement:70,loneliness:60,social_signal:.8,reward:.4,precipitation:.1,weather_danger:.2,wind:.1,sunset_quality:.4,sleeping:false};

test('lossless packing retains every edge, duplicate, zero weight and exact Float32 bit pattern',()=>{
 const {graph:g,rows,n,e}=graph(),reconstructed=Array.from({length:n},()=>[]);
 for(let pre=0;pre<n;pre++)for(let k=g.offsets[pre];k<g.offsets[pre+1];k++){
  const edge=g.edges[k];reconstructed[edge&262143].push([pre,g.weights[edge>>>18]]);
 }
 const canonical=a=>a.map(row=>row.toSorted((a,b)=>a[0]-b[0]||a[1]-b[1]));
 assert.equal(g.n,n);assert.equal(g.e,e);assert.deepEqual(canonical(reconstructed),canonical(rows));
 const bad=new Uint8Array(fixture().buffer);bad[0]=0;assert.throws(()=>packConnectome(bad),/Invalid/);
});
test('event propagation matches a dense full-CSR reference through 120 LIF steps',()=>{
 const {graph:g,rows,n}=graph(),s=createNeuralState(g),vm=new Float32Array(n).fill(-52),gx=new Float32Array(n),gy=new Float32Array(n),refrac=new Uint8Array(n);let prev=new Uint8Array(n);
 const f=Math.fround,a=f(.81873),alpha=f(Math.exp(-1/20));s.ext.set([4.25,2.5,1.5,2,4,2]);
 for(let step=0;step<120;step++){
  const current=new Uint8Array(n);
  for(let i=0;i<n;i++){
   let delta=0;for(const [pre,w]of rows[i])delta=f(delta+f(w*prev[pre]));
   const y=f(f(gy[i]*a)+gx[i]),x=f(f(gx[i]*a)+delta);gy[i]=y;gx[i]=x;
   const input=f(f(y*f(.005))+f(s.ext[i]*2));
   if(refrac[i]){vm[i]=-52;refrac[i]--;}
   else{const v=f(f(-52+f(alpha*f(vm[i]+52)))+input);if(v>=-45){vm[i]=-52;refrac[i]=2;current[i]=1;}else vm[i]=v;}
  }
  prev=current;stepNeuralGraph(g,s);
  assert.deepEqual(Array.from(s.vm),Array.from(vm));assert.deepEqual(Array.from(s.gx),Array.from(gx));assert.deepEqual(Array.from(s.gy),Array.from(gy));
  assert.deepEqual(Array.from({length:n},(_,i)=>(s.spikes[i>>>5]>>>(i&31))&1),Array.from(prev));
 }
});
test('each brain has private neural buffers; checkpoint restart preserves the exact next computation',()=>{
 const {graph:g}=graph(),a=createNeuralState(g),b=createNeuralState(g);
 runNeuralBatch(g,a,sense,64);assert.equal(b.steps,0);assert.ok(b.vm.every(v=>v===-52));
 const saved=a.buffer.slice(0),restored=createNeuralState(g,saved);
 const x=runNeuralBatch(g,a,sense,32),y=runNeuralBatch(g,restored,sense,32);
 assert.deepEqual(x,y);assert.deepEqual(new Uint8Array(a.buffer),new Uint8Array(restored.buffer));
 assert.equal(a.buffer.byteLength,neuralSnapshotBytes(g.n));
 const corrupt=saved.slice(0);new DataView(corrupt).setUint32(12,999,true);assert.throws(()=>createNeuralState(g,corrupt),/Invalid/);
});
test('different body/world inputs produce different measured neural states',()=>{
 const {graph:g}=graph(),a=createNeuralState(g),b=createNeuralState(g);
 runNeuralBatch(g,a,sense,64);runNeuralBatch(g,b,{...sense,hunger:0,sleeping:true},64);
 assert.notDeepEqual(new Uint8Array(a.buffer),new Uint8Array(b.buffer));
});
test('full-brain counters require real outputs for all living residents and reject older checkpoints',()=>{
 const s=freshState(),agents=getNeuralAgents();assert.equal(agents.length,500);assert.equal(getNeuralStatus().allBrainsReady,false);
 const outputs=agents.map(a=>({...a,full_connectome:true,neurons:139255,edges:15091983,neural_steps_total:128,active_neurons:12,region_activity:[.01],engine:'full-flywire-event-lif-v1'}));
 applyNeuralOutputs(outputs.slice(0,10),{cycleId:'one',intervalMs:720000,stepsPerCycle:128});
 assert.equal(getNeuralStatus().registeredBrains,10);assert.equal(getNeuralStatus().allBrainsReady,false);
 applyNeuralOutputs(outputs,{cycleId:'one',intervalMs:720000,stepsPerCycle:128,complete:true});
 assert.equal(getNeuralStatus().registeredBrains,500);assert.equal(getNeuralStatus().allBrainsReady,true);assert.equal(getNeuralStatus().minNeuralSteps,128);
 applyNeuralOutputs([{...outputs[0],neural_steps_total:1}],{cycleId:'late'});
 assert.equal(s.flies[0].brain.fullConnectome.neuralStepsTotal,128);
 s.flies[0].brain.fullConnectome.lastSyncAt=0;
 assert.equal(getNeuralStatus().registeredBrains,499);assert.equal(getNeuralStatus().allBrainsReady,false);
 assert.equal(getRawState().flies.length,500);
});

test('replaying a committed batch preserves its actual computation time and measured step count',()=>{
 const s=freshState(),agent=getNeuralAgents()[0],oldTime=Date.now()-7200000;
 const output={brain_id:agent.brain_id,full_connectome:true,neurons:139255,edges:15091983,neural_steps_total:128,steps_this_batch:128,computed_at_ms:oldTime};
 applyNeuralOutputs([output],{cycleId:'old-retry',intervalMs:720000,stepsPerCycle:16});
 assert.equal(s.flies[0].brain.fullConnectome.lastSyncAt,oldTime);
 assert.equal(s.flies[0].brain.fullConnectome.stepsPerCycle,128);
 assert.equal(getNeuralStatus().registeredBrains,0);
 applyNeuralOutputs([{...output,neural_steps_total:144,steps_this_batch:16,computed_at_ms:Date.now()}],{cycleId:'new',intervalMs:720000,stepsPerCycle:16});
 assert.equal(getNeuralStatus().registeredBrains,1);assert.equal(getNeuralStatus().minNeuralSteps,144);
 applyNeuralOutputs([output],{cycleId:'late-old'});assert.equal(s.flies[0].brain.fullConnectome.neuralStepsTotal,144);
});
