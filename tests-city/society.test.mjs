import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,startJourney,moveFly,needsAndActivities,payAndFinance,professionalService,spend,liquidMoneySupply,inheritHousehold,maintainHouseholds,migrateGroundHousesToSafeLots,migrateResidentNavigation,recordInfidelity,revealInfidelity,endRelationship,commissionHeliTrial,simulateHeliTour} from '../worker/civilization-server.mjs';
import {entrance,blocked,BUILDINGS} from '../worker/city-map.mjs';
function base(){const s=freshState();s.weather={condition:'clear',precipitation:0,wind:0};return s;}
test('sleep begins only after arrival inside the assigned home and remains motionless',()=>{
 const s=base(),f=s.flies[0];f.vehicle=null;f.indoors=false;Object.assign(f,entrance({x:f.homeX,z:f.homeZ}));f.x+=2;
 startJourney(f,{id:f.homeId,action:'sleeping'});
 assert.equal(f.sleeping,false);
 for(let t=0;t<30&&f.traveling;t++){s.simulationAgeSeconds+=120;moveFly(f);needsAndActivities(f,{hour:23,day:1,minute:0});}
 assert.equal(f.traveling,false);assert.equal(f.sleeping,true);assert.equal(f.indoors,true);
 assert.equal(f.x,f.homeX);assert.equal(f.z,f.homeZ);
 const x=f.x,z=f.z,energy=f.energy;for(let i=0;i<10;i++){moveFly(f);needsAndActivities(f,{hour:23,day:1,minute:0});}
 assert.equal(f.x,x);assert.equal(f.z,z);assert.ok(f.energy>=energy);
});
test('family capacity counts households and rent is charged once per family',()=>{
 const s=base(),mother=s.flies[0],child=s.flies[1];
 const old=s.housing.households[child.householdId];old.members=[];maintainHouseholds();inheritHousehold(child,mother);
 const hh=s.housing.households[mother.householdId];hh.monthlyHousingCost=30;mother.money=100;child.money=100;mother.traits.thrift=child.traits.thrift=0;mother.debt=child.debt=0;
 const before=mother.money+child.money;
 payAndFinance(mother,{day:5,hour:0,minute:0});payAndFinance(child,{day:5,hour:0,minute:0});
 assert.equal(before-mother.money-child.money,1);
 assert.ok(s.housing.apartmentBlocks.every(b=>b.occupants.length<=10));
});
test('spending conserves money and rejects unaffordable purchases',()=>{
 const s=base(),f=s.flies[0];f.money=20;const before=liquidMoneySupply();
 assert.equal(spend(f,21,s.treasury),false);assert.equal(f.money,20);
 assert.equal(spend(f,12,s.treasury),true);assert.equal(f.money,8);assert.ok(Math.abs(liquidMoneySupply()-before)<1e-6);
});
test('doctor cannot treat a patient while either is still traveling',()=>{
 const s=base(),doctor=s.flies[0],patient=s.flies[1];doctor.jobId='doctor';doctor.currentLocationId=patient.currentLocationId='hospital-central';doctor.indoors=patient.indoors=true;patient.health=30;
 doctor.traveling=true;professionalService(doctor);assert.equal(patient.health,30);
 doctor.traveling=false;patient.traveling=true;professionalService(doctor);assert.equal(patient.health,30);
 patient.traveling=false;professionalService(doctor);assert.ok(patient.health>30);
});
test('map migration preserves wealth/brains and gives every household one valid physical unit',()=>{
 const s=base(),wealth=s.flies.map(f=>[f.money,f.savings,f.brain.id]);migrateGroundHousesToSafeLots(7);migrateResidentNavigation(7);
 for(let i=0;i<s.flies.length;i++){const f=s.flies[i];assert.deepEqual([f.money,f.savings,f.brain.id],wealth[i]);assert.ok(BUILDINGS.some(b=>b.id===f.housingUnitId));if(!f.indoors)assert.equal(blocked(f),false);else assert.ok(BUILDINGS.some(b=>Math.abs(b.x-f.x)<b.w/2&&Math.abs(b.z-f.z)<b.d/2));}
});

test('infidelity is persisted as relationship state and discovery creates jealousy/trust loss',()=>{
 const s=base(),actor=s.flies[0],partner=s.flies[1],other=s.flies[2];
 actor.partnerId=partner.id;partner.partnerId=actor.id;actor.relationshipTrust=partner.relationshipTrust=70;actor.affection=partner.affection=65;
 actor.ageYears=partner.ageYears=other.ageYears=30;other.partnerId=null;
 const beforeEvents=s.events.length;
 assert.equal(recordInfidelity(actor,other,partner,false),true);
 assert.equal(actor.infidelityCount,1);assert.equal(actor.lastAffairWith,other.id);assert.equal(actor.affairDiscovered,false);
 assert.equal(partner.jealousy,0);
 assert.equal(revealInfidelity(actor,partner),true);
 assert.equal(actor.affairDiscovered,true);assert.ok(partner.jealousy>30);assert.ok(partner.relationshipTrust<50);
 assert.ok(s.events.length>=beforeEvents+2);
 assert.equal(endRelationship(actor,partner,'test trust collapse'),true);
 assert.equal(actor.partnerId,null);assert.equal(partner.partnerId,null);
});

test('free helicopter commissioning trial starts with residents 1 through 4 and zero-price tickets',()=>{
 const s=base();
 s.weather={condition:'clear',precipitation:0,wind:0,lightning:0};
 const batch=commissionHeliTrial({hour:12,day:1,minute:0});
 assert.deepEqual(batch.map(f=>f.id),['FLY-00001','FLY-00002','FLY-00003','FLY-00004']);
 for(const f of batch){assert.equal(f.lastHeliTicket,0);assert.equal(f.heliPassenger,true);assert.equal(f.transitMode,'helicopter');}
 assert.equal(s.heliTrial.batchesStarted,1);
});
test('helicopter trial advances through all first ten residents in batches',()=>{
 const s=base();s.weather={condition:'clear',precipitation:0,wind:0,lightning:0};
 for(let batchNo=0;batchNo<3;batchNo++){
   const batch=commissionHeliTrial({hour:12,day:1,minute:0});
   assert.ok(batch.length>0&&batch.length<=4);
   s.simulationAgeSeconds=Math.max(...batch.map(f=>f.heliTourUntil));
   for(const f of batch)simulateHeliTour(f,{hour:12,day:1,minute:0});
 }
 assert.deepEqual([...s.heliTrial.completedIds].sort(),Array.from({length:10},(_,i)=>`FLY-${String(i+1).padStart(5,'0')}`).sort());
});
