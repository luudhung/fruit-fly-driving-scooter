import {LOCATIONS,parkingPoint} from './city-map.mjs';
import {INDUSTRIAL_LOADING_BAYS} from './industry-map.mjs';
import {createVehicleIndex} from './traffic.mjs';
export const REGIONAL_TRUCK_LIMIT=24;
export const REGIONAL_HUBS=['industrial-raw-depot','INDUSTRY-north-4','INDUSTRY-europe-4'];
const GOODS=['fabric','grain','aggregate'],DAY=86400;
const operatorId='regional-logistics',equipmentId='industrial-equipment-supplier',sourceId=REGIONAL_HUBS[0];
/** Licensed intercity hauliers are transport agents, separate from resident-owned fleets.
 * The simulation persists finite cargo, paid consignments and physical road journeys. */
export function createRegionalFreight({world,account,transfer,roadPath,moveTruck,unavailable}){
 const raw=()=>world(),now=()=>Number(raw().simulationAgeSeconds||0),location=id=>LOCATIONS.find(l=>l.id===id);
 const data=()=>raw().regionalFreight||={version:1,trucks:[],stocks:{},jobs:[],nextJobId:1,nextDispatchAt:now(),nextExportAt:now(),delivered:0,exports:0,exportRevenue:0,feesPaid:0,procurement:0,cancelled:0};
 const stock=id=>id===sourceId?raw().industrialEconomy.rawStock:(data().stocks[id]||={fabric:0,grain:0,aggregate:0});
 const business=id=>account(id===sourceId?sourceId:`regional-warehouse-${id}`);
 function init(){
  const d=data();account(operatorId);account('regional-freight-escrow');account('regional-haul-crews');
  if(!d.funded&&REGIONAL_HUBS.every(id=>location(id))&&Number(raw().treasury?.cash||0)>=17800){
   transfer(raw().treasury,account(equipmentId),10800);transfer(raw().treasury,account(operatorId),1000);
   for(const id of REGIONAL_HUBS.slice(1))transfer(raw().treasury,business(id),3000);
   d.procurement=10800;d.funded=true;
  }
  if(d.funded&&d.trucks.length===0){
   const occupied=new Set((raw().industrialEconomy.trucks||[]).map(t=>parkingPoint(t)?.id));
   for(let i=0;i<REGIONAL_TRUCK_LIMIT;i++){
    const homeId=REGIONAL_HUBS[i%3],dock=INDUSTRIAL_LOADING_BAYS[homeId],bay=parkingPoint(dock,occupied)||dock;if(bay.id)occupied.add(bay.id);
    d.trucks.push({id:`REGIONAL-FREIGHT-${i+1}`,operator:operatorId,homeId,locationId:homeId,x:bay.x,y:1.1,z:bay.z,heading:bay.heading||0,alive:true,vehicleLength:6.4,traveling:false,transitMode:'car',phase:'parked',routeWaypoints:[],routeIndex:0,motionSpeed:0,vx:0,vz:0,nextDispatchAt:now()+i*120,lastProgressAt:now(),motorwayLane:i%4});
   }
  }
  if(d.funded&&!d.resupplyScheduled){raw().industrialEconomy.nextRestockAt=Math.min(Number(raw().industrialEconomy.nextRestockAt||now()),now()+1800);d.resupplyScheduled=true;}
  return d;
 }
 function route(t,destination,from=t.locationId){
  const end=INDUSTRIAL_LOADING_BAYS[destination]||parkingPoint(location(destination));if(!end)return false;
  const points=roadPath(t,end,from,destination);if(!points.length)return false;
  Object.assign(t,{routeWaypoints:points,routeIndex:0,traveling:true,motionSpeed:0,lastProgressAt:now(),routeDestination:destination});return true;
 }
 function order(from,to,product,quantity,exported=false){
  const d=data(),available=stock(from),qty=Math.min(quantity,Math.max(0,Math.floor(available[product]||0)-(from===sourceId?180:0)));if(qty<12||unavailable(from)||unavailable(to))return null;
  const fee=24+Math.hypot(location(from).x-location(to).x,location(from).z-location(to).z)*.012,price=qty*2;
  if(!exported&&!transfer(business(to),account('regional-freight-escrow'),price+fee))return null;
  available[product]-=qty;
  const job={id:`REGIONAL-CARGO-${d.nextJobId++}`,from,to,product,quantity:qty,price,fee,exported,createdAt:now(),deadline:now()+DAY*2,phase:'queued',paid:false};d.jobs.push(job);return job;
 }
 function cancel(job){
  if(job.paid)return;stock(job.from)[job.product]+=job.quantity;
  if(!job.exported)transfer(account('regional-freight-escrow'),business(job.to),job.price+job.fee);
  job.paid=true;job.phase='cancelled';job.completedAt=now();data().cancelled++;
 }
 function finish(job){
  if(job.paid)return;
  if(job.exported){
   // Foreign buyers pay only after real cargo arrives at the northern forwarding warehouse.
   business(job.from).cash+=job.price;account(operatorId).cash+=job.fee;
   raw().externalTrade||={exports:0,imports:0};raw().externalTrade.exports+=job.price+job.fee;data().exports+=job.quantity;data().exportRevenue+=job.price+job.fee;
  }else{
   transfer(account('regional-freight-escrow'),business(job.from),job.price);transfer(account('regional-freight-escrow'),account(operatorId),job.fee);stock(job.to)[job.product]+=job.quantity;
  }
  transfer(account(operatorId),account('regional-haul-crews'),job.fee*.65);transfer(account(operatorId),account('industrial-fuel'),job.fee*.15);
  const lease=Object.values(raw().enterprises||{}).find(b=>b.industrial&&b.locationId===job.to&&b.status==='operating');if(lease&&account(operatorId).cash>=2)transfer(account(operatorId),lease,2);
  data().feesPaid+=job.fee;data().delivered++;job.paid=true;job.phase='complete';job.completedAt=now();
 }
 function demand(){
  const d=data(),open=d.jobs.filter(j=>!j.paid);if(open.length>=REGIONAL_TRUCK_LIMIT)return;
  const pending=(id,p)=>open.filter(j=>j.to===id&&j.product===p&&!j.exported).reduce((n,j)=>n+j.quantity,0);
  for(const to of REGIONAL_HUBS.slice(1))for(const product of GOODS){
   if(d.jobs.filter(j=>!j.paid).length>=REGIONAL_TRUCK_LIMIT)break;
   if(stock(to)[product]+pending(to,product)<240&&stock(sourceId)[product]>=48&&business(to).cash>=130)order(sourceId,to,product,48);
  }
  if(now()<d.nextExportAt)return;d.nextExportAt=now()+180;
  // Real wholesale export demand keeps warehouse-to-warehouse flows active even
  // while new resident factories are still fitting out. No cargo is manufactured here.
  const destinations=[REGIONAL_HUBS[1],REGIONAL_HUBS[2],sourceId];
  for(let i=0;i<6&&d.jobs.filter(j=>!j.paid).length<REGIONAL_TRUCK_LIMIT;i++){
   const product=GOODS[(d.nextJobId+i)%3],from=[...REGIONAL_HUBS].filter(id=>stock(id)[product]>=36).sort((a,b)=>stock(b)[product]-stock(a)[product])[0];if(!from)continue;
   const to=destinations.find(id=>id!==from);order(from,to,product,36,true);
  }
 }
 function tick(seconds){
  const d=data();if(!d.funded)return;
  if(now()>=d.nextDispatchAt){d.nextDispatchAt=now()+180;demand();}
  let departures=0;
  for(const t of d.trucks)if(!t.jobId&&now()>=t.nextDispatchAt&&departures<3){
   const job=d.jobs.filter(j=>j.phase==='queued').sort((a,b)=>Math.hypot(location(a.from).x-t.x,location(a.from).z-t.z)-Math.hypot(location(b.from).x-t.x,location(b.from).z-t.z))[0];if(!job)break;
   if(!route(t,job.from))continue;t.jobId=job.id;t.phase='collecting';job.phase='collecting';job.truckId=t.id;departures++;
  }
  const index=createVehicleIndex([...raw().flies,...raw().industrialEconomy.trucks,...d.trucks]);
  for(const t of d.trucks){
   const job=d.jobs.find(j=>j.id===t.jobId);if(!job||job.paid){if(t.jobId)Object.assign(t,{jobId:null,phase:'parked',traveling:false,motionSpeed:0,routeWaypoints:[]});continue;}
   if(now()>job.deadline||unavailable(job.from)||unavailable(job.to)){cancel(job);Object.assign(t,{jobId:null,traveling:false,motionSpeed:0,phase:'parked',nextDispatchAt:now()+600});continue;}
   if(t.waitUntil>now())continue;
   if(t.phase==='loading'){
    if(!route(t,job.to,job.from)){cancel(job);continue;}t.phase='delivering';job.phase='delivering';
   }else if(t.phase==='unloading'){
    finish(job);Object.assign(t,{jobId:null,phase:'parked',nextDispatchAt:now()+240+(Number(t.id.split('-').at(-1))%6)*90});continue;
   }
   if(t.traveling){
    const dock=INDUSTRIAL_LOADING_BAYS[t.routeDestination]||location(t.routeDestination);
    if(dock&&Math.hypot(t.x-dock.x,t.z-dock.z)<18&&d.trucks.some(other=>other!==t&&other.locationId===t.routeDestination&&['loading','unloading'].includes(other.phase)&&other.waitUntil>now())){t.motionSpeed=0;continue;}
    moveTruck(t,seconds,index);
    if(now()-t.lastProgressAt>7200){if(!route(t,t.routeDestination)){cancel(job);t.jobId=null;}t.lastProgressAt=now();}
   }
   if(!t.traveling&&t.jobId){t.locationId=t.routeDestination;t.phase=t.phase==='collecting'?'loading':'unloading';t.waitUntil=now()+240+(Number(t.id.split('-').at(-1))%4)*90;}
  }
  d.jobs=[...d.jobs.filter(j=>!j.paid),...d.jobs.filter(j=>j.paid).slice(-32)];
 }
 function snapshot(){const d=data();return{fleet:d.trucks.length,driving:d.trucks.filter(t=>t.traveling).length,delivered:d.delivered,exports:d.exports,feesPaid:d.feesPaid,stocks:Object.fromEntries(REGIONAL_HUBS.map(id=>[id,{...stock(id)}])),trucks:d.trucks.map(t=>({id:t.id,x:t.x,y:t.y,z:t.z,heading:t.heading,phase:t.phase,motionSpeed:t.traveling?t.motionSpeed:0,driverId:null,orderId:t.jobId||null,routeWaypoints:t.traveling?t.routeWaypoints.slice(t.routeIndex,t.routeIndex+12):[],at:now()}))};}
 return{init,tick,snapshot};
}
