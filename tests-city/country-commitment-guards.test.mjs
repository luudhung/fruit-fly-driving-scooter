import test from 'node:test';
import assert from 'node:assert/strict';
import {hasCountryCommitment} from '../worker/country-commitments.mjs';
import {createFireService} from '../worker/fire-service.mjs';
import {createUrbanWorld} from '../worker/urban-world.mjs';
import {createRoadLife} from '../worker/road-life.mjs';
import {createSportsLuxury} from '../worker/sports-luxury.mjs';
import {createResidentRelationships} from '../worker/resident-relationships.mjs';
import {createCivicConflict} from '../worker/civic-conflict.mjs';
import {BUILDINGS} from '../worker/city-map.mjs';
const commitments=[['countryAirTrip',{phase:'outbound-wait'}],['countryFlightPlan',{toAirportId:'north'}],['internationalWork',{shiftStart:6,hours:8,locationId:'north-farm'}],['internationalFreightDuty',{truckId:'REAL-TRUCK'}],['nationalServiceDuty',{kind:'guard',targetId:'north-army'}],['nationalSupplyTask',true],['nationalTrainingFlightId','NORTH-FLIGHT-1'],['warResponse',{active:true}]];
const person=(id,extra={})=>({id,alive:true,ageYears:30,health:95,energy:95,hunger:10,thirst:10,stress:20,money:1000,savings:1000,brain:{id:`BRAIN-${id}`},traits:{empathy:.8,thrift:.2,sociability:.9},professionSkills:{},x:15,y:1.1,z:-48,currentLocationId:'park',action:'resting',friends:[],children:[],parents:[],householdId:`HH-${id}`,homeId:'apt-north',homeX:15,homeZ:-330,...extra});
function fixture(flies){
 const state={simulationAgeSeconds:9*3600,timeScale:120,flies,businesses:{'vehicle-showroom':{cash:0,inventory:0},'vehicle-supplier':{cash:0}},bank:{reserves:10000},treasury:{cash:50000},housing:{households:{},apartmentBlocks:[]},weather:{precipitation:0,wind:0},totalTransactions:0,emergencyServicesEnabled:false,enterprises:{},utilities:{powerPlant:{gridOnline:true}}},journeys=[];let care=0,finance=0;
 const hooks={world:()=>state,random:()=>.5,neuralDrive:()=>.5,remember:()=>{},emit:()=>{},startJourney:(f,q)=>{journeys.push({actorId:f.id,...q});f.traveling=true;f.targetLocationId=q.id;f.routeWaypoints=[{x:f.x+10,z:f.z,mode:'car'}];},moveFly:()=>{},needsAndActivities:()=>care++,payAndFinance:()=>finance++};
 return {s:state,hooks,journeys,get care(){return care;},get finance(){return finance;}};
}
test('country commitments protect active work and travel while completed alarms and offshift roles remain ordinary residents',()=>{
 for(const [field,value]of commitments)assert.equal(hasCountryCommitment(person(field,{[field]:value}),9*3600),true,field);
 const farmer=person('FARMER',{internationalWork:{shiftStart:6,hours:8}}),soldier=person('SOLDIER',{publicServiceRole:'army',preferredWorkStart:8,preferredWorkHours:8});assert.equal(hasCountryCommitment(farmer,18*3600),false);assert.equal(hasCountryCommitment(soldier,18*3600),false);assert.equal(hasCountryCommitment(soldier,9*3600),true);assert.equal(hasCountryCommitment(person('PEACE',{warResponse:{active:false}}),9*3600),false);
});
test('emergency recruitment never steals active new journeys, foreign cargo or permanent public and farm jobs',()=>{
 const protectedPeople=commitments.map(([field,value])=>person(`PROTECTED-${field}`,{[field]:value}));protectedPeople.push(person('OFFSHIFT-ARMY',{publicServiceRole:'army',preferredWorkStart:16}),person('OFFSHIFT-FARM',{internationalWork:{shiftStart:16,hours:8}}));
 const free=Array.from({length:18},(_,i)=>person(`AVAILABLE-${i}`)),t=fixture([...protectedPeople,...free]);t.s.emergencyServicesEnabled=true;const before=protectedPeople.map(f=>({id:f.id,jobId:f.jobId,money:f.money,savings:f.savings,brain:f.brain})),service=createFireService(t.hooks);service.init();
 assert.equal(service.snapshot().roster.length,15);assert.ok(service.snapshot().roster.every(f=>f.id.startsWith('AVAILABLE-')));assert.deepEqual(protectedPeople.map(f=>({id:f.id,jobId:f.jobId,money:f.money,savings:f.savings,brain:f.brain})),before);assert.equal(t.journeys.length,0);assert.equal(t.care,0);assert.equal(t.finance,0);
});
test('civic crews cannot invoice or pay new country commitments and a stale builder cannot clear an owned foreign route',()=>{
 const protectedPeople=commitments.map(([field,value])=>person(field,{[field]:value})),t=fixture(protectedPeople),urban=createUrbanWorld(t.hooks);urban.init();const b=BUILDINGS.find(b=>b.kind==='house');t.s.urbanWorld.buildings[b.id]={...b,health:50,stage:'damaged'};t.s.urbanWorld.nextFireAt=t.s.urbanWorld.nextGrowthAt=t.s.urbanWorld.development.nextReviewAt=1e12;const project=urban.submitProject(b.id),cash=protectedPeople.reduce((n,f)=>n+f.money+f.savings,0);
 t.s.simulationAgeSeconds+=600;urban.tick(600,{hour:9});assert.equal(project.workerIds.length,0);assert.equal(project.materialsOrdered,0);assert.equal(project.progress,0);assert.equal(protectedPeople.reduce((n,f)=>n+f.money+f.savings,0),cash);
 const actor=protectedPeople[0],route=[{x:-900,z:-820,mode:'walk'}];Object.assign(actor,{traveling:true,targetLocationId:'north-airport',routeWaypoints:route,urbanTask:{id:project.id,type:'build',targetId:`CIVIC-SITE-${project.id}`}});assert.equal(urban.handleResident(actor,{hour:9}),false);assert.equal(actor.urbanTask,null);assert.equal(actor.traveling,true);assert.equal(actor.routeWaypoints,route);assert.equal(t.care,0);assert.equal(t.finance,0);
});
test('road errands respect every active country commitment but an offshift farm employee can drive normally',()=>{
 const protectedPeople=commitments.flatMap(([field,value])=>[person(`${field}-BUYER`,{[field]:value}),person(`${field}-DRIVER`,{[field]:value,vehicle:'compact car'})]),offshift=person('OFFSHIFT',{vehicle:'compact car',internationalWork:{shiftStart:16,hours:8}}),t=fixture([...protectedPeople,offshift]),roads=createRoadLife(t.hooks);roads.tick();
 assert.ok(t.journeys.some(j=>j.actorId==='OFFSHIFT'));assert.ok(t.journeys.every(j=>j.actorId==='OFFSHIFT'));assert.ok(protectedPeople.every(f=>!f.roadDuty&&!f.mobilityShopping));assert.equal(t.care,0);assert.equal(t.finance,0);
});
test('social and sports appointments reject active country tasks without double life care and permit offshift public and farm leisure',()=>{
 const a=person('A',{friends:['B']}),b=person('B',{x:16,friends:['A']}),t=fixture([a,b]),social=createResidentRelationships(t.hooks),sports=createSportsLuxury(t.hooks),civic=createCivicConflict({...t.hooks,urbanWorld:{isUnavailable:()=>false}});social.init();sports.init();civic.init();
 for(const [field,value]of commitments){a[field]=value;const choices=[];social.addChoices(a,{hour:9},(...q)=>choices.push(q));assert.equal(choices.length,0,field);assert.equal(social.handleResident(a,{hour:9}),false);assert.equal(civic.startAssembly(a),null,field);a.currentLocationId='tennis';assert.equal(sports.beginSports(a,'tennis','player'),false,field);a.currentLocationId='park';delete a[field];}
 assert.equal(t.care,0);assert.equal(t.finance,0);
 t.s.simulationAgeSeconds=18*3600;Object.assign(a,{publicServiceRole:'army',preferredWorkStart:8,preferredWorkHours:8,internationalWork:{shiftStart:6,hours:8}});const choices=[];social.addChoices(a,{hour:18},(...q)=>choices.push(q));assert.ok(choices.length);a.currentLocationId='tennis';assert.equal(sports.beginSports(a,'tennis','player'),true);assert.equal(t.care,0);assert.equal(t.finance,0);
});
test('guarded country staff still receive real ground ambulance care when injured',()=>{
 const patient=person('PATIENT',{publicServiceRole:'army',nationalServiceDuty:{kind:'guard'},health:30,x:-63,z:43.5,currentLocationId:'cinema'}),t=fixture([...Array.from({length:18},(_,i)=>person(`CREW-${i}`,{x:830,z:-200,currentLocationId:'firestation'})),patient]);t.s.emergencyServicesEnabled=true;const service=createFireService(t.hooks);service.init();const ambulance=service.dispatchAmbulance(patient,{hour:9});assert.ok(ambulance);assert.ok(patient.ambulanceDuty);assert.equal(service.handleResident(patient,{hour:9}),true);assert.equal(t.care,1);assert.equal(t.finance,1);assert.equal(patient.health,30,'dispatch does not invent remote healing');
});
