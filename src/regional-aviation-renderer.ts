import {regionalAircraftVisibleUntil} from '../worker/regional-empty-rotation.mjs';
import {addAviationBeacons} from './aviation-beacons.ts';
import * as THREE from 'three';
import {airlinerGeometry} from './visitor-aviation-renderer.ts';
import {flightPose,type Flight} from '../worker/aviation.mjs';
type Manifest=Flight&{passengerIds:string[];scheduled?:boolean};
/** One shared mesh/material for paid manifests and the published island service. */
export class RegionalAviationRenderer{
 private flights:readonly Manifest[]=[];
 private readonly planes:THREE.Mesh[];
 constructor(parent:THREE.Object3D){
  const geometry=airlinerGeometry(),material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.55,metalness:.08});
  this.planes=Array.from({length:12},()=>{const mesh=new THREE.Mesh(geometry,material);addAviationBeacons(mesh,[[-8.5,-.28,-1.55],[8.5,-.28,-1.55]]);mesh.name='Paid regional passenger aircraft';mesh.visible=false;mesh.userData.dynamicCity=true;parent.add(mesh);return mesh;});
 }
 sync(snapshot:{flights?:readonly Manifest[]}|undefined){
  this.flights=snapshot?.flights||[];
 }
 update(now:number){
  let visible=0;
  for(const flight of this.flights){
   if(!flight.scheduled&&!flight.passengerIds?.length||now<flight.departure-300||now>regionalAircraftVisibleUntil(flight))continue;
   if(visible===this.planes.length)break;
   const mesh=this.planes[visible++],pose=flightPose(now,flight);
   mesh.visible=true;mesh.position.set(pose.x,pose.y,pose.z);mesh.rotation.y=pose.heading;
  }
  for(let i=visible;i<this.planes.length;i++)this.planes[i].visible=false;
 }
}
