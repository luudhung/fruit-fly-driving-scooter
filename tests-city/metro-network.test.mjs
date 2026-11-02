import test from 'node:test';
import assert from 'node:assert/strict';
import {METRO_LINES,metroTrackPoints,metroStationGeometry,trainStates,trainById,metroServiceBetween} from '../worker/city-map.mjs';

test('every logical line operates two distinct physical trains in opposite directions on separated tracks',()=>{
 for(const line of METRO_LINES){
  const forward=metroTrackPoints(line,1),reverse=metroTrackPoints(line,-1);
  for(let i=0;i<forward.length;i++)assert.ok(Math.hypot(forward[i].x-reverse[i].x,forward[i].z-reverse[i].z)>=4.39);
  for(let seconds=0;seconds<900;seconds+=.5){const [a,b]=trainStates(line,seconds);assert.notEqual(a.id,b.id);assert.equal(a.direction,-b.direction);for(const t of[a,b]){assert.ok([t.x,t.y,t.z].every(Number.isFinite));assert.deepEqual(trainById(line,seconds,t.id),t);}}
 }
});

test('both platforms have clearance from their track and share a real sidewalk access and above-train crossover',()=>{
 for(const line of METRO_LINES)for(let i=0;i<line.points.length;i++){
  const [a,b]=[1,-1].map(d=>metroStationGeometry(line,i,d));assert.deepEqual(a.access,b.access);assert.equal(a.accessViolations,0);assert.equal(b.accessViolations,0);
  assert.ok(Math.hypot(a.platform.x-b.platform.x,a.platform.z-b.platform.z)>10);
  for(const g of[a,b]){assert.deepEqual(g.stairs.at(-1),g.platform);assert.ok(Math.hypot(g.track.x-g.platform.x,g.track.z-g.platform.z)>3.3);if(g.crossover.length)assert.ok(g.crossover.slice(1,-1).every(p=>p.y>=line.height+4));}
 }
});

test('coarse-time service query returns an actual boardable visit for every valid direction at each stop',()=>{
 for(const line of METRO_LINES)for(const direction of[1,-1])for(let station=direction===1?0:1;station<(direction===1?line.points.length-1:line.points.length);station++){
  const visit=metroServiceBetween(line,1,1000,{stationIndex:station,direction});assert.ok(visit,`${line.id}/${station}/${direction}`);assert.equal(visit.from,station);assert.equal(visit.direction,direction);assert.ok(visit.dwelling);assert.ok(visit.at>1&&visit.at<=1000);assert.ok(trainById(line,visit.at,visit.id).dwelling);
 }
});
