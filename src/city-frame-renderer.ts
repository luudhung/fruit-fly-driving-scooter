import * as THREE from 'three';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
/** Reverse-Z needs a floating-point depth attachment, not the default 24-bit
 * window depth buffer. Keep one full-resolution HDR target and one output pass. */
export class CityFrameRenderer{
 readonly target:THREE.WebGLRenderTarget|null;
 private output:OutputPass|null=null;
 private renderer:THREE.WebGLRenderer;
 constructor(renderer:THREE.WebGLRenderer){
  this.renderer=renderer;
  if(renderer.capabilities.reversedDepthBuffer){
   const size=renderer.getDrawingBufferSize(new THREE.Vector2());
   const gl=renderer.getContext() as WebGL2RenderingContext,samples=Math.min(4,renderer.capabilities.maxSamples);
   const supported=gl.getInternalformatParameter(gl.RENDERBUFFER,gl.R11F_G11F_B10F,gl.SAMPLES) as Int32Array|null;
   // Opaque output needs no alpha: packed HDR halves color-buffer bandwidth.
   // Retain RGBA16F on drivers that cannot multisample the packed format.
   const packed=samples===0||Boolean(supported?.includes(samples));
   this.target=new THREE.WebGLRenderTarget(size.x,size.y,{type:packed?THREE.UnsignedInt101111Type:THREE.HalfFloatType,format:packed?THREE.RGBFormat:THREE.RGBAFormat,depthBuffer:true,stencilBuffer:false,resolveDepthBuffer:false,samples});
   // Only color is presented; discarding MSAA depth avoids an unused full-screen resolve.
   this.target.depthTexture=new THREE.DepthTexture(size.x,size.y,THREE.FloatType);
   this.output=new OutputPass();this.output.renderToScreen=true;
  }else this.target=null;
 }
 resize(){if(this.target){const size=this.renderer.getDrawingBufferSize(new THREE.Vector2());this.target.setSize(size.x,size.y);}}
 draw(scene:THREE.Scene,camera:THREE.Camera){
  if(this.target&&this.output){
   const renderer=this.renderer;renderer.setRenderTarget(this.target);
   renderer.render(scene,camera);
   this.output.render(renderer,this.target,this.target,0,false);
  }
  else this.renderer.render(scene,camera);
 }
 dispose(){this.target?.dispose();this.output?.dispose();}
}
