import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,restoreState} from '../worker/civilization-engine.mjs';
import {NORTH_AIRPORT,countryAt} from '../worker/country-map.mjs';
import {MAP_VERSION,METRO_LINES,metroStationGeometry,blocked} from '../worker/city-map.mjs';

test('actual engine restore upgrades a map30 N1 farm-branch rider once without changing the paid ticket, brain or wallet',()=>{
 const s=freshState(),f=s.flies.find(f=>f.alive&&f.ageYears>=21&&f.citizenshipCountryId==='north-city'&&!f.publicServiceRole&&!f.facilityEmployment&&f.housingUnitId!=='north-aurora-tower');
 assert.ok(f);Object.assign(f,{x:260,y:43,z:-830,onTrain:true,onPlane:false,onPrivateHelicopter:false,heliPassenger:false,privateFlight:null,airTrip:null,countryAirTrip:null,traveling:true,indoors:false,metroLineId:'N1',metroTrainId:'N1-A',metroTrainDirection:1,metroExitIndex:10,metroExitWaypoint:1,metroBoardingsThisTrip:2,currentLocationId:'north-cafe',targetLocationId:'north-airport',pendingAction:'visiting the North airport',finalTargetX:NORTH_AIRPORT.gate.x,finalTargetZ:NORTH_AIRPORT.gate.z,routeIndex:0,routeWaypoints:[{x:260,z:-830,y:43,mode:'metro',stage:'on-train',lineId:'N1'},{x:260,z:-710,y:44.15,mode:'walk',stage:'station-exit',lineId:'N1',stationIndex:10}]});
 s.mapVersion=30;s.countryMetroMigrationVersion=30;delete s.northAirportMetroMigrationVersion;delete f.northAirportMetroMigrationVersion;
 const before={id:f.id,brainId:f.brain.id,money:f.money,savings:f.savings,homeId:f.homeId,housingUnitId:f.housingUnitId,boardings:f.metroBoardingsThisTrip,entries:structuredClone(f.countryEntryReceipts)};
 const restored=restoreState(structuredClone(s)),r=restored.flies.find(p=>p.id===f.id);assert.equal(restored.mapVersion,MAP_VERSION);assert.equal(restored.countryMetroMigrationVersion,30);assert.equal(restored.northAirportMetroMigrationVersion,31);assert.equal(r.northAirportMetroMigrationVersion,31);
 assert.equal(countryAt(r),'north-city');assert.equal(blocked(r),false);assert.equal(r.onTrain,false);assert.ok(r.y<=1.2);assert.deepEqual({id:r.id,brainId:r.brain.id,money:r.money,savings:r.savings,homeId:r.homeId,housingUnitId:r.housingUnitId,boardings:r.metroBoardingsThisTrip,entries:r.countryEntryReceipts},before);
 assert.ok(r.routeWaypoints.every(p=>!p.lineId||METRO_LINES.some(l=>l.id===p.lineId&&(!Number.isInteger(p.stationIndex)||l.points[p.stationIndex])&&(!Number.isInteger(p.exitIndex)||l.points[p.exitIndex]))));
 const start=[r.x,r.y,r.z,r.metroBoardingsThisTrip,r.routeWaypoints],again=restoreState(structuredClone(restored)),a=again.flies.find(p=>p.id===f.id);assert.deepEqual([a.x,a.y,a.z,a.metroBoardingsThisTrip,a.routeWaypoints],start);
});
