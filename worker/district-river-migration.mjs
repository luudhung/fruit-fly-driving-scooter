import {DISTRICT_RIVERS,DISTRICT_BRIDGES,ROADS,LOCATIONS,contains,blocked,onWaterCrossing,parkingPoint,pedestrianRoute,entrance} from './city-map.mjs';
import {countryAt,BORDER_CUSTOMS_BUILDINGS,NORTH_RIVERSIDE_LINK} from './country-map.mjs';

export const DISTRICT_RIVER_MIGRATION_VERSION=29;
const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z);
export const strandedInDistrictRiver=p=>finite(p)&&DISTRICT_RIVERS.some(r=>contains(r,p,.3))&&!onWaterCrossing(p);
const elevated=p=>Number(p?.y??1.1)>5;
const aboard=f=>f.onTrain||f.onPlane||f.onPrivateHelicopter||f.heliPassenger||f.privateFlight||f.airTrip||f.militaryShipId||f.militaryFlightId||f.onFireEngine||f.onAmbulance||f.taxiPassenger;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/** Nearest dry bank, or an actual road approach for a stranded road vehicle. */
export function safeDistrictRiverPoint(p,{vehicle=false,preserveCountry=false}={}){
 if(!strandedInDistrictRiver(p))return{x:p.x,z:p.z,y:p.y??1.1};
 const candidates=[];
 for(const r of DISTRICT_RIVERS){
  if(!contains(r,p,.3))continue;
  const x=clamp(p.x,r.x-r.w/2,r.x+r.w/2),z=clamp(p.z,r.z-r.d/2,r.z+r.d/2);
  candidates.push({x:r.x-r.w/2-3,z},{x:r.x+r.w/2+3,z},{x,z:r.z-r.d/2-3},{x,z:r.z+r.d/2+3});
 }
 if(vehicle)for(const road of ROADS){
  if(road.motorway)continue;
  const horizontal=road.w>road.d;
  const q=horizontal?{x:clamp(p.x,road.x-road.w/2+1,road.x+road.w/2-1),z:road.z+1.5}:{x:road.x+1.5,z:clamp(p.z,road.z-road.d/2+1,road.z+road.d/2-1)};
  if(Math.hypot(q.x-p.x,q.z-p.z)<180)candidates.push(q);
 }
 for(const b of DISTRICT_BRIDGES)if(!b.motorway)candidates.push(b.axis==='x'?{x:b.x-b.w/2,z:b.z+1.5}:{x:b.x+1.5,z:b.z-b.d/2},b.axis==='x'?{x:b.x+b.w/2,z:b.z+1.5}:{x:b.x+1.5,z:b.z+b.d/2});
 const legal=candidates.filter(q=>!blocked(q)&&!strandedInDistrictRiver(q)&&(!preserveCountry||countryAt(q)===countryAt(p))&&(!vehicle||ROADS.some(r=>contains(r,q))));
 legal.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));
 return legal.length?{...legal[0],y:1.1}:null;
}

/** Inspect only ground segments intersecting the new channels; old rail legs stay intact. */
export function routeCrossesDistrictRiver(actor,route=actor.routeWaypoints||actor.route||[],index=actor.routeIndex||0){
 let a=actor;
 for(const b of route.slice(index)){
  if(finite(a)&&finite(b)&&b.mode!=='metro'&&Number(a.y??1.1)<=2&&Number(b.y??1.1)<=2&&DISTRICT_RIVERS.some(r=>Math.max(a.x,b.x)>=r.x-r.w/2&&Math.min(a.x,b.x)<=r.x+r.w/2&&Math.max(a.z,b.z)>=r.z-r.d/2&&Math.min(a.z,b.z)<=r.z+r.d/2)){
   const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.6));
   for(let i=0;i<=n;i++)if(strandedInDistrictRiver({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n}))return true;
  }
  a=b;
 }
 return false;
}

/** Idempotent topology upgrade: no identity, ownership, decision or account is replaced. */
export function migrateDistrictRiverJourneys(state,{replanResident,force=false,preserveCountry=false}={}){
 const result={residents:0,parkedCars:0,trucks:0,emergencyVehicles:0,unresolved:[]};
 if(!force&&Number(state.districtRiverMigrationVersion||0)>=DISTRICT_RIVER_MIGRATION_VERSION)return result;
 const people=[...(state.flies||[]),...(state.cityVisitors?.visitors||[])];
 for(const f of people){
  if(f.parkedCar&&strandedInDistrictRiver(f.parkedCar)){
   const safe=safeDistrictRiverPoint(f.parkedCar,{vehicle:true,preserveCountry}),bay=safe&&parkingPoint(safe);
   if(bay){f.parkedCar=bay;result.parkedCars++;}
  }
  if(f.alive===false||f.departed||f.indoors||aboard(f)||elevated(f))continue;
  const stranded=strandedInDistrictRiver(f),invalid=routeCrossesDistrictRiver(f);
  if(!stranded&&!invalid)continue;
  if(stranded){const safe=safeDistrictRiverPoint(f,{vehicle:['car','scooter'].includes(f.transitMode),preserveCountry});if(!safe){result.unresolved.push(f.id);continue;}Object.assign(f,safe,{vx:0,vz:0,movementTrace:[]});}
  const chosen={id:f.targetLocationId||f.travelGoalId||f.homeId,action:f.pendingAction||f.action||'continuing the journey'},boardings=f.metroBoardingsThisTrip;
  if(replanResident&&chosen.id){replanResident(f,chosen);if(boardings!==undefined)f.metroBoardingsThisTrip=boardings;}
  else if(invalid){f.districtRiverRouteReplan=true;f.routeWaypoints=[];f.routeIndex=0;f.traveling=false;}
  result.residents++;
 }
 for(const t of [...(state.industrialEconomy?.trucks||[]),...(state.regionalFreight?.trucks||[])]){
  if(elevated(t)||!strandedInDistrictRiver(t)&&!routeCrossesDistrictRiver(t))continue;
  if(strandedInDistrictRiver(t)){const safe=safeDistrictRiverPoint(t,{vehicle:true,preserveCountry});if(!safe){result.unresolved.push(t.id);continue;}Object.assign(t,safe);}
  Object.assign(t,{industryRouteRelocated:true,motionSpeed:0,routeWaypoints:[],routeIndex:0,traveling:false});result.trucks++;
  const driver=people.find(f=>f.id===t.driverId);if(driver)Object.assign(driver,{x:t.x,z:t.z,y:1.1,movementTrace:[]});
 }
 const service=state.urbanWorld?.fireService;
 for(const e of [...(service?.engines||[]),...(service?.ambulances||[])]){
  if(elevated(e)||!strandedInDistrictRiver(e)&&!routeCrossesDistrictRiver(e))continue;
  const destination=e.route?.at(-1);
  if(strandedInDistrictRiver(e)){
   const old={x:e.x,z:e.z},safe=safeDistrictRiverPoint(e,{vehicle:true,preserveCountry});if(!safe){result.unresolved.push(e.id);continue;}Object.assign(e,safe);
   if(e.pickup&&Math.hypot(e.pickup.x-old.x,e.pickup.z-old.z)<6){
    e.pickup={...e.pickup,x:e.x,z:e.z};
    const pickupId=`EMERGENCY-PICKUP-${e.id}`,location=LOCATIONS.find(l=>l.id===pickupId);if(location)Object.assign(location,{x:e.x,z:e.z});
    for(const id of e.crewIds||[]){const f=people.find(p=>p.id===id);if(f&&!aboard(f)&&f.targetLocationId===pickupId){f.routeWaypoints=[];f.routeIndex=0;f.traveling=false;f.vx=f.vz=0;f.actionUntil=0;}}
   }
  }
  const route=finite(destination)?pedestrianRoute(e,destination,'car'):[];
  Object.assign(e,{route,routeIndex:0,traveling:Boolean(route.length),blocked:!route.length,retryRouteAt:0,lastProgressAt:0});result.emergencyVehicles++;
  for(const id of e.crewIds||[]){const f=people.find(f=>f.id===id);if(f&&(f.onFireEngine||f.onAmbulance))Object.assign(f,{x:e.x,z:e.z,y:1.1,movementTrace:[]});}
 }
 if(!result.unresolved.length)state.districtRiverMigrationVersion=DISTRICT_RIVER_MIGRATION_VERSION;
 return result;
}

export const NORTH_ACCESS_RELOCATION_VERSION=1;
/** Transfer existing customs structures and their live contracts to the new
 * crossing. Damage, material stock and escrow stay on the same records. */
export function relocateNorthCustoms(state){
 if(Number(state.northCustomsRelocationVersion||0)>=1)return {moved:0,unresolved:[]};
 const world=state.urbanWorld;if(!world)return {moved:0,unresolved:[]};
 let moved=0;const unresolved=[];
 for(const side of ['W','E']){
  const oldId=`NORTH-CITY-BRIDGE-3-CUSTOMS-${side}`,newId=`${NORTH_RIVERSIDE_LINK.id}-CUSTOMS-${side}`,old=world.buildings?.[oldId],base=BORDER_CUSTOMS_BUILDINGS.find(b=>b.id===newId);
  if(!old||!base)continue;
  const existing=world.buildings[newId],liveTarget=(world.fires||[]).some(f=>f.buildingId===newId&&!f.containedAt)||(world.projects||[]).some(p=>p.buildingId===newId&&!['complete','cancelled'].includes(p.stage));
  if(existing&&(liveTarget||existing.lastFireId||Number(existing.lastDamageAt)>0)){unresolved.push(newId);continue;}
  const previous={x:old.x,z:old.z};old.previousMapId=oldId;Object.assign(old,{id:newId,x:base.x,z:base.z,w:base.w,d:base.d,countryId:base.countryId});
  if(old.originalBlueprint)Object.assign(old.originalBlueprint,{id:newId,x:base.x,z:base.z,w:base.w,d:base.d,countryId:base.countryId});
  world.buildings[newId]=old;delete world.buildings[oldId];
  for(const record of [...(world.projects||[]),...(world.fires||[])])if(record.buildingId===oldId){
   record.buildingId=newId;record.x=base.x;record.z=base.z;
   if(record.materialCache&&Math.hypot(record.materialCache.x-previous.x,record.materialCache.z-previous.z)<30&&strandedInDistrictRiver(record.materialCache))Object.assign(record.materialCache,entrance(base));
  }
  for(const key of ['pending','completed','untouched'])if(Array.isArray(world.ownerRestoration?.[key]))world.ownerRestoration[key]=world.ownerRestoration[key].map(id=>id===oldId?newId:id);
  for(const person of [...(state.flies||[]),...(state.cityVisitors?.visitors||[])]){
   if(person.urbanTask?.buildingId===oldId){person.urbanTask.buildingId=newId;if(!aboard(person)&&!elevated(person)&&person.urbanTask.phase!=='collecting'){person.routeWaypoints=[];person.routeIndex=0;person.traveling=false;person.urbanTask.nextRouteAt=0;}}
   if(person.currentLocationId===oldId){person.currentLocationId=newId;if(person.indoors&&!person.traveling&&!aboard(person)){person.x+=base.x-previous.x;person.z+=base.z-previous.z;person.movementTrace=[];}}
   for(const key of ['targetLocationId','travelGoalId'])if(person[key]===oldId){person[key]=newId;person.relocatedDestinationId=newId;person.relocatedDestinationPoint={x:base.x,z:base.z+base.d/2+1.2};}
  }
  moved++;
 }
 if(!unresolved.length)state.northCustomsRelocationVersion=1;
 return {moved,unresolved};
}
/** Finish an accepted ride before replacing its obsolete ground continuation. */
export function resumeNorthAccessJourney(person,{replanResident}={}){
 if(!person.northAccessRouteReplan||person.alive===false||person.departed||aboard(person)||elevated(person))return false;
 if(strandedInDistrictRiver(person)){
  const safe=safeDistrictRiverPoint(person,{vehicle:['car','scooter'].includes(person.transitMode),preserveCountry:true});
  if(!safe)return false;
  Object.assign(person,safe,{vx:0,vz:0,movementTrace:[]});
 }
 const chosen={id:person.targetLocationId||person.travelGoalId||person.homeId,action:person.pendingAction||person.action||'continuing the journey'},boardings=person.metroBoardingsThisTrip;
 if(replanResident&&chosen.id){replanResident(person,chosen);if(boardings!==undefined)person.metroBoardingsThisTrip=boardings;}
 else{person.routeWaypoints=[];person.routeIndex=0;person.traveling=false;person.districtRiverRouteReplan=true;}
 delete person.northAccessRouteReplan;
 return true;
}
/** Retire the airport-side crossing without changing any visa receipt or legal
 * presence. Re-bank only within the actor's current country, then plan a new
 * physical border journey. Rail and air passengers keep their existing ride. */
export function relocateNorthAccessRoutes(state,{replanResident}={}){
 const empty={residents:0,parkedCars:0,trucks:0,emergencyVehicles:0,pendingPorts:0,deferred:0,unresolved:[]};
 if(Number(state.northAccessRelocationVersion||0)>=NORTH_ACCESS_RELOCATION_VERSION)return empty;
 const retired='NORTH-CITY-BRIDGE-3';
 let pendingPorts=0,deferred=0;
 for(const person of [...(state.flies||[]),...(state.cityVisitors?.visitors||[])]){
  let pending=false;
  for(const key of ['borderPortId','pendingBorderPortId','countryTravelPortId'])if(person[key]===retired){delete person[key];pending=true;}
  for(const key of ['pendingBorder','borderQueue'])if(person[key]?.portId===retired){person[key]={...person[key],portId:null,needsReplan:true};pending=true;}
  const obsolete=(person.routeWaypoints||[]).slice(person.routeIndex||0).some(p=>p.portId===retired)||routeCrossesDistrictRiver(person);
  if(pending)pendingPorts++;
  if(!pending&&!obsolete)continue;
  if(person.alive===false||person.departed)continue;
  if(aboard(person)||elevated(person)){
   person.northAccessRouteReplan=true;person.relocatedDestinationId=person.targetLocationId||person.travelGoalId||person.homeId;deferred++;continue;
  }
  // The shared migration below moves stranded actors before invoking a route
  // planner; do not ask it to plan while the old bridge is still underfoot.
  if(strandedInDistrictRiver(person))continue;
  const chosen={id:person.targetLocationId||person.travelGoalId||person.homeId,action:person.pendingAction||person.action||'continuing the journey'},boardings=person.metroBoardingsThisTrip;
  if(replanResident&&chosen.id){replanResident(person,chosen);if(boardings!==undefined)person.metroBoardingsThisTrip=boardings;}
  else{person.routeWaypoints=[];person.routeIndex=0;person.traveling=false;person.districtRiverRouteReplan=true;}
 }
 const result=migrateDistrictRiverJourneys(state,{replanResident,force:true,preserveCountry:true});
 if(!result.unresolved.length)state.northAccessRelocationVersion=NORTH_ACCESS_RELOCATION_VERSION;
 return {...result,pendingPorts,deferred};
}
