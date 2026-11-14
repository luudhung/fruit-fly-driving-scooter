import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRPORT,BUILDINGS,DISTRICT_RIVERS,DISTRICT_BRIDGES,ROADS,METRO_LINES,LOCATIONS,contains,overlaps,blocked,onWaterCrossing,entrance,parkingPoint,pedestrianRoute,clearSegment,clearMetroAccessSegment,metroStationGeometry} from '../worker/city-map.mjs';
import {MOTORWAY_ACCESS_ROADS} from '../worker/motorway.mjs';
import {planNetworkMetroRoute} from '../worker/metro-planner.mjs';
import {migrateDistrictRiverJourneys,safeDistrictRiverPoint,strandedInDistrictRiver,routeCrossesDistrictRiver} from '../worker/district-river-migration.mjs';

const home=prefix=>entrance(BUILDINGS.find(b=>b.id.startsWith(prefix)));
const place=id=>LOCATIONS.find(l=>l.id===id);
function validRoute(a,b,mode='walk'){
 const route=pedestrianRoute(mode==='car'?parkingPoint(a):a,mode==='car'?parkingPoint(b):b,mode);assert.ok(route.length>1,`${mode}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
 for(let i=1;i<route.length;i++)assert.ok(clearSegment(route[i-1],route[i]),'no route crosses an unbridged water cell');
 return route;
}

test('continuous West and North channels preserve all homes, the Main airport and European army land',()=>{
 const [west,north]=DISTRICT_RIVERS;
 assert.equal(west.z-west.d/2,north.z);assert.ok(west.z+west.d/2>1150);
 assert.ok(north.x-north.w/2< -1150);assert.ok(north.x+north.w/2>=430);
 for(const b of BUILDINGS)for(const river of DISTRICT_RIVERS)assert.equal(overlaps(b,river),false,`${b.id} cannot be submerged`);
 for(const p of [AIRPORT.gate,AIRPORT.runway,AIRPORT.apron,{x:710,z:-560},{x:710,z:-625},{x:490,z:-560}])assert.ok(!DISTRICT_RIVERS.some(r=>contains(r,p)));
 assert.equal(MOTORWAY_ACCESS_ROADS.find(r=>r.id==='RING-SOUTH-WEST').x,-520);
});

test('water blocks arbitrary cross-bank shortcuts and longitudinal driving; named bridges remain open',()=>{
 for(const p of [{x:-430,z:50},{x:-430,z:-500},{x:-200,z:-570},{x:-750,z:-570}]){assert.ok(blocked(p));assert.equal(onWaterCrossing(p),false);}
 for(const b of DISTRICT_BRIDGES){
  const a=b.axis==='x'?{x:b.x-b.w/2,z:b.z+2.6}:{x:b.x+2.6,z:b.z-b.d/2};
  const c=b.axis==='x'?{x:b.x+b.w/2,z:b.z+2.6}:{x:b.x+2.6,z:b.z+b.d/2};
  assert.ok(clearSegment(a,c),b.id);
 }
 assert.ok(!ROADS.some(r=>r.d>r.w&&r.x===-430&&r.z+r.d/2> -590),'the former canal-axis avenue is removed');
});

test('Main, West, North, Europe and the airport have legal pedestrian, fire and freight road connections',()=>{
 const destinations=[home('WEST-APT-'),home('AIRPORT-APT-'),place('riverside-market'),AIRPORT.gate],main=place('market');
 for(const destination of destinations)for(const mode of ['walk','car']){validRoute(main,destination,mode);validRoute(destination,main,mode);}
 for(const destination of destinations.slice(0,2))validRoute(place('firestation'),destination,'car');
 validRoute(destinations[0],destinations[1]);validRoute(destinations[1],destinations[0]);
});

test('every metro access staircase stays physically reachable and transfers still connect all three cities',()=>{
 for(const line of METRO_LINES)for(let i=0;i<line.points.length;i++)for(const direction of [1,-1]){
  const geo=metroStationGeometry(line,i,direction);assert.ok(!blocked(geo.access),`${line.id}/${i}/${direction} ground access`);
  for(let j=1;j<geo.stairs.length;j++)assert.ok(clearMetroAccessSegment(geo.stairs[j-1],geo.stairs[j]),`${line.id}/${i}/${direction} stair ${j}`);
 }
 const west=home('WEST-APT-'),north=home('AIRPORT-APT-');
 for(const pair of [[west,north],[north,place('riverside-market')],[west,AIRPORT.gate]])assert.ok(planNetworkMetroRoute(...pair)?.legs.length);
});

test('one-time migration re-banks stranded ground journeys, preserves life and money, and skips indoor/airborne actors',()=>{
 const pose={x:-430,z:50,y:1.1},brain={memory:['keep me']},resident={...pose,id:'F-1',alive:true,money:123,savings:456,homeId:'same-home',brain,traveling:true,targetLocationId:'market',metroBoardingsThisTrip:2,routeWaypoints:[{x:-410,z:50}],parkedCar:{...pose,id:'old-park'}};
 const safe=safeDistrictRiverPoint(pose);assert.ok(safe&&!blocked(safe)&&!strandedInDistrictRiver(safe));
 assert.ok(routeCrossesDistrictRiver({x:-450,z:50,routeWaypoints:[{x:-410,z:50}]}));
 assert.equal(routeCrossesDistrictRiver({x:-460,z:0,routeWaypoints:[{x:-400,z:0}]}),false);
 const indoors={...pose,id:'indoor',indoors:true},airborne={...pose,id:'air',y:40},train={...pose,id:'train',onTrain:true};
 const truck={...pose,id:'T-1',phase:'delivering',orderId:'O-1',routeWaypoints:[{x:-410,z:50}]},engine={...pose,id:'E-1',phase:'enroute',route:[{x:-417,z:0}],crewIds:[]};
 const state={flies:[resident,indoors,airborne,train],industrialEconomy:{trucks:[truck]},urbanWorld:{fireService:{engines:[engine]}}};let calls=0;
 const result=migrateDistrictRiverJourneys(state,{replanResident(f,chosen){calls++;assert.equal(chosen.id,'market');f.metroBoardingsThisTrip=0;f.routeWaypoints=[];}});
 assert.equal(result.residents,1);assert.equal(result.trucks,1);assert.equal(result.emergencyVehicles,1);assert.equal(calls,1);
 assert.equal(resident.money,123);assert.equal(resident.savings,456);assert.equal(resident.brain,brain);assert.equal(resident.homeId,'same-home');assert.equal(resident.metroBoardingsThisTrip,2);
 assert.ok(!strandedInDistrictRiver(resident));assert.ok(!strandedInDistrictRiver(resident.parkedCar));assert.ok(truck.industryRouteRelocated);assert.equal(truck.orderId,'O-1');assert.equal(engine.phase,'enroute');assert.ok(!routeCrossesDistrictRiver(engine));
 for(const f of [indoors,airborne,train])assert.equal(f.x,-430);
 assert.equal(state.districtRiverMigrationVersion,29);assert.equal(migrateDistrictRiverJourneys(state).residents,0);
});
