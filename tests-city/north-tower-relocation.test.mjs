import test from 'node:test';import assert from 'node:assert/strict';
import {relocateNorthTower} from '../worker/north-tower-relocation.mjs';
import {NORTH_LANDMARK} from '../worker/country-map.mjs';
import {BUILDINGS,ROADS,AIRPORT_PARK,WATER,overlaps,pedestrianRoute,entrance,clearSegment} from '../worker/city-map.mjs';

test('Aurora occupies its own clear plot across the park street without taking parkland, roads or existing homes',()=>{
 const b=NORTH_LANDMARK;assert.equal(overlaps(b,AIRPORT_PARK),false);assert.ok(Math.abs(b.z-AIRPORT_PARK.z)-AIRPORT_PARK.d/2<45);
 assert.equal(ROADS.some(r=>overlaps(b,r,2)),false);assert.equal(WATER.some(r=>overlaps(b,r,1)),false);assert.equal(BUILDINGS.some(r=>r.id!==b.id&&overlaps(b,r,3)),false);
 const route=pedestrianRoute({x:AIRPORT_PARK.x,z:-938.75},entrance(b));assert.ok(route.length>1);for(let i=1;i<route.length;i++)assert.ok(clearSegment(route[i-1],route[i]));
});
test('moving the same tower preserves home ownership, residents, brains, money, fire damage and reconstruction escrow once',()=>{
 const id=NORTH_LANDMARK.id,brain={id:'UNCHANGED',weights:[.2,.8]},tenant={id:'A',alive:true,householdId:'HH',housingUnitId:id,homeId:id,homeX:-216,homeZ:-904,currentLocationId:id,x:-214,z:-903,y:1.1,indoors:true,traveling:false,money:500,savings:5000,brain},visitor={id:'B',alive:true,x:-230,z:-900,y:1.1,traveling:true,targetLocationId:id,money:75,brain:{id:'OTHER'}};
 const state={simulationAgeSeconds:1234,flies:[tenant,visitor],housing:{apartmentBlocks:[{id,x:-216,z:-904,occupants:['HH'],purchaseValue:240000}],households:{HH:{id:'HH',unitId:id,members:['A'],propertyValue:240000,homeX:-216,homeZ:-904}}},urbanWorld:{buildings:{[id]:{id,x:-216,z:-904,w:18,d:18,h:196,stage:'damaged',health:63}},projects:[{id:'REPAIR',buildingId:id,stage:'construction',progress:.4,escrow:4000}]}};
 const ids=state.flies.map(f=>[f.id,f.brain,f.money,f.savings]),project=structuredClone(state.urbanWorld.projects[0]);assert.equal(relocateNorthTower(state).moved,true);
 assert.equal(state.housing.households.HH.propertyValue,240000);assert.deepEqual(state.housing.apartmentBlocks[0].occupants,['HH']);assert.equal(state.urbanWorld.buildings[id].health,63);assert.equal(state.urbanWorld.buildings[id].stage,'damaged');
 assert.deepEqual(state.flies.map(f=>[f.id,f.brain,f.money,f.savings]),ids);assert.equal(tenant.brain,brain);assert.equal(tenant.homeX,NORTH_LANDMARK.x);assert.equal(tenant.x,NORTH_LANDMARK.x+2);assert.equal(tenant.z,NORTH_LANDMARK.z+1);assert.equal(visitor.x,-230);assert.equal(visitor.z,-900);assert.equal(visitor.relocatedDestinationId,id);assert.equal(state.urbanWorld.projects[0].escrow,project.escrow);assert.equal(state.urbanWorld.projects[0].progress,project.progress);
 const once=structuredClone(state);assert.equal(relocateNorthTower(state).moved,false);assert.deepEqual(state,once);
});
