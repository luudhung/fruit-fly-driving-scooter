import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRPORT,AIRPORT_GARDENS,AIRPORT_PARK,AIRPORT_PARK_PATHS,AIRPORT_PARK_PONDS,WEST_DISTRICT,PARK,BUILDINGS,APARTMENTS,LOCATIONS,ROADS,METRO_LINES,contains,overlaps,entrance,pedestrianRoute,clearSegment,metroStationGeometry,trainStates,vehicleRoute} from '../worker/city-map.mjs';
import {planNetworkMetroRoute,METRO_INTERCHANGES} from '../worker/metro-planner.mjs';

const homes=()=>BUILDINGS.filter(b=>b.id.startsWith('AIRPORT-APT-'));
const m8=()=>METRO_LINES.find(line=>line.id==='M8');
const airside=p=>contains(AIRPORT.runway,p,10)||contains(AIRPORT.apron,p,4);
function assertPublicWalk(route){
 assert.ok(route.length>1,'a real public route must exist');
 for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i];assert.ok(clearSegment(a,b),'route must clear physical buildings and water');
  const samples=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/2));
  for(let j=0;j<=samples;j++){const u=j/samples;assert.equal(airside({x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u}),false,'public pedestrians cannot shortcut through the secure airfield');}
 }
}

test('Airport Gardens has genuine apartment capacity around a three-quarter-size protected park',()=>{
 assert.equal(AIRPORT_PARK.w*AIRPORT_PARK.d,PARK.w*PARK.d*.75);
 assert.ok(homes().length>=24,'many actual apartment buildings are required');
 for(const home of homes()){
  assert.ok(APARTMENTS.some(b=>b.id===home.id));assert.ok(home.capacity>=8);
  assert.ok(contains(AIRPORT_GARDENS,home));
  assert.equal(overlaps(home,AIRPORT_PARK,1),false);
  assert.equal(overlaps(home,AIRPORT.runway,35),false);
  assert.equal(overlaps(home,AIRPORT.apron,25),false);
 }
 assert.ok(ROADS.every(road=>!overlaps(road,AIRPORT_PARK)),'roads go around the park');
 assert.ok(BUILDINGS.every(building=>!overlaps(building,AIRPORT_PARK)),'parkland cannot silently become building lots');
 assert.ok(AIRPORT_PARK_PATHS.length>=6);assert.ok(AIRPORT_PARK_PONDS.length>=1);
 const gate=LOCATIONS.find(l=>l.id==='airport-park');assert.ok(gate&&contains(AIRPORT_PARK,gate));
});

test('both Airport Gardens lines use separate directional trains and real sidewalk staircases outside the runway',()=>{
 for(const id of ['M8','M10']){
 const line=METRO_LINES.find(line=>line.id===id);assert.ok(line);
 for(let index=0;index<line.points.length;index++)for(const direction of [1,-1]){
  const geo=metroStationGeometry(line,index,direction);
  assert.equal(geo.accessViolations,0,`${id} ${index}/${direction} needs a legal ground entrance`);
  assert.equal(airside(geo.access),false);
  assert.equal(contains(AIRPORT_PARK,geo.access),false);
  assertPublicWalk(pedestrianRoute(geo.access,{x:geo.access.x+.15,z:geo.access.z+.15}));
 }
 const trains=trainStates(line,45);assert.equal(trains.length,2);assert.equal(new Set(trains.map(t=>t.id)).size,2);
 assert.deepEqual(trains.map(t=>t.direction).sort(),[-1,1]);
 assert.ok(Math.hypot(trains[0].x-trains[1].x,trains[0].z-trains[1].z)>1);
 const railway=line.points.map(([x,z])=>({x,z}));
 for(let i=1;i<railway.length;i++){
  const a=railway[i-1],b=railway[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/5));
  for(let j=0;j<=steps;j++){const u=j/steps;assert.equal(contains(AIRPORT.runway,{x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u},30),false,'metro cannot cross the active runway envelope');}
 }
 }
});

test('every new apartment has real access to both-side metro coverage, and the airport gate is reachable around the airfield',()=>{
 const line=m8(),stations=METRO_LINES.filter(line=>['M8','M10'].includes(line.id)).flatMap(line=>line.points.map((_,index)=>({...metroStationGeometry(line,index).access,lineId:line.id}))),coverage=new Map();
 for(const home of homes()){
  const from=entrance(home),station=stations.toSorted((a,b)=>Math.hypot(a.x-from.x,a.z-from.z)-Math.hypot(b.x-from.x,b.z-from.z))[0];
  assertPublicWalk(pedestrianRoute(from,station));
  coverage.set(station.lineId,(coverage.get(station.lineId)||0)+1);
 }
 assert.ok(coverage.get('M8')>10&&coverage.get('M10')>10,'each side of the new neighbourhood has its own nearby line');
 for(const home of [homes()[0],homes().at(-1)]){
  assertPublicWalk(pedestrianRoute(entrance(home),AIRPORT.gate));
  assertPublicWalk(pedestrianRoute(AIRPORT.gate,entrance(home)));
  assert.ok(vehicleRoute(entrance(home),AIRPORT.gate).length>1,'normal city cars can reach airport-side homes');
 }
 assertPublicWalk(pedestrianRoute(AIRPORT.gate,metroStationGeometry(line,7).access));
});

test('M8 interchanges link the new neighbourhood to every old line and an actual Riverside itinerary',()=>{
 const reached=new Set(['M8']);
 for(let pass=0;pass<METRO_LINES.length;pass++)for(const hub of METRO_INTERCHANGES)if(hub.lines.some(id=>reached.has(id)))for(const id of hub.lines)reached.add(id);
 assert.deepEqual([...reached].sort(),METRO_LINES.map(l=>l.id).sort());
 const from=entrance(homes()[0]),dest=entrance(LOCATIONS.find(l=>l.id==='riverside-market'));
 const plan=planNetworkMetroRoute(from,dest);assert.ok(plan?.legs.some(leg=>leg.lineId==='M8'));
 assert.ok(plan.transfers>=1);assert.ok(plan.waypoints.some(p=>p.stage==='interchange-walk'));
 assert.ok(plan.legs.every(leg=>leg.entryIndex!==leg.exitIndex));
 const reverse=planNetworkMetroRoute(dest,from);assert.ok(reverse?.legs.some(leg=>leg.lineId==='M8'));
 assertPublicWalk(pedestrianRoute(from,dest));
 assertPublicWalk(pedestrianRoute(dest,from));
 const park=LOCATIONS.find(l=>l.id==='airport-park');
 assertPublicWalk(pedestrianRoute(entrance(homes()[0]),park));
});

test('the airport walk lattice routes public crossings around the runway instead of directly across it',()=>{
 assertPublicWalk(pedestrianRoute({x:-355,z:-520},{x:-5,z:-520}));
});

test('Westborough homes have two nearby lines and interchange journeys to the core, airport and Riverside',()=>{
 const west=BUILDINGS.filter(b=>b.id.startsWith('WEST-APT-')||b.id.startsWith('WEST-HOUSE-'));
 assert.ok(west.length>=24);assert.ok(west.some(b=>b.kind==='house'));assert.ok(west.some(b=>b.kind==='apartment'));
 assert.ok(west.every(b=>contains(WEST_DISTRICT,b)));
 const line=METRO_LINES.find(line=>line.id==='M9');assert.ok(line);
 assert.deepEqual(line.points.at(-1),[-310,0]);
 const stations=METRO_LINES.filter(line=>['M9','M11'].includes(line.id)).flatMap(line=>line.points.map((_,index)=>({...metroStationGeometry(line,index),lineId:line.id}))),coverage=new Map();
 for(const geo of stations)assert.equal(geo.accessViolations,0);
 for(const home of west){
  const from=entrance(home),station=stations.toSorted((a,b)=>Math.hypot(a.access.x-from.x,a.access.z-from.z)-Math.hypot(b.access.x-from.x,b.access.z-from.z))[0];
  assertPublicWalk(pedestrianRoute(from,station.access));
  coverage.set(station.lineId,(coverage.get(station.lineId)||0)+1);
 }
 assert.ok(coverage.get('M9')>10&&coverage.get('M11')>10,'both western metro lines serve actual nearby homes');
 const from=entrance(west.toSorted((a,b)=>Math.abs(a.z)-Math.abs(b.z)||a.x-b.x)[0]),airportHome=entrance(homes()[0]),riverside=entrance(LOCATIONS.find(l=>l.id==='riverside-market'));
 for(const dest of [AIRPORT.gate,airportHome,riverside]){
  assertPublicWalk(pedestrianRoute(from,dest));assertPublicWalk(pedestrianRoute(dest,from));
  const plan=planNetworkMetroRoute(from,dest);assert.ok(plan?.legs.some(leg=>leg.lineId==='M9'));
 }
 assert.ok(vehicleRoute(from,AIRPORT.gate).length>1);
});

test('four new lines have actual interchange itineraries across the expanded city',()=>{
 assert.equal(METRO_LINES.length,11);
 const target=entrance(LOCATIONS.find(l=>l.id==='riverside-market'));
 for(const id of ['M8','M9','M10','M11']){
  const line=METRO_LINES.find(line=>line.id===id),from=metroStationGeometry(line,0).access;
  const plan=planNetworkMetroRoute(from,target);
  assert.ok(plan?.legs.some(leg=>leg.lineId===id),`${id} must carry a real itinerary into the shared network`);
  assert.ok(plan.transfers>=1);assert.ok(plan.waypoints.some(p=>p.stage==='interchange-walk'));
  assert.ok(plan.legs.every(leg=>leg.entryIndex!==leg.exitIndex));
 }
});
