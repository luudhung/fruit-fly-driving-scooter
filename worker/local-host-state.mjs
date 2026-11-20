export const LOCAL_HOST_TTL_MS=120000;
export const LOCAL_HOST_HEARTBEAT_MS=5000;
export const LOCAL_HOST_CHECKPOINT_MS=5000;

/** Archived residents remain on the server. The browser receives every living
 * resident and the current simulation state required for deterministic ticks. */
export function localHostSnapshot(state){
 const projected={...state,flies:state.flies.filter(f=>f.alive),locations:undefined};
 return projected;
}
export function mergeLocalHostCheckpoint(current,incoming,lease,now){
 if(!incoming||!Array.isArray(incoming.flies)||incoming.flies.length===0||incoming.worldId!==current.worldId||incoming.mapVersion!==current.mapVersion)throw Error('incompatible local world');
 const age=Number(incoming.simulationAgeSeconds),base=Number(current.simulationAgeSeconds);
 const maximum=lease.baseAge+Math.max(1,(now-lease.startedAt)/1000+30)*Math.max(1,Number(current.timeScale||120));
 if(!Number.isFinite(age)||age<base||age>maximum)throw Error('local clock outside session bounds');
 const records=new Map(incoming.flies.map(f=>[f.id,f]));
 if(records.size!==incoming.flies.length||incoming.flies.some(f=>typeof f.id!=='string'||!Number.isFinite(f.x)||!Number.isFinite(f.z)||!Number.isFinite(f.health)))throw Error('invalid local residents');
 if(current.flies.some(f=>f.alive&&!records.has(f.id)))throw Error('missing living resident');
 const prior=new Map(current.flies.map(f=>[f.id,f]));
 for(const f of incoming.flies){
  const old=prior.get(f.id);
  if(old&&old.brain?.id!==f.brain?.id)throw Error('resident brain identity changed');
 }
 const flies=current.flies.map(f=>records.get(f.id)||f);
 for(const f of incoming.flies)if(!prior.has(f.id))flies.push(f);
 return {...incoming,flies,locations:current.locations};
}

const encoder=new TextEncoder();
function jsonLinesStream(lines){
 const iterator=lines[Symbol.iterator]();
 return new ReadableStream({pull(controller){const next=iterator.next();if(next.done)controller.close();else controller.enqueue(encoder.encode(next.value));}});
}
/** Encode one resident at a time; never allocate a second complete world JSON
 * string in the 128MB server isolate alongside its historical archive. */
export function localHostClaimStream(state,lease){
 const {flies,locations,...world}=state;
 return jsonLinesStream((function*(){
  const head=JSON.stringify({granted:true,lease,state:world});
  yield head.slice(0,-2)+'\n,"flies":[\n';
  let count=0;
  for(const f of flies)if(f.alive)yield (count++?',':'')+JSON.stringify(f)+'\n';
  yield ']}}\n';
 })());
}
/** JSON framing remains valid ordinary JSON. Strings capture a single atomic
 * worker step before asynchronous compression lets the next tick proceed. */
export function localHostCheckpointStream(state,metadata){
 const {flies,locations,...world}=state;
 const head=JSON.stringify({...metadata,state:world});
 const lines=[head.slice(0,-2)+'\n',',"flies":[\n',...flies.map((f,i)=>(i?',':'')+JSON.stringify(f)+'\n'),']}}\n'];
 return jsonLinesStream(lines);
}
export async function readLocalHostCheckpoint(stream,onProgress=()=>{}){
 let envelope,opened=false,closed=false,buffer='';
 for await(const chunk of stream.pipeThrough(new TextDecoderStream())){
  buffer+=chunk;
  let end;
  while((end=buffer.indexOf('\n'))!==-1){
   const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
   if(closed)throw Error('trailing checkpoint data');
   if(!envelope){envelope=JSON.parse(line+'}}');envelope.state.flies=[];onProgress('header',{headerBytes:line.length});}
   else if(!opened){if(line!==',"flies":[')throw Error('invalid resident frame');opened=true;}
   else if(line===']}}')closed=true;
   else {envelope.state.flies.push(JSON.parse(envelope.state.flies.length?line.slice(1):line));if(envelope.state.flies.length%100===0)onProgress('actors',{actors:envelope.state.flies.length});}
  }
 }
 if(!closed||buffer)throw Error('incomplete local checkpoint');
 return envelope;
}
