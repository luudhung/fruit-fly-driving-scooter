import {AIRPORT,ISLAND} from './city-map.mjs';
import {COUNTRY_AIRPORTS,COUNTRY_AIRPORT_ALIASES} from './country-map.mjs';
export {HANSDREX_AIRLINE} from './hansdrex-airline.mjs';

// H$ prices are calibrated to the city's 4.4–7.4 H$/hour ordinary wages, not an FX conversion.
export const AVIATION={seats:10,checkInSeconds:1800,flightSeconds:1200,islandIntervalSeconds:14400,islandReturnOffsetSeconds:7200,heliSeats:3,heliSeconds:900};
export function tourismFares(priceLevel=1){
 const level=Math.min(10,Math.max(.25,Number(priceLevel)||1));
 return {oneWay:45*level,airportFee:6*level,roundTrip:90*level,resortNight:44*level,
  beachActivity:12*level,helicopter:185*level,currency:'H$'};
}
export function nextFlight(now,from='city',minimumLead=AVIATION.checkInSeconds){
 const interval=AVIATION.islandIntervalSeconds,offset=from==='city'?0:AVIATION.islandReturnOffsetSeconds;
 const departure=Math.ceil((now+minimumLead-offset)/interval)*interval+offset;
 return {id:`${from}-${departure}`,from,to:from==='city'?'island':'city',departure,arrival:departure+AVIATION.flightSeconds};
}
/** Match the published service without hiding older, already-paid flight IDs. */
export function isScheduledIslandFlight(flight){
 return Boolean(flight&&flight.id===`${flight.from}-${flight.departure}`&&(
  flight.from==='city'&&flight.to==='island'&&flight.departure%AVIATION.islandIntervalSeconds===0||
  flight.from==='island'&&flight.to==='city'&&flight.departure%AVIATION.islandIntervalSeconds===AVIATION.islandReturnOffsetSeconds));
}

export function airportById(id){return COUNTRY_AIRPORTS.find(p=>p.id===(COUNTRY_AIRPORT_ALIASES[id]||id))||null;}
/** Every pair has a durable ten-seat timetable; legacy city/island IDs stay valid. */
export function nextRegionalFlight(now,from,to,minimumLead=AVIATION.checkInSeconds){
 from=airportById(from)?.id;to=airportById(to)?.id;if(!from||!to||from===to)return null;
 if(from==='north'&&to==='island'||from==='island'&&to==='north')return null;
 if(from==='city'&&to==='island'||from==='island'&&to==='city')return nextFlight(now,from,minimumLead);
 const first=from==='north'?(to==='city'?8.75:9.75):from==='city'?9.75:8.75;
 for(let day=Math.floor(now/86400);day<=Math.floor(now/86400)+2;day++)for(let hour=first;hour<=21;hour+=2){const departure=day*86400+hour*3600;if(departure>=now+minimumLead)return{id:`${from}-${to}-${departure}`,from,to,departure,arrival:departure+AVIATION.flightSeconds};}
 return null;
}
export function regionalFlightPath(flight){
 const from=airportById(flight.from),to=airportById(flight.to|| (flight.from==='city'?'island':'city'));if(!from||!to)return null;
 const port=p=>{const r=p.runway,vertical=r.d>r.w,half=(vertical?r.d:r.w)/2-24,along=vertical?r.z:r.x,cross=vertical?r.x:r.z,taxi=vertical?cross+26:(p.taxiwayZ??cross+46),world=(a,c,y=3)=>vertical?[c,y,a]:[a,y,c],stand=p.stands.at(-1);return{stand:[stand.x,3,stand.z],taxiStand:world(vertical?stand.z:stand.x,taxi),taxiThreshold:world(along-half,taxi),threshold:world(along-half,cross),end:world(along+half,cross),climb:world(along+half+190,cross,110),approach:world(along-half-190,cross,110),taxiEnd:world(along+half,taxi)};};
 const a=port(from),b=port(to),mid=[(from.gate.x+to.gate.x)/2,260,(from.gate.z+to.gate.z)/2];
 return[a.stand,a.taxiStand,a.taxiThreshold,a.threshold,[a.end[0],4,a.end[2]],a.climb,mid,b.approach,b.threshold,b.end,b.taxiEnd,b.taxiStand,b.stand];
}
const mix=(a,b,t)=>a+(b-a)*t;
export function pathPose(points,progress){
 const u=Math.max(0,Math.min(.999999,progress))*(points.length-1),i=Math.floor(u),t=u-i;
 const a=points[i],b=points[i+1],smooth=t*t*(3-2*t);
 return {x:mix(a[0],b[0],smooth),y:mix(a[1],b[1],smooth),z:mix(a[2],b[2],smooth),heading:Math.atan2(b[0]-a[0],b[2]-a[2]),progress};
}
export function flightPose(now,flight){
 if(flight.regional||flight.from==='north'||flight.to==='north'||flight.from==='city'||flight.from==='island'){
  const points=regionalFlightPath(flight);if(!points)return null;
  if(now>=flight.arrival){const port=airportById(flight.to||(flight.from==='city'?'island':'city')),stand=port.stands.at(-1);return{...stand,y:3,heading:0,phase:'parked'};}
  return {...pathPose(points,(now-flight.departure)/Math.max(1,flight.arrival-flight.departure)),phase:now<flight.departure?'boarding':now>=flight.arrival?'arrived':'flying'};
 }
 const city=[AIRPORT.terminal.x,3,-420],island=[ISLAND.terminal.x,3,ISLAND.gate.z];
 const outbound=[city,[-315,3,-520],[-70,18,-520],[440,180,-430],[580,220,180],
  [530,180,620],[300,48,742],[35,3,742],island];
 const points=flight.from==='city'?outbound:[...outbound].reverse();
 return {...pathPose(points,(now-flight.departure)/AVIATION.flightSeconds),phase:now<flight.departure?'boarding':now>=flight.arrival?'arrived':'flying'};
}
export function scheduledAircraft(now){
 const interval=AVIATION.islandIntervalSeconds,cycle=Math.floor(now/interval)*interval;
 const from=now-cycle<AVIATION.islandReturnOffsetSeconds?'city':'island',departure=cycle+(from==='island'?AVIATION.islandReturnOffsetSeconds:0);
 const flight={id:`${from}-${departure}`,from,to:from==='city'?'island':'city',departure,arrival:departure+AVIATION.flightSeconds,regional:true};
 return {...flightPose(now,flight),...flight};
}
export function helicopterPose(now,start,end){
 const p=AIRPORT.helipad;
 return pathPose([[p.x,3,p.z],[p.x,80,p.z],[100,295,-260],[100,315,80],[-160,310,120],[-220,265,-260],[p.x,80,p.z],[p.x,3,p.z]],(now-start)/Math.max(1,end-start));
}
