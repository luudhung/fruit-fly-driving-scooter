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
