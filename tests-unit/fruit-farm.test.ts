import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildFruitFarm} from '../src/fruit-farm.ts';
import {HANSDREX_FRUIT_FARM as FARM} from '../worker/fruit-farm-map.mjs';

test('fruit orchard stays in shared immutable batches with an open east gate and a separately repairable packing house',()=>{
 const parent=new THREE.Group(),farm=buildFruitFarm(parent,()=>new THREE.Sprite());parent.updateMatrixWorld(true);
 let draws=0,lights=0,trees=0;parent.traverse(o=>{if(o instanceof THREE.Mesh)draws++;if(o instanceof THREE.Light)lights++;if(o instanceof THREE.InstancedMesh&&o.geometry instanceof THREE.CylinderGeometry)trees+=o.count;});
 assert.equal(lights,0);assert.equal(trees,100);assert.ok(draws<=14,`draw batches ${draws}`);
 assert.ok(farm.buildings.has(FARM.packingHouse.id));
 const meshes:THREE.Object3D[]=[];farm.root.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
 const ray=new THREE.Raycaster(new THREE.Vector3(1050,1.1,FARM.gate.z),new THREE.Vector3(-1,0,0),0,20);assert.equal(ray.intersectObjects(meshes,false).length,0,'service aisle and orchard gate have no blocking decorative fence');
 const packing=farm.buildings.get(FARM.packingHouse.id)!;const roofRay=new THREE.Raycaster(new THREE.Vector3(FARM.packingHouse.x,30,FARM.packingHouse.z),new THREE.Vector3(0,-1,0));const packingMeshes:THREE.Object3D[]=[];packing.traverse(o=>{if(o instanceof THREE.Mesh)packingMeshes.push(o);});const hits=roofRay.intersectObjects(packingMeshes,false);assert.ok(hits.length);assert.ok(Math.abs(hits[0].point.y-FARM.packingHouse.h)<.001);assert.ok(hits.every(h=>h.object===hits[0].object||Math.abs(h.distance-hits[0].distance)>.2),'roof does not compete with wall tops');
});
