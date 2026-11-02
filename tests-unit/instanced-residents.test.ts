import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {InstancedResidents} from '../src/instanced-residents.ts';
test('500 residents share three meshes and keep a fixed pose when their position changes',()=>{
 const scene=new THREE.Scene(),r=new InstancedResidents(scene,640);
 r.begin();for(let i=0;i<500;i++)r.add(`FLY-${i}`,i,1,0,1);r.finish();
 assert.equal(scene.children.length,3);assert.equal(r.thorax.count,500);assert.equal(r.wings.count,1000);assert.equal(r.flyId(499),'FLY-499');
 const before=new THREE.Matrix4(),after=new THREE.Matrix4();r.wings.getMatrixAt(0,before);
 r.begin();r.add('FLY-0',100,30,200,1);r.finish();r.wings.getMatrixAt(0,after);
 const p=new THREE.Vector3(),q0=new THREE.Quaternion(),q1=new THREE.Quaternion(),s=new THREE.Vector3();
 before.decompose(p,q0,s);after.decompose(p,q1,s);assert.deepEqual(q1,q0);assert.equal(r.flyId(0),'FLY-0');assert.equal(r.thorax.count,1);
 r.begin();r.add('hidden',0,0,0,1,false);r.finish();assert.equal(r.thorax.count,0);assert.equal(r.flyId(0),undefined);
});
test('precomposed resident poses retain every uploaded matrix element across movement and age scales',()=>{
 const r=new InstancedResidents(new THREE.Scene(),640),d=new THREE.Object3D();
 for(const [x,y,z,scale]of [[0,0,0,1],[-102,7,-108,.37],[112.125,29.99,-32.5,1.63],[-1.2,0,2.7,0]]){
  r.begin();r.add('moving',x,y,z,scale);r.finish();
  const expected=()=>new Float32Array(d.matrix.elements);
  d.rotation.set(0,0,0);d.position.set(x,y,z);d.scale.set(scale,.82*scale,1.12*scale);d.updateMatrix();
  assert.deepEqual(r.thorax.instanceMatrix.array.slice(0,16),expected());
  d.position.set(x,y,z+.55*scale);d.scale.set(.88*scale,.74*scale,1.45*scale);d.updateMatrix();
  assert.deepEqual(r.abdomen.instanceMatrix.array.slice(0,16),expected());
  for(let side=0;side<2;side++){
   const sx=side===0?-1:1;d.rotation.set(Math.PI/2.7,0,sx*.72);d.position.set(x+sx*.42*scale,y+.26*scale,z+.06*scale);d.scale.set(1.35*scale,.55*scale,scale);d.updateMatrix();
   assert.deepEqual(r.wings.instanceMatrix.array.slice(side*16,side*16+16),expected());
  }
 }
});
test('unchanged slots skip uploads while visibility, reordered IDs and changed scales remain current',()=>{
 const r=new InstancedResidents(new THREE.Scene(),2),meshes=[r.thorax,r.abdomen,r.wings];
 r.begin();r.add('a',1,2,3,1);r.add('b',4,5,6,1);r.finish();
 const versions=meshes.map(m=>m.instanceMatrix.version);
 r.begin();r.add('new-a',1,2,3,1);r.add('b',4,5,6,1);r.add('overflow',8,8,8,1);r.finish();
 assert.deepEqual(meshes.map(m=>m.instanceMatrix.version),versions);assert.equal(r.flyId(0),'new-a');assert.equal(r.flyId(2),undefined);
 r.begin();r.add('hidden',0,0,0,1,false);r.add('b',4,5,6,.5);r.add('new-a',1,2,3,1);r.finish();
 assert.equal(r.flyId(0),'b');assert.equal(r.flyId(1),'new-a');assert.equal(r.thorax.instanceMatrix.array[0],.5);assert.equal(r.thorax.instanceMatrix.array[12],4);
 assert.ok(meshes.every((m,i)=>m.instanceMatrix.version>versions[i]));
 r.begin();r.finish();assert.equal(r.thorax.count,0);assert.equal(r.wings.count,0);assert.equal(r.flyId(0),undefined);
});
