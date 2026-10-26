// Full-graph LIF CPU engine. Event propagation skips zero contributions, not neurons/edges.
// The packed graph stores each original Float32 weight bit-for-bit in a dictionary.
const F=Math.fround, A=F(.81873), ALPHA=F(Math.exp(-1/20)), MASK=262143;
const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(v)?v:0));
const unit=(v,gain)=>v>0?clamp(1-Math.exp(-v*gain)):0;
const aligned=v=>(v+3)&~3;
const sample=(v,max)=>v.length<=max?Uint32Array.from(v):Uint32Array.from({length:max},(_,i)=>v[Math.floor(i*v.length/max)]);

export function parsePackedGraph(buffer){
 const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
 if(bytes.byteOffset%4)throw Error('Unaligned packed graph');
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<64||new TextDecoder().decode(bytes.subarray(0,8))!=='WGFLYPK1'||d.getUint32(8,true)!==1)throw Error('Invalid packed graph');
 const n=d.getUint32(12,true),e=d.getUint32(16,true),p=d.getUint32(20,true);
 if(!n||n>262144||!e||!p||p>1024||64+4*(n+1)+4*e+4*p+2*n!==bytes.length)throw Error('Packed graph length or bounds invalid');
 let off=bytes.byteOffset+64;
 const offsets=new Uint32Array(bytes.buffer,off,n+1);off+=4*(n+1);
 const edges=new Uint32Array(bytes.buffer,off,e);off+=4*e;
 const weights=new Float32Array(bytes.buffer,off,p);off+=4*p;
 const flags=new Uint16Array(bytes.buffer,off,n);
 if(offsets[0]!==0||offsets[n]!==e)throw Error('Invalid packed CSR');
 const groups={opticLeft:[],opticRight:[],sensory:[],dnLeft:[],dnRight:[],mbon:[]},regions=new Uint32Array(11);
 for(let i=0;i<n;i++){
  if(offsets[i]>offsets[i+1])throw Error('Invalid packed offsets');
  const sc=flags[i]&15,hero=(flags[i]>>>4)&15,left=!!(flags[i]&256);
  if(sc>=regions.length)throw Error('Invalid neuron class');regions[sc]++;
  if(sc===10)groups[left?'opticLeft':'opticRight'].push(i);
  if(sc===1)groups.sensory.push(i);
  if(hero===7)groups[left?'dnLeft':'dnRight'].push(i);
  if(hero===2)groups.mbon.push(i);
 }
 for(const [name,values]of Object.entries(groups))groups[name]=sample(values,name.startsWith('optic')?4200:name==='sensory'?2200:n);
 const sourceSha256=Array.from(bytes.subarray(24,56),v=>v.toString(16).padStart(2,'0')).join('');
 return {n,e,offsets,edges,weights,flags,groups,regions,sourceSha256,bytes};
}

export function neuralSnapshotBytes(n){return aligned(64+n*13)+Math.ceil(n/32)*4;}
export function createNeuralState(graph,snapshot=null){
 let buffer;
 if(snapshot){
  buffer=snapshot instanceof ArrayBuffer?snapshot:snapshot.buffer.slice(snapshot.byteOffset,snapshot.byteOffset+snapshot.byteLength);
  const h=new DataView(buffer);
  if(buffer.byteLength!==neuralSnapshotBytes(graph.n)||new TextDecoder().decode(new Uint8Array(buffer,0,8))!=='WGFLYST1'||h.getUint32(8,true)!==1||h.getUint32(12,true)!==graph.n)throw Error('Invalid neural checkpoint');
  const digest=Array.from(new Uint8Array(buffer,24,32),v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==graph.sourceSha256)throw Error('Checkpoint belongs to another connectome');
 }else{
  buffer=new ArrayBuffer(neuralSnapshotBytes(graph.n));
  const b=new Uint8Array(buffer),h=new DataView(buffer);b.set(new TextEncoder().encode('WGFLYST1'));
  h.setUint32(8,1,true);h.setUint32(12,graph.n,true);
  b.set(Uint8Array.from(graph.sourceSha256.match(/../g),v=>parseInt(v,16)),24);
 }
 const n=graph.n,header=new DataView(buffer),vm=new Float32Array(buffer,64,n),gx=new Float32Array(buffer,64+4*n,n),gy=new Float32Array(buffer,64+8*n,n),refrac=new Uint8Array(buffer,64+12*n,n),spikes=new Uint32Array(buffer,aligned(64+13*n),Math.ceil(n/32));
 if(!snapshot)vm.fill(-52);
 const active=new Uint32Array(n);let activeCount=0;
 for(let i=0;i<n;i++)if(spikes[i>>>5]&(1<<(i&31)))active[activeCount++]=i;
 return {buffer,header,vm,gx,gy,refrac,spikes,active,activeCount,delta:new Float32Array(n),ext:new Float32Array(n),steps:header.getFloat64(16,true)};
}

export function encodeSensoryInput(graph,state,sense){
 const input=state.ext;input.fill(0);
 const dx=clamp(sense.target_dx/80,-1,1),dz=clamp(sense.target_dz/80,-1,1);
 const left=clamp(.22+Math.max(0,-dx)*.75+Math.abs(dz)*.10,0,1.5),right=clamp(.22+Math.max(0,dx)*.75+Math.abs(dz)*.10,0,1.5);
 const sleep=sense.sleeping?.22:1,visibility=clamp(1-Number(sense.precipitation||0)*.55-Number(sense.weather_danger||0)*.18,.2,1),sunset=clamp(sense.sunset_quality)*.18;
 for(const [key,drive]of [['opticLeft',left],['opticRight',right]]){
  const list=graph.groups[key];for(let k=0;k<list.length;k++)input[list[k]]=((drive+(key==='opticLeft'?(k%17)/17:((k*7)%19)/19)*.08)*visibility+sunset)*sleep;
 }
 const channels=[clamp(sense.hunger/100),clamp((100-sense.energy)/100),clamp(sense.stress/100),clamp(sense.excitement/100),clamp(sense.loneliness/100),clamp((100-sense.health)/100),clamp(sense.social_signal),clamp((Number(sense.reward||0)+1)*.5),clamp(sense.weather_danger),clamp(sense.precipitation),clamp(sense.wind),clamp(sense.sunset_quality)];
 const list=graph.groups.sensory;
 for(let k=0;k<list.length;k++)input[list[k]]=(.08+channels[k%channels.length]*1.35)*sleep;
}

export function stepNeuralGraph(graph,state){
 const {n,offsets,edges,weights}=graph,{active,delta,vm,gx,gy,refrac,ext,spikes}=state;
 delta.fill(0);
 // Deliver exactly the weighted spikes that would contribute to a dense CSR gather.
 // All edges remain in the graph; inactive sources contribute mathematical zero.
 for(let a=0;a<state.activeCount;a++){
  const pre=active[a];
  for(let k=offsets[pre],end=offsets[pre+1];k<end;k++){
   const edge=edges[k];delta[edge&MASK]+=weights[edge>>>18];
  }
 }
 spikes.fill(0);let count=0;
 for(let i=0;i<n;i++){
  const gyNew=F(F(gy[i]*A)+gx[i]),gxNew=F(F(gx[i]*A)+delta[i]);
  gy[i]=gyNew;gx[i]=gxNew;
  const current=F(F(gyNew*F(.005))+F(ext[i]*2));
  if(refrac[i]){vm[i]=-52;refrac[i]--;}
  else{
   const v=F(F(-52+F(ALPHA*F(vm[i]+52)))+current);
   if(v>=-45){vm[i]=-52;refrac[i]=2;spikes[i>>>5]|=1<<(i&31);active[count++]=i;}
   else vm[i]=v;
  }
 }
 state.activeCount=count;state.steps++;state.header.setFloat64(16,state.steps,true);
 return count;
}

export function runNeuralBatch(graph,state,sense,steps){
 steps=Math.max(1,Math.min(256,Math.floor(steps)));encodeSensoryInput(graph,state,sense);
 let active=0,dnLeft=0,dnRight=0,mbon=0;const counts=new Uint32Array(11),{flags,groups,regions}=graph;
 const fired=i=>!!(state.spikes[i>>>5]&(1<<(i&31)));
 for(let s=0;s<steps;s++){
  active+=stepNeuralGraph(graph,state);
  for(let k=0;k<state.activeCount;k++)counts[flags[state.active[k]]&15]++;
  for(const i of groups.dnLeft)if(fired(i))dnLeft++;
  for(const i of groups.dnRight)if(fired(i))dnRight++;
  for(const i of groups.mbon)if(fired(i))mbon++;
 }
 const rate=i=>counts[i]/Math.max(1,regions[i]*steps),l=unit(dnLeft/Math.max(1,groups.dnLeft.length*steps),115),r=unit(dnRight/Math.max(1,groups.dnRight.length*steps),115);
 const motor=unit(rate(6),110),central=unit(rate(4),95),intrinsic=unit(rate(3),95),endocrine=unit(rate(7),110),sensory=unit(rate(1),105),mushroom=unit(mbon/Math.max(1,groups.mbon.length*steps),120);
 const approach=clamp(central*.38+mushroom*.34+motor*.28),avoid=clamp(endocrine*.42+sensory*.36+(1-mushroom)*.22),social=clamp(mushroom*.38+central*.32+sensory*.18+motor*.12),rest=clamp(intrinsic*.44+endocrine*.28+(1-motor)*.28),explore=clamp(motor*.34+central*.28+sensory*.22+Math.abs(r-l)*.16),consume=clamp(mushroom*.32+intrinsic*.24+sensory*.24+central*.20);
 return {
  brain_id:sense.brain_id,parent_brain_ids:sense.parent_brain_ids||[],full_connectome:true,stepped_this_sync:true,neurons:graph.n,edges:graph.e,
  neural_steps_total:state.steps,biological_ms_total:state.steps,steps_this_batch:steps,active_neurons:state.activeCount,spikes_this_batch:active,activity:active/(graph.n*steps),
  locomotion_x:clamp((r-l)*2.2,-1,1),locomotion_z:clamp((r+l)*.9+motor*.55),approach_drive:approach,avoid_drive:avoid,social_drive:social,rest_drive:rest,explore_drive:explore,consume_drive:consume,motor_drive:motor,
  confidence:Math.max(approach,avoid,social,rest,explore,consume),region_activity:Array.from(counts,(c,i)=>c/Math.max(1,regions[i]*steps)),
  engine:'full-flywire-event-lif-v1',source_sha256:graph.sourceSha256,
 };
}
