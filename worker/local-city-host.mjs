import {restoreState,getRawState,getState,tick,setNeuralSyncEnabled,countries} from './civilization-engine.mjs';
import {LOCAL_HOST_HEARTBEAT_MS,LOCAL_HOST_CHECKPOINT_MS,localHostCheckpointStream} from './local-host-state.mjs';
setNeuralSyncEnabled(false);
let api='',session=null,running=false,busy=false,selectedId=null,checkpointBusy=false,controlBusy=false,lastSave=0,lastTick=0;
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
  const response=await fetch(api+path,{method:'POST',cache:'no-store',headers:{'content-type':compressed?'application/x-city-checkpoint+gzip':'application/json'},body:compressed?body:JSON.stringify(body),signal:controller.signal});
  if(path.endsWith('/claim')&&response.ok){
   const token=response.headers.get('x-city-host-token'),epoch=Number(response.headers.get('x-city-host-epoch'));
   if(token&&Number.isSafeInteger(epoch))send('lease',{lease:{token,epoch}});
  }
  if(response.status===409){session=null;running=false;send('fenced');throw Error('local session transferred');}
  if(!response.ok)throw Error('session HTTP '+response.status);
  return await response.json();
 }finally{clearTimeout(timeout);}
}
async function save(release=false){
 if(!session||checkpointBusy)return false;
 checkpointBusy=true;
 try{
  const raw=getRawState(),sequence=session.sequence+1;
  const stream=localHostCheckpointStream(raw,{token:session.token,epoch:session.epoch,sequence,release,acknowledgedCommands:[...processedCommands]});
  const packed=await new Response(stream.pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const receipt=await request('/api/civilization/local/checkpoint',packed,true);
  applyCommands(receipt.commands);
  if(session){session.sequence=receipt.sequence;lastSave=Date.now();}
  send('saved',{savedAt:lastSave});
  if(release){running=false;session=null;}
  return true;
 }catch(error){console.warn('[local-city checkpoint]',String(error));send('sync-pending',{message:String(error)});return false;}
 finally{checkpointBusy=false;}
}
async function start(){
 if(controlBusy||session)return;
 controlBusy=true;
 try{
  const result=await request('/api/civilization/local/claim',{clientId:crypto.randomUUID(),clientProtocol:2});
  if(!result.granted){send('observer');return;}
  session=result.lease;processedCommands.clear();
  restoreState(result.state);
  lastTick=performance.now();lastSave=Date.now();running=true;
  send('started',{lease:{token:session.token,epoch:session.epoch}});publish();
 }catch(error){
  if(session)void request('/api/civilization/local/leave',{token:session.token,epoch:session.epoch}).catch(()=>{});
  session=null;running=false;send('unavailable',{message:String(error)});
 }
 finally{controlBusy=false;}
}
function publish(){
 const snapshot=getState({observer:true,compactObserver:true,selectedId});
 snapshot.runtime={platform:'browser-worker',sampledCatchup:{snapshotAgeSeconds:0}};
 send('snapshot',{snapshot});
}
async function advance(){
 if(!running||busy)return;
 busy=true;
 try{
  const now=performance.now(),elapsed=Math.min(10,Math.max(0,(now-lastTick)/1000));
  if(elapsed<.5)return;
  lastTick=now;
  await tick({gameSeconds:elapsed*Number(getRawState().timeScale||120),syncBrain:false,serialized:true});
  getRawState().updatedAt=new Date().toISOString();
  publish();
 }catch(error){send('error',{message:String(error)});}
 finally{busy=false;}
}
async function heartbeat(){
 if(!session||!running||controlBusy)return;
 controlBusy=true;
 try{
  const result=await request('/api/civilization/local/heartbeat',{token:session.token,epoch:session.epoch});
  applyCommands(result.commands);
  send('contact');
 }catch(error){send('sync-pending',{message:String(error)});}
 finally{controlBusy=false;}
 if(running&&Date.now()-lastSave>=LOCAL_HOST_CHECKPOINT_MS)void save();
}
self.onmessage=async({data})=>{
 if(data.type==='start'){api=data.api;selectedId=data.selectedId||null;await start();}
 if(data.type==='select'){selectedId=data.id;}
 if(data.type==='release'){
  running=false;
  while(busy||checkpointBusy)await new Promise(r=>setTimeout(r,20));
  const owner=session,complete=await save(true);
  if(!complete&&owner&&session===owner){
   await request('/api/civilization/local/leave',{token:owner.token,epoch:owner.epoch}).catch(()=>{});
   session=null;
  }
  send('released');
 }
 if(data.type==='snapshot')publish();
};
setInterval(()=>{void advance();},750);
setInterval(()=>{void heartbeat();},LOCAL_HOST_HEARTBEAT_MS);
