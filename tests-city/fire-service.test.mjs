import test from 'node:test';import assert from 'node:assert/strict';
import {createFireService,EMERGENCY_RULES} from '../worker/fire-service.mjs';
import {LOCATIONS,BUILDINGS,entrance,pedestrianRoute,parkingPoint} from '../worker/city-map.mjs';
const location=id=>LOCATIONS.find(l=>l.id===id);
function setup(){
 if(!location('firestation'))LOCATIONS.push({id:'firestation',type:'job',name:'Riverside Fire Station',x:830,z:-200});
 let s={cityName:'test',emergencyServicesEnabled:true,simulationAgeSeconds:0,timeScale:120,flies:Array.from({length:22},(_,i)=>({id:`F-${String(i).padStart(3,'0')}`,alive:true,ageYears:30,health:95,energy:95,hunger:10,thirst:10,stress:20,money:100,savings:100,x:830,y:1.1,z:-200,currentLocationId:'firestation',traveling:false,indoors:true,traits:{empathy:.7},professionSkills:{},brain:{}})),businesses:{},treasury:{cash:20000},totalTransactions:0,urbanWorld:{fires:[],buildings:{},floods:[]},cityVisitors:{visitors:[]}};
 const events=[],memories=[];let care=0;
 function journey(f,chosen){
  f.action=chosen.action;f.targetLocationId=chosen.id;if(f.currentLocationId===chosen.id&&!f.traveling){f.traveling=false;return;}
  const dest=location(chosen.id);if(!dest)return;f.routeWaypoints=pedestrianRoute(f,dest);f.routeIndex=0;f.traveling=Boolean(f.routeWaypoints.length);f.indoors=false;
 }
 function walk(f){if(!f.traveling)return;let distance=2.5;while(distance>.001&&f.traveling){const p=f.routeWaypoints[f.routeIndex];if(!p){f.traveling=false;f.currentLocationId=f.targetLocationId;break;}const len=Math.hypot(p.x-f.x,p.z-f.z),step=Math.min(len,distance);if(len>.001){f.x+=(p.x-f.x)/len*step;f.z+=(p.z-f.z)/len*step;}distance-=step;if(len<=step+.001){f.routeIndex++;if(f.routeIndex>=f.routeWaypoints.length){f.traveling=false;f.currentLocationId=f.targetLocationId;}}}}
 const factory=()=>createFireService({world:()=>s,emit:(type,text,payload)=>events.push({type,text,...payload}),remember:(f,type,payload)=>memories.push({flyId:f.id,type,...payload}),startJourney:journey,moveFly:walk,needsAndActivities:()=>care++,payAndFinance:()=>{}});
 let service=factory();service.init();
 const clock=()=>({hour:Math.floor(s.simulationAgeSeconds%86400/3600)});
 const step=(seconds=120)=>{s.simulationAgeSeconds+=seconds;service.tick(seconds,clock());for(const f of [...s.flies,...s.cityVisitors.visitors]){if(!f.alive)continue;if(!service.handleResident(f,clock())&&f.urbanTask&&f.traveling)walk(f);}};
 function fire(){const b=BUILDINGS.find(b=>b.id==='riverside-clinic'),door=entrance(b),id='TEST-FIRE';if(!location(`CIVIC-FIRE-${id}`))LOCATIONS.push({id:`CIVIC-FIRE-${id}`,type:'job',name:'Fire staging',x:door.x,z:door.z+2});const v={id,buildingId:b.id,detected:true,teamIds:[],startedAt:s.simulationAgeSeconds};s.urbanWorld.fires.push(v);return v;}
 return{get s(){return s;},get service(){return service;},events,memories,get care(){return care;},step,clock,fire,restore(){s=JSON.parse(JSON.stringify(s));service=factory();service.init();}};
}
const money=s=>s.treasury.cash+s.flies.reduce((n,f)=>n+f.money+f.savings,0)+Object.values(s.businesses).reduce((n,b)=>n+b.cash,0);

test('public fleet and real employee roster initialize once and stay bounded across restore',()=>{
 const t=setup(),snapshot=t.service.snapshot();assert.equal(snapshot.engines.length,3);assert.equal(snapshot.ambulances.length,2);assert.equal(snapshot.roster.length,15);assert.equal(new Set(snapshot.roster.map(f=>f.id)).size,15);const ids=snapshot.roster.map(f=>f.id),before=money(t.s);
 t.restore();assert.deepEqual(t.service.snapshot().roster.map(f=>f.id),ids);assert.equal(t.service.snapshot().engines.length,3);assert.equal(money(t.s),before);
});
test('fire crew gathers in the garage, drives physically, deploys and brings the engine back',()=>{
 const t=setup(),fire=t.fire(),before=money(t.s),e=t.service.dispatchFire(fire,t.clock());assert.ok(e);assert.equal(e.phase,'loading');assert.equal(e.x,830);assert.equal(e.crewIds.length,3);assert.ok(e.crewIds.every(id=>t.s.flies.find(f=>f.id===id).jobId==='firefighter'));assert.equal(t.s.urbanWorld.fireService.operatingCosts,0);
 t.step();assert.equal(e.phase,'pullout');assert.ok(e.crewIds.every(id=>t.s.flies.find(f=>f.id===id).onFireEngine));t.step();assert.ok(e.x>830&&e.x<850,'engine actually leaves its bay');
 for(let i=0;i<800&&e.phase!=='on-scene';i++)t.step();assert.equal(e.phase,'on-scene');assert.ok(e.crewIds.every(id=>!t.s.flies.find(f=>f.id===id).onFireEngine));assert.ok(t.events.some(e=>e.type==='fire_engine_arrival'));assert.ok(t.care>0);
 for(let i=0;i<200&&e.crewIds.some(id=>t.s.flies.find(f=>f.id===id).traveling);i++)t.step();const target=location(`CIVIC-FIRE-${fire.id}`);assert.ok(e.crewIds.every(id=>Math.hypot(t.s.flies.find(f=>f.id===id).x-target.x,t.s.flies.find(f=>f.id===id).z-target.z)<9));
 fire.containedAt=t.s.simulationAgeSeconds;for(let i=0;i<1000&&e.phase!=='idle';i++)t.step();assert.equal(e.phase,'idle');assert.equal(e.x,830);assert.equal(e.completedTrips,1);assert.equal(t.s.urbanWorld.fireService.returns,1);assert.ok(Math.abs(money(t.s)-before)<1e-6);
});
test('an emergency vehicle travels at twice normal car speed, crosses red, and still follows queues',()=>{
 const t=setup(),fire=t.fire(),e=t.service.dispatchFire(fire,t.clock());t.step();e.phase='enroute';Object.assign(e,{x:110,y:1.1,z:0,route:[{x:150,y:1.1,z:0,mode:'car'}],routeIndex:0,targetX:150,targetZ:0,traveling:true});
 t.s.simulationAgeSeconds=0;t.step();assert.ok(e.x>114.6,'emergency permit clears the red stop line');assert.ok(Math.abs(e.x-132)<1e-6);assert.equal(EMERGENCY_RULES.speed,22);assert.equal(t.service.snapshot().engines[0].signalPermit,true);
 const blocker=t.s.flies.find(f=>!f.fireEngineDuty);Object.assign(blocker,{alive:true,x:140,z:0,traveling:true,transitMode:'car',targetX:180,targetZ:0});t.step();assert.ok(e.x<=135.00001,'queue headway remains enforced');
});
test('restart in transit preserves the exact crew, route and once-only public operating charge',()=>{
 const t=setup(),fire=t.fire(),e=t.service.dispatchFire(fire,t.clock());for(let i=0;i<10&&e.phase!=='enroute';i++)t.step();assert.equal(e.phase,'enroute');const paid=t.s.urbanWorld.fireService.operatingCosts,crew=[...e.crewIds],id=e.id,before=money(t.s);t.step();const x=e.x,z=e.z;t.restore();const resumed=t.s.urbanWorld.fireService.engines.find(v=>v.id===id);assert.equal(resumed.x,x);assert.equal(resumed.z,z);assert.deepEqual(resumed.crewIds,crew);t.step();assert.equal(t.s.urbanWorld.fireService.operatingCosts,paid);assert.ok(Math.abs(money(t.s)-before)<1e-6);
});
test('an ambulance reserves one patient, performs pickup and actual hospital admission, then returns',()=>{
 const t=setup(),patient=t.s.flies.at(-1),home=location('hospital-central');for(const f of t.s.flies.filter(f=>f.jobId==='paramedic'))Object.assign(f,{x:home.x,z:home.z,currentLocationId:home.id,emergencyStationId:home.id});Object.assign(patient,{x:-63,z:43.5,currentLocationId:'cinema',health:30,indoors:false,jobId:null});
 const before=money(t.s),e=t.service.dispatchAmbulance(patient,t.clock());assert.ok(e);assert.equal(t.service.dispatchAmbulance(patient,t.clock()),null);assert.equal(patient.ambulanceDuty.phase,'waiting');
 let boarded=false;for(let i=0;i<1800&&t.s.urbanWorld.fireService.hospitalDeliveries===0;i++){t.step();if(patient.onAmbulance){boarded=true;assert.equal(patient.x,e.x);assert.equal(patient.z,e.z);}}
 assert.ok(boarded);assert.equal(t.s.urbanWorld.fireService.hospitalDeliveries,1);assert.equal(patient.currentLocationId,e.hospitalId);assert.equal(patient.ambulanceDuty,null);assert.equal(patient.onAmbulance,false);assert.ok(patient.health>30&&patient.health<=65);
 for(let i=0;i<1000&&e.phase!=='idle';i++)t.step();assert.equal(e.phase,'idle');assert.ok(Math.abs(money(t.s)-before)<1e-6);
});
test('fatal patients are never revived and their ambulance reservation is released',()=>{
 const t=setup(),p=t.s.flies.at(-1);Object.assign(p,{x:-63,z:43.5,currentLocationId:'cinema',health:30,indoors:false,jobId:null});const e=t.service.dispatchAmbulance(p,t.clock());assert.ok(e);p.alive=false;p.health=0;t.step();assert.equal(p.health,0);assert.equal(p.ambulanceDuty,null);assert.equal(p.onAmbulance,false);assert.equal(e.patientId,null);assert.equal(t.s.urbanWorld.fireService.hospitalDeliveries,0);
});
test('a service-disabled miniature world does not recruit or replace volunteer firefighting',()=>{
 const t=setup();t.s.emergencyServicesEnabled=false;const count=t.s.flies.filter(f=>f.jobId==='firefighter').length;t.service.init();assert.equal(t.service.enabled(),false);assert.equal(t.s.flies.filter(f=>f.jobId==='firefighter').length,count);
});
