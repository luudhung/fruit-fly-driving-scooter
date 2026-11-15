// Shared North City street-circuit geometry, in city world meters.
export const NORTH_F1_ID='north-f1';
export const NORTH_F1_CHARTER_STANDS=[
 {id:'NORTH-CHARTER-1',x:-950,z:-754},
 {id:'NORTH-CHARTER-2',x:-950,z:-886},
];
const venue=(id,name,x,z,w,d,h)=>({id:'north-f1-'+id,name,x,z,w,d,h,kind:'race-venue',countryId:'north-city'});
const stand=(id,name,x,z,w,d,h,yaw=0)=>({...venue(id,name,x,z,w,d,h),yaw});
export const NORTH_F1_GRANDSTANDS=[
 stand('main-stand','International Grandstand',-690,-936,142,11,10),
 stand('waterfront-stand','Waterfront Grandstand',-750,-623,108,13,8),
 stand('turn-one-stand','Turn One Grandstand',-486,-894,45,11,7,Math.PI),
 stand('city-stand','City Chicane Grandstand',-462,-850,11,45,7,Math.PI/2),
 stand('sports-stand','Sports Park Grandstand',-556,-658,11,36,7,Math.PI/2),
 stand('river-bend-stand','River Bend Grandstand',-884,-651,11,47,7,Math.PI/2),
 stand('airport-stand','Airport Straight Grandstand',-895,-725,11,52,7,Math.PI/2),
];
export const NORTH_F1_GARAGES=venue('team-garages','North City Grand Prix Pit Building',-637.5,-879,100,14,11);
export const NORTH_F1_BUILDINGS=[...NORTH_F1_GRANDSTANDS,NORTH_F1_GARAGES];
const spectator={id:'north-f1-grandstand',name:'North City Grand Prix Fan Plaza',type:'social',x:-586,z:-938};
const paddock={id:'north-f1-paddock',name:'North City Grand Prix Paddock',type:'job',x:-622,z:-866};
export const NORTH_F1_LOCATIONS=[spectator,paddock];
export const NORTH_F1_ACCESS_ROADS=[
 {id:'NORTH-F1-FAN-PLAZA',x:-586,z:-940,w:7,d:20},
 {id:'NORTH-F1-COAST-ACCESS',x:-553,z:-600,w:8,d:8},
];
const raceFacilities=[
 {x:-669,z:-912,w:350,d:50}, {x:-860,z:-752,w:26,d:315},
 {x:-711,z:-612,w:310,d:32}, {x:-535,z:-710,w:28,d:170},
 {x:-479,z:-774,w:105,d:24}, {x:-454,z:-910,w:65,d:45},
];

// The main straight is dedicated to racing. The eastern sector runs on West
// Avenue and the city's 830/770 cross streets. The south straight hugs the river.
const bends=[
 [-740,-915,0],[-496,-915,12],[-460,-923,12],[-430,-896,21],
 [-430,-830,14],[-370,-830,14],[-370,-770,15],[-430,-770,12],[-511,-775,13],
 [-533,-750,12],[-533,-670,12],[-532,-645,10],[-532,-622,12],
 [-561,-603,13],[-827,-603,18],[-863,-626,18],[-863,-873,21],
 [-844,-902,12],[-813,-915,11],
];

function roundedLoop(){
 const samples=[];
 for(let i=0;i<bends.length;i++){
  const [x,z,r]=bends[i],[ax,az]=bends.at(i-1),[bx,bz]=bends[(i+1)%bends.length];
  const a=Math.hypot(ax-x,az-z),b=Math.hypot(bx-x,bz-z);
  if(!r){samples.push({x,z});continue;}
  const trim=Math.min(r,a*.44,b*.44),px=x+(ax-x)*trim/a,pz=z+(az-z)*trim/a,qx=x+(bx-x)*trim/b,qz=z+(bz-z)*trim/b;
  const steps=Math.max(5,Math.ceil(trim*.4));
  for(let j=0;j<=steps;j++){
   const t=j/steps,s=1-t;
   samples.push({x:s*s*px+2*s*t*x+t*t*qx,z:s*s*pz+2*s*t*z+t*t*qz});
  }
 }
 return samples;
}
const samples=roundedLoop();
const reservation=(a,b)=>{
 const padding=12;
 return {x:(a.x+b.x)/2,z:(a.z+b.z)/2,w:Math.abs(b.x-a.x)+padding*2,d:Math.abs(b.z-a.z)+padding*2};
};
export const NORTH_F1_RESERVED=[
 ...raceFacilities,...NORTH_F1_BUILDINGS,
 ...bends.map(([x,z],i)=>{
  const [px,pz]=bends.at(i-1);
  return reservation({x,z},{x:px,z:pz});
 }),
];
const edges=[];
let lapLength=0;
for(let i=0;i<samples.length;i++){
 const a=samples[i],b=samples[(i+1)%samples.length],length=Math.hypot(b.x-a.x,b.z-a.z);
 if(length<=.001)continue;
 edges.push({a,b,length,at:lapLength,dx:(b.x-a.x)/length,dz:(b.z-a.z)/length});lapLength+=length;
}
// Pit entry peels away after the starting line and rejoins before Turn 1.
export const NORTH_F1_PIT_POINTS=Object.freeze([
 {x:-727,z:-915},{x:-717,z:-912},{x:-698,z:-900},{x:-686,z:-898},
 {x:-589,z:-898},{x:-577,z:-901},{x:-552,z:-915},
]);
export const NORTH_F1_PIT_WIDTH=7;
const pitEdges=[];
let pitLength=0;
for(let i=1;i<NORTH_F1_PIT_POINTS.length;i++){
 const a=NORTH_F1_PIT_POINTS[i-1],b=NORTH_F1_PIT_POINTS[i],length=Math.hypot(b.x-a.x,b.z-a.z);
 pitEdges.push({a,b,length,at:pitLength,dx:(b.x-a.x)/length,dz:(b.z-a.z)/length});pitLength+=length;
}
const pitStraight=pitEdges.find(edge=>edge.a.z===-898&&edge.b.z===-898);
const garageFront=NORTH_F1_GARAGES.z-NORTH_F1_GARAGES.d/2;
export const NORTH_F1_PIT_APRON={x:NORTH_F1_GARAGES.x,z:(garageFront-899)/2,w:NORTH_F1_GARAGES.w,d:garageFront+899};
export const NORTH_F1_PIT_BOX_WIDTH=2.9;
export const NORTH_F1_PIT_BOX_LENGTH=4.55;
const bayWidth=NORTH_F1_GARAGES.w/10;
export const NORTH_F1_PIT_BOXES=Array.from({length:20},(_,index)=>{
 const teamIndex=Math.floor(index/2),driverIndex=index%2;
 const x=NORTH_F1_GARAGES.x+(teamIndex-4.5+(driverIndex?.25:-.25))*bayWidth;
 const z=-894.65;
 return {teamIndex,driverIndex,x,z,progress:(pitStraight.at+x-pitStraight.a.x)/pitLength,side:z-pitStraight.a.z};
});
export const NORTH_F1_CIRCUIT=Object.freeze({
 id:NORTH_F1_ID,name:'North City Waterfront Grand Prix',width:16,lapLength,
 points:Object.freeze(samples),spectator,paddock,capacity:900,pit:Object.freeze({enter:13/lapLength,box:.43,exit:188/lapLength,length:pitLength}),
});
const bounds={
 minX:Math.min(...samples.map(p=>p.x))-14,maxX:Math.max(...samples.map(p=>p.x))+14,
 minZ:Math.min(...samples.map(p=>p.z))-14,maxZ:Math.max(...samples.map(p=>p.z))+14,
};
export function northF1Pose(progress,lane=0){
 const meters=((progress%1+1)%1)*lapLength;
 let lo=0,hi=edges.length-1;
 while(lo<hi){const mid=(lo+hi+1)>>1;if(edges[mid].at<=meters)lo=mid;else hi=mid-1;}
 const e=edges[lo],delta=meters-e.at;
 return{x:e.a.x+e.dx*delta-e.dz*lane,y:.27,z:e.a.z+e.dz*delta+e.dx*lane,yaw:Math.atan2(e.dx,e.dz)};
}
/** Test a point against the continuous driving surface without allocating. */
export function onNorthF1Track(p,margin=0){
 if(p.x<bounds.minX-margin||p.x>bounds.maxX+margin||p.z<bounds.minZ-margin||p.z>bounds.maxZ+margin)return false;
 const radius2=(NORTH_F1_CIRCUIT.width/2+margin)**2;
 for(const e of edges){
  const x=p.x-e.a.x,z=p.z-e.a.z,t=Math.max(0,Math.min(e.length,x*e.dx+z*e.dz));
  if((x-e.dx*t)**2+(z-e.dz*t)**2<=radius2)return true;
 }
 return false;
}

export function northF1PitPose(fraction,side=0){
 const meters=Math.min(1,Math.max(0,fraction))*pitLength;
 const e=pitEdges.find(edge=>meters<edge.at+edge.length)||pitEdges.at(-1),delta=meters-e.at;
 return {x:e.a.x+e.dx*delta-e.dz*side,y:.27,z:e.a.z+e.dz*delta+e.dx*side,yaw:Math.atan2(e.dx,e.dz)};
}

/** The plan uses the painted box's longitudinal coordinate. Its lateral offset
 * grows near the box, leaving a separate through lane beside the stopped car. */
export function northF1RacePose(sample,lane,pitBoxIndex,legacy=false){
 if(sample.pit==null)return northF1Pose(sample.progress,lane);
 const box=NORTH_F1_PIT_BOXES[pitBoxIndex];
 if(!box)return northF1PitPose(sample.pit,lane*.26);
 const fraction=legacy?(sample.pit<=.43
  ? sample.pit*box.progress/.43
  : box.progress+(sample.pit-.43)*(1-box.progress)/.57):sample.pit;
 const steer=Math.max(0,1-Math.abs(fraction-box.progress)*pitLength/7);
 const merge=Math.max(0,1-Math.min(fraction,1-fraction)*pitLength/10);
 const pose=northF1PitPose(fraction,box.side*steer*steer*(3-2*steer));
 pose.z+=lane*merge*merge;
 return pose;
}
