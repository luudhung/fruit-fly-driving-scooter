import {AIRPORT,ISLAND} from './city-map.mjs';

// H$ prices are calibrated to the city's 4.4–7.4 H$/hour ordinary wages, not an FX conversion.
export const AVIATION={seats:15,checkInSeconds:1800,flightSeconds:1200,heliSeats:3,heliSeconds:900};
export function tourismFares(priceLevel=1){
 const level=Math.min(10,Math.max(.25,Number(priceLevel)||1));
 return {oneWay:45*level,airportFee:6*level,roundTrip:90*level,resortNight:44*level,
  beachActivity:12*level,helicopter:185*level,currency:'H$'};
}
export function nextFlight(now,from='city',minimumLead=AVIATION.checkInSeconds){
 const first=from==='city'?8:9,last=from==='city'?20:21;
 let day=Math.floor(now/86400);
 for(let d=day;d<=day+2;d++)for(let h=first;h<=last;h+=2){
  const departure=d*86400+h*3600;
  if(departure>=now+minimumLead)return {id:`${from}-${departure}`,from,to:from==='city'?'island':'city',departure,arrival:departure+AVIATION.flightSeconds};
 }
 throw new Error('No scheduled flight');
}
const mix=(a,b,t)=>a+(b-a)*t;
export function pathPose(points,progress){
 const u=Math.max(0,Math.min(.999999,progress))*(points.length-1),i=Math.floor(u),t=u-i;
 const a=points[i],b=points[i+1],smooth=t*t*(3-2*t);
 return {x:mix(a[0],b[0],smooth),y:mix(a[1],b[1],smooth),z:mix(a[2],b[2],smooth),heading:Math.atan2(b[0]-a[0],b[2]-a[2]),progress};
}
export function flightPose(now,flight){
 const city=[AIRPORT.terminal.x,3,-420],island=[ISLAND.terminal.x,3,ISLAND.gate.z];
 const outbound=[city,[-315,3,-520],[-70,18,-520],[440,180,-430],[580,220,180],
  [530,180,620],[300,48,742],[35,3,742],island];
 const points=flight.from==='city'?outbound:[...outbound].reverse();
 return {...pathPose(points,(now-flight.departure)/AVIATION.flightSeconds),phase:now<flight.departure?'boarding':now>=flight.arrival?'arrived':'flying'};
}
export function scheduledAircraft(now){
 const hour=Math.floor(((now%86400)+86400)%86400/3600),day=Math.floor(now/86400);
 if(hour<8||hour>21)return {...flightPose(0,{from:'city',departure:1,arrival:1201}),phase:'parked',from:'city'};
 const departure=day*86400+hour*3600,from=hour%2===0?'city':'island';
 const flight={id:`${from}-${departure}`,from,departure,arrival:departure+AVIATION.flightSeconds};
 if(now<flight.arrival)return {...flightPose(now,flight),...flight};
 const p=from==='city'?ISLAND.gate:{x:AIRPORT.terminal.x,z:-420};
 return {...p,y:3,heading:from==='city'?Math.PI/2:-Math.PI/2,phase:'parked',from};
}
export function helicopterPose(now,start,end){
 const p=AIRPORT.helipad;
 return pathPose([[p.x,3,p.z],[p.x,80,p.z],[100,295,-260],[100,315,80],[-160,310,120],[-220,265,-260],[p.x,80,p.z],[p.x,3,p.z]],(now-start)/Math.max(1,end-start));
}
