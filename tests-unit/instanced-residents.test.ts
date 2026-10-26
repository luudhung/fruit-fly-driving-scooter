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
