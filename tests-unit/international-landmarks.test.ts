import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {InternationalLandmarks} from '../src/international-landmarks.ts';
import {NORTH_BUILDINGS,NORTH_LANDMARK,HAWAII_COTTAGES,BORDER_CUSTOMS_BUILDINGS} from '../worker/country-map.mjs';

test('national premises have one authoritative visual per real building, a 196m Aurora silhouette and bounded static batches',()=>{
 const root=new THREE.Group(),scene=new InternationalLandmarks(root,()=>new THREE.Sprite());
 assert.equal(scene.buildings.size,NORTH_BUILDINGS.length+HAWAII_COTTAGES.length+BORDER_CUSTOMS_BUILDINGS.length);
 let meshes=0,lights=0,dynamic=0;root.traverse(o=>{if(o instanceof THREE.Mesh)meshes++;if(o instanceof THREE.Light)lights++;if(o.userData.dynamicCity)dynamic++;});
 assert.equal(lights,0);assert.equal(dynamic,0);assert.ok(meshes<160,`static draw batches: ${meshes}`);assert.equal(scene.stats.cropRows,48);
 const tower=scene.buildings.get(NORTH_LANDMARK.id)!;root.updateMatrixWorld(true);const box=new THREE.Box3();tower.traverse(o=>{if(o instanceof THREE.Mesh)box.union(new THREE.Box3().setFromObject(o));});
 assert.ok(Math.abs(box.max.y-196)<.001);assert.equal(tower.position.x,NORTH_LANDMARK.x);assert.equal(tower.position.z,NORTH_LANDMARK.z);
 const matrices=new Map<THREE.Object3D,number[]>();root.traverse(o=>matrices.set(o,o.matrixWorld.toArray()));scene.updateLighting(1);scene.updateLighting(0);
 root.updateMatrixWorld(true);root.traverse(o=>assert.deepEqual(o.matrixWorld.toArray(),matrices.get(o),'lighting never moves/recreates fixed national buildings'));
});

test('all North service and customs roofs, including the airport, hide wall tops from moving overhead viewpoints without coplanar surfaces',()=>{
 const root=new THREE.Group(),scene=new InternationalLandmarks(root,()=>new THREE.Sprite());root.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(),direction=new THREE.Vector3();
 for(const b of [...NORTH_BUILDINGS.filter(b=>b.id!==NORTH_LANDMARK.id),...BORDER_CUSTOMS_BUILDINGS]){
  const g=scene.buildings.get(b.id)!,meshes:THREE.Mesh[]=[];g.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
  const wall=meshes.find(m=>(m.material as THREE.MeshStandardMaterial).color?.getHex()===0xd7d6c6)!,roof=meshes.find(m=>(m.material as THREE.MeshStandardMaterial).color?.getHex()===0x476668)!;
  assert.ok(wall&&roof,b.id);const walls=new THREE.Box3().setFromObject(wall),top=new THREE.Box3().setFromObject(roof);
  assert.ok(top.max.y-walls.max.y>.2,`${b.id}: exterior wall top cannot compete with the roof top`);assert.ok(Math.abs(top.max.y-b.h)<.0001,`${b.id}: roof keeps authoritative height`);
  for(const [dx,dz]of [[0,0],[b.w*.3,b.d*.3],[-b.w*.3,-b.d*.3]])for(const offset of [-20,0,20]){
   const target=new THREE.Vector3(b.x+dx,b.h,b.z+dz),origin=target.clone().add(new THREE.Vector3(offset,40,offset*.5));ray.set(origin,direction.copy(target).sub(origin).normalize());const hits=ray.intersectObjects(meshes,false);
   assert.ok(hits.length,b.id);assert.equal(hits[0].object,roof,`${b.id}: roof stays the nearest surface as the camera moves`);
   assert.ok(hits.every(h=>h.object===roof||Math.abs(h.distance-hits[0].distance)>.001),`${b.id}: no differently coloured coplanar roof hits`);
  }
 }
});

test('Aurora terrace caps own their visible top planes without glass or metal faces at the same height',()=>{
 const scene=new InternationalLandmarks(new THREE.Group(),()=>new THREE.Sprite()),tower=scene.buildings.get(NORTH_LANDMARK.id)!;
 const tiers=[18,46,74,102,130,154,173,184],counts=new Map(tiers.map(h=>[h,0]));
 tower.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const geometry=o.geometry.index?o.geometry.toNonIndexed():o.geometry,p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
  for(let i=0;i<p.count;i+=3){const y=p.getY(i),level=tiers.find(h=>Math.abs(h-y)<.0001);if(level==null||n.getY(i)<.99||n.getY(i+1)<.99||n.getY(i+2)<.99)continue;
   assert.equal((o.material as THREE.MeshStandardMaterial).color.getHex(),0xb7955b,`terrace ${level} has no overlaid glass/metal top`);counts.set(level,counts.get(level)!+1);
  }
  if(geometry!==o.geometry)geometry.dispose();
 });
 assert.ok([...counts.values()].every(n=>n>=2));
});
