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
 await tick({gameSeconds:120,syncBrain:false,serialized:true});assert.ok(s.utilities.powerPlant.demand<Object.values(s.housing.households).filter(h=>h.members.some(id=>s.flies.some(f=>f.id===id&&f.alive))).length*8,`stale demand ${s.utilities.powerPlant.demand}`);
 assert.ok(s.utilities.householdAccounts['retired-1'],'preserve historical accounts');
});

test('headway ignores perpendicular traffic and vehicles waiting to turn across another lane',()=>{
 const east={id:'east',alive:true,traveling:true,transitMode:'car',x:0,z:0,targetX:30,targetZ:0};
 const north={...east,id:'north',x:4,z:1,targetX:4,targetZ:30};
 const atTurn={...north,id:'turn',targetX:4,targetZ:1};
 assert.equal(createVehicleIndex([east,north,atTurn])(east,{x:12,z:0}),12);
 assert.equal(createVehicleIndex([east,{...north,targetX:30,targetZ:1}])(east,{x:12,z:0}),0,'same-direction leader still protects its queue');
});

test('cars clear a dense junction cluster instead of finding another red line inside it',()=>{
 const approach=signalBarrier({x:-112,z:0},{x:-80,z:0},0);assert.ok(approach);assert.ok(Math.abs(approach.distance-2.6)<.01);
 assert.equal(signalBarrier({x:-99,z:0},{x:-78,z:0},0),null,'already inside the combined -102/-92 junction');
});
test('a blocked junction holds new arrivals outside, then releases them as the occupant drains',()=>{
 const follower={id:'follower',alive:true,traveling:true,transitMode:'car',x:110,z:1.5,y:1.1,targetX:170,targetZ:1.5};
 const leader={...follower,id:'leader',x:125};let index=createVehicleIndex([follower,leader]);
 assert.ok(Math.abs(index(follower,{x:130,z:1.5})-4.6)<.01,'wait at the stop line instead of blocking the box');
 assert.equal(index(leader,{x:145,z:1.5}),20,'a current occupant is free to leave');
 leader.x=150;index=createVehicleIndex([follower,leader]);assert.equal(index(follower,{x:130,z:1.5}),20,'clear receiving space releases the next vehicle');
});
test('crossing occupants drain, while an upper deck and tunnel never form false queues',()=>{
 const f={id:'f',alive:true,traveling:true,transitMode:'car',x:110,z:1.5,y:1.1,targetX:170,targetZ:1.5},cross={...f,id:'cross',x:122,z:2,targetX:122,targetZ:-30};
 const index=createVehicleIndex([f,cross]);assert.ok(index(f,{x:130,z:1.5})<5);assert.equal(index(cross,{x:122,z:-18}),20);
 const below={...f,id:'below',x:118,y:-5.1};assert.equal(createVehicleIndex([f,below])(f,{x:130,z:1.5}),20);
});
test('only explicit emergency vehicles can bypass a red light',()=>{
 assert.ok(signalBarrier({x:110,z:1.5},{x:140,z:1.5},0));
 assert.equal(signalBarrier({x:110,z:1.5,emergency:true},{x:140,z:1.5},0),null);
});

test('opposing lanes may enter and leave the same junction without circular gridlock',()=>{
 const east={id:'east',alive:true,traveling:true,transitMode:'car',x:110,z:1.5,y:1.1,targetX:170,targetZ:1.5};
 const west={...east,id:'west',x:125,z:-1.5,targetX:80,targetZ:-1.5};
 assert.equal(createVehicleIndex([east,west])(east,{x:130,z:1.5}),20);
});

test('legacy co-located same-direction cars separate using deterministic departure priority',()=>{
 const a={id:'a',alive:true,traveling:true,transitMode:'car',x:0,z:1000,targetX:30,targetZ:1000},b={...a,id:'b'};
 const index=createVehicleIndex([a,b]);assert.equal(index(a,{x:12,z:1000}),12);assert.equal(index(b,{x:12,z:1000}),0);
 a.x=12;assert.equal(createVehicleIndex([a,b])(b,{x:12,z:1000}),7);
});
test('same-direction traffic on a separate parallel lane does not block a junction',()=>{
 const a={id:'a',alive:true,traveling:true,transitMode:'car',x:110,z:1.5,targetX:170,targetZ:1.5};
 const b={...a,id:'b',x:125,z:-1.5};
 assert.equal(createVehicleIndex([a,b])(a,{x:130,z:1.5}),20);
});
test('shallow merging paths choose one leader without weakening an ordinary lane queue',()=>{
 const a={id:'a',alive:true,traveling:true,transitMode:'car',x:0,z:1000,targetX:10,targetZ:998};
 const b={...a,id:'b',z:999,targetZ:1001};const index=createVehicleIndex([a,b]);
 assert.ok(index(a,{x:10,z:998})>10);assert.equal(index(b,{x:10,z:1001}),0);
 const leader={...a,id:'leader',x:3,z:999.4};assert.equal(createVehicleIndex([a,leader])(a,{x:10,z:998}),0);
});

 test('cars and long freight trucks preserve bumper clearance using their actual lengths',()=>{
 const truck={id:'truck',alive:true,traveling:true,transitMode:'car',vehicleLength:6.4,x:0,z:1000,targetX:30,targetZ:1000},leader={...truck,id:'leader',x:8};
 assert.ok(Math.abs(createVehicleIndex([truck,leader])(truck,{x:20,z:1000})-.6)<1e-9);
 const car={...truck,id:'car',vehicleLength:4};assert.ok(Math.abs(createVehicleIndex([car,leader])(car,{x:20,z:1000})-1.8)<1e-9);
 assert.equal(createVehicleIndex([truck,{...leader,targetX:-30}])(truck,{x:20,z:1000}),20);
 });

test('signals belong to the actual crossing road centers, preserving genuinely close avenues',async()=>{
 const{ROADS}=await import('../worker/city-map.mjs');
 for(const p of INTERSECTIONS){
  assert.ok(ROADS.some(r=>r.d>r.w&&r.x===p.x&&Math.abs(r.z-p.z)<=r.d/2+.001),`no north-south center at ${p.id}`);
  assert.ok(ROADS.some(r=>r.w>=r.d&&r.z===p.z&&Math.abs(r.x-p.x)<=r.w/2+.001),`no east-west center at ${p.id}`);
 }
 for(const z of [-1060,-1000,-950,-890,-830,-770,-710,-650,-600]){
  assert.ok(INTERSECTIONS.some(p=>p.x===-20&&p.z===z));assert.ok(!INTERSECTIONS.some(p=>p.x===-24&&p.z===z));
 }
 for(const x of [-102,-92])assert.ok(INTERSECTIONS.some(p=>p.x===x&&p.z===29));
});
