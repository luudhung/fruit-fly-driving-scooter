import * as THREE from 'three';

/** One painted ripple tile, baked once. Water has no clock, moving normals or reflection pass. */
function rippleTexture(){
 const size=256,data=new Uint8Array(size*size*4),tau=Math.PI*2;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size;
  const wave=Math.sin(tau*(v*18+Math.sin(tau*u*4)*.13))*.65+Math.sin(tau*(v*37-u*3))*.23;
  const crest=Math.max(0,wave-.42),grain=((Math.imul(x+1,73856093)^Math.imul(y+1,19349663))>>>0)%17/255;
  const shade=.67+crest*.34+grain,index=(y*size+x)*4;
  data[index]=Math.round(196*shade);data[index+1]=Math.round(221*shade);data[index+2]=Math.round(225*shade);data[index+3]=255;
 }
 const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
 texture.name='Painted static river ripples';texture.colorSpace=THREE.SRGBColorSpace;
 texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;
 texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
 return texture;
}
export class CityWater{
 readonly material:THREE.MeshBasicMaterial;
 private lastDay=-1;private lastCloud=-1;private lastHorizon=-1;
 constructor(){
  this.material=new THREE.MeshBasicMaterial({map:rippleTexture(),color:0x4b8594,fog:true});
  this.material.name='Static painted city water';
  // Shared world-space UVs keep separate river rectangles and ponds continuous.
  // The standard material retains the renderer's native reversed/logarithmic depth handling.
  this.material.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
#ifdef USE_MAP
 vMapUv=(modelMatrix*vec4(position,1.)).xz/64.;
#endif`);
  };
  this.material.customProgramCacheKey=()=> 'static-painted-city-water-v1';
 }
 update(_seconds:number,daylight:number,cloud:number,_sky:THREE.Color,horizon:THREE.Color,_sun:THREE.Vector3,_sunColor:THREE.Color){
  const day=Math.round(Math.min(1,Math.max(0,daylight))*100)/100,overcast=Math.round(Math.min(1,Math.max(0,cloud))*50)/50,hex=horizon.getHex();
  if(day===this.lastDay&&overcast===this.lastCloud&&hex===this.lastHorizon)return;
  this.lastDay=day;this.lastCloud=overcast;this.lastHorizon=hex;
  this.material.color.setRGB(.035+day*.25,.065+day*.43,.10+day*.48).lerp(horizon,.035+overcast*.045);
 }
}
