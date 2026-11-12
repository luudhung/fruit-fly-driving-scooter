import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SceneViewBudget,selectViewBudget} from '../src/view-budget.ts';
import {PersonalCars} from '../src/personal-cars.ts';
import {batchStaticBoxes} from '../src/static-box-batches.ts';

function camera(x=0,z=0,targetZ=-100){const c=new THREE.PerspectiveCamera(70,1,.1,2000);c.position.set(x,2,z);c.lookAt(x,2,targetZ);c.updateMatrixWorld();return c;}
test('view interests exclude distant/behind actors while hysteresis retains a boundary actor',()=>{
 const view=new SceneViewBudget({enterDistance:100,leaveDistance:120,frustumMargin:1,retainedMargin:4});view.setCamera(camera());
 assert.equal(view.visible({x:0,y:2,z:-90}),true);assert.equal(view.visible({x:0,y:2,z:30}),false);
 assert.equal(view.visible({x:0,y:2,z:-110}),false);assert.equal(view.visible({x:0,y:2,z:-110},true),true);
 assert.equal(view.visible({x:0,y:2,z:-125},true),false);
 assert.equal(view.visible({x:0,y:2,z:-125},false,30),true,'a visible tall/wide bound can intersect the range');
});
test('selection retains complete source data and bounds dense visible candidates deterministically',()=>{
 const view=new SceneViewBudget();view.setCamera(camera());
 const items=Array.from({length:1000},(_,i)=>({id:String(i),x:i%7,y:2,z:-40-Math.floor(i/7)})),original=JSON.stringify(items);
 const first=selectViewBudget(items,view,p=>p,p=>p.id,new Set(),24);
 assert.equal(first.length,24);assert.equal(JSON.stringify(items),original);
 const second=selectViewBudget([...items].reverse(),view,p=>p,p=>p.id,new Set(first.map(p=>p.id)),24);
 assert.deepEqual(second.map(p=>p.id),first.map(p=>p.id));
});
const driver=(id:string,x:number,z:number)=>({id,alive:true,vehicle:'car',x,y:1.1,z,vx:0,vz:0,traveling:false,transitMode:'walk',parkedCar:{x,z,heading:0}});
test('vehicle streaming creates a bounded gradual cache, actually releases a distant view, and pools reused visuals',()=>{
 const scene=new THREE.Scene(),renderer=new PersonalCars(scene),c=camera();renderer.setView(c);
 const actors=Array.from({length:700},(_,i)=>driver(`FLY-${i}`,i%12-6,-45-Math.floor(i/12)*2)),before=JSON.stringify(actors);
 renderer.sync(actors);renderer.update(1/60);assert.equal(renderer.stats.cached,12);
 for(let i=0;i<14;i++)renderer.update(.13);
 assert.equal(renderer.stats.cached,120);assert.equal(renderer.stats.bodies,120);assert.equal(JSON.stringify(actors),before);
 const created=renderer.stats.created;c.position.x=2000;c.lookAt(2000,2,-100);renderer.update(.13);
 assert.equal(renderer.stats.cached,0);assert.equal(renderer.stats.bodies,0);assert.equal(renderer.stats.wheels,0);
 c.position.x=0;c.lookAt(0,2,-100);renderer.update(.13);assert.equal(renderer.stats.cached,12);assert.equal(renderer.stats.created,created);assert.ok(renderer.stats.reused>=12);
});
test('near vehicles keep full detail while mid/far vehicles omit wheel and cabin geometry',()=>{
 const renderer=new PersonalCars(new THREE.Scene());renderer.setView(camera());
 renderer.sync([driver('FLY-1',0,-40),driver('FLY-2',0,-180),driver('FLY-3',0,-390),driver('FLY-4',0,-800),driver('FLY-5',0,80)]);
 renderer.update(.13);
 assert.deepEqual({body:renderer.stats.bodies,cabin:renderer.stats.cabins,wheel:renderer.stats.wheels},{body:3,cabin:2,wheel:4});
 assert.equal(renderer.stats.triangles,108);
});

test('spatial infrastructure batches preserve all transforms while giving distant cells separate cullable bounds',()=>{
 const group=new THREE.Group(),material=new THREE.MeshBasicMaterial();
 for(const x of [0,500]){const m=new THREE.Mesh(new THREE.BoxGeometry(4,2,6),material);m.position.set(x,8,20);group.add(m);}
 const batches=batchStaticBoxes(group,160);assert.equal(batches.length,2);assert.ok(batches.every(m=>m.count===1&&m.frustumCulled&&m.boundingSphere!.radius<10));
 const matrix=new THREE.Matrix4();batches[1].getMatrixAt(0,matrix);assert.equal(matrix.elements[12],500);assert.equal(matrix.elements[13],8);assert.equal(matrix.elements[0],4);assert.equal(matrix.elements[5],2);assert.equal(matrix.elements[10],6);
});
