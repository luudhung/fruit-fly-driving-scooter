import test from 'node:test';import assert from 'node:assert/strict';
import {createInternationalLife} from '../worker/international-life.mjs';
import {createCityVisitors} from '../worker/city-visitors.mjs';
import {MIN_VISITOR_PASSENGERS,visitorAircraftPose,visitorArrivalPath} from '../worker/visitor-aviation.mjs';
import {COUNTRY_IDS,countryAt,NORTH_AIRPORT} from '../worker/country-map.mjs';

function fixture(){let s={simulationAgeSeconds:0,timeScale:120,flies:[],businesses:{},treasury:{cash:10000},centralBank:{priceLevel:1},weather:{condition:'clear',precipitation:0,wind:0},totalTransactions:0};let countries,visitors;const build=()=>{countries=createInternationalLife({world:()=>s,redistribute:false});countries.init();visitors=createCityVisitors({world:()=>s,aviationAdmission:countries.aviationAdmission,interceptMovement:countries.interceptMovement,createVisitor:(_n,i)=>({ageYears:30,brain:{id:`EXTERNAL-${i}`},traits:{thrift:1}})});visitors.init();s.cityVisitors.nextArrivalAt=1e15;};build();return{get s(){return s;},get countries(){return countries;},get visitors(){return visitors;},step(dt=120){s.simulationAgeSeconds+=dt;visitors.tick(dt,{hour:s.simulationAgeSeconds%86400/3600});},restore(){s=structuredClone(s);build();}};}

test('North receives ten actual reserved passengers from a distant aircraft, not city spawning; immigration charges once',()=>{
 const t=fixture();assert.ok(t.visitors.queueAircraft(MIN_VISITOR_PASSENGERS,'north'));const flight=t.s.cityVisitors.airportTraffic.flights[0],ids=flight.arrivalPassengerIds.slice();assert.equal(ids.length,10);assert.ok(t.s.cityVisitors.visitors.every(v=>v.onPlane&&v.citizenshipCountryId==='outside'));assert.ok(visitorAircraftPose(flight.inboundAt,flight).y>200);
 t.s.simulationAgeSeconds=flight.parkedAt;t.step();assert.equal(t.countries.snapshot().visaRevenue,0);assert.equal(t.visitors.snapshot().totalArrivals,0);
 t.s.simulationAgeSeconds=visitorArrivalPath(flight,9,120).at(-1).at;t.step();assert.equal(t.visitors.snapshot().totalArrivals,10);assert.equal(t.countries.snapshot().visaRevenue,500);assert.ok(t.s.cityVisitors.visitors.every(v=>v.x===NORTH_AIRPORT.gate.x&&v.z===NORTH_AIRPORT.gate.z&&v.travelGoals.includes('hansdrex')&&v.travelGoals.includes('north-city')));
 const cash=t.countries.snapshot().visaRevenue;t.restore();t.step();assert.equal(t.countries.snapshot().visaRevenue,cash);assert.deepEqual(t.s.cityVisitors.airportTraffic.flights[0].arrivalPassengerIds,ids);
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
