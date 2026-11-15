import test from 'node:test';
import assert from 'node:assert/strict';
import {METRO_LINES,metroStationGeometry,blocked,clearSegment} from '../worker/city-map.mjs';
import {countryAt,NORTH_FARM,NORTH_AIRPORT} from '../worker/country-map.mjs';
import {planNetworkMetroRoute,METRO_INTERCHANGES} from '../worker/metro-planner.mjs';
import {migrateCountryMetroJourneys,NORTH_AIRPORT_METRO_MIGRATION_VERSION} from '../worker/country-metro-migration.mjs';
const airportLine=()=>METRO_LINES.find(l=>l.id==='N1');
const insideFarm=p=>Math.abs(p.x-NORTH_FARM.x)<=NORTH_FARM.w/2+1&&Math.abs(p.z-NORTH_FARM.z)<=NORTH_FARM.d/2+1;
const routeIsClear=route=>{assert.ok(route.length>1);for(let i=1;i<route.length;i++)assert.ok(clearSegment(route[i-1],route[i]),`blocked segment ${i}`);};
function passenger(id,changes={}){return{id,alive:true,x:260,z:-830,y:43,traveling:true,onTrain:true,metroLineId:'N1',metroTrainId:'N1-A',metroTrainDirection:1,metroBoardingsThisTrip:2,money:18,savings:900,brain:{id:`BRAIN-${id}`,memories:['existing experience']},homeId:'airport-gardens-homes',homeX:-340,homeZ:-692,housingUnitId:'AIRPORT-APT-OLD',targetLocationId:'north-airport',pendingAction:'visiting the airport',finalTargetX:NORTH_AIRPORT.gate.x,finalTargetZ:NORTH_AIRPORT.gate.z,routeIndex:0,routeWaypoints:[{x:260,z:-830,y:43,mode:'metro',stage:'on-train',lineId:'N1'},{x:260,z:-710,y:44.15,mode:'walk',stage:'station-exit',lineId:'N1',stationIndex:10}],countryPresence:{countryId:'north-city',entryId:'paid-old-entry'},countryEntryReceipts:[{entryId:'paid-old-entry',fee:50}],...changes};}

test('N1 ends at the residential edge with no track, platform or stair inside any North farm fields',()=>{
 const line=airportLine();assert.deepEqual(line.points.at(-1),[50,-950]);assert.equal(line.points.length,7);
 for(let i=0;i<line.points.length;i++){
  const point={x:line.points[i][0],z:line.points[i][1]};assert.equal(insideFarm(point),false);
  if(i)for(let j=0;j<=20;j++){const a=line.points[i-1],b=line.points[i],t=j/20;assert.equal(insideFarm({x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t}),false);}
  for(const direction of [-1,1]){const g=metroStationGeometry(line,i,direction);for(const p of [...g.stairs,g.access,g.platform])assert.equal(insideFarm(p),false);}
 }
 assert.ok(METRO_INTERCHANGES.some(p=>p.lineId==='N1'&&p.lines.includes('M8')));assert.ok(METRO_INTERCHANGES.some(p=>p.lineId==='N1'&&p.lines.includes('M10')));
 const trip=planNetworkMetroRoute(NORTH_AIRPORT.gate,{x:-430,z:-600});assert.ok(trip?.legs.some(l=>l.lineId==='N1'));assert.ok(trip.legs.some(l=>l.lineId==='M8'),'airport line still interchanges into residential North service');assert.ok(trip.waypoints.every(p=>countryAt(p)==='north-city'));
});

test('map30 N1 riders and removed-platform visitors safely leave at a retained North station with all identities and paid history intact',()=>{
 const rider=passenger('RESIDENT'),visitor=passenger('VISITOR',{kind:'visitor',onTrain:false,metroTrainId:null,y:44.15,z:-710}),other={id:'KEEP-M8',alive:true,onTrain:true,traveling:true,metroLineId:'M8',x:-260,z:-830,y:27},state={countryMetroMigrationVersion:30,flies:[rider,other],cityVisitors:{visitors:[visitor]}};
 const old=rider.brain,wallet=[rider.money,rider.savings],passport=structuredClone(rider.countryPresence),receipt=structuredClone(rider.countryEntryReceipts);const otherBefore=structuredClone(other);
 const result=migrateCountryMetroJourneys(state);assert.equal(result.replanned,2);assert.equal(result.alighted,2);assert.deepEqual(result.unresolved,[]);assert.equal(state.countryMetroMigrationVersion,30);assert.equal(state.northAirportMetroMigrationVersion,NORTH_AIRPORT_METRO_MIGRATION_VERSION);
 for(const f of [rider,visitor]){assert.equal(countryAt(f),'north-city');assert.equal(blocked(f),false);assert.equal(f.onTrain,false);assert.equal(f.y,1.1);assert.equal(f.metroBoardingsThisTrip,2);assert.equal(f.housingUnitId,'AIRPORT-APT-OLD');assert.deepEqual(f.countryPresence,passport);assert.deepEqual(f.countryEntryReceipts,receipt);routeIsClear(f.routeWaypoints);assert.ok(f.routeWaypoints.every(p=>countryAt(p)==='north-city'));}
 assert.equal(rider.brain,old);assert.deepEqual([rider.money,rider.savings],wallet);assert.deepEqual(other,otherBefore);
 const saved=structuredClone(state);assert.equal(migrateCountryMetroJourneys(state).replanned,0);assert.deepEqual(state,saved);const restored=structuredClone(state);assert.equal(migrateCountryMetroJourneys(restored).replanned,0);assert.deepEqual(restored,saved);
});

test('a traveller already on an unchanged North train finishes that real paid leg before the cancelled N1 transfer is replaced',()=>{
 const line=METRO_LINES.find(l=>l.id==='M8'),a=metroStationGeometry(line,2,-1),b=metroStationGeometry(line,1,-1),f=passenger('TRANSFER',{x:-260,z:-870,y:27,metroLineId:'M8',metroTrainId:'M8-B',metroTrainDirection:-1,metroExitIndex:1,metroExitWaypoint:2,routeIndex:1,routeWaypoints:[{...a.platform,mode:'walk',stage:'station-entry',lineId:'M8',stationIndex:2,exitIndex:1,direction:-1},{x:-260,z:-830,y:27,mode:'metro',stage:'on-train',lineId:'M8'},{...b.platform,mode:'walk',stage:'station-exit',lineId:'M8',stationIndex:1,direction:-1},{x:-260,z:-955.6,y:44.15,mode:'walk',stage:'station-entry',lineId:'N1',stationIndex:4,exitIndex:10,direction:1},{x:260,z:-710,y:43,mode:'metro',stage:'on-train',lineId:'N1'}]}),state={countryMetroMigrationVersion:30,flies:[f]};
 const identity=[f.x,f.y,f.z,f.onTrain,f.metroLineId,f.metroTrainId,f.metroTrainDirection,f.metroExitIndex,f.metroBoardingsThisTrip,f.money,f.savings,f.brain];
 const result=migrateCountryMetroJourneys(state);assert.equal(result.replanned,1);assert.equal(result.alighted,0);assert.deepEqual([f.x,f.y,f.z,f.onTrain,f.metroLineId,f.metroTrainId,f.metroTrainDirection,f.metroExitIndex,f.metroBoardingsThisTrip,f.money,f.savings,f.brain],identity);
 assert.equal(f.metroExitWaypoint,0);assert.equal(f.routeWaypoints[0].stage,'station-exit');assert.equal(f.routeWaypoints[0].stationIndex,1);assert.ok(f.routeWaypoints.every(p=>p.lineId!=='N1'),'the old farm transfer is gone');
});

test('a ground-level N1 approach is replanned from its existing location rather than moving the walker to another station',()=>{
 const f=passenger('WALKER',{x:-600,z:-924,y:1.1,onTrain:false,metroTrainId:null,routeWaypoints:[{x:260,z:-710,y:44.15,mode:'walk',stage:'station-entry',lineId:'N1',stationIndex:10,exitIndex:0,direction:-1}]}),state={countryMetroMigrationVersion:30,flies:[f]},pose=[f.x,f.y,f.z],brain=f.brain;
 const result=migrateCountryMetroJourneys(state);assert.equal(result.replanned,1);assert.equal(result.alighted,0);assert.deepEqual([f.x,f.y,f.z],pose);assert.equal(f.brain,brain);assert.equal(f.money,18);assert.equal(f.savings,900);routeIsClear(f.routeWaypoints);
});
