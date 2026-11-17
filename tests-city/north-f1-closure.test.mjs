import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshState,moveFly} from '../worker/civilization-engine.mjs';
import {PARKING_SPACES} from '../worker/city-map.mjs';
import {northF1ClosureWindow,isNorthF1TrackClosed,northF1MovementBlocked,northF1PointRestricted} from '../worker/north-f1-closure.mjs';

const approach={x:-790,y:1.1,z:-898},track={x:-790,y:1.1,z:-915},farSide={x:-790,y:1.1,z:-940};

test('closure covers public approaches and pit apron, lets occupants leave, and preserves the upper metro',()=>{
 assert.equal(northF1PointRestricted(approach),false);
 assert.equal(northF1PointRestricted(track),true);
 assert.equal(northF1PointRestricted({x:-638,z:-890}),true);
 assert.equal(northF1MovementBlocked(approach,track),true);
 assert.equal(northF1MovementBlocked(approach,farSide,2),true);
 assert.equal(northF1MovementBlocked(track,approach,2),false);
 assert.equal(northF1MovementBlocked({...approach,y:29},{...farSide,y:29}),false);
 assert.equal(northF1MovementBlocked({...track,y:30},track),true);
 assert.ok(PARKING_SPACES.every(p=>!northF1PointRestricted(p,1.5)));
});

test('the shared window closes one hour before the start and reopens at completion and cancellation',()=>{
 const event={startsAt:10000,endsAt:20000,status:'scheduled'};
 assert.deepEqual(northF1ClosureWindow(event),{startsAt:6400,endsAt:20000});
 const world={northF1:{event},simulationAgeSeconds:6399};
 assert.equal(isNorthF1TrackClosed(world),false);
 world.simulationAgeSeconds++;
 assert.equal(isNorthF1TrackClosed(world),true);
 event.status='racing';
 world.simulationAgeSeconds=19999;
 assert.equal(isNorthF1TrackClosed(world),true);
 world.simulationAgeSeconds++;
 assert.equal(isNorthF1TrackClosed(world),false);
 world.simulationAgeSeconds--;
 event.status='cancelled';assert.equal(isNorthF1TrackClosed(world),false);
 assert.equal(northF1ClosureWindow(event),null);
});

test('the resident engine holds both cars and walkers outside the course and resumes their real itinerary',()=>{
 const world=freshState(),now=world.simulationAgeSeconds;
 world.northF1={event:{startsAt:now,endsAt:now+6000,status:'racing'}};
 for(const mode of ['walk','car']){
  const f={...world.flies[0],...approach,targetX:farSide.x,targetZ:farSide.z,transitMode:mode,routeWaypoints:[{...farSide,mode}],routeIndex:0,
   energy:90,traveling:true,onTrain:false,indoors:false,trafficHoldUntil:0,travelLastDistance:1000,travelStuckTicks:0,targetLocationId:'north-f1-grandstand'};
  moveFly(f,0,12);
  assert.equal(northF1PointRestricted(f),false,mode);
  assert.match(f.trafficStatus??'',/closed Grand Prix circuit/,JSON.stringify({mode,x:f.x,z:f.z,action:f.action,traveling:f.traveling}));
  assert.equal(f.traveling,true);
  world.northF1.event.status='complete';world.simulationAgeSeconds+=120;
  moveFly(f,0,12);
  assert.ok(f.z< -907,mode);
  world.northF1.event.status='racing';
 }
});
