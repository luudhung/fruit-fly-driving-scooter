import * as THREE from 'three';
import {BUILDINGS,contains} from '../worker/city-map.mjs';
export type ResidentCameraRecord={at:number;camera:{x:number;y:number;z:number};target?:{x:number;y:number;z:number};subjectId:string;weather?:string};
/** Reuses the viewer's renderer for occasional resident photos; no extra WebGL context or server pixels. */
export class ResidentCamera{
 private photoCamera=new THREE.PerspectiveCamera(58,1.5,1,7000);
 constructor(private renderer:THREE.WebGLRenderer,private scene:THREE.Scene,private viewer:THREE.Camera,private prepare:(photo:ResidentCameraRecord,origin:THREE.Vector3,camera:THREE.Camera)=>()=>void,private draw?:(scene:THREE.Scene,camera:THREE.Camera)=>void){}
 capture=async(photo:ResidentCameraRecord):Promise<Blob>=>{
  if(!photo.camera||![photo.camera.x,photo.camera.y,photo.camera.z].every(Number.isFinite))throw Error('No recorded camera pose');
  const camera=this.photoCamera,position=photo.camera;
  if(photo.subjectId!=='rooftop'&&BUILDINGS.some(b=>contains(b,position,-.2)&&position.y<b.h))throw Error('Historical camera was indoors');
  camera.position.set(position.x,Math.max(1.5,position.y),position.z);
  const subject=BUILDINGS.find(b=>b.id===photo.subjectId),target=photo.target||{x:subject?.x??0,y:subject?Math.min(subject.h*.55,90):35,z:subject?.z??-150};
  if(Math.hypot(target.x-camera.position.x,target.z-camera.position.z)<2)camera.lookAt(15,65,-170);else camera.lookAt(target.x,target.y,target.z);
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=426;
  const context=canvas.getContext('2d');if(!context)throw Error('Photo canvas unavailable');
  const renderer=this.renderer,viewport=renderer.getViewport(new THREE.Vector4()),size=renderer.getSize(new THREE.Vector2()),width=Math.min(size.x,size.y*1.5),height=width/1.5;
  const restore=this.prepare(photo,camera.position,camera);
  try{
   renderer.setViewport(0,0,width,height);if(this.draw)this.draw(this.scene,camera);else renderer.render(this.scene,camera);
   const ratio=renderer.domElement.width/size.x;
   context.drawImage(renderer.domElement,0,renderer.domElement.height-height*ratio,width*ratio,height*ratio,0,0,640,426);
  }finally{restore();renderer.setViewport(viewport);if(this.draw)this.draw(this.scene,this.viewer);else renderer.render(this.scene,this.viewer);}
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Photo encoding unavailable')),'image/jpeg',.82));
 };
}
