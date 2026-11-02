import {ROADS,BUILDINGS,WATER,PARK,BRIDGES,UNDERPASSES,METRO_LINES,metroTrackPoints,contains} from './city-map.mjs';
import {INTERSECTIONS} from './traffic.mjs';

/** Actual renderer world coordinates, independent of vehicle/road rules. Low pavement,
 * crosswalk paint and traversable curbs deliberately are not vertical obstacles.
 * Source geometry: traffic-signals, metro-renderer, city-district and fulllife.
 * Buildings remain in the city's building index; nothing here changes NPC routing. */
const signalPoses=new Map(),signalIssues=[],reservedSignals=[];
const signalKey=(j,axis)=>`${j.x},${j.z}:${axis}`;
const originalSignalPose=(j,axis)=>({x:j.x+(axis==='ns'?6.4:-6.4),z:j.z+(axis==='ns'?6.2:-6.2)});
const signalPoseLegal=p=>!ROADS.some(r=>contains(r,p,.15))&&!BUILDINGS.some(b=>contains(b,p,.4));
const baseSignals=INTERSECTIONS.flatMap(j=>['ns','ew'].map(axis=>({j,axis,original:originalSignalPose(j,axis)})));
// Reserve every already-correct pole first. A moved signal must not land on its
// neighbour's existing pole at the pair of closely spaced western avenues.
for(const s of baseSignals)if(signalPoseLegal(s.original)){
 const pose=Object.freeze(s.original);signalPoses.set(signalKey(s.j,s.axis),pose);reservedSignals.push(pose);
}
for(const s of baseSignals){
 if(signalPoses.has(signalKey(s.j,s.axis)))continue;
 const {j,axis,original}=s,xs=[j.x-6.4,j.x+6.4],zs=[j.z-6.2,j.z+6.2];
 // Actual nearby asphalt edges give sidewalk candidates even when another road
 // occupies the original corner. The finite corner grid handles obstructed lots.
 for(const r of ROADS){
  if(r.d>r.w&&Math.abs(r.x-j.x)<20)for(const sign of [-1,1])xs.push(r.x+sign*(r.w/2+.35));
  if(r.w>=r.d&&Math.abs(r.z-j.z)<20)for(const sign of [-1,1])zs.push(r.z+sign*(r.d/2+.35));
 }
 for(const offset of [8,10,12,14,16,18])for(const sign of [-1,1]){xs.push(j.x+sign*offset);zs.push(j.z+sign*offset);}
 const candidates=[];
 for(const x of new Set(xs))for(const z of new Set(zs)){
  const distance=Math.hypot(x-original.x,z-original.z);
  if(distance>20||Math.hypot(x-j.x,z-j.z)>20)continue;
  candidates.push({x,z,distance});
 }
 candidates.sort((a,b)=>a.distance-b.distance||a.x-b.x||a.z-b.z);
 const chosen=candidates.find(p=>signalPoseLegal(p)&&reservedSignals.every(q=>Math.hypot(p.x-q.x,p.z-q.z)>.7));
 if(!chosen)signalIssues.push(signalKey(j,axis));
 const pose=Object.freeze(chosen?{x:chosen.x,z:chosen.z}:original);
 signalPoses.set(signalKey(j,axis),pose);reservedSignals.push(pose);
}
/** Cached immutable base-city signal placement, also used by the visual heads
 * and bulbs. Non-city junctions retain their caller-provided legacy geometry. */
export function signalPolePose(junction,axis){return signalPoses.get(signalKey(junction,axis))||originalSignalPose(junction,axis);}
/** An unresolved pole stays visible at its original position and is reported. */
export const SIGNAL_POLE_PLACEMENT_ISSUES=Object.freeze(signalIssues);

const colliders=[];
const circle=(id,x,z,radius,minY,maxY)=>colliders.push({id,x,z,radius,minY,maxY});
const box=(id,x,z,w,d,minY,maxY)=>colliders.push({id,x,z,w,d,minY,maxY});
// Excavation retaining walls remain solid below the upper promenade, not at deck height.
for(const t of UNDERPASSES)for(const side of [-1,1])box(`underpass-wall:${t.id}:${side}`,t.x+side*(t.w/2+2.8),t.z,.06,t.halfLength*2,.14-t.depth-.2,.12);
for(const j of INTERSECTIONS)for(const axis of ['ns','ew']){
 const p=signalPolePose(j,axis);circle(`signal:${j.id}:${axis}`,p.x,p.z,.09,0,3.2);
}
for(const line of METRO_LINES)for(const direction of [1,-1]){
 const points=metroTrackPoints(line,direction);
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
  if(length<.01)continue;
  const px=-dz/length,pz=dx/length;
  for(let d=13;d<length;d+=26){
   const t=d/length,sx=a.x+dx*t,sz=a.z+dz*t;
   if(WATER.some(w=>contains(w,{x:sx,z:sz},4)))continue;
   const offset=[6.4,-6.4].find(side=>{
    const p={x:sx+px*side,z:sz+pz*side};
    return !ROADS.some(r=>contains(r,p,.75))&&!BUILDINGS.some(b=>contains(b,p,.75))&&!contains(PARK,p,1);
   });
   if(offset===undefined)continue;
   box(`metro:${line.id}:${direction}:${i}:${d}`,sx+px*offset,sz+pz*offset,.72,.72,0,line.height-.55);
  }
 }
}
for(const bridge of BRIDGES){
 const main=bridge.z===0,steps=main?32:20,half=bridge.w/2,side=bridge.d/2-.6,rise=main?36:14;
 for(let i=0;i<=Math.floor(bridge.w/20);i++)for(const sign of [-1,1]){
  circle(`bridge-lamp:${bridge.z}:${i}:${sign}`,bridge.x-half+i*20,bridge.z+sign*7.35,.09,.3,3.1);
 }
 for(const sign of [-1,1]){
  const z=bridge.z+sign*side;
  box(`bridge-rail:${bridge.z}:${sign}`,bridge.x,z,bridge.w,.6,.9,1.5);
  for(let i=0;i<steps;i+=2){
   const t=i/steps,x=bridge.x-half+bridge.w*t,top=2.6+rise*Math.sin(Math.PI*t);
   circle(`bridge-suspender:${bridge.z}:${sign}:${i}`,x,z,.12,1.2,top);
  }
  for(const end of [-1,1]){
   box(`bridge-pier:${bridge.z}:${sign}:${end}`,bridge.x+end*(half+4),z+sign*3.5,main?5:3,4,0,main?12:5);
  }
 }
}
for(const z of [-282,-242,-202,-162,-122,-82,-52])for(const x of [-43,73]){
 circle(`park-lamp:${x}:${z}`,x,z-2,.09,0,3);
}
const power=BUILDINGS.find(b=>b.id==='power')||{x:-285,z:-75};
for(let i=-2;i<=2;i++)circle(`power-pole:${i}`,power.x+i*4.2,power.z+8,.16,2,10);

/** Immutable base-city furniture; its vertical ranges use renderer Y, not car-center Y. */
export const STREET_COLLIDERS=Object.freeze(colliders.map(c=>Object.freeze(c)));
const CELL=16,bins=new Map();
for(const c of STREET_COLLIDERS){
 const hx=c.radius??c.w/2,hz=c.radius??c.d/2;
 for(let x=Math.floor((c.x-hx)/CELL);x<=Math.floor((c.x+hx)/CELL);x++)for(let z=Math.floor((c.z-hz)/CELL);z<=Math.floor((c.z+hz)/CELL);z++){
  const key=`${x},${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(c);
 }
}
/** Broad phase query with no Y filtering. Caller intersects [minY,maxY] with its
 * actual vehicle body. Huge radii scan the finite array rather than unbounded cells. */
export function streetCollidersNear(x,z,radius=3){
 if(![x,z,radius].every(Number.isFinite)||radius<0)return [];
 const minX=Math.floor((x-radius)/CELL),maxX=Math.floor((x+radius)/CELL),minZ=Math.floor((z-radius)/CELL),maxZ=Math.floor((z+radius)/CELL);
 const candidates=new Set();
 if((maxX-minX+1)*(maxZ-minZ+1)>bins.size){for(const c of STREET_COLLIDERS)candidates.add(c);}
 else for(let bx=minX;bx<=maxX;bx++)for(let bz=minZ;bz<=maxZ;bz++)for(const c of bins.get(`${bx},${bz}`)||[])candidates.add(c);
 return [...candidates].filter(c=>{
  if(c.radius!==undefined)return (x-c.x)**2+(z-c.z)**2<=(radius+c.radius)**2;
  const dx=Math.max(0,Math.abs(x-c.x)-c.w/2),dz=Math.max(0,Math.abs(z-c.z)-c.d/2);
  return dx*dx+dz*dz<=radius*radius;
 });
}
