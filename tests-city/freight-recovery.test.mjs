import test from 'node:test';import assert from 'node:assert/strict';
import {recoverStalledFreight} from '../worker/freight-recovery.mjs';
import {createVehicleIndex} from '../worker/traffic.mjs';
import {parkingPoint,LOCATIONS} from '../worker/city-map.mjs';

test('stalled freight clears a junction by a paid swept slow move, retaining cargo and escrow across restore',()=>{
 const bay=parkingPoint(LOCATIONS.find(l=>l.id==='INDUSTRY-north-4'));
 let truck={id:'FREIGHT',alive:true,x:bay.x+7,z:bay.z,y:1.1,heading:0,vehicleLength:6.4,traveling:true,transitMode:'car',phase:'delivering',jobId:'CARGO',routeDestination:'INDUSTRY-north-4',routeWaypoints:[{x:bay.x,z:bay.z}],routeIndex:0,freightProgress:{x:bay.x+7,z:bay.z,at:1}};
 const state={simulationAgeSeconds:7*3600,timeScale:120,flies:[],businesses:{'treasury:north-city':{cash:100},escrow:{cash:72}},treasury:{cash:100},regionalFreight:{trucks:[truck],jobs:[{id:'CARGO',quantity:30,paid:false}]},totalTransactions:0};
 let resumed=0,moved=0,last={x:truck.x,z:truck.z};
 for(let i=0;i<120&&resumed===0;i++){
  state.simulationAgeSeconds+=120;const result=recoverStalledFreight(state,truck,120,createVehicleIndex([truck]),()=>resumed++);assert.equal(result,true);
  const step=Math.hypot(truck.x-last.x,truck.z-last.z);assert.ok(step<=2.0001,'a tow may move only two map metres per real-equivalent second');moved+=step;last={x:truck.x,z:truck.z};
  if(i===1){truck=structuredClone(truck);state.regionalFreight.trucks=[truck];}
 }
 assert.equal(resumed,1);assert.ok(moved>5);assert.equal(state.businesses.escrow.cash,72);assert.equal(state.regionalFreight.jobs[0].paid,false);assert.equal(state.regionalFreight.jobs[0].quantity,30);assert.equal(truck.jobId,'CARGO');assert.equal(truck.phase,'delivering');assert.equal(state.businesses['treasury:north-city'].cash,88);assert.equal(state.treasury.cash,100);assert.equal(state.businesses['vehicle-recovery'].cash,12);
});
test('ordinary short red-light waits and completely blocked recovery corridors never teleport or charge a truck',()=>{
 const t={id:'BLOCKED',alive:true,x:-428.5,z:-1082,y:1.1,heading:Math.PI,traveling:true,transitMode:'car',freightProgress:{x:-428.5,z:-1082,at:1}},s={simulationAgeSeconds:3600,timeScale:120,flies:[],businesses:{},treasury:{cash:100},regionalFreight:{trucks:[t]}};
 assert.equal(recoverStalledFreight(s,t,120,()=>0),false);s.simulationAgeSeconds=7*3600;assert.equal(recoverStalledFreight(s,t,120,()=>0),false);assert.equal(t.x,-428.5);assert.equal(t.z,-1082);assert.equal(s.treasury.cash,100);assert.equal(t.freightRecovery,undefined);
});

test('only one recovery vehicle clears a congested junction at a time',()=>{
 const p=parkingPoint(LOCATIONS.find(l=>l.id==='INDUSTRY-north-4'));
 const first={id:'TOWED-1',alive:true,x:p.x+7,z:p.z,y:1.1,heading:0,vehicleLength:6.4,traveling:true,transitMode:'car',phase:'delivering',freightProgress:{x:p.x+7,z:p.z,at:1}},second={...first,id:'TOWED-2',x:p.x+15,freightProgress:{x:p.x+15,z:p.z,at:1}};
 const s={simulationAgeSeconds:7*3600,timeScale:120,flies:[],businesses:{'treasury:north-city':{cash:100}},treasury:{cash:100},regionalFreight:{trucks:[first,second]}};
 assert.equal(recoverStalledFreight(s,first,120,(_actor,end)=>Math.hypot(end.x-first.x,end.z-first.z)),true);assert.ok(first.freightRecovery);
 assert.equal(recoverStalledFreight(s,second,120,()=>100),false);assert.equal(second.freightRecovery,undefined);assert.equal(s.businesses['vehicle-recovery'].cash,12);
});
