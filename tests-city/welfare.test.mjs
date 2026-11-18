import test from 'node:test';
import assert from 'node:assert/strict';
import {RESIDENT_TARGET,HAWAII_RESIDENT_TARGET} from '../worker/population-limits.mjs';
import {blocked,pedestrianRoute,LOCATIONS} from '../worker/city-map.mjs';
import {freshState,applyWelfareRecovery,payBirthGrant,needsAndActivities,mortalityReport,liquidMoneySupply,completePregnancy,maintainPopulation,restoreState} from '../worker/civilization-engine.mjs';
test('extinction recovery adds exactly 500 with homes and independent brains, preserving dead history, once',()=>{
 const s=freshState();for(const f of s.flies){f.alive=false;f.causeOfDeath='natural causes';f.thirst=100;}
 s.deaths=s.flies.length;const old=[...s.flies];s.welfare.recoveryVersion=0;
 assert.equal(applyWelfareRecovery(),500);const live=s.flies.filter(f=>f.alive);
 assert.equal(live.length,500);assert.equal(new Set(live.map(f=>f.brain.id)).size,500);
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
test('a penniless resident receives free indoor water and funded finite meals without resetting empty food stocks',()=>{
 const s=freshState(),f=s.flies[0];Object.assign(f,{currentLocationId:f.homeId,indoors:true,traveling:false,money:0,savings:0,hunger:99,thirst:99,health:75,action:'resting at home',smoking:false});
 s.foodReserve=0;s.businesses.market.inventory=0;const total=liquidMoneySupply(),treasury=s.treasury.cash;
 needsAndActivities(f,{day:1,hour:12,minute:0},0);assert.equal(f.hunger,99);assert.equal(f.thirst,44);assert.equal(s.foodReserve,0);assert.equal(s.businesses.market.inventory,0);assert.equal(s.treasury.cash,treasury);
 s.businesses.market.inventory=1;needsAndActivities(f,{day:1,hour:12,minute:0},0);assert.equal(f.hunger,39);assert.equal(f.thirst,0);assert.equal(s.businesses.market.inventory,0);assert.equal(f.money,0);assert.equal(s.treasury.cash,treasury-4);assert.ok(Math.abs(liquidMoneySupply()-total)<1e-6);
 f.hunger=99;needsAndActivities(f,{day:1,hour:12,minute:0},0);assert.equal(f.hunger,99);assert.equal(s.foodReserve,0);assert.equal(s.businesses.market.inventory,0);assert.equal(s.treasury.cash,treasury-4);
});
test('park wheel admits a penniless resident and reduces stress after a real round trip',async()=>{
 const {simulateParkWheel}=await import('../worker/civilization-server.mjs');
 const s=freshState(),f=s.flies[0];s.weather={condition:'clear',precipitation:0,wind:0};
 Object.assign(f,{money:0,savings:0,currentLocationId:'ferris-wheel',traveling:false,action:'riding the free Central Park wheel',stress:90});
 assert.equal(simulateParkWheel(f),true);assert.ok(f.wheelRideUntil);const end=f.wheelRideUntil;
 s.simulationAgeSeconds+=1800;simulateParkWheel(f);assert.ok(f.y>2);
 s.simulationAgeSeconds=end;simulateParkWheel(f);assert.equal(f.wheelRideUntil,0);assert.equal(f.money,0);assert.ok(f.stress<70);assert.equal(s.parkLeisure.completedRides,1);
 assert.equal(blocked(f),false);assert.ok(pedestrianRoute(f,LOCATIONS.find(l=>l.id==='market')).length>0,'wheel exit must connect to normal pedestrian routes');
});

test('legacy wheel visitor stranded in the reservoir walks to dry land without resetting identity or wealth',async()=>{
 const {simulateParkWheel}=await import('../worker/civilization-server.mjs'),s=freshState(),f=s.flies[0];
 Object.assign(f,{x:15,z:-80,y:1.1,wheelRideUntil:0,traveling:false,currentLocationId:'ferris-wheel',action:'waiting for a reachable route'});
 const before={id:f.id,brain:f.brain.id,money:f.money,savings:f.savings,hunger:f.hunger,energy:f.energy};
 assert.ok(blocked(f));let moved=0;
 for(let i=0;i<100&&f.currentLocationId==='ferris-wheel';i++){const x=f.x,z=f.z;assert.equal(simulateParkWheel(f),true);const step=Math.hypot(f.x-x,f.z-z);assert.ok(step>0&&step<=2.001,'recovery must walk rather than teleport');moved+=step;}
 assert.equal(blocked(f),false);assert.equal(f.currentLocationId,'park');assert.ok(moved>=13);assert.equal(f.wheelExitRecovery,null);
 assert.deepEqual({id:f.id,brain:f.brain.id,money:f.money,savings:f.savings,hunger:f.hunger,energy:f.energy},before);
 assert.equal(simulateParkWheel(f),false);assert.ok(pedestrianRoute(f,LOCATIONS.find(l=>l.id==='market')).length>0);
});

test('restoring 13 survivors adds 487 residents once and preserves survivors and death history',()=>{
 const s=freshState();s.flies=s.flies.slice(0,117);
 for(let i=0;i<104;i++){s.flies[i].alive=false;s.flies[i].causeOfDeath='natural causes';}
 s.deaths=104;s.airportExpansionVersion=0;s.welfare.recoveryVersion=1;s.mapVersion=13;
 const survivors=s.flies.filter(f=>f.alive).map(f=>({id:f.id,brain:f.brain.id,money:f.money,savings:f.savings}));
 const age=s.simulationAgeSeconds;
 restoreState(s);
 assert.equal(s.flies.filter(f=>f.alive).length,500);assert.equal(s.deaths,104);assert.equal(s.simulationAgeSeconds,age);
 for(const previous of survivors){const f=s.flies.find(f=>f.id===previous.id);assert.deepEqual({id:f.id,brain:f.brain.id,money:f.money,savings:f.savings},previous);}
 assert.ok(s.flies.filter(f=>f.alive).every(f=>f.housingUnitId));
 const count=s.flies.length;restoreState(s);assert.equal(s.flies.length,count);
});
test('population support replenishes below its 90% threshold at most daily and never revives the dead',()=>{
 const s=freshState(),removed=RESIDENT_TARGET-Math.floor(RESIDENT_TARGET*.9)+1,archived=s.flies.slice(0,removed);
 for(const f of s.flies.filter(f=>f.residencyCountryId==='hawaii').slice(0,HAWAII_RESIDENT_TARGET))f.alive=false;
 for(const f of archived){f.alive=false;f.causeOfDeath='natural causes';}s.deaths=removed+HAWAII_RESIDENT_TARGET;
 assert.equal(maintainPopulation(),removed);assert.equal(s.flies.filter(f=>f.alive).length,RESIDENT_TARGET);
 assert.ok(archived.every(f=>!f.alive));
 for(const f of s.flies.filter(f=>f.alive).slice(0,removed))f.alive=false;
 assert.equal(maintainPopulation(),0);s.simulationAgeSeconds+=86400;
 assert.equal(maintainPopulation(),removed);assert.equal(s.flies.filter(f=>f.alive).length,RESIDENT_TARGET);
});
