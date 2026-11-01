import * as THREE from 'three';
import type {Building} from '../worker/city-map.mjs';
type Part={buildingId:string;matrix:THREE.Matrix4};
/** Batched iron fire escapes keep the Manhattan street detail to two draw calls citywide. */
export class NewYorkArchitecture{
 private parts:Part[]=[];private iron:THREE.InstancedMesh;private tanks:THREE.InstancedMesh;
 private tankParts:Part[]=[];private hidden='';
 constructor(root:THREE.Object3D,buildings:Building[]){
  const d=new THREE.Object3D(),part=(b:Building,w:number,h:number,depth:number,x:number,y:number,z:number,angle=0)=>{d.position.set(b.x+x,y,b.z+z);d.rotation.set(0,0,angle);d.scale.set(w,h,depth);d.updateMatrix();this.parts.push({buildingId:b.id,matrix:d.matrix.clone()});};
  for(const b of buildings){
   if(b.x>380||Math.abs(b.z)>355||b.h<12||b.h>62||!['block','apartment'].includes(b.kind)||b.w<8)continue;
   const front=b.d/2+.85,level=3.2,width=Math.min(4.4,b.w*.7);
   // Platforms start above head height. The final ladder is retracted, keeping sidewalks clear.
   for(let y=4.3,floor=0;y<b.h-1.5;y+=level,floor++){
    part(b,width,.10,1.35,0,y,front);for(const railY of [y+.42,y+1.05])part(b,width,.055,.055,0,railY,front+.69);
    for(let x=-width/2;x<=width/2+.01;x+=.65)part(b,.045,1.05,.045,x,y+.55,front+.69);
    for(const x of [-width/2,width/2]){part(b,.07,1.1,1.3,x,y+.55,front);part(b,.085,.085,1.45,x,y-.2,front-.1);}
    if(y+level<b.h-1.5){
     const sign=floor%2?1:-1,run=width-.55,angle=Math.atan2(level,sign*run),length=Math.hypot(run,level);
     for(const z of [front-.3,front+.3])part(b,length,.085,.065,0,y+level/2,z,angle);
     for(let step=0;step<=11;step++){const u=step/11;part(b,.32,.055,.70,sign*(-run/2+u*run),y+u*level,front);}
     part(b,length,.055,.055,0,y+level/2+.9,front+.38,angle);
    }
   }
   if(b.h>24&&this.tankParts.length<28){
    d.position.set(b.x-b.w*.22,b.h+1.4,b.z-b.d*.2);d.rotation.set(0,0,0);d.scale.set(1,1,1);d.updateMatrix();this.tankParts.push({buildingId:b.id,matrix:d.matrix.clone()});
    for(const x of [-1,1])for(const z of [-1,1])part(b,.12,1.3,.12,-b.w*.22+x,b.h+.65,-b.d*.2+z);
   }
  }
  this.iron=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x343e40,roughness:.72,metalness:.35}),this.parts.length);
  this.tanks=new THREE.InstancedMesh(new THREE.CylinderGeometry(1.25,1.25,2.1,10),new THREE.MeshStandardMaterial({color:0x796452,roughness:.88}),this.tankParts.length);
  root.add(this.iron,this.tanks);this.sync([]);
 }
 sync(buildings:Array<{id:string;stage:string}>){
  const hidden=new Set(buildings.filter(b=>['cleared','collapsed','construction'].includes(b.stage)).map(b=>b.id));const key=[...hidden].sort().join('|');if(this.hidden===key&&this.iron.count===this.parts.length&&this.iron.instanceMatrix.version>0)return;this.hidden=key;
  for(const [mesh,parts]of [[this.iron,this.parts],[this.tanks,this.tankParts]] as const){let i=0;for(const p of parts)if(!hidden.has(p.buildingId))mesh.setMatrixAt(i++,p.matrix);mesh.count=i;mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
 }
}
