import test from 'node:test';
import assert from 'node:assert/strict';
import {HANSDREX_AIRPORT} from '../worker/hansdrex-airport-map.mjs';
import {airportTerminalTransfer,airportTerminalTrainStates} from '../worker/airport-campus.mjs';
import {visitorDeparturePath,visitorArrivalPath,visitorBoardingPose,airportDepartureEntranceFor,captureAirportDepartureEntrance,visitorRunwaySlot,visitorRunwayTiming,visitorFlightDuration} from '../worker/visitor-aviation.mjs';
import {createRegionalAviationSystem} from '../worker/regional-aviation.mjs';

const terminal=id=>HANSDREX_AIRPORT.terminals.find(t=>t.id===id);
const upstairs=(id='T1')=>{const t=terminal(id);return {x:t.x,y:6.52,z:t.z+6};};
const person=(id,from='T1')=>({id,alive:true,ageYears:30,money:1000,savings:1000,health:95,energy:90,citizenshipCountryId:'hansdrex',currentLocationId:'airport',traveling:false,brain:{id:'BRAIN-'+id},...upstairs(from),airportDepartureEntrance:{terminalId:from,...upstairs(from)}});
const flight=(to='T4')=>{const stand=HANSDREX_AIRPORT.stands.find(s=>s.terminalId===to);return {id:'UPPER-FLIGHT',airportId:'city',terminalId:to,standId:stand.id,arrivalStand:stand,boardingStartedAt:100000,inboundAt:0,parkedAt:100,outboundAt:250000,exitAt:251000};};

test('new arrivals exit their own terminal and can return from its real ground entrance after restore',()=>{
 for(const t of HANSDREX_AIRPORT.terminals){
  const f={...flight(t.id),arrivalPathVersion:2,departurePathVersion:2},arrival=visitorArrivalPath(f,0,120);
  assert.ok(!arrival.some(p=>p.phase==='terminal-transfer'));
  assert.deepEqual({x:arrival.at(-1).x,y:arrival.at(-1).y,z:arrival.at(-1).z},{...t.gate,y:1.1});
  const p={id:'ARRIVAL-'+t.id,currentLocationId:'airport',traveling:false,...t.gate,y:1.1};
  assert.equal(captureAirportDepartureEntrance(f,p,0),true);assert.equal(f.departureGroundTerminals[0],t.id);
  const route=visitorDeparturePath(f,0,120);
  assert.ok(!route.some(p=>p.stage==='terminal-train'));assert.ok(route.some(p=>p.stage==='departure-emigration'));
  assert.ok(Math.abs(route[0].x-t.x)<t.w/2);
  assert.deepEqual(visitorDeparturePath(structuredClone(f),0,120),route);
  if(t.id!=='T1')assert.ok(visitorArrivalPath({...f,arrivalPathVersion:1},0,120).some(p=>p.phase==='terminal-transfer'),'legacy accepted arrivals retain their old transfer');
 }
});

test('a runway clearance on the west pair does not close the disjoint east pair',()=>{
 const west={...flight('T1'),sector:'west',direction:1,motionVersion:2,runwayId:'HCA-09L',outboundAt:null,exitAt:null};
 const east={...flight('T3'),sector:'east',direction:-1,motionVersion:2,runwayId:'HCA-09A',outboundAt:null,exitAt:null};
 const westTiming=visitorRunwayTiming(west),eastTiming=visitorRunwayTiming(east),at=100000;
 const base=visitorRunwaySlot(at,visitorFlightDuration(east),[],'city',east.runwayId,eastTiming);
 west.inboundAt=base+eastTiming.ground[0]-westTiming.ground[0];west.parkedAt=west.inboundAt+westTiming.duration;
 assert.equal(visitorRunwaySlot(at,visitorFlightDuration(east),[west],'city',east.runwayId,eastTiming),base);
 const same={...east,id:'SAME',inboundAt:base,parkedAt:base+eastTiming.duration};
 assert.ok(visitorRunwaySlot(at,visitorFlightDuration(east),[same],'city',east.runwayId,eastTiming)>base);
});

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

test('new departures use external landside access, upstairs exit-passport control and exterior rear stairs at every terminal',()=>{
 for(const t of HANSDREX_AIRPORT.terminals)for(const upper of [false,true]){
  const f={...flight(t.id),departurePathVersion:2};
  if(upper)assert.equal(captureAirportDepartureEntrance(f,person('EXIT-'+t.id,t.id),0),true);
  const path=visitorDeparturePath(f,0,120),security=path.findIndex(p=>p.stage==='departure-security'),passport=path.findIndex(p=>p.stage==='departure-emigration'),door=path.findIndex(p=>p.stage==='departure-airside-door'),landing=path.findIndex(p=>p.stage==='departure-airside-landing'),foot=path.findIndex(p=>p.stage==='departure-airside-stairs');
  assert.ok(security>=0&&passport>security&&door>passport&&landing>door&&foot>landing);
  assert.equal(path[passport].y,6.52);assert.equal(path[passport+1].at-path[passport].at,180,'exit-passport processing is a real timed stop');
  assert.ok(path.slice(security,foot).every(p=>p.y===6.52));
  assert.ok(path[landing].z<t.z-t.d/2&&path[foot].z<path[landing].z,'the descent is outside the airside rear wall');
  assert.equal(path[landing].x,path[foot].x);assert.equal(path[foot].y,1.1);
  assert.ok(path.filter(p=>p.y===1.1).every(p=>Math.abs(p.x-t.x)>=t.w/2||Math.abs(p.z-t.z)>=t.d/2),'departure passengers never enter the ground-floor arrival immigration hall');
  const restored=structuredClone(f);assert.deepEqual(visitorDeparturePath(restored,0,120),path);
 }
});

test('new ground and upper departures transfer between terminals upstairs and never return to arrivals before boarding',()=>{
 for(const from of ['T1','T3'])for(const to of ['T2','T4']){
  const f={...flight(to),departurePathVersion:2};if(from==='T3')captureAirportDepartureEntrance(f,person('TRANSFER','T3'),0);
  const path=visitorDeparturePath(f,0,120),up=path.findIndex(p=>p.y===6.52),foot=path.findIndex(p=>p.stage==='departure-airside-stairs');
  assert.ok(up>=0&&foot>up);assert.ok(path.slice(up,foot).every(p=>p.y===6.52));assert.ok(path.some(p=>p.stage==='terminal-train'));
  assert.ok(!path.some(p=>p.stage==='terminal-stairs-down'));
  assert.ok(path.some(p=>p.stage==='departure-emigration'));
 }
});

test('an already accepted legacy boarding plan keeps its original route and timestamps after the exit-passport upgrade',()=>{
 const legacy=flight('T4'),path=visitorDeparturePath(legacy,0,120),before=structuredClone(legacy);
 assert.ok(path.some(p=>p.stage==='terminal-stairs-down'));assert.ok(!path.some(p=>p.stage==='departure-emigration'));
 assert.deepEqual(visitorDeparturePath(structuredClone(legacy),0,120),path);assert.deepEqual(legacy,before);
 const current={...legacy,departurePathVersion:2};assert.ok(visitorDeparturePath(current,0,120).some(p=>p.stage==='departure-emigration'));
 assert.deepEqual(visitorDeparturePath(legacy,0,120),path,'new route caches do not mutate the accepted old plan');
});
