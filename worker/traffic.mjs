import {ROADS,PARK,contains,isGradeSeparated,urbanGeometryRevision} from './city-map.mjs';

// One authoritative signal cycle for road physics and the observer, in real-equivalent seconds.
export function signalState(seconds,axis){
 const phase=((seconds%60)+60)%60;
 return axis==='ns'?(phase<25?'green':phase<30?'yellow':'red'):(phase>=30&&phase<55?'green':phase>=55?'yellow':'red');
}
export const INTERSECTIONS=[];
const rows=new Map(),columns=new Map(),STOP=7.4;let signature='',observedRevision=-1,observedRoadCount=-1;
const inside=(r,p)=>Math.abs(r.x-p.x)<=r.w/2+.001&&Math.abs(r.z-p.z)<=r.d/2+.001;
function refresh(){
 if(observedRevision===urbanGeometryRevision&&observedRoadCount===ROADS.length)return;observedRevision=urbanGeometryRevision;observedRoadCount=ROADS.length;
 const key=ROADS.map(r=>`${r.x},${r.z},${r.w},${r.d}`).join('|');if(key===signature)return;signature=key;
 const vertical=ROADS.filter(r=>r.d>r.w),horizontal=ROADS.filter(r=>r.w>=r.d),xs=[...new Set(vertical.map(r=>r.x))],zs=[...new Set(horizontal.map(r=>r.z))];
 INTERSECTIONS.length=0;rows.clear();columns.clear();
 for(const x of xs)for(const z of zs){const p={id:`${x},${z}`,x,z};if(contains(PARK,p,5)||isGradeSeparated(p)||!vertical.some(r=>inside(r,p))||!horizontal.some(r=>inside(r,p)))continue;
  INTERSECTIONS.push(p);if(!rows.has(z))rows.set(z,[]);rows.get(z).push(p);if(!columns.has(x))columns.set(x,[]);columns.get(x).push(p);
 }
 // Adjacent intersections can have overlapping stop lines. They form one controlled box,
 // so a vehicle that entered the first may clear the whole cluster instead of stopping inside.
 for(const [map,axis]of [[rows,'x'],[columns,'z']])for(const[coordinate,list]of map){
  list.sort((a,b)=>a[axis]-b[axis]);const clusters=[];
  for(const j of list){const last=clusters.at(-1),at=j[axis];if(last&&at-last.hi<STOP*2){last.hi=at;last.junctions.push(j);}else clusters.push({lo:at,hi:at,junctions:[j]});}
  map.set(coordinate,clusters);
 }
}
refresh();
function approachedClusters(start,end){
 refresh();const dx=end.x-start.x,dz=end.z-start.z,ns=Math.abs(dz)>=Math.abs(dx),length=Math.hypot(dx,dz);if(length<1e-8)return [];
 const transverse=ns?start.x:start.z,along=ns?start.z:start.x,dir=Math.sign(ns?dz:dx),result=[];
 for(const[coordinate,clusters]of(ns?columns:rows)){
  if(Math.abs(coordinate-transverse)>5.6)continue;
  for(const box of clusters){const first=dir>0?box.lo:box.hi,ahead=(first-along)*dir;
   if(ahead<STOP-.02||ahead-STOP>length+.02)continue;
   const j=dir>0?box.junctions[0]:box.junctions.at(-1);result.push({distance:Math.max(0,ahead-STOP),id:j.id,axis:ns?'ns':'ew',x:j.x,z:j.z,box,coordinate,ns,dir,along});
  }
 }
 return result.sort((a,b)=>a.distance-b.distance);
}
/** Clip at the first red stop line. Cars already inside a controlled box may clear it. */
export function signalBarrier(start,end,seconds){
 if(start.emergency===true)return null;
 const match=approachedClusters(start,end).find(b=>signalState(seconds,b.axis)!=='green');if(!match)return null;
 const {distance,id,axis,x,z}=match;return {distance,id,axis,x,z};
}
function heading(other){
 let dx=Number(other.targetX)-other.x,dz=Number(other.targetZ)-other.z;
 if(!Number.isFinite(dx)||!Number.isFinite(dz)||Math.hypot(dx,dz)<.05){
  const points=other.routeWaypoints?.slice(other.routeIndex||0)||[];const next=points.find(p=>Math.hypot(p.x-other.x,p.z-other.z)>.1);
  dx=next?next.x-other.x:Number(other.vx||0);dz=next?next.z-other.z:Number(other.vz||0);
 }
 const length=Math.hypot(dx,dz);return length>.01?{x:dx/length,z:dz/length}:null;
}
/** Immutable nearby snapshot, rebuilt once per simulation sample. */
export function createVehicleIndex(drivers){
 const bins=new Map(),cell=20;
 for(const f of drivers){if(!f.alive||!f.traveling||!['car','scooter'].includes(f.transitMode))continue;
  const sample={id:f.id,x:f.x,z:f.z,y:Number(f.y??1.1),heading:heading(f),emergency:f.emergency===true};
  const key=`${Math.floor(f.x/cell)},${Math.floor(f.z/cell)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(sample);
 }
 function nearby(minX,maxX,minZ,maxZ){const found=[];
  for(let x=Math.floor(minX/cell);x<=Math.floor(maxX/cell);x++)for(let z=Math.floor(minZ/cell);z<=Math.floor(maxZ/cell);z++)found.push(...(bins.get(`${x},${z}`)||[]));return found;
 }
 return (f,end)=>{
  const dx=end.x-f.x,dz=end.z-f.z,len=Math.hypot(dx,dz);if(len<1e-8)return len;
  const ux=dx/len,uz=dz/len,fy=Number(f.y??1.1);let allowed=len;
  for(const other of nearby(Math.min(f.x,end.x)-6,Math.max(f.x,end.x)+6,Math.min(f.z,end.z)-6,Math.max(f.z,end.z)+6)){
   if(other.id===f.id||Math.abs(other.y-fy)>2)continue;
   const ox=other.x-f.x,oz=other.z-f.z,along=ox*ux+oz*uz,lateral=Math.abs(ox*uz-oz*ux),h=other.heading;
   // A legacy checkpoint may contain two co-located cars. Release one deterministically,
   // then let normal headway create a gap; no resident or vehicle is repositioned.
   if(Math.hypot(ox,oz)<.25&&h&&h.x*ux+h.z*uz>.7){
    if(String(other.id).localeCompare(String(f.id))<0)allowed=0;
    continue;
   }
   // Crossing and opposite-direction cars do not become false same-lane leaders.
   if(along<=.05||lateral>2.2||!h||h.x*ux+h.z*uz<=.7)continue;
   // Two shallow merging paths can each project the other car ahead. A strict
   // queue rule then stops both forever; give one deterministic merge priority.
   if(along<5&&ox*h.x+oz*h.z<-.05&&String(other.id).localeCompare(String(f.id))>0)continue;
   allowed=Math.min(allowed,Math.max(0,along-5));
  }
  // Do not enter a junction until its box and downstream receiving space are clear.
  // Existing occupants skip this guard and can drain even when the signal changes.
  for(const entry of approachedClusters(f,{x:f.x+ux*allowed,z:f.z+uz*allowed})){
   const {box,coordinate,ns,dir}=entry,minX=ns?coordinate-6.3:box.lo-6.3,maxX=ns?coordinate+6.3:box.hi+6.3,minZ=ns?box.lo-6.3:coordinate-6.3,maxZ=ns?box.hi+6.3:coordinate+6.3;
   const occupants=nearby(minX-6,maxX+6,minZ-6,maxZ+6);
   const blocked=occupants.some(other=>{
    if(other.id===f.id||Math.abs(other.y-fy)>2)return false;
    const inBox=other.x>minX&&other.x<maxX&&other.z>minZ&&other.z<maxZ;
    // Opposing traffic occupies its own lane and must drain simultaneously.
    // Treating it as a blocked receiving box creates circular queues between junctions.
    const h=other.heading;if(inBox){
     if(!h)return true;
     const alignment=h.x*ux+h.z*uz,dx=other.x-f.x,dz=other.z-f.z;
     if(alignment>.7&&String(other.id).localeCompare(String(f.id))>0&&(Math.hypot(dx,dz)<.25||dx*ux+dz*uz<5&&dx*h.x+dz*h.z<-.05))return false;
     // Parallel neighboring lanes and a vehicle behind this approach cannot block its entry.
     if(Math.abs(alignment)>.7)return alignment>.7&&Math.abs(dx*uz-dz*ux)<2.2&&dx*ux+dz*uz>.05;
     return true;
    }
    const along=(ns?other.z:other.x),exit=dir>0?box.hi:box.lo,after=(along-exit)*dir,lateral=Math.abs((ns?other.x:other.z)-coordinate);
    return h&&h.x*ux+h.z*uz>.7&&after>=0&&after<STOP+5&&lateral<2.2;
   });
   if(blocked){allowed=Math.min(allowed,entry.distance);break;}
  }
  return allowed;
 };
}
