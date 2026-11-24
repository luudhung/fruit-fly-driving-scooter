import test from 'node:test';
import assert from 'node:assert/strict';
import {createFireService,emergencyCountrySegment} from '../worker/fire-service.mjs';
import {createNorthFireDepot,NORTH_FIRE_STATION} from '../worker/north-fire-service.mjs';
import {BUILDINGS,LOCATIONS,entrance,pedestrianRoute} from '../worker/city-map.mjs';
import {BORDER_CHECKPOINTS,borderDirection,countryAt} from '../worker/country-map.mjs';
const location=id=>LOCATIONS.find(p=>p.id===id),role=(f)=>f.nationalServiceRole;
function setup({northBudget=10000}={}){
 let s={emergencyServicesEnabled:true,simulationAgeSeconds:0,timeScale:120,flies:[],businesses:{'treasury:north-city':{cash:northBudget}},treasury:{cash:20000},totalTransactions:0,nationalServices:{rosters:{fire:[],medical:[]},fireWaterUsed:0},urbanWorld:{fires:[],buildings:{},floods:[]},cityVisitors:{visitors:[]}};
 const events=[],journeyRequests=[];let needs=0;
 const person=(id,x,z)=>({id,brain:{id:`BRAIN-${id}`,weights:[.3,.8]},alive:true,ageYears:30,health:95,energy:95,hunger:10,thirst:10,stress:5,money:100,savings:500,x,y:1.1,z,traveling:false,indoors:true,currentLocationId:'firestation',jobId:null,traits:{empathy:.8},professionSkills:{}});
 for(let i=0;i<22;i++)s.flies.push(person(`H-${i}`,830,-200));
 for(const job of ['fire','medical'])for(let i=0;i<4;i++){const home=job==='fire'?NORTH_FIRE_STATION:location('north-hospital'),f=person(`N-${job}-${i}`,home.x,home.z);Object.assign(f,{citizenshipCountryId:'north-city',publicServiceCountryId:'north-city',publicServiceRole:job,nationalServiceRole:job,jobId:`north-${job}`,publicServicePayrollManaged:true,preferredWorkStart:0,preferredWorkHours:8,currentLocationId:home.id,nationalServiceDuty:{kind:job,targetId:home.id}});s.flies.push(f);s.nationalServices.rosters[job].push(f.id);}
 function journey(f,q){journeyRequests.push({flyId:f.id,...q});f.action=q.action;f.targetLocationId=q.id;const p=location(q.id);if(!p)return;if(!f.traveling&&f.currentLocationId===q.id&&Math.hypot(f.x-p.x,f.z-p.z)<32)return;const country=countryAt(p),origin=countryAt(f);
 if(country!==origin){
  const port=BORDER_CHECKPOINTS.find(b=>b.id==='NORTH-RIVERSIDE-BRIDGE'),dir=borderDirection(port,country,'walk');
  f.routeWaypoints=[...pedestrianRoute(f,dir.queuePoint),{...dir.admissionPoint,stage:'border-entry',portId:port.id},...pedestrianRoute(dir.admissionPoint,p)];
 }else f.routeWaypoints=pedestrianRoute(f,p);
 f.routeIndex=0;f.traveling=Boolean(f.routeWaypoints.length);f.indoors=false;}
 function walk(f){if(!f.traveling)return;let distance=2.5;while(distance>1e-6&&f.traveling){const p=f.routeWaypoints[f.routeIndex];if(!p){f.traveling=false;f.currentLocationId=f.targetLocationId;break;}const len=Math.hypot(p.x-f.x,p.z-f.z),step=Math.min(len,distance);if(len>.001){f.x+=(p.x-f.x)/len*step;f.z+=(p.z-f.z)/len*step;}distance-=step;if(len<=step+.001){f.routeIndex++;if(f.routeIndex>=f.routeWaypoints.length){f.traveling=false;f.currentLocationId=f.targetLocationId;}}}}
 const factory=()=>createFireService({world:()=>s,depots:[createNorthFireDepot({world:()=>s})],emit:(type,text,payload)=>events.push({type,...payload}),startJourney:journey,moveFly:walk,needsAndActivities:()=>needs++});
 let service=factory();service.init();
 const clock=()=>({hour:Math.floor(s.simulationAgeSeconds%86400/3600)});
 function step(seconds=120){s.simulationAgeSeconds+=seconds;service.tick(seconds,clock());for(const f of s.flies)if(f.alive){if(!service.handleResident(f,clock())&&f.urbanTask&&f.traveling)walk(f);}for(const fire of s.urbanWorld.fires){if(fire.containedAt)continue;const onsite=(fire.teamIds||[]).map(id=>s.flies.find(f=>f.id===id)).filter(f=>f&&!f.traveling&&f.currentLocationId===`CIVIC-FIRE-${fire.id}`),supply=service.consumeWater(fire,onsite,seconds);if(supply){fire.waterUsed+=supply.water;fire.intensity=Math.max(0,fire.intensity+seconds*.0016-supply.water*.09);if(fire.intensity===0)fire.containedAt=s.simulationAgeSeconds;}}}
 function fire(id='NORTH-FIRE',buildingId='north-restaurant'){const b=BUILDINGS.find(b=>b.id===buildingId),door=entrance(b),pin=`CIVIC-FIRE-${id}`;let p=location(pin);if(!p)LOCATIONS.push(p={id:pin,type:'emergency-access'});Object.assign(p,{x:door.x,z:door.z});const f={id,buildingId,detected:true,teamIds:[],startedAt:s.simulationAgeSeconds,intensity:18,waterUsed:0};s.urbanWorld.fires.push(f);return f;}
 return {get s(){return s;},get service(){return service;},events,journeyRequests,step,fire,clock,get needs(){return needs;},restore(){s=JSON.parse(JSON.stringify(s));service=factory();service.init();}};
}
const money=s=>s.treasury.cash+s.flies.reduce((n,f)=>n+f.money+f.savings,0)+Object.values(s.businesses).reduce((n,b)=>n+Number(b.cash||0),0);

test('one North engine and ambulance are bought once from North and use only existing national staff',()=>{
 const t=setup(),view=t.service.snapshot(),north=view.engines.find(e=>e.id==='NORTH-FIRE-ENGINE-1'),ambulance=view.ambulances.find(e=>e.id==='NORTH-AMBULANCE-1');assert.ok(north&&ambulance);assert.equal(view.engines.length,4);assert.equal(view.ambulances.length,3);assert.equal(north.countryId,'north-city');assert.equal(north.x,NORTH_FIRE_STATION.garage.x);assert.equal(north.z,NORTH_FIRE_STATION.garage.z);assert.equal(t.s.treasury.cash,20000);assert.equal(t.s.businesses['treasury:north-city'].cash,7100);assert.equal(t.s.businesses['north-emergency-operations'].cash,2900);assert.equal(t.s.flies.length,30);assert.equal(t.service.managesCountry('north-city'),true);
 const original=t.s.flies.map(f=>[f.id,f.brain.id,f.money,f.savings,f.nationalServiceRole]),before=money(t.s);t.restore();assert.deepEqual(t.s.flies.map(f=>[f.id,f.brain.id,f.money,f.savings,f.nationalServiceRole]),original);assert.equal(t.service.snapshot().engines.length,4);assert.equal(money(t.s),before);
});

test('an unfunded North treasury creates no vehicles and Hans engines or ambulances never take North calls',()=>{
 const t=setup({northBudget:0}),fire=t.fire(),patient=t.s.flies.find(f=>role(f)==='medical');Object.assign(patient,{health:30,currentLocationId:'north-market',x:110,z:-730});const before=money(t.s);assert.equal(t.service.snapshot().engines.length,3);assert.equal(t.service.snapshot().ambulances.length,2);assert.equal(t.service.dispatchFire(fire,t.clock()),null);assert.equal(t.service.dispatchAmbulance(patient,t.clock()),null);assert.equal(patient.ambulanceDuty,undefined);assert.equal(t.s.treasury.cash,20000);assert.equal(money(t.s),before);
});

test('North crew gathers, physically leaves its own garage, pumps finite water at the fire and brings the same engine home',()=>{
 const t=setup(),fire=t.fire(),before=money(t.s),hans=t.s.treasury.cash,e=t.service.dispatchFire(fire,t.clock());assert.equal(e.id,'NORTH-FIRE-ENGINE-1');assert.ok(e.crewIds.length>=2&&e.crewIds.length<=3);assert.ok(e.crewIds.every(id=>t.s.nationalServices.rosters.fire.includes(id)));assert.equal(e.x,NORTH_FIRE_STATION.garage.x);assert.equal(e.phase,'loading');
 t.step();assert.equal(e.phase,'pullout');t.step();assert.ok(e.z>NORTH_FIRE_STATION.garage.z&&e.z<NORTH_FIRE_STATION.exit.z);
 const positions=[];for(let i=0;i<400&&!fire.containedAt;i++){t.step();positions.push({x:e.x,z:e.z});}assert.ok(fire.containedAt,'actual hoses must suppress the fire');assert.ok(fire.waterUsed>0);assert.ok(e.water<e.waterCapacity);assert.equal(t.s.nationalServices.fireWaterUsed,fire.waterUsed);assert.ok(positions.every(p=>countryAt(p)==='north-city'));assert.ok(t.events.some(e=>e.type==='fire_engine_arrival'));assert.ok(t.needs>0);
 for(let i=0;i<500&&e.phase!=='idle';i++)t.step();assert.equal(e.phase,'idle');assert.equal(e.x,NORTH_FIRE_STATION.garage.x);assert.equal(e.z,NORTH_FIRE_STATION.garage.z);assert.equal(e.completedTrips,1);assert.equal(t.s.treasury.cash,hans);assert.ok(Math.abs(money(t.s)-before)<1e-6);
});

test('North ambulance uses North medics, local roads and the actual North hospital, with no cross-country pickup',()=>{
 const t=setup(),patient=t.s.flies.at(0);Object.assign(patient,{x:123,z:-850,currentLocationId:'north-restaurant',health:30,jobId:null,indoors:false});const e=t.service.dispatchAmbulance(patient,t.clock());assert.equal(e.id,'NORTH-AMBULANCE-1');assert.ok(e.crewIds.every(id=>t.s.nationalServices.rosters.medical.includes(id)));const before=money(t.s),hans=t.s.treasury.cash;let boarded=false;
 for(let i=0;i<700&&t.s.urbanWorld.fireService.hospitalDeliveries===0;i++){t.step();assert.equal(countryAt(e),'north-city');if(patient.onAmbulance)boarded=true;}
 assert.ok(boarded);assert.equal(t.s.urbanWorld.fireService.hospitalDeliveries,1);assert.equal(patient.currentLocationId,'north-hospital');assert.equal(patient.onAmbulance,false);assert.equal(patient.ambulanceDuty,null);assert.equal(t.s.treasury.cash,hans);assert.ok(Math.abs(money(t.s)-before)<1e-6);
 const foreign=t.s.flies.at(1);Object.assign(foreign,{x:-200,z:0,health:30,jobId:null});for(const h of t.s.urbanWorld.fireService.ambulances.filter(e=>e.countryId==='hansdrex'))h.phase='busy';assert.equal(t.service.dispatchAmbulance(foreign,t.clock()),null,'idle North ambulance cannot take Hans patient');
});

test('domestic routes cannot shortcut through the other country, including two Hans endpoints around the North corner',()=>{
 assert.equal(emergencyCountrySegment('hansdrex',{x:-100,z:-500},{x:600,z:-1000}),false);assert.equal(emergencyCountrySegment('north-city',{x:120,z:-800},{x:180,z:-600}),true);assert.equal(emergencyCountrySegment('hansdrex',{x:700,z:-700},{x:830,z:-200}),true);
});

test('North staff may physically return from Hans to their depot without replacing passengers already on trains or planes',()=>{
 const t=setup(),crew=t.s.flies.filter(f=>role(f)==='fire');
 Object.assign(crew[0],{x:50,z:-550,indoors:false,currentLocationId:'border-road'});
 Object.assign(crew[1],{x:50,z:-850,indoors:false,currentLocationId:'north-market'});
 Object.assign(crew[2],{onTrain:true,traveling:true,targetLocationId:'north-market',routeWaypoints:[{x:50,z:-900,mode:'metro'}]});
 Object.assign(crew[3],{onPlane:true,countryAirTrip:{id:'EXISTING-FLIGHT'},targetLocationId:'north-airport'});
 const trainRoute=structuredClone(crew[2].routeWaypoints),planeTrip=structuredClone(crew[3].countryAirTrip),e=t.service.dispatchFire(t.fire(),t.clock());
 assert.deepEqual(e.crewIds.sort(),crew.slice(0,2).map(f=>f.id).sort());
 assert.ok(crew[0].traveling,'a North citizen can personally commute back across the border');
 assert.equal(crew[0].nationalServiceDuty,null);assert.ok(!crew[0].emergencyRouteWait);
 assert.ok(t.journeyRequests.filter(q=>e.crewIds.includes(q.flyId)).every(q=>q.mode==='walk'));
 assert.deepEqual(crew[2].routeWaypoints,trainRoute);assert.equal(crew[2].onTrain,true);assert.equal(crew[2].fireEngineDuty,undefined);
 assert.deepEqual(crew[3].countryAirTrip,planeTrip);assert.equal(crew[3].onPlane,true);assert.equal(crew[3].fireEngineDuty,undefined);
});

test('an old Hans engine already abroad cancels its foreign job and physically retreats once through an official crossing',()=>{
 const t=setup(),e=t.s.urbanWorld.fireService.engines[0],crew=t.s.flies.filter(f=>f.jobId==='firefighter').slice(0,3),fire=t.fire('OLD-FOREIGN');Object.assign(e,{x:50,z:-600,phase:'enroute',incidentId:fire.id,crewIds:crew.map(f=>f.id),route:[{x:50,z:-700,mode:'car'}],routeIndex:0,traveling:true,paidForCall:true,pickup:{x:110,z:-850}});fire.engineId=e.id;for(const f of crew)Object.assign(f,{x:50,z:-600,traveling:false,indoors:false,onFireEngine:true,fireEngineDuty:{vehicleId:e.id,kind:'fire',phase:'riding'}});
 const before=[e.x,e.z];t.service.init();assert.deepEqual([e.x,e.z],before,'migration cannot teleport the engine');assert.equal(e.incidentId,null);assert.equal(e.repatriating,true);assert.notEqual(fire.engineId,e.id);let enteredHans=false,steps=0;for(;steps<700&&e.phase!=='idle';steps++){const old={x:e.x,z:e.z};t.step();assert.ok(Math.hypot(e.x-old.x,e.z-old.z)<=70,'physical movement is bounded');if(countryAt(e)==='hansdrex')enteredHans=true;else assert.equal(enteredHans,false,'retreat never crosses back into North');}assert.ok(enteredHans,JSON.stringify({phase:e.phase,x:e.x,z:e.z,blocked:e.blocked,route:e.route,crewIds:e.crewIds}));assert.equal(e.phase,'idle');assert.equal(e.x,830);assert.equal(e.repatriating,false);
});

test('a stranded Hans fire engine near customs collects a crew member walking from Hans and drives home',()=>{
 const t=setup(),e=t.s.urbanWorld.fireService.engines[0],crew=t.s.flies.find(f=>f.jobId==='firefighter');
 Object.assign(crew,{x:806,z:-112.22,indoors:false,traveling:false});
 Object.assign(e,{x:46.3,z:-576,phase:'gathering-return',repatriating:true,crewIds:[crew.id],pickup:{x:46.3,z:-576}});
 crew.fireEngineDuty={vehicleId:e.id,kind:'fire',phase:e.phase};
 t.restore();const saved=t.s.urbanWorld.fireService.engines[0],driver=t.s.flies.find(f=>f.id===crew.id);
 let crossedOnFoot=false;
 for(let i=0;i<1300&&saved.phase!=='idle';i++){
  t.step();
  if(countryAt(driver)==='north-city'&&!driver.onFireEngine)crossedOnFoot=true;
 }
 assert.ok(crossedOnFoot,'crew retrieves the vehicle through pedestrian customs');
 assert.equal(saved.phase,'idle');
 assert.equal(saved.x,830);
 assert.equal(saved.completedTrips,1);
});
