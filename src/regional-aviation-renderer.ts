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
  let visible=0;
  for(const flight of this.flights){
   if(!flight.passengerIds?.length||now<flight.departure-300||now>flight.arrival+900)continue;
   if(visible===this.planes.length)break;
   const mesh=this.planes[visible++],pose=flightPose(now,flight);
   mesh.visible=true;mesh.position.set(pose.x,pose.y,pose.z);mesh.rotation.y=pose.heading;
  }
  for(let i=visible;i<this.planes.length;i++)this.planes[i].visible=false;
 }
}
