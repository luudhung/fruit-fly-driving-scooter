import {cleanupPastWorld} from '../../worker/expired-world-data.mjs';
import {projectLocalDocument,applyLocalDelta,localDocumentState} from '../../worker/local-host-delta.mjs';
import {readLocalHostCheckpoint} from '../../worker/local-host-state.mjs';
const META='local-save:meta',CHUNK=1000000,MAX_ENTRIES=12,MAX_JOURNAL_BYTES=3000000;
const encoder=new TextEncoder();
const values=meta=>meta?[...(meta.overlayKeys||[]),...(meta.entries||[]).map(e=>e.key)]:[];
const streamFrom=iterator=>new ReadableStream({pull(controller){const n=iterator.next();if(n.done)controller.close();else controller.enqueue(n.value);}});
function overlayStream(document,observer){
 const state=localDocumentState(document),{flies,...world}=state;
 return streamFrom((function*(){
  const head=JSON.stringify({observer:observer||null,state:world});
  yield encoder.encode(head.slice(0,-2)+'\n,"flies":[\n');
  for(const [i,f]of flies.entries())yield encoder.encode((i?',':'')+JSON.stringify(f)+'\n');
  yield encoder.encode(']}}\n');
 })());
}
const gzip=stream=>new Response(stream.pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
const unpack=buffer=>new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
function mergedState(base,document){
 const incoming=localDocumentState(document),records=new Map(incoming.flies.map(f=>[f.id,f]));
 const flies=base.flies.map(f=>records.get(f.id)||f),ids=new Set(base.flies.map(f=>f.id));
 for(const f of incoming.flies)if(!ids.has(f.id))flies.push(f);
 return {...incoming,flies,locations:base.locations};
}
export async function loadLocalHostJournal(storage,base,baseSavedAtMs=0,onStage=()=>{},{includeObserver=true}={}){
 const meta=await storage.get(META);
 if(!meta)return null;
 onStage('metadata',{overlayChunks:meta.overlayKeys?.length,deltaCount:meta.entries?.length,journalBytes:meta.journalBytes,sequence:meta.sequence});
 if(meta.version!==1||meta.worldId!==base.worldId||meta.mapVersion!==base.mapVersion)throw Error('incompatible local save journal');
 // The full base may have committed immediately before cleanup was interrupted.
 if(Number(base.simulationAgeSeconds)>Number(meta.age)||(Number(base.simulationAgeSeconds)===Number(meta.age)&&baseSavedAtMs>meta.savedAtMs))return {stale:true,meta};
 const parts=[];
 for(const key of meta.overlayKeys){const b=await storage.get(key);if(!b)throw Error('missing local save overlay');parts.push(b);}
 onStage('overlay read',{compressedBytes:parts.reduce((n,p)=>n+p.byteLength,0)});
 const overlay=await readLocalHostCheckpoint(new Blob(parts).stream().pipeThrough(new DecompressionStream('gzip')),onStage,{includeObserver,onState:includeObserver?()=>{}:cleanupPastWorld});
 onStage('overlay parsed',{actors:overlay.state.flies.length});
 if(!includeObserver)cleanupPastWorld(overlay.state);
 let document=projectLocalDocument(overlay.state),observer=overlay.observer||null,sequence=meta.overlaySequence;
 for(const entry of meta.entries){
  const packed=await storage.get(entry.key);if(!packed)throw Error('missing local save delta');
  const delta=await new Response(unpack(packed)).json();
  if(delta.baseSequence!==sequence||delta.sequence!==sequence+1)throw Error('non-contiguous local save journal');
  document=applyLocalDelta(document,delta.patch);sequence=delta.sequence;if(includeObserver)observer=delta.observer||observer;onStage('delta applied',{sequence});
 }
 if(sequence!==meta.sequence||Number(document.world.simulationAgeSeconds)!==Number(meta.age))throw Error('local save journal metadata mismatch');
 return {state:mergedState(base,document),document,observer,meta,lastWallClockMs:meta.lastWallClockMs,savedAtMs:meta.savedAtMs};
}
export async function clearLocalHostJournal(storage){
 await storage.transaction(async tx=>{const meta=await tx.get(META);for(const key of values(meta))await tx.delete(key);await tx.delete(META);});
}
export async function saveLocalHostBase(storage,document,lease,{observer=null,lastWallClockMs=Date.now(),savedAtMs=Date.now(),sequence=lease?.sequence||0,epoch=lease?.epoch||0,pendingCommands=[]}={}){
 const bytes=new Uint8Array(await gzip(overlayStream(document,observer))),generation=crypto.randomUUID();
 const overlayKeys=Array.from({length:Math.ceil(bytes.byteLength/CHUNK)},(_,i)=>`local-save:overlay:${generation}:${i}`);
 const meta={version:1,generation,worldId:document.world.worldId,mapVersion:document.world.mapVersion,epoch,
  overlayKeys,overlaySequence:sequence,entries:[],sequence,age:document.world.simulationAgeSeconds,lastWallClockMs,savedAtMs,journalBytes:0,pendingCommands};
 await storage.transaction(async tx=>{
  const old=await tx.get(META);
  for(const [i,key]of overlayKeys.entries())await tx.put(key,bytes.slice(i*CHUNK,(i+1)*CHUNK).buffer);
  await tx.put(META,meta);
  if(lease)await tx.put('localHostLease',lease);else await tx.delete('localHostLease');
  for(const key of values(old))await tx.delete(key);
 });
 return meta;
}
export async function appendLocalHostDelta(storage,document,body,lease,observer){
 const previous=await storage.get(META);
 if(!previous||previous.epoch!==body.epoch||previous.sequence!==body.baseSequence)throw Error('local save base changed');
 const entry={baseSequence:body.baseSequence,sequence:body.sequence,patch:body.patch,observer:observer||null};
 const bytes=await gzip(new Blob([JSON.stringify(entry)]).stream());
 const stateAtMs=Number.isFinite(body.stateAtMs)?Math.min(Date.now(),Math.max(Number(previous.lastWallClockMs||0),body.stateAtMs)):Date.now();
 if(previous.entries.length>=MAX_ENTRIES||previous.journalBytes+bytes.byteLength>MAX_JOURNAL_BYTES){
  return saveLocalHostBase(storage,document,lease,{observer,lastWallClockMs:stateAtMs,sequence:body.sequence,epoch:body.epoch,pendingCommands:body.releaseCommands||[]});
 }
 const key=`local-save:delta:${previous.generation}:${body.sequence}`,now=Date.now();
 const meta={...previous,sequence:body.sequence,age:document.world.simulationAgeSeconds,lastWallClockMs:stateAtMs,savedAtMs:now,
  pendingCommands:body.releaseCommands||previous.pendingCommands||[],entries:[...previous.entries,{key,sequence:body.sequence}],journalBytes:previous.journalBytes+bytes.byteLength};
 await storage.transaction(async tx=>{
  const actual=await tx.get(META);
  if(!actual||actual.generation!==previous.generation||actual.sequence!==body.baseSequence)throw Error('local save commit lost its base');
  await tx.put(key,bytes);await tx.put(META,meta);
  if(lease)await tx.put('localHostLease',lease);else await tx.delete('localHostLease');
 });
 return meta;
}

export function localHostExportStream(base,document,worldId){
 const next=mergedState(base,document),{flies,locations,...world}=next;
 return streamFrom((function*(){
  const head=JSON.stringify({exportedAt:new Date().toISOString(),worldId,state:world});
  yield encoder.encode(head.slice(0,-2)+',"flies":[');
  for(const [i,f]of flies.entries())yield encoder.encode((i?',':'')+JSON.stringify(f));
  yield encoder.encode(']}}');
 })());
}
