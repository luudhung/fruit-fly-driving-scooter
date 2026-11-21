import test from 'node:test';import assert from 'node:assert/strict';
import {createInternationalLife} from '../worker/international-life.mjs';
import {createCityVisitors} from '../worker/city-visitors.mjs';
import {MIN_VISITOR_PASSENGERS,visitorAircraftPose,visitorArrivalPath,visitorArrivalCompleteAt} from '../worker/visitor-aviation.mjs';
import {COUNTRY_IDS,countryAt,NORTH_AIRPORT} from '../worker/country-map.mjs';

function fixture(){let s={simulationAgeSeconds:0,timeScale:120,flies:[],businesses:{},treasury:{cash:10000},centralBank:{priceLevel:1},weather:{condition:'clear',precipitation:0,wind:0},totalTransactions:0};let countries,visitors;const build=()=>{countries=createInternationalLife({world:()=>s,redistribute:false});countries.init();visitors=createCityVisitors({world:()=>s,aviationAdmission:countries.aviationAdmission,interceptMovement:countries.interceptMovement,createVisitor:(_n,i)=>({ageYears:30,brain:{id:`EXTERNAL-${i}`},traits:{thrift:1}})});visitors.init();s.cityVisitors.nextArrivalAt=1e15;};build();return{get s(){return s;},get countries(){return countries;},get visitors(){return visitors;},step(dt=120){s.simulationAgeSeconds+=dt;visitors.tick(dt,{hour:s.simulationAgeSeconds%86400/3600});},restore(){s=structuredClone(s);build();}};}

test('North receives ten actual reserved passengers from a distant aircraft, not city spawning; immigration charges once',()=>{
 const t=fixture();assert.ok(t.visitors.queueAircraft(MIN_VISITOR_PASSENGERS,'north'));const flight=t.s.cityVisitors.airportTraffic.flights[0],ids=flight.arrivalPassengerIds.slice();assert.equal(ids.length,10);assert.ok(t.s.cityVisitors.visitors.every(v=>v.onPlane&&v.citizenshipCountryId==='outside'));assert.ok(visitorAircraftPose(flight.inboundAt,flight).y>200);
 t.s.simulationAgeSeconds=flight.parkedAt;t.step();assert.equal(t.countries.snapshot().visaRevenue,0);assert.equal(t.visitors.snapshot().totalArrivals,0);
 t.s.simulationAgeSeconds=visitorArrivalCompleteAt(flight,10,120);t.step();assert.equal(t.visitors.snapshot().totalArrivals,10);assert.equal(t.countries.snapshot().visaRevenue,500);assert.ok(t.s.cityVisitors.visitors.every(v=>v.x===NORTH_AIRPORT.gate.x&&v.z===NORTH_AIRPORT.gate.z&&v.travelGoals.includes('hansdrex')&&v.travelGoals.includes('north-city')));
 const cash=t.countries.snapshot().visaRevenue,identity=t.s.cityVisitors.visitors.map(v=>[v.id,v.brain.id,v.arrivalFlightId]);t.restore();t.step();assert.equal(t.countries.snapshot().visaRevenue,cash);assert.deepEqual(t.s.cityVisitors.visitors.map(v=>[v.id,v.brain.id,v.arrivalFlightId]),identity);assert.deepEqual(t.s.cityVisitors.visitors.filter(v=>v.arrivalFlightId===flight.id).map(v=>v.id),ids);
 assert.equal(t.s.cityVisitors.airportTraffic.flights.some(f=>f.id===flight.id),false,'completed empty aircraft metadata is released after all ten guests clear immigration');
});

test('a North-arriving outside brain physically visits both countries, pays two entry visas and departs from the country actually reached',()=>{
 const t=fixture(),v=t.visitors.spawnVisitor({airportId:'north',budget:1500,staySeconds:3*86400});assert.ok(v);const identity=[v.id,v.brain.id];let prior={x:v.x,z:v.z},crossings=0,maxGroundStep=0;
 for(let i=0;i<12000&&!v.departed;i++){
  const before=countryAt(v),wasPlane=v.onPlane;t.step();const after=countryAt(v);if(!wasPlane&&!v.onPlane){maxGroundStep=Math.max(maxGroundStep,Math.hypot(v.x-prior.x,v.z-prior.z));if(before!==after)crossings++;}prior={x:v.x,z:v.z};
  if(i===300){const savedBrain=v.brain.id;t.restore();assert.equal(t.s.cityVisitors.visitors.find(p=>p.id===v.id)?.brain.id,savedBrain);break;}
 }
 let restored=t.s.cityVisitors.visitors.find(p=>p.id===identity[0]);for(let i=0;i<16000&&!restored.departed;i++)t.step();
 assert.equal(restored.departed,true);assert.deepEqual([restored.id,restored.brain.id],identity);assert.ok(restored.travelGoalsCompleted.includes(COUNTRY_IDS.north)&&restored.travelGoalsCompleted.includes(COUNTRY_IDS.hansdrex));assert.ok(restored.siteCountryVisits[COUNTRY_IDS.north].locationId);assert.ok(restored.siteCountryVisits[COUNTRY_IDS.hansdrex].locationId);assert.equal(restored.departureAirportId,'city');assert.equal(t.countries.snapshot().visaRevenue,100);assert.equal(t.visitors.snapshot().totalDepartures,1);assert.ok(maxGroundStep<10,'ordinary ground updates never teleport to the other country');
});

test('old arrivals with missing flight metadata cannot block a fresh ten-person flight and are left intact',()=>{
 const t=fixture();for(let i=0;i<3;i++)assert.equal(t.visitors.queueAircraft(10,'city'),true);
 const ghosts=t.s.cityVisitors.visitors.slice(),identity=ghosts.map(v=>[v.id,v.brain.id,v.money,v.savings,v.visitorPhase]);
 t.s.cityVisitors.airportTraffic.flights=[];t.s.simulationAgeSeconds+=86400;t.visitors.init();
 assert.equal(ghosts.filter(v=>v.admissionSlotExemptAt!=null).length,30);assert.deepEqual(ghosts.map(v=>[v.id,v.brain.id,v.money,v.savings,v.visitorPhase]),identity);
 assert.equal(t.visitors.queueAircraft(10,'city'),true);const fresh=t.s.cityVisitors.airportTraffic.flights[0];assert.equal(fresh.arrivalPassengerIds.length,10);assert.ok(fresh.arrivalPassengerIds.every(id=>!ghosts.some(v=>v.id===id)));
 t.s.simulationAgeSeconds=visitorArrivalCompleteAt(fresh,10)+1;t.step();assert.equal(t.visitors.snapshot().totalArrivals,10);assert.equal(t.countries.snapshot().visaRevenue,500);
 assert.deepEqual(ghosts.map(v=>[v.id,v.brain.id,v.money,v.savings,v.visitorPhase]),identity);
});

test('a temporarily interrupted manifest keeps its flight and resumes to exactly ten people without duplicating those already reserved',()=>{
 let s={simulationAgeSeconds:0,timeScale:120,flies:[],businesses:{},treasury:{cash:10000},centralBank:{priceLevel:1},weather:{condition:'clear',precipitation:0,wind:0}};
 let fail=true;
 const visitors=createCityVisitors({world:()=>s,createVisitor:(_n,i)=>{
  const v={ageYears:30,brain:{id:'RESERVED-'+i},traits:{thrift:1}};
  if(fail&&i===4)Object.defineProperty(v,'money',{configurable:true,set(){throw Error('interrupted reservation');}});
  return v;
 }});visitors.init();s.cityVisitors.nextArrivalAt=1e15;
 assert.throws(()=>visitors.queueAircraft(10,'city'),/interrupted reservation/);const flight=s.cityVisitors.airportTraffic.flights[0];assert.ok(flight);assert.equal(flight.arrivalPassengerIds.length,3);
 const ids=flight.arrivalPassengerIds.slice(),people=s.cityVisitors.visitors.map(v=>[v.id,v.brain.id,v.money]);fail=false;s.simulationAgeSeconds+=120;visitors.tick(120,{hour:12});
 assert.equal(flight.arrivalPassengerIds.length,10);assert.deepEqual(flight.arrivalPassengerIds.slice(0,3),ids);assert.deepEqual(s.cityVisitors.visitors.slice(0,3).map(v=>[v.id,v.brain.id,v.money]),people);assert.equal(new Set(flight.arrivalPassengerIds).size,10);
});


test('freeing stale arrival slots queues one real replacement flight promptly, even when the ordinary random demand draw would miss',()=>{
 const t=fixture();for(let i=0;i<3;i++)assert.equal(t.visitors.queueAircraft(10,'city'),true);
 t.s.cityVisitors.airportTraffic.flights=[];t.s.simulationAgeSeconds+=86400;t.visitors.init();assert.equal(t.s.cityVisitors.pendingArrivalDemand,10);
 t.s.cityVisitors.nextArrivalAt=t.s.simulationAgeSeconds;t.step();
 const fresh=t.s.cityVisitors.airportTraffic.flights.find(f=>f.arrivalPassengerIds?.length===10);assert.ok(fresh);assert.equal(fresh.airportId,'city');assert.equal(t.s.cityVisitors.pendingArrivalDemand,0);
 const flightId=fresh.id;t.restore();assert.ok(t.s.cityVisitors.airportTraffic.flights.some(f=>f.id===flightId));assert.equal(t.s.cityVisitors.pendingArrivalDemand,0,'init cannot repeat replacement demand for the same old people');
});
