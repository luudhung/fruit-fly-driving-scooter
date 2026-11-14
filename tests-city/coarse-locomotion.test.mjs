import test from 'node:test';import assert from 'node:assert/strict';
import {freshState,moveFly,tick,setNeuralSyncEnabled} from '../worker/civilization-engine.mjs';
setNeuralSyncEnabled(false);
function walker(){const s=freshState();s.weather={condition:'clear',precipitation:0,wind:0,nextChangeAt:1e12};const f=s.flies.find(f=>f.ageYears>21&&!f.publicServiceRole&&!f.facilityEmployment&&!f.urbanTask&&!f.cityService);Object.assign(f,{x:100,y:1.1,z:-300,targetX:300,targetZ:-300,finalTargetX:300,finalTargetZ:-300,targetLocationId:'park',currentLocationId:'street',traveling:true,indoors:false,onTrain:false,onPlane:false,transitMode:'walk',transitStage:'walk',routeWaypoints:[{x:300,y:1.1,z:-300,mode:'walk',stage:'walk'}],routeIndex:0,actionUntil:1e12,action:'walking',pendingAction:'walking',hunger:10,thirst:10,energy:95,health:100,stress:5,sleeping:false,vehicle:null,mobilityShopping:false,jobId:null});return{s,f};}
test('a sampled 1200-second tick advances ten ordinary movement seconds, retaining physical velocity units',async()=>{
 const {f}=walker();await tick({gameSeconds:1200,serialized:true});const distance=Math.hypot(f.x-100,f.z+300);assert.ok(distance>20,`only advanced ${distance}m in ten movement seconds (${f.action})`);assert.ok(Math.abs(distance-f.motionSpeed*10)<.01);assert.ok(Math.abs(Math.hypot(f.vx,f.vz)-f.motionSpeed)<.01);
});
test('the coarse movement budget follows each corner instead of stalling at the first short waypoint or cutting diagonally',()=>{
 const {f}=walker();f.routeWaypoints=[108,114,122].map(x=>({x,y:1.1,z:-300,mode:'walk',stage:'walk'})).concat([-296,-290,-280,-260].map(z=>({x:122,y:1.1,z,mode:'walk',stage:'walk'})));f.targetX=108;
 moveFly(f,0,10);assert.equal(f.x,122);assert.ok(f.z> -300&&f.z< -280);const travelled=22+(f.z+300);assert.ok(Math.abs(travelled-f.motionSpeed*10)<.01);assert.ok(f.traveling);
});
