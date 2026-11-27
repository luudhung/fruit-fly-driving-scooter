import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,restoreState,moveFly,getSimulationConfig} from '../worker/civilization-engine.mjs';
import {METRO_LINES,metroStationGeometry,trainState,BUILDINGS,entrance} from '../worker/city-map.mjs';
import {METRO_ACCESS_VERSION} from '../worker/metro-planner.mjs';
const line=METRO_LINES.find(l=>l.id==='M12'),oldStairs=[{x:-289,z:-394.28,y:1.1},{x:-303,z:-394.28,y:14.625},{x:-303,z:-393.28,y:14.625},{x:-289,z:-393.28,y:28.15}];
const protectedState=f=>[f.id,f.x,f.y,f.z,f.onTrain,f.metroTrainId,f.metroTrainDirection,f.metroBoardingsThisTrip,f.money,f.savings,f.brain.id];

test('an already paid M12 rider keeps its actual train and pose while its future alighting stairs move clear of the airport ramp',()=>{
 const s=freshState(),f=s.flies[0],dest=entrance(BUILDINGS.find(b=>b.id==='garage')),seconds=15,train=trainState(line,seconds,1),platform=metroStationGeometry(line,1,1).platform;
 s.metroAccessVersion=3;s.simulationAgeSeconds=seconds*getSimulationConfig().gameSecondsPerRealSecond;
 Object.assign(f,{alive:true,indoors:false,traveling:true,onTrain:true,x:train.x,y:train.y,z:train.z,metroLineId:line.id,metroTrainId:train.id,metroTrainDirection:1,metroExitIndex:1,metroExitWaypoint:1,metroBoardingsThisTrip:1,money:27.5,savings:111,targetLocationId:'garage',finalTargetX:dest.x,finalTargetZ:dest.z,routeIndex:0,
  routeWaypoints:[{...platform,stage:'station-exit',stationIndex:1,lineId:line.id,direction:1,metroAccessVersion:3},...oldStairs.toReversed().map(p=>({...p,mode:'walk',stage:'station-stairs-down',lineId:line.id,metroAccessVersion:3}))]});
 const before=protectedState(f),restored=restoreState(JSON.parse(JSON.stringify(s))),r=restored.flies.find(p=>p.id===f.id),access=metroStationGeometry(line,1,1).access;
 assert.deepEqual(protectedState(r),before);assert.equal(restored.metroAccessVersion,METRO_ACCESS_VERSION);assert.equal(r.routeWaypoints[0].stage,'station-exit');
 assert.ok(r.routeWaypoints.some(p=>Math.hypot(p.x-access.x,p.z-access.z,(p.y??1.1)-1.1)<.01));
 assert.ok(!r.routeWaypoints.some(p=>p.stage==='station-stairs-down'&&Math.hypot(p.x-oldStairs[0].x,p.z-oldStairs[0].z)<.01));
});

test('a saved M12 climber retreats once from its actual position and then uses the new clear staircase without losing its fare or restarting each restore',()=>{
 const s=freshState(),f=s.flies[0],dest=entrance(BUILDINGS.find(b=>b.id==='garage')),geo=metroStationGeometry(line,1,1);
 s.metroAccessVersion=3;
 const old=[{...oldStairs[0],mode:'walk',stage:'sidewalk'},...oldStairs.map(p=>({...p,mode:'walk',stage:'station-stairs-up',lineId:line.id,metroAccessVersion:3})),{...geo.platform,mode:'walk',stage:'station-entry',stationIndex:1,exitIndex:3,direction:1,lineId:line.id,metroAccessVersion:3},{...metroStationGeometry(line,3,1).platform,mode:'walk',stage:'station-exit',stationIndex:3,direction:1,lineId:line.id,metroAccessVersion:3}];
 Object.assign(f,{alive:true,indoors:false,traveling:true,onTrain:false,x:-296,y:7.8625,z:-394.28,metroLineId:line.id,metroTrainId:null,metroTrainDirection:1,metroExitIndex:3,metroBoardingsThisTrip:1,money:27.5,savings:111,targetLocationId:'garage',finalTargetX:dest.x,finalTargetZ:dest.z,routeIndex:2,routeWaypoints:old,transitMode:'walk',transitStage:'station-stairs-up'});
 const before=protectedState(f),restored=restoreState(JSON.parse(JSON.stringify(s))),r=restored.flies.find(p=>p.id===f.id);assert.deepEqual(protectedState(r),before);assert.equal(r.routeWaypoints[0].stage,'station-access-recovery');
 const encoded=JSON.stringify(r.routeWaypoints),second=restoreState(JSON.parse(JSON.stringify(restored))),again=second.flies.find(p=>p.id===f.id);assert.equal(JSON.stringify(again.routeWaypoints),encoded);
 const entry=again.routeWaypoints.findIndex(p=>p.stage==='station-entry');assert.ok(entry>0);
 for(let i=0;i<500&&again.routeIndex<entry;i++){second.simulationAgeSeconds+=60;moveFly(again);}
 assert.ok(again.routeIndex>=entry,'the repaired approach must finish instead of looping on the old stairs');assert.equal(again.savings,111);assert.ok(again.money>=27);
});
