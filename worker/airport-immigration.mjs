import {COUNTRY_AIRPORTS,COUNTRY_AIRPORT_ALIASES} from './country-map.mjs';

export const IMMIGRATION_SERVICE_SECONDS=420;
/** Interior positions shared by passenger movement and the visible e-gate furniture. */
export function airportImmigrationLayout(airportId='city'){
 const id=COUNTRY_AIRPORT_ALIASES[airportId]||airportId,airport=COUNTRY_AIRPORTS.find(p=>p.id===id);
 if(!airport)return null;
 const t=airport.terminal,axis=id==='north'?'x':'z',count=id==='city'?8:id==='north'?4:2,spacing=id==='city'?6:id==='north'?12:10;
 const entry=axis==='z'?{x:t.x,z:t.z-t.d/2+1}:{x:t.x-t.w/2+2,z:t.z};
 const gates=Array.from({length:count},(_,index)=>{
  const across=(index-(count-1)/2)*spacing,x=t.x+(axis==='z'?across:0),z=t.z+(axis==='x'?across:0),lead=id==='island'?4:5;
  return {id:`${id.toUpperCase()}-EGATE-${index+1}`,airportId:id,index,x,z,axis,width:1.8,depth:2.4,
   queue:{x:x-(axis==='x'?lead:0),z:z-(axis==='z'?lead:0)},exit:{x:x+(axis==='x'?4:0),z:z+(axis==='z'?4:0)}};
 });
 return {airportId:id,terminal:{...t},entry,serviceSeconds:IMMIGRATION_SERVICE_SECONDS,gates};
}
export function passengerImmigrationGate(airportId,index=0){
 const layout=airportImmigrationLayout(airportId);if(!layout)return null;
 const position=Math.max(0,Math.floor(Number(index)||0));
 const gate=layout.gates[position%layout.gates.length],queueIndex=Math.floor(position/layout.gates.length),back=Math.min(2.2,queueIndex*.55);
 return {...gate,queue:{x:gate.queue.x-(gate.axis==='x'?back:0),z:gate.queue.z-(gate.axis==='z'?back:0)},queueIndex,serviceSeconds:layout.serviceSeconds,gateCount:layout.gates.length,entry:layout.entry};
}
