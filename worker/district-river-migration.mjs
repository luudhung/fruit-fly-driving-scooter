import {DISTRICT_RIVERS,DISTRICT_BRIDGES,ROADS,contains,blocked,onWaterCrossing,parkingPoint,pedestrianRoute} from './city-map.mjs';

export const DISTRICT_RIVER_MIGRATION_VERSION=29;
const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z);
export const strandedInDistrictRiver=p=>finite(p)&&DISTRICT_RIVERS.some(r=>contains(r,p,.3))&&!onWaterCrossing(p);
const elevated=p=>Number(p?.y??1.1)>5;
const aboard=f=>f.onTrain||f.onPlane||f.onPrivateHelicopter||f.heliPassenger||f.privateFlight||f.airTrip||f.militaryShipId||f.militaryFlightId||f.onFireEngine||f.onAmbulance||f.taxiPassenger;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/** Nearest dry bank, or an actual road approach for a stranded road vehicle. */
export function safeDistrictRiverPoint(p,{vehicle=false}={}){
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
 const legal=candidates.filter(q=>!blocked(q)&&!strandedInDistrictRiver(q)&&(!vehicle||ROADS.some(r=>contains(r,q))));
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
export function migrateDistrictRiverJourneys(state,{replanResident}={}){
 const result={residents:0,parkedCars:0,trucks:0,emergencyVehicles:0,unresolved:[]};
 if(Number(state.districtRiverMigrationVersion||0)>=DISTRICT_RIVER_MIGRATION_VERSION)return result;
 const people=[...(state.flies||[]),...(state.cityVisitors?.visitors||[])];
 for(const f of people){
  if(f.parkedCar&&strandedInDistrictRiver(f.parkedCar)){
   const safe=safeDistrictRiverPoint(f.parkedCar,{vehicle:true}),bay=safe&&parkingPoint(safe);
   if(bay){f.parkedCar=bay;result.parkedCars++;}
  }
  if(f.alive===false||f.departed||f.indoors||aboard(f)||elevated(f))continue;
  const stranded=strandedInDistrictRiver(f),invalid=routeCrossesDistrictRiver(f);
  if(!stranded&&!invalid)continue;
  if(stranded){const safe=safeDistrictRiverPoint(f,{vehicle:['car','scooter'].includes(f.transitMode)});if(!safe){result.unresolved.push(f.id);continue;}Object.assign(f,safe,{vx:0,vz:0,movementTrace:[]});}
  const chosen={id:f.targetLocationId||f.travelGoalId||f.homeId,action:f.pendingAction||f.action||'continuing the journey'},boardings=f.metroBoardingsThisTrip;
  if(replanResident&&chosen.id){replanResident(f,chosen);if(boardings!==undefined)f.metroBoardingsThisTrip=boardings;}
  else if(invalid){f.districtRiverRouteReplan=true;f.routeWaypoints=[];f.routeIndex=0;f.traveling=false;}
  result.residents++;
 }
 for(const t of [...(state.industrialEconomy?.trucks||[]),...(state.regionalFreight?.trucks||[])]){
  if(elevated(t)||!strandedInDistrictRiver(t)&&!routeCrossesDistrictRiver(t))continue;
  if(strandedInDistrictRiver(t)){const safe=safeDistrictRiverPoint(t,{vehicle:true});if(!safe){result.unresolved.push(t.id);continue;}Object.assign(t,safe);}
  Object.assign(t,{industryRouteRelocated:true,motionSpeed:0,routeWaypoints:[],routeIndex:0,traveling:false});result.trucks++;
  const driver=people.find(f=>f.id===t.driverId);if(driver)Object.assign(driver,{x:t.x,z:t.z,y:1.1,movementTrace:[]});
 }
 const service=state.urbanWorld?.fireService;
 for(const e of [...(service?.engines||[]),...(service?.ambulances||[])]){
  if(elevated(e)||!strandedInDistrictRiver(e)&&!routeCrossesDistrictRiver(e))continue;
  const destination=e.route?.at(-1);
  if(strandedInDistrictRiver(e)){const safe=safeDistrictRiverPoint(e,{vehicle:true});if(!safe){result.unresolved.push(e.id);continue;}Object.assign(e,safe);}
  const route=finite(destination)?pedestrianRoute(e,destination,'car'):[];
  Object.assign(e,{route,routeIndex:0,traveling:Boolean(route.length),blocked:!route.length,retryRouteAt:0,lastProgressAt:0});result.emergencyVehicles++;
  for(const id of e.crewIds||[]){const f=people.find(f=>f.id===id);if(f&&(f.onFireEngine||f.onAmbulance))Object.assign(f,{x:e.x,z:e.z,y:1.1,movementTrace:[]});}
 }
 if(!result.unresolved.length)state.districtRiverMigrationVersion=DISTRICT_RIVER_MIGRATION_VERSION;
 return result;
}
