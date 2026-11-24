import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILDINGS,applyUrbanGeometry} from '../worker/city-map.mjs';
import {nextRegionalFlight,regionalFlightPath,regionalFlightTiming,flightPose} from '../worker/aviation.mjs';

function crossings(a,b,obstacle,margin=12){
 let lo=0,hi=1;
 for(const [axis,i,size]of [['x',0,'w'],['z',2,'d']]){
  const min=obstacle[axis]-obstacle[size]/2-margin,max=obstacle[axis]+obstacle[size]/2+margin,delta=b[i]-a[i];
  if(Math.abs(delta)<1e-10){if(a[i]<min||a[i]>max)return null;}
  else{const x=(min-a[i])/delta,y=(max-a[i])/delta;lo=Math.max(lo,Math.min(x,y));hi=Math.min(hi,Math.max(x,y));if(lo>hi)return null;}
 }
 return [a[1]+(b[1]-a[1])*lo,a[1]+(b[1]-a[1])*hi];
}
test('every commercial airborne segment clears the actual skyline in both directions, including Hawaii and the central towers',()=>{
 for(const [from,to]of [['city','island'],['island','city'],['city','north'],['north','city']]){
  const flight=nextRegionalFlight(0,from,to,0),path=regionalFlightPath(flight),clock=regionalFlightTiming(flight);
  for(let leg=5;leg<=8;leg++)for(const building of BUILDINGS){
   const y=crossings(path[leg-1],path[leg],building);if(y)assert.ok(Math.min(...y)>building.h+8,`${from}->${to} leg${leg} clips ${building.id}`);
  }
  for(let at=flight.departure;at<flight.arrival;at+=120){const p=flightPose(at,flight);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));}
  assert.equal(clock.length,path.length);
 }
});
test('pilot planning notices newly constructed high buildings and raises the cruise corridor without rewriting flight records',()=>{
 const flight=nextRegionalFlight(0,'city','island',0),before=regionalFlightPath(flight),saved=structuredClone(flight),tower=BUILDINGS.find(b=>b.id==='burj-khalifa'),height=tower.h;
 try{
  applyUrbanGeometry({roads:[{id:'NAVIGATION-REVISION-TEST',x:1100,z:0,w:1,d:1,stage:'operational'}]});tower.h=450;
  const after=regionalFlightPath(flight);assert.ok(after[6][1]>=510);assert.notEqual(after,before);assert.deepEqual(flight,saved);
 }finally{tower.h=height;applyUrbanGeometry({buildings:[]});}
});
