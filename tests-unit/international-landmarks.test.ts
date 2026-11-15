import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {InternationalLandmarks} from '../src/international-landmarks.ts';
import {NORTH_BUILDINGS,NORTH_LANDMARK,HAWAII_COTTAGES,BORDER_CUSTOMS_BUILDINGS} from '../worker/country-map.mjs';

test('national premises have one authoritative visual per real building, a 196m Aurora silhouette and bounded static batches',()=>{
 const root=new THREE.Group(),scene=new InternationalLandmarks(root,()=>new THREE.Sprite());
 assert.equal(scene.buildings.size,NORTH_BUILDINGS.length+HAWAII_COTTAGES.length+BORDER_CUSTOMS_BUILDINGS.length);
 let meshes=0,lights=0,dynamic=0;root.traverse(o=>{if(o instanceof THREE.Mesh)meshes++;if(o instanceof THREE.Light)lights++;if(o.userData.dynamicCity)dynamic++;});
 assert.equal(lights,0);assert.equal(dynamic,0);assert.ok(meshes<160,`static draw batches: ${meshes}`);assert.equal(scene.stats.cropRows,48);
 const tower=scene.buildings.get(NORTH_LANDMARK.id)!;root.updateMatrixWorld(true);const box=new THREE.Box3();tower.traverse(o=>{if(o instanceof THREE.Mesh)box.union(new THREE.Box3().setFromObject(o));});
 assert.ok(Math.abs(box.max.y-196)<.001);assert.equal(tower.position.x,NORTH_LANDMARK.x);assert.equal(tower.position.z,NORTH_LANDMARK.z);
 const matrices=new Map<THREE.Object3D,number[]>();root.traverse(o=>matrices.set(o,o.matrixWorld.toArray()));scene.updateLighting(1);scene.updateLighting(0);
 root.updateMatrixWorld(true);root.traverse(o=>assert.deepEqual(o.matrixWorld.toArray(),matrices.get(o),'lighting never moves/recreates fixed national buildings'));
});
