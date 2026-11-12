import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicServices} from '../worker/public-services.mjs';
import {GOVERNMENT_BUILDINGS,GOVERNMENT_LOCATIONS,GOVERNMENT_ROADS,PUBLIC_SERVICE_TARGETS,MILITARY_AIRFIELD,militaryAircraftPose} from '../worker/government-map.mjs';
import {LOCATIONS,BUILDINGS,ROADS,WATER,overlaps,applyUrbanGeometry} from '../worker/city-map.mjs';

function fixture(count=100,oldPolice=2){
 applyUrbanGeometry();for(const place of GOVERNMENT_LOCATIONS)if(!LOCATIONS.some(l=>l.id===place.id))LOCATIONS.push({...place});
 let state={simulationAgeSeconds:120,flies:Array.from({length:count},(_,i)=>({id:`PUBLIC-${i}`,alive:true,ageYears:30,health:95,energy:90,hunger:10,thirst:10,stress:5,money:500,savings:1000,brain:{id:`BRAIN-${i}`},jobId:i<oldPolice?'police':null,jobTitle:i<oldPolice?'police officer':null,wage:i<oldPolice?6.3:0,traits:{resilience:.9,ambition:.9,empathy:.9,risk:.6,thrift:.5},lawAwareness:.8,politicalInterest:.8,ideology:{welfare:.8},professionSkills:{},x:0,z:0,y:1.1,indoors:false,traveling:false})),businesses:{},treasury:{cash:100000,taxRevenue:0},weather:{precipitation:0,wind:0},totalTransactions:0};
 const events=[],memories=[],care=[],finances=[];
 const hooks={world:()=>state,random:()=>.4,neuralDrive:()=>.8,emit:(type,text,payload)=>events.push({type,...payload}),remember:(f,type,payload)=>memories.push({id:f.id,type,...payload}),startJourney:(f,chosen)=>{f.traveling=true;f.targetLocationId=chosen.id;f.action=chosen.action;f.routeWaypoints=[{x:LOCATIONS.find(l=>l.id===chosen.id).x,z:LOCATIONS.find(l=>l.id===chosen.id).z,mode:'walk'}];},moveFly:()=>{},needsAndActivities:f=>care.push(f.id),payAndFinance:f=>finances.push(f.id)};
 let service=createPublicServices(hooks);service.init();
 return{get s(){return state;},get service(){return service;},events,memories,care,finances,
  place(f,id){const p=LOCATIONS.find(l=>l.id===id);Object.assign(f,{x:p.x,z:p.z,currentLocationId:id,targetLocationId:id,traveling:false});},
  restore(){state=JSON.parse(JSON.stringify(state));service=createPublicServices(hooks);service.init();},
  enlist(index,branch='army'){const f=state.flies[index];this.place(f,branch==='army'?'military-base':'police-hq');assert.equal(service.apply(f,branch),true);return f;}};
}
const supply=s=>s.flies.reduce((n,f)=>n+f.money+f.savings,0)+s.treasury.cash+Object.values(s.businesses).reduce((n,b)=>n+Number(b.cash||0),0);

test('existing police are retained, recruitment uses the same living brains, and the bounded forces fill only after voluntary applications',()=>{
 const t=fixture(),ids=t.s.flies.map(f=>[f.id,f.brain.id]),cash=supply(t.s);
 assert.equal(t.service.snapshot().police.count,2);assert.equal(t.service.snapshot().army.count,0);
 for(let i=2;i<52;i++)t.enlist(i);
 for(let i=52;i<78;i++)t.enlist(i,'police');
 assert.equal(t.service.snapshot().army.count,PUBLIC_SERVICE_TARGETS.army);assert.equal(t.service.snapshot().police.count,28);
 const extra=t.s.flies[79];t.place(extra,'military-base');assert.equal(t.service.apply(extra,'army'),false);
 assert.deepEqual(t.s.flies.map(f=>[f.id,f.brain.id]),ids);assert.equal(supply(t.s),cash);
 const f=t.s.flies[2],brain=f.brain.id,job=f.jobId;t.restore();assert.equal(t.s.flies[2].brain.id,brain);assert.equal(t.s.flies[2].jobId,job);assert.equal(t.service.snapshot().army.count,50);
});

test('doctors, grid workers, firefighters and business owners are never recruited away from existing essential commitments',()=>{
 const t=fixture(20,0);
 for(const [i,job]of ['doctor','power','firefighter','paramedic','school','transit'].entries()){
  const f=t.s.flies[i];f.jobId=job;t.place(f,'military-base');assert.equal(t.service.apply(f,'army'),false);assert.equal(f.jobId,job);
 }
 const owner=t.s.flies[8];owner.businessId='OWNED-BIZ';t.place(owner,'police-hq');assert.equal(t.service.apply(owner,'police'),false);
 const working=t.s.flies[9];working.fireEngineDuty={vehicleId:'ENGINE'};t.place(working,'military-base');assert.equal(t.service.apply(working,'army'),false);
});

test('actual attendance earns treasury wages and training, with no duplicate salary or retroactive off-site pay',()=>{
 const t=fixture(10,0),f=t.enlist(0),choices=[];
 t.service.addChoices(f,{hour:1},(id,action,score)=>choices.push({id,action,score}));const duty=choices.find(c=>c.action==='army training duty');assert.ok(duty);
 t.place(f,duty.id);f.action=duty.action;t.service.handleResident(f,{hour:1});const money=f.money,total=supply(t.s);
 t.s.simulationAgeSeconds+=1800;t.service.handleResident(f,{hour:1.5});assert.ok(Math.abs(f.money-money-6.6*.5*.95)<1e-7);assert.ok(Math.abs(f.publicServiceTrainingHours-.5)<1e-7);
 const paid=f.money,training=f.publicServiceTrainingHours;t.service.handleResident(f,{hour:1.5});assert.equal(f.money,paid);assert.equal(f.publicServiceTrainingHours,training);assert.ok(Math.abs(supply(t.s)-total)<1e-7);
 f.x+=200;f.traveling=true;t.s.simulationAgeSeconds+=600;t.service.handleResident(f,{hour:1.7});assert.equal(f.money,paid);
 assert.equal(f.publicServicePayrollManaged,true);const dutyId=f.publicServiceDuty.targetId;t.restore();assert.ok(LOCATIONS.some(l=>l.id===dutyId));assert.equal(t.s.flies[0].money,paid);
});

test('retirement and death release vacancies without replacing resident identities or stealing emergency work',()=>{
 const t=fixture(10,0),f=t.enlist(0),other=t.enlist(1);f.ageYears=65;other.alive=false;
 const before=t.s.flies.map(f=>f.id);t.s.simulationAgeSeconds+=3600;t.service.tick(3600,{hour:1});
 assert.equal(t.service.snapshot().army.count,0);assert.equal(f.publicServiceRole,null);assert.equal(f.publicServicePayrollManaged,false);
 assert.deepEqual(t.s.flies.map(f=>f.id),before);assert.equal(t.s.flies[1].alive,false);
});

test('a public assignment resumes after civic interruption and never steals an unrelated committed journey',()=>{
 const t=fixture(10,0),f=t.enlist(0),choices=[];t.service.addChoices(f,{hour:1},(id,action)=>choices.push({id,action}));
 const training=choices.find(c=>c.action==='army training duty');t.place(f,training.id);f.action=training.action;t.service.handleResident(f,{hour:1});assert.ok(f.publicServiceDuty);
 Object.assign(f,{x:0,z:0,currentLocationId:'park',targetLocationId:'park',action:'assembly resolved',traveling:false});t.s.simulationAgeSeconds+=600;
 assert.equal(t.service.handleResident(f,{hour:1.2}),true);assert.equal(f.traveling,true);assert.equal(f.targetLocationId,training.id);
 const route=[{x:1,z:1,mode:'walk'}];Object.assign(f,{traveling:true,targetLocationId:'hospital-central',routeWaypoints:route});
 assert.equal(t.service.handleResident(f,{hour:1.2}),false);assert.equal(f.publicServiceDuty,null);assert.equal(f.traveling,true);assert.equal(f.targetLocationId,'hospital-central');assert.equal(f.routeWaypoints,route);
});

test('two funded training aircraft use a private runway, require a trained resident pilot, and complete once across restore',()=>{
 const t=fixture(10,0),pilot=t.enlist(0);Object.assign(pilot,{preferredWorkStart:8,publicServiceTrainingHours:8});pilot.professionSkills.aviation=.4;
 assert.equal(t.service.snapshot().aircraft.filter(p=>p.owned).length,2);
 const initial=supply(t.s);t.s.simulationAgeSeconds=9*3600;t.place(pilot,'military-base');t.service.tick(120,{hour:9});
 const plane=t.s.publicServices.aircraft.find(p=>p.boardingPilotId===pilot.id);assert.ok(plane);assert.equal(plane.flight,null,'walking to the aircraft is required');
 t.place(pilot,`MILITARY-BOARD-${plane.id}`);t.s.simulationAgeSeconds+=120;t.service.tick(120,{hour:9});
 assert.ok(plane.flight);assert.equal(t.s.publicServices.flightCosts,14);const flight={...plane.flight};assert.equal(pilot.onPlane,true);
 t.restore();const restored=t.s.flies.find(f=>f.id===pilot.id),saved=t.s.publicServices.aircraft.find(p=>p.id===plane.id);
 t.s.simulationAgeSeconds=flight.departure+700;t.service.handleResident(restored,{hour:9.2});assert.equal(restored.onPlane,true);assert.ok(restored.x>580&&restored.z<=-690);
 t.s.simulationAgeSeconds=flight.arrival;t.service.tick(120,{hour:9.7});assert.equal(saved.flight,null);assert.equal(restored.onPlane,false);assert.equal(t.service.snapshot().trainingFlights,1);
 t.service.tick(0,{hour:9.7});assert.equal(t.service.snapshot().trainingFlights,1);assert.ok(Math.abs(supply(t.s)-initial)<1e-7);
 const stand=MILITARY_AIRFIELD.stands.find(p=>p.id===saved.standId);assert.equal(restored.x,stand.x);assert.equal(restored.z,stand.z);
});

test('government parcels and private aviation stay clear of existing buildings, roads and civil runway operations',()=>{
 for(const b of GOVERNMENT_BUILDINGS){
  for(const old of BUILDINGS.filter(old=>!GOVERNMENT_BUILDINGS.some(g=>g.id===old.id)))assert.equal(overlaps(b,old,2),false,`${b.id} / ${old.id}`);
  for(const water of WATER)assert.equal(overlaps(b,water,1),false);
 }
 for(const road of GOVERNMENT_ROADS)for(const old of BUILDINGS.filter(old=>!GOVERNMENT_BUILDINGS.some(g=>g.id===old.id)))assert.equal(overlaps(road,old,1),false,`${road.id} / ${old.id}`);
 const plane={id:'TEST',standId:MILITARY_AIRFIELD.stands[0].id,flight:{id:'FLIGHT',pilotId:'PILOT',departure:0,arrival:2400,paid:true}};
 for(let at=0;at<=2400;at+=30){const p=militaryAircraftPose(at,plane);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z));assert.ok(p.x>500&&p.z<=-690);}
 assert.ok(ROADS.length>0);
});
