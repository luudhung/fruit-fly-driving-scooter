import test from 'node:test';import assert from 'node:assert/strict';
import {prioritizeGroundDeparture,priorityArrivalConflict} from '../worker/airport-ground-dispatch.mjs';
import {visitorStands,visitorAircraftPose} from '../worker/visitor-aviation.mjs';
const now=100000,stand=visitorStands('city')[0];
const plane=id=>({id,airportId:'city',sector:'west',direction:1,standId:stand.id,arrivalStand:stand,inboundAt:now-30000,parkedAt:now-20000,outboundAt:now+10*86400,exitAt:now+10*86400+1080});

test('a ready loaded ground aircraft is not held for days by unstarted future bookings',()=>{
 const s={simulationAgeSeconds:now},f=plane('READY'),future=Array.from({length:20},(_,i)=>({...plane('FUTURE-'+i),inboundAt:now+300+i*500,parkedAt:now+1320+i*500}));
 const before=visitorAircraftPose(now,f);assert.equal(prioritizeGroundDeparture(s,f,future,now-1000),true);
 assert.ok(f.outboundAt>now&&f.outboundAt<now+10800);assert.deepEqual(visitorAircraftPose(now,f),before);assert.equal(visitorAircraftPose(f.outboundAt+1,f).phase,'taxi-out');
 assert.equal(prioritizeGroundDeparture(s,f,future,now-1000),false,'the issued clearance is durable, not replanned every sample');
});

test('ground priority is budgeted to two clearances per airport/sample and protects an active approach',()=>{
 const s={simulationAgeSeconds:now},active={...plane('ACTIVE'),inboundAt:now-200,parkedAt:now+820,outboundAt:null,exitAt:null},all=Array.from({length:5},(_,i)=>({...plane('GROUND-'+i),arrivalStand:visitorStands('city')[i],standId:visitorStands('city')[i].id}));
 assert.equal(prioritizeGroundDeparture(s,all[0],[active,...all.slice(1)],now-100),true);assert.ok(all[0].outboundAt>=active.parkedAt+120);
 assert.equal(prioritizeGroundDeparture(s,all[1],[active,all[0],...all.slice(2)],now-100),true);assert.notEqual(all[0].outboundAt,all[1].outboundAt);
 assert.equal(prioritizeGroundDeparture(s,all[2],[active,...all.filter(f=>f!==all[2])],now-100),false);
 s.simulationAgeSeconds+=120;assert.equal(prioritizeGroundDeparture(s,all[2],[active,...all.filter(f=>f!==all[2])],now-100),true);
});

test('a future approach rechecks a newly protected departure before touchdown, while a landed plane keeps taxiing',()=>{
 const s={simulationAgeSeconds:now},ground=plane('GROUND');assert.ok(prioritizeGroundDeparture(s,ground,[],now-100));
 const arrival={...plane('ARRIVAL'),inboundAt:ground.outboundAt+300,parkedAt:ground.outboundAt+1320,outboundAt:null,exitAt:null};
 assert.equal(priorityArrivalConflict(arrival,[ground],arrival.inboundAt),true);
 arrival.touchdownAt=arrival.inboundAt+520;assert.equal(priorityArrivalConflict(arrival,[ground],arrival.touchdownAt),false);
});

test('ground priority preserves an ordinary accepted future departure, including slots beyond one hour',()=>{
 for(const gap of [2260,10000]){
  const s={simulationAgeSeconds:now},a=plane('PRIORITY'),b={...plane('ORDINARY'),outboundAt:now+gap,exitAt:now+gap+1080};
  assert.ok(prioritizeGroundDeparture(s,a,[b],now-1000));
  const first=[a.outboundAt,a.exitAt],second=[b.outboundAt,b.exitAt];
  assert.ok(first[1]+120<=second[0]||second[1]+120<=first[0],'accepted ordinary and priority runway windows remain disjoint');
 }
});

test('an empty aircraft requests priority by two game-hours after touchdown despite a distant booked departure',async()=>{
 const {emptyAircraftDeadline}=await import('../worker/airport-ground-dispatch.mjs');
 const f=plane('EMPTY-DEADLINE');f.touchdownAt=now-7200;f.parkedAt=now-600;
 assert.equal(emptyAircraftDeadline(f),now);const s={simulationAgeSeconds:now};assert.ok(prioritizeGroundDeparture(s,f,[],emptyAircraftDeadline(f)));assert.ok(f.outboundAt<=now+3600);
});
