import {airportTerminalForStand,airportTerminalById,airportTerminalTransfer,airportDeparturePath} from './airport-campus.mjs';
import {aircraftPathTiming,timedAircraftPose} from './aircraft-speed.mjs';
import {passengerImmigrationGate} from './airport-immigration.mjs';
import {NORTH_F1_CHARTER_STANDS} from './north-f1-map.mjs';
import {AIRPORT} from './city-map.mjs';
import {AVIATION,nextRegionalFlight,airportById,regionalRunwayWindow} from './aviation.mjs';

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
export const visitorTerminalId=flight=>(flight.airportId||'city')==='city'?(flight.terminalId||'T1'):null;
const flightStand=flight=>flight.arrivalStand||(flight.airportId&&flight.airportId!=='city'?visitorStands(flight.airportId):VISITOR_STANDS).find(p=>p.id===flight.standId);

// A short, durable pedestrian itinerary, separate from the public street graph:
// aircraft door -> portable stairs -> apron -> terminal -> immigration -> exit.
const arrivalPaths=new WeakMap(),departurePaths=new WeakMap();
function passengerPath(cache,flight,index,timeScale,compute,departure=false){
 const stand=flightStand(flight),key=[flight.airportId,flight.terminalId,stand?.id,stand?.x,stand?.z,flight.parkedAt,flight.disembarkAt,departure?flight.boardingStartedAt:flight.disembarkAt??flight.parkedAt,timeScale].join('|');
 let entry=cache.get(flight);if(entry?.key!==key){entry={key,paths:new Map()};cache.set(flight,entry);}
 if(!entry.paths.has(index)){if(entry.paths.size>=32)entry.paths.clear();entry.paths.set(index,compute(flight,index,timeScale));}
 return entry.paths.get(index);
}
export function visitorArrivalPath(flight,index=0,timeScale=120){return passengerPath(arrivalPaths,flight,index,timeScale,computeArrivalPath);}
function computeArrivalPath(flight,index=0,timeScale=120) {
 const stand=flightStand(flight);
 if(!stand)return [];
 const speed=1.8/Math.max(1,timeScale),path=[];
 let at=Number(flight.disembarkAt??flight.parkedAt)+120+index*VISITOR_ARRIVAL_STAGGER;
 const add=(x,y,z,phase,wait=0,details={})=>{
  const previous=path.at(-1);
  if(previous)at+=Math.hypot(x-previous.x,y-previous.y,z-previous.z)/speed+wait;
  path.push({at,x,y,z,phase,...details});
 };
 const immigration=()=>{
  const gate=passengerImmigrationGate(flight.airportId||'city',index,visitorTerminalId(flight)),airport=visitorAirport(flight);
  add(gate.entry.x,1.1,gate.entry.z,'immigration');
  const detail={kioskId:gate.id,queueIndex:gate.queueIndex};
  add(gate.queue.x,1.1,gate.queue.z,'immigration',0,{...detail,stage:'queue'});
  // Stairs stagger alone is shorter than a scan. Later people in a lane wait
  // for the preceding scan, rather than occupying the same kiosk together.
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  const first=gate.queueIndex?passengerImmigrationGate(airport.id,index%gate.gateCount,visitorTerminalId(flight)):gate;
  const entryAt=path.at(-2).at,queueAt=path.at(-1).at;
  const firstScan=entryAt-gate.queueIndex*gate.gateCount*VISITOR_ARRIVAL_STAGGER+(distance(first.entry,first.queue)+distance(first.queue,first))/speed;
  const wait=Math.max(0,firstScan+gate.queueIndex*gate.serviceSeconds-queueAt-distance(gate.queue,gate)/speed);
  if(wait>1e-6)add(gate.queue.x,1.1,gate.queue.z,'immigration',wait,{...detail,stage:'queue'});
  add(gate.x,1.1,gate.z,'immigration',0,{...detail,stage:'scanning'});
  add(gate.x,1.1,gate.z,'immigration',gate.serviceSeconds,{...detail,stage:'cleared'});
  add(gate.exit.x,1.1,gate.exit.z,'immigration',0,{...detail,stage:'exit'});
  // Rejoin the clear centre aisle before crossing the narrow landside door.
  const t=gate.terminal||airport.terminal;
  add(t.x+(gate.axis==='x'?t.w/2-3:0),1.1,t.z+(gate.axis==='z'?t.d/2-3:0),'immigration',0,{stage:'concourse'});
  const exit=gate.publicGate||airport.gate;
  add(exit.x,1.1,exit.z,'immigration',0,{stage:'public-exit'});
  if(airport.id==='city'&&visitorTerminalId(flight)!=='T1'){
   const transfer=airportTerminalTransfer(visitorTerminalId(flight),'T1',at,timeScale);
   for(const p of transfer.waypoints)path.push({...p,phase:'terminal-transfer'});
   at=transfer.arrivalAt;
  }
  add(airport.gate.x,1.1,airport.gate.z,'complete');return path;
 };
 add(stand.x-1.4,3.4,stand.z+4,'disembarking');
 add(stand.x-6,1.1,stand.z+4,'disembarking');
 if(flight.airportId==='island'){
  const t=visitorAirport(flight).terminal,front=t.z-t.d/2-2;
  add(stand.x-6,1.1,front,'apron');add(t.x,1.1,front,'apron');
  return immigration();
 }
 if(flight.airportId&&flight.airportId!=='city'){
  const airport=visitorAirport(flight);
  add(airport.terminal.x-airport.terminal.w/2-2,1.1,stand.z+4,'apron');
  add(airport.terminal.x-airport.terminal.w/2-2,1.1,airport.terminal.z,'apron');
  return immigration();
 }
 add(stand.x-6,1.1,-414,'apron');
 const t=airportTerminalById(visitorTerminalId(flight));
 add(t.x,1.1,t.z-t.d/2-3,'apron');
 return immigration();
}

export function visitorArrivalCompleteAt(flight,count=MIN_VISITOR_PASSENGERS,timeScale=120){
 return Math.max(Number(flight.parkedAt)||0,...Array.from({length:Math.max(0,Math.floor(count))},(_,index)=>visitorArrivalPath(flight,index,timeScale).at(-1)?.at||0));
}
export function visitorStairsClearAt(flight,count=MIN_VISITOR_PASSENGERS,timeScale=120){
 return Math.max(Number(flight.parkedAt)||0,...Array.from({length:Math.max(0,Math.floor(count))},(_,index)=>visitorArrivalPath(flight,index,timeScale)[1]?.at||0));
}

/** A finite, timed walking itinerary lets viewers animate between snapshots,
 * including exact queue/scan pauses, without advancing admission or payments. */
export function visitorArrivalMotion(now,flight,index=0,timeScale=120){
 const path=visitorArrivalPath(flight,index,timeScale);
 if(!path.length||now<path[0].at||now>=path.at(-1).at)return null;
 return {at:now,speed:1.8,mode:'walk',timed:true,points:path.map(({x,y,z,at})=>({x,y,z,at}))};
}

/** Departures use the upstairs check-in hall; arrivals remain downstairs. */
export function visitorDeparturePath(flight,index=0,timeScale=120){return passengerPath(departurePaths,flight,index,timeScale,computeDeparturePath,true);}
function computeDeparturePath(flight,index=0,timeScale=120){
 if(!Number.isFinite(flight.boardingStartedAt))return [];
 if((flight.airportId||'city')!=='city'||!flight.terminalId){
  const reverse=visitorArrivalPath(flight,index,timeScale).toReversed();if(!reverse.length)return [];
  const end=reverse[0].at;
  return reverse.map(p=>({...p,at:flight.boardingStartedAt+end-p.at,phase:'boarding'}));
 }
 const path=[],speed=1.8/Math.max(1,timeScale);let at=flight.boardingStartedAt+index*VISITOR_ARRIVAL_STAGGER;
 const add=p=>{const previous=path.at(-1);if(previous)at+=Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z)/speed;
  path.push({...p,at,phase:'boarding'});
  if(p.stage==='departure-check-in'||p.stage==='departure-security'){at+=180;path.push({...p,at,phase:'boarding'});}};
 if(flight.terminalId!=='T1'){
  const transfer=airportTerminalTransfer('T1',flight.terminalId,at,timeScale);
  for(const p of transfer.waypoints)path.push({...p,phase:'boarding'});
  at=transfer.arrivalAt;
 }
 for(const p of airportDeparturePath(flight.arrivalStand||flight.standId,flight.terminalId))add(p);
 return path;
}
export function visitorDepartureCompleteAt(flight,count=10,timeScale=120){
 return Math.max(Number(flight.boardingStartedAt)||0,...Array.from({length:count},(_,i)=>visitorDeparturePath(flight,i,timeScale).at(-1)?.at||0));
}
export function visitorBoardingPose(now,flight,index=0,timeScale=120){
 const path=visitorDeparturePath(flight,index,timeScale);if(!path.length)return null;
 if(now>=path.at(-1).at){
  const pose=visitorAircraftPose(now,flight);
  // A parked aircraft pose includes its stand's id. Never merge that identity
  // into the passenger: ten people must remain ten independently tracked guests.
  return pose?{x:pose.x,y:pose.y,z:pose.z,heading:pose.heading,onPlane:true}:{onPlane:true};
 }
 const i=path.findIndex(p=>p.at>now);if(i<=0)return {...path[0],onPlane:false};
 const a=path[i-1],b=path[i],u=Math.max(0,Math.min(1,(now-a.at)/Math.max(1,b.at-a.at)));
 return{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u,onPlane:false};
}
export function visitorBoardingMotion(now,flight,index=0,timeScale=120){
 const path=visitorDeparturePath(flight,index,timeScale);if(!path.length||now>=path.at(-1).at)return null;
 return {at:now,speed:1.8,mode:'walk',timed:true,points:path.map(({x,y,z,at})=>({x,y,z,at}))};
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
// Timetables are immutable; reuse their daily runway windows across stand trials.
// Bound this geometry-only cache so many old events cannot retain growing state.
const regionalOperationWindows=new Map();
function regionalOperations(start,after,airportId){
 const first=Math.floor((start-40000-SEPARATION)/86400),last=Math.floor(after/86400),key=`${airportId}|${first}|${last}`;
 if(regionalOperationWindows.has(key))return regionalOperationWindows.get(key);
 const primary=visitorRunways(airportId)[0]?.id,operations=[];
 for(const from of ['city','north','island'])for(const to of ['city','north','island']){
  if(from===to||from!==airportId&&to!==airportId)continue;
  let f=nextRegionalFlight(first*86400,from,to,0);
  while(f&&f.departure<(last+1)*86400){
   const ground=regionalRunwayWindow(f,airportId);operations.push({start:ground[0],end:ground[1],runwayId:primary,ground});
   f=nextRegionalFlight(f.departure+1,from,to,0);
  }
 }
 if(regionalOperationWindows.size>=64)regionalOperationWindows.delete(regionalOperationWindows.keys().next().value);
 regionalOperationWindows.set(key,operations);return operations;
}
function reservedOperations(flights,airportId){
 const primary=visitorRunways(airportId)[0]?.id,operations=[];
 for(const f of flights){
  if((f.airportId||'city')!==airportId||f.aircraftGone)continue;
  const runwayId=f.runwayId||primary;
  if(Number.isFinite(f.inboundAt)&&Number.isFinite(f.parkedAt))operations.push({start:f.inboundAt,end:f.parkedAt,runwayId,ground:f.motionVersion>=1?visitorRunwayTiming(f,false).ground.map(t=>f.inboundAt+t):groundWindow(f.inboundAt,INBOUND_SECONDS)});
  if(Number.isFinite(f.outboundAt)&&Number.isFinite(f.exitAt))operations.push({start:f.outboundAt,end:f.exitAt,runwayId,ground:f.motionVersion>=1?visitorRunwayTiming(f,true).ground.map(t=>f.outboundAt+t):groundWindow(f.outboundAt,OUTBOUND_SECONDS)});
 }
 return operations;
}
export function visitorRunwaySlot(earliest,duration,flights,airportId='city',runwayId=visitorRunways(airportId)[0]?.id,timing=null,reserved=null){
 let start=earliest;const fixed=reserved||reservedOperations(flights,airportId);
 for(let tries=0;tries<10000;tries++){
  const after=start+duration+SEPARATION,ground=timing?timing.ground.map(t=>start+t):groundWindow(start,duration);
  let next=start;
  for(const operations of [fixed,regionalOperations(start,after,airportId)])for(const op of operations){
   const runwayStart=timing?ground[0]:start,runwayEnd=timing?ground[1]:after,opStart=timing?op.ground[0]:op.start,opEnd=timing?op.ground[1]:op.end;
   if(op.runwayId===runwayId&&opStart<runwayEnd+SEPARATION&&opEnd+SEPARATION>runwayStart)next=Math.max(next,opEnd+SEPARATION-(runwayStart-start));
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
 if(Number.isFinite(flight.outboundAt))return flight.outboundAt+visitorStandReleaseSeconds(flight);
 return Number.isFinite(flight.expectedStandReleaseAt)?flight.expectedStandReleaseAt:Infinity;
}
function terminalStandRanks(flights,airportId,at){
 const stands=visitorStands(airportId),capacity=new Map(),occupied=new Map(),scheduled=new Map(),uses=new Map();
 const terminal=stand=>airportId==='city'?airportTerminalForStand(stand).id:airportId;
 for(const stand of stands){const id=terminal(stand);capacity.set(id,(capacity.get(id)||0)+1);}
 for(const flight of flights){
  if(flight.aircraftGone||(flight.airportId||'city')!==airportId)continue;
  const stand=flightStand(flight);if(!stand)continue;const id=terminal(stand);
  uses.set(stand.id,(uses.get(stand.id)||0)+1);scheduled.set(id,(scheduled.get(id)||0)+1);
  if(Number.isFinite(flight.parkedAt)&&flight.parkedAt<=at&&visitorStandReleaseAt(flight)>at)occupied.set(id,(occupied.get(id)||0)+1);
 }
 return stand=>{const id=terminal(stand),size=capacity.get(id)||1;return[(occupied.get(id)||0)/size,(scheduled.get(id)||0)/size,uses.get(stand.id)||0];};
}
export function visitorStandReservation(earliest,flights,airportId='city',groundStay=21600,profile=null){
 const all=flights.filter(f=>(f.airportId||'city')===airportId&&!f.aircraftGone),operations=reservedOperations(all,airportId),runways=visitorRunways(airportId);
 const choices=[];
 for(const stand of visitorStands(airportId)){
  // A stand's geometry does not change while searching later available times.
  const timings=runways.map(r=>{const candidate={...profile,airportId,arrivalStand:stand,standId:stand.id,runwayId:r.id},timing=profile?.motionVersion>=1?visitorRunwayTiming(candidate,false):null;return{runwayId:r.id,timing,duration:timing?.duration||INBOUND_SECONDS,distance:Math.hypot(stand.x-r.x,stand.z-r.z)};});
  let at=earliest;
  for(let tries=0;tries<all.length+20;tries++){
   const choicesForRunway=timings.map(r=>({...r,at:visitorRunwaySlot(at,r.duration,all,airportId,r.runwayId,r.timing,operations)}));
   const runway=choicesForRunway.sort((a,b)=>a.at-b.at||a.distance-b.distance)[0];if(!runway)break;
   at=runway.at;const parked=at+runway.duration,end=parked+groundStay;
   const conflict=all.filter(f=>{const other=flightStand(f);return other&&Math.hypot(other.x-stand.x,other.z-stand.z)<24&&Number(f.parkedAt||f.inboundAt)<end&&visitorStandReleaseAt(f)>parked;});
   if(!conflict.length){choices.push({at:runway.at,runwayId:runway.runwayId,duration:runway.duration,stand:{...stand}});break;}
   const until=Math.max(...conflict.map(visitorStandReleaseAt));if(!Number.isFinite(until))break;
   at=Math.max(at+1,until+120-runway.duration);
  }
 }
 // Never delay a safe landing merely to fill a preferred terminal. Among equally
 // early slots, fill the least occupied terminal, then spread future bookings.
 if(airportId!=='city')return choices.sort((a,b)=>a.at-b.at||a.stand.id.localeCompare(b.stand.id))[0]||null;
 const rank=terminalStandRanks(all,airportId,earliest);
 for(const choice of choices)choice.rank=rank(choice.stand);
 const selected=choices.sort((a,b)=>a.at-b.at||a.rank[0]-b.rank[0]||a.rank[1]-b.rank[1]||a.rank[2]-b.rank[2]||a.stand.id.localeCompare(b.stand.id,undefined,{numeric:true}))[0];
 if(!selected)return null;const {rank:unused,...reservation}=selected;return reservation;
}

/** Once wheels are down, a late stand release is handled on the taxiway.
 * Never send a landed aircraft back into the airborne holding pattern. */
export function resolveVisitorTaxiStand(flight,flights,now){
 if(flight.aircraftGone||flight.landed||flight.landedAt!=null||!Number.isFinite(flight.inboundAt)||now<flight.inboundAt+visitorRunwayClearSeconds(flight))return false;
 const occupied=stand=>flights.some(f=>f!==flight&&!f.aircraftGone&&(f.airportId||'city')===(flight.airportId||'city')&&flightStand(f)&&Math.hypot(flightStand(f).x-stand.x,flightStand(f).z-stand.z)<24&&Number(f.parkedAt)<Math.max(now+330,visitorStandReleaseAt(flight))&&visitorStandReleaseAt(f)>Math.max(now,flight.inboundAt+visitorRunwayClearSeconds(flight)));
 const current=flightStand(flight);
 if(current&&!occupied(current)&&!flight.taxiHold){flight.taxiStandChecked=true;return false;}
 const rank=terminalStandRanks(flights,flight.airportId||'city',now);
 const free=visitorStands(flight.airportId||'city').filter(p=>!occupied(p)).sort((a,b)=>{const x=rank(a),y=rank(b),balance=(flight.airportId||'city')==='city'?(x[0]-y[0]||x[1]-y[1]):0;return balance||Math.hypot(a.x-(current?.x||0),a.z-(current?.z||0))-Math.hypot(b.x-(current?.x||0),b.z-(current?.z||0));})[0];
 const checkedAt=flight.taxiStandChecked?now:Math.min(now,flight.inboundAt+visitorRunwayClearSeconds(flight));
 const pose=flight.taxiHold?.pose||visitorAircraftPose(checkedAt,flight);
 if(!pose)return false;
 if(!free){flight.taxiHold||={at:now,pose};flight.parkedAt=Math.max(flight.parkedAt,now+330);return true;}
 const start=flight.taxiHold?now:checkedAt,taxi=visitorFlightRunway(flight).taxiwayZ??visitorAirport(flight).taxiwayZ??VISITOR_TAXIWAY_Z;
 const points=[{...pose,at:start}],add=(x,z)=>{const p=points.at(-1);points.push({x,y:3,z,at:p.at+Math.max(30,Math.hypot(x-p.x,z-p.z)*(flight.motionVersion>=1?20:2))});};
 if(!flight.taxiRoute&&!flight.taxiStandChecked)for(const step of flightPath(current||free,flight,false).filter(p=>p[0]>690&&p[0]<=820))add(step[1],step[3]);
 else add(pose.x,taxi);
 add(free.x,taxi);add(free.x,free.z);
 flight.standId=free.id;if(flight.motionVersion>=2&&(flight.airportId||'city')==='city')flight.terminalId=airportTerminalForStand(free).id;flight.arrivalStand={...free};flight.taxiRoute=points;flight.parkedAt=points.at(-1).at;delete flight.taxiHold;flight.taxiStandChecked=true;return true;
}

const holdingPaths=new WeakMap();
function holdPose(now, flight) {
 const [farX,farY,farZ]=FAR[flight.sector]||FAR.north;
 const hold=flight.hold;
 const elapsed=Math.max(0,now-hold.at);
 if(flight.motionVersion>=2){
  const key=[hold.at,hold.x,hold.y,hold.z,flight.sector].join('|');let cached=holdingPaths.get(flight);
  if(cached?.key!==key){cached={key,path:aircraftPathTiming([[hold.x,hold.y,hold.z],[farX,farY,farZ]])};holdingPaths.set(flight,cached);}
  const duration=cached.path.at(-1)[0];
  if(elapsed<duration)return {...timedAircraftPose(cached.path,elapsed),phase:'holding'};
  const angle=(elapsed-duration)/120*33/90;
  return{x:farX+90*(1-Math.cos(angle)),y:farY,z:farZ+90*Math.sin(angle),heading:angle,phase:'holding'};
 }
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
  const airport=visitorAirport(flight),r=airport.runway,vertical=r.d>r.w,half=(vertical?r.d:r.w)/2-24,along=vertical?r.z:r.x,cross=vertical?r.x:r.z,taxi=vertical?cross+26:(airport.taxiwayZ??cross+46),point=(time,a,c,y=3)=>vertical?[time,c,y,a]:[time,a,y,c],entry=along-direction*half,exit=along+direction*half,standAlong=vertical?stand.z:stand.x;
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

const timedPaths=new WeakMap(),timedShapes=new Map();
export function visitorRunwayTiming(flight,outbound=false){
 const stand=flightStand(flight)||visitorStands(flight.airportId||'city')[0],key=[outbound,flight.motionVersion,flight.airportId||'city',stand?.id,stand?.x,stand?.z,flight.runwayId,flight.sector,flight.direction,...(!outbound&&flight.hold?[flight.hold.at,flight.hold.x,flight.hold.y,flight.hold.z,flight.inboundAt]:[])].join('|');
 const index=outbound?1:0;let cache=timedPaths.get(flight);if(cache?.[index]?.key===key)return cache[index].value;
 let value=timedShapes.get(key);
 if(!value){
  const raw=flightPath(stand,flight,outbound),path=aircraftPathTiming(raw.map(p=>p.slice(1)),i=>outbound?raw[i][0]<=460:raw[i-1][0]>=690,flight.motionVersion===1?{cruiseSpeed:22,accelerate:false}:{}),at=time=>path[raw.findIndex(p=>p[0]===time)][0];
  value={path,duration:path.at(-1)[0],touchdown:outbound?0:at(VISITOR_TOUCHDOWN_SECONDS),clear:outbound?at(625):at(690),release:outbound?at(140):0,runwayEnter:outbound?at(460):0,ground:outbound?[at(460),at(625)]:[at(VISITOR_TOUCHDOWN_SECONDS),at(690)]};
  if(timedShapes.size>=512)timedShapes.delete(timedShapes.keys().next().value);timedShapes.set(key,value);
 }
 if(!cache){cache=[];timedPaths.set(flight,cache);}cache[index]={key,value};return value;
}
export const visitorTouchdownSeconds=f=>f.motionVersion>=1?visitorRunwayTiming(f).touchdown:VISITOR_TOUCHDOWN_SECONDS;
export const visitorRunwayClearSeconds=f=>f.motionVersion>=1?visitorRunwayTiming(f).clear:690;
export const visitorStandReleaseSeconds=f=>f.motionVersion>=1?visitorRunwayTiming(f,true).release:140;
export const visitorFlightDuration=(f,outbound=false)=>f.motionVersion>=1?visitorRunwayTiming(f,outbound).duration:outbound?OUTBOUND_SECONDS:INBOUND_SECONDS;

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
 const path=flight.motionVersion>=1?visitorRunwayTiming(flight,outbound).path:flightPath(stand,flight,outbound);
 const index=Math.min(path.length-2, Math.max(0,path.findIndex(p=>p[0]>elapsed)-1));
 const a=path[index],b=path[index+1],u=Math.min(1,Math.max(0,(elapsed-a[0])/(b[0]-a[0])));
 const mix=(x,y)=>x+(y-x)*u;
 const heading=Math.atan2(b[1]-a[1],b[3]-a[3]);
 const timing=flight.motionVersion>=1?visitorRunwayTiming(flight,outbound):null;
 const phase=outbound?(elapsed<(timing?.runwayEnter??460)?'taxi-out':elapsed<(timing?.clear??625)?'takeoff':'departing'):(elapsed<(timing?.touchdown??VISITOR_TOUCHDOWN_SECONDS)?'approach':elapsed<(timing?.clear??690)?'landing':'taxi-in');
 return {...(flight.motionVersion>=1?timedAircraftPose(path,elapsed):{x:mix(a[1],b[1]),y:mix(a[2],b[2]),z:mix(a[3],b[3]),heading}),phase};
}
