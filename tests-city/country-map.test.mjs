import test from 'node:test';import assert from 'node:assert/strict';
import * as map from '../worker/city-map.mjs';
import {COUNTRY_IDS,COUNTRIES,countryAt,countryForHome,COUNTRY_AIRPORTS,NORTH_AIRPORT,NORTH_FARM,NORTH_BUILDINGS,NORTH_LANDMARK,HAWAII_COTTAGES,HAWAII_ROADS,BORDER_CHECKPOINTS,borderDirection} from '../worker/country-map.mjs';
import {planNetworkMetroRoute} from '../worker/metro-planner.mjs';
import {mapLegacyMetroStation,migrateCountryMetroJourneys} from '../worker/country-metro-migration.mjs';
const northHome=()=>map.entrance(map.BUILDINGS.find(b=>b.id.startsWith('AIRPORT-APT-')));
const validate=route=>{assert.ok(route.length>1);for(let i=1;i<route.length;i++)assert.ok(map.clearSegment(route[i-1],route[i]));};
test('three continuous countries preserve the 750/250 population contract, primary homes and exact doubled island area',()=>{
 assert.equal(map.MAP_VERSION,38);assert.deepEqual(COUNTRIES.map(c=>c.initialResidents),[750,250,50]);
 assert.equal(countryAt({x:-800,z:-700}),COUNTRY_IDS.north);assert.equal(countryAt({x:700,z:-700}),COUNTRY_IDS.hansdrex);assert.equal(countryAt({x:-800,z:0}),COUNTRY_IDS.hansdrex);assert.equal(countryAt(map.ISLAND),COUNTRY_IDS.hawaii);
 assert.equal(countryForHome('AIRPORT-APT-0-0-0-0',{x:0,z:0}),COUNTRY_IDS.north);assert.equal(countryForHome('WEST-HOUSE-1-1-1'),COUNTRY_IDS.hansdrex);
 assert.equal(map.ISLAND.rx*map.ISLAND.rz,205*135*2);assert.equal(map.BUILDINGS.some(b=>b.id==='hansdrex-mansion'),false);assert.equal('MANSION' in map,false);
 assert.ok(map.APARTMENTS.filter(b=>countryForHome(b.id,b)===COUNTRY_IDS.north).reduce((n,b)=>n+b.capacity,0)>=250);
 assert.ok(HAWAII_COTTAGES.every(b=>b.seasonal&&!b.primaryResidence&&!map.HOUSE_LOTS.some(h=>h.id===b.id)));
 for(const b of [...HAWAII_COTTAGES,...HAWAII_ROADS])for(const sx of[-1,1])for(const sz of[-1,1])assert.ok(map.onIsland({x:b.x+sx*b.w/2,z:b.z+sz*b.d/2}),`${b.id} stays on land`);
});
test('North has a land-side international airport, all basic services, a rice/vegetable farm and its own Empire-height landmark',()=>{
 assert.equal(COUNTRY_AIRPORTS.length,3);assert.ok(COUNTRY_AIRPORTS.every(p=>countryAt(p.gate)===p.countryId));
 assert.equal(NORTH_LANDMARK.h,map.BUILDINGS.find(b=>b.id==='empire').h);assert.ok(!map.contains(map.AIRPORT_PARK,NORTH_LANDMARK));
 assert.ok(NORTH_FARM.crops.includes('rice')&&NORTH_FARM.crops.includes('vegetables'));assert.equal(NORTH_FARM.ownerCountryId,COUNTRY_IDS.north);
 for(const b of NORTH_BUILDINGS){assert.equal(countryAt(b),COUNTRY_IDS.north);validate(map.pedestrianRoute(northHome(),map.entrance(b)));}
 validate(map.pedestrianRoute(northHome(),NORTH_AIRPORT.gate));validate(map.pedestrianRoute(northHome(),NORTH_FARM.gate));
 assert.ok(map.parkingPoint(NORTH_AIRPORT.gate)&&Math.hypot(map.parkingPoint(NORTH_AIRPORT.gate).x-NORTH_AIRPORT.gate.x,map.parkingPoint(NORTH_AIRPORT.gate).z-NORTH_AIRPORT.gate.z)<35);
 for(const b of HAWAII_COTTAGES)validate(map.pedestrianRoute(map.ISLAND.gate,map.entrance(b)));
});
test('all rail service is domestic, with real North airport transfers and no hidden international metro route',()=>{
 for(const line of map.METRO_LINES){for(let i=0;i<line.points.length;i++){
  const[x,z]=line.points[i];assert.equal(countryAt({x,z}),line.countryId);
  for(const d of[1,-1]){const geo=map.metroStationGeometry(line,i,d);assert.equal(geo.accessViolations,0);for(let j=1;j<geo.stairs.length;j++)assert.ok(map.clearMetroAccessSegment(geo.stairs[j-1],geo.stairs[j]));}
 }
 assert.equal(map.trainStates(line,50).length,2);}
 assert.ok(planNetworkMetroRoute(northHome(),NORTH_AIRPORT.gate)?.legs.some(l=>l.lineId==='N1'));
 assert.equal(planNetworkMetroRoute(northHome(),map.AIRPORT.gate),null);assert.equal(planNetworkMetroRoute(map.AIRPORT.gate,northHome()),null);
 assert.ok(planNetworkMetroRoute({x:-980,z:0},{x:750,z:160}));
});
test('all five actual border bridges have bidirectional queue/admission points, clear carriageways and legal pedestrian gates',()=>{
 assert.equal(BORDER_CHECKPOINTS.length,5);
 for(const port of BORDER_CHECKPOINTS){
  const a=borderDirection(port,COUNTRY_IDS.north),b=borderDirection(port,COUNTRY_IDS.hansdrex);
  assert.equal(countryAt(a.queuePoint),COUNTRY_IDS.hansdrex);assert.equal(countryAt(a.admissionPoint),COUNTRY_IDS.north);assert.equal(countryAt(b.queuePoint),COUNTRY_IDS.north);assert.equal(countryAt(b.admissionPoint),COUNTRY_IDS.hansdrex);assert.ok(Math.hypot(a.queuePoint.x-b.admissionPoint.x,a.queuePoint.z-b.admissionPoint.z)>=5,'opposite flows use distinct lanes');assert.equal(port.visaFee,50);
  assert.ok(map.clearSegment(a.queuePoint,a.admissionPoint));
  if(!port.motorway){const x=port.bounds.x+6.2;assert.ok(map.clearSegment({x,z:-600},{x,z:-540}));}
 }
});
test('map29 international train passengers alight safely in their present country without changing identity, home or funds',()=>{
 assert.deepEqual(mapLegacyMetroStation('M8',7),{lineId:'M12',index:1});assert.deepEqual(mapLegacyMetroStation('M10',4),{lineId:'M10',index:4});
 const brain={id:'same-brain'},passenger=(id,z,line)=>({id,x:line==='M8'?-430:50,z,y:35,onTrain:true,alive:true,metroLineId:line,metroExitIndex:8,metroBoardingsThisTrip:1,homeId:'old-home',money:100,savings:900,brain,targetLocationId:'market',finalTargetX:-37,finalTargetZ:14.5,routeWaypoints:[{x:50,z:-400,lineId:line,mode:'metro'}]});
 const north=passenger('N',-620,'M8'),main=passenger('H',-550,'M10'),untouched={id:'old-M1',x:0,z:0,onTrain:true,metroLineId:'M1',alive:true},state={flies:[north,main,untouched]};
 const before=[countryAt(north),countryAt(main)];const result=migrateCountryMetroJourneys(state);
 assert.equal(result.alighted,2);assert.equal(result.replanned,2);
 for(const [i,f]of[north,main].entries()){assert.equal(countryAt(f),before[i]);assert.equal(f.onTrain,false);assert.equal(map.blocked(f),false);assert.equal(f.brain,brain);assert.equal(f.money,100);assert.equal(f.savings,900);assert.equal(f.homeId,'old-home');assert.equal(f.metroBoardingsThisTrip,1);validate(f.routeWaypoints);}
 assert.equal(untouched.onTrain,true);assert.equal(migrateCountryMetroJourneys(state).replanned,0);
});
