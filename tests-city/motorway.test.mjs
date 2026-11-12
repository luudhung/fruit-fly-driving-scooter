import test from 'node:test';
import assert from 'node:assert/strict';
import {createVehicleRouter} from '../worker/vehicle-network.mjs';
import {createVehicleIndex,signalBarrier,INTERSECTIONS} from '../worker/traffic.mjs';
import {MOTORWAY,MOTORWAY_ROADS,MOTORWAY_DECKS,MOTORWAY_LANE_OFFSETS,MOTORWAY_LANE_MULTIPLIERS,motorwayLaneAt,motorwaySpeedMultiplier,motorwayMedianBlocked,chooseMotorwayLane} from '../worker/motorway.mjs';
import {ROADS,BUILDINGS,contains,clearSegment,pedestrianRoute,parkingPoint,onWaterCrossing} from '../worker/city-map.mjs';

test('the complete ring has four lanes on each carriageway, bounded lane speeds and physical water decks',()=>{
 assert.equal(MOTORWAY.lanesPerDirection,4);assert.equal(MOTORWAY.width,34);
 for(const [lane,offset]of MOTORWAY_LANE_OFFSETS.entries())for(const side of [-1,1]){
  const p={x:-600,z:MOTORWAY.north+side*offset},at=motorwayLaneAt(p);
  assert.equal(at.lane,lane);assert.equal(at.side,side);assert.equal(motorwaySpeedMultiplier(p),MOTORWAY_LANE_MULTIPLIERS[lane]);
 }
 assert.equal(motorwaySpeedMultiplier({x:0,z:0}),1);assert.equal(motorwaySpeedMultiplier({x:-600,z:MOTORWAY.north+2.6},'walk'),1);
 assert.ok(MOTORWAY_LANE_MULTIPLIERS.every(value=>value>=2&&value<=3));
 assert.equal(motorwaySpeedMultiplier({x:MOTORWAY.east-12.2,z:MOTORWAY.north+2.6,heading:0}),2,'vertical corner traffic retains its own outer lane');
 assert.equal(motorwaySpeedMultiplier({x:MOTORWAY.east-12.2,z:MOTORWAY.north+2.6,heading:Math.PI/2}),3,'horizontal corner traffic retains its own inner lane');
 assert.ok(MOTORWAY_DECKS.some(deck=>contains(deck,{x:430,z:MOTORWAY.north})));
 assert.ok(MOTORWAY_DECKS.some(deck=>contains(deck,{x:0,z:MOTORWAY.south})));
 for(const p of [{x:430,z:MOTORWAY.north},{x:430,z:MOTORWAY.south},{x:0,z:MOTORWAY.south},{x:122,z:420}])assert.ok(onWaterCrossing(p));
});

test('road itineraries use all four real lane offsets in both directions and persist their own speed metadata',()=>{
 const router=createVehicleRouter({roads:()=>MOTORWAY_ROADS});
 for(const [lane,offset]of MOTORWAY_LANE_OFFSETS.entries())for(const sign of [-1,1]){
  const start={x:sign>0?-900:-500,z:MOTORWAY.north+sign*offset},end={x:sign>0?-500:-900,z:start.z};
  const route=router.route(start,end,'car',{motorwayLane:lane});assert.ok(route.length>=2);
  assert.ok(route.every(p=>Math.abs(p.z-start.z)<1e-6));
  assert.ok(route.every(p=>p.motorwayLane===lane&&p.speedMultiplier===MOTORWAY_LANE_MULTIPLIERS[lane]));
  assert.deepEqual(router.route(start,end,'car',{motorwayLane:lane}),route);
 }
 for(const [from,to]of [[{x:-1000,z:MOTORWAY.north+12.2},{x:MOTORWAY.east-12.2,z:350}],[{x:MOTORWAY.west+5.8,z:-200},{x:800,z:MOTORWAY.south-5.8}]]){
  const route=router.route(from,to);assert.ok(route.length>8);
  for(const p of route)assert.ok(MOTORWAY_ROADS.some(r=>contains(r,p,.05)),`lane leaves the road at ${p.x},${p.z}`);
 }
});

test('physical motorway lanes cross the river and harbor on legal decks, while individual preferences are stable',()=>{
 for(const z of [MOTORWAY.north,MOTORWAY.south])for(const offset of MOTORWAY_LANE_OFFSETS)for(const direction of [-1,1]){
  const a={x:direction>0?300:600,z:z+direction*offset},b={x:direction>0?600:300,z:a.z};
  const route=pedestrianRoute(a,b,'car');assert.ok(route.length>=2);
  assert.ok(route.every((p,i)=>!i||clearSegment(route[i-1],p)));
  assert.ok(route.some(p=>p.speedMultiplier>=2));
 }
 const cautious={id:'CAREFUL',traits:{risk:0,ambition:0,thrift:1}},fast={id:'FAST',traits:{risk:1,ambition:1,thrift:0}};
 assert.equal(chooseMotorwayLane(cautious),3);assert.equal(chooseMotorwayLane(fast),0);
 assert.equal(chooseMotorwayLane(cautious),chooseMotorwayLane(structuredClone(cautious)));
 assert.equal(chooseMotorwayLane({brain:{driving:{motorwayLane:2}}}),2);
});

test('motorway merges yield to established lanes without traffic signals or false adjacent-lane queues',()=>{
 assert.ok(INTERSECTIONS.every(p=>!MOTORWAY_ROADS.some(r=>r.motorway&&contains(r,p))));
 assert.equal(signalBarrier({x:-500,z:MOTORWAY.north+12.2},{x:-390,z:MOTORWAY.north+12.2},50),null);
 const established={id:'MAIN',alive:true,traveling:true,transitMode:'car',x:-410,z:MOTORWAY.north+12.2,targetX:-300,targetZ:MOTORWAY.north+12.2};
 const join={id:'JOIN',alive:true,traveling:true,transitMode:'car',x:-430,z:-1070,targetX:-430,targetZ:-1090};
 const index=createVehicleIndex([established,join]);
 assert.ok(index(join,{x:-430,z:-1090})<13,'the entering car waits outside the carriageway');
 assert.equal(index(established,{x:-390,z:established.z}),20,'the established lane keeps moving');
 const neighbor={...established,id:'OTHER-LANE',x:-400,z:established.z-3.2};
 assert.equal(createVehicleIndex([established,neighbor])(established,{x:-390,z:established.z}),20);
 assert.equal(motorwayMedianBlocked({x:-600,z:MOTORWAY.north}),true);
 assert.equal(motorwayMedianBlocked({x:-430,z:MOTORWAY.north}),false,'the interchange has a median opening');
});

test('city, airport and Riverside have connected legal motorway journeys without curb parking on the ring',()=>{
 assert.ok(ROADS.some(r=>r.motorway));
 const sites=[{x:-960,z:0},{x:-400,z:-1030},{x:830,z:120},{x:120,z:350}];
 for(const from of sites)for(const to of sites){
  if(from===to)continue;
  const a=parkingPoint(from),b=parkingPoint(to);assert.ok(a&&b);
  const route=pedestrianRoute(a,b,'car');assert.ok(route.length,`missing ${from.x},${from.z} -> ${to.x},${to.z}`);
  assert.ok(route.every((p,i)=>!i||clearSegment(route[i-1],p)));
 }
 for(const b of BUILDINGS)assert.ok(!MOTORWAY_ROADS.some(r=>Math.abs(b.x-r.x)<(b.w+r.w)/2&&Math.abs(b.z-r.z)<(b.d+r.d)/2),b.id);
});
