import * as THREE from 'three';
import type {CivicSnapshot} from '../worker/civic-conflict.mjs';
/** Symbolic props follow the same resident positions; the server alone decides civic outcomes. */
export class CivicConflictRenderer{
 private data:CivicSnapshot|null=null;
 private poles:THREE.InstancedMesh;
 private banners:THREE.InstancedMesh;
 private equipment:THREE.InstancedMesh;
 private positions=new Map<string,{x:number;y:number;z:number}>();
 private dummy=new THREE.Object3D();
 private colors={unrest:new THREE.Color(0xd7774c),member:new THREE.Color(0xdfcc94),mediator:new THREE.Color(0x7dcba2),police:new THREE.Color(0x719fc8)};
 constructor(root:THREE.Object3D){
  this.poles=new THREE.InstancedMesh(new THREE.CylinderGeometry(.035,.035,1.4,4),new THREE.MeshStandardMaterial({color:0x6e7678}),24);
  this.banners=new THREE.InstancedMesh(new THREE.BoxGeometry(.8,.5,.05),new THREE.MeshBasicMaterial({color:0xffffff}),24);
  this.equipment=new THREE.InstancedMesh(new THREE.BoxGeometry(.18,.18,.6),new THREE.MeshStandardMaterial({color:0xe8b85d}),24);
  for(const mesh of [this.poles,this.banners,this.equipment]){mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);}
 }
 sync(data:CivicSnapshot){this.data=data;}
 updateActor(id:string,position:{x:number;y:number;z:number}){this.positions.set(id,position);}
 update(){
  let n=0,e=0;const d=this.dummy,active=new Set<string>();
  for(const incident of this.data?.active||[])for(const member of incident.members){
   if(n>=24)break;active.add(member.id);if(!member.present)continue;
   const p=this.positions.get(member.id)||{x:member.x??incident.x??0,y:1.1,z:member.z??incident.z??0};
   d.scale.set(1,1,1);d.rotation.set(0,0,0);d.position.set(p.x+.6,p.y+.65,p.z);d.updateMatrix();this.poles.setMatrixAt(n,d.matrix);
   d.position.set(p.x+1,p.y+1.1,p.z);d.updateMatrix();this.banners.setMatrixAt(n,d.matrix);this.banners.setColorAt(n,incident.phase==='unrest'?this.colors.unrest:this.colors[member.role]);n++;
   if(member.equipment){d.position.set(p.x-.55,p.y+.1,p.z);d.updateMatrix();this.equipment.setMatrixAt(e++,d.matrix);}
  }
  for(const id of this.positions.keys())if(!active.has(id))this.positions.delete(id);
  this.poles.count=this.banners.count=n;this.equipment.count=e;
  for(const mesh of [this.poles,this.banners,this.equipment])mesh.instanceMatrix.needsUpdate=true;
  if(this.banners.instanceColor)this.banners.instanceColor.needsUpdate=true;
 }
}
