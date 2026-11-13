import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
/** Collapse immutable infrastructure boxes by material; moving trains stay separate. */
export function batchStaticBoxes(root:THREE.Group,cellSize=0){
 const groups=new Map<string,{material:THREE.Material;meshes:THREE.Mesh<THREE.BoxGeometry,THREE.Material>[]}>,batches:THREE.InstancedMesh[]=[];
 for(const object of root.children){
  if(!(object instanceof THREE.Mesh)||object instanceof THREE.InstancedMesh||!(object.geometry instanceof THREE.BoxGeometry)||Array.isArray(object.material))continue;
  const key=object.material.uuid+(cellSize>0?':'+Math.floor(object.position.x/cellSize)+':'+Math.floor(object.position.z/cellSize):'');
  let group=groups.get(key);if(!group){group={material:object.material,meshes:[]};groups.set(key,group);}group.meshes.push(object);
 }
 const scale=new THREE.Matrix4(),matrix=new THREE.Matrix4();
 for(const{material,meshes}of groups.values()){
  const batch=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,meshes.length);
  meshes.forEach((mesh,i)=>{const p=mesh.geometry.parameters;mesh.updateMatrix();scale.makeScale(p.width,p.height,p.depth);matrix.multiplyMatrices(mesh.matrix,scale);batch.setMatrixAt(i,matrix);root.remove(mesh);mesh.geometry.dispose();});
  batch.instanceMatrix.needsUpdate=true;batch.computeBoundingBox();batch.computeBoundingSphere();root.add(batch);batches.push(batch);
 }
 return batches;
}

/** Merge exact, opaque, immutable landmark surfaces in their original local group.
 * Existing instancing, glass and sprites are retained. Shared materials keep
 * night lighting live; movable branches must not be passed to this function. */
export function batchStaticMeshes(root:THREE.Group){
 const buckets=new Map<string,{material:THREE.Material;meshes:THREE.Mesh[]}>(),result:THREE.Mesh[]=[];
 for(const object of root.children){
  if(!(object instanceof THREE.Mesh)||object instanceof THREE.InstancedMesh||Array.isArray(object.material)||object.material.transparent||!object.visible||Number.isFinite(object.geometry.drawRange.count)||Object.keys(object.geometry.morphAttributes).length)continue;
  const attributes=Object.keys(object.geometry.attributes).map(name=>{const a=object.geometry.getAttribute(name);return `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`;}).sort().join('|');
  const key=`${object.material.uuid}:${attributes}:${object.renderOrder}:${object.castShadow}:${object.receiveShadow}`;
  let bucket=buckets.get(key);if(!bucket){bucket={material:object.material,meshes:[]};buckets.set(key,bucket);}bucket.meshes.push(object);
 }
 for(const{material,meshes}of buckets.values()){
  if(meshes.length<2)continue;
  const parts=meshes.map(mesh=>{mesh.updateMatrix();const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();return geometry.applyMatrix4(mesh.matrix);});
  const geometry=mergeGeometries(parts);for(const part of parts)part.dispose();if(!geometry)continue;
  const merged=new THREE.Mesh(geometry,material),first=meshes[0];merged.name='Merged static surfaces';merged.renderOrder=first.renderOrder;merged.castShadow=first.castShadow;merged.receiveShadow=first.receiveShadow;
  geometry.computeBoundingBox();geometry.computeBoundingSphere();for(const mesh of meshes)root.remove(mesh);root.add(merged);result.push(merged);
 }
 return result;
}
