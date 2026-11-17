import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,restoreState,urbanWorld,tickFly,gameClock,setNeuralSyncEnabled} from '../worker/civilization-engine.mjs';
import {BUILDINGS,LOCATIONS,entrance} from '../worker/city-map.mjs';
setNeuralSyncEnabled(false);

test('an off-shift stale work label cannot block a paid recovery contract and real resident ticks preserve its journey across restore',()=>{
 let state=freshState();state.simulationAgeSeconds=12*3600;state.weather={condition:'rain',precipitation:.5,cloudCover:.6,wind:.1};
 state.urbanWorld.lastTickAt=state.simulationAgeSeconds;
 state.urbanWorld.nextFireAt=state.urbanWorld.nextGrowthAt=state.urbanWorld.development.nextReviewAt=1e12;
 const candidate=state.flies.find(f=>f.alive&&f.ageYears>=25&&f.ageYears<60&&!f.publicServiceRole&&!f.businessId&&!f.businessEmployeeOf&&!f.facilityEmployment&&f.citizenshipCountryId==='hansdrex');assert.ok(candidate);
 for(const f of state.flies)f.sleeping=true;
 const building=BUILDINGS.find(b=>b.kind==='block'&&Math.abs(b.x)<200&&Math.abs(b.z)<200&&!state.urbanWorld.buildings[b.id]);assert.ok(building);
 const point=entrance(building),id=candidate.id,brain=candidate.brain.id;
 Object.assign(candidate,{x:point.x,z:point.z+6,y:1.1,health:100,energy:90,hunger:10,thirst:10,stress:5,illness:null,sleeping:false,recoveringEnergy:false,traveling:false,indoors:false,jobId:'construction',jobTitle:'builder',preferredWorkStart:22,preferredWorkHours:1,action:'working as a builder',pendingAction:null,actionUntil:0,currentLocationId:'park',publicServiceDuty:null,urbanTask:null,civicDuty:null,socialTask:null,cityService:null,nationalServiceDuty:null,nationalSupplyTask:null,internationalWork:null,countryAirTrip:null,countryFlightPlan:null,warResponse:null,fireEngineDuty:null,ambulanceDuty:null,industrialFreightDuty:null,onTrain:false,onPlane:false,onPrivateHelicopter:false,privateFlight:null,heliPassenger:false,arrested:false,arrestedUntil:0});
 state.urbanWorld.buildings[building.id]={...building,health:60,stage:'damaged',progress:1};state.treasury.cash=50000;
 const project=urbanWorld.submitProject(building.id);assert.ok(project);
 state.simulationAgeSeconds+=600;urbanWorld.tick(600,gameClock());assert.ok(project.workerIds.includes(id),'stale off-shift working text must not reserve this builder');
 const target=`CIVIC-SITE-${project.id}`;assert.equal(candidate.targetLocationId,target);assert.ok(LOCATIONS.some(l=>l.id===target));
 for(let i=0;i<4;i++){state.simulationAgeSeconds+=120;urbanWorld.tick(120,gameClock());tickFly(candidate,gameClock());assert.equal(candidate.urbanTask?.id,project.id);assert.notEqual(candidate.pendingAction,'sheltering from bad weather');}
 state=restoreState(structuredClone(state));const restored=state.flies.find(f=>f.id===id);assert.equal(restored.brain.id,brain);
 const duty=restored.urbanTask;assert.equal(duty.id,project.id);
 for(let i=0;i<4;i++){state.simulationAgeSeconds+=120;urbanWorld.tick(120,gameClock());tickFly(restored,gameClock());assert.equal(restored.urbanTask?.id,project.id);assert.ok([target,'construction'].includes(restored.targetLocationId));}
 assert.equal(restored.brain.id,brain);assert.ok(restored.health>0);assert.ok(Number.isFinite(restored.money));
});
