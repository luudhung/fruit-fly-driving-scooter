import * as THREE from 'three';

const materials=new Set<THREE.MeshStandardMaterial>();
let night=0;
/** Baked-looking road illumination: no lights, poles, extra meshes or draw calls. */
export function createRoadMaterial(color:number,roughness=.97){
 const material=new THREE.MeshStandardMaterial({color,roughness,emissive:0x9a855d,emissiveIntensity:night*.2});
 materials.add(material);material.addEventListener('dispose',()=>materials.delete(material));
 return material;
}
export function updateRoadLighting(value:number){
 night=THREE.MathUtils.clamp(value,0,1);
 for(const material of materials)material.emissiveIntensity=night*.2;
}
