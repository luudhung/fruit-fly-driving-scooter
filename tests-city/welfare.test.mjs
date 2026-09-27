import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,applyWelfareRecovery,payBirthGrant,needsAndActivities,mortalityReport,liquidMoneySupply,completePregnancy} from '../worker/civilization-server.mjs';
test('extinction recovery adds exactly 100 with homes and independent brains, preserving dead history, once',()=>{
 const s=freshState();for(const f of s.flies){f.alive=false;f.causeOfDeath='natural causes';f.thirst=100;}
 s.deaths=s.flies.length;const old=[...s.flies];s.welfare.recoveryVersion=0;
 assert.equal(applyWelfareRecovery(),100);const live=s.flies.filter(f=>f.alive);
 assert.equal(live.length,100);assert.equal(new Set(live.map(f=>f.brain.id)).size,100);
 assert.ok(live.every(f=>f.householdId&&f.housingUnitId));assert.ok(old.every(f=>!f.alive));
 assert.equal(applyWelfareRecovery(),0);assert.equal(s.deaths,old.length);
 assert.equal(mortalityReport().byCause['natural causes'],old.length);
 assert.equal(mortalityReport().riskAtDeath.dehydrated,old.length);
});
test('each newborn grants 1000 exactly once; twins get 2000, treasury funds conserved',()=>{
 const s=freshState(),mother=s.flies[0];const money=mother.money,total=liquidMoneySupply(),cash=s.treasury.cash;
 assert.equal(payBirthGrant({id:'BABY-A'},mother),true);assert.equal(payBirthGrant({id:'BABY-B'},mother),true);
 assert.equal(payBirthGrant({id:'BABY-A'},mother),false);
 assert.equal(mother.money,money+2000);assert.equal(s.treasury.cash,cash-2000);assert.ok(Math.abs(liquidMoneySupply()-total)<1e-6);
 s.treasury.cash=0;payBirthGrant({id:'BABY-C'},mother);assert.equal(s.treasury.cash,0);assert.equal(s.welfare.emergencyFunding,1000);
});
test('actual birth pays its family and cannot pay twice on the next tick',()=>{
 const s=freshState(),mother=s.flies[0],father=s.flies[1];s.flies=s.flies.slice(0,80);
 s.simulationAgeSeconds=86400*12;mother.pregnancyBy=father.id;mother.pregnancyDueAt=.9;
 const money=mother.money;completePregnancy(mother);const born=s.births;
 assert.ok(born===1||born===2);assert.equal(mother.money-money,1000*born);
 completePregnancy(mother);assert.equal(mother.money-money,1000*born);
});
test('zero-cash residents eat and drink indoors even with empty inventories, no wealth destroyed',()=>{
 const s=freshState(),f=s.flies[0];f.currentLocationId=f.homeId;f.indoors=true;f.traveling=false;f.money=0;f.hunger=99;f.thirst=99;f.health=75;f.action='resting at home';f.smoking=false;
 s.foodReserve=0;s.businesses.market.inventory=0;const total=liquidMoneySupply();
 needsAndActivities(f,{hour:12});assert.ok(f.hunger<45);assert.ok(f.thirst<35);assert.equal(f.money,0);assert.ok(s.foodReserve>0);assert.ok(Math.abs(liquidMoneySupply()-total)<1e-6);
 for(let i=0;i<20000;i++)needsAndActivities(f,{hour:12});
 assert.ok(f.health>=75);assert.ok(f.thirst<85);assert.ok(f.hunger<50);
});
test('park wheel admits a penniless resident and reduces stress after a real round trip',async()=>{
 const {simulateParkWheel}=await import('../worker/civilization-server.mjs');
 const s=freshState(),f=s.flies[0];s.weather={condition:'clear',precipitation:0,wind:0};
 Object.assign(f,{money:0,savings:0,currentLocationId:'ferris-wheel',traveling:false,action:'riding the free Central Park wheel',stress:90});
 assert.equal(simulateParkWheel(f),true);assert.ok(f.wheelRideUntil);const end=f.wheelRideUntil;
 s.simulationAgeSeconds+=1800;simulateParkWheel(f);assert.ok(f.y>2);
 s.simulationAgeSeconds=end;simulateParkWheel(f);assert.equal(f.wheelRideUntil,0);assert.equal(f.money,0);assert.ok(f.stress<70);assert.equal(s.parkLeisure.completedRides,1);
});
