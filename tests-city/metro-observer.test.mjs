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


test('compact observer skips unused traces, keeps the announced route and preserves selected inspector details',()=>{
 const state=freshState(),[moving,selected]=state.flies.filter(f=>f.alive);
 const target={x:23.452345,y:1.1,z:1.500283},trace={x:20,y:1.1,z:0,t:state.simulationAgeSeconds};
 Object.assign(moving,{x:20,y:1.1,z:0,traveling:true,onTrain:false,onPlane:false,heliPassenger:false,onPrivateHelicopter:false,taxiPassenger:false,transitMode:'walk',routeIndex:0,routeWaypoints:[{...target,mode:'walk'}],movementTrace:[trace]});
 selected.movementTrace=[trace];
 const full=getState({observer:true,selectedId:selected.id}),compact=getState({observer:true,selectedId:selected.id,compactObserver:true});
 assert.equal(compact.population,full.population);
 assert.equal(compact.simulationAgeSeconds,full.simulationAgeSeconds);
 assert.deepEqual(compact.flies.find(f=>f.id===selected.id),full.flies.find(f=>f.id===selected.id));
 const c=compact.flies.find(f=>f.id===moving.id),f=full.flies.find(f=>f.id===moving.id);
 assert.equal(c.movementTrace,undefined);assert.ok(f.movementTrace.length);
 assert.deepEqual(c.motion.points,[{x:23.45,y:1.1,z:1.5}]);
 assert.ok(JSON.stringify(compact).length<JSON.stringify(full).length);
});

test('compact airport observations keep absolute walking and scan times even for an indoor passenger with no street journey',async()=>{
 const {visitorStands,visitorArrivalPath,visitorArrivalMotion}=await import('../worker/visitor-aviation.mjs');
 const s=freshState(),f=s.flies.find(f=>f.alive),stand=visitorStands('north')[0],flight={airportId:'north',standId:stand.id,arrivalStand:stand,parkedAt:1020};
 const path=visitorArrivalPath(flight,0),scan=path.find(p=>p.stage==='scanning');s.simulationAgeSeconds=scan.at+120;
 const motion=visitorArrivalMotion(s.simulationAgeSeconds,flight,0);
 Object.assign(f,{x:scan.x,y:scan.y,z:scan.z,airportMotion:motion,traveling:false,indoors:true,onPlane:false,onTrain:false,heliPassenger:false,onPrivateHelicopter:false,taxiPassenger:false});
 const full=getState({observer:true}),compact=getState({observer:true,compactObserver:true});
 for(const snapshot of [full,compact]){
  const body=snapshot.flies.find(r=>r.id===f.id);assert.equal(body.indoors,true);assert.equal(body.motion.timed,true);assert.equal(body.motion.mode,'walk');assert.deepEqual(body.motion.points,motion.points);assert.ok(body.motion.points.every(p=>Number.isFinite(p.at)));
 }
 s.simulationAgeSeconds=path.at(-1).at+1;assert.equal(getState({observer:true}).flies.find(r=>r.id===f.id).motion,null,'an expired itinerary cannot animate a later indoor activity');
});
