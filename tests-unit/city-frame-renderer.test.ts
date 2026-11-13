import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CityFrameRenderer} from '../src/city-frame-renderer.ts';
function harness(reversedDepthBuffer:boolean){
 const calls:Array<unknown[]>=[],size=new THREE.Vector2(1920,1080);
 const renderer={capabilities:{reversedDepthBuffer,maxSamples:4},outputColorSpace:THREE.SRGBColorSpace,toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:1.18,
 getDrawingBufferSize:(target:THREE.Vector2)=>target.copy(size),setRenderTarget:(target:unknown)=>calls.push(['target',target]),render:(scene:unknown,camera:unknown)=>calls.push(['render',scene,camera])} as unknown as THREE.WebGLRenderer;
 return{renderer,calls,size};
}
test('reverse-Z preserves full framebuffer precision and restores screen output for subsequent frames and photos',()=>{
 const{renderer,calls,size}=harness(true),frame=new CityFrameRenderer(renderer),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 assert.equal(frame.target!.depthTexture!.type,THREE.FloatType);assert.equal(frame.target!.width,1920);assert.equal(frame.target!.height,1080);assert.equal(frame.target!.samples,4);assert.equal(frame.target!.resolveDepthBuffer,false);
 frame.draw(scene,camera);assert.deepEqual(calls[0],['target',frame.target]);assert.deepEqual(calls[1],['render',scene,camera]);assert.deepEqual(calls[2],['target',null]);assert.equal(calls.length,4);
 size.set(1280,720);frame.resize();assert.equal(frame.target!.width,1280);assert.equal(frame.target!.height,720);
 frame.draw(scene,new THREE.PerspectiveCamera());assert.equal(calls.at(-2)![1],null,'resident camera also ends on the visible framebuffer');frame.dispose();
});
test('unsupported reverse-Z stays on the direct logarithmic path without offscreen allocations or output draws',()=>{
 const{renderer,calls}=harness(false),frame=new CityFrameRenderer(renderer),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 assert.equal(frame.target,null);frame.resize();frame.draw(scene,camera);assert.deepEqual(calls,[['render',scene,camera]]);frame.dispose();
});
