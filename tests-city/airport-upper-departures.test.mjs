import test from 'node:test';
import assert from 'node:assert/strict';
import {HANSDREX_AIRPORT} from '../worker/hansdrex-airport-map.mjs';
import {airportTerminalTransfer,airportTerminalTrainStates} from '../worker/airport-campus.mjs';
import {visitorDeparturePath,visitorBoardingPose,airportDepartureEntranceFor,captureAirportDepartureEntrance} from '../worker/visitor-aviation.mjs';
import {createRegionalAviationSystem} from '../worker/regional-aviation.mjs';

const terminal=id=>HANSDREX_AIRPORT.terminals.find(t=>t.id===id);
const upstairs=(id='T1')=>{const t=terminal(id);return {x:t.x,y:6.52,z:t.z+6};};
const person=(id,from='T1')=>({id,alive:true,ageYears:30,money:1000,savings:1000,health:95,energy:90,citizenshipCountryId:'hansdrex',currentLocationId:'airport',traveling:false,brain:{id:'BRAIN-'+id},...upstairs(from),airportDepartureEntrance:{terminalId:from,...upstairs(from)}});
const flight=(to='T4')=>{const stand=HANSDREX_AIRPORT.stands.find(s=>s.terminalId===to);return {id:'UPPER-FLIGHT',airportId:'city',terminalId:to,standId:stand.id,arrivalStand:stand,boardingStartedAt:100000,inboundAt:0,parkedAt:100,outboundAt:250000,exitAt:251000};};

test('taxi passengers start at their actual upper hall, transfer upstairs and descend only after security',()=>{
 for(const from of ['T1','T2','T3','T4'])for(const to of ['T1','T2','T3','T4']){
  const f=flight(to),p=person(`${from}-${to}`,from),accepted=[f.id,f.boardingStartedAt,f.outboundAt];
  assert.equal(captureAirportDepartureEntrance(f,p,0),true);assert.equal(p.airportDepartureEntrance,undefined);
  const path=visitorDeparturePath(f,0,120),security=path.findIndex(p=>p.stage==='departure-security');
  assert.deepEqual({x:path[0].x,y:path[0].y,z:path[0].z},upstairs(from));assert.ok(security>0);
  assert.ok(path.slice(0,security+1).every(p=>p.y===6.52),'a taxi rider must not return to the ground entrance');
  assert.equal(path.some(p=>p.stage==='terminal-train'),from!==to);assert.ok(path.slice(security+1).some(p=>p.y===1.1),'secure airside stairs still lead to the real aircraft door');
  assert.deepEqual([f.id,f.boardingStartedAt,f.outboundAt],accepted);
  for(const p of path.filter(p=>p.stage==='terminal-train-board'||p.stage==='terminal-train'||p.stage==='terminal-train-departure')){
   const train=airportTerminalTrainStates((p.at+(p.stage==='terminal-train-board'?.001:0))/120).find(t=>Math.abs(t.z-p.z)<.01&&Math.abs(t.x-p.x)<.01);assert.ok(train&&train.visible,`${from}→${to} passenger must occupy its actual train`);
   if(p.stage==='terminal-train-board')assert.ok(train.dwelling,'boarding occurs during a real dwell');
  }
  const restored=structuredClone(f);assert.deepEqual(visitorDeparturePath(restored,0,120),path);
 }
});

test('ground passengers and already prepared paths retain their stairs when another passenger arrives upstairs',()=>{
 const f=flight(),ground=visitorDeparturePath(f,1,120),initial=visitorDeparturePath(f,0,120);
 assert.equal(initial[0].y,1.1);assert.ok(initial.some(p=>p.stage==='departure-stairs-up'));
 const p=person('ARRIVED','T3');assert.equal(captureAirportDepartureEntrance(f,p,0),true);
 assert.equal(visitorDeparturePath(f,0,120)[0].y,6.52,'cached paths must notice the new physical entry');
 assert.deepEqual(visitorDeparturePath(f,1,120),ground,'another seat keeps its original ground-to-terminal path');
 const pose=visitorBoardingPose(f.boardingStartedAt,f,0,120);assert.deepEqual({x:pose.x,y:pose.y,z:pose.z},upstairs('T3'));
});

test('an upper marker cannot teleport someone who is still travelling, on a train or at another location',()=>{
 const f=flight();for(const patch of [{traveling:true},{onTrain:true},{onPlane:true},{currentLocationId:'hotel'},{y:1.1},{x:0},{airportDepartureEntrance:{terminalId:'MISSING'}}]){
  const p={...person('INVALID'),...patch};assert.equal(airportDepartureEntranceFor(p),null);assert.equal(captureAirportDepartureEntrance(f,p,0),false);assert.ok(p.airportDepartureEntrance);
 }
 assert.equal(f.departureEntrances,undefined);
});

test('optional upper terminal transfers keep public rail schedules and stay at floor two in both directions',()=>{
 for(const [from,to]of [['T1','T4'],['T4','T1'],['T2','T3'],['T3','T2']]){
  const route=airportTerminalTransfer(from,to,100000,120,{upperStart:true,upperEnd:true});
  assert.equal(route.fare,0);assert.ok(route.waypoints.every(p=>p.y===6.52));assert.deepEqual({x:route.waypoints.at(-1).x,y:route.waypoints.at(-1).y,z:route.waypoints.at(-1).z},upstairs(to));
  const old=airportTerminalTransfer(from,to,100000,120);assert.equal(old.waypoints[0].y,1.1);assert.equal(old.waypoints.at(-1).y,1.1);
 }
});

test('regional bookings accept physical T2–T4 upstairs check-in and retain paid identity and upper paths after restore',()=>{
 let state={simulationAgeSeconds:7*3600,timeScale:120,flies:[person('REGIONAL','T3')],businesses:{},treasury:{cash:10000},totalTransactions:0,cityVisitors:{visitors:[],hotels:{}}};
 const build=()=>{const air=createRegionalAviationSystem({world:()=>state,weatherDanger:()=>0,requestAirClearance:()=>({allowed:true}),aviationAdmission:()=>({allowed:true,fee:0})});air.init();return air;};
 let air=build(),p=state.flies[0];const total=()=>state.flies.reduce((sum,p)=>sum+p.money+p.savings,0)+state.treasury.cash+Object.values(state.businesses).reduce((sum,b)=>sum+Number(b.cash||0),0),before=total();
 assert.equal(air.book(p,'island'),true);const t=p.countryAirTrip,plan=t.outboundBoarding,path=visitorDeparturePath(plan,t.outboundIndex,120),paid=p.money+p.savings;
 assert.equal(plan.departureEntrances[t.outboundIndex].terminalId,'T3');assert.equal(p.airportDepartureEntrance,undefined);assert.deepEqual({x:path[0].x,y:path[0].y,z:path[0].z},upstairs('T3'));assert.equal(total(),before);
 air.handleResident(p);assert.equal(p.y,6.52);assert.equal(p.x,terminal('T3').x);assert.equal(p.airportMotion.timed,true);
 state=structuredClone(state);air=build();p=state.flies[0];assert.equal(p.money+p.savings,paid);assert.equal(p.brain.id,'BRAIN-REGIONAL');assert.deepEqual(p.countryAirTrip.outboundBoarding,plan);assert.deepEqual(visitorDeparturePath(p.countryAirTrip.outboundBoarding,p.countryAirTrip.outboundIndex,120),path);assert.equal(total(),before);
});
