import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CityFrameRenderer} from '../src/city-frame-renderer.ts';
function harness(reversedDepthBuffer:boolean,packed=true){
 const calls:Array<unknown[]>=[],size=new THREE.Vector2(1920,1080);
 const renderer={capabilities:{reversedDepthBuffer,maxSamples:4},outputColorSpace:THREE.SRGBColorSpace,toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:1.18,
 getContext:()=>({RENDERBUFFER:1,R11F_G11F_B10F:2,SAMPLES:3,getInternalformatParameter:()=>new Int32Array(packed?[4,2]:[])}),getDrawingBufferSize:(target:THREE.Vector2)=>target.copy(size),setRenderTarget:(target:unknown)=>calls.push(['target',target]),render:(scene:unknown,camera:unknown)=>calls.push(['render',scene,camera])} as unknown as THREE.WebGLRenderer;
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

test('HDR color uses the compact opaque format only when the driver supports scene multisampling',()=>{
 const compact=new CityFrameRenderer(harness(true,true).renderer),compatible=new CityFrameRenderer(harness(true,false).renderer);
 assert.equal(compact.target!.texture.type,THREE.UnsignedInt101111Type);assert.equal(compact.target!.texture.format,THREE.RGBFormat);assert.equal(compact.target!.samples,4);
 assert.equal(compatible.target!.texture.type,THREE.HalfFloatType);assert.equal(compatible.target!.texture.format,THREE.RGBAFormat);assert.equal(compatible.target!.samples,4);
 assert.equal(compact.target!.depthTexture!.type,compatible.target!.depthTexture!.type);compact.dispose();compatible.dispose();
});
