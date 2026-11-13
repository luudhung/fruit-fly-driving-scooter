import * as THREE from 'three';
export type SpatialInstanceCell={mesh:THREE.InstancedMesh;indices:number[]};
/** Partition already-built instances without changing their geometry, colors or
 * transforms. Every cell stays resident; Three.js rejects only off-screen bounds. */
export function spatialInstanceCells(source:THREE.InstancedMesh,root:THREE.Object3D,cellSize=96):SpatialInstanceCell[]{
 const buckets=new Map<string,number[]>(),matrix=new THREE.Matrix4();
 for(let i=0;i<source.count;i++){
  source.getMatrixAt(i,matrix);const e=matrix.elements,key=`${Math.floor(e[12]/cellSize)}:${Math.floor(e[14]/cellSize)}`;
  let indices=buckets.get(key);if(!indices){indices=[];buckets.set(key,indices);}indices.push(i);
 }
 const cells:SpatialInstanceCell[]=[];
 for(const[key,indices]of buckets){
  const mesh=new THREE.InstancedMesh(source.geometry,source.material,indices.length);
  mesh.name=`${source.name} ${key}`;mesh.position.copy(source.position);mesh.quaternion.copy(source.quaternion);mesh.scale.copy(source.scale);
  mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;mesh.renderOrder=source.renderOrder;
  indices.forEach((index,i)=>{source.getMatrixAt(index,matrix);mesh.setMatrixAt(i,matrix);});
  mesh.computeBoundingBox();mesh.computeBoundingSphere();root.add(mesh);cells.push({mesh,indices});
 }
 source.removeFromParent();syncSpatialInstanceColors(source,cells);return cells;
}
/** Signal phases update colors only. Static bounds and matrices never change. */
export function syncSpatialInstanceColors(source:THREE.InstancedMesh,cells:SpatialInstanceCell[]){
 if(!source.instanceColor)return;const color=new THREE.Color();
 for(const{mesh,indices}of cells){indices.forEach((index,i)=>{source.getColorAt(index,color);mesh.setColorAt(i,color);});mesh.instanceColor!.needsUpdate=true;}
}
