import {AVENUES,STREETS,ROADS,PARK,contains} from './city-map.mjs';

// One authoritative signal cycle for road physics and the observer, in real-equivalent seconds.
export function signalState(seconds,axis){
 const phase=((seconds%60)+60)%60;
 return axis==='ns'?(phase<25?'green':phase<30?'yellow':'red'):(phase>=30&&phase<55?'green':phase>=55?'yellow':'red');
}
export const INTERSECTIONS=AVENUES.flatMap(x=>STREETS.map(z=>({id:`${x},${z}`,x,z}))).filter(p=>
 !contains(PARK,p,5)&&ROADS.some(r=>r.d>r.w&&contains(r,p))&&ROADS.some(r=>r.w>r.d&&contains(r,p)));
const rows=new Map(),columns=new Map();
for(const j of INTERSECTIONS){if(!rows.has(j.z))rows.set(j.z,[]);rows.get(j.z).push(j);if(!columns.has(j.x))columns.set(j.x,[]);columns.get(j.x).push(j);}
const STOP=7.4;
/** Clip a whole motion segment at the first closed stop line. Already-entered cars may clear it. */
export function signalBarrier(start,end,seconds){
 const dx=end.x-start.x,dz=end.z-start.z,ns=Math.abs(dz)>=Math.abs(dx),length=Math.hypot(dx,dz);
 if(length<1e-8)return null;
 const axis=ns?'ns':'ew';if(signalState(seconds,axis)==='green')return null;
 const transverse=ns?start.x:start.z,along=ns?start.z:start.x,dir=Math.sign(ns?dz:dx);
 let best=null;
 for(const [coordinate,junctions]of (ns?columns:rows)){
  if(Math.abs(coordinate-transverse)>5.6)continue;
  for(const j of junctions){
   const ahead=((ns?j.z:j.x)-along)*dir;
   if(ahead<STOP-.02||ahead-STOP>length+.02)continue;
   const distance=Math.max(0,ahead-STOP);
   if(!best||distance<best.distance)best={distance,id:j.id,axis,x:j.x,z:j.z};
  }
 }
 return best;
}

/** Nearby-only headway checks, rebuilt once per simulation sample. */
export function createVehicleIndex(drivers){
 const bins=new Map(),cell=20;
 for(const f of drivers){if(!f.alive||!f.traveling||!['car','scooter'].includes(f.transitMode))continue;
  const key=`${Math.floor(f.x/cell)},${Math.floor(f.z/cell)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(f);
 }
 return (f,end)=>{
  const dx=end.x-f.x,dz=end.z-f.z,len=Math.hypot(dx,dz);if(len<1e-8)return len;
  const ux=dx/len,uz=dz/len;let allowed=len;
  for(let x=Math.floor((Math.min(f.x,end.x)-6)/cell);x<=Math.floor((Math.max(f.x,end.x)+6)/cell);x++)for(let z=Math.floor((Math.min(f.z,end.z)-6)/cell);z<=Math.floor((Math.max(f.z,end.z)+6)/cell);z++)for(const other of bins.get(`${x},${z}`)||[]){
   if(other.id===f.id)continue;
   const ox=other.x-f.x,oz=other.z-f.z,along=ox*ux+oz*uz,lateral=Math.abs(ox*uz-oz*ux);
   const hx=other.targetX-other.x,hz=other.targetZ-other.z;
   if(along<=.05||lateral>2.4||hx*ux+hz*uz<0)continue;
   allowed=Math.min(allowed,Math.max(0,along-5));
  }
  return allowed;
 };
}
