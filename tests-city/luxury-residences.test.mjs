import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,restoreState,purchaseLuxuryApartment,liquidMoneySupply} from '../worker/civilization-engine.mjs';
import {LUXURY_RESIDENCES,SKYLINE_REDEVELOPMENTS,BUILDINGS,PETRONAS_TOWERS,clearSegment,entrance} from '../worker/city-map.mjs';

test('premium residences have actual for-sale capacity and are excluded from random starter rentals',()=>{
 const state=freshState();
 for(const residence of LUXURY_RESIDENCES){
  const block=state.housing.apartmentBlocks.find(item=>item.id===residence.id);
  assert.ok(block.luxury);
  assert.ok(block.purchaseValue>=300000&&block.purchaseValue<=1500000);
  assert.equal(block.occupants.length,0);
 }
 assert.ok(PETRONAS_TOWERS.h>=180);
 for(const x of [-154,-102,-92]){
  assert.ok(clearSegment({x,z:-55},{x,z:-34}),'street under the elevated skybridge stays open');
 }
});

test('an onsite wealthy buyer pays the full quoted price exactly once for their household',()=>{
 const state=freshState(),fly=state.flies.find(item=>item.ageYears>=21&&!item.ownsHome);
 const block=state.housing.apartmentBlocks.find(item=>item.id==='empire');
 const household=state.housing.households[fly.householdId];
 Object.assign(fly,{money:100000,savings:1000000,currentLocationId:block.id,traveling:false,ownsHome:false});
 const cash=fly.money+fly.savings,supply=liquidMoneySupply(),records=state.flies.map(item=>[item.id,item.brain.id]);
 assert.equal(purchaseLuxuryApartment(fly,block.id),true);
 assert.equal(fly.money+fly.savings,cash-block.purchaseValue);
 assert.equal(fly.homeEquity,block.purchaseValue);
 assert.equal(household.unitId,block.id);
 assert.ok(block.occupants.includes(household.id));
 assert.equal(purchaseLuxuryApartment(fly,block.id),false);
 assert.ok(Math.abs(liquidMoneySupply()-supply)<1e-6);
 assert.deepEqual(state.flies.map(item=>[item.id,item.brain.id]),records);
 const restored=restoreState(structuredClone(state));
 assert.equal(restored.flies.find(item=>item.id===fly.id).homeEquity,block.purchaseValue);
});

test('park-side parcel redevelopment keeps the existing households and wealth across restore',()=>{
 const state=freshState(),fly=state.flies[0],household=state.housing.households[fly.householdId];
 state.mapVersion=21;
 const [oldId,newId]=Object.entries(SKYLINE_REDEVELOPMENTS)[0];
 const block=state.housing.apartmentBlocks.find(item=>item.id===newId);
 block.id=oldId;block.occupants=[household.id];
 Object.assign(household,{unitId:oldId,homeX:block.x,homeZ:block.z});
 Object.assign(fly,{housingUnitId:oldId,homeX:block.x,homeZ:block.z});
 const before={money:fly.money,savings:fly.savings,brainId:fly.brain.id};
 const restored=restoreState(structuredClone(state)),resident=restored.flies.find(item=>item.id===fly.id);
 assert.equal(resident.housingUnitId,newId);
 assert.deepEqual({money:resident.money,savings:resident.savings,brainId:resident.brain.id},before);
 assert.equal(restored.housing.households[household.id].unitId,newId);
 assert.equal(restored.housing.apartmentBlocks.filter(item=>item.id===newId).length,1);
 assert.ok(BUILDINGS.find(item=>item.id===newId).h>100);
});

test('map24 swaps the obstructing apartment and left tower while preserving titles, brains, money and a committed home journey',()=>{
 const state=freshState();state.mapVersion=23;
 const ids=['APT-33','petronas-east'],oldXs=[-138,-171],people=state.flies.slice(0,2);
 for(const [index,id]of ids.entries()){
  const fly=people[index],block=state.housing.apartmentBlocks.find(b=>b.id===id),hh=state.housing.households[fly.householdId];
  Object.assign(block,{x:oldXs[index],z:-43.5,occupants:[hh.id]});
  Object.assign(hh,{unitId:id,homeX:oldXs[index],homeZ:-43.5});
  Object.assign(fly,{housingUnitId:id,homeId:index===0?'apt-west':id,currentLocationId:index===0?'apt-west':id,indoors:true,traveling:false,x:oldXs[index],z:-43.5,homeX:oldXs[index],homeZ:-43.5});
 }
 const returning=state.flies[2];
 Object.assign(returning,{housingUnitId:'APT-33',homeId:'apt-west',homeX:-138,homeZ:-43.5,indoors:false,x:-200,z:0,traveling:true,targetLocationId:'apt-west',onTrain:true,metroLineId:'M1',transitFarePaid:3.5,routeWaypoints:[{x:-138,y:1.1,z:-35.8,mode:'walk'}]});
 const before=people.map(f=>({id:f.id,brain:f.brain.id,money:f.money,savings:f.savings,unit:f.housingUnitId,hh:f.householdId})),supply=liquidMoneySupply(),route=structuredClone(returning.routeWaypoints);
 const restored=restoreState(structuredClone(state));
 for(const item of before){
  const fly=restored.flies.find(f=>f.id===item.id),base=BUILDINGS.find(b=>b.id===item.unit),hh=restored.housing.households[item.hh];
  assert.equal(fly.housingUnitId,item.unit);assert.equal(fly.brain.id,item.brain);assert.equal(fly.money,item.money);assert.equal(fly.savings,item.savings);
  assert.equal(fly.homeX,base.x);assert.equal(fly.x,base.x);assert.equal(hh.unitId,item.unit);assert.equal(hh.homeX,base.x);
 }
 const rider=restored.flies.find(f=>f.id===returning.id);
 assert.equal(rider.onTrain,true);assert.equal(rider.transitFarePaid,3.5);assert.deepEqual(rider.routeWaypoints,route);
 assert.equal(rider.relocatedDestinationId,'apt-west');assert.deepEqual(rider.relocatedDestinationPoint,entrance(BUILDINGS.find(b=>b.id==='APT-33')));
 assert.ok(Math.abs(liquidMoneySupply()-supply)<1e-6);
 const again=restoreState(structuredClone(restored));assert.equal(again.flies.find(f=>f.id===people[0].id).homeX,-171);
});
