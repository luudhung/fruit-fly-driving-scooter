import {HANSDREX_AIRPORT} from './hansdrex-airport-map.mjs';
import {airportTerminalPassengerLayout} from './airport-terminal-layout.mjs';

export const AIRPORT_TERMINAL_RAIL={id:'HCA-FREE',fare:0,speed:14,dwell:10,y:5.42,z:-365,trackOffset:4};
export const AIRPORT_TERMINAL_STATIONS=HANSDREX_AIRPORT.terminals.map(t=>({id:`HCA-${t.id}`,terminalId:t.id,x:t.x,z:AIRPORT_TERMINAL_RAIL.z,y:6.52}));
export function airportTerminalForStand(standOrId){
 const id=typeof standOrId==='string'?standOrId:standOrId?.id;
 const stand=HANSDREX_AIRPORT.stands.find(s=>s.id===id);
 return HANSDREX_AIRPORT.terminals.find(t=>t.id===stand?.terminalId)||HANSDREX_AIRPORT.terminals[0];
}
export function airportTerminalById(id='T1'){return HANSDREX_AIRPORT.terminals.find(t=>t.id===id)||HANSDREX_AIRPORT.terminals[0];}
/** Exact stair/upper-floor/bridge positions also used by the static terminal meshes. */
export function airportTerminalAccess(id='T1'){
 const t=airportTerminalById(id),stairX=t.x+t.w/2-5;
 return [{x:t.gate.x,y:1.1,z:t.gate.z},{x:t.x,y:1.1,z:t.z+7},{x:stairX,y:1.1,z:t.z+6},{x:stairX,y:6.52,z:t.z-6},{x:t.x,y:6.52,z:t.z-6},{x:t.x,y:6.52,z:t.z+8},{x:t.x,y:6.52,z:AIRPORT_TERMINAL_RAIL.z}];
}
export function airportTerminalUpperAccess(id='T1'){
 const t=airportTerminalById(id);
 return [{x:t.x,y:6.52,z:t.z+6},{x:t.x,y:6.52,z:t.z+8},{x:t.x,y:6.52,z:AIRPORT_TERMINAL_RAIL.z}];
}

/** Accepted older boarding plans retain their exact pre-upgrade stairs/timing. */
function legacyAirportDeparturePath(standOrId,terminalId,{upperStart=false}={}){
 const stand=typeof standOrId==='string'?HANSDREX_AIRPORT.stands.find(s=>s.id===standOrId):standOrId;
 if(!stand||!Number.isFinite(stand.x)||!Number.isFinite(stand.z))return [];
 const t=terminalId?airportTerminalById(terminalId):airportTerminalForStand(stand),left=t.x-t.w/2+5;
 const path=upperStart?[{...airportTerminalUpperAccess(t.id)[0],stage:'departure-upper-entrance'}]:airportTerminalAccess(t.id).slice(0,4).map(p=>({...p,stage:'departure-stairs-up'}));
 path.push({x:t.x-8,y:6.52,z:t.z+6,stage:'departure-check-in'},
  {x:t.x-14,y:6.52,z:t.z+6,stage:'departure-security-queue'},
  {x:t.x-20,y:6.52,z:t.z+6,stage:'departure-security'},
  {x:t.x-26,y:6.52,z:t.z+6,stage:'departure-concourse'},
  {x:left,y:6.52,z:t.z+6,stage:'departure-airside-stairs'},
  {x:left,y:1.1,z:t.z-6,stage:'departure-airside-stairs'},
  {x:t.x,y:1.1,z:t.z-7,stage:'departure-airside'},
  {x:t.x,y:1.1,z:t.z-11,stage:'departure-airside'},
  {x:stand.x-6,y:1.1,z:-414,stage:'departure-apron'},
  {x:stand.x-6,y:1.1,z:stand.z+4,stage:'departure-boarding-stairs'},
  {x:stand.x-1.4,y:3.4,z:stand.z+4,stage:'departure-aircraft-door'});
 return path;
}
/** Departures approach the dedicated side stair outside the arrivals hall. */
export function airportTerminalDepartureAccess(id='T1'){
 const t=airportTerminalById(id),l=airportTerminalPassengerLayout(t),p=l.landside;
 return [{x:t.gate.x,y:l.groundY,z:t.gate.z},p.approach,p.entry,p.foot,p.top,p.turn,p.door,p.inside,p.corridor,p.upperEntrance];
}
/** Upstairs exit-passport control leads through the rear door to exterior stairs;
 * arrivals' floor-one immigration hall is never part of this departure path. */
export function airportDeparturePath(standOrId,terminalId,{upperStart=false,legacy=false}={}){
 if(legacy)return legacyAirportDeparturePath(standOrId,terminalId,{upperStart});
 const stand=typeof standOrId==='string'?HANSDREX_AIRPORT.stands.find(s=>s.id===standOrId):standOrId;
 if(!stand||!Number.isFinite(stand.x)||!Number.isFinite(stand.z))return [];
 const t=terminalId?airportTerminalById(terminalId):airportTerminalForStand(stand),l=airportTerminalPassengerLayout(t);
 const path=upperStart?[{...l.landside.upperEntrance,stage:'departure-upper-entrance'}]:airportTerminalDepartureAccess(t.id).map(p=>({...p,stage:'departure-stairs-up'}));
 path.push(...l.departureControls,
  {...l.airside.door,stage:'departure-airside-door'},
  {...l.airside.landing,stage:'departure-airside-landing'},
  {...l.airside.foot,stage:'departure-airside-stairs'},
  {...l.airside.apron,stage:'departure-apron'},
  {x:stand.x-6,y:l.groundY,z:l.airside.apron.z,stage:'departure-apron'},
  {x:stand.x-6,y:l.groundY,z:stand.z+4,stage:'departure-boarding-stairs'},
  {x:stand.x-1.4,y:3.4,z:stand.z+4,stage:'departure-aircraft-door'});
 return path;
}
export const AIRPORT_TAXI_BAYS=HANSDREX_AIRPORT.terminals.flatMap(t=>[-1,1].map((side,i)=>({id:`${t.id}-${i?'DROPOFF':'PICKUP'}`,terminalId:t.id,kind:i?'dropoff':'pickup',x:t.x+side*22,z:-372,w:18,d:4,access:{x:t.x+side*22,z:t.id==='T3'||t.id==='T4'?-365:-355},walk:[{x:t.gate.x,y:1.1,z:t.gate.z},{x:t.x+side*22,y:1.1,z:-376},{x:t.x+side*22,y:1.1,z:-375}]})));

const sequence=direction=>direction>0?AIRPORT_TERMINAL_STATIONS:[...AIRPORT_TERMINAL_STATIONS].reverse();
function timetable(direction){
 const stations=sequence(direction),visits=[];let at=0;
 for(let i=0;i<stations.length;i++){
  visits.push({station:stations[i],at,until:at+AIRPORT_TERMINAL_RAIL.dwell});at+=AIRPORT_TERMINAL_RAIL.dwell;
  if(i<stations.length-1)at+=Math.abs(stations[i+1].x-stations[i].x)/AIRPORT_TERMINAL_RAIL.speed;
 }
 return {visits,cycle:at+12};
}
const schedules=[timetable(1),timetable(-1)];
export function airportTerminalTrainStates(seconds){
 return [1,-1].map((direction,index)=>{
  const schedule=schedules[index],phase=((seconds%schedule.cycle)+schedule.cycle)%schedule.cycle,visits=schedule.visits;
  // The existing return slot belongs to an empty express movement, not an
  // invisible reset. Keep the timetable of already booked transfers unchanged.
  if(phase>=visits.at(-1).until){
   const last=visits.at(-1),first=visits[0],u=(phase-last.until)/(schedule.cycle-last.until);
   return {id:`HCA-FREE-${direction>0?'A':'B'}`,direction:-direction,fare:0,x:last.station.x+(first.station.x-last.station.x)*u,y:AIRPORT_TERMINAL_RAIL.y,z:AIRPORT_TERMINAL_RAIL.z+direction*AIRPORT_TERMINAL_RAIL.trackOffset,heading:direction>0?-Math.PI/2:Math.PI/2,dwelling:false,stationId:null,visible:true,returning:true};
  }
  const i=visits.findIndex(v=>phase<v.until),current=visits[i<0?visits.length-1:i],previous=visits[Math.max(0,i-1)];
  const dwelling=i>=0&&phase>=current.at,progress=dwelling||i===0||i<0?1:Math.max(0,Math.min(1,(phase-previous.until)/(current.at-previous.until)));
  return {id:`HCA-FREE-${direction>0?'A':'B'}`,direction,fare:0,x:progress===1?current.station.x:previous.station.x+(current.station.x-previous.station.x)*progress,y:AIRPORT_TERMINAL_RAIL.y,z:AIRPORT_TERMINAL_RAIL.z+direction*AIRPORT_TERMINAL_RAIL.trackOffset,heading:direction>0?Math.PI/2:-Math.PI/2,dwelling,stationId:dwelling?current.station.id:null,visible:true,returning:false};
 });
}
/** A real zero-fare departure after the caller reaches the platform; no money mutation. */
export function airportTerminalTransfer(fromId,toId,at=0,timeScale=120,{upperStart=false,upperEnd=false}={}){
 const from=airportTerminalById(fromId),to=airportTerminalById(toId);if(from.id===to.id)return {fare:0,arrivalAt:at,waypoints:[]};
 const scale=Math.max(1,timeScale),speed=1.8/scale,direction=to.x>from.x?1:-1,schedule=schedules[direction>0?0:1],origin=schedule.visits.find(v=>v.station.terminalId===from.id),destination=schedule.visits.find(v=>v.station.terminalId===to.id);
 let time=at;const waypoints=[];
 const add=(p,stage,when)=>{const prev=waypoints.at(-1);if(when===undefined&&prev)time+=Math.hypot(p.x-prev.x,p.z-prev.z,p.y-prev.y)/speed;else if(when!==undefined)time=when;waypoints.push({...p,at:time,mode:'walk',stage,lineId:AIRPORT_TERMINAL_RAIL.id,fare:0});};
 for(const p of (upperStart?airportTerminalUpperAccess(from.id):airportTerminalAccess(from.id)))add(p,upperStart?'terminal-upper-access':'terminal-stairs-up');
 const earliest=time/scale+4/1.8,cycle=Math.max(0,Math.ceil((earliest-origin.at)/schedule.cycle)),depart=cycle*schedule.cycle+origin.at;
 const board={x:from.x,y:6.52,z:AIRPORT_TERMINAL_RAIL.z+direction*4};
 add(board,'terminal-train-board',depart*scale);
 add(board,'terminal-train-departure',(cycle*schedule.cycle+origin.until)*scale);
 for(const visit of schedule.visits.filter(v=>direction>0?v.station.x>from.x&&v.station.x<=to.x:v.station.x<from.x&&v.station.x>=to.x)){
  const point={...visit.station,z:board.z};
  add(point,'terminal-train',(cycle*schedule.cycle+visit.at)*scale);
  if(visit!==destination)add(point,'terminal-train-departure',(cycle*schedule.cycle+visit.until)*scale);
 }
 add({x:to.x,y:6.52,z:AIRPORT_TERMINAL_RAIL.z},'terminal-train-alight');
 for(const p of [...(upperEnd?airportTerminalUpperAccess(to.id):airportTerminalAccess(to.id))].reverse())add(p,upperEnd?'terminal-upper-access':'terminal-stairs-down');
 return {fare:0,trainId:`HCA-FREE-${direction>0?'A':'B'}`,direction,arrivalAt:time,waypoints};
}
