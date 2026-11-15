import * as THREE from 'three';
import {SPACEPORT,SPACEPORT_BUILDINGS,spaceflightPose,type SpaceMission} from '../worker/spaceport-map.mjs';
import {batchStaticMeshes} from './static-box-batches.ts';

export type SpaceProgramView={employees:number;missions:number;active:SpaceMission|null;lastMission:(SpaceMission&{completedAt:number})|null;cash:number};
type Sign=(text:string,fontSize?:number,scale?:number)=>THREE.Sprite;

const finish=(color:number,metalness=0)=>new THREE.MeshStandardMaterial({color,metalness,roughness:.75});
export class SpaceportRenderer{
 readonly buildings=new Map<string,THREE.Group>();
 readonly root=new THREE.Group();
 private readonly vehicle=new THREE.Group();
 private readonly plume=new THREE.Group();
 private readonly concrete=finish(0x77766b);
 private readonly siding=finish(0xa9b6bb,.28);
 private readonly trim=finish(0x334654,.36);
 private readonly steel=finish(0x647480,.48);
 private readonly glass=finish(0x436678,.35);
 private readonly stripe=new THREE.MeshBasicMaterial({color:0xd8bd68});
 private readonly lightPaint=new THREE.MeshBasicMaterial({color:0xd8ded8});

 constructor(parent:THREE.Group,sign:Sign){
  this.root.name=SPACEPORT.name;parent.add(this.root);
  const a=SPACEPORT.apron,p=SPACEPORT.pad,ground=new THREE.Group();
  this.box(ground,a.x,.075,a.z,a.w,.15,a.d,this.concrete);
  this.disc(ground,0,p.radius,.16,this.concrete);
  this.disc(ground,p.radius-2.5,p.radius-2.1,.205,this.stripe);
  this.disc(ground,4.1,4.3,.21,this.lightPaint);
  this.box(ground,p.x+18,.077,p.z+19,49,.15,7,this.concrete);
  batchStaticMeshes(ground);this.root.add(ground);
  for(const building of SPACEPORT_BUILDINGS){
   const g=new THREE.Group();g.position.set(building.x,0,building.z);g.name=building.name;
   if(building.id==='spaceworks-tower')this.tower(g,building.h);
   else{
    const {w,d,h}=building;
    this.box(g,0,(h-.4)/2,0,w,h-.4,d,this.siding);
    this.box(g,0,h-.2,0,w+.24,.4,d+.24,this.trim);
    this.box(g,0,h-2,d/2+.11,w,.85,.22,this.trim);
    if(building.id==='spaceworks-assembly'){
     this.box(g,0,8.3,d/2+.15,w*.55,16.6,.3,this.trim);
     for(let x=-w*.25;x<=w*.25;x+=2.5)this.box(g,x,8.2,d/2+.33,.2,16,.065,this.steel);
    }else{
     for(let x=-w/2+3;x<w/2-2;x+=4.2)this.box(g,x,h-4,d/2+.09,2.5,2.1,.1,this.glass);
     this.box(g,0,1.75,d/2+.10,4.8,3.5,.2,this.glass);
    }
    const label=sign(building.id==='spaceworks-control'?'HANSDREX SPACEWORKS':building.name.toUpperCase(),22,2.1);
    label.position.set(0,h+2,0);g.add(label);
   }
   batchStaticMeshes(g);this.buildings.set(building.id,g);this.root.add(g);
  }
  this.buildVehicle();
  this.root.add(this.vehicle);
  this.update(0,null);
 }
 private box(g:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,mat:THREE.Material){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);g.add(m);return m;
 }
 private disc(g:THREE.Group,inner:number,radius:number,y:number,mat:THREE.Material){
  const mesh=new THREE.Mesh(inner?new THREE.RingGeometry(inner,radius,40):new THREE.CircleGeometry(radius,40),mat);
  mesh.rotation.x=-Math.PI/2;mesh.position.set(SPACEPORT.pad.x,y,SPACEPORT.pad.z);g.add(mesh);
 }
 private brace(g:THREE.Group,a:THREE.Vector3,b:THREE.Vector3){
  const d=b.clone().sub(a),p=a.clone().addScaledVector(d,.5);
  this.box(g,p.x,p.y,p.z,d.length(),.25,.25,this.steel).quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),d.normalize());
 }
 private tower(g:THREE.Group,h:number){
  for(const x of [-2.25,2.25])for(const z of [-2.65,2.65])this.box(g,x,h/2,z,.42,h,.42,this.steel);
  for(let low=1;low<h-4;low+=5.2){
   this.box(g,0,low,0,5,.3,6,this.trim);
   for(const z of [-2.65,2.65])this.brace(g,new THREE.Vector3(-2.2,low,z),new THREE.Vector3(2.2,low+5,z));
   for(const x of [-2.25,2.25])this.brace(g,new THREE.Vector3(x,low,-2.6),new THREE.Vector3(x,low+5,2.6));
  }
  this.box(g,0,h-.25,0,5,.5,6,this.trim);
  this.box(g,-4,23.5,0,9,.4,1.8,this.steel);
 }
 private buildVehicle(){
  const capsule=finish(0xe5e5dc,.23);
  const stage=new THREE.Mesh(new THREE.CylinderGeometry(2.1,2.1,23,20),capsule);stage.position.y=12;this.vehicle.add(stage);
  const nose=new THREE.Mesh(new THREE.ConeGeometry(2.1,5.5,20),capsule);nose.position.y=26.25;this.vehicle.add(nose);
  for(const y of [3.2,18.4]){
   const ring=new THREE.Mesh(new THREE.CylinderGeometry(2.12,2.12,1.05,20),this.trim);ring.position.y=y;this.vehicle.add(ring);
  }
  for(const side of [-1,1])this.box(this.vehicle,side*1.9,2.6,0,1.25,3.3,1.18,this.trim);
  const trail=new THREE.Mesh(new THREE.ConeGeometry(1.9,8,14),new THREE.MeshBasicMaterial({color:0xf2ab46}));
  trail.rotation.z=Math.PI;trail.position.y=-3.2;this.plume.add(trail);
  this.vehicle.add(this.plume);batchStaticMeshes(this.vehicle);
 }
 update(age:number,value:SpaceProgramView|null|undefined){
  const p=spaceflightPose(age,value?.active||null);
  this.vehicle.position.set(p.x,p.y,p.z);
  this.vehicle.rotation.x=p.tilt;
  this.vehicle.visible=p.visible;
  this.plume.visible=p.firing;
 }
}
