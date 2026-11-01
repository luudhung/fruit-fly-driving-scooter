import * as THREE from 'three';
import {CityMotion} from './city-motion.ts';
import type {FireServiceSnapshot,EmergencyVehicle} from '../worker/fire-service.mjs';
type Sign=(text:string,fontSize?:number,scale?:number)=>THREE.Sprite;
const boxGeometry=new THREE.BoxGeometry(1,1,1);
/** Open-front three-bay French fire workshop. Parking and dispatch use these same bay coordinates. */
export function buildFireStation(root:THREE.Group,makeSign?:Sign){
 const g=new THREE.Group();g.position.set(830,0,-200);root.add(g);
 const brick=new THREE.MeshStandardMaterial({color:0x9b5141,roughness:.93}),stone=new THREE.MeshStandardMaterial({color:0xe1d3b9,roughness:.9}),roof=new THREE.MeshStandardMaterial({color:0x465b5b,roughness:.6,metalness:.25}),dark=new THREE.MeshStandardMaterial({color:0x384447,roughness:.75}),glass=new THREE.MeshBasicMaterial({color:0x7bafbf}),floor=new THREE.MeshStandardMaterial({color:0x7d817d,roughness:.97});
 const block=(w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material)=>{const m=new THREE.Mesh(boxGeometry,mat);m.scale.set(w,h,d);m.position.set(x,y,z);g.add(m);return m;};
 block(34,.24,24,0,.12,0,floor);block(1,9,24,-16.5,4.5,0,brick);
 for(const side of [-1,1]){block(33,9,1,0,4.5,side*11.5,brick);for(const x of [-11,-3,5,12])block(3,2,.08,x,6.4,side*12.03,glass);}
 for(const z of [-11.3,-4,4,11.3])block(1.1,8.8,1.1,16.4,4.4,z,stone);
 for(const z of [-8,0,8]){block(.7,1.2,6.6,16.4,8,z,dark);block(.12,.5,5.6,16.82,8.05,z,glass);block(3,.25,6.7,17.4,7.15,z,stone);}
 block(34.5,.65,24.5,0,9.15,0,roof);block(12,2.2,24,-10,10.25,0,brick);block(12.4,.45,24.4,-10,11.55,0,roof);
 for(const z of [-8,0,8])block(.08,1.2,4.8,-3.94,10.3,z,glass);
 block(8,.12,25,21,.08,0,floor);
 // Bay paint, wheel guidance and shared pale brick courses remain inexpensive geometry.
 for(const z of [-12,-4,4,12])block(8,.015,.10,21,.16,z,stone);
 for(let y=.8;y<8.8;y+=1.35){block(.08,.13,23,-17.04,y,0,stone);for(const side of [-1,1])block(33,.13,.08,0,y,side*12.04,stone);}
 block(.2,13,.2,22,6.5,14,dark);const flag=block(2.7,1.4,.06,23.25,11.5,14,new THREE.MeshBasicMaterial({color:0xc63c35}));flag.rotation.y=.15;
 if(makeSign){const sign=makeSign('SAPEURS-POMPIERS · RIVERSIDE',18,4);sign.position.set(1,12,0);g.add(sign);const bay=makeSign('GARAGE 01 · 02 · 03',19,2.5);bay.position.set(18,9.8,0);g.add(bay);}
 const batches=new Map<THREE.Material,THREE.Matrix4[]>();
 for(const child of [...g.children])if(child instanceof THREE.Mesh&&child.geometry===boxGeometry&&!Array.isArray(child.material)){child.updateMatrix();const matrices=batches.get(child.material)||[];matrices.push(child.matrix.clone());batches.set(child.material,matrices);g.remove(child);}
 for(const [material,matrices]of batches){const mesh=new THREE.InstancedMesh(boxGeometry,material,matrices.length);matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;g.add(mesh);}
 g.userData.buildingId='firestation';return g;
}

type VehicleVisual={motion:CityMotion;hasMotion:boolean;x:number;y:number;z:number;heading:number;data:EmergencyVehicle};
/** Five vehicles share eight instanced batches. Sirens and wheels never run on the server. */
export class FireServiceRenderer{
 private root=new THREE.Group();
 private vehicles=new Map<string,VehicleVisual>();
 private dummy=new THREE.Object3D();
 private body:THREE.InstancedMesh;private cabin:THREE.InstancedMesh;private glass:THREE.InstancedMesh;private wheels:THREE.InstancedMesh;private trim:THREE.InstancedMesh;private red:THREE.InstancedMesh;private blue:THREE.InstancedMesh;private equipment:THREE.InstancedMesh;
 private elapsed=0;
 constructor(scene:THREE.Object3D){
  scene.add(this.root);const batch=(geometry:THREE.BufferGeometry,material:THREE.Material,capacity:number)=>{const m=new THREE.InstancedMesh(geometry,material,capacity);m.count=0;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.frustumCulled=false;this.root.add(m);return m;};
  this.body=batch(boxGeometry,new THREE.MeshStandardMaterial({color:0xffffff,roughness:.43,metalness:.18}),5);
  this.cabin=batch(boxGeometry,new THREE.MeshStandardMaterial({color:0xffffff,roughness:.4,metalness:.2}),5);
  this.glass=batch(boxGeometry,new THREE.MeshStandardMaterial({color:0x81b6c8,roughness:.22,metalness:.25}),5);
  this.wheels=batch(new THREE.CylinderGeometry(.43,.43,.25,10),new THREE.MeshStandardMaterial({color:0x20282a,roughness:.95}),30);
  this.trim=batch(boxGeometry,new THREE.MeshBasicMaterial({color:0xe9e6d5}),70);
  this.red=batch(new THREE.SphereGeometry(.19,8,6),new THREE.MeshBasicMaterial({color:0xff3a30,toneMapped:false}),5);
  this.blue=batch(new THREE.SphereGeometry(.19,8,6),new THREE.MeshBasicMaterial({color:0x4489ff,toneMapped:false}),5);
  this.equipment=batch(boxGeometry,new THREE.MeshStandardMaterial({color:0x869497,roughness:.45,metalness:.6}),50);
 }
 sync(data:FireServiceSnapshot){
  const active=new Set<string>();for(const e of [...(data.engines||[]),...(data.ambulances||[])]){
   active.add(e.id);let v=this.vehicles.get(e.id);if(!v){v={motion:new CityMotion(),hasMotion:false,x:e.x,y:e.y,z:e.z,heading:e.heading,data:e};this.vehicles.set(e.id,v);}v.data=e;v.hasMotion=Boolean(e.traveling&&e.motion.points.length);if(v.hasMotion)v.motion.accept(e,e.motion);
  }
  for(const id of this.vehicles.keys())if(!active.has(id))this.vehicles.delete(id);
 }
 private place(mesh:THREE.InstancedMesh,i:number,x:number,y:number,z:number,yaw:number,scale:[number,number,number],wheel=false){const d=this.dummy;d.position.set(x,y,z);d.rotation.set(0,yaw,wheel?Math.PI/2:0);d.scale.set(...scale);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);}
 update(dt:number,gameNow:number,timeScale=120){
  this.elapsed+=Math.min(.1,Math.max(0,dt));let n=0,w=0,t=0,r=0,b=0,q=0;
  for(const v of this.vehicles.values()){
   const e=v.data;if(v.hasMotion){const oldX=v.motion.x,oldZ=v.motion.z;v.motion.advance(dt,gameNow,timeScale);const dx=v.motion.x-oldX,dz=v.motion.z-oldZ;if(Math.hypot(dx,dz)>.001)v.heading=Math.atan2(dx,dz);v.x=v.motion.x;v.y=v.motion.y;v.z=v.motion.z;}
   else{const blend=Math.min(1,dt*7);v.x+=(e.x-v.x)*blend;v.y+=(e.y-v.y)*blend;v.z+=(e.z-v.z)*blend;v.heading=e.heading;}
   const fire=e.kind==='fire',yaw=v.heading,sin=Math.sin(yaw),cos=Math.cos(yaw),y=v.y-1.1;
   const p=(localX:number,localY:number,localZ:number)=>[v.x+localX*cos+localZ*sin,y+localY,v.z-localX*sin+localZ*cos] as [number,number,number];
   this.place(this.body,n,...p(0,1.2,fire?-.7:-.25),yaw,[2.35,fire?1.5:1.9,fire?4.5:4.4]);
   this.place(this.cabin,n,...p(0,1.25,fire?2.2:2),yaw,[2.35,1.85,1.7]);
   const color=new THREE.Color(fire?0xc6332d:0xece9dc);this.body.setColorAt(n,color);this.cabin.setColorAt(n,color);
   this.place(this.glass,n,...p(0,1.7,fire?3.06:2.86),yaw,[1.95,.72,.06]);
   for(const side of [-1,1])for(const axle of fire?[-2,-.8,2]:[-1.6,1.8])this.place(this.wheels,w++,...p(side*1.18,.48,axle),yaw,[1,1,1],true);
   for(const side of [-1,1]){
    this.place(this.trim,t++,...p(side*1.19,1.35,fire?-.7:-.25),yaw,[.04,.2,fire?4.4:4.25]);
    if(!fire){this.place(this.equipment,q++,...p(side*1.21,1.77,-.2),yaw,[.05,.6,.85]);this.place(this.trim,t++,...p(side*1.25,1.77,-.2),yaw,[.05,.45,.14]);this.place(this.trim,t++,...p(side*1.25,1.77,-.2),yaw,[.05,.14,.46]);}
   }
   if(fire){for(const side of [-1,1])this.place(this.equipment,q++,...p(side*.45,2.23,-.7),yaw,[.1,.1,4.1]);for(let rung=0;rung<8;rung++)this.place(this.equipment,q++,...p(0,2.23,-2.4+rung*.48),yaw,[1,.08,.08]);}
   const flashing=e.emergency&&e.phase!=='idle';
   if(flashing&&Math.floor(this.elapsed*7)%2===0)this.place(this.red,r++,...p(-.68,2.45,2),yaw,[1,1,1]);
   if(flashing&&Math.floor(this.elapsed*7)%2===1)this.place(this.blue,b++,...p(.68,2.45,2),yaw,[1,1,1]);
   n++;
  }
  this.body.count=this.cabin.count=this.glass.count=n;this.wheels.count=w;this.trim.count=t;this.equipment.count=q;this.red.count=r;this.blue.count=b;
  for(const mesh of [this.body,this.cabin,this.glass,this.wheels,this.trim,this.equipment,this.red,this.blue])mesh.instanceMatrix.needsUpdate=true;
  if(this.body.instanceColor)this.body.instanceColor.needsUpdate=true;if(this.cabin.instanceColor)this.cabin.instanceColor.needsUpdate=true;
 }
}
