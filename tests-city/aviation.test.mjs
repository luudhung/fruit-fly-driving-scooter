import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,restoreState,bookIslandHoliday,simulateIslandHoliday,simulateHeliTour,liquidMoneySupply,startJourney,moveFly,gameClock} from '../worker/civilization-engine.mjs';
import {AIRPORT,ISLAND,LOCATIONS,entrance,pedestrianRoute,clearSegment,blocked,BUILDINGS,atSea} from '../worker/city-map.mjs';
import {createTourismSystem} from '../worker/tourism.mjs';
import {nextFlight,flightPose,AVIATION} from '../worker/aviation.mjs';
function setup(){const s=freshState();s.weather={condition:'clear',precipitation:0,wind:0,lightning:0};s.simulationAgeSeconds=7*3600;return s;}
function guest(s,i=0){const f=s.flies[i];Object.assign(f,{money:500,savings:2000,ageYears:30,health:90,energy:90,traveling:false,indoors:true,currentLocationId:'airport',x:AIRPORT.terminal.x,z:AIRPORT.terminal.z,action:'taking a holiday on Hansdrex Island'});return f;}
test('expansion creates 500 residents and migrates a 100-person save once without changing old brains or assets',()=>{
 const s=setup();assert.equal(s.flies.filter(f=>f.alive).length,500);
 s.flies=s.flies.slice(0,100);delete s.airportExpansionVersion;s.mapVersion=13;
 const before=s.flies.map(f=>[f.id,f.brain.id,f.money,f.savings]);
 restoreState(s);assert.equal(s.flies.filter(f=>f.alive).length,500);
 assert.deepEqual(s.flies.slice(0,100).map(f=>[f.id,f.brain.id,f.money,f.savings]),before);
 assert.equal(new Set(s.flies.map(f=>f.brain.id)).size,s.flies.length);
 restoreState(s);assert.equal(s.flies.filter(f=>f.alive).length,500);
});
test('airport is reachable; sea blocks walking; island has safe local paths',()=>{
 const home=entrance(BUILDINGS.find(b=>b.kind==='apartment'));
 for(const id of ['airport','heliport']){
  const dest=LOCATIONS.find(l=>l.id===id),route=pedestrianRoute(home,dest);assert.ok(route.length,`no airport route ${id}`);
  for(let i=1;i<route.length;i++)assert.ok(clearSegment(route[i-1],route[i]));
 }
 assert.equal(pedestrianRoute(AIRPORT.gate,ISLAND.gate).length,0);assert.equal(blocked({x:0,z:550}),true);
 for(const a of ['island-airport','island-resort','island-beach'])for(const b of ['island-airport','island-resort','island-beach']){
  const route=pedestrianRoute(LOCATIONS.find(l=>l.id===a),LOCATIONS.find(l=>l.id===b));assert.ok(route.length,`${a} -> ${b}`);
  for(let i=1;i<route.length;i++)assert.ok(clearSegment(route[i-1],route[i]));
 }
});
test('booking reserves both flight legs and full board, transfers exact funds into escrow and rejects poverty',()=>{
 const s=setup(),f=guest(s),before=liquidMoneySupply();
 assert.equal(bookIslandHoliday(f),true);assert.equal(f.airTrip.cost,134);assert.equal(f.money,366);assert.equal(s.businesses['travel-escrow'].cash,134);
 assert.equal(bookIslandHoliday(f),false);assert.ok(Math.abs(liquidMoneySupply()-before)<1e-6);
 const poor=guest(s,1);poor.money=100;poor.savings=0;assert.equal(bookIslandHoliday(poor),false);assert.equal(poor.money,100);
 assert.equal(f.airTrip.inbound.from,'island');assert.ok(f.airTrip.inbound.departure>f.airTrip.outbound.arrival);
});
test('15-seat inventory prevents overselling the outbound and reserved return flight',()=>{
 const s=setup();for(let i=0;i<15;i++)assert.equal(bookIslandHoliday(guest(s,i)),true);
 const sixteenth=guest(s,15);assert.equal(bookIslandHoliday(sixteenth),false);assert.equal(sixteenth.money,500);
});
test('weather cancellation refunds escrow in full and never sells an uncovered return',()=>{
 const s=setup(),f=guest(s);bookIslandHoliday(f);const departure=f.airTrip.outbound.departure,total=liquidMoneySupply();
 s.weather={condition:'thunderstorm',precipitation:1,wind:1,lightning:1};s.simulationAgeSeconds=departure;
 simulateIslandHoliday(f,gameClock());assert.equal(f.airTrip,null);assert.equal(f.money,500);assert.equal(f.savings,2000);assert.equal(s.businesses['travel-escrow'].cash,0);assert.ok(Math.abs(liquidMoneySupply()-total)<1e-6);
});
test('a paid holiday physically flies over sea, visits the resort and beach, survives save/restore and returns',()=>{
 let s=setup();let f=guest(s);bookIslandHoliday(f);const before=liquidMoneySupply(),out=f.airTrip.outbound;
 s.simulationAgeSeconds=out.departure+600;simulateIslandHoliday(f,gameClock());assert.equal(f.onPlane,true);assert.ok(f.y>100);assert.equal(s.businesses['travel-escrow'].cash,0);
 s.simulationAgeSeconds=out.arrival;simulateIslandHoliday(f,gameClock());assert.equal(f.currentLocationId,'island-airport');assert.equal(f.onPlane,false);
 for(let i=0;i<200&&f.traveling;i++){s.simulationAgeSeconds+=120;moveFly(f);}assert.equal(f.currentLocationId,'island-resort');
 // Exercise promenade and paid leisure, without advancing unrelated world finances.
 f.traits.thrift=0;f.debt=0;f.ownsHome=true;f.homeTier=3;
 s.simulationAgeSeconds=12*3600;simulateIslandHoliday(f,gameClock());
 for(let i=0;i<200&&f.traveling;i++){s.simulationAgeSeconds+=120;moveFly(f);}assert.equal(f.currentLocationId,'island-beach');
 const saved=structuredClone(s);restoreState(saved);s=saved;f=s.flies[0];assert.equal(f.airTrip.phase,'island');
 s.simulationAgeSeconds=f.airTrip.inbound.departure-1800;simulateIslandHoliday(f,gameClock());
 for(let i=0;i<200&&f.traveling;i++){s.simulationAgeSeconds+=1;moveFly(f);}assert.equal(f.currentLocationId,'island-airport');
 simulateIslandHoliday(f,gameClock());const back=f.airTrip.inbound;
 s.simulationAgeSeconds=back.departure+600;simulateIslandHoliday(f,gameClock());assert.equal(f.onPlane,true);
 s.simulationAgeSeconds=back.arrival;simulateIslandHoliday(f,gameClock());assert.equal(f.airTrip,null);assert.equal(f.currentLocationId,'airport');assert.ok(f.money>=0&&f.savings>=0);
 assert.ok(Math.abs(liquidMoneySupply()-before)<1e-6);
});
test('flight schedule respects 30-minute check-in and aircraft stays above sea until island landing',()=>{
 assert.equal(nextFlight(7.5*3600).departure,8*3600);assert.equal(nextFlight(7.5*3600+1).departure,10*3600);
 assert.equal(nextFlight(21*3600,'city').departure,86400+8*3600);
 const flight=nextFlight(7*3600);
 for(let t=0;t<AVIATION.flightSeconds;t+=10){const p=flightPose(flight.departure+t,flight);if(atSea(p))assert.ok(p.y>20);}
});
test('airport helicopter has three paid seats, respects savings and returns to the airport',()=>{
 const s=setup();s.simulationAgeSeconds=12*3600;
 for(const jobId of ['heli-pilot-day','heli-pilot-evening','heli-ground','heli-ground-evening']){
  const f=s.flies.find(f=>f.jobId===jobId);if(f)Object.assign(f,{currentLocationId:'heliport',traveling:false});
 }
 // Ensure a trained pilot is physically at the airport independently of initial job assignment.
 Object.assign(s.flies[50],{jobId:'heli-pilot-day',currentLocationId:'heliport',traveling:false,ageYears:30});
 const totalBefore=[];
 for(let i=0;i<4;i++){const f=guest(s,i);f.currentLocationId='heliport';f.action='taking a Hansdrex helicopter sightseeing tour';const before=liquidMoneySupply();simulateHeliTour(f,gameClock());assert.ok(Math.abs(liquidMoneySupply()-before)<1e-6);totalBefore.push(f);}
 assert.equal(totalBefore.filter(f=>f.heliPassenger).length,3);assert.equal(totalBefore[0].lastHeliTicket,185);assert.equal(totalBefore[3].money,500);
 const f=totalBefore[0];s.simulationAgeSeconds=f.heliTourStartedAt+450;simulateHeliTour(f,gameClock());assert.ok(f.y>250);
 s.simulationAgeSeconds=f.heliTourUntil;simulateHeliTour(f,gameClock());assert.equal(f.heliPassenger,false);assert.equal(f.x,AIRPORT.heliAccess.x);assert.equal(f.z,AIRPORT.heliAccess.z);
});

test('scheduled flight operating costs reach existing suppliers once and conserve money',()=>{
 const s=setup();s.simulationAgeSeconds=8*3600+120;
 assert.equal(s.businesses.garage,undefined);
 const tourism=createTourismSystem({world:()=>s,weatherDanger:()=>0});
 const total=liquidMoneySupply(),airlineCash=s.businesses['island-air'].cash,supplierCash=s.businesses['vehicle-showroom'].cash;
 tourism.aviationTick();
 assert.equal(s.businesses['island-air'].cash,airlineCash-24);
 assert.equal(s.businesses['vehicle-showroom'].cash,supplierCash+6);
 assert.ok(Math.abs(liquidMoneySupply()-total)<1e-6);
 tourism.aviationTick();assert.equal(s.businesses['island-air'].cash,airlineCash-24);
});
