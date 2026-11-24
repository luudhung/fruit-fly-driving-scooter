import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const red=new THREE.MeshBasicMaterial({color:0xff2828,toneMapped:false,transparent:true,depthWrite:false});
const blue=red.clone();blue.color.setHex(0x42b6ff);
const shapes=new Map<string,THREE.BufferGeometry>();
/** Low-poly round beacons share solid geometry/materials; no real lights or shadows. */
export function addAviationBeacons(parent:THREE.Object3D,positions:number[][],color:'red'|'tower'='red'){
 const radius=positions.some(p=>p[1]>50)?.55:.32,key=JSON.stringify([positions,radius]);
 let geometry=shapes.get(key);
 if(!geometry){const parts=positions.map(([x,y,z])=>new THREE.SphereGeometry(radius,10,8).translate(x,y,z));geometry=mergeGeometries(parts)!;for(const part of parts)part.dispose();shapes.set(key,geometry);}
 const mesh=new THREE.Mesh(geometry,color==='tower'?blue:red);mesh.name='Aviation warning beacons';parent.add(mesh);return mesh;
}
export function updateAviationBeacons(realSeconds:number){
 const phase=((realSeconds%1.4)+1.4)%1.4,pulse=phase<.14||phase>.25&&phase<.39;
 red.opacity=blue.opacity=pulse?1:.08;
}
