import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,getState,moveFly} from '../worker/civilization-engine.mjs';
import {METRO_LINES,trainStates,trainState,metroStationGeometry} from '../worker/city-map.mjs';

test('the thin observer record carries physical train and direction for riders outside the inspector selection',()=>{
 const s=freshState(),rider=s.flies[0],waiting=s.flies[1],line=METRO_LINES[0],train=trainStates(line,s.simulationAgeSeconds/120)[0];
 Object.assign(rider,{onTrain:true,traveling:true,metroLineId:line.id,metroTrainId:train.id,metroTrainDirection:train.direction});
 Object.assign(waiting,{onTrain:false,metroLineId:line.id,metroTrainDirection:-train.direction,transitStage:'platform-wait'});
 const view=getState({observer:true,selectedId:s.flies[2].id});
 const r=view.flies.find(f=>f.id===rider.id),w=view.flies.find(f=>f.id===waiting.id);
 assert.equal(r.metroTrainId,train.id);assert.equal(r.metroTrainDirection,train.direction);assert.equal(w.metroTrainDirection,-train.direction);
});

test('a platform waiter publishes the requested direction before boarding',()=>{
 const s=freshState(),f=s.flies[0],line=METRO_LINES[0],g=metroStationGeometry(line,0,1);
 let at=0;while(trainState(line,at,1).dwelling&&trainState(line,at,1).from===0)at++;
 s.simulationAgeSeconds=at*120;
 const entry={...g.platform,mode:'walk',stage:'station-entry',stationIndex:0,exitIndex:1,lineId:line.id,direction:1};
 Object.assign(f,{...g.platform,traveling:true,onTrain:false,metroLineId:line.id,metroTrainDirection:null,routeWaypoints:[entry,{...metroStationGeometry(line,1,1).platform,mode:'walk',stage:'station-exit'}],routeIndex:0,targetX:g.platform.x,targetZ:g.platform.z,transitMode:'walk'});
 moveFly(f);assert.equal(f.onTrain,false);assert.equal(f.transitStage,'platform-wait');assert.equal(f.metroTrainDirection,1);
 const record=getState({observer:true,selectedId:s.flies[1].id}).flies.find(r=>r.id===f.id);assert.equal(record.metroTrainDirection,1);
});
