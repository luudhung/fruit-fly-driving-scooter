import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoadLife} from '../worker/road-life.mjs';
import {roadActors,reserveRoadParking,parkingReservations} from '../worker/vehicle-parking.mjs';
import {NORTH_F1_CIRCUIT} from '../worker/north-f1-map.mjs';

function fixture(){
 const state={simulationAgeSeconds:100,timeScale:120,flies:[],cityVisitors:{visitors:[]},northF1:{event:{charters:[{guests:[]}]}},businesses:{'vehicle-showroom':{cash:0}},treasury:{cash:1000},totalTransactions:0};
 const memories=[],events=[];
 const life=createRoadLife({world:()=>state,random:()=>.5,remember:(f,kind,payload)=>memories.push({id:f.id,kind,...payload}),emit:(kind,text,payload)=>events.push({kind,...payload})});
 return {state,life,memories,events};
}
test('F1 visitors and residents share one curb reservation directory and migrate old parked stacks',()=>{
 const {state,life}=fixture(),site=NORTH_F1_CIRCUIT.spectator;
 for(let i=0;i<70;i++){
  const f={id:`PARK-${i}`,alive:true,vehicle:i<35?'compact car':undefined,rentalCar:i>=35,x:site.x,z:site.z,traveling:false,phase:'visiting'};
  (i<35?state.flies:state.northF1.event.charters[0].guests).push(f);
  f.parkedCar=reserveRoadParking(state,f,site);
  assert.ok(f.parkedCar);
 }
 const actors=roadActors(state);assert.equal(actors.length,70);
 assert.equal(new Set(actors.map(f=>f.parkedCar.spaceId)).size,70);
 const old=actors[0].parkedCar;for(const f of actors)f.parkedCar={...old};
 life.normalizeParking();
 assert.equal(new Set(actors.map(f=>f.parkedCar.spaceId)).size,70,'old stacked cars receive separate real bays');
 const newcomer={id:'ARRIVING',alive:true};state.flies.push(newcomer);
 newcomer.destinationParking=life.destination(newcomer,site);
 const next={id:'NEXT',alive:true};state.flies.push(next);
 assert.notEqual(life.destination(next,site).spaceId,newcomer.destinationParking.spaceId,'an en-route arrival has reserved its bay');
 assert.ok(parkingReservations(state).size>=72);
});
test('a collision damages both real vehicles once, persists over restore, and teaches the involved drivers',()=>{
 const {state,life,memories,events}=fixture();
 const driver=id=>({id,alive:true,vehicle:'compact car',vehicleCondition:100,x:0,z:0,money:100,savings:0,brain:{},stress:0});
 const a=driver('A'),b=driver('B');state.flies.push(a,b);
 const cash=state.treasury.cash+a.money+b.money;
 assert.equal(life.recordCollision(a,b,{closingSpeed:2}),false,'a slow parking touch is not a crash');
 assert.equal(life.recordCollision(a,b,{closingSpeed:12}),true);
 assert.equal(a.vehicleCondition,80.8);assert.equal(b.vehicleCondition,80.8);
 assert.equal(life.recordCollision(a,b,{closingSpeed:12}),false,'contact cooldown prevents repeated per-tick damage');
 assert.equal(state.roadLife.totalIncidents,1);assert.equal(events.length,1);assert.equal(memories.length,2);
 assert.equal(a.brain.driving.lastOutcome,'vehicle collision');
 assert.equal(JSON.parse(JSON.stringify(state)).flies[0].vehicleCondition,80.8);
 assert.equal(state.treasury.cash+a.money+b.money,cash,'impact itself does not mint or destroy money');
 state.simulationAgeSeconds+=1800;life.recoverVehicles();
 assert.equal(a.vehicleRecovery.phase,'repair');assert.ok(a.parkedCar?.spaceId);assert.equal(a.traveling,false);
 assert.notEqual(a.parkedCar.spaceId,b.parkedCar.spaceId,'road clearance does not tow two cars onto the same curb');
 assert.equal(state.businesses['vehicle-recovery'].cash,24);assert.equal(state.treasury.cash,976);
 state.simulationAgeSeconds+=1800;life.recoverVehicles();
 assert.equal(a.vehicleCondition,100);assert.equal(a.vehicleRecovery,null);assert.ok(state.businesses['vehicle-showroom'].cash>0);
 assert.equal(state.treasury.cash+a.money+b.money+state.businesses['vehicle-recovery'].cash+state.businesses['vehicle-showroom'].cash,cash,'tow and repair bills transfer existing funds');
});
