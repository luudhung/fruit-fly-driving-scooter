import test from 'node:test';import assert from 'node:assert/strict';
import {retireAirportMetro} from '../worker/retired-metro.mjs';
import {METRO_LINES,blocked,clearSegment} from '../worker/city-map.mjs';
import {METRO_INTERCHANGES} from '../worker/metro-planner.mjs';
test('M13 leaves no rail or interchange; its old riders and ground approaches resume without changing their identities or fares',()=>{
 assert.ok(!METRO_LINES.some(l=>l.id==='M13'));assert.ok(METRO_INTERCHANGES.every(h=>!h.lines.includes('M13')));
 const rider={id:'PAID-RIDER',alive:true,x:122,y:35,z:-380,onTrain:true,traveling:true,metroLineId:'M13',metroTrainId:'M13-A',metroTrainDirection:1,metroBoardingsThisTrip:2,money:18,savings:900,brain:{id:'REAL-BRAIN'},targetLocationId:'park',finalTargetX:0,finalTargetZ:0,routeWaypoints:[{x:122,y:35,z:-340,lineId:'M13',stage:'station-exit'}]},walker={...structuredClone(rider),id:'APPROACH',onTrain:false,x:70,y:1.1,z:-340};
 const s={flies:[rider],cityVisitors:{visitors:[walker]}},brain=rider.brain;
 const r=retireAirportMetro(s);assert.equal(r.replanned,2);assert.equal(r.alighted,1);assert.deepEqual(r.unresolved,[]);assert.equal(rider.brain,brain);assert.deepEqual([walker.x,walker.y,walker.z],[70,1.1,-340]);
 for(const f of [rider,walker]){assert.equal(f.onTrain,false);assert.notEqual(f.metroLineId,'M13');assert.equal(blocked(f),false);assert.equal(f.money,18);assert.equal(f.savings,900);assert.equal(f.metroBoardingsThisTrip,2);assert.ok(f.routeWaypoints.length);assert.ok(f.routeWaypoints.every(p=>p.lineId!=='M13'));for(let i=1;i<f.routeWaypoints.length;i++)assert.ok(clearSegment(f.routeWaypoints[i-1],f.routeWaypoints[i]));}
 const saved=structuredClone(s);assert.equal(retireAirportMetro(s).replanned,0);assert.deepEqual(s,saved);
});

test('removing a future M13 transfer preserves the occupied M4 train and its paid leg until its retained exit',()=>{
 const f={id:'TRANSFER',alive:true,x:122,y:15,z:-300,onTrain:true,traveling:true,metroLineId:'M4',metroTrainId:'M4-B',metroTrainDirection:-1,metroExitIndex:0,metroExitWaypoint:1,metroBoardingsThisTrip:2,money:18,savings:900,brain:{id:'KEEP-BRAIN'},targetLocationId:'park',finalTargetX:0,finalTargetZ:0,routeIndex:0,routeWaypoints:[{x:122,y:15,z:-340,mode:'metro',stage:'on-train',lineId:'M4'},{x:122,y:16.15,z:-340,mode:'walk',stage:'station-exit',lineId:'M4',stationIndex:0,direction:-1},{x:122,y:36.15,z:-340,mode:'walk',stage:'station-entry',lineId:'M13',stationIndex:2,exitIndex:0,direction:-1}]};
 const before=[f.x,f.y,f.z,f.metroTrainId,f.metroLineId,f.metroTrainDirection,f.metroExitIndex,f.metroBoardingsThisTrip,f.money,f.savings,f.brain];
 const r=retireAirportMetro({flies:[f]});assert.equal(r.replanned,1);assert.equal(r.alighted,0);assert.deepEqual(r.unresolved,[]);assert.deepEqual([f.x,f.y,f.z,f.metroTrainId,f.metroLineId,f.metroTrainDirection,f.metroExitIndex,f.metroBoardingsThisTrip,f.money,f.savings,f.brain],before);assert.equal(f.routeWaypoints[0].stage,'station-exit');assert.equal(f.routeWaypoints[0].lineId,'M4');assert.ok(f.routeWaypoints.every(p=>p.lineId!=='M13'));
});
