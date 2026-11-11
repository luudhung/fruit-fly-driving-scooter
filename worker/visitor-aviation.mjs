import {AIRPORT} from './city-map.mjs';
import {AVIATION, nextFlight} from './aviation.mjs';

export const VISITOR_STANDS = Array.from({length:4}, (_, index) => ({
 id:`INTL-${index+1}`, x:-225+index*30, z:-443,
}));
export const INBOUND_SECONDS = 1020;
export const VISITOR_TOUCHDOWN_SECONDS = 520;
export const OUTBOUND_SECONDS = 1080;
export const AIRPORT_SECTORS = ['west','north','east'];
const FAR = {west:[-1120,265,-650],north:[-180,320,-1120],east:[1090,285,-690]};
const SEPARATION = 120;
const runway = AIRPORT.runway;
export const VISITOR_TAXIWAY_Z = -474;
const taxiExit = direction => runway.x + direction*128;

export function visitorRunwaySlot(earliest, duration, flights) {
 let start = earliest;
 for (;;) {
  // Island flights reserve their entire visible operation, including airport taxi.
  const after = start + duration + SEPARATION;
  const occupied = [];
  for(const airport of ['city','island']){
   let flight = nextFlight(start-AVIATION.flightSeconds-SEPARATION,airport,0);
   while(flight.departure < after){
    occupied.push([flight.departure,flight.arrival]);
    flight = nextFlight(flight.departure+1,airport,0);
   }
  }
  for(const f of flights){
   occupied.push([f.inboundAt,f.parkedAt]);
   if(f.outboundAt!=null)occupied.push([f.outboundAt,f.exitAt]);
  }
  const conflict = occupied.filter(([a,b])=>a<after&&b+SEPARATION>start);
  if(!conflict.length)return start;
  start=Math.max(...conflict.map(([,end])=>end+SEPARATION));
 }
}

function holdPose(now, flight) {
 const [farX,farY,farZ]=FAR[flight.sector]||FAR.north;
 const hold=flight.hold;
 const elapsed=Math.max(0,now-hold.at);
 const angle=Math.max(0,elapsed-480)*Math.PI/480;
 const x=farX+90*(1-Math.cos(angle)),z=farZ+90*Math.sin(angle);
 if(elapsed>=480)return {x,y:farY,z,heading:angle,phase:'holding'};
 const t=elapsed/480;
 return {
  x:hold.x+(x-hold.x)*t,y:hold.y+(farY-hold.y)*t,z:hold.z+(z-hold.z)*t,
  heading:Math.atan2(x-hold.x,z-hold.z),phase:'holding',
 };
}

function flightPath(stand, flight, outbound) {
 const {sector,direction}=flight;
 const [farX,farY,farZ]=FAR[sector]||FAR.north;
 const threshold=runway.x-direction*136;
 const exit=taxiExit(direction), entry=taxiExit(-direction), z=runway.z;
 if(outbound)return [
  [0,stand.x,3,stand.z], [140,stand.x,3,VISITOR_TAXIWAY_Z], [330,entry,3,VISITOR_TAXIWAY_Z],
  [460,entry,3,z], [625,exit,4,z], [815,exit+direction*285,115,z], [OUTBOUND_SECONDS,farX,farY,farZ],
 ];
 const start=flight.hold?holdPose(flight.inboundAt,flight):{x:farX,y:farY,z:farZ};
 return [
  [0,start.x,start.y,start.z], [330,threshold-direction*245,63,z], [VISITOR_TOUCHDOWN_SECONDS,threshold,3,z],
  [690,exit,3,z], [820,exit,3,VISITOR_TAXIWAY_Z], [950,stand.x,3,VISITOR_TAXIWAY_Z],
  [INBOUND_SECONDS,stand.x,3,stand.z],
 ];
}

export function visitorAircraftPose(now, flight) {
 if(now<flight.inboundAt)return flight.hold?holdPose(now,flight):null;
 if(flight.exitAt!=null&&now>=flight.exitAt)return null;
 const stand=VISITOR_STANDS.find(p=>p.id===flight.standId);
 if(!stand)return null;
 const outbound=flight.outboundAt!=null&&now>=flight.outboundAt;
 if(!outbound&&now>=flight.parkedAt)return {...stand,y:3,heading:0,phase:'parked'};
 const elapsed=now-(outbound?flight.outboundAt:flight.inboundAt);
 const path=flightPath(stand,flight,outbound);
 const index=Math.min(path.length-2, Math.max(0,path.findIndex(p=>p[0]>elapsed)-1));
 const a=path[index],b=path[index+1],u=Math.min(1,Math.max(0,(elapsed-a[0])/(b[0]-a[0])));
 const mix=(x,y)=>x+(y-x)*u;
 const heading=Math.atan2(b[1]-a[1],b[3]-a[3]);
 const phase=outbound?(index<3?'taxi-out':index===3?'takeoff':'departing'):(index<2?'approach':index===2?'landing':'taxi-in');
 return {x:mix(a[1],b[1]),y:mix(a[2],b[2]),z:mix(a[3],b[3]),heading,phase};
}
