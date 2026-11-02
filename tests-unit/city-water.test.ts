import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {CityWater} from '../src/city-water.ts';
import {RIVER,WORLD_HALF} from '../worker/city-map.mjs';
function expand(source:string):string{return source.replace(/#include <([\w]+)>/g,(_,name:string)=>{const chunk=THREE.ShaderChunk[name as keyof typeof THREE.ShaderChunk];assert.equal(typeof chunk,'string',`missing installed Three.js chunk ${name}`);return expand(chunk);});}

test('water participates in the same logarithmic depth pipeline as the city ground',()=>{
 const water=new CityWater(),vertex=expand(water.material.vertexShader),fragment=expand(water.material.fragmentShader);
 assert.ok(vertex.includes('vFragDepth = 1.0 + gl_Position.w'));
 assert.ok(vertex.includes('bool isPerspectiveMatrix'), 'the perspective test required by the depth chunk must be defined');
 assert.ok(fragment.includes('uniform float logDepthBufFC'));
 assert.ok(fragment.includes('gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5'));
 assert.equal(water.material.depthTest,true);assert.equal(water.material.depthWrite,true);assert.equal(water.material.depthFunc,THREE.LessEqualDepth);
 water.material.dispose();
});

test('the rendered river plane covers the full river width and both ends of the world',()=>{
 const plane=new THREE.PlaneGeometry(RIVER.w,RIVER.d);plane.rotateX(-Math.PI/2);plane.translate(RIVER.x,.015,RIVER.z);plane.computeBoundingBox();const bounds=plane.boundingBox!;
 assert.equal(bounds.min.x,RIVER.x-RIVER.w/2);assert.equal(bounds.max.x,RIVER.x+RIVER.w/2);assert.ok(bounds.min.z<=-WORLD_HALF&&bounds.max.z>=WORLD_HALF);
 for(const z of[-WORLD_HALF,0,WORLD_HALF])assert.ok(bounds.containsPoint(new THREE.Vector3(RIVER.x,.015,z))||Math.abs(bounds.min.y-.015)<1e-6&&z>=bounds.min.z&&z<=bounds.max.z);
 plane.dispose();
});
