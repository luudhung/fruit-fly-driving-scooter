import {DurableObject} from 'cloudflare:workers';
import {parsePackedGraph,createNeuralState,runNeuralBatch,neuralSnapshotBytes} from './engine.mjs';

const SOURCE_SHA='1891bf482f299e6acb9032c748c884688750e5bf231d4f2dbc4224996005b92d';
const CACHE_CHUNK=1024*1024,SHARDS=16,MAX_AGENTS=600;
// Read-only graph cache only. No request/response/pending I/O is shared across objects.
let immutableGraph=null;
const bytes=v=>v instanceof Uint8Array?v:new Uint8Array(v);
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
export const brainShard=id=>Number(String(id).replace(/\D/g,''))%SHARDS;

async function gzip(buffer){return new Response(new Blob([buffer]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();}
async function gunzip(buffer,expected){
 const reader=new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),result=new Uint8Array(expected);let offset=0;
 try{while(true){const{done,value}=await reader.read();if(done)break;if(offset+value.length>expected)throw Error('Neural checkpoint expands beyond expected size');result.set(value,offset);offset+=value.length;}}
 finally{reader.releaseLock();}
 if(offset!==expected)throw Error('Truncated neural checkpoint');return result.buffer;
}
function validateManifest(m){
 if(m?.format!=='WGFLYPK1'||m.numNeurons!==139255||m.numEdges!==15091983||m.sourceSha256!==SOURCE_SHA||!Number.isInteger(m.totalBytes)||m.totalBytes<1||m.totalBytes>70*1024*1024||!Array.isArray(m.parts)||m.parts.length<1||m.parts.length>32)throw Error('Unexpected full-connectome manifest');
 let total=0;for(const p of m.parts){if(!/^flywire-[a-f0-9]{16}\.part\d{2}$/.test(p.file)||!Number.isInteger(p.size)||p.size<1||p.size>4*1024*1024||!/^[a-f0-9]{64}$/.test(p.sha256))throw Error('Invalid connectome part');total+=p.size;}
 if(total!==m.totalBytes)throw Error('Graph part sizes do not add up');return m;
}
async function cacheGraph(sql,storage,graph,manifest){
 for(let offset=0,part=0;offset<graph.length;offset+=CACHE_CHUNK,part++){
  sql.exec('INSERT OR REPLACE INTO graph_chunks(part,data) VALUES(?,?)',part,graph.subarray(offset,Math.min(offset+CACHE_CHUNK,graph.length)));
  if(part%4===3)await storage.sync();
 }
 sql.exec('INSERT OR REPLACE INTO neural_meta(key,value) VALUES(?,?)','graph',JSON.stringify(manifest));await storage.sync();
}
async function loadGraph(sql,storage,origin){
 const meta=sql.exec('SELECT value FROM neural_meta WHERE key=?','graph').toArray()[0];
 const saved=meta?validateManifest(JSON.parse(meta.value)):null;
 if(immutableGraph){if(!saved)await cacheGraph(sql,storage,immutableGraph.bytes,immutableGraph.manifest);return immutableGraph;}
 let manifest=saved,buffer;
 if(saved){
  buffer=new Uint8Array(saved.totalBytes);
  for(let offset=0,part=0;offset<buffer.length;offset+=CACHE_CHUNK,part++){
   const row=sql.exec('SELECT data FROM graph_chunks WHERE part=?',part).toArray()[0];
   const size=Math.min(CACHE_CHUNK,buffer.length-offset);
   if(!row||bytes(row.data).byteLength!==size)throw Error('Stored graph chunk is missing or corrupt');
   buffer.set(bytes(row.data),offset);
  }
 }else{
  const base=String(origin||'https://fruit-fly-driving-scooter.vercel.app').replace(/\/$/,'')+'/neural/';
  const response=await fetch(base+'flywire.json');if(!response.ok)throw Error(`Graph manifest HTTP ${response.status}`);
  manifest=validateManifest(await response.json());buffer=new Uint8Array(manifest.totalBytes);let offset=0,cachePart=0;
  for(const part of manifest.parts){
   const r=await fetch(base+part.file);if(!r.ok)throw Error(`Graph part HTTP ${r.status}`);
   const b=new Uint8Array(await r.arrayBuffer());
   if(b.length!==part.size||hex(await crypto.subtle.digest('SHA-256',b))!==part.sha256)throw Error('Graph part integrity mismatch');
   buffer.set(b,offset);
   for(let inner=0;inner<b.length;inner+=CACHE_CHUNK){
    sql.exec('INSERT OR REPLACE INTO graph_chunks(part,data) VALUES(?,?)',cachePart++,b.subarray(inner,Math.min(inner+CACHE_CHUNK,b.length)));
   }
   offset+=b.length;await storage.sync();
  }
  sql.exec('INSERT OR REPLACE INTO neural_meta(key,value) VALUES(?,?)','graph',JSON.stringify(manifest));await storage.sync();
 }
 const graph=parsePackedGraph(buffer);if(graph.sourceSha256!==SOURCE_SHA)throw Error('Wrong full FlyWire source graph');
 graph.manifest=manifest;immutableGraph=graph;return graph;
}

export class FlyWireBrainShard extends DurableObject{
 constructor(ctx,env){
  super(ctx,env);this.queue=Promise.resolve();
  this.ready=ctx.blockConcurrencyWhile(async()=>{
   ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS graph_chunks(part INTEGER PRIMARY KEY,data BLOB NOT NULL)');
   ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS neural_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL) WITHOUT ROWID');
   ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS brain_states(id TEXT PRIMARY KEY,snapshot BLOB,output TEXT NOT NULL,cycle_id TEXT NOT NULL) WITHOUT ROWID');
  });
 }
 withLock(fn){const p=this.queue.then(fn,fn);this.queue=p.catch(()=>{});return p;}
 async stepBatch(batch){return this.withLock(async()=>{
  await this.ready;
  if(!Array.isArray(batch?.agents)||batch.agents.length>48||typeof batch.cycleId!=='string'||batch.cycleId.length>100)throw Error('Invalid neural batch');
  const agents=batch.agents;
  if(agents.some(a=>!/^BRAIN-\d{6,}$/.test(a.brain_id)))throw Error('Invalid brain identifier');
  const sql=this.ctx.storage.sql,graph=await loadGraph(sql,this.ctx.storage,this.env.NEURAL_ASSET_ORIGIN),outputs=[];
  const started=Date.now(),steps=Math.max(1,Math.min(256,Math.floor(batch.steps||128)));
  for(const sense of agents){
   const row=sql.exec('SELECT snapshot,output,cycle_id FROM brain_states WHERE id=?',sense.brain_id).toArray()[0];
   if(row?.cycle_id===batch.cycleId){outputs.push(JSON.parse(row.output));continue;}
   const raw=row?.snapshot?await gunzip(row.snapshot,neuralSnapshotBytes(graph.n)):null;
   const state=createNeuralState(graph,raw),output=runNeuralBatch(graph,state,sense,steps);
   output.computed_at_ms=Date.now();output.cycle_id=batch.cycleId;
   const checkpoint=await gzip(state.buffer);
   sql.exec('INSERT INTO brain_states(id,snapshot,output,cycle_id) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot,output=excluded.output,cycle_id=excluded.cycle_id',sense.brain_id,checkpoint,JSON.stringify(output),batch.cycleId);
   await this.ctx.storage.sync();outputs.push(output);
   // Leave CPU headroom; a retry reuses already committed results for the same cycle.
   if(Date.now()-started>18000)break;
  }
  if(outputs.length===agents.length&&agents.length){
   const ids=agents.map(a=>a.brain_id),marks=ids.map(()=>'?').join(',');
   // Preserve final neural telemetry for dead residents, reclaim only their no-longer-running buffers.
   sql.exec(`UPDATE brain_states SET snapshot=NULL WHERE snapshot IS NOT NULL AND id NOT IN (${marks})`,...ids);
  }
  return {outputs,complete:outputs.length===agents.length,neurons:graph.n,edges:graph.e,graphBytes:graph.bytes.byteLength,sourceSha256:SOURCE_SHA,elapsedMs:Date.now()-started};
 });}
}

export class FlyWireNeuralCoordinator extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.queue=Promise.resolve();this.running=false;}
 withLock(fn){const p=this.queue.then(fn,fn);this.queue=p.catch(()=>{});return p;}
 world(){return this.env.CIVILIZATION.getByName(this.env.CIV_WORLD_ID||'WORLD-A');}
 interval(population=500){
  // Reserve at least 40k/day for city snapshots, indexes, retries and alarms.
  const writeBudgetInterval=Math.ceil(Math.max(1,population)*86400/60000)*1000;
  return Math.max(360000,writeBudgetInterval,Math.min(3600000,Number(this.env.NEURAL_INTERVAL_MS||360000)));
 }
 steps(){return Math.max(1,Math.min(256,Number(this.env.NEURAL_STEPS_PER_CYCLE||16)));}
 async ensureRunning(){
  const alarm=await this.ctx.storage.getAlarm(),pending=await this.ctx.storage.get('cycle');
  if(!this.running&&(alarm==null||pending&&alarm>Date.now()+3000))await this.ctx.storage.setAlarm(Date.now()+1500);
  return {scheduled:true,intervalMs:this.interval(),stepsPerCycle:this.steps()};
 }
 async alarm(){return this.withLock(async()=>{
  this.running=true;
  // Keep a future alarm through failures and long cold starts, without any open browser.
  await this.ctx.storage.setAlarm(Date.now()+this.interval());
  let cycle=await this.ctx.storage.get('cycle');
  try{
   if(!cycle){
    const inputs=await this.world().getNeuralInputs();
    if(inputs.agents.length>MAX_AGENTS)throw Error('Living brain count exceeds free-budget bound');
    cycle={id:`${Date.now()}-${inputs.worldId}`,startedAt:Date.now(),agents:inputs.agents,cursor:0,completed:0,steps:this.steps(),intervalMs:this.interval(inputs.agents.length)};
    await this.ctx.storage.put('cycle',cycle);
   }
   // Apply a lower configured budget to a resumed cycle without discarding checkpoints.
   cycle.steps=Math.min(cycle.steps,this.steps());
   const groups=Array.from({length:SHARDS},()=>[]);
   for(const agent of cycle.agents)groups[brainShard(agent.brain_id)].push(agent);
   for(;cycle.cursor<SHARDS;cycle.cursor++){
    const agents=groups[cycle.cursor];
    if(agents.length){
     const shard=this.env.NEURAL_BRAINS.getByName(`${this.env.CIV_WORLD_ID||'WORLD-A'}:${cycle.cursor}`);
     const result=await shard.stepBatch({agents,cycleId:cycle.id,steps:cycle.steps});
     await this.world().applyNeuralBatch({outputs:result.outputs,cycleId:cycle.id,totalBrains:cycle.agents.length,completedBefore:cycle.completed,complete:false,intervalMs:cycle.intervalMs,stepsPerCycle:cycle.steps,sourceSha256:SOURCE_SHA,graphBytes:result.graphBytes});
     if(!result.complete){await this.ctx.storage.put('cycle',cycle);await this.ctx.storage.setAlarm(Date.now()+3000);return;}
     cycle.completed+=agents.length;
    }
    await this.ctx.storage.put('cycle',{...cycle,cursor:cycle.cursor+1});
    // Yield after one shard, so a long alarm cannot hold up observability and city RPCs.
    if(cycle.cursor<SHARDS-1){await this.ctx.storage.setAlarm(Date.now()+1500);return;}
   }
   await this.world().applyNeuralBatch({outputs:[],cycleId:cycle.id,totalBrains:cycle.agents.length,completedBefore:cycle.completed,complete:true,intervalMs:cycle.intervalMs,stepsPerCycle:cycle.steps,sourceSha256:SOURCE_SHA,graphBytes:61207438,startedAt:cycle.startedAt});
   await this.ctx.storage.delete('cycle');
   await this.ctx.storage.setAlarm(Date.now()+cycle.intervalMs);
  }catch(error){
   console.error(JSON.stringify({event:'neural_cycle_error',error:String(error),cycleId:cycle?.id,cursor:cycle?.cursor}));
   await this.world().neuralCycleFailed({error:String(error),cycleId:cycle?.id||null}).catch(()=>{});
   await this.ctx.storage.setAlarm(Date.now()+60000);
  }finally{this.running=false;}
 });}
}
