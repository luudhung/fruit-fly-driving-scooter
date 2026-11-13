import test from 'node:test';
import assert from 'node:assert/strict';
import {intersection,subtractRect,subtractRects,unionRects,type Rect} from '../src/surface-rectangles.ts';
const area=(rs:readonly Rect[])=>rs.reduce((n,r)=>n+r.w*r.d,0);
const inside=(r:Rect,x:number,z:number)=>Math.abs(r.x-x)<r.w/2&&Math.abs(r.z-z)<r.d/2;
function disjoint(rs:readonly Rect[]){for(const [i,a]of rs.entries()){assert.ok(a.w>0&&a.d>0);assert.ok(Object.isFrozen(a));for(let j=i+1;j<rs.length;j++)assert.equal(intersection(a,rs[j]),null,JSON.stringify([a,rs[j]]));}}

test('rectangle intersections and four-way subtraction conserve positive area and keep immutable source data',()=>{
 const a=Object.freeze({x:0,z:0,w:10,d:8}),hole=Object.freeze({x:1,z:0,w:4,d:4});assert.deepEqual(intersection(a,hole),hole);
 assert.equal(intersection(a,{x:10,z:0,w:10,d:8}),null);const pieces=subtractRect(a,hole);assert.equal(area(pieces),64);assert.equal(pieces.length,4);disjoint(pieces);assert.ok(Object.isFrozen(pieces));assert.deepEqual(a,{x:0,z:0,w:10,d:8});
 assert.deepEqual(subtractRect(a,{x:0,z:0,w:100,d:100}),[]);assert.deepEqual(subtractRect({x:0,z:0,w:0,d:1},a),[]);assert.deepEqual(unionRects([{x:0,z:0,w:1e-12,d:2}]),[]);
});

test('disjoint unions and subtraction cover exactly the independent integer-cell oracle, regardless of duplicates or order',()=>{
 let seed=81;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},make=(count:number)=>Array.from({length:count},()=>{const left=Math.floor(rng()*24),bottom=Math.floor(rng()*24),w=1+Math.floor(rng()*7),d=1+Math.floor(rng()*7);return Object.freeze({x:left+w/2,z:bottom+d/2,w,d});});
 const source=Object.freeze(make(80)),cuts=Object.freeze(make(20)),union=unionRects(source),difference=subtractRects(source,cuts);disjoint(union);disjoint(difference);let unionArea=0,differenceArea=0;
 for(let x=0;x<32;x++)for(let z=0;z<32;z++){const included=source.some(r=>inside(r,x+.5,z+.5)),removed=cuts.some(r=>inside(r,x+.5,z+.5));assert.equal(union.some(r=>inside(r,x+.5,z+.5)),included);assert.equal(difference.some(r=>inside(r,x+.5,z+.5)),included&&!removed);if(included)unionArea++;if(included&&!removed)differenceArea++;}
 assert.equal(area(union),unionArea);assert.equal(area(difference),differenceArea);assert.deepEqual(unionRects([...source].reverse().concat(source)),union);assert.deepEqual(subtractRects([...source].reverse(),[...cuts].reverse()),difference);assert.deepEqual(unionRects(union),union);
});

test('touching decimal edges do not create positive-area cracks, duplicate slivers or invalid rectangles',()=>{
 const r=[{x:-436.3,z:-695,w:2.6,d:580},{x:-738.8,z:-406.55,w:602.4,d:2.6},{x:-436.3,z:-695,w:2.6,d:580}],u=unionRects(r);disjoint(u);assert.deepEqual(unionRects(u),u);assert.ok(Math.abs(area(u)-(2.6*580+602.4*2.6))<1e-7);
 assert.deepEqual(unionRects([{x:0,z:0,w:NaN,d:1},{x:0,z:0,w:1,d:Infinity},{x:0,z:0,w:-1,d:1}]),[]);
});
