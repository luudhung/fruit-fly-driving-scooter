type CacheOptions<T>={write:(value:T)=>void;canWrite:()=>boolean;schedule:(job:()=>void)=>void;now?:()=>number;intervalMs?:number};
/** Coalesce observer recovery snapshots; never serialize storage data during active driving. */
export class IdleSnapshotCache<T>{
 private pending:T|undefined;private scheduled=false;private lastAttempt=-Infinity;
 private options:CacheOptions<T>;
 constructor(options:CacheOptions<T>){this.options=options;}
 offer(value:T){
  this.pending=value;
  const o=this.options,now=o.now?.()??performance.now(),interval=o.intervalMs??30000;
  if(this.scheduled||!o.canWrite()||now-this.lastAttempt<interval)return;
  this.scheduled=true;
  o.schedule(()=>{
   this.scheduled=false;
   const at=o.now?.()??performance.now();
   if(!o.canWrite()||at-this.lastAttempt<interval||this.pending===undefined)return;
   const latest=this.pending;this.lastAttempt=at;
   try{o.write(latest);this.pending=undefined;}catch{/* Keep the latest snapshot and retry at the next storage interval. */}
  });
 }
}
