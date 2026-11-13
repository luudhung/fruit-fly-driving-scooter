import * as THREE from 'three';
import type {Rect} from './surface-rectangles.ts';
import type {RoadSurfaceLayout} from './road-surface-layout.ts';
export type RoadSurfaceMaterials=Readonly<{sidewalk:THREE.Material;asphalt:THREE.Material;markings:THREE.Material}>;
export type ExtraRoadFoundation=Rect&Readonly<{height:number;centerY:number}>;
export type RoadSurfaceMeshStats=Readonly<{drawBatches:3;foundationRectangles:number;extraFoundationRectangles:number;sidewalkRectangles:number;asphaltRectangles:number;markingRectangles:number;concreteInstances:number;totalInstances:number;matrixBytes:number}>;
export type RoadSurfaceMeshes=Readonly<{meshes:Readonly<{concrete:THREE.InstancedMesh;asphalt:THREE.InstancedMesh;markings:THREE.InstancedMesh}>;stats:RoadSurfaceMeshStats;dispose():void}>;
const valid=(r:Rect)=>[r.x,r.z,r.w,r.d].every(Number.isFinite)&&r.w>0&&r.d>0;

/** Three fixed material batches. Physical layer separation replaces depth bias and draw-order tricks. */
export function buildRoadSurfaceMeshes(parent:THREE.Object3D,layout:RoadSurfaceLayout,materials:RoadSurfaceMaterials,extraFoundations:readonly ExtraRoadFoundation[]=[]):RoadSurfaceMeshes{
 const foundations=layout.foundations.filter(valid),sidewalks=layout.sidewalks.filter(valid),asphalt=layout.asphalt.filter(valid),markings=layout.markings.filter(valid),extra=extraFoundations.filter(r=>valid(r)&&Number.isFinite(r.height)&&r.height>0&&Number.isFinite(r.centerY));
 const box=new THREE.BoxGeometry(1,1,1),plane=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),transform=new THREE.Object3D();
 const concreteMesh=new THREE.InstancedMesh(box,materials.sidewalk,foundations.length+extra.length+sidewalks.length),asphaltMesh=new THREE.InstancedMesh(box,materials.asphalt,asphalt.length),markingsMesh=new THREE.InstancedMesh(plane,materials.markings,markings.length);
 const meshes=Object.freeze({concrete:concreteMesh,asphalt:asphaltMesh,markings:markingsMesh});
 concreteMesh.name='Road foundations and raised sidewalks';asphaltMesh.name='Disjoint asphalt surfaces';markingsMesh.name='Road marking planes';
 const write=(mesh:THREE.InstancedMesh,index:number,r:Rect,height:number,centerY:number)=>{transform.position.set(r.x,centerY,r.z);transform.scale.set(r.w,height,r.d);transform.updateMatrix();mesh.setMatrixAt(index,transform.matrix);};
 let index=0;for(const r of foundations)write(concreteMesh,index++,r,.06,.03);for(const r of extra)write(concreteMesh,index++,r,r.height,r.centerY);for(const r of sidewalks)write(concreteMesh,index++,r,.18,.15);
 for(const [i,r]of asphalt.entries())write(asphaltMesh,i,r,.08,.10);
 // The plane geometry already lies in X/Z; its unit Y scale creates no artificial thickness.
 for(const [i,r]of markings.entries())write(markingsMesh,i,r,1,.17);
 for(const mesh of Object.values(meshes)){
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);mesh.instanceMatrix.needsUpdate=true;mesh.matrixAutoUpdate=false;mesh.updateMatrix();
  if(mesh.count){mesh.computeBoundingBox();mesh.computeBoundingSphere();}else{mesh.boundingBox=new THREE.Box3(new THREE.Vector3(),new THREE.Vector3());mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(),0);}
  parent.add(mesh);
 }
 const stats:RoadSurfaceMeshStats=Object.freeze({drawBatches:3,foundationRectangles:foundations.length,extraFoundationRectangles:extra.length,sidewalkRectangles:sidewalks.length,asphaltRectangles:asphalt.length,markingRectangles:markings.length,concreteInstances:concreteMesh.count,totalInstances:concreteMesh.count+asphaltMesh.count+markingsMesh.count,matrixBytes:Object.values(meshes).reduce((n,m)=>n+m.instanceMatrix.array.byteLength,0)});
 let disposed=false;
 return Object.freeze({meshes,stats,dispose(){if(disposed)return;disposed=true;for(const mesh of Object.values(meshes)){mesh.removeFromParent();mesh.dispose();}box.dispose();plane.dispose();}});
}
