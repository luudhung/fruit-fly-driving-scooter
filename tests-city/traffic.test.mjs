import test from 'node:test';import assert from 'node:assert/strict';
import {signalState,signalBarrier,INTERSECTIONS,createVehicleIndex} from '../worker/traffic.mjs';
import {freshState,moveFly,getState,tick} from '../worker/civilization-engine.mjs';

test('signals share non-overlapping green windows and real map junctions',()=>{
 for(let t=-60;t<120;t+=.5)assert.ok(!(signalState(t,'ns')==='green'&&signalState(t,'ew')==='green'));
 assert.ok(INTERSECTIONS.some(j=>j.x===122&&j.z===0));assert.ok(!INTERSECTIONS.some(j=>j.x===106&&j.z===0));
 assert.equal(signalState(25,'ns'),'yellow');assert.equal(signalState(55,'ew'),'yellow');
});
test('a long segment stops before the first red stop line regardless of its waypoint',()=>{
 const b=signalBarrier({x:80,z:0},{x:150,z:0},0);assert.ok(b);assert.equal(b.x,122);assert.ok(Math.abs(b.distance-34.6)<.001);
 assert.equal(signalBarrier({x:110,z:0},{x:150,z:0},40),null);
 assert.equal(signalBarrier({x:120,z:0},{x:126,z:0},0),null,'cars inside clear the intersection');
 const waiting=signalBarrier({x:114.6,z:0},{x:120,z:0},0);assert.ok(waiting&&waiting.distance<.001);
});
test('a real car cannot leap a red signal and resumes on green',()=>{
 const s=freshState(),f=s.flies[0];s.simulationAgeSeconds=0;s.weather={condition:'clear',precipitation:0,wind:0};
 Object.assign(f,{x:110,z:0,targetX:150,targetZ:0,traveling:true,transitMode:'car',energy:100,alive:true,health:100});
 f.brain.driving={style:'careful',qSafe:0,qReckless:0};
 for(let i=0;i<5;i++)moveFly(f);assert.ok(f.x<=114.60001,`crossed at ${f.x}`);assert.equal(f.trafficStatus,'waiting at red light');
 s.simulationAgeSeconds=40*120;moveFly(f);assert.ok(f.x>114.6);
});
test('headway stops followers while leaving the opposite direction independent',()=>{
 const a={id:'a',alive:true,traveling:true,transitMode:'car',x:0,z:0,targetX:30,targetZ:0},b={...a,id:'b',x:8};
 assert.equal(createVehicleIndex([a,b])(a,{x:20,z:0}),3);
 assert.equal(createVehicleIndex([a,{...b,targetX:-30}])(a,{x:20,z:0}),20);
});
test('observer projection keeps census, positions and selected brain while omitting other heavy details',()=>{
 const s=freshState(),selected=s.flies[0].id,full=getState(),observer=getState({observer:true,selectedId:selected});
 assert.equal(observer.flies.length,full.flies.length);assert.ok(observer.flies[0].brainId);assert.equal(observer.flies[1].brainDynamic,undefined);
 for(const f of observer.flies)assert.ok(Number.isFinite(f.money)&&Number.isFinite(f.x));
 assert.ok(JSON.stringify(observer).length<JSON.stringify(full).length*.75);
});
test('obsolete electric accounts do not increase active city power demand',async()=>{
 const s=freshState();for(let i=0;i<1000;i++)s.utilities.householdAccounts[`retired-${i}`]={powerOn:true};
 await tick({gameSeconds:120,syncBrain:false,serialized:true});assert.ok(s.utilities.powerPlant.demand<1000,`stale demand ${s.utilities.powerPlant.demand}`);
 assert.ok(s.utilities.householdAccounts['retired-1'],'preserve historical accounts');
});
