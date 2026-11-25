import test from 'node:test';
import assert from 'node:assert/strict';
import {projectLocalDocument,diffLocalDocument,applyLocalDelta,localDocumentState} from '../worker/local-host-delta.mjs';
const state=()=>({worldId:'W',mapVersion:36,simulationAgeSeconds:100,timeScale:120,locations:[{id:'never-transfer'}],flies:[{id:'A',alive:true,x:0,z:0,health:100,money:10,brain:{id:'B',weights:Array.from({length:20000},(_,i)=>i/20000),dynamic:{reward:0}}}]});
test('five-second changes preserve private brain arrays and send only changed fields',()=>{
 const a=projectLocalDocument(state()),b=structuredClone(a);b.world.simulationAgeSeconds+=600;b.actors.A.x=7;b.actors.A.money=12;b.actors.A.brain.dynamic.reward=.3;
 const patch=diffLocalDocument(a,b),next=applyLocalDelta(a,patch);
 assert.deepEqual(next,b);assert.equal(next.actors.A.brain.weights,a.actors.A.brain.weights);
 assert.ok(JSON.stringify(patch).length<500);assert.ok(!('locations'in next.world));
 assert.equal(a.actors.A.x,0);assert.equal(a.world.simulationAgeSeconds,100);
});
test('births, deaths, null values, field deletion and changed arrays survive JSON transport',()=>{
 const a=projectLocalDocument(state()),b=structuredClone(a);b.actors.A.alive=false;b.actors.A.health=0;b.actors.A.partner=null;delete b.actors.A.money;
 b.actors.C={id:'C',alive:true,x:3,z:4,health:100,brain:{id:'BC',parents:['B']}};b.world.events=[{id:'death-A'}];
 const next=applyLocalDelta(a,JSON.parse(JSON.stringify(diffLocalDocument(a,b))));assert.deepEqual(next,b);
 assert.equal(localDocumentState(next).flies.length,2);
 assert.notEqual(diffLocalDocument({world:{x:[]},actors:{}},{world:{x:Array(1)},actors:{}}),null);
});
test('malformed/prototype-mutating deltas are rejected without touching the agreed base',()=>{
 const a=projectLocalDocument(state());
 assert.throws(()=>applyLocalDelta(a,[1,[['__proto__',[0,{polluted:true}]]],[]]),/unsafe/);
 assert.throws(()=>applyLocalDelta(a,[1,[['actors',[0,{WRONG:{id:'A'}}]]],[]]),/actor dictionary/);
 assert.equal({}.polluted,undefined);assert.equal(a.actors.A.alive,true);
});

test('changing a nested visitor in a saved tour patches its array index and preserves every other brain and transaction',()=>{
 const a=projectLocalDocument(state());
 a.world.previousTours=[{id:'TOUR',guests:Array.from({length:100},(_,i)=>({id:`VIS-${i}`,money:200+i,brain:{id:`VB-${i}`,weights:Array.from({length:1000},(_,j)=>j/1000)},position:{x:i,z:2},receipts:[{id:`PAID-${i}`,amount:50}]}))}];
 const b=structuredClone(a);b.world.previousTours[0].guests[19].position.x=44;b.world.previousTours[0].guests[19].money-=50;b.world.previousTours[0].guests[19].receipts.push({id:'AIRFARE-19',amount:50});
 const patch=diffLocalDocument(a,b),wire=JSON.parse(JSON.stringify(patch)),next=applyLocalDelta(a,wire);
 assert.deepEqual(next,b);assert.ok(JSON.stringify(patch).length<500);assert.equal(next.world.previousTours[0].guests[19].brain,a.world.previousTours[0].guests[19].brain);assert.equal(next.world.previousTours[0].guests[18],a.world.previousTours[0].guests[18]);
 assert.equal(a.world.previousTours[0].guests[19].money,219);assert.equal(a.world.previousTours[0].guests[19].receipts.length,1);
});

test('indexed arrays support trim, append, insertion, reorder and nested array edits across JSON transport',()=>{
 const a={world:{items:[{id:'a',values:[1,2,3]},{id:'b',values:[4,5]},{id:'c',values:[]}]},actors:{}};
 for(const items of [[],a.world.items.slice(0,2),[...a.world.items,{id:'d',values:[6]}],[{id:'new',values:[8]},...a.world.items],[a.world.items[2],a.world.items[0],a.world.items[1]],[{id:'a',values:[1,9,3]},a.world.items[1],a.world.items[2]]]){
  const b={world:{items},actors:{}},patch=JSON.parse(JSON.stringify(diffLocalDocument(a,b))),next=applyLocalDelta(a,patch);
  assert.deepEqual(next,b);assert.equal(a.world.items.length,3);assert.deepEqual(a.world.items[0].values,[1,2,3]);
 }
 assert.deepEqual(applyLocalDelta(a,[1,[['world',[1,[['items',[0,[{id:'legacy'}]]]],[]]]],[]]),{world:{items:[{id:'legacy'}]},actors:{}},'old whole-array replacement patches remain valid');
});

test('array opcodes reject holes, duplicate or invalid indices, excessive lengths and recursive patches without mutating the base',()=>{
 const base={world:{items:[{n:1},{n:2}]},actors:{}},wrap=p=>[1,[['world',[1,[['items',p]],[]]]],[]];
 for(const bad of [[2,-1,[]],[2,2.5,[]],[2,500001,[]],[2,3,[]],[2,3,[[2,null]]],[2,4,[[3,[0,4]]]],
  [2,2,[[0,[0,1]],[0,[0,2]]]],[2,2,[[-1,[0,1]]]],[2,2,[[2,[0,1]]]],[2,2,[[.5,[0,1]]]],[2,2,[['__proto__',[0,{}]]]],[2,2,[[1]]],[2,2,[[1,[2,0,[]]]]]])assert.throws(()=>applyLocalDelta(base,wrap(bad)),/array/);
 let deep=[0,1];for(let i=0;i<70;i++)deep=[2,1,[[0,deep]]];let nested=1;for(let i=0;i<70;i++)nested=[nested];
 assert.throws(()=>applyLocalDelta({world:{items:nested},actors:{}},wrap(deep)),/structural bounds/);
 assert.deepEqual(base,{world:{items:[{n:1},{n:2}]},actors:{}});assert.equal({}.polluted,undefined);
});

test('preexisting arrays above the indexed length cap retain legacy replacement compatibility',()=>{
 const a={world:{values:Array(500001).fill(0)},actors:{}},b=structuredClone(a);b.world.values[500000]=9;
 const patch=diffLocalDocument(a,b),worldPatch=patch[1].find(([key])=>key==='world')[1],arrayPatch=worldPatch[1].find(([key])=>key==='values')[1];
 assert.equal(arrayPatch[0],0);assert.deepEqual(applyLocalDelta(a,JSON.parse(JSON.stringify(patch))),b);assert.equal(a.world.values[500000],0);
});
