import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRPORT} from '../worker/city-map.mjs';
import {visitorStands,visitorAircraftPose,resolveVisitorTaxiStand} from '../worker/visitor-aviation.mjs';
const stands=visitorStands('city');
const incoming=id=>({id,airportId:'city',standId:stands[0].id,arrivalStand:stands[0],runwayId:AIRPORT.runways[0].id,sector:'west',direction:1,inboundAt:0,parkedAt:1020,outboundAt:null,exitAt:null});
const occupied=()=>stands.map((s,i)=>({id:'PARKED-'+i,airportId:'city',standId:s.id,arrivalStand:s,inboundAt:-1020,parkedAt:0,landed:true,outboundAt:null,exitAt:null}));

test('a full apron makes a landed aircraft keep taxiing off the runway before holding, then use the next genuinely free stand',()=>{
 const flight=incoming('CLEAR-RUNWAY'),all=occupied();assert.equal(resolveVisitorTaxiStand(flight,all,700),true);
 const start=visitorAircraftPose(700,flight),holdAt=flight.taxiHold.at;assert.ok(holdAt>700);assert.equal(start.phase,'taxi-in');
 const end=visitorAircraftPose(holdAt+1,flight);assert.equal(end.phase,'taxi-hold');assert.equal(end.z,AIRPORT.taxiwayZ);assert.ok(Math.hypot(end.x-start.x,end.z-start.z)>30);
 assert.ok(AIRPORT.runways.every(r=>Math.abs(end.x-r.x)>r.w/2||Math.abs(end.z-r.z)>r.d/2+9));
 // A freed bay must not make a taxiing aircraft jump directly to its future hold pose.
 all[1].aircraftGone=true;const mid=(700+holdAt)/2,before=visitorAircraftPose(mid,flight);
 resolveVisitorTaxiStand(flight,all,mid);assert.deepEqual(visitorAircraftPose(mid,flight),before);
 const persisted=structuredClone(flight);assert.deepEqual(visitorAircraftPose(holdAt+1,persisted),end);
 assert.equal(resolveVisitorTaxiStand(persisted,all,holdAt+1),true);assert.equal(persisted.standId,stands[1].id);assert.equal(persisted.taxiHold,undefined);
 assert.equal(visitorAircraftPose(persisted.parkedAt,persisted).phase,'parked');assert.equal(flight.inboundAt,0);
});

test('a saved old hold on the landing strip resumes physically instead of staying frozen or returning to the sky',()=>{
 const flight=incoming('OLD-HOLD'),all=occupied(),pose=visitorAircraftPose(690,flight);
 flight.taxiHold={at:690,pose};flight.parkedAt=100000;
 resolveVisitorTaxiStand(flight,all,900);assert.equal(flight.taxiHold.runwayCleared,true);
 assert.deepEqual(visitorAircraftPose(900,flight),{...pose,heading:visitorAircraftPose(900,flight).heading,phase:'taxi-in'});
 assert.equal(visitorAircraftPose(flight.taxiHold.at+1,flight).z,AIRPORT.taxiwayZ);assert.equal(flight.hold,undefined);
});
