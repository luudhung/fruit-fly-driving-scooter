import * as THREE from 'three';
/** Collapse immutable infrastructure boxes by material; moving trains stay separate. */
export function batchStaticBoxes(root:THREE.Group,cellSize=0){
 const groups=new Map<string,{material:THREE.Material;meshes:THREE.Mesh<THREE.BoxGeometry,THREE.Material>[]}>,batches:THREE.InstancedMesh[]=[];
 for(const object of root.children){
  if(!(object instanceof THREE.Mesh)||!(object.geometry instanceof THREE.BoxGeometry)||Array.isArray(object.material))continue;
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
