type SessionMessage={type:string;snapshot?:unknown;message?:string;lease?:{token:string;epoch:number}};
export class LocalCitySession{
 private worker:Worker|null=null;
 private retryAt=0;
 private lease:{token:string;epoch:number}|null=null;
 private starting=false;
 active=false;
 syncing=true;
 lastSavedAt=0;
 private readonly onSnapshot:(snapshot:unknown)=>void;
 private readonly api:string;
 constructor(api:string,onSnapshot:(snapshot:unknown)=>void){this.api=api;this.onSnapshot=onSnapshot;}
 start(selectedId:string|null){
  if(this.active||this.starting||Date.now()<this.retryAt||document.hidden)return;
  if(!this.worker){
   this.worker=new Worker(new URL('../worker/local-city-host.mjs',import.meta.url),{type:'module'});
   this.worker.onmessage=({data}:{data:SessionMessage})=>{
    if(data.type==='started'){this.lease=data.lease||null;this.active=true;this.starting=false;this.syncing=false;if(document.hidden)this.release();}
    if(data.type==='snapshot'&&this.active)this.onSnapshot(data.snapshot);
    if(data.type==='contact'||data.type==='saved'){this.syncing=false;if(data.type==='saved')this.lastSavedAt=Date.now();}
    if(data.type==='sync-pending')this.syncing=true;
    if(['observer','fenced','unavailable','released'].includes(data.type)){
     this.active=false;this.starting=false;this.lease=null;this.retryAt=Date.now()+10000;
    }
    if(data.type==='error')console.error('[local-city]',data.message);
   };
   this.worker.onerror=event=>{
    console.error('[local-city]',event.message);this.active=false;this.starting=false;
    this.worker?.terminate();this.worker=null;this.retryAt=Date.now()+30000;
   };
  }
  this.starting=true;
  this.worker.postMessage({type:'start',api:this.api,selectedId});
 }
 select(id:string|null){this.worker?.postMessage({type:'select',id});}
 release(){
  if(!this.worker)return;
  if(this.lease){
   const body=new Blob([JSON.stringify(this.lease)],{type:'text/plain'});
   navigator.sendBeacon(this.api+'/api/civilization/local/leave',body);
  }
  this.worker.postMessage({type:'release'});this.active=false;this.starting=false;
 }
}
