import {NORTH_F1_CHARTER_STANDS} from './north-f1-map.mjs';
import {AIRPORT} from './city-map.mjs';
import {AVIATION,nextRegionalFlight,airportById} from './aviation.mjs';

export const VISITOR_STANDS = AIRPORT.stands||Array.from({length:4},(_,i)=>({id:`INTL-${i+1}`,x:-225+i*30,z:-443}));
export const INBOUND_SECONDS = 1020;
export const VISITOR_TOUCHDOWN_SECONDS = 520;
export const OUTBOUND_SECONDS = 1080;
export const AIRPORT_SECTORS = ['west','north','east'];
const FAR = {west:[-1120,265,-650],north:[-180,320,-1120],east:[1090,285,-690]};
const SEPARATION = 120;
const runway = AIRPORT.runway;
export const VISITOR_TAXIWAY_Z = AIRPORT.taxiwayZ??-474;
export const MIN_VISITOR_PASSENGERS = 10;
export const VISITOR_ARRIVAL_STAGGER = 36;
const taxiExit = direction => runway.x + direction*128;
export function visitorStands(airportId='city'){
 const airport=airportById(airportId);if(!airport)return [];
 // The final stand serves existing domestic/regional timetables. All remaining
 // marked stands share one registry across regular visitors and Grand Prix charters.
 const ordinary=airport.stands.slice(0,-1).map(p=>({...p}));
 return airportId==='north'?[...ordinary,...NORTH_F1_CHARTER_STANDS.map(p=>({...p}))]:ordinary;
}
export function visitorRunways(airportId='city'){
 const airport=airportById(airportId);
 return airport?(airport.runways?.length?airport.runways:[{...airport.runway,id:airport.runway.id||`${airport.id}-RUNWAY-1`}]).map(r=>({...r})):[];
}
export function visitorFlightRunway(flight){
 const runways=visitorRunways(flight.airportId||'city');return runways.find(r=>r.id===flight.runwayId)||runways[0];
}
export function legacyVisitorStand(flight){
 if(flight.arrivalStand)return flight.arrivalStand;
 const id=flight.standId;
 if((flight.airportId||'city')!=='city')return null;
 let match=/^INTL-(\d+)$/.exec(id||'');
 if(match&&Number(match[1])<=4)return{id,x:-225+(Number(match[1])-1)*30,z:-443};
 match=/^CITY-STAND-(\d+)$/.exec(id||'');
 if(match)return{id,x:[-215,-180,-145][Number(match[1])-1],z:-443};
 match=/^CITY-GP-(\d+)$/.exec(id||'');
 if(match)return{id,x:[-155,-128][Number(match[1])-1],z:-443};
 return null;
}
export function visitorAirport(flight){return airportById(flight.airportId||'city')||airportById('city');}
const flightStand=flight=>flight.arrivalStand||(flight.airportId&&flight.airportId!=='city'?visitorStands(flight.airportId):VISITOR_STANDS).find(p=>p.id===flight.standId);

// A short, durable pedestrian itinerary, separate from the public street graph:
// aircraft door -> portable stairs -> apron -> terminal -> immigration -> exit.
export function visitorArrivalPath(flight,index=0,timeScale=120) {
 const stand=flightStand(flight);
 if(!stand)return [];
 const speed=1.8/Math.max(1,timeScale),path=[];
 let at=Number(flight.disembarkAt??flight.parkedAt)+120+index*VISITOR_ARRIVAL_STAGGER;
 const add=(x,y,z,phase,wait=0)=>{
  const previous=path.at(-1);
  if(previous)at+=Math.hypot(x-previous.x,y-previous.y,z-previous.z)/speed+wait;
  path.push({at,x,y,z,phase});
 };
 add(stand.x-1.4,3.4,stand.z+4,'disembarking');
 add(stand.x-6,1.1,stand.z+4,'disembarking');
 if(flight.airportId&&flight.airportId!=='city'){
  const airport=visitorAirport(flight);
  add(airport.terminal.x-airport.terminal.w/2-2,1.1,stand.z+4,'apron');
  add(airport.terminal.x-airport.terminal.w/2-2,1.1,airport.terminal.z,'apron');
  add(airport.terminal.x,1.1,airport.terminal.z,'immigration');
  add(airport.terminal.x,1.1,airport.terminal.z,'immigration',420);
  add(airport.gate.x,1.1,airport.gate.z,'complete');return path;
 }
 add(stand.x-6,1.1,-414,'apron');
 add(AIRPORT.terminal.x,1.1,-403,'apron');
 add(AIRPORT.terminal.x,1.1,AIRPORT.terminal.z,'immigration');
 add(AIRPORT.terminal.x,1.1,AIRPORT.terminal.z,'immigration',420);
 add(AIRPORT.gate.x,1.1,AIRPORT.gate.z,'complete');
 return path;
}

export function visitorArrivalPose(now,flight,index=0,timeScale=120) {
 const path=visitorArrivalPath(flight,index,timeScale);
 if(!path.length)return null;
 if(now<path[0].at){const pose=visitorAircraftPose(now,flight);return pose?{...pose,phase:'inbound',indoors:true,onPlane:true}:null;}
 if(now>=path.at(-1).at)return {...path.at(-1),indoors:false,onPlane:false};
 const next=path.findIndex(point=>point.at>now),a=path[next-1],b=path[next];
 const u=Math.min(1,Math.max(0,(now-a.at)/Math.max(1,b.at-a.at)));
 return {x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u,
  phase:a.phase,indoors:a.phase==='immigration',onPlane:false,next:b};
}

const GROUND_SEPARATION=60;
const groundWindow=(start,duration)=>duration===OUTBOUND_SECONDS?[start,start+460]:[start+690,start+duration];
function runwayOperations(start,after,flights,airportId){
 const primary=visitorRunways(airportId)[0]?.id,operations=[];
 for(const from of ['city','north','island'])for(const to of ['city','north','island']){
  if(from===to||from!==airportId&&to!==airportId)continue;
  let f=nextRegionalFlight(start-AVIATION.flightSeconds-SEPARATION,from,to,0);
  while(f&&f.departure<after){
   // Regional flights spend the first and last four of their twelve path
   // segments on local taxi/runway movements, with the middle spent in flight.
   const groundSeconds=AVIATION.flightSeconds/3;
   const ground=from===airportId?[f.departure,f.departure+groundSeconds]:[f.arrival-groundSeconds,f.arrival];
   operations.push({start:ground[0],end:ground[1],runwayId:primary,ground});
   f=nextRegionalFlight(f.departure+1,from,to,0);
  }
 }
 for(const f of flights){
  if((f.airportId||'city')!==airportId||f.aircraftGone)continue;
  const runwayId=f.runwayId||primary;
  if(Number.isFinite(f.inboundAt)&&Number.isFinite(f.parkedAt))operations.push({start:f.inboundAt,end:f.parkedAt,runwayId,ground:groundWindow(f.inboundAt,INBOUND_SECONDS)});
  if(Number.isFinite(f.outboundAt)&&Number.isFinite(f.exitAt))operations.push({start:f.outboundAt,end:f.exitAt,runwayId,ground:groundWindow(f.outboundAt,OUTBOUND_SECONDS)});
 }
 return operations;
}
export function visitorRunwaySlot(earliest,duration,flights,airportId='city',runwayId=visitorRunways(airportId)[0]?.id){
 let start=earliest;
 for(let tries=0;tries<10000;tries++){
  const after=start+duration+SEPARATION,ground=groundWindow(start,duration),operations=runwayOperations(start,after,flights,airportId);
  let next=start;
  for(const op of operations){
   if(op.runwayId===runwayId&&op.start<after&&op.end+SEPARATION>start)next=Math.max(next,op.end+SEPARATION);
   if(op.ground[0]<ground[1]+GROUND_SEPARATION&&op.ground[1]+GROUND_SEPARATION>ground[0])next=Math.max(next,op.ground[1]+GROUND_SEPARATION-(ground[0]-start));
  }
  if(next<=start)return start;start=next;
 }
 throw Error('No bounded safe runway slot');
}
export function visitorRunwayReservation(earliest,duration,flights,airportId='city'){
 return visitorRunways(airportId).map(r=>({at:visitorRunwaySlot(earliest,duration,flights,airportId,r.id),runwayId:r.id})).sort((a,b)=>a.at-b.at||a.runwayId.localeCompare(b.runwayId))[0];
}
export function visitorStandReleaseAt(flight){
 if(flight.aircraftGone)return -Infinity;
 if(Number.isFinite(flight.standReleasedAt))return flight.standReleasedAt;
 if(Number.isFinite(flight.outboundAt))return flight.outboundAt+140;
 return Number.isFinite(flight.expectedStandReleaseAt)?flight.expectedStandReleaseAt:Infinity;
}
export function visitorStandReservation(earliest,flights,airportId='city',groundStay=21600){
 const all=flights.filter(f=>(f.airportId||'city')===airportId&&!f.aircraftGone);
 const choices=[];
 for(const stand of visitorStands(airportId)){
  let at=earliest;
  for(let tries=0;tries<all.length+20;tries++){
   const runway=visitorRunwayReservation(at,INBOUND_SECONDS,all,airportId);if(!runway)break;
   at=runway.at;const parked=at+INBOUND_SECONDS,end=parked+groundStay;
   const conflict=all.filter(f=>{const other=flightStand(f);return other&&Math.hypot(other.x-stand.x,other.z-stand.z)<24&&Number(f.parkedAt||f.inboundAt)<end&&visitorStandReleaseAt(f)>parked;});
   if(!conflict.length){choices.push({...runway,stand:{...stand}});break;}
   const until=Math.max(...conflict.map(visitorStandReleaseAt));if(!Number.isFinite(until))break;
   at=Math.max(at+1,until+120-INBOUND_SECONDS);
  }
 }
 return choices.sort((a,b)=>a.at-b.at||a.stand.id.localeCompare(b.stand.id))[0]||null;
}

/** Once wheels are down, a late stand release is handled on the taxiway.
 * Never send a landed aircraft back into the airborne holding pattern. */
export function resolveVisitorTaxiStand(flight,flights,now){
 if(flight.aircraftGone||flight.landed||flight.landedAt!=null||!Number.isFinite(flight.inboundAt)||now<flight.inboundAt+690||flight.taxiStandChecked)return false;
 const occupied=stand=>flights.some(f=>f!==flight&&!f.aircraftGone&&(f.airportId||'city')===(flight.airportId||'city')&&flightStand(f)&&Math.hypot(flightStand(f).x-stand.x,flightStand(f).z-stand.z)<24&&Number(f.parkedAt)<Math.max(now+330,visitorStandReleaseAt(flight))&&visitorStandReleaseAt(f)>Math.max(now,flight.inboundAt+690));
 const current=flightStand(flight);
 if(current&&!occupied(current)&&!flight.taxiHold){flight.taxiStandChecked=true;return false;}
 const free=visitorStands(flight.airportId||'city').filter(p=>!occupied(p)).sort((a,b)=>Math.hypot(a.x-(current?.x||0),a.z-(current?.z||0))-Math.hypot(b.x-(current?.x||0),b.z-(current?.z||0)))[0];
 const pose=flight.taxiHold?.pose||visitorAircraftPose(Math.min(now,flight.inboundAt+690),flight);
 if(!pose)return false;
 if(!free){flight.taxiHold||={at:now,pose};flight.parkedAt=Math.max(flight.parkedAt,now+330);return true;}
 const start=flight.taxiHold?now:Math.min(now,flight.inboundAt+690),taxi=visitorFlightRunway(flight).taxiwayZ??visitorAirport(flight).taxiwayZ??VISITOR_TAXIWAY_Z;
 const points=[{...pose,at:start}],add=(x,z)=>{const p=points.at(-1);points.push({x,y:3,z,at:p.at+Math.max(30,Math.hypot(x-p.x,z-p.z)*2)});};
 for(const step of flightPath(current||free,flight,false).filter(p=>p[0]>690&&p[0]<=820))add(step[1],step[3]);
 add(free.x,taxi);add(free.x,free.z);
 flight.standId=free.id;flight.arrivalStand={...free};flight.taxiRoute=points;flight.parkedAt=points.at(-1).at;delete flight.taxiHold;flight.taxiStandChecked=true;return true;
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
 if(flight.airportId&&flight.airportId!=='city'){
  const airport=visitorAirport(flight),r=airport.runway,vertical=r.d>r.w,half=(vertical?r.d:r.w)/2-24,along=vertical?r.z:r.x,cross=vertical?r.x:r.z,taxi=cross+(vertical?26:46),point=(time,a,c,y=3)=>vertical?[time,c,y,a]:[time,a,y,c],entry=along-direction*half,exit=along+direction*half,standAlong=vertical?stand.z:stand.x;
  if(outbound)return[[0,stand.x,3,stand.z],point(140,standAlong,taxi),point(330,entry,taxi),point(460,entry,cross),point(625,exit,cross,4),point(815,exit+direction*190,cross,115),[OUTBOUND_SECONDS,farX,farY,farZ]];
  const start=flight.hold?holdPose(flight.inboundAt,flight):{x:farX,y:farY,z:farZ};
  return[[0,start.x,start.y,start.z],point(330,entry-direction*190,cross,63),point(VISITOR_TOUCHDOWN_SECONDS,entry,cross),point(690,exit,cross),point(820,exit,taxi),point(950,standAlong,taxi),[INBOUND_SECONDS,stand.x,3,stand.z]];
 }
 const r=visitorFlightRunway(flight)||runway,threshold=r.x-direction*136,exit=r.x+direction*136,z=r.z,taxi=r.taxiwayZ??VISITOR_TAXIWAY_Z;
 const bypass=r.taxiBypassX?.[direction>0?1:0]??r.x+direction*(r.w/2+15),entryBypass=r.taxiBypassX?.[direction>0?0:1]??r.x-direction*(r.w/2+15);
 const entry=r.x-direction*136;
 if(outbound)return r.endAroundTaxi?[
  [0,stand.x,3,stand.z],[140,stand.x,3,taxi],[290,entryBypass,3,taxi],[390,entryBypass,3,z],
  [460,entry,3,z],[625,exit,4,z],[815,exit+direction*285,115,z],[OUTBOUND_SECONDS,farX,farY,farZ],
 ]:[
  [0,stand.x,3,stand.z],[140,stand.x,3,taxi],[330,entry,3,taxi],[460,entry,3,z],
  [625,exit,4,z],[815,exit+direction*285,115,z],[OUTBOUND_SECONDS,farX,farY,farZ],
 ];
 const start=flight.hold?holdPose(flight.inboundAt,flight):{x:farX,y:farY,z:farZ};
 return r.endAroundTaxi?[
  [0,start.x,start.y,start.z],[330,threshold-direction*245,63,z],[VISITOR_TOUCHDOWN_SECONDS,threshold,3,z],
  [690,exit,3,z],[760,bypass,3,z],[820,bypass,3,taxi],[950,stand.x,3,taxi],[INBOUND_SECONDS,stand.x,3,stand.z],
 ]:[
  [0,start.x,start.y,start.z],[330,threshold-direction*245,63,z],[VISITOR_TOUCHDOWN_SECONDS,threshold,3,z],
  [690,exit,3,z],[820,exit,3,taxi],[950,stand.x,3,taxi],[INBOUND_SECONDS,stand.x,3,stand.z],
 ];
}

export function visitorAircraftPose(now, flight) {
 if(flight.aircraftGone||!Number.isFinite(flight.inboundAt)||!Number.isFinite(flight.parkedAt))return null;
 if(now<flight.inboundAt)return flight.hold?holdPose(now,flight):null;
 if(flight.exitAt!=null&&now>=flight.exitAt)return null;
 const stand=flightStand(flight);
 if(!stand)return null;
 const outbound=flight.outboundAt!=null&&now>=flight.outboundAt;
 if(!outbound&&now>=flight.parkedAt)return {...stand,y:3,heading:0,phase:'parked'};
 if(!outbound&&flight.taxiHold)return {...flight.taxiHold.pose,heading:flight.taxiHold.pose.heading||0,phase:'taxi-hold'};
 if(!outbound&&flight.taxiRoute){
  const points=flight.taxiRoute;let i=points.findIndex(p=>p.at>now);if(i<0)i=points.length-1;i=Math.max(1,i);const a=points[i-1],b=points[i],t=Math.max(0,Math.min(1,(now-a.at)/Math.max(1,b.at-a.at)));
  return {x:a.x+(b.x-a.x)*t,y:3,z:a.z+(b.z-a.z)*t,heading:Math.atan2(b.x-a.x,b.z-a.z),phase:'taxi-in'};
 }
 const elapsed=now-(outbound?flight.outboundAt:flight.inboundAt);
 const path=flightPath(stand,flight,outbound);
 const index=Math.min(path.length-2, Math.max(0,path.findIndex(p=>p[0]>elapsed)-1));
 const a=path[index],b=path[index+1],u=Math.min(1,Math.max(0,(elapsed-a[0])/(b[0]-a[0])));
 const mix=(x,y)=>x+(y-x)*u;
 const heading=Math.atan2(b[1]-a[1],b[3]-a[3]);
 const phase=outbound?(elapsed<460?'taxi-out':elapsed<625?'takeoff':'departing'):(elapsed<VISITOR_TOUCHDOWN_SECONDS?'approach':elapsed<690?'landing':'taxi-in');
 return {x:mix(a[1],b[1]),y:mix(a[2],b[2]),z:mix(a[3],b[3]),heading,phase};
}
