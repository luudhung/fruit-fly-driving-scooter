import * as THREE from 'three';
const red=new THREE.PointsMaterial({color:0xff2828,size:1.25,sizeAttenuation:true,toneMapped:false,transparent:true,depthWrite:false});
const blue=red.clone();blue.color.setHex(0x42b6ff);
/** Shared self-lit markers: no real lights, shadows, textures or per-frame geometry. */
export function addAviationBeacons(parent:THREE.Object3D,positions:number[][],color:'red'|'tower'='red'){
 const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions.flat(),3));
 const points=new THREE.Points(geometry,color==='tower'?blue:red);points.name='Aviation warning beacons';parent.add(points);return points;
}
export function updateAviationBeacons(realSeconds:number){
 const phase=((realSeconds%1.4)+1.4)%1.4,pulse=phase<.14||phase>.25&&phase<.39;
 red.opacity=blue.opacity=pulse?1:.08;
}
