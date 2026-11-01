import * as THREE from 'three';
/** Collapse immutable infrastructure boxes by material; moving trains stay separate. */
export function batchStaticBoxes(root:THREE.Group){
 const groups=new Map<THREE.Material,THREE.Mesh<THREE.BoxGeometry,THREE.Material>[]>();
 for(const object of root.children){
  if(!(object instanceof THREE.Mesh)||!(object.geometry instanceof THREE.BoxGeometry)||Array.isArray(object.material))continue;
  const list=groups.get(object.material)||[];list.push(object);groups.set(object.material,list);
 }
 const scale=new THREE.Matrix4(),matrix=new THREE.Matrix4();
 for(const[material,meshes]of groups){
  const batch=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,meshes.length);
  meshes.forEach((mesh,i)=>{const p=mesh.geometry.parameters;mesh.updateMatrix();scale.makeScale(p.width,p.height,p.depth);matrix.multiplyMatrices(mesh.matrix,scale);batch.setMatrixAt(i,matrix);root.remove(mesh);mesh.geometry.dispose();});
  batch.instanceMatrix.needsUpdate=true;batch.computeBoundingBox();batch.computeBoundingSphere();root.add(batch);
 }
}
