import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BUILDINGS,HANSDREX_STOREFRONTS,LOCATIONS,TOWER_OBSERVATION,blocked,pedestrianRoute} from '../worker/city-map.mjs';
import {COUNTRY_IDS,countryAt} from '../worker/country-map.mjs';
import {createCityVisitors} from '../worker/city-visitors.mjs';

function setup(){
 const state={simulationAgeSeconds:12*3600,flies:[],centralBank:{priceLevel:1},businesses:{
  market:{cash:50,inventory:30,price:3},'riverside-market':{cash:50,inventory:30,price:4},'corner-shop':{cash:50,inventory:30,price:5},
 }};
 const visitor={id:'EVENT-GUEST',alive:true,ageYears:32,kind:'visitor',money:500,savings:0,hunger:62,energy:95,happiness:60,stress:20,placesVisited:[],departAt:6*86400};
 const visitors=createCityVisitors({world:()=>state});visitors.init();
 const arrive=pin=>Object.assign(visitor,{x:pin.x,y:1.1,z:pin.z,currentLocationId:pin.id});
 return {state,visitor,visitors,arrive};
}
test('Hansdrex has street entrances on most eligible buildings and direct Tower access',()=>{
 const eligible=BUILDINGS.filter(b=>countryAt(b)===COUNTRY_IDS.hansdrex&&['block','apartment'].includes(b.kind)&&b.h>=10&&Math.min(b.w,b.d)>=7);
 assert.ok(HANSDREX_STOREFRONTS.length>eligible.length*.5);
 assert.ok(HANSDREX_STOREFRONTS.every(s=>!blocked(s)&&LOCATIONS.some(l=>l.id===s.id)));
 assert.ok(HANSDREX_STOREFRONTS.filter(s=>s.europe&&s.kind==='food').length>=12);
 assert.ok(pedestrianRoute(LOCATIONS.find(l=>l.id==='park'),TOWER_OBSERVATION).length);
});
test('restaurant sales require a real arrival, remaining cash and one item from a real regional market',()=>{
 const {state,visitor,visitors,arrive}=setup(),restaurant=HANSDREX_STOREFRONTS.find(s=>s.europe);
 const liquid=()=>visitor.money+Object.values(state.businesses).reduce((n,b)=>n+b.cash,0);
 const before=liquid();
 assert.equal(visitors.visitEventAttraction(visitor,restaurant.id,{hour:12}),false);
 arrive(restaurant);
 assert.ok(visitors.visitEventAttraction(visitor,restaurant.id,{hour:12}));
 assert.equal(state.businesses['riverside-market'].inventory,29);assert.equal(liquid(),before);
 assert.equal(visitor.hunger,7);assert.equal(visitors.snapshot().tourism.europeDining,1);
 assert.equal(visitors.visitEventAttraction(visitor,restaurant.id,{hour:12}),false);
 assert.equal(state.businesses['riverside-market'].inventory,29);
});
test('Tower ticket stays booked over a checkpoint and actually ascends the lift before it counts as a visit',()=>{
 const {state,visitor,visitors,arrive}=setup();arrive(TOWER_OBSERVATION);
 const before=visitor.money;assert.ok(visitors.visitEventAttraction(visitor,TOWER_OBSERVATION.id,{hour:12}));
 assert.equal(visitor.money,before-19);
 assert.equal(visitors.snapshot().tourism.towerVisits,0);
 const restored=JSON.parse(JSON.stringify(visitor));
 state.simulationAgeSeconds+=1800;assert.ok(visitors.visitEventAttraction(restored,TOWER_OBSERVATION.id,{hour:12}));
 assert.equal(restored.y,TOWER_OBSERVATION.deck.y);
 assert.equal(visitors.snapshot().tourism.towerVisits,1);
 state.simulationAgeSeconds+=4800;assert.ok(visitors.visitEventAttraction(restored,TOWER_OBSERVATION.id,{hour:14}));
 assert.equal(restored.y,1.1);assert.equal(restored.z,TOWER_OBSERVATION.z);
 assert.equal(restored.money,before-19);
 assert.equal(visitors.snapshot().tourism.towerVisits,1);
});
test('the Grand Prix allocates actual Hansdrex hotel capacity and conserves the room purchase across restore',()=>{
 const {state,visitor,visitors,arrive}=setup();arrive(LOCATIONS.find(l=>l.id==='north-hotel'));
 assert.ok(visitors.reserveEventRoom(visitor,3));const booked=visitor.eventHotelId;
 const hotel=state.cityVisitors.hotels[booked],before=visitor.money;
 assert.equal(countryAt(LOCATIONS.find(l=>l.id===booked)),COUNTRY_IDS.hansdrex);
 assert.ok(hotel.capacity>=42);assert.equal(hotel.rooms[visitor.id].nights,3);
 assert.equal(state.businesses[booked].cash,500-before);
 const restored=JSON.parse(JSON.stringify(visitor));
 assert.ok(visitors.reserveEventRoom(restored,3));assert.equal(restored.money,before);
 visitors.releaseEventRoom(restored);visitors.releaseEventRoom(restored);
 assert.equal(hotel.rooms[visitor.id],undefined);
 assert.equal(state.businesses[booked].cash,500-before);
});
