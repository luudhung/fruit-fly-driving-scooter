import {BUILDINGS} from '../worker/city-map.mjs';
import {apartmentHouseholdCapacity} from '../worker/housing-capacity.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {RESIDENT_TARGET} from '../worker/population-limits.mjs';
import {freshState,restoreState,getState,getNeuralAgents,getNeuralStatus,cityVisitors,tick,tickFly,gameClock,liquidMoneySupply,needsAndActivities} from '../worker/civilization-engine.mjs';

test('visitor brains join neural scheduling and selection without changing the resident census across restore',()=>{
 const s=freshState(),residentBrains=s.flies.map(f=>f.brain.id),before=liquidMoneySupply();
 const v=cityVisitors.spawnVisitor({budget:1000});assert.ok(v);const brainId=v.brain.id;
 assert.equal(s.flies.length,RESIDENT_TARGET);assert.equal(getNeuralAgents().length,RESIDENT_TARGET+1);assert.equal(getNeuralStatus().visitorBrains,1);
 assert.equal(new Set(getNeuralAgents().map(a=>a.brain_id)).size,RESIDENT_TARGET+1);
 assert.ok(Math.abs(liquidMoneySupply()-before-1000)<1e-6);
 let snapshot=getState({observer:true,selectedId:v.id});assert.equal(snapshot.selectedFly.id,v.id);assert.equal(snapshot.cityVisitors.visitors[0].brainId,brainId);
 const restored=restoreState(JSON.parse(JSON.stringify(s)));
 assert.deepEqual(restored.flies.map(f=>f.brain.id),residentBrains);assert.equal(restored.cityVisitors.visitors[0].brain.id,brainId);
 assert.equal(getNeuralAgents().length,RESIDENT_TARGET+1);assert.equal(getState().population,RESIDENT_TARGET);
});

test('a resident taking disaster shelter still ages and reaches natural mortality',()=>{
 const s=freshState(),f=s.flies[0],unit=f.housingUnitId;
 s.urbanWorld.buildings[unit]={id:unit,stage:'unsafe'};
 f.displacedFrom={buildingId:unit,homeX:f.homeX,homeZ:f.homeZ,since:0};
 Object.assign(f,{currentLocationId:'hotel',traveling:false,indoors:true,action:'temporary disaster shelter',bornAtGameYears:-101,ageYears:50});
 const deaths=s.deaths;tickFly(f,gameClock());
 assert.equal(f.ageYears,101);assert.equal(f.alive,false);assert.equal(f.causeOfDeath,'old age');assert.equal(s.deaths,deaths+1);
});

test('taxi commitments advance resident needs once while preserving service-owned motion',()=>{
 const s=freshState(),f=s.flies[0];
 Object.assign(f,{cityService:'TAXI-TEST',taxiDriver:true,currentLocationId:'park',indoors:false,traveling:true,transitMode:'car',hunger:20,energy:80,x:200,z:0,arrestedUntil:0,health:95});
 const x=f.x,z=f.z,hunger=f.hunger;tickFly(f,gameClock());
 assert.equal(f.x,x);assert.equal(f.z,z);assert.ok(Math.abs(f.hunger-hunger-.055)<1e-8);assert.ok(f.energy<80);
});

test('an enterprise in unsafe premises cannot book export revenue or operating costs',async()=>{
 const s=freshState(),owner=s.flies[0];
 const e={id:'TEST-UNSAFE',ownerId:owner.id,status:'operating',locationId:'office',sector:'services',cash:1000,revenueLifetime:0,expensesLifetime:0,employees:[],margin:.5,reputation:.7};
 s.enterprises[e.id]=e;s.urbanWorld.buildings.office={id:'office',stage:'unsafe',health:80};
 await tick({gameSeconds:120,syncBrain:false,serialized:true});
 assert.equal(e.cash,1000);assert.equal(e.revenueLifetime,0);assert.equal(e.expensesLifetime,0);
});


test('a renter chooses a Riverside unit after arrival, preserving family wealth and starting a real route home',()=>{
 const s=freshState(),f=s.flies.find(f=>f.alive&&f.ageYears>=18&&!f.ownsHome&&f.homeX<400&&s.housing.households[f.householdId]?.members[0]===f.id),hh=s.housing.households[f.householdId];
 // The 1,000-person settlement can fill the old European stock. Offer a real
 // vacant block as a newly opened rental premise instead of assuming vacancies.
 const available=BUILDINGS.find(b=>b.kind==='block'&&b.x>480&&!s.housing.apartmentBlocks.some(h=>h.id===b.id));assert.ok(available);
 s.housing.apartmentBlocks.push({...available,capacity:apartmentHouseholdCapacity(available.h),rent:25,occupants:[],purchaseValue:25000});
 const old=hh.unitId,before=liquidMoneySupply(),oldBrain=f.brain.id;s.weather={condition:'clear',precipitation:0,wind:0};
 Object.assign(f,{currentLocationId:'riverside-homes',targetLocationId:'riverside-homes',x:650,z:120,traveling:false,indoors:false,action:'viewing a Riverside apartment',actionUntil:0,health:95,hunger:20,energy:90});
 tickFly(f,gameClock());
 assert.notEqual(hh.unitId,old);assert.ok(hh.homeX>480);assert.equal(f.homeId,'riverside-homes');assert.equal(f.housingUnitId,hh.unitId);assert.equal(f.brain.id,oldBrain);
 assert.equal(f.x,650);assert.equal(f.z,120);assert.equal(f.traveling,true);assert.ok(f.routeWaypoints.length);
 assert.equal(s.housing.apartmentBlocks.find(b=>b.id===hh.unitId).occupants.filter(id=>id===hh.id).length,1);
 assert.ok(!s.housing.apartmentBlocks.find(b=>b.id===old)?.occupants.includes(hh.id));
 assert.ok(Math.abs(liquidMoneySupply()-before)<1e-6);
});

test('map expansion appends Riverside housing once while preserving current titles and brains',()=>{
 const s=freshState();s.mapVersion=18;s.housing.apartmentBlocks=s.housing.apartmentBlocks.filter(b=>b.x<480);
 const ids=s.flies.map(f=>f.brain.id),titles=Object.values(s.housing.households).map(h=>h.unitId),before=liquidMoneySupply();
 const restored=restoreState(JSON.parse(JSON.stringify(s)));const count=restored.housing.apartmentBlocks.length;
 assert.ok(restored.housing.apartmentBlocks.some(b=>b.x>480));assert.deepEqual(restored.flies.map(f=>f.brain.id),ids);assert.deepEqual(Object.values(restored.housing.households).map(h=>h.unitId),titles);assert.ok(Math.abs(liquidMoneySupply()-before)<1e-6);
 assert.equal(restoreState(JSON.parse(JSON.stringify(restored))).housing.apartmentBlocks.length,count);
});

test('Riverside market and cafe provide actual food and paid coffee without creating money',()=>{
 const s=freshState(),f=s.flies[0];Object.assign(f,{currentLocationId:'riverside-market',traveling:false,indoors:true,hunger:80,thirst:15,money:20,health:95});
 const before=liquidMoneySupply();needsAndActivities(f,gameClock());assert.ok(f.hunger<30);assert.ok(s.businesses['riverside-market'].cash>0);assert.ok(Math.abs(liquidMoneySupply()-before)<1e-6);
 Object.assign(f,{currentLocationId:'riverside-cafe',action:'drinking Hansdrex coffee',lastCoffeeAt:-99999,caffeine:0});
 const cash=s.businesses['riverside-cafe'].cash;needsAndActivities(f,gameClock());assert.ok(f.caffeine>50);assert.ok(s.businesses['riverside-cafe'].cash>cash);assert.ok(Math.abs(liquidMoneySupply()-before)<1e-6);
});

test('v19 migration adds exactly 100 permanent Riverside residents once while preserving the original residents',()=>{
 const previous=freshState(),removed=new Set(previous.riversideSettlement.arrivalIds);
 const removedHouseholds=new Set(previous.flies.filter(f=>removed.has(f.id)).map(f=>f.householdId));
 previous.flies=previous.flies.filter(f=>!removed.has(f.id));for(const id of removedHouseholds)delete previous.housing.households[id];
 for(const block of previous.housing.apartmentBlocks)block.occupants=block.occupants.filter(id=>!removedHouseholds.has(id));
 delete previous.riversideSettlement;previous.mapVersion=19;
 const identity=previous.flies.map(f=>[f.id,f.brain.id,f.brain.fullConnectome.neuralStepsTotal,f.housingUnitId,f.money,f.savings]);
 const oldCount=previous.flies.length,oldDeaths=previous.deaths;
 const migrated=restoreState(structuredClone(previous)),added=migrated.flies.slice(oldCount);
 assert.equal(added.length,100);assert.ok(added.every(f=>f.homeDistrict==='riverside'&&f.homeX>480&&f.housingUnitId&&f.brain.id));
 assert.deepEqual(migrated.flies.slice(0,oldCount).map(f=>[f.id,f.brain.id,f.brain.fullConnectome.neuralStepsTotal,f.housingUnitId,f.money,f.savings]),identity);assert.equal(migrated.deaths,oldDeaths);
 const total=liquidMoneySupply(),count=migrated.flies.length;const again=restoreState(structuredClone(migrated));assert.equal(again.flies.length,count);assert.equal(again.riversideSettlement.added,100);assert.ok(Math.abs(liquidMoneySupply()-total)<1e-6);
});
