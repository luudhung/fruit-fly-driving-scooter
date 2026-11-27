import test from 'node:test';import assert from 'node:assert/strict';
import {nextRegionalFlight,flightPose,regionalRunwayWindow,scheduledAircraftFlights} from '../worker/aviation.mjs';
import {regionalEmptyRotation,regionalAircraftVisibleUntil} from '../worker/regional-empty-rotation.mjs';
import {visitorRunwaySlot} from '../worker/visitor-aviation.mjs';
test('regional equipment actually taxis, takes off within two game hours and flies beyond the map after unloading, retaining the paid timetable',()=>{
 for(const [from,to]of [['city','island'],['island','city'],['city','north'],['north','city']]){
  let f=nextRegionalFlight(0,from,to,0);
  for(let i=0;i<24;i++,f=nextRegionalFlight(f.departure+1,from,to,0)){
   const before=structuredClone(f),r=regionalEmptyRotation(f),at=flightPose(f.arrival,f),start=flightPose(r.departure,f);
   assert.deepEqual(f,before);assert.ok(r.end-f.arrival<=7200,`${from}→${to} equipment occupied ground ${(r.end-f.arrival)/3600}h`);
   assert.equal(at.phase,'parked');assert.equal(start.phase,'ferry-taxi');assert.ok(Math.hypot(at.x-start.x,at.y-start.y,at.z-start.z)<1e-6);
   const air=flightPose(r.end+1,f),end=flightPose(r.exitAt,f);assert.equal(air.phase,'ferry-flight');assert.ok(air.y>=4);assert.equal(end.phase,'ferry-departed');assert.ok(Math.abs(end.x)>1150||Math.abs(end.z)>1150);
   assert.equal(regionalAircraftVisibleUntil(f),r.exitAt);
  }
 }
});
test('published and empty runway movements have separate clearances visible to international dispatch',()=>{
 const all=[];for(const [from,to]of [['city','island'],['island','city'],['city','north'],['north','city']]){
  let f=nextRegionalFlight(0,from,to,0);for(let i=0;i<30;i++,f=nextRegionalFlight(f.departure+1,from,to,0))all.push(f);
 }
 const empty=all.map(f=>regionalEmptyRotation(f));
 for(const r of empty){
  assert.ok(visitorRunwaySlot(r.start,120,[],r.airportId,r.runwayId)>r.start,'visitors must respect the ferry runway slot');
  for(const other of empty)if(other!==r&&other.airportId===r.airportId&&other.runwayId===r.runwayId)assert.ok(r.end+119.9<=other.start||other.end+119.9<=r.start,'empty equipment must not share the runway');
 }
 const f=nextRegionalFlight(0,'city','island',0),r=regionalEmptyRotation(f);assert.ok(scheduledAircraftFlights(r.departure+600).some(p=>p.id===f.id),'the actual aircraft remains published while it taxis out');
});
