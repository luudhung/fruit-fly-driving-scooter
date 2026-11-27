import {ROADS,PARK,contains,isGradeSeparated,urbanGeometryRevision} from './city-map.mjs';
import {motorwaySegmentAt} from './motorway.mjs';
import {countryAt,COUNTRY_IDS} from './country-map.mjs';

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
 for(const x of xs)for(const z of zs){const p={id:`${x},${z}`,x,z};if(countryAt(p)===COUNTRY_IDS.hawaii||contains(PARK,p,5)||isGradeSeparated(p)||motorwaySegmentAt(p)||!vertical.some(r=>r.x===x&&inside(r,p))||!horizontal.some(r=>r.z===z&&inside(r,p)))continue;
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
 if(Number.isFinite(other.vehicleHeading))return{x:Math.sin(other.vehicleHeading),z:Math.cos(other.vehicleHeading)};
 if(Number(other.vehicleLength)>4.5&&Number.isFinite(other.heading))return{x:Math.sin(other.heading),z:Math.cos(other.heading)};
 let dx=Number(other.targetX)-other.x,dz=Number(other.targetZ)-other.z;
 if(!Number.isFinite(dx)||!Number.isFinite(dz)||Math.hypot(dx,dz)<.05){
  const points=other.routeWaypoints?.slice(other.routeIndex||0)||[];const next=points.find(p=>Math.hypot(p.x-other.x,p.z-other.z)>.1);
  dx=next?next.x-other.x:Number(other.vx||0);dz=next?next.z-other.z:Number(other.vz||0);
 }
 const length=Math.hypot(dx,dz);return length>.01?{x:dx/length,z:dz/length}:null;
}
/** Continuous rectangle sweep: crossing traffic, stopped cars and curb parking
 * are solids too. No physics world or per-frame all-pairs scan is needed. */
function bodyContact(f,other,ux,uz,length){
 const h=heading(f)||{x:ux,z:uz},q=other.heading||{x:Math.sin(other.angle||0),z:Math.cos(other.angle||0)};
 const half=Math.max(2,Math.min(12,Number(f.vehicleLength)||4))/2,wide=Number(f.vehicleWidth||1.8)/2;
 const dx=other.x-f.x,dz=other.z-f.z,axes=[h,{x:h.z,z:-h.x},q,{x:q.z,z:-q.x}];
 let enter=-Infinity,exit=Infinity,overlapping=true;
 for(const axis of axes){
  const radius=half*Math.abs(axis.x*h.x+axis.z*h.z)+wide*Math.abs(axis.x*h.z-axis.z*h.x)+other.length/2*Math.abs(axis.x*q.x+axis.z*q.z)+other.width/2*Math.abs(axis.x*q.z-axis.z*q.x)+.04;
  const at=dx*axis.x+dz*axis.z,velocity=ux*axis.x+uz*axis.z;
  if(Math.abs(at)>=radius-.001)overlapping=false;
  if(Math.abs(velocity)<1e-9){if(Math.abs(at)>radius)return null;continue;}
  const a=(at-radius)/velocity,b=(at+radius)/velocity;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
  if(enter>exit)return null;
 }
 if(exit<0||enter>length)return null;
 if(overlapping){
  // Old snapshots can already overlap. Let one car leave instead of preserving
  // the corrupt stack forever; this is migration, not a newly recorded crash.
  // Towed guests can also begin shoulder assistance side by side less than one
  // body width apart. Release one owned walker from that existing overlap.
  if(f.roadsideRecovery&&other.pedestrian&&String(f.id).localeCompare(String(other.id))<0)return null;
  if(other.parked&&dx*ux+dz*uz<=.001||dx*ux+dz*uz<-.01||String(f.id).localeCompare(String(other.id))<0&&(Math.hypot(dx,dz)<.25||q.x*ux+q.z*uz>.7&&dx*q.x+dz*q.z<-.01))return null;
  return {distance:0,legacy:true};
 }
 return {distance:Math.max(0,enter-.015),legacy:false};
}
/** Nearby spatial snapshot, rebuilt once per simulation sample. */
export function createVehicleIndex(drivers,onCollision){
 const bins=new Map(),cell=20;
 const insert=sample=>{const key=`${Math.floor(sample.x/cell)},${Math.floor(sample.z/cell)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(sample);};
 for(const f of drivers){
  if(!f.alive||f.onPlane||f.onTrain||f.onFireEngine||f.onAmbulance||f.taxiPassenger)continue;
  // An escorted roadside pedestrian is a real body too. Their parked car keeps
  // its own curb collider; do not resurrect the abandoned driving trajectory.
  if(f.roadsideRecovery&&f.traveling&&f.transitMode==='walk')insert({id:f.id+':roadside',actor:f,x:f.x,z:f.z,y:Number(f.y??1.1),heading:heading(f),angle:0,length:.7,width:.65,pedestrian:true,parked:false});
  const driving=f.traveling&&['car','scooter'].includes(f.transitMode),parked=!driving&&f.parkedCar&&(String(f.vehicle||'').includes('car')||f.rentalCar);
  if(!driving&&!parked)continue;const p=parked?f.parkedCar:f;
  const sample={id:f.id,actor:f,x:p.x,z:p.z,y:Number(parked?p.y??1.1:f.y??1.1),heading:driving?heading(f):null,angle:parked?Number(p.heading||0):Number(f.heading||0),length:Math.max(2,Math.min(12,Number(f.vehicleLength)||4)),width:Number(f.vehicleWidth||1.8),emergency:f.emergency===true,parked:Boolean(parked)};
  insert(sample);
 }
 function nearby(minX,maxX,minZ,maxZ){const found=[];
  for(let x=Math.floor(minX/cell);x<=Math.floor(maxX/cell);x++)for(let z=Math.floor(minZ/cell);z<=Math.floor(maxZ/cell);z++)found.push(...(bins.get(`${x},${z}`)||[]));return found;
 }
 return (f,end)=>{
  const dx=end.x-f.x,dz=end.z-f.z,len=Math.hypot(dx,dz);if(len<1e-8)return len;
  const ux=dx/len,uz=dz/len,fy=Number(f.y??1.1);let allowed=len,contact=null;
  for(const other of nearby(Math.min(f.x,end.x)-9,Math.max(f.x,end.x)+9,Math.min(f.z,end.z)-9,Math.max(f.z,end.z)+9)){
   if(other.id===f.id||Math.abs(other.y-fy)>2)continue;
   const hit=bodyContact(f,other,ux,uz,len);
   if(hit&&hit.distance<allowed){allowed=hit.distance;contact={...hit,other};}
   const ox=other.x-f.x,oz=other.z-f.z,along=ox*ux+oz*uz,lateral=Math.abs(ox*uz-oz*ux),h=other.heading;
   // A legacy checkpoint may contain two co-located cars. Release one deterministically,
   // then let normal headway create a gap; no resident or vehicle is repositioned.
   if(Math.hypot(ox,oz)<.25&&h&&h.x*ux+h.z*uz>.7){
    if(String(other.id).localeCompare(String(f.id))<0)allowed=0;
    continue;
   }
   // Crossing and opposite-direction cars do not become false same-lane leaders.
   if(along<=.05||lateral>1.8||!h||h.x*ux+h.z*uz<=.7)continue;
   // Two shallow merging paths can each project the other car ahead. A strict
   // queue rule then stops both forever; give one deterministic merge priority.
   const gap=Math.max(5,(Math.max(2,Math.min(12,Number(f.vehicleLength)||4))+other.length)/2+1);
   if(along<gap&&ox*h.x+oz*h.z<-.05&&String(other.id).localeCompare(String(f.id))>0)continue;
   allowed=Math.min(allowed,Math.max(0,along-gap));
  }
  // Slip-road traffic yields at the edge. Established motorway traffic keeps
  // moving, and a vehicle already inside the merge box can clear it.
  const entering=motorwaySegmentAt(end);
  if(entering&&!motorwaySegmentAt(f)){
   const horizontal=entering.w>entering.d;
   const waiting=nearby(end.x-42,end.x+42,end.z-42,end.z+42).some(other=>{
    if(other.id===f.id||!motorwaySegmentAt(other,horizontal?'x':'z')||!other.heading||Math.abs(other.y-fy)>2)return false;
    const along=horizontal?other.heading.x:other.heading.z;
    if(Math.abs(along)<.85)return false;
    // Only lanes actually crossed by this merge have priority. The opposite
    // carriageway (and a stopped queue on it) cannot close every slip road.
    const cross=horizontal?other.z:other.x,lo=Math.min(horizontal?f.z:f.x,horizontal?end.z:end.x),hi=Math.max(horizontal?f.z:f.x,horizontal?end.z:end.x);
    if(cross<lo-other.width/2-1||cross>hi+other.width/2+1)return false;
    const speed=Math.hypot(Number(other.actor.vx||0),Number(other.actor.vz||0));
    if(speed<.1)return false; // physical bodies still clip through bodyContact
    const distance=((horizontal?end.x:end.z)-(horizontal?other.x:other.z))*Math.sign(along);
    return distance>=-other.length&&distance<=Math.max(8,speed*2.5);
   });
   if(waiting){
    let lo=0,hi=allowed;for(let i=0;i<12;i++){const mid=(lo+hi)/2;if(motorwaySegmentAt({x:f.x+ux*mid,z:f.z+uz*mid}))hi=mid;else lo=mid;}
    allowed=Math.min(allowed,Math.max(0,lo-.7));
   }
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
     if(Math.abs(alignment)>.7)return alignment>.7&&Math.abs(dx*uz-dz*ux)<1.8&&dx*ux+dz*uz>.05;
     return true;
    }
    const along=(ns?other.z:other.x),exit=dir>0?box.hi:box.lo,after=(along-exit)*dir,lateral=Math.abs((ns?other.x:other.z)-coordinate);
    return h&&h.x*ux+h.z*uz>.7&&after>=0&&after<STOP+5&&lateral<1.8;
   });
   if(blocked){allowed=Math.min(allowed,entry.distance);break;}
  }
  if(contact&&!contact.legacy&&!f.roadsideRecovery&&!contact.other.pedestrian&&contact.distance<=allowed+.02&&onCollision){
   const ownSpeed=Math.hypot(Number(f.vx||0),Number(f.vz||0)),otherSpeed=contact.other.parked?0:Math.hypot(Number(contact.other.actor.vx||0),Number(contact.other.actor.vz||0));
   const h=contact.other.heading,alignment=h?h.x*ux+h.z*uz:0;
   const closingSpeed=Math.max(0,ownSpeed-otherSpeed*alignment);
   if(closingSpeed>=3)onCollision(f,contact.other.actor,{distance:contact.distance,closingSpeed});
  }
  return allowed;
 };
}
