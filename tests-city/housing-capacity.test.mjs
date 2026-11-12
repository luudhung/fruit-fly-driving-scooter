import test from 'node:test';
import assert from 'node:assert/strict';
import {apartmentHouseholdCapacity,apartmentHasVacancy,normalizeHousingCapacities} from '../worker/housing-capacity.mjs';
import {freshState,restoreState,getState,assignApartment,assignGroundHouse,liquidMoneySupply} from '../worker/civilization-engine.mjs';
import {createUrbanWorld} from '../worker/urban-world.mjs';
import {BUILDINGS,APARTMENTS,applyUrbanGeometry} from '../worker/city-map.mjs';

test('height-based limits are monotonic 10–30 households, including single-person households',()=>{
 assert.equal(apartmentHouseholdCapacity(24),10);
 assert.equal(apartmentHouseholdCapacity(60),17);
 assert.equal(apartmentHouseholdCapacity(90),23);
 assert.equal(apartmentHouseholdCapacity(120),30);
 for(const value of [undefined,NaN,Infinity,-100,0])assert.equal(apartmentHouseholdCapacity(value),10);
 let previous=10;
 for(let height=0;height<=500;height++){
  const current=apartmentHouseholdCapacity(height);assert.ok(current>=10&&current<=30&&current>=previous);previous=current;
 }
 assert.equal(apartmentHasVacancy({h:24,occupants:Array.from({length:9},(_,i)=>`SINGLE-${i}`)}),true);
 assert.equal(apartmentHasVacancy({h:24,occupants:Array.from({length:10},(_,i)=>`SINGLE-${i}`)}),false);
});

test('all static apartments and physical ground houses use the shared household policy',()=>{
 const s=freshState(),snapshot=getState();
 assert.equal(snapshot.housing.capacityUnit,'households');
 for(const block of s.housing.apartmentBlocks){
  const physical=BUILDINGS.find(b=>b.id===block.id);
  assert.equal(block.capacity,apartmentHouseholdCapacity(physical.h));assert.equal(block.capacityUnit,'households');
 }
 for(const lot of s.housing.houseLots){assert.equal(lot.capacity,1);assert.equal(lot.capacityUnit,'households');}
 assert.ok(snapshot.housing.apartmentBlocks.every(b=>b.occupiedHouseholds===b.occupants&&Number.isInteger(b.residentCount)));
});

test('a lower capacity grandfathers every existing household, brain, wallet and unit without admitting another household',()=>{
 const s=freshState(),block=s.housing.apartmentBlocks.filter(b=>!b.luxury).sort((a,b)=>a.h-b.h)[0];
 const households=Object.values(s.housing.households).filter(h=>h.housingType==='apartment').slice(0,35),selected=new Set(households.map(h=>h.id));
 for(const b of s.housing.apartmentBlocks)b.occupants=(b.occupants||[]).filter(id=>!selected.has(id));
 block.occupants=[...selected];block.capacity=999;
 for(const hh of households){
  Object.assign(hh,{unitId:block.id,homeX:block.x,homeZ:block.z});
  for(const f of s.flies.filter(f=>f.householdId===hh.id))Object.assign(f,{housingUnitId:block.id,homeX:block.x,homeZ:block.z});
 }
 const dynamic={id:'CIVIC-CAPACITY',x:1000,z:80,w:12,d:14,h:72,health:100,stage:'operational',progress:1,kind:'civic'};
 s.urbanWorld.buildings[dynamic.id]=dynamic;
 s.housing.apartmentBlocks.push({...dynamic,h:24,capacity:2,occupants:['LEGACY-CIVIC-HH'],rent:20});
 const identities=s.flies.map(f=>[f.id,f.brain.id,f.money,f.savings,f.householdId,f.housingUnitId]),money=liquidMoneySupply();
 const restored=restoreState(structuredClone(s)),saved=restored.housing.apartmentBlocks.find(b=>b.id===block.id);
 assert.deepEqual(restored.flies.map(f=>[f.id,f.brain.id,f.money,f.savings,f.householdId,f.housingUnitId]),identities);
 assert.deepEqual(saved.occupants,[...selected]);assert.equal(apartmentHasVacancy(saved),false);
 assert.equal(saved.capacity,apartmentHouseholdCapacity(BUILDINGS.find(b=>b.id===saved.id).h));
 const stats=getState().housing.apartmentBlocks.find(b=>b.id===saved.id);
 assert.equal(stats.occupiedHouseholds,35);assert.equal(stats.overCapacityHouseholds,35-stats.capacity);assert.ok(stats.residentCount>=35);
 const civic=restored.housing.apartmentBlocks.find(b=>b.id===dynamic.id);assert.equal(civic.capacity,20);assert.deepEqual(civic.occupants,['LEGACY-CIVIC-HH']);
 assert.ok(Math.abs(liquidMoneySupply()-money)<1e-6);
 const again=restoreState(structuredClone(restored));
 assert.deepEqual(again.flies.map(f=>[f.id,f.brain.id,f.money,f.savings,f.householdId,f.housingUnitId]),identities);
 const newcomer=again.flies.find(f=>!selected.has(f.householdId)&&f.homeDistrict!=='riverside'),oldUnit=newcomer.housingUnitId;
 again.housing.apartmentBlocks=[again.housing.apartmentBlocks.find(b=>b.id===block.id)];
 assert.equal(assignApartment(newcomer),false);assert.equal(newcomer.housingUnitId,oldUnit);
});

test('one ground house accepts exactly one household and airport apartments retain a correct home destination',()=>{
 const s=freshState(),people=s.flies.filter(f=>f.homeDistrict!=='riverside').slice(0,2),lot=s.housing.houseLots[0];
 lot.ownerHouseholdId=null;s.housing.houseLots=[lot];
 assert.equal(assignGroundHouse(people[0]),true);
 const secondUnit=people[1].housingUnitId;
 assert.equal(assignGroundHouse(people[1]),false);assert.equal(people[1].housingUnitId,secondUnit);
 assert.equal(lot.ownerHouseholdId,people[0].householdId);
 const house=getState().housing.groundHouses.find(h=>h.id===lot.id);assert.equal(house.capacity,1);assert.equal(house.occupiedHouseholds,1);
 const airport=s.housing.apartmentBlocks.find(b=>b.id.startsWith('AIRPORT-APT-'));airport.occupants=[];s.housing.apartmentBlocks=[airport];
 assert.equal(assignApartment(people[1]),true);assert.equal(people[1].homeId,'airport-gardens-homes');
 assert.equal(people[1].homeX,airport.x);assert.equal(people[1].housingUnitId,airport.id);
});

test('new Westborough house and apartment leases use its own neighborhood destination without changing personal wealth',()=>{
 const s=freshState(),person=s.flies.find(f=>f.homeDistrict!=='riverside'),before={money:person.money,savings:person.savings,brain:person.brain.id};
 const apartment=s.housing.apartmentBlocks.find(b=>b.id.startsWith('WEST-APT-'));apartment.occupants=[];s.housing.apartmentBlocks=[apartment];
 assert.equal(assignApartment(person),true);assert.equal(person.homeId,'west-gardens-homes');assert.equal(person.homeX,apartment.x);
 const house=s.housing.houseLots.find(b=>b.id.startsWith('WEST-HOUSE-'));house.ownerHouseholdId=null;s.housing.houseLots=[house];
 assert.equal(assignGroundHouse(person),true);assert.equal(person.homeId,'west-gardens-homes');assert.equal(person.homeX,house.x);
 assert.deepEqual({money:person.money,savings:person.savings,brain:person.brain.id},before);
});

test('completed resident construction creates household capacity from its physical height',()=>{
 applyUrbanGeometry();
 const owner={id:'BUILDER',alive:true,ageYears:30,health:100,energy:90,hunger:10,money:30000,savings:30000,traits:{empathy:.5},brain:{},x:860,z:0,y:1.1};
 const state={simulationAgeSeconds:0,flies:[owner],businesses:{},housing:{households:{},apartmentBlocks:[]},treasury:{cash:50000},totalTransactions:0,weather:{precipitation:0},enterprises:{},utilities:{powerPlant:{gridOnline:true}}};
 const urban=createUrbanWorld({world:()=>state,random:()=>.5,emit:()=>{},remember:()=>{},startJourney:()=>{},moveFly:()=>{},needsAndActivities:()=>{},payAndFinance:()=>{}});
 urban.init();state.urbanWorld.nextFireAt=state.urbanWorld.nextGrowthAt=1e12;
 const project=urban.develop({id:'CIVIC-CAPACITY-FINISHED',x:1000,z:0,w:12,d:14,h:72},owner.id);assert.ok(project);
 // Exercise the completed inspection boundary; delivery/labor behavior is covered by urban-world tests.
 project.stage='inspection';project.inspectionAt=0;state.simulationAgeSeconds=600;urban.tick(600,{hour:12});
 const block=state.housing.apartmentBlocks.find(b=>b.id===project.buildingId);assert.ok(block);assert.equal(block.capacity,20);assert.equal(block.capacityUnit,'households');
 block.capacity=2;normalizeHousingCapacities(state.housing,BUILDINGS);assert.equal(block.capacity,20);
 assert.ok(APARTMENTS.every(b=>b.capacity>=10&&b.capacity<=30));
});
