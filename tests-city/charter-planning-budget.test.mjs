import test from 'node:test';
import assert from 'node:assert/strict';
import {createF1Charters} from '../worker/north-f1-charters.mjs';
import {visitorAircraftPose} from '../worker/visitor-aviation.mjs';
const DAY=86400;
function fixture(football=true){
 let s={simulationAgeSeconds:0,timeScale:120,flies:[],businesses:{},weather:{condition:'clear'},northF1:{previousTours:[]},worldCup:{previousTours:[]}};
 const event={id:football?'FOOTBALL-BUDGET':'F1-BUDGET',format:2,startsAt:3*DAY,endsAt:3*DAY+5400,charters:[],tourPaths:{}};
 s[football?'worldCup':'northF1'].event=event;
 const build=()=>createF1Charters({world:()=>s,eventKey:football?'worldCup':'northF1',foreignDemand:football?350:null,teamPlayers:football?30:0,signature:()=>.5,weatherClosed:()=>false,account:()=>({cash:0})});
 let tours=build();return{get s(){return s;},get event(){return s[football?'worldCup':'northF1'].event;},get tours(){return tours;},restore(){s=structuredClone(s);tours=build();},step(){s.simulationAgeSeconds+=120;tours.tick(this.event);}};
}
const assigned=e=>e.charters.filter(f=>Number.isFinite(f.inboundAt));
const identities=e=>e.charters.flatMap(f=>f.guests.map(g=>[g.id,g.money,g.savings,g.phase]));

test('a 380-person football cohort keeps all identities while only two new aircraft per airport receive clearances each sample',()=>{
 const t=fixture();t.tours.make(t.event);assert.equal(t.event.charters.length,38);assert.equal(assigned(t.event).length,2);
 const people=identities(t.event);assert.equal(people.length,380);assert.equal(new Set(people.map(p=>p[0])).size,380);
 const accepted=assigned(t.event).map(f=>({id:f.id,inboundAt:f.inboundAt,parkedAt:f.parkedAt,outboundAt:f.outboundAt,standId:f.standId}));
 const waiting=t.event.charters.filter(f=>!Number.isFinite(f.inboundAt));assert.ok(waiting.every(f=>visitorAircraftPose(t.s.simulationAgeSeconds,f)===null),'unassigned manifests cannot invent a parked or flying plane');
 t.tours.tick(t.event);t.tours.make(t.event);assert.equal(assigned(t.event).length,2,'revisiting the same sample cannot bypass the CPU budget');assert.deepEqual(identities(t.event),people);
 for(let count=2;count<38;){
  const before=assigned(t.event).length;t.step();const after=assigned(t.event).length;assert.ok(after-before<=2);assert.ok(after>before);count=after;
  if(count===10)t.restore();
 }
 assert.ok(t.s.simulationAgeSeconds<t.event.startsAt-2*DAY,'all clearances are assigned during the multi-day arrival lead');
 assert.deepEqual(identities(t.event),people,'waiting does not recreate visitors, collect fares, or change wallets');
 for(const flight of accepted){const saved=t.event.charters.find(f=>f.id===flight.id);for(const key of Object.keys(flight))assert.equal(saved[key],flight[key]);}
});

test('city and north arrivals share bounded planning across their own airport queues',()=>{
 const t=fixture(false);t.tours.make(t.event);
 const counts=()=>Object.fromEntries(['city','north'].map(id=>[id,assigned(t.event).filter(f=>f.airportId===id).length]));
 assert.deepEqual(counts(),{city:2,north:2});const people=identities(t.event);t.tours.tick(t.event);assert.deepEqual(counts(),{city:2,north:2});
 t.step();assert.deepEqual(counts(),{city:4,north:4});assert.deepEqual(identities(t.event),people);
});
