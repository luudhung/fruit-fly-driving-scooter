import * as THREE from 'three';
import {airlinerGeometry} from './visitor-aviation-renderer.ts';
import {flightPose,scheduledAircraft,type Flight} from '../worker/aviation.mjs';
type Manifest=Flight&{passengerIds:string[];scheduled?:boolean};
/** One shared mesh/material for paid manifests and the published hourly island service. */
export class RegionalAviationRenderer{
 private flights:readonly Manifest[]=[];
 private hourlyIslandService=false;
 private readonly planes:THREE.Mesh[];
 constructor(parent:THREE.Object3D){
  const geometry=airlinerGeometry(),material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.55,metalness:.08});
  this.planes=Array.from({length:12},()=>{const mesh=new THREE.Mesh(geometry,material);mesh.name='Paid regional passenger aircraft';mesh.visible=false;mesh.userData.dynamicCity=true;parent.add(mesh);return mesh;});
 }
 sync(snapshot:{flights?:readonly Manifest[]}|undefined){
  this.flights=snapshot?.flights||[];
  this.hourlyIslandService=this.flights.some(flight=>flight.scheduled);
 }
 update(now:number){
  let visible=0;
  if(this.hourlyIslandService){
   const pose=scheduledAircraft(now),mesh=this.planes[visible++];
   mesh.visible=true;mesh.position.set(pose.x,pose.y,pose.z);mesh.rotation.y=pose.heading;
  }
  for(const flight of this.flights){
   const shuttle=flight.from==='city'&&flight.to==='island'&&flight.departure%3600===0||flight.from==='island'&&flight.to==='city'&&flight.departure%3600===1800;
   if(flight.scheduled||this.hourlyIslandService&&shuttle||!flight.passengerIds?.length||now<flight.departure-300||now>flight.arrival+900)continue;
   if(visible===this.planes.length)break;
   const mesh=this.planes[visible++],pose=flightPose(now,flight);
   mesh.visible=true;mesh.position.set(pose.x,pose.y,pose.z);mesh.rotation.y=pose.heading;
  }
  for(let i=visible;i<this.planes.length;i++)this.planes[i].visible=false;
 }
}
