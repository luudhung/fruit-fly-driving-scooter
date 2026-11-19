import {recoverStalledFreight} from './freight-recovery.mjs';
import {LOCATIONS,parkingPoint} from './city-map.mjs';
import {INDUSTRIAL_LOADING_BAYS,INDUSTRIAL_PLANTS} from './industry-map.mjs';
import {createVehicleIndex} from './traffic.mjs';
import {reserveRoadParking,occupyParking,trafficActors} from './vehicle-parking.mjs';
import {countryAt,NORTH_MATERIALS_YARD} from './country-map.mjs';
export const REGIONAL_TRUCK_LIMIT=24;
export const REGIONAL_HUBS=['industrial-raw-depot','INDUSTRY-north-4','INDUSTRY-europe-4'];
const GOODS=['fabric','grain','aggregate'],DAY=86400;
const truckSerial=t=>Number(t.id.split('-').at(-1));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const operatorId='regional-logistics',equipmentId='industrial-equipment-supplier',sourceId=REGIONAL_HUBS[0];
/** Licensed intercity hauliers are transport agents, separate from resident-owned fleets.
 * The simulation persists finite cargo, paid consignments and physical road journeys. */
export function createRegionalFreight({world,account,transfer,roadPath,moveTruck,unavailable,countryAccount,industrialOrders=()=>[],finishIndustrialOrder=()=>false,freightProviders=()=>[]}){
 const raw=()=>world(),now=()=>Number(raw().simulationAgeSeconds||0),location=id=>LOCATIONS.find(l=>l.id===id);
 const data=()=>raw().regionalFreight||={version:1,trucks:[],stocks:{},unitCosts:{},jobs:[],nextJobId:1,nextDispatchAt:now(),nextExportAt:now(),delivered:0,exports:0,exportRevenue:0,feesPaid:0,procurement:0,cancelled:0};
 const stock=id=>id===sourceId?raw().industrialEconomy.rawStock:(data().stocks[id]||={fabric:0,grain:0,aggregate:0});
 const business=id=>account(id===sourceId?sourceId:`regional-warehouse-${id}`);
 function unitCost(id,product){if(id===sourceId)return 2;const distance=Math.hypot(location(sourceId).x-location(id).x,location(sourceId).z-location(id).z);return Number(data().unitCosts?.[id]?.[product])||2+(24+distance*.012)/48;}
 function inputSource(product,destination){const site=location(destination);if(!site)return null;const id=REGIONAL_HUBS.filter(id=>Number(stock(id)?.[product]||0)>=4).sort((a,b)=>Math.hypot(location(a).x-site.x,location(a).z-site.z)-Math.hypot(location(b).x-site.x,location(b).z-site.z))[0];return id?{locationId:id,sellerId:id===sourceId?sourceId:`regional-warehouse-${id}`,unitPrice:id===sourceId?2:Math.ceil(unitCost(id,product)*1.12*100)/100}:null;}
 const providers=()=>[{id:'industrial',orders:industrialOrders,settle:finishIndustrialOrder},...freightProviders()];
 const brokered=job=>Boolean(job.industrialOrderId||job.sourceOrderId);
 const providerFor=job=>providers().find(p=>p.id===(job.providerId||'industrial'));
 const sourceOrder=job=>providerFor(job)?.orders().find(o=>o.id===(job.sourceOrderId||job.industrialOrderId));
 function claimBrokeredOrders(){const d=data(),pending=providers().flatMap(provider=>provider.orders().filter(o=>!o.paid&&o.phase==='queued').map(order=>({provider,order}))).sort((a,b)=>a.order.createdAt-b.order.createdAt);
  for(const {provider,order:o}of pending){if(d.jobs.filter(j=>!j.paid).length>=REGIONAL_TRUCK_LIMIT)break;if(d.jobs.some(j=>(j.providerId||'industrial')===provider.id&&(j.sourceOrderId||j.industrialOrderId)===o.id&&!j.paid))continue;
   const job={id:`REGIONAL-${provider.id.toUpperCase()}-${o.id}`,providerId:provider.id,sourceOrderId:o.id,...(provider.id==='industrial'?{industrialOrderId:o.id}:{}),from:o.sourceLocationId,to:o.destinationId,product:o.product,quantity:o.quantity,price:o.quantity*o.unitPrice,fee:o.fee,exported:false,createdAt:now(),deadline:o.deadline,phase:'queued',paid:false};d.jobs.push(job);o.phase='brokered';o.carrierId=operatorId;
  }
 }
 function settleBrokered(job,cancelled=false){const o=sourceOrder(job);if(o&&!o.paid)providerFor(job)?.settle(o,cancelled);const complete=o?.phase==='complete';
  if(complete&&!o.regionalCrewSettled){transfer(account(operatorId),account('regional-haul-crews'),job.fee*.65);o.regionalCrewSettled=true;}
  job.paid=true;job.phase=complete?'complete':'cancelled';job.completedAt=now();if(complete){data().feesPaid+=job.fee;data().delivered++;}else data().cancelled++;
 }
 function operatingSites(){
  const active=new Set(Object.values(raw().enterprises||{}).filter(b=>b.industrial&&b.status==='operating').map(b=>b.locationId));
  return [...new Set([...REGIONAL_HUBS,NORTH_MATERIALS_YARD.id,...INDUSTRIAL_PLANTS.filter(p=>active.has(p.id)).map(p=>p.id)])].filter(id=>location(id)&&!unavailable(id));
 }
 function payEmptyLeg(t,points,metric){
  const meters=points.reduce((n,p,i)=>n+distance(p,points[i-1]||t),0),fuel=meters*.004,crew=meters*.002,expense=fuel+crew;
  const payer=account(operatorId);
  if(payer.cash+1e-8<expense)return false;
  transfer(payer,account('industrial-fuel'),fuel);
  transfer(payer,account('regional-haul-crews'),crew);
  data()[metric]=Number(data()[metric]||0)+expense;
  return true;
 }
 function startReposition(t,occupied,sites){
  const country=countryAt(t);
  const destinations=sites.filter(id=>id!==t.locationId&&countryAt(location(id))===country&&distance(t,location(id))>48)
    .sort((a,b)=>distance(t,location(a))-distance(t,location(b)));
  // Reduce repeated arrivals at the same warehouse without buying stock merely to keep trucks in motion.
  const nearby=destinations.slice(0,4);
  const offset=truckSerial(t)%Math.max(1,nearby.length);
  for(const destination of [...nearby.slice(offset),...nearby.slice(0,offset)]){
   const parking=parkingPoint(INDUSTRIAL_LOADING_BAYS[destination]||location(destination),occupied);
   if(!parking||distance(parking,location(destination))>65)continue;
   const points=roadPath(t,parking,t.locationId,destination);
   if(!points.length||points.some(p=>countryAt(p)!==country))continue;
   if(!payEmptyLeg(t,points,'repositionCosts'))return false;
   occupied.add(parking.id);
   Object.assign(t,{returnParking:parking,returnDepotId:destination,repositioning:true,returning:false,phase:'repositioning',routeWaypoints:points,routeIndex:0,traveling:true,motionSpeed:0,lastProgressAt:now(),routeDestination:destination});
   return true;
  }
  return false;
 }
 function returnToDepot(t,occupied){
  if(!t.returnParking){const country=countryAt(t),home=REGIONAL_HUBS.filter(id=>countryAt(location(id))===country).sort((a,b)=>Math.hypot(location(a).x-t.x,location(a).z-t.z)-Math.hypot(location(b).x-t.x,location(b).z-t.z))[0];if(!home)return false;const parking=parkingPoint(INDUSTRIAL_LOADING_BAYS[home]||location(home),occupied);if(!parking)return false;t.returnParking={...parking};t.returnDepotId=home;}
  if(t.returnParking.id)occupied.add(t.returnParking.id);
  if(Math.hypot(t.x-t.returnParking.x,t.z-t.returnParking.z)<.8){t.returning=false;t.traveling=false;t.phase='parked';t.motionSpeed=0;return false;}
  if(t.returning&&t.traveling)return true;
  const points=roadPath(t,t.returnParking,t.returnDepotId,t.returnDepotId),country=countryAt(t);if(!points.length||points.some(p=>countryAt(p)!==country))return false;
  if(!payEmptyLeg(t,points,'emptyReturnCosts'))return false;
  Object.assign(t,{returning:true,phase:'returning',routeWaypoints:points,routeIndex:0,traveling:true,motionSpeed:0,lastProgressAt:now(),routeDestination:t.returnDepotId});return true;
 }
 function init(){
  const d=data();account(operatorId);account('regional-freight-escrow');account('regional-haul-crews');
  const treasuryFor=id=>countryAccount?countryAccount(countryAt(location(id))||'hansdrex'):raw().treasury;
  const funding=[{from:treasuryFor(sourceId),to:account(equipmentId),amount:10800},{from:treasuryFor(sourceId),to:account(operatorId),amount:1000},...REGIONAL_HUBS.slice(1).map(id=>({from:treasuryFor(id),to:business(id),amount:3000}))];
  const obligations=new Map();for(const item of funding)obligations.set(item.from,Number(obligations.get(item.from)||0)+item.amount);
  if(!d.funded&&REGIONAL_HUBS.every(id=>location(id))&&[...obligations].every(([from,amount])=>Number(from?.cash||0)>=amount)){
   for(const item of funding)transfer(item.from,item.to,item.amount);
   d.procurement=10800;d.funded=true;
  }
  if(d.funded&&d.trucks.length===0){
   const occupied=new Set((raw().industrialEconomy.trucks||[]).map(t=>parkingPoint(t)?.id));
   for(let i=0;i<REGIONAL_TRUCK_LIMIT;i++){
    const homeId=REGIONAL_HUBS[i%3],dock=INDUSTRIAL_LOADING_BAYS[homeId],bay=parkingPoint(dock,occupied)||dock;if(bay.id)occupied.add(bay.id);
    d.trucks.push({id:`REGIONAL-FREIGHT-${i+1}`,operator:operatorId,homeId,locationId:homeId,returnParking:bay,returnDepotId:homeId,x:bay.x,y:1.1,z:bay.z,heading:bay.heading||0,alive:true,vehicleLength:6.4,traveling:false,transitMode:'car',phase:'parked',routeWaypoints:[],routeIndex:0,motionSpeed:0,vx:0,vz:0,nextDispatchAt:now()+i*120,lastProgressAt:now(),motorwayLane:i%4});
   }
  }
  if(d.funded&&!d.resupplyScheduled){raw().industrialEconomy.nextRestockAt=Math.min(Number(raw().industrialEconomy.nextRestockAt||now()),now()+1800);d.resupplyScheduled=true;}
  if(countryAccount)for(const job of d.jobs.filter(j=>!j.paid&&j.exported)){
   if(transfer(business(job.to),account('regional-freight-escrow'),job.price+job.fee))job.exported=false;
   else cancel(job);
  }
  return d;
 }
 function route(t,destination,from=t.locationId){
  const dock=INDUSTRIAL_LOADING_BAYS[destination]||location(destination),end=reserveRoadParking(raw(),t,dock);if(!end)return false;
  t.destinationParking=end;
  const points=roadPath(t,end,from,destination);if(!points.length)return false;
  Object.assign(t,{routeWaypoints:points,routeIndex:0,traveling:true,motionSpeed:0,lastProgressAt:now(),routeDestination:destination});return true;
 }
 function order(from,to,product,quantity,exported=false){
  // North/Hans freight is an internal paid purchase, never an off-world buyer.
  if(countryAccount)exported=false;
  const d=data(),available=stock(from),qty=Math.min(quantity,Math.max(0,Math.floor(available[product]||0)-(from===sourceId?180:0)));if(qty<12||unavailable(from)||unavailable(to))return null;
  const fee=24+Math.hypot(location(from).x-location(to).x,location(from).z-location(to).z)*.012,price=qty*2;
  if(!exported&&!transfer(business(to),account('regional-freight-escrow'),price+fee))return null;
  available[product]-=qty;
  const job={id:`REGIONAL-CARGO-${d.nextJobId++}`,from,to,product,quantity:qty,price,fee,exported,createdAt:now(),deadline:now()+DAY*2,phase:'queued',paid:false};d.jobs.push(job);return job;
 }
 function cancel(job){
  if(job.paid)return;if(brokered(job)){settleBrokered(job,true);return;}stock(job.from)[job.product]+=job.quantity;
  if(!job.exported)transfer(account('regional-freight-escrow'),business(job.to),job.price+job.fee);
  job.paid=true;job.phase='cancelled';job.completedAt=now();data().cancelled++;
 }
 function finish(job){
  if(job.paid)return;if(brokered(job)){settleBrokered(job);return;}
  if(job.exported){
   // Foreign buyers pay only after real cargo arrives at the northern forwarding warehouse.
   business(job.from).cash+=job.price;account(operatorId).cash+=job.fee;
   raw().externalTrade||={exports:0,imports:0};raw().externalTrade.exports+=job.price+job.fee;data().exports+=job.quantity;data().exportRevenue+=job.price+job.fee;
  }else{
   transfer(account('regional-freight-escrow'),business(job.from),job.price);transfer(account('regional-freight-escrow'),account(operatorId),job.fee);const count=Number(stock(job.to)[job.product]||0);data().unitCosts||={};data().unitCosts[job.to]||={};data().unitCosts[job.to][job.product]=(count*unitCost(job.to,job.product)+job.price+job.fee)/(count+job.quantity);stock(job.to)[job.product]+=job.quantity;
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
  // Sovereign warehouses replenish only stock sold to real local factories.
  // Rebuying already-full warehouses would burn their finite working cash.
  if(countryAccount)return;
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
  claimBrokeredOrders();
  let departures=0;
  const queued=d.jobs.filter(j=>j.phase==='queued'&&location(j.from));
  for(const t of d.trucks){
   if(!queued.length||departures>=3)break;
   if(t.jobId||now()<Number(t.nextDispatchAt||0))continue;
   const candidates=queued.slice().sort((a,b)=>distance(t,location(a.from))-distance(t,location(b.from)));
   const job=candidates.find(j=>route(t,j.from));
   if(!job)continue;
   queued.splice(queued.indexOf(job),1);
   Object.assign(t,{returning:false,repositioning:false,returnParking:null,jobId:job.id,phase:'collecting'});
   Object.assign(job,{phase:'collecting',truckId:t.id});
   if(brokered(job)){const o=sourceOrder(job);if(o)Object.assign(o,{phase:'collecting',truckId:t.id,carrierId:operatorId});}
   departures++;
  }
  const index=createVehicleIndex(trafficActors(raw()));
  const occupied=new Set(d.trucks.map(t=>t.returnParking?.id).filter(Boolean));
  let sites;
  for(const t of d.trucks){
   if(recoverStalledFreight(raw(),t,seconds,index,t=>route(t,t.routeDestination)))continue;
   const job=d.jobs.find(j=>j.id===t.jobId);
   if(!job||job.paid){
    if(t.jobId)Object.assign(t,{jobId:null,phase:'parked',traveling:false,motionSpeed:0,routeWaypoints:[]});
    if(t.repositioning){
     if(t.traveling)moveTruck(t,seconds,index);
     if(!t.traveling||now()-Number(t.lastProgressAt||0)>7200){
      if(!t.traveling)t.locationId=t.returnDepotId;
      else t.returnParking=null;
      Object.assign(t,{repositioning:false,traveling:false,phase:'parked',motionSpeed:0,nextRepositionAt:now()+120});
     }
     continue;
    }
    if(returnToDepot(t,occupied)){
     moveTruck(t,seconds,index);
     if(!t.traveling)Object.assign(t,{locationId:t.returnDepotId,returning:false,phase:'parked',motionSpeed:0,nextRepositionAt:now()+120});
     continue;
    }
    if(queued.length||departures>=3||!t.returnParking||distance(t,t.returnParking)>=.8)continue;
    t.nextRepositionAt??=now()+truckSerial(t)*60;
    if(now()<t.nextRepositionAt)continue;
    sites??=operatingSites();
    if(startReposition(t,occupied,sites))departures++;
    else t.nextRepositionAt=now()+1800;
    continue;
   }
   if(brokered(job)&&(!sourceOrder(job)||sourceOrder(job).paid)){settleBrokered(job);Object.assign(t,{jobId:null,phase:'parked',traveling:false,motionSpeed:0,returnParking:null});continue;}
   if(now()>job.deadline||unavailable(job.from)||unavailable(job.to)){cancel(job);Object.assign(t,{jobId:null,traveling:false,motionSpeed:0,phase:'parked',nextDispatchAt:now()+600});continue;}
   if(t.waitUntil>now())continue;
   if(t.phase==='loading'){
    if(!route(t,job.to,job.from)){cancel(job);continue;}t.phase='delivering';job.phase='delivering';if(brokered(job)){const o=sourceOrder(job);if(o)o.phase='delivering';}
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
 function snapshot(){const d=data();return{fleet:d.trucks.length,driving:d.trucks.filter(t=>t.traveling).length,repositioning:d.trucks.filter(t=>t.repositioning).length,delivered:d.delivered,exports:d.exports,feesPaid:d.feesPaid,stocks:Object.fromEntries(REGIONAL_HUBS.map(id=>[id,{...stock(id)}])),trucks:d.trucks.map(t=>({id:t.id,x:t.x,y:t.y,z:t.z,heading:t.heading,phase:t.phase,motionSpeed:t.traveling?t.motionSpeed:0,driverId:null,orderId:t.jobId||null,routeWaypoints:t.freightRecovery?[{x:t.freightRecovery.x,y:t.y,z:t.freightRecovery.z,mode:'car'}]:t.traveling?t.routeWaypoints.slice(t.routeIndex,t.routeIndex+12):[],at:now()}))};}
 return{init,tick,snapshot,inputSource};
}
