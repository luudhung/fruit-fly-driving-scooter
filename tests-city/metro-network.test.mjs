import test from 'node:test';
import assert from 'node:assert/strict';
import {METRO_LINES,metroTrackPoints,metroStationGeometry,trainStates,trainById,metroServiceBetween,BUILDINGS} from '../worker/city-map.mjs';

test('every logical line operates two distinct physical trains in opposite directions on separated tracks',()=>{
 for(const line of METRO_LINES){
  const forward=metroTrackPoints(line,1),reverse=metroTrackPoints(line,-1);
  for(let i=0;i<forward.length;i++)assert.ok(Math.hypot(forward[i].x-reverse[i].x,forward[i].z-reverse[i].z)>=4.39);
  for(let seconds=0;seconds<900;seconds+=.5){const [a,b]=trainStates(line,seconds);assert.notEqual(a.id,b.id);assert.equal(a.direction,1,'A remains the outbound service across every dispatch');assert.equal(b.direction,-1,'B remains the inbound service across every dispatch');for(const t of[a,b]){assert.ok([t.x,t.y,t.z].every(Number.isFinite));assert.deepEqual(trainById(line,seconds,t.id),t);}}
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

test('different-height lines reserve separate clear ground switchback footprints',()=>{
 const accesses=METRO_LINES.flatMap(line=>line.points.map((_,index)=>{const geo=metroStationGeometry(line,index),stairs=geo.sharedStairs.slice(0,4),xs=stairs.map(p=>p.x),zs=stairs.map(p=>p.z);return{line:line.id,index,geo,minX:Math.min(...xs)-.77,maxX:Math.max(...xs)+.77,minZ:Math.min(...zs)-.77,maxZ:Math.max(...zs)+.77};}));
 for(let i=0;i<accesses.length;i++)for(let j=i+1;j<accesses.length;j++){const a=accesses[i],b=accesses[j];if(a.line===b.line)continue;assert.ok(!(a.minX<b.maxX&&a.maxX>b.minX&&a.minZ<b.maxZ&&a.maxZ>b.minZ),`${a.line}/${a.index} overlaps ${b.line}/${b.index}`);}
 const m6=accesses.find(a=>a.line==='M6'&&a.index===0),m7=accesses.find(a=>a.line==='M7'&&a.index===2);assert.ok(m6&&m7);assert.equal(m6.geo.accessViolations,0);assert.equal(m7.geo.accessViolations,0);assert.ok(Math.hypot(m6.geo.access.x-m7.geo.access.x,m6.geo.access.z-m7.geo.access.z)>30);
});

test('upper station approaches remain beside stair flights and clear building solids',()=>{
 for(const line of METRO_LINES)for(let index=0;index<line.points.length;index++){
  const path=metroStationGeometry(line,index).sharedStairs;
  assert.ok(path.length>=7,'an upper side approach must not cut diagonally over both flights');
  for(let k=1;k<path.length;k++){
   const a=path[k-1],b=path[k],length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(length/.5));
   for(let j=0;j<=steps;j++){
    const t=j/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,feet=a.y+(b.y-a.y)*t-.9;
    assert.ok(!BUILDINGS.some(r=>Math.abs(x-r.x)<r.w/2+.45&&Math.abs(z-r.z)<r.d/2+.45&&feet<r.h),`${line.id}/${index}/${k} intersects a building`);
   }
  }
 }
});

test('all platform decks clear both rail envelopes and corner platforms fit existing facades',()=>{
 for(const line of METRO_LINES)for(let index=0;index<line.points.length;index++)for(const direction of [1,-1]){
  const geo=metroStationGeometry(line,index,direction),w=geo.axis==='x'?geo.platformLength:3.2,d=geo.axis==='x'?3.2:geo.platformLength;
  assert.ok(!BUILDINGS.some(b=>geo.platform.y-.9<b.h&&Math.abs(geo.platform.x-b.x)<(w+b.w)/2+.1&&Math.abs(geo.platform.z-b.z)<(d+b.d)/2+.1),`${line.id}/${index}/${direction} platform crosses a facade`);
  for(const trackDirection of [1,-1]){
   const track=metroTrackPoints(line,trackDirection);
   for(let k=1;k<track.length;k++){
    const a=track[k-1],b=track[k],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.5));
    for(let j=0;j<=steps;j++){const t=j/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,clearance=Math.hypot(Math.max(0,Math.abs(x-geo.platform.x)-w/2),Math.max(0,Math.abs(z-geo.platform.z)-d/2));assert.ok(clearance>=1.63,`${line.id}/${index}/${direction} platform obstructs rail ${trackDirection}`);}
   }
  }
 }
 const corner=metroStationGeometry(METRO_LINES.find(l=>l.id==='M7'),5,-1);assert.equal(corner.platformLength,4);
});
