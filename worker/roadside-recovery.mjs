import {clearSegment,pedestrianRoute} from './city-map.mjs';
import {MOTORWAY,MOTORWAY_ACCESS_ROADS,motorwaySegmentAt,motorwayMedianBlocked} from './motorway.mjs';
import {countryAt} from './country-map.mjs';
import {isNorthF1TrackClosed,northF1MovementBlocked} from './north-f1-closure.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function safeSegment(a,b,country){
 if(!clearSegment(a,b))return false;
 const steps=Math.max(1,Math.ceil(distance(a,b)/.5));
 for(let i=0;i<=steps;i++){const u=i/steps,p={x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u};if(countryAt(p)!==country||motorwayMedianBlocked(p))return false;}
 return true;
}
/** A legacy tow moved the owner's parked car but left its person on a motorway.
 * Escort that same person to the city-side shoulder through an actual median
 * opening, then let the normal planner walk to their still-owned parked car. */
function escapePath(f){
 const road=motorwaySegmentAt(f),car=f.parkedCar,country=countryAt(f);if(!road||!car||countryAt(car)!==country)return null;
 const horizontal=road.w>road.d,axis=horizontal?'x':'z',cross=horizontal?'z':'x',outward=(horizontal?road.z===MOTORWAY.north:road.x===MOTORWAY.west)?-1:1,center=road[cross],shoulder=MOTORWAY.width/2+.9;
 const point=(along,offset)=>({[axis]:along,[cross]:center+offset,y:1.1});
 const current={x:f.x,y:f.y??1.1,z:f.z},citySide=(f[cross]-center)*outward<=0;
 const lo=horizontal?MOTORWAY.west:MOTORWAY.north,hi=horizontal?MOTORWAY.east:MOTORWAY.south;
 const exits=[f[axis],lo+20,hi-20,...MOTORWAY_ACCESS_ROADS.map(r=>r[axis])]
  .filter((at,i,all)=>all.indexOf(at)===i&&!motorwayMedianBlocked(point(at,0)))
  .sort((a,b)=>Math.abs(a-f[axis])-Math.abs(b-f[axis]));
 for(const exit of citySide?[f[axis]]:exits){
  const inside=point(exit,-outward*shoulder),points=citySide?[current,inside]:[current,point(f[axis],outward*shoulder),point(exit,outward*shoulder),inside];
  if(points.some((p,i)=>i&&!safeSegment(points[i-1],p,country)))continue;
  const onward=pedestrianRoute(inside,car);if(!onward.length||onward.some(p=>countryAt(p)!==country))continue;
  return points.filter((p,i)=>!i||distance(p,points[i-1])>.02);
 }
 return null;
}
export function advanceRoadsideRecovery(world,f,headway){
 if(f.alive===false||f.onPlane||f.onTrain)return false;
 let job=f.roadsideRecovery;const now=Number(world.simulationAgeSeconds||0);
 if(!job){
  if(!f.leg?.needsRecoveryRoute||f.traveling&&f.transitMode==='car'||now<Number(f.roadsideRecoveryRetryAt||0))return false;
  const points=escapePath(f);if(!points){f.roadsideRecoveryRetryAt=now+600;return false;}
  f.roadsideRecovery=job={points,index:1,at:now,startedAt:now};
  f.traveling=true;f.transitMode='walk';f.motion=null;f.vx=f.vz=0;
 }
 let left=Math.min(1200,Math.max(0,now-Number(job.at??now)))/Math.max(1,Number(world.timeScale||120));job.at=now;job.blocked=false;
 for(let hop=0;hop<12&&left>1e-7&&job.index<job.points.length;hop++){
  const p=job.points[job.index],length=distance(f,p);if(length<.02){job.index++;continue;}
  const speed=1.8,requested=Math.min(length,left*speed),dx=(p.x-f.x)/length,dz=(p.z-f.z)/length;
  f.targetX=p.x;f.targetZ=p.z;
  const walker={...f,id:f.id+':roadside',vehicleLength:.7,vehicleWidth:.65},end={x:f.x+dx*requested,z:f.z+dz*requested};
  const allowed=Math.min(requested,headway?headway(walker,end):requested),next={x:f.x+dx*allowed,y:1.1,z:f.z+dz*allowed};
  if(!safeSegment(f,next,countryAt(f))||isNorthF1TrackClosed(world)&&northF1MovementBlocked(f,next,.35)){job.blocked=true;break;}
  Object.assign(f,next,{traveling:true,transitMode:'walk',indoors:false,vx:dx*allowed,vz:dz*allowed,action:'walking with roadside assistance to a safe motorway exit'});
  left-=allowed/speed;if(allowed<requested-.001){job.blocked=true;break;}if(allowed>=length-.01)job.index++;
 }
 if(job.index>=job.points.length){delete f.roadsideRecovery;delete f.roadsideRecoveryRetryAt;f.traveling=false;f.vx=f.vz=0;f.motion=null;f.leg.at=now;f.leg.blocked=false;}
 return true;
}
export function roadsideRecoveryView(f,at){
 const job=f.roadsideRecovery;if(!job)return null;
 const points=job.points.slice(job.index);
 return {traveling:true,transitMode:'walk',motion:{at,speed:1.8,mode:'walk',blocked:Boolean(job.blocked),points},routeWaypoints:points,routeIndex:0};
}
