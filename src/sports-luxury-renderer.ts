import * as THREE from 'three';
import {SceneViewBudget} from './view-budget.ts';
import {BUILDINGS} from '../worker/city-map.mjs';
import {privateHelicopterPose,type SportsLuxurySnapshot,type LuxuryHelicopter,type LuxuryPad} from '../worker/sports-luxury.mjs';

/** Private aviation uses seven shared instanced batches for the entire ten-aircraft fleet. */
export class SportsLuxuryRenderer{
 private fleet:LuxuryHelicopter[]=[];
 private pads=new Map<string,LuxuryPad>();
 private data:SportsLuxurySnapshot|null=null;
 private root=new THREE.Group();
 private dummy=new THREE.Object3D();
 private body:THREE.InstancedMesh;
 private cabin:THREE.InstancedMesh;
 private tail:THREE.InstancedMesh;
 private fin:THREE.InstancedMesh;
 private rotor:THREE.InstancedMesh;
 private skid:THREE.InstancedMesh;
 private tailRotor:THREE.InstancedMesh;
 private ball:THREE.Mesh;
 private tennisBalls:THREE.InstancedMesh;
 private padDecks:THREE.InstancedMesh;
 private padRings:THREE.InstancedMesh;
 private padMarks:THREE.InstancedMesh;
 private padLegs:THREE.InstancedMesh;
 private padSignature='';
 private padLabels:THREE.Sprite[]=[];
 private elapsed=0;
 private view=new SceneViewBudget({enterDistance:1400,leaveDistance:1530,frustumMargin:16,retainedMargin:28});
 private viewReady=false;private viewKey='';private buildingVisible:(id:string)=>boolean=()=>true;
 setView(camera:THREE.Camera,buildingVisible:(id:string)=>boolean=()=>true){
  this.view.setCamera(camera);this.viewReady=true;this.buildingVisible=buildingVisible;
  const key=(this.data?.pads||[]).filter(p=>this.view.visible(p,false,12)&&(!p.rooftop||buildingVisible(p.locationId))).map(p=>p.id).join('|');
  if(key!==this.viewKey){this.viewKey=key;this.padSignature='';if(this.data)this.sync(this.data);}
 }
 constructor(scene:THREE.Object3D,private makeSign?:(text:string,fontSize?:number,scale?:number)=>THREE.Sprite){
  scene.add(this.root);
  const paint=new THREE.MeshStandardMaterial({color:0xc5cbd0,metalness:.45,roughness:.35}),glass=new THREE.MeshStandardMaterial({color:0x83afba,metalness:.25,roughness:.3}),dark=new THREE.MeshStandardMaterial({color:0x242b31,metalness:.3,roughness:.55});
  const fleet=(geo:THREE.BufferGeometry,mat:THREE.Material,capacity=10)=>{const mesh=new THREE.InstancedMesh(geo,mat,capacity);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.root.add(mesh);return mesh;};
  this.padDecks=fleet(new THREE.CylinderGeometry(1,1,1,20),new THREE.MeshStandardMaterial({color:0x465b59,roughness:.85}),48);
  this.padRings=fleet(new THREE.RingGeometry(4.7,5,32),new THREE.MeshBasicMaterial({color:0xf0e6a9,side:THREE.DoubleSide}),48);
  this.padMarks=fleet(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0xf4efd2}),144);
  this.padLegs=fleet(new THREE.CylinderGeometry(.2,.2,4,6),new THREE.MeshStandardMaterial({color:0x6b7376,metalness:.4,roughness:.6}),192);
  this.body=fleet(new THREE.SphereGeometry(1,12,8),paint);
  this.cabin=fleet(new THREE.SphereGeometry(1,10,7),glass);
  this.tail=fleet(new THREE.BoxGeometry(.38,.38,4.4),dark);
  this.fin=fleet(new THREE.BoxGeometry(.18,1.5,1.1),paint);
  this.rotor=fleet(new THREE.BoxGeometry(7.6,.09,.2),dark,20);
  this.skid=fleet(new THREE.BoxGeometry(.12,.12,3.2),dark,20);
  this.tailRotor=fleet(new THREE.BoxGeometry(.09,1.8,.12),dark);
  this.ball=new THREE.Mesh(new THREE.SphereGeometry(.35,8,6),new THREE.MeshBasicMaterial({color:0xfff4dc}));this.ball.visible=false;this.root.add(this.ball);
  this.tennisBalls=fleet(new THREE.SphereGeometry(.16,6,4),new THREE.MeshBasicMaterial({color:0xe6f441}),2);
 }
 sync(data:SportsLuxurySnapshot){
  this.data=data;this.fleet=data.helicopters||[];
  const signature=(data.pads||[]).map(p=>`${p.id}:${p.x}:${p.y}:${p.z}:${p.householdIds?.join(",")}`).join('|');
  if(signature===this.padSignature)return;this.padSignature=signature;this.pads.clear();
  for(const label of this.padLabels){label.removeFromParent();label.material.map?.dispose();label.material.dispose();}this.padLabels=[];
  let pi=0,mi=0,li=0;
  for(const pad of (data.pads||[]).slice(0,48)){
   const radius=pad.radius??6,size=radius/6;
   this.pads.set(pad.id,pad);
   if(this.viewReady&&(!this.view.visible(pad,false,12)||pad.rooftop&&!this.buildingVisible(pad.locationId)))continue;
   this.place(this.padDecks,pi,pad.x,pad.y-.15,pad.z,0,[radius,.3,radius]);
   this.dummy.position.set(pad.x,pad.y+.02,pad.z);this.dummy.rotation.set(-Math.PI/2,0,0);this.dummy.scale.set(size,size,1);this.dummy.updateMatrix();this.padRings.setMatrixAt(pi++,this.dummy.matrix);
   for(const side of [-1,1])this.place(this.padMarks,mi++,pad.x+side*1.8*size,pad.y+.10,pad.z,0,[.65*size,.08,6.6*size]);
   this.place(this.padMarks,mi++,pad.x,pad.y+.10,pad.z,0,[4.2*size,.08,.65*size]);
   if(pad.rooftop&&this.makeSign){const label=this.makeSign('H · '+(pad.householdIds?.join(' / ')||pad.name.replace(' rooftop','').toUpperCase()),18,5);label.material.depthTest=true;label.position.set(pad.x,pad.y+7,pad.z);this.root.add(label);this.padLabels.push(label);}
   if(pad.rooftop){
    const house = BUILDINGS.find(building => building.id === pad.locationId)?.kind === 'house';
    const length = house ? 6.2 : 4;
    for(const x of [-3.5,3.5])for(const z of [-3.5,3.5]){
     this.place(this.padLegs,li++,pad.x+x*size,pad.y-length/2,pad.z+z*size,0,[1,length/4,1]);
    }
   }
  }
  this.padDecks.count=this.padRings.count=pi;this.padMarks.count=mi;this.padLegs.count=li;
  for(const mesh of [this.padDecks,this.padRings,this.padMarks,this.padLegs])mesh.instanceMatrix.needsUpdate=true;
 }
 private place(mesh:THREE.InstancedMesh,index:number,x:number,y:number,z:number,yaw:number,scale:[number,number,number]=[1,1,1],roll=0){
  const d=this.dummy;d.position.set(x,y,z);d.rotation.set(0,yaw,roll);d.scale.set(...scale);d.updateMatrix();mesh.setMatrixAt(index,d.matrix);
 }
 update(dt:number,gameNow:number){
  this.elapsed+=Math.max(0,Math.min(dt,.1));let i=0;
  for(const heli of this.fleet.slice(0,10)){
   const pad=this.pads.get(heli.padId),flight=heli.flight;
   if(!pad&&(!flight||gameNow<flight.departure))continue;
   if(flight&&gameNow>=flight.arrival&&flight.to.rooftop&&!this.pads.has(flight.to.id))continue;
   const flying=Boolean(flight&&gameNow>=flight.departure&&gameNow<flight.arrival);
   const pose=flight&&gameNow>=flight.departure?privateHelicopterPose(gameNow,flight):{x:(pad||flight!.from).x,y:(pad||flight!.from).y+1.8,z:(pad||flight!.from).z,heading:Math.PI/2};
   if(this.viewReady&&!this.view.visible(pose,false,8))continue;
   const {x,y,z}=pose,yaw=pose.heading,sin=Math.sin(yaw),cos=Math.cos(yaw);
   const color=new THREE.Color().setHSL((i*.61803398875)%1,.28,.45);this.body.setColorAt(i,color);this.fin.setColorAt(i,color);
   this.place(this.body,i,x,y,z,yaw,[1.25,.85,1.8]);
   this.place(this.cabin,i,x-sin*1.15,y+.24,z-cos*1.15,yaw,[1.02,.7,1.03]);
   this.place(this.tail,i,x+sin*3.1,y+.1,z+cos*3.1,yaw);
   this.place(this.fin,i,x+sin*5.1,y+.75,z+cos*5.1,yaw);
   const spin=flying?this.elapsed*34:yaw;
   for(let r=0;r<2;r++)this.place(this.rotor,i*2+r,x,y+1.35,z,spin+r*Math.PI/2);
   for(const side of [-1,1])this.place(this.skid,i*2+(side===1?1:0),x+cos*side*1.1,y-1,z-sin*side*1.1,yaw);
   this.place(this.tailRotor,i,x+sin*5.2+cos*.2,y+.4,z+cos*5.2-sin*.2,yaw,[1,1,1],flying?this.elapsed*35:0);
   i++;
  }
  this.body.count=this.cabin.count=this.tail.count=this.fin.count=this.tailRotor.count=i;this.rotor.count=this.skid.count=i*2;
  for(const mesh of [this.body,this.cabin,this.tail,this.fin,this.tailRotor,this.rotor,this.skid])mesh.instanceMatrix.needsUpdate=true;
  if(this.body.instanceColor)this.body.instanceColor.needsUpdate=true;if(this.fin.instanceColor)this.fin.instanceColor.needsUpdate=true;
  const m=this.data?.match;this.ball.visible=Boolean(m&&m.players.length>=2&&gameNow>=m.startsAt&&gameNow<m.endsAt);
  if(this.ball.visible){const phase=gameNow/95;this.ball.position.set(770+Math.sin(phase)*10,.6+Math.abs(Math.sin(phase*2))*.8,200+Math.sin(phase*.63)*17);}
  const participants=this.data?.participants.filter(p=>p.kind==='tennis')||[],courts=Math.ceil(participants.length/2);this.tennisBalls.count=Math.min(2,courts);
  for(let court=0;court<this.tennisBalls.count;court++){const t=gameNow/28+court;this.place(this.tennisBalls,court,830+(court?10:-10)+Math.sin(t*.7)*4,.7+Math.abs(Math.cos(t))*2,120+Math.sin(t)*11,0);}
  this.tennisBalls.instanceMatrix.needsUpdate=true;
 }
}
