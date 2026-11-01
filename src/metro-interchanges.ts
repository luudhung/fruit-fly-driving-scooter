import * as THREE from 'three';
import {METRO_LINES,metroStationGeometry} from '../worker/city-map.mjs';
import {METRO_INTERCHANGES,metroTransferWaypoints} from '../worker/metro-planner.mjs';
/** Platforms share elevated walkways and short lifts, entirely above the carriageway. */
export function buildMetroInterchanges(root:THREE.Object3D){
 const pieces:THREE.Matrix4[]=[],glass:THREE.Matrix4[]=[],d=new THREE.Object3D(),keys=new Set<string>();
 const block=(list:THREE.Matrix4[],x:number,y:number,z:number,w:number,h:number,depth:number,yaw=0)=>{d.position.set(x,y,z);d.rotation.set(0,yaw,0);d.scale.set(w,h,depth);d.updateMatrix();list.push(d.matrix.clone());};
 for(const station of METRO_INTERCHANGES){
  const key=`${station.x},${station.z}`;if(keys.has(key))continue;keys.add(key);
  const locations=station.lines.map(id=>{const line=METRO_LINES.find(l=>l.id===id)!;return{line,index:line.points.findIndex(p=>p[0]===station.x&&p[1]===station.z)};});
  const first=locations[0];for(const other of locations.slice(1)){
   const from=metroStationGeometry(first.line,first.index).platform,points=[from,...metroTransferWaypoints(first.line,first.index,other.line,other.index)!];
   for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),y=((a.y??0)+(b.y??0))/2;
    if(length<.05){if(Math.abs((a.y??0)-(b.y??0))>.1)block(glass,a.x,y-.9,a.z,1.4,Math.abs((a.y??0)-(b.y??0)),1.4);continue;}
    const angle=Math.atan2(-dz,dx);block(pieces,(a.x+b.x)/2,y-1.025,(a.z+b.z)/2,length,.25,1.6,angle);
    for(const side of [-1,1])block(pieces,(a.x+b.x)/2-dz/length*side*.72,y+.1,(a.z+b.z)/2+dx/length*side*.72,length,.075,.075,angle);
   }
  }
 }
 for(const [list,material]of [[pieces,new THREE.MeshStandardMaterial({color:0x9ba9ad,roughness:.7,metalness:.3})],[glass,new THREE.MeshStandardMaterial({color:0x83b9cd,roughness:.28,metalness:.25,transparent:true,opacity:.45,depthWrite:false})]] as const){const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,list.length);list.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;root.add(mesh);}
}
