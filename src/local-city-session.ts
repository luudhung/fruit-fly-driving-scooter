type SessionMessage={type:string;snapshot?:unknown;message?:string;savedAge?:number;lease?:{token:string;epoch:number}};
export class LocalCitySession{
 private worker:Worker|null=null;
 private retryAt=0;
 private lease:{token:string;epoch:number}|null=null;
 private starting=false;
 private releasing=false;
 active=false;
 syncing=true;
 lastSavedAt=0;
 lastSavedGameAge=0;
 private readonly onSnapshot:(snapshot:unknown)=>void;
 private readonly api:string;
 constructor(api:string,onSnapshot:(snapshot:unknown)=>void){this.api=api;this.onSnapshot=onSnapshot;}
 private resumeLease(){
  try{const value=JSON.parse(sessionStorage.getItem('fulllife:resume:'+this.api)||'null');return typeof value?.token==='string'&&Number.isSafeInteger(value.epoch)?value:null;}catch{return null;}
 }
 private rememberLease(lease:{token:string;epoch:number}|null){
  try{const key='fulllife:resume:'+this.api;if(lease)sessionStorage.setItem(key,JSON.stringify(lease));else if(this.resumeLease()?.token===this.lease?.token)sessionStorage.removeItem(key);}catch{/* Storage may be disabled; normal lease expiry still works. */}
 }
 start(selectedId:string|null){
  if(this.active||this.starting||this.releasing||Date.now()<this.retryAt||document.hidden)return;
  if(!this.worker){
   this.worker=new Worker(new URL('../worker/local-city-host.mjs',import.meta.url),{type:'module'});
   this.worker.onmessage=({data}:{data:SessionMessage})=>{
    if(data.type==='lease'){this.lease=data.lease||null;this.rememberLease(this.lease);if(document.hidden)this.release();}
    if(data.type==='started'){this.lease=data.lease||null;this.rememberLease(this.lease);this.active=!this.releasing&&!document.hidden;this.starting=false;this.syncing=false;if(document.hidden)this.release();}
    if(data.type==='snapshot'&&this.active)this.onSnapshot(data.snapshot);
    if(data.type==='saved'){this.syncing=false;this.lastSavedAt=Date.now();this.lastSavedGameAge=Number(data.savedAge||0);}
    if(data.type==='sync-pending')this.syncing=true;
    if(['observer','fenced','unavailable','released'].includes(data.type)){
     if(data.type==='released'||data.type==='fenced')this.rememberLease(null);
     this.active=false;this.starting=false;this.releasing=false;this.lease=null;this.retryAt=Date.now()+10000;
    }
    if(data.type==='error')console.error('[local-city]',data.message);
   };
   this.worker.onerror=event=>{
    console.error('[local-city]',event.message);this.active=false;this.starting=false;this.releasing=false;
    this.worker?.terminate();this.worker=null;this.retryAt=Date.now()+30000;
   };
  }
  this.starting=true;
  this.worker.postMessage({type:'start',api:this.api,selectedId,resume:this.resumeLease()});
 }
 select(id:string|null){this.worker?.postMessage({type:'select',id});}
 release(){
  if(!this.worker||this.releasing)return;
  this.releasing=true;
  if(this.lease){
   const body=new Blob([JSON.stringify(this.lease)],{type:'text/plain'});
   try{
    if(!navigator.sendBeacon(this.api+'/api/civilization/local/leave',body))void fetch(this.api+'/api/civilization/local/leave',{method:'POST',body,keepalive:true}).catch(()=>{});
   }catch{/* The durable lease timeout still provides crash recovery. */}
  }
  this.worker.postMessage({type:'release'});this.active=false;this.starting=false;
 }
}
