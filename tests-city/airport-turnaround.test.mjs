import test from 'node:test';
import assert from 'node:assert/strict';
import {createCityVisitors} from '../worker/city-visitors.mjs';
import {AIRPORT} from '../worker/city-map.mjs';
import {visitorAircraftPose,visitorStairsClearAt,visitorStandReleaseAt,visitorDepartureCompleteAt} from '../worker/visitor-aviation.mjs';

function fixture(){
 let state={simulationAgeSeconds:0,timeScale:120,flies:[],businesses:{},treasury:{cash:2000},centralBank:{priceLevel:1},weather:{condition:'clear',precipitation:0,wind:0},totalTransactions:0};let system;
 const rebuild=()=>{system=createCityVisitors({world:()=>state,createVisitor:(_name,index)=>({brain:{id:'TURNAROUND-BRAIN-'+index},ageYears:30,traits:{thrift:.8}})});system.init();state.cityVisitors.nextArrivalAt=Infinity;state.cityVisitors.club.nextAt=Infinity;};rebuild();
 return {get state(){return state;},get system(){return system;},tick(at){const dt=at-state.simulationAgeSeconds;assert.ok(dt>=0);state.simulationAgeSeconds=at;system.tick(dt,{hour:Math.floor(at/3600)%24});},restore(){state=structuredClone(state);rebuild();}};
}

test('empty rotating aircraft across all four terminals leave after stairs clear without waiting for a ten-seat boarding manifest',()=>{
 const t=fixture();for(let i=0;i<4;i++)assert.equal(t.system.queueAircraft(10,'city'),true);
 const flights=t.state.cityVisitors.airportTraffic.flights;
 assert.deepEqual(new Set(flights.map(f=>f.terminalId)),new Set(['T1','T2','T3','T4']));
 for(const f of flights){
  assert.equal(f.passengerIds.length,0);assert.equal(f.arrivalPassengerIds.length,10);
  assert.ok(f.outboundAt>=visitorStairsClearAt(f,10),'the aircraft cannot move while its arriving people use the stairs');
  assert.ok(f.outboundAt-f.parkedAt<3600,'empty aircraft must not budget hours of nonexistent check-in walks');
  assert.ok(visitorAircraftPose(f.outboundAt+120,f).phase==='taxi-out');
  assert.equal(visitorAircraftPose(f.exitAt,f),null);assert.ok(visitorStandReleaseAt(f)<f.exitAt);
 }
 const ids=t.state.cityVisitors.visitors.map(p=>[p.id,p.brain.id,p.money,p.savings]);
 t.restore();assert.deepEqual(t.state.cityVisitors.visitors.map(p=>[p.id,p.brain.id,p.money,p.savings]),ids);
 for(const f of t.state.cityVisitors.airportTraffic.flights)assert.ok(f.outboundAt-f.parkedAt<3600);
});

test('a saved empty plane with an obsolete day-long timer obtains a real near-term departure without jumping off its stand',()=>{
 const t=fixture();assert.equal(t.system.queueAircraft(0,'city'),true);let f=t.state.cityVisitors.airportTraffic.flights[0];
 f.outboundAt=f.parkedAt+86400;f.exitAt=f.outboundAt+4000;f.expectedStandReleaseAt=f.standReleasedAt=f.outboundAt+1000;delete f.turnaroundVersion;
 const at=f.parkedAt+600;t.state.simulationAgeSeconds=at;t.restore();f=t.state.cityVisitors.airportTraffic.flights[0];
 const before=visitorAircraftPose(at,f);t.tick(at);const after=visitorAircraftPose(at,f);
 assert.deepEqual(after,before);assert.equal(after.phase,'parked');assert.ok(f.outboundAt>at&&f.outboundAt-at<3600);
 assert.equal(f.turnaroundVersion,1);assert.ok(f.expectedStandReleaseAt<f.parkedAt+7200);
 const booked=f.outboundAt;t.tick(booked+120);assert.equal(visitorAircraftPose(t.state.simulationAgeSeconds,f).phase,'taxi-out');
 t.tick(f.exitAt);assert.equal(t.state.cityVisitors.airportTraffic.departed,1);assert.equal(t.state.cityVisitors.airportTraffic.flights.length,0);
});

test('a single returning guest extends only its actual boarding walk and the plane still departs with nine unsold seats',()=>{
 const t=fixture(),guest=t.system.spawnVisitor({budget:2000,staySeconds:999999});
 Object.assign(guest,{visitorPhase:'airport-wait',currentLocationId:'airport',targetLocationId:'airport',x:AIRPORT.gate.x,y:1.1,z:AIRPORT.gate.z,traveling:false,indoors:false,airportQueuedAt:0,departAt:0});
 assert.equal(t.system.queueAircraft(0,'city'),true);let f=t.state.cityVisitors.airportTraffic.flights[0];
 t.tick(f.parkedAt+1);assert.deepEqual(f.passengerIds,[guest.id]);assert.equal(guest.airportFlightId,f.id);
 assert.ok(f.outboundAt>=visitorDepartureCompleteAt(f,1));
 assert.ok(f.boardAt<visitorDepartureCompleteAt(f,10),'unbooked seats add no stagger/check-in wait');
 const boardingStartedAt=f.boardingStartedAt,outboundAt=f.outboundAt,guestIdentity=[guest.id,guest.brain.id,guest.money,guest.savings];
 t.restore();f=t.state.cityVisitors.airportTraffic.flights[0];const restored=t.state.cityVisitors.visitors.find(p=>p.id===guest.id);
 assert.deepEqual([restored.id,restored.brain.id,restored.money,restored.savings],guestIdentity);
 assert.equal(f.boardingStartedAt,boardingStartedAt);assert.equal(f.outboundAt,outboundAt);
 t.tick(f.boardAt+1);assert.equal(restored.onPlane,true);t.tick(f.exitAt+1);assert.equal(restored.departed,true);assert.equal(t.state.cityVisitors.totalDepartures,1);
});
