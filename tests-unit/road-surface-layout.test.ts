import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRoadSurfaceLayout,type SurfaceRoad} from '../src/road-surface-layout.ts';
import {intersection,type Rect} from '../src/surface-rectangles.ts';
import {ROADS,AIRPORT} from '../worker/city-map.mjs';
import {surfaceRoadPieces} from '../src/road-infrastructure.ts';
const area=(rs:readonly Rect[])=>rs.reduce((n,r)=>n+r.w*r.d,0);
function clear(a:readonly Rect[],b:readonly Rect[]){for(const r of a)for(const s of b)assert.equal(intersection(r,s),null,JSON.stringify([r,s]));}
function disjoint(rs:readonly Rect[]){for(let i=0;i<rs.length;i++){const a=rs[i];assert.ok(a.w>0&&a.d>0);assert.ok(Object.isFrozen(a));for(let j=i+1;j<rs.length;j++){const b=rs[j];if(b.x-b.w/2>=a.x+a.w/2+1e-8)break;assert.equal(intersection(a,b),null,JSON.stringify([a,b]));}}}
/** Independent compressed-cell coverage oracle; production uses an interval sweep instead. */
function gridUnionArea(roads:readonly Rect[]){
 const xs=[...new Set(roads.flatMap(r=>[r.x-r.w/2,r.x+r.w/2]))].sort((a,b)=>a-b),zs=[...new Set(roads.flatMap(r=>[r.z-r.d/2,r.z+r.d/2]))].sort((a,b)=>a-b),xi=new Map(xs.map((x,i)=>[x,i])),zi=new Map(zs.map((z,i)=>[z,i])),stride=zs.length,grid=new Int16Array(xs.length*stride);
 for(const r of roads){const l=xi.get(r.x-r.w/2)!,h=xi.get(r.x+r.w/2)!,b=zi.get(r.z-r.d/2)!,t=zi.get(r.z+r.d/2)!;grid[l*stride+b]++;grid[h*stride+b]--;grid[l*stride+t]--;grid[h*stride+t]++;}
 let result=0;for(let x=0;x<xs.length;x++)for(let z=0;z<zs.length;z++){const i=x*stride+z;grid[i]+=(x?grid[i-stride]:0)+(z?grid[i-1]:0)-(x&&z?grid[i-stride-1]:0);if(x+1<xs.length&&z+1<zs.length&&grid[i]>0)result+=(xs[x+1]-xs[x])*(zs[z+1]-zs[z]);}return result;
}

test('crossing streets have one asphalt surface and sidewalks and markings clear the complete intersection',()=>{
 const roads=Object.freeze([{x:0,z:0,w:60,d:10,axis:'x' as const},{x:0,z:0,w:10,d:60,axis:'z' as const}].map(r=>Object.freeze(r))),l=buildRoadSurfaceLayout(roads);assert.equal(area(l.asphalt),1100);clear(l.sidewalks,roads);clear(l.markings,[{x:0,z:0,w:12.4,d:12.4}]);for(const layer of Object.values(l))disjoint(layer);assert.deepEqual(buildRoadSurfaceLayout([...roads].reverse()),l);
});

test('duplicate -430 roads and close parallel avenues never bury another lane under raised sidewalks',()=>{
 const roads=Object.freeze([{x:-430,z:0,w:12,d:100},{x:-430,z:0,w:12,d:100},{x:-102,z:0,w:12,d:100},{x:-92,z:0,w:12,d:100}].map(r=>Object.freeze(r))),l=buildRoadSurfaceLayout(roads);assert.equal(area(l.asphalt),3400);clear(l.sidewalks,roads);for(const layer of Object.values(l))disjoint(layer);
 const separate=buildRoadSurfaceLayout([{x:-102,z:0,w:9,d:100}],{allRoads:[{x:-92,z:0,w:12,d:100}]});clear(separate.sidewalks,[{x:-92,z:0,w:12,d:100}]);assert.equal(area(l.asphalt),gridUnionArea(roads));
});

test('dead ends and short clipped tunnel pieces get no along-road overshoot, even when shorter than the street width',()=>{
 for(const road of [{x:0,z:0,w:10,d:4,axis:'z' as const},{x:0,z:0,w:4,d:10,axis:'x' as const}]){
  const l=buildRoadSurfaceLayout([road]);for(const r of [...l.foundations,...l.asphalt,...l.sidewalks,...l.markings])if(road.axis==='z')assert.ok(r.z-r.d/2>=-2&&r.z+r.d/2<=2);else assert.ok(r.x-r.w/2>=-2&&r.x+r.w/2<=2);
 }
});

test('airport and water exclusions clip every layer, including markings and sidewalk caps',()=>{
 const holes=[{x:AIRPORT.terminal.x,z:AIRPORT.terminal.z,w:70,d:35},{x:-180,z:-520,w:320,d:30}],roads=[{x:-180,z:-440,w:12,d:220,axis:'z' as const},{x:-180,z:-390,w:150,d:10,axis:'x' as const}],l=buildRoadSurfaceLayout(roads,{exclusions:holes});for(const layer of Object.values(l)){clear(layer,holes);disjoint(layer);}assert.ok(area(l.asphalt)<gridUnionArea(roads));assert.ok(Object.isFrozen(l));
});

test('the complete current city has exact union area, disjoint layers and no sidewalks across any logical asphalt',()=>{
 const inputs:SurfaceRoad[]=ROADS.filter(r=>!r.motorway&&!r.motorwayAccess).flatMap(r=>surfaceRoadPieces(r).map(p=>({...p,axis:r.w>=r.d?'x' as const:'z' as const}))),before=JSON.stringify(ROADS),l=buildRoadSurfaceLayout(inputs,{allRoads:ROADS});assert.ok(Math.abs(area(l.asphalt)-gridUnionArea(inputs))<1e-5);for(const layer of Object.values(l)){disjoint(layer);assert.ok(Object.isFrozen(layer));}clear(l.sidewalks,ROADS);assert.equal(JSON.stringify(ROADS),before);assert.deepEqual(buildRoadSurfaceLayout([...inputs].reverse(),{allRoads:[...ROADS].reverse()}),l);
});
