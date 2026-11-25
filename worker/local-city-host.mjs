import {restoreState,getRawState,getState,tick,setNeuralSyncEnabled,countries} from './civilization-engine.mjs';
import {LOCAL_HOST_HEARTBEAT_MS,LOCAL_HOST_CHECKPOINT_MS} from './local-host-state.mjs';
import {projectLocalDocument,diffLocalDocument} from './local-host-delta.mjs';
setNeuralSyncEnabled(false);
let api='',session=null,running=false,busy=false,selectedId=null,checkpointBusy=false,controlBusy=false,lastSave=0,lastTick=0;
let baseline=null,pendingCheckpoint=null,latestPublished=null;
// A heartbeat proves network reachability, not that the city is being saved.
// Let a broken writer's lease expire so the cloud can resume its last good step.
const SAVE_RENEWAL_GRACE_MS=Math.max(60000,LOCAL_HOST_CHECKPOINT_MS*12);
const CHECKPOINT_COMPRESSION_TIMEOUT_MS=55000;
const send=(type,extra={})=>postMessage({type,...extra});
const processedCommands=new Set();
function applyCommands(commands=[]){
 for(const command of commands){
  if(processedCommands.has(command.requestId))continue;
  const receipt=countries.requestConflict(command);
  if(receipt.accepted)processedCommands.add(command.requestId);
 }
 while(processedCommands.size>128)processedCommands.delete(processedCommands.values().next().value);
}
async function request(path,body,compressed=false){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),55000);
 try{
  const response=await fetch(api+path,{method:'POST',cache:'no-store',headers:{'content-type':compressed?'application/x-city-delta+gzip':'application/json'},body:compressed?body:JSON.stringify(body),signal:controller.signal});
  if(path.endsWith('/claim')&&response.ok){
   const token=response.headers.get('x-city-host-token'),epoch=Number(response.headers.get('x-city-host-epoch'));
   if(token&&Number.isSafeInteger(epoch))send('lease',{lease:{token,epoch}});
  }
  if(response.status===409){session=null;running=false;baseline=null;pendingCheckpoint=null;send('fenced');throw Error('local session transferred');}
  if(!response.ok)throw Error('session HTTP '+response.status);
  return await response.json();
 }finally{clearTimeout(timeout);}
}
async function packCheckpoint(payload){
 const controller=new AbortController();let timeout;
 try{
  const stream=new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('gzip'),{signal:controller.signal});
  // Race the whole preparation, not just fetch: an unresponsive compression
  // stream must not leave checkpointBusy locked while heartbeats stay healthy.
  return await Promise.race([new Response(stream).arrayBuffer(),new Promise((_,reject)=>{
   timeout=setTimeout(()=>{const error=Error('checkpoint compression timed out');controller.abort(error);reject(error);},CHECKPOINT_COMPRESSION_TIMEOUT_MS);
  })]);
 }finally{clearTimeout(timeout);}
}
async function save(release=false){
 if(!session||!baseline||checkpointBusy)return false;
 checkpointBusy=true;
 const owner=session,retrying=Boolean(pendingCheckpoint);let sent=0;
 try{
  do{
   if(!pendingCheckpoint){
    const document=structuredClone(projectLocalDocument(getRawState()));
    const sequence=owner.sequence+1;
    const payload={token:owner.token,epoch:owner.epoch,sequence,baseSequence:owner.sequence,release,observer:latestPublished,acknowledgedCommands:[...processedCommands],patch:diffLocalDocument(baseline,document)};
    const packed=await packCheckpoint(payload);
    pendingCheckpoint={document,sequence,packed,release};
   }
   const packet=pendingCheckpoint;
   const receipt=await request('/api/civilization/local/checkpoint',packet.packed,true);
   sent++;
   if(session!==owner)return false;
   if(receipt.sequence!==packet.sequence)throw Error('checkpoint sequence was not acknowledged');
   baseline=packet.document;owner.sequence=receipt.sequence;pendingCheckpoint=null;lastSave=Date.now();
   applyCommands(receipt.commands);
   send('saved',{savedAt:lastSave,savedAge:baseline.world.simulationAgeSeconds});
   if(packet.release){running=false;session=null;baseline=null;return true;}
   // A lost regular-save response must first be retried verbatim; closing then
   // sends a separate final delta from that acknowledged base to the latest step.
   // A recovered receipt may describe an older step. Send the latest delta
   // immediately instead of waiting another five-second timer after the retry.
   if(!release&&(!retrying||sent>=2||baseline.world.simulationAgeSeconds>=getRawState().simulationAgeSeconds))return true;
  }while(session===owner);
  return false;
 }catch(error){console.warn('[local-city checkpoint]',String(error));send('sync-pending',{message:String(error)});return false;}
 finally{checkpointBusy=false;}
}
async function start(resume=null){
 if(controlBusy||session)return;
 controlBusy=true;
 try{
  const result=await request('/api/civilization/local/claim',{clientId:crypto.randomUUID(),clientProtocol:3,resume});
  if(!result.granted){send('observer');return;}
  session=result.lease;processedCommands.clear();pendingCheckpoint=null;
  // Capture the agreed server base before restoration adds local runtime data.
  baseline=structuredClone(projectLocalDocument(result.state));
  restoreState(result.state);
  lastTick=performance.now();lastSave=Date.now();running=true;
  send('started',{lease:{token:session.token,epoch:session.epoch}});publish();
 }catch(error){
  if(session)void request('/api/civilization/local/leave',{token:session.token,epoch:session.epoch}).catch(()=>{});
  session=null;running=false;baseline=null;pendingCheckpoint=null;send('unavailable',{message:String(error)});
 }
 finally{controlBusy=false;}
}
function publish(){
 const snapshot=getState({observer:true,compactObserver:true,selectedId});
 snapshot.runtime={platform:'browser-worker',sampledCatchup:{snapshotAgeSeconds:0}};
 latestPublished=snapshot;
 send('snapshot',{snapshot});
}
async function advance(){
 if(!running||busy)return;
 busy=true;
 try{
  const now=performance.now(),elapsed=Math.min(10,Math.max(0,(now-lastTick)/1000));
  if(elapsed<.5)return;
  lastTick=now;
  await tick({gameSeconds:elapsed*Number(getRawState().timeScale||120),syncBrain:false,serialized:true,perceptionBudget:256});
  getRawState().updatedAt=new Date().toISOString();publish();
 }catch(error){send('error',{message:String(error)});}
 finally{busy=false;}
}
async function heartbeat(){
 if(!session||!running||controlBusy)return;
 if(Date.now()-lastSave>SAVE_RENEWAL_GRACE_MS){send('sync-pending',{message:'waiting for a durable checkpoint before renewing simulation ownership'});return;}
 controlBusy=true;
 try{
  const result=await request('/api/civilization/local/heartbeat',{token:session.token,epoch:session.epoch});
  applyCommands(result.commands);send('contact');
 }catch(error){send('sync-pending',{message:String(error)});}
 finally{controlBusy=false;}
}
self.onmessage=async({data})=>{
 if(data.type==='start'){api=data.api;selectedId=data.selectedId||null;await start(data.resume);}
 if(data.type==='select'){selectedId=data.id;}
 if(data.type==='release'){
  running=false;
  while(busy||checkpointBusy)await new Promise(r=>setTimeout(r,20));
  const owner=session,complete=await save(true);
  if(!complete&&owner&&session===owner){
   await request('/api/civilization/local/leave',{token:owner.token,epoch:owner.epoch}).catch(()=>{});
   session=null;baseline=null;pendingCheckpoint=null;
  }
  send('released',{saved:complete});
 }
 if(data.type==='snapshot')publish();
};
setInterval(()=>{void advance();},750);
setInterval(()=>{void heartbeat();},LOCAL_HOST_HEARTBEAT_MS);
// This cadence is real wall time, independent of network heartbeat latency.
setInterval(()=>{if(running)void save();},LOCAL_HOST_CHECKPOINT_MS);
