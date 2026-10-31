import test from 'node:test';import assert from 'node:assert/strict';
import {CityMotion,type MotionPlan} from '../src/city-motion.ts';
const plan=(overrides:Partial<MotionPlan>={}):MotionPlan=>({at:0,speed:4,mode:'walk',points:[{x:40,y:1.1,z:0}],...overrides});
function run(m:CityMotion,seconds:number,fps=60,gameSeconds=0){for(let i=0;i<seconds*fps;i++)m.advance(1/fps,gameSeconds+i/fps*120);}
test('local movement is continuous between snapshots and independent of render frequency',()=>{
 const a=new CityMotion(),b=new CityMotion();for(const m of [a,b])m.accept({x:0,z:0},plan());run(a,2,60);run(b,2,20);
 assert.ok(Math.abs(a.x-8)<1e-6);assert.ok(Math.abs(a.x-b.x)<1e-6);
});
test('future waypoints preserve corners and stale or duplicate snapshots do not rewind movement',()=>{
 const m=new CityMotion();m.accept({x:0,z:0},plan({points:[{x:4,z:0},{x:4,z:20}]}));run(m,2);
 assert.ok(Math.abs(m.x-4)<1e-6&&Math.abs(m.z-4)<1e-6);m.accept({x:0,z:0},plan());assert.ok(m.z>3.9);
 m.accept({x:4,z:2},plan({at:120,points:[{x:4,z:20}]}));assert.ok(m.z>3.9,'reconcile along same route without jumping backward');
});
test('a predicted car stops at a red light and resumes on the same signal cycle as the server',()=>{
 const m=new CityMotion();m.accept({x:110,z:0},plan({mode:'car',speed:14,points:[{x:150,z:0}]}));run(m,2,60,0);assert.ok(m.x<=114.6001);
 run(m,1,60,40*120);assert.ok(m.x>120);
});
test('prediction is bounded when the network stops delivering plans',()=>{
 const m=new CityMotion();m.accept({x:0,z:0},plan());run(m,20);assert.ok(Math.abs(m.x-32)<.001);
});
test('nearby vehicle headway limits local motion without discarding its route',()=>{
 const m=new CityMotion();m.accept({x:0,z:0},plan());for(let i=0;i<60;i++)m.advance(1/60,0,120,from=>Math.max(0,3-from.x));assert.ok(Math.abs(m.x-3)<.001);
 run(m,1);assert.ok(m.x>6.9);
});
