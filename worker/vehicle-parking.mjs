import {PARKING_SPACES,parkingPoint,urbanGeometryRevision} from './city-map.mjs';
import {countryAt} from './country-map.mjs';

/** The same guest/car must reserve space across residents, tourism and freight. */
export function roadActors(s){
 const actors=[...(s.flies||[]),...(s.cityVisitors?.visitors||[])];
 for(const event of [...(s.northF1?.previousTours||[]),s.northF1?.event,...(s.worldCup?.previousTours||[]),s.worldCup?.event].filter(Boolean))
  for(const flight of event.charters||[])for(const f of flight.guests||[])if(!['departed','denied','cancelled'].includes(f.phase))actors.push(f);
 return [...new Map(actors.map(f=>[f.id,f])).values()];
}
let revision=-1,count=-1;const bins=new Map(),CELL=8;
function refresh(){
 if(revision===urbanGeometryRevision&&count===PARKING_SPACES.length)return;
 revision=urbanGeometryRevision;count=PARKING_SPACES.length;bins.clear();
 for(const p of PARKING_SPACES){const key=`${Math.floor(p.x/CELL)},${Math.floor(p.z/CELL)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(p);}
}
function overlapsCar(a,b){
 const ah=Number(a.heading||0),bh=Number(b.heading||0),ax=Math.sin(ah),az=Math.cos(ah),bx=Math.sin(bh),bz=Math.cos(bh),dx=b.x-a.x,dz=b.z-a.z;
 for(const [x,z]of [[ax,az],[az,-ax],[bx,bz],[bz,-bx]]){
  const extent=Number(a.vehicleLength||4.5)/2*Math.abs(x*ax+z*az)+Number(b.vehicleLength||4.5)/2*Math.abs(x*bx+z*bz)+.98*(Math.abs(x*az-z*ax)+Math.abs(x*bz-z*bx));
  if(Math.abs(dx*x+dz*z)>=extent)return false;
 }
 return true;
}
export function occupyParking(taken,p){
 if(!p)return;refresh();if(p.spaceId||p.id)taken.add(p.spaceId||p.id);
 for(let x=Math.floor((p.x-10)/CELL);x<=Math.floor((p.x+10)/CELL);x++)for(let z=Math.floor((p.z-10)/CELL);z<=Math.floor((p.z+10)/CELL);z++)
  for(const q of bins.get(`${x},${z}`)||[]){
   const horizontal=Math.abs(Math.sin(Number(p.heading||0)))>.7;
   const along=Math.abs(horizontal?q.x-p.x:q.z-p.z),across=Math.abs(horizontal?q.z-p.z:q.x-p.x);
   // Keep an aligned opposite bay free for the departure/arrival turning arc.
   if(overlapsCar(p,q)||along<4.6&&across<9)taken.add(q.id);
  }
}
export function parkingReservations(s,skip){
 const taken=new Set();
 for(const f of roadActors(s)){
  if(!f.alive||f.id===skip||f.departed)continue;
  if(!f.traveling||f.transitMode!=='car')occupyParking(taken,f.parkedCar);
  else occupyParking(taken,{x:f.x,z:f.z,heading:Math.atan2(Number(f.vx||0),Number(f.vz||0))});
  occupyParking(taken,f.destinationParking);
 }
 for(const truck of [...(s.industrialEconomy?.trucks||[]),...(s.regionalFreight?.trucks||[]),...(s.internationalEconomy?.trucks||[])]){
  if(truck.id===skip)continue;
  occupyParking(taken,{...truck,vehicleLength:truck.vehicleLength||6.4});
  for(const p of [truck.destinationParking||truck.parking,truck.returnParking])if(p)occupyParking(taken,{...p,vehicleLength:truck.vehicleLength||6.4});
 }
 return taken;
}
export function parkingInCountry(p,reserved=new Set()){
 const taken=new Set(reserved),country=countryAt(p);
 // A crowded grandstand may fill its curb. Overflow stays in the destination's
 // country; it must not put a parked vehicle across immigration or in the river.
 for(const q of PARKING_SPACES)if(countryAt(q)!==country)taken.add(q.id);
 return parkingPoint(p,taken);
}

export function reserveRoadParking(s,f,p){const point=parkingInCountry(p,parkingReservations(s,f.id));return point?{...point,...(f.vehicleLength?{vehicleLength:f.vehicleLength}: {})}:null;}

/** Actual road vehicles from every simulation subsystem; driver bodies riding
 * inside those vehicles are excluded by createVehicleIndex. */
export function trafficActors(s){
 const fleet=s.urbanWorld?.fireService;
 const publicVehicles=[...(fleet?.engines||[]),...(fleet?.ambulances||[])].map(e=>({...e,collisionOwner:e,alive:true,transitMode:'car',traveling:!['idle','loading','awaiting-relief'].includes(e.phase),parkedCar:['idle','loading'].includes(e.phase)?{x:e.x,z:e.z,heading:e.heading}:null,vehicle:'emergency vehicle car'}));
 return [...new Map([...roadActors(s),...(s.industrialEconomy?.trucks||[]),...(s.regionalFreight?.trucks||[]),...(s.internationalEconomy?.trucks||[]),...publicVehicles].map(f=>[f.id,f])).values()];
}
