import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {CityWater} from '../src/city-water.ts';
test('water bakes a small seamless ripple tile once and elapsed time cannot move it or update its texture',()=>{
 const water=new CityWater(),texture=water.material.map! as THREE.DataTexture,copy=texture.image.data.slice(),version=texture.version;
 const sky=new THREE.Color(0x85b4d4),horizon=new THREE.Color(0xbfd8e0),sun=new THREE.Vector3(.5,.6,0),sunColor=new THREE.Color(0xffdc9b);
 water.update(0,1,.2,sky,horizon,sun,sunColor);const color=water.material.color.clone();
 for(const time of [1,100,3600,86400])water.update(time,1,.2,sky,horizon,sun,sunColor);
 assert.deepEqual(texture.image.data,copy);assert.equal(texture.version,version);assert.equal(texture.image.width,256);assert.equal(texture.image.height,256);assert.ok(water.material.color.equals(color));assert.equal(water.material.type,'MeshBasicMaterial');assert.equal(texture.generateMipmaps,true);assert.equal(texture.wrapS,THREE.RepeatWrapping);
 water.update(86400,0,.2,sky,horizon,sun,sunColor);assert.ok(water.material.color.r<color.r);assert.deepEqual(texture.image.data,copy);
});
test('the standard depth-aware shader uses continuous world coordinates without time or animated fragment work',()=>{
 const water=new CityWater(),shader={vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader,uniforms:{}};
 water.material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms,{} as THREE.WebGLRenderer);
 assert.match(shader.vertexShader,/vMapUv=\(modelMatrix\*vec4\(position,1\.\)\)\.xz\/64\./);assert.match(shader.vertexShader,/#include <logdepthbuf_vertex>/);assert.match(shader.fragmentShader,/#include <logdepthbuf_fragment>/);assert.doesNotMatch(shader.vertexShader+shader.fragmentShader,/uTime|sin\(|cos\(/);
});
