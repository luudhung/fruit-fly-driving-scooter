import * as THREE from 'three';
import {airlinerGeometry} from './visitor-aviation-renderer.ts';
import {flightPose,type Flight} from '../worker/aviation.mjs';
type Manifest=Flight&{passengerIds:string[]};
/** One shared mesh/material, bounded by actual paid manifests rather than a decorative timetable. */
export class RegionalAviationRenderer{
 private flights:readonly Manifest[]=[];
 private readonly planes:THREE.Mesh[];
 constructor(parent:THREE.Object3D){
  const geometry=airlinerGeometry(),material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.55,metalness:.08});
  this.planes=Array.from({length:12},()=>{const mesh=new THREE.Mesh(geometry,material);mesh.name='Paid regional passenger aircraft';mesh.visible=false;mesh.userData.dynamicCity=true;parent.add(mesh);return mesh;});
 }
 sync(snapshot:{flights?:readonly Manifest[]}|undefined){this.flights=snapshot?.flights||[];}
 update(now:number){
  for(const [i,mesh]of this.planes.entries()){
   const flight=this.flights[i];mesh.visible=Boolean(flight?.passengerIds?.length&&now>=flight.departure-300&&now<=flight.arrival+900);
   if(!mesh.visible)continue;const pose=flightPose(now,flight);mesh.position.set(pose.x,pose.y,pose.z);mesh.rotation.y=pose.heading;
  }
 }
}
