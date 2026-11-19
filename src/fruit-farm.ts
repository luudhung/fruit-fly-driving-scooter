import * as THREE from 'three';
import {HANSDREX_FRUIT_FARM as FARM} from '../worker/fruit-farm-map.mjs';
import {batchStaticMeshes} from './static-box-batches.ts';
type Sign=(text:string,width:number,height:number)=>THREE.Sprite;
/** Permanent orchard silhouettes. Production and stock run in the simulation;
 * these shared batches need no per-frame crop animation or additional lights. */
export function buildFruitFarm(parent:THREE.Group,sign:Sign){
 const root=new THREE.Group();root.name=FARM.name;parent.add(root);
 const grass=new THREE.MeshStandardMaterial({color:0x6d8646,roughness:1}),soil=new THREE.MeshStandardMaterial({color:0x746343,roughness:1}),wood=new THREE.MeshStandardMaterial({color:0x776248,roughness:.95}),leaves=new THREE.MeshStandardMaterial({color:0x406f3b,roughness:1}),fruit=new THREE.MeshStandardMaterial({color:0xd8883c,roughness:.75}),stone=new THREE.MeshStandardMaterial({color:0xc5b9a0,roughness:.9}),roof=new THREE.MeshStandardMaterial({color:0x5c6e62,roughness:.8}),door=new THREE.MeshStandardMaterial({color:0x364d49,roughness:.9});
 const box=(g:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);g.add(mesh);return mesh;};
 box(root,FARM.x,.08,FARM.z,FARM.w,.12,FARM.d,grass);
 for(let row=0;row<10;row++)box(root,FARM.x-4,.19,FARM.z-FARM.d/2+8+row*13.5,FARM.w-14,.08,7.5,soil);
 // A clear vehicle/service aisle on the east, with open gate opposite the road.
 box(root,1037,.14,FARM.z,7,.1,FARM.d+8,stone);
 box(root,1041,.15,FARM.gate.z,17,.1,8,stone);
 const dummy=new THREE.Object3D(),trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.3,.42,3.8,6),wood,FARM.trees),crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.8,1),leaves,FARM.trees),fruits=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.28,0),fruit,FARM.trees*3);
 for(let i=0;i<FARM.trees;i++){
  const row=Math.floor(i/10),col=i%10,x=FARM.x-FARM.w/2+6+col*10.5,z=FARM.z-FARM.d/2+8+row*13.5;
  dummy.position.set(x,2.04,z);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
  dummy.position.y=5;dummy.scale.set(1,1.12,1);dummy.rotation.y=i*.61;dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);
  for(let j=0;j<3;j++){const angle=i*.61+j*Math.PI*2/3;dummy.position.set(x+Math.cos(angle)*2.45,4.5+j*.3,z+Math.sin(angle)*2.45);dummy.scale.set(1,1,1);dummy.updateMatrix();fruits.setMatrixAt(i*3+j,dummy.matrix);}
 }
 for(const mesh of [trunks,crowns,fruits]){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();root.add(mesh);}
 // Low fence frames the rows without crossing the gate or access lane.
 for(const z of [FARM.z-FARM.d/2-1,FARM.z+FARM.d/2+1])for(const y of [.8,1.65])box(root,FARM.x,y,z,FARM.w+2,.12,.12,wood);
 for(const x of [FARM.x-FARM.w/2-1,FARM.x+FARM.w/2+1])for(let z=FARM.z-FARM.d/2;z<=FARM.z+FARM.d/2;z+=10){
  if(x>FARM.x&&Math.abs(z-FARM.gate.z)<7)continue;
  box(root,x,1,z,.25,2,.25,wood);for(const y of [.8,1.65])if(z<FARM.z+FARM.d/2)box(root,x,y,z+4,.12,.12,8,wood);
 }
 const b=FARM.packingHouse,packing=new THREE.Group();packing.position.set(b.x,0,b.z);packing.name='Fruit packing and seed nursery';packing.userData.buildingId=b.id;root.add(packing);
 box(packing,0,(b.h-.3)/2,0,b.w,b.h-.3,b.d,stone);box(packing,0,b.h-.15,0,b.w+.5,.3,b.d+.5,roof);
 box(packing,0,2.15,b.d/2+.06,7,4.3,.1,door);box(packing,b.w/2+.06,2.15,0,.1,4.3,7,door);
 const title=sign('HANSDREX FRUIT COOPERATIVE',30,1.7);title.position.set(0,b.h+2,0);packing.add(title);
 const gate=sign('ORCHARD · PACKING · SEED NURSERY',24,1.1);gate.position.set(FARM.gate.x,4,FARM.gate.z);root.add(gate);
 batchStaticMeshes(root);batchStaticMeshes(packing);
 return {root,buildings:new Map([[b.id,packing]])};
}
