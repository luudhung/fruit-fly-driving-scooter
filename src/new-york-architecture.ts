import * as THREE from 'three';
import type {Building} from '../worker/city-map.mjs';
type Part={buildingId:string;matrix:THREE.Matrix4};
/** Batched iron fire escapes keep the Manhattan street detail to immutable spatial batches. */
export class NewYorkArchitecture{
 private parts:Part[]=[];private batches:Array<{mesh:THREE.InstancedMesh;parts:Part[]}>=[];
 readonly stats={sourceInstances:0,activeInstances:0,sourceBuildings:0,activeBuildings:0,batchDraws:0};
 private tankParts:Part[]=[];private hiddenIds=new Set<string>();private signature:string|null=null;
 private buildings=new Set<string>();
 constructor(root:THREE.Object3D,buildings:Building[]){
  const d=new THREE.Object3D(),part=(b:Building,w:number,h:number,depth:number,x:number,y:number,z:number,angle=0)=>{d.position.set(b.x+x,y,b.z+z);d.rotation.set(0,0,angle);d.scale.set(w,h,depth);d.updateMatrix();this.parts.push({buildingId:b.id,matrix:d.matrix.clone()});};
  for(const b of buildings){
   if(b.x>380||Math.abs(b.z)>355||b.h<12||b.h>62||!['block','apartment'].includes(b.kind)||b.w<8)continue;
   this.buildings.add(b.id);
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
  // Every original bar is resident and unchanged. Smaller immutable bounds let
  // the renderer reject off-screen cells instead of submitting citywide ironwork.
  const ironGeometry=new THREE.BoxGeometry(1,1,1),ironMaterial=new THREE.MeshStandardMaterial({color:0x343e40,roughness:.72,metalness:.35});
  const tankGeometry=new THREE.CylinderGeometry(1.25,1.25,2.1,10),tankMaterial=new THREE.MeshStandardMaterial({color:0x796452,roughness:.88});
  for(const [parts,geometry,material,label]of [[this.parts,ironGeometry,ironMaterial,'NYC fire escapes'],[this.tankParts,tankGeometry,tankMaterial,'NYC roof tanks']] as const){
   const cells=new Map<string,Part[]>();for(const part of parts){const e=part.matrix.elements,key=`${Math.floor(e[12]/96)}:${Math.floor(e[14]/96)}`;let bucket=cells.get(key);if(!bucket){bucket=[];cells.set(key,bucket);}bucket.push(part);}
   for(const [key,cell]of cells){const mesh=new THREE.InstancedMesh(geometry,material,cell.length);mesh.name=`${label} ${key}`;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);this.batches.push({mesh,parts:cell});}
  }
  this.stats.batchDraws=this.batches.length;
  this.stats.sourceInstances=this.parts.length+this.tankParts.length;this.stats.sourceBuildings=this.buildings.size;
  this.sync([]);
 }
 sync(buildings:Array<{id:string;stage:string}>){
  this.hiddenIds=new Set(buildings.filter(b=>['cleared','collapsed','construction'].includes(b.stage)).map(b=>b.id));this.refresh();
 }
 /** All ironwork and tanks stay preloaded; camera movement never swaps building detail. */
 setView(_camera:THREE.Camera){}
 private refresh(){
  const key=[...this.hiddenIds].sort().join(',');
  if(key===this.signature)return;this.signature=key;let activeInstances=0;const visibleBuildings=new Set<string>();
  for(const {mesh,parts}of this.batches){
   let i=0;for(const p of parts)if(!this.hiddenIds.has(p.buildingId)){mesh.setMatrixAt(i++,p.matrix);visibleBuildings.add(p.buildingId);}
   mesh.count=i;mesh.visible=i>0;mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();activeInstances+=i;
  }
  this.stats.activeInstances=activeInstances;this.stats.activeBuildings=visibleBuildings.size;
 }
}
