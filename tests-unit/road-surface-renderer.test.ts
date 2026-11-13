import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildRoadSurfaceMeshes} from '../src/road-surface-renderer.ts';
import {buildRoadSurfaceLayout} from '../src/road-surface-layout.ts';
const materials=()=>({sidewalk:new THREE.MeshStandardMaterial({color:0xb6b5ad}),asphalt:new THREE.MeshStandardMaterial({color:0x242a2e}),markings:new THREE.MeshBasicMaterial({color:0xe9dfb1})});
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);
function instanceBounds(mesh:THREE.InstancedMesh,index:number){const matrix=new THREE.Matrix4();mesh.getMatrixAt(index,matrix);mesh.geometry.computeBoundingBox();return mesh.geometry.boundingBox!.clone().applyMatrix4(matrix);}

test('direct instancing creates exactly three shared-material draws and preserves every cleaned rectangle and physical layer height',()=>{
 const layout=buildRoadSurfaceLayout([{x:10,z:20,w:12,d:90},{x:10,z:20,w:90,d:12}]),m=materials(),root=new THREE.Group(),before=JSON.stringify(layout),result=buildRoadSurfaceMeshes(root,layout,m,[{x:122,z:420,w:16,d:48,height:.22,centerY:-.055}]);
 assert.equal(root.children.length,3);assert.ok(root.children.every(o=>o instanceof THREE.InstancedMesh));assert.equal(result.meshes.concrete.material,m.sidewalk);assert.equal(result.meshes.asphalt.material,m.asphalt);assert.equal(result.meshes.markings.material,m.markings);assert.equal(result.meshes.concrete.geometry,result.meshes.asphalt.geometry);assert.ok(result.meshes.markings.geometry instanceof THREE.PlaneGeometry);assert.equal(result.stats.drawBatches,3);
 assert.equal(result.stats.foundationRectangles,layout.foundations.length);assert.equal(result.stats.extraFoundationRectangles,1);assert.equal(result.stats.concreteInstances,layout.foundations.length+layout.sidewalks.length+1);assert.equal(result.stats.totalInstances,result.stats.concreteInstances+layout.asphalt.length+layout.markings.length);assert.equal(result.stats.matrixBytes,result.stats.totalInstances*16*4);
 for(const [i,r]of layout.foundations.entries()){const b=instanceBounds(result.meshes.concrete,i);close(b.min.x,r.x-r.w/2);close(b.max.x,r.x+r.w/2);close(b.min.z,r.z-r.d/2);close(b.max.z,r.z+r.d/2);close(b.min.y,0);close(b.max.y,.06);}
 const deck=instanceBounds(result.meshes.concrete,layout.foundations.length);close(deck.min.y,-.165);close(deck.max.y,.055);close(deck.min.x,114);close(deck.max.z,444);
 for(const [i,r]of layout.sidewalks.entries()){const b=instanceBounds(result.meshes.concrete,layout.foundations.length+1+i);close(b.min.x,r.x-r.w/2);close(b.max.z,r.z+r.d/2);close(b.min.y,.06);close(b.max.y,.24);}
 for(const [i,r]of layout.asphalt.entries()){const b=instanceBounds(result.meshes.asphalt,i);close(b.min.x,r.x-r.w/2);close(b.max.z,r.z+r.d/2);close(b.min.y,.06);close(b.max.y,.14);}
 for(const [i,r]of layout.markings.entries()){const b=instanceBounds(result.meshes.markings,i);close(b.min.x,r.x-r.w/2);close(b.max.z,r.z+r.d/2);close(b.min.y,.17);close(b.max.y,.17);}
 assert.equal(JSON.stringify(layout),before);assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.stats));assert.ok(Object.values(m).every(mat=>mat.polygonOffset===false));
});

test('camera movement leaves static instance buffers, versions and bounds unchanged, without material depth-bias mutation',()=>{
 const root=new THREE.Group(),m=materials(),layout=buildRoadSurfaceLayout([{x:-430,z:0,w:10,d:720},{x:-102,z:0,w:12,d:700},{x:-92,z:0,w:12,d:700}]),result=buildRoadSurfaceMeshes(root,layout,m),camera=new THREE.PerspectiveCamera(75,1,.3,3000),saved=Object.values(result.meshes).map(mesh=>({mesh,array:mesh.instanceMatrix.array,values:Array.from(mesh.instanceMatrix.array),version:mesh.instanceMatrix.version,box:mesh.boundingBox!.clone(),sphere:mesh.boundingSphere!.clone()}));
 for(let frame=0;frame<60;frame++){camera.position.set(frame*10,5+frame,-frame*7);camera.lookAt(0,0,0);camera.updateMatrixWorld();root.updateMatrixWorld();}
 for(const s of saved){assert.equal(s.mesh.instanceMatrix.usage,THREE.StaticDrawUsage);assert.equal(s.mesh.matrixAutoUpdate,false);assert.equal(s.mesh.instanceMatrix.array,s.array);assert.deepEqual(Array.from(s.array),s.values);assert.equal(s.mesh.instanceMatrix.version,s.version);assert.ok(s.mesh.boundingBox!.equals(s.box));assert.ok(s.mesh.boundingSphere!.equals(s.sphere));assert.equal(s.mesh.renderOrder,0);}
 assert.ok(Object.values(m).every(mat=>!mat.polygonOffset));let sharedMaterialDisposals=0;for(const material of Object.values(m))material.addEventListener('dispose',()=>sharedMaterialDisposals++);result.dispose();result.dispose();assert.equal(root.children.length,0);assert.equal(sharedMaterialDisposals,0,'materials remain owned by the caller');
});

test('empty layers and invalid extra decks produce safe zero-capacity batches with finite bounds',()=>{
 const root=new THREE.Group(),layout=buildRoadSurfaceLayout([]),result=buildRoadSurfaceMeshes(root,layout,materials(),[{x:0,z:0,w:0,d:10,height:.22,centerY:0},{x:0,z:0,w:10,d:10,height:NaN,centerY:0}]);assert.equal(root.children.length,3);assert.equal(result.stats.totalInstances,0);for(const mesh of Object.values(result.meshes)){assert.equal(mesh.count,0);assert.equal(mesh.boundingSphere!.radius,0);assert.ok(mesh.boundingBox!.min.equals(new THREE.Vector3()));}
});
