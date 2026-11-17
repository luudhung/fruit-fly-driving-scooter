import {NORTH_F1_CIRCUIT,NORTH_F1_PIT_APRON,NORTH_F1_PIT_POINTS,NORTH_F1_PIT_WIDTH} from './north-f1-map.mjs';

const PREPARATION_SECONDS=3600;
const CELL=24,MAX_MARGIN=4,GROUND_MIN=-.5,GROUND_MAX=3.5;
const cells=new Map();
function index(points,radius,closed=false){
 const length=closed?points.length:points.length-1;
 for(let i=0;i<length;i++){
  const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dz=b.z-a.z;
  const edge={x:a.x,z:a.z,dx,dz,length2:dx*dx+dz*dz,radius};
  const pad=radius+MAX_MARGIN;
  for(let x=Math.floor((Math.min(a.x,b.x)-pad)/CELL);x<=Math.floor((Math.max(a.x,b.x)+pad)/CELL);x++){
   for(let z=Math.floor((Math.min(a.z,b.z)-pad)/CELL);z<=Math.floor((Math.max(a.z,b.z)+pad)/CELL);z++){
    const key=`${x},${z}`,bin=cells.get(key);
    if(bin)bin.push(edge);
    else cells.set(key,[edge]);
   }
  }
 }
}
index(NORTH_F1_CIRCUIT.points,NORTH_F1_CIRCUIT.width/2,true);
index(NORTH_F1_PIT_POINTS,NORTH_F1_PIT_WIDTH/2);

export function northF1ClosureWindow(event){
 if(!event||!['scheduled','racing'].includes(event.status)||!Number.isFinite(event.startsAt)||!Number.isFinite(event.endsAt))return null;
 return {startsAt:event.startsAt-PREPARATION_SECONDS,endsAt:event.endsAt};
}

export function northF1ClosureActive(window,at){
 return Boolean(window&&at>=window.startsAt&&at<window.endsAt);
}

export function isNorthF1TrackClosed(state){
 const event=state?.northF1?.event;
 return Boolean(event&&(event.status==='scheduled'||event.status==='racing')&&state.simulationAgeSeconds>=event.startsAt-PREPARATION_SECONDS&&state.simulationAgeSeconds<event.endsAt);
}

export function northF1PointRestricted(p,margin=0){
 const {x,z,y=1.1}=p;
 if(y<GROUND_MIN||y>GROUND_MAX||x< -1050-margin||x> -352+margin||z< -1041-margin||z> -585+margin)return false;
 const apron=NORTH_F1_PIT_APRON;
 if(Math.abs(x-apron.x)<=apron.w/2+margin&&Math.abs(z-apron.z)<=apron.d/2+margin)return true;
 const edges=cells.get(`${Math.floor(x/CELL)},${Math.floor(z/CELL)}`);
 if(!edges)return false;
 for(const edge of edges){
  const dx=x-edge.x,dz=z-edge.z;
  const t=edge.length2?Math.min(1,Math.max(0,(dx*edge.dx+dz*edge.dz)/edge.length2)):0;
  if((dx-t*edge.dx)**2+(dz-t*edge.dz)**2<=(edge.radius+margin)**2)return true;
 }
 return false;
}

/** A vehicle or walker already on the course may leave. A swept ground
 * movement from outside, or a second entry after leaving, is blocked. */
export function northF1MovementBlocked(from,to,margin=0){
 const {x,z,y=1.1}=from,dx=to.x-x,dz=to.z-z,dy=(to.y??y)-y;
 if((x< -1050-margin&&to.x< -1050-margin)||(x> -352+margin&&to.x> -352+margin)||
    (z< -1041-margin&&to.z< -1041-margin)||(z> -585+margin&&to.z> -585+margin)||
    (y<GROUND_MIN&&y+dy<GROUND_MIN)||(y>GROUND_MAX&&y+dy>GROUND_MAX))return false;
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz,dy)/.5));
 let outside=!northF1PointRestricted(from,margin);
 for(let i=1;i<=steps;i++){
  const t=i/steps;
  if(northF1PointRestricted({x:x+dx*t,z:z+dz*t,y:y+dy*t},margin)){
   if(outside)return true;
  }else outside=true;
 }
 return false;
}
