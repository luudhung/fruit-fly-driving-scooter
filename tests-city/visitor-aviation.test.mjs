import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRPORT} from '../worker/city-map.mjs';
import {nextFlight} from '../worker/aviation.mjs';
import {createCityVisitors} from '../worker/city-visitors.mjs';
import {AIRPORT_SECTORS, INBOUND_SECONDS, VISITOR_STANDS, visitorAircraftPose, visitorRunwaySlot} from '../worker/visitor-aviation.mjs';

test('regional aircraft approach from different sectors, use the runway, and occupy separate apron stands',()=>{
 const starts=[];
 for(const [index,sector] of AIRPORT_SECTORS.entries()){
  const stand=VISITOR_STANDS[index],flight={standId:stand.id,sector,direction:sector==='east'?-1:1,inboundAt:0,parkedAt:INBOUND_SECONDS,outboundAt:9000,exitAt:10080};
  const start=visitorAircraftPose(0,flight);starts.push([start.x,start.z]);assert.ok(start.y>200);
  const touchdown=visitorAircraftPose(520,flight);
  assert.equal(touchdown.z,AIRPORT.runway.z);assert.equal(touchdown.y,3);assert.ok(Math.abs(touchdown.x-AIRPORT.runway.x)<AIRPORT.runway.w/2);
  const parked=visitorAircraftPose(INBOUND_SECONDS,flight);
  assert.equal(parked.phase,'parked');assert.equal(parked.x,stand.x);assert.equal(parked.z,stand.z);
  assert.equal(visitorAircraftPose(9600,flight).phase,'takeoff');assert.equal(visitorAircraftPose(10080,flight),null);
 }
 assert.equal(new Set(starts.map(p=>p.join(','))).size,3);
 assert.equal(new Set(VISITOR_STANDS.map(p=>p.x)).size,VISITOR_STANDS.length);
});

test('the runway scheduler leaves island flights and other aircraft exclusive clearance',()=>{
 const island=nextFlight(8*3600,'island',0);
 const start=visitorRunwaySlot(island.departure-30,INBOUND_SECONDS,[]);
 assert.ok(start>=island.arrival+120);
 const first={inboundAt:start,parkedAt:start+INBOUND_SECONDS,outboundAt:null,exitAt:null};
 const next=visitorRunwaySlot(start+90,INBOUND_SECONDS,[first]);
 assert.ok(next>=first.parkedAt+120);
});

test('guests clear immigration after parking and return on a plane through checkpoint restore',()=>{
 let state={simulationAgeSeconds:0,timeScale:120,flies:[],businesses:{},treasury:{cash:0},centralBank:{priceLevel:1},weather:{precipitation:0}};
 const events=[];
 const build=()=>createCityVisitors({
  world:()=>state,
  createVisitor:(_name,index)=>({id:'seed',ageYears:30,generation:1,sex:'F',brain:{id:`BRAIN-${index}`,memory:{episodes:[]}}}),
  emit:(type,_text,payload)=>events.push({type,...payload}),
 });
 let system=build();system.init();state.cityVisitors.rngState=1;
 state.cityVisitors.nextArrivalAt=0;
 const tick=age=>{const dt=age-state.simulationAgeSeconds;state.simulationAgeSeconds=age;system.tick(dt,{hour:Math.floor(age/3600)%24});};
 tick(120);
 const flight=system.snapshot().airportTraffic.flights[0];
 assert.ok(flight);assert.equal(system.snapshot().visitors.length,0);
 state.cityVisitors.nextArrivalAt=1e9;
 const oldArrival=flight.parkedAt;
 state.weather.condition='thunderstorm';
 tick(flight.inboundAt+340);
 assert.ok(flight.parkedAt>oldArrival);
 assert.equal(visitorAircraftPose(state.simulationAgeSeconds,flight).phase,'holding');
 assert.equal(system.snapshot().totalArrivals,0);
 state.weather.condition='clear';
 tick(flight.parkedAt);assert.equal(system.snapshot().totalArrivals,0);
 tick(flight.parkedAt+420);
 assert.ok(system.snapshot().totalArrivals>0);assert.ok(events.some(e=>e.type==='visitor_arrival'&&e.flightId===flight.id));
 const v=state.cityVisitors.visitors[0],id=v.id;
 v.departAt=state.simulationAgeSeconds;tick(flight.parkedAt+900);
 assert.equal(v.visitorPhase,'airport-wait');assert.equal(v.departed,false);
 assert.ok(flight.outboundAt>state.simulationAgeSeconds);
 tick(flight.boardAt);assert.equal(v.onPlane,true);assert.equal(v.departed,false);
 const oldDeparture=flight.outboundAt;
 state.weather.condition='thunderstorm';tick(oldDeparture);
 assert.ok(flight.outboundAt>oldDeparture);
 assert.equal(v.onPlane,true);assert.equal(v.y,3);
 state.weather.condition='clear';
 state=JSON.parse(JSON.stringify(state));system=build();system.init();
 const restored=state.cityVisitors.visitors.find(v=>v.id===id);
 tick(flight.outboundAt+700);assert.equal(restored.onPlane,true);assert.ok(restored.y>10);
 tick(flight.exitAt);assert.equal(restored.departed,true);assert.equal(system.snapshot().totalDepartures,1);
 tick(flight.exitAt+120);assert.equal(system.snapshot().totalDepartures,1);
});
