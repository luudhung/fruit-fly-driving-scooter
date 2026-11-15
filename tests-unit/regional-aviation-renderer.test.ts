import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {RegionalAviationRenderer} from '../src/regional-aviation-renderer.ts';
import {nextRegionalFlight,flightPose} from '../worker/aviation.mjs';

test('regional aircraft render only real paid manifests and share a fixed geometry/material budget',()=>{
 const scene=new THREE.Group(),renderer=new RegionalAviationRenderer(scene);renderer.sync(undefined);renderer.update(0);
 assert.equal(scene.children.filter(m=>m.visible).length,0);assert.equal(scene.children.length,12);
 const flight={...nextRegionalFlight(0,'north','city')!,regional:true,passengerIds:['ACTUAL-RESIDENT']};
 renderer.sync({flights:[flight]});renderer.update(flight.departure+600);const visible=scene.children.filter(m=>m.visible);assert.equal(visible.length,1);
 const pose=flightPose(flight.departure+600,flight);assert.deepEqual(visible[0].position.toArray(),[pose.x,pose.y,pose.z]);
 const meshes=scene.children as THREE.Mesh[];assert.ok(meshes.every(m=>m.geometry===meshes[0].geometry&&m.material===meshes[0].material));
 renderer.update(flight.arrival+901);assert.equal(scene.children.filter(m=>m.visible).length,0);
 renderer.sync({flights:[{...flight,passengerIds:[]}]});renderer.update(flight.departure+600);assert.equal(scene.children.filter(m=>m.visible).length,0);
 let lights=0;scene.traverse(o=>{if(o instanceof THREE.Light)lights++;});assert.equal(lights,0);
});
