import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRPORT} from '../worker/city-map.mjs';
import {nextFlight} from '../worker/aviation.mjs';
import {createCityVisitors} from '../worker/city-visitors.mjs';
import {AIRPORT_SECTORS, INBOUND_SECONDS, MIN_VISITOR_PASSENGERS, VISITOR_STANDS, visitorAircraftPose, visitorArrivalPath, visitorArrivalPose, visitorRunwaySlot} from '../worker/visitor-aviation.mjs';

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
 let flight=system.snapshot().airportTraffic.flights[0];
 assert.ok(flight);assert.equal(flight.arrivingGuests,MIN_VISITOR_PASSENGERS);
 assert.equal(flight.arrivalPassengerIds.length,MIN_VISITOR_PASSENGERS);
 assert.equal(system.snapshot().visitors.length,MIN_VISITOR_PASSENGERS);
 assert.ok(system.snapshot().visitors.every(v=>v.onPlane));
 assert.equal(system.snapshot().totalArrivals,0);
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
 assert.equal(system.snapshot().totalArrivals,0);
 assert.ok(system.snapshot().visitors.some(v=>!v.onPlane&&!v.indoors&&v.action.includes('aircraft boarding stairs')));
 const identities=state.cityVisitors.visitors.map(v=>[v.id,v.brain.id]);
 state=JSON.parse(JSON.stringify(state));system=build();system.init();
 flight=state.cityVisitors.airportTraffic.flights.find(item=>item.id===flight.id);
 assert.deepEqual(state.cityVisitors.visitors.map(v=>[v.id,v.brain.id]),identities);
 tick(flight.arrivalCompleteAt+1);
 assert.equal(system.snapshot().totalArrivals,MIN_VISITOR_PASSENGERS);
 assert.ok(events.some(e=>e.type==='visitor_arrival'&&e.flightId===flight.id));
 const v=state.cityVisitors.visitors[0],id=v.id;
 v.departAt=state.simulationAgeSeconds;tick(state.simulationAgeSeconds+120);
 assert.equal(v.visitorPhase,'airport-wait');assert.equal(v.departed,false);
 for(let step=0;step<120&&!state.cityVisitors.airportTraffic.flights.some(f=>f.passengerIds.includes(id));step++)tick(state.simulationAgeSeconds+120);
 flight=state.cityVisitors.airportTraffic.flights.find(f=>f.passengerIds.includes(id));
 assert.ok(flight,'a returning visitor receives a real aircraft seat');
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

test('all ten arrivals use the aircraft stairs, apron and immigration before leaving the airport',()=>{
 const flight={standId:VISITOR_STANDS[0].id,sector:'west',direction:1,inboundAt:0,parkedAt:INBOUND_SECONDS,outboundAt:null,exitAt:null};
 for(let index=0;index<MIN_VISITOR_PASSENGERS;index++){
  const path=visitorArrivalPath(flight,index),stairs=visitorArrivalPose(path[0].at+1,flight,index);
  assert.equal(stairs.phase,'disembarking');assert.equal(stairs.onPlane,false);assert.equal(stairs.indoors,false);
  const apron=visitorArrivalPose(path[2].at+1,flight,index);assert.equal(apron.phase,'apron');assert.equal(apron.y,1.1);
  const immigration=visitorArrivalPose(path[4].at+100,flight,index);assert.equal(immigration.indoors,true);
  const finished=visitorArrivalPose(path.at(-1).at,flight,index);assert.equal(finished.phase,'complete');
  assert.equal(finished.x,AIRPORT.gate.x);assert.equal(finished.z,AIRPORT.gate.z);
 }
 assert.ok(visitorArrivalPath(flight,9)[0].at>visitorArrivalPath(flight,0)[0].at,'passengers leave one after another');
});

test('scheduled legacy small flights gain a full reserved manifest once and preserve it on restore',()=>{
 let state={simulationAgeSeconds:0,timeScale:120,flies:[],businesses:{},treasury:{cash:0},centralBank:{priceLevel:1},weather:{precipitation:0}};
 const build=()=>createCityVisitors({world:()=>state,createVisitor:(_name,index)=>({ageYears:30,brain:{id:`B-${index}`,memory:{episodes:[]}}})});
 let system=build();system.init();state.cityVisitors.nextArrivalAt=1e9;
 state.cityVisitors.airportTraffic.flights.push({id:'LEGACY',standId:VISITOR_STANDS[1].id,sector:'north',direction:1,inboundAt:900,parkedAt:1920,arrivingGuests:2,unloaded:false,passengerIds:[],outboundAt:null,exitAt:null});
 state.simulationAgeSeconds=120;system.tick(120,{hour:0});
 const manifest=state.cityVisitors.airportTraffic.flights[0].arrivalPassengerIds;
 assert.equal(manifest.length,10);assert.equal(state.cityVisitors.visitors.length,10);
 const before=state.cityVisitors.externalInflow,ids=state.cityVisitors.visitors.map(v=>[v.id,v.brain.id,v.money]);
 state=JSON.parse(JSON.stringify(state));system=build();system.init();state.simulationAgeSeconds=240;system.tick(120,{hour:0});
 assert.deepEqual(state.cityVisitors.airportTraffic.flights[0].arrivalPassengerIds,manifest);
 assert.deepEqual(state.cityVisitors.visitors.map(v=>[v.id,v.brain.id,v.money]),ids);
 assert.equal(state.cityVisitors.externalInflow,before);assert.equal(system.snapshot().totalArrivals,0);
});

test('airport postpones a passenger service when fewer than ten real rooms or admission slots remain',()=>{
 const state={simulationAgeSeconds:0,timeScale:120,flies:[],businesses:{},treasury:{cash:0},centralBank:{priceLevel:1},weather:{precipitation:0}};
 const system=createCityVisitors({world:()=>state,createVisitor:(_name,index)=>({ageYears:30,brain:{id:`CAP-${index}`,memory:{episodes:[]}}})});
 system.init();
 for(let i=0;i<31;i++)assert.ok(system.spawnVisitor({budget:1000}));
 Object.assign(state.cityVisitors,{nextArrivalAt:0,rngState:1});state.simulationAgeSeconds=120;system.tick(120,{hour:0});
 assert.equal(system.snapshot().airportTraffic.flights.length,0);
 const guest=state.cityVisitors.visitors[0];system.depart(guest);
 Object.assign(state.cityVisitors,{nextArrivalAt:0,rngState:1});state.simulationAgeSeconds=240;system.tick(120,{hour:0});
 const flight=system.snapshot().airportTraffic.flights[0];assert.equal(flight.arrivingGuests,10);
 assert.equal(state.cityVisitors.visitors.filter(v=>v.alive&&!v.departed).length,40);
 assert.ok(system.snapshot().hotelRooms.every(h=>h.occupied<=h.capacity));
});
