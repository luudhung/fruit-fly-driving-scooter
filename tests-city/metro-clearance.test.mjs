import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,moveFly} from '../worker/civilization-engine.mjs';
import {METRO_LINES,BUILDINGS,metroStationGeometry,clearSegment,clearMetroAccessSegment} from '../worker/city-map.mjs';

test('every physical station approach and descent reaches its platform or sidewalk without cancelling the journey',()=>{
 const state=freshState(),fly=state.flies[0];let traversals=0;
 for(const line of METRO_LINES)for(let station=0;station<line.points.length;station++)for(const direction of [1,-1])for(const down of [false,true]){
  const geometry=metroStationGeometry(line,station,direction),points=down?[...geometry.stairs].reverse():geometry.stairs;
  const route=points.slice(1).map(p=>({...p,mode:'walk',lineId:line.id,stage:down?'station-stairs-down':'station-stairs-up'}));
  const end=points.at(-1);route.push({...end,mode:'walk',lineId:line.id,stage:'station-access-recovery'});
  Object.assign(fly,{...points[0],traveling:true,alive:true,onTrain:false,indoors:false,transitMode:'walk',transitStage:route[0].stage,metroLineId:line.id,routeWaypoints:route,routeIndex:0,targetX:route[0].x,targetZ:route[0].z,energy:85,travelStuckTicks:0,travelLastDistance:null,targetLocationId:'garage'});
  for(let tick=0;tick<300&&fly.traveling&&fly.routeIndex<route.length-1;tick++)moveFly(fly);
  const label=`${line.id}/${station}/${direction}/${down?'down':'up'}`;
  assert.equal(fly.traveling,true,`${label}: ${fly.action}`);
  assert.equal(fly.routeIndex,route.length-1,`${label}: stuck at waypoint ${fly.routeIndex}`);
  assert.ok(Math.hypot(fly.x-end.x,fly.y-end.y,fly.z-end.z)<.01,label);traversals++;
 }
 assert.equal(traversals,METRO_LINES.reduce((sum,line)=>sum+line.points.length*4,0));
});

test('an elevated station walkway clears a low roof while a wall and ground route remain solid',()=>{
 freshState();
 const line=METRO_LINES.find(l=>l.id==='M7'),points=metroStationGeometry(line,2).stairs,a=points[4],b=points[5];
 assert.equal(clearSegment(a,b),false,'the old ground-only test rejects the rooftop concourse');
 assert.equal(clearMetroAccessSegment(a,b),true);
 assert.equal(clearMetroAccessSegment({...a,y:15},{...b,y:15}),false,'never pass through the lower building floors');
 const building=BUILDINGS.find(b=>b.id==='DOWNTOWN-15-0-1-0');
 assert.equal(clearMetroAccessSegment({x:building.x-20,z:building.z,y:1.1},{x:building.x+20,z:building.z,y:1.1}),false);
});
