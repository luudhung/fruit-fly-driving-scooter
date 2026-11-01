import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,tick,restoreState,getRawState,getState,civicConflict,startJourney,setNeuralSyncEnabled,gameClock} from '../worker/civilization-engine.mjs';
import {LOCATIONS,entrance} from '../worker/city-map.mjs';
test('a chosen civic outing adopts an exclusive duty, follows a real route and resumes after restore',async()=>{
 setNeuralSyncEnabled(false);const s=freshState();s.simulationAgeSeconds=12*3600;
 s.civicConflict.nextCheckAt=1e12;const park=LOCATIONS.find(l=>l.id==='park'),entry=entrance(park),leader=s.flies[0],member=s.flies[1];
 for(const f of [leader,member])Object.assign(f,{alive:true,ageYears:30,health:95,energy:95,hunger:10,thirst:10,stress:60,sleeping:false,traveling:false,indoors:false,jobId:null,businessEmployeeOf:null,airTrip:null,urbanTask:null,cityService:null,privateFlight:null,sportsSession:null,arrestedUntil:0,displacedFrom:null,x:entry.x,z:entry.z,y:1.1});
 const incident=civicConflict.startAssembly(leader,{locationId:'park'});assert.ok(incident);assert.ok(leader.civicDuty);
 Object.assign(member,{x:entry.x-18,z:entry.z,currentLocationId:'cafe'});startJourney(member,{id:'park',action:'joining a civic assembly'});
 const before={x:member.x,z:member.z};assert.ok(member.traveling);assert.equal(civicConflict.handleResident(member,gameClock()),true);assert.equal(member.civicDuty.incidentId,incident.id);assert.ok(Math.hypot(member.x-before.x,member.z-before.z)<20,'no teleport to assembly');
 const age=member.ageYears;restoreState(JSON.parse(JSON.stringify(getRawState())));const restored=getRawState().flies.find(f=>f.id===member.id);assert.equal(restored.civicDuty.incidentId,incident.id);
 await tick({gameSeconds:120,syncBrain:false,serialized:true});assert.ok(restored.ageYears>age,'exclusive activity still advances life');assert.ok(getState({observer:true}).civicConflict.active.some(i=>i.id===incident.id));
 const active=getRawState().civicConflict.active.find(i=>i.id===incident.id);civicConflict.resolve(active);assert.equal(restored.civicDuty,null);assert.equal(civicConflict.resolve(active),false);
});
