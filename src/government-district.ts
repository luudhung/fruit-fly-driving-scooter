import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GOVERNMENT_BUILDINGS,MILITARY_AIRFIELD,MILITARY_NAVAL_BASE,militaryAircraftPose,type MilitaryAircraft} from '../worker/government-map.mjs';
import type {PublicServicesSnapshot} from '../worker/public-services.mjs';
import {militaryShipPose,type MilitaryLifeSnapshot} from '../worker/military-life.mjs';
type Sign=(text:string,width:number,height:number)=>THREE.Sprite;
type Part={geometry:THREE.BufferGeometry;material:THREE.Material};
const cream=new THREE.MeshStandardMaterial({color:0xe6dfce,roughness:.85}),white=new THREE.MeshStandardMaterial({color:0xf0eee2,roughness:.8}),slate=new THREE.MeshStandardMaterial({color:0x475361,roughness:.9}),stone=new THREE.MeshStandardMaterial({color:0xb6b6a7,roughness:.95}),olive=new THREE.MeshStandardMaterial({color:0x697d68,roughness:.9}),wood=new THREE.MeshStandardMaterial({color:0x705c47,roughness:1}),grass=new THREE.MeshStandardMaterial({color:0x52765a,roughness:1}),asphalt=new THREE.MeshStandardMaterial({color:0x333d44,roughness:1}),paint=new THREE.MeshBasicMaterial({color:0xe6e5d6,toneMapped:false}),windows=new THREE.MeshBasicMaterial({color:0xffd8a4,toneMapped:false}),blue=new THREE.MeshBasicMaterial({color:0x2a4f76});
type MilitaryMemberVisual={id:string;x?:number;y?:number;z?:number;indoors?:boolean;onPlane?:boolean;onTrain?:boolean;armed?:boolean};
type MemberPosition={x:number;y:number;z:number};
type MilitaryVisualState=Pick<MilitaryLifeSnapshot,'ships'|'shots'>;

class ShapeBatch{
 parts:Part[]=[];
 box(material:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number){this.parts.push({geometry:new THREE.BoxGeometry(w,h,d).translate(x,y,z),material});}
 column(material:THREE.Material,x:number,y:number,z:number,r:number,h:number){this.parts.push({geometry:new THREE.CylinderGeometry(r,r*1.08,h,8).translate(x,y,z),material});}
 roof(material:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number){
  const g=new THREE.BoxGeometry(w,h,d),p=g.getAttribute('position');for(let i=0;i<p.count;i++)if(p.getY(i)>0){p.setX(i,p.getX(i)*.78);p.setZ(i,p.getZ(i)*.76);}g.computeVertexNormals();g.translate(x,y,z);this.parts.push({geometry:g,material});
 }
 finish(parent:THREE.Object3D){
  const layers=new Map<THREE.Material,THREE.BufferGeometry[]>();for(const p of this.parts){if(!layers.has(p.material))layers.set(p.material,[]);layers.get(p.material)!.push(p.geometry);}
  for(const [material,parts]of layers){const geometry=mergeGeometries(parts);if(geometry)parent.add(new THREE.Mesh(geometry,material));for(const p of parts)p.dispose();}
 }
}
function facadeWindows(batch:ShapeBatch,w:number,d:number,wallHeight:number,spacing=4){
 for(const front of [-1,1])for(let x=-w/2+3;x<w/2-1;x+=spacing)for(let y=4;y<wallHeight-1;y+=3.7){
  batch.box(windows,x,y,front*(d/2+.02),1.3,1.9,.04);
  batch.box(white,x,y-1.1,front*(d/2+.1),1.7,.15,.22);
 }
 for(const side of [-1,1])for(let z=-d/2+3;z<d/2-1;z+=4.2)for(let y=4;y<wallHeight-1;y+=3.7)batch.box(windows,side*(w/2+.02),y,z,.04,1.9,1.3);
}
function whiteHouse(){
 const group=new THREE.Group();group.position.set(-390,0,-310);const b=new ShapeBatch();
 b.box(stone,0,.3,0,42,.6,22);b.box(white,0,7.5,0,22,14.5,18);
 for(const side of [-1,1]){b.box(white,side*16,5.8,0,10,11,14);b.box(stone,side*16,11.6,0,10.5,.5,14.5);}
 b.box(white,0,15.2,0,23,.6,19);b.box(slate,0,15.8,0,22,.6,18);
 facadeWindows(b,20,18,14.8,4);
 for(const side of [-1,1])for(const x of [side*13,side*17,side*20])for(const y of [4.5,8.4])b.box(windows,x,y,7.03,1.3,1.9,.05);
 // A real columned front portico, bounded by the same authoritative footprint.
 for(let x=-8;x<=8;x+=3.2){b.column(white,x,6.7,9.4,.44,11.3);b.box(stone,x,1,9.4,1,.4,1);}
 b.box(white,0,12.6,9.2,19,.8,3.3);b.box(white,0,13.35,9.2,17,.5,3.3);
 const pediment=new THREE.ConeGeometry(9.5,3,3).rotateY(Math.PI/2).scale(1,.65,.23).translate(0,14.6,9.2);b.parts.push({geometry:pediment,material:white});
 for(let i=0;i<4;i++)b.box(stone,0,.25+i*.18,10+i*.25,17-i*.8,.35,2-i*.2);
 b.box(blue,0,3,9.06,2.3,4,.12);b.column(stone,0,17,0,.12,2);b.box(blue,1.3,17.7,0,2.4,.95,.07);
 b.finish(group);return group;
}
function policeHeadquarters(){
 const group=new THREE.Group();group.position.set(710,0,-300);const b=new ShapeBatch();
 b.box(stone,0,.3,0,42,.6,32);b.box(cream,0,10.5,0,42,20.4,32);facadeWindows(b,42,32,20.5,4.8);
 for(const y of [3.5,19.8])b.box(white,0,y,0,42.5,.4,32.5);
 b.roof(slate,0,22.8,0,42.4,4.4,32.4);
 for(let x=-17;x<=17;x+=5.6){b.box(cream,x,22.6,13.5,2.6,2.5,2);b.box(windows,x,22.7,14.55,1.4,1.5,.04);}
 b.box(blue,0,5,16.04,9,1.2,.12);b.box(blue,0,2.2,16.05,3.1,3.8,.12);
 for(const x of [-4.8,4.8])b.column(white,x,3.3,16.3,.35,5.8);
 b.box(stone,0,.35,17,11,.6,2);b.finish(group);return group;
}
function barracks(){
 const group=new THREE.Group();group.position.set(710,0,-560);const b=new ShapeBatch();
 b.box(stone,0,.25,0,98,.5,34);b.box(cream,0,6.9,0,98,13.3,34);facadeWindows(b,98,34,13.5,5.6);
 b.roof(slate,0,15.1,0,98,3.8,34);
 for(const x of [-30,0,30]){b.box(olive,x,2.4,17.1,3,4,.15);b.box(white,x,4.8,17.3,5,.3,1);}
 b.finish(group);return group;
}
function hangar(x:number){
 const group=new THREE.Group();group.position.set(x,0,-665);const b=new ShapeBatch();
 b.box(stone,0,.2,0,42,.4,30);b.box(olive,0,6,0,42,11.8,30);b.roof(slate,0,12.1,0,42,1.8,30);
 b.box(asphalt,0,5.7,-15.05,32,10.2,.16);
 for(const x of [-10,-5,0,5,10])b.box(stone,x,5.8,-15.2,.12,10.1,.16);
 b.finish(group);return group;
}
function navalWatch(){
 const group=new THREE.Group(),b=new ShapeBatch();group.position.set(502,0,-605);
 b.box(stone,0,3.2,0,12,6.4,18);b.box(slate,0,7,0,12.6,.7,18.6);
 b.box(cream,0,9.5,-4,8,5,8);b.box(blue,0,10.2,.05,6.5,1.7,.1);b.box(slate,0,12.3,-4,8.6,.5,8.6);
 b.column(stone,0,13,-4,.12,2);b.box(blue,1.2,13.6,-4,2.3,.8,.06);b.finish(group);return group;
}
function navalGrounds(){
 const group=new THREE.Group(),b=new ShapeBatch(),{dock,berths,range}=MILITARY_NAVAL_BASE;
 group.name='Riverside naval jetty and training range';
 b.box(stone,dock.x,.45,dock.z,dock.w,.7,dock.d);
 for(const berth of berths){
  b.box(wood,476,.72,berth.z+12,28,.35,5);
  b.parts.push({geometry:new THREE.BoxGeometry(12,.18,2).rotateZ(-Math.atan2(1.9,12)).translate(469,1.75,berth.z+12),material:stone});
  for(const x of [466,478,490])b.column(slate,x,-.1,berth.z+12,.34,3);
  for(const side of [-1,1])b.column(slate,490,.98,berth.z+side*9,.24,1.1);
 }
 b.box(stone,range.x,.13,range.z,range.w,.12,range.d);
 // The range faces a dedicated earth backstop, away from the formation square.
 b.box(wood,range.x+range.w/2-1,1.5,range.z,2,3,range.d);
 for(const z of [-8,0,8]){b.box(paint,range.x+10,1.7,range.z+z,.15,2,1.4);b.box(blue,range.x+9.9,1.8,range.z+z,.04,.6,.6);}
 b.finish(group);return group;
}
function patrolShip(){
 const group=new THREE.Group(),b=new ShapeBatch();group.name='River patrol ship';
 const hull=new THREE.BoxGeometry(12,3.6,48),vertices=hull.getAttribute('position');
 for(let i=0;i<vertices.count;i++){if(vertices.getZ(i)>0)vertices.setX(i,vertices.getX(i)*.28);if(vertices.getY(i)<0)vertices.setX(i,vertices.getX(i)*.7);}
 hull.computeVertexNormals();hull.translate(0,.7,0);b.parts.push({geometry:hull,material:slate});
 b.box(stone,0,2.6,-3,10.2,.35,36);b.box(cream,0,4.7,-5,7.5,4,13);b.box(blue,0,5.2,1.55,6.5,1.1,.12);
 b.box(slate,0,7,-6,8,.6,12);b.column(stone,0,10,-7,.22,6);b.box(slate,0,12.6,-7,6,.25,.5);
 b.column(slate,0,3.5,11,1.7,1.6);b.box(slate,0,4,15,.3,.3,5.5);
 b.column(stone,-2.2,4,-17,.45,2.2);b.column(stone,2.2,4,-17,.45,2.2);
 for(const side of [-1,1])for(let z=-18;z<=12;z+=6)b.column(stone,side*4.3,3.25,z,.055,1.1);
 b.finish(group);return group;
}
function grounds(){
 const group=new THREE.Group(),b=new ShapeBatch();
 b.box(grass,-390,.08,-306,58,.13,50);b.box(stone,-390,.17,-288.5,4,.1,19);
 for(const x of [-413,-367])for(const z of [-324,-288]){b.box(grass,x,.3,z,8,.5,5);b.box(white,x,.12,z,9,.1,6);}
 b.box(stone,710,.1,-300,56,.15,48);b.box(grass,710,.17,-300,52,.1,44);
 b.box(grass,710,.07,-610,260,.1,190);b.box(stone,710,.12,-625,104,.1,60);
 for(let row=0;row<5;row++)b.box(paint,710,.18,-639+row*6,62,.01,.08);
 b.box(stone,710,.13,-515,10,.12,35);b.box(stone,710,.13,-598,5,.12,55);
 for(const side of [-1,1]){
  b.box(stone,710+side*120,.25,-610,1,.5,180);
  for(let z=-695;z<=-525;z+=10)b.column(stone,710+side*120,1,z,.11,1.7);
 }
 for(const x of [695,725])b.column(stone,x,3.3,-515,.2,6.5);
 b.column(stone,762,7,-620,.12,14);b.box(blue,764,12.5,-620,4,2,.08);
 b.box(asphalt,710,.13,-735,240,.12,18);b.box(stone,710,.05,-735,244,.1,22);
 b.box(asphalt,710,.14,-709,240,.12,9);
 for(let x=600;x<=820;x+=18)b.box(paint,x,.2,-735,8,.013,.25);
 for(const x of [599,821])for(let z=-741;z<=-729;z+=3)b.box(paint,x,.2,z,10,.013,1);
 for(const stand of MILITARY_AIRFIELD.stands){b.box(asphalt,stand.x,.14,stand.z,28,.12,28);b.box(asphalt,stand.x,.14,-700,8,.12,25);b.box(paint,stand.x,.205,stand.z,8,.012,.15);}
 b.finish(group);return group;
}
function aircraftGeometry(){
 const batch=new ShapeBatch();
 batch.parts.push({geometry:new THREE.CylinderGeometry(.85,1.1,8.8,8).rotateX(Math.PI/2),material:olive});
 batch.parts.push({geometry:new THREE.ConeGeometry(.85,3,8).rotateX(Math.PI/2).translate(0,0,5.8),material:olive});
 batch.box(blue,0,.75,2,1.1,.6,2.5);
 for(const side of [-1,1]){
  const wing=new THREE.BoxGeometry(5.2,.13,2.3).rotateY(side*.36).translate(side*3.3,-.2,-.3);batch.parts.push({geometry:wing,material:olive});
  batch.box(slate,side*.65,-.5,-3.6,.75,.75,2.4);batch.box(stone,side*1.4,-1.4,-1.1,.3,.6,.8);
  const tail=new THREE.BoxGeometry(2.7,.12,1.2).rotateY(side*.4).translate(side*1.6,.15,-4);batch.parts.push({geometry:tail,material:olive});
 }
 batch.box(olive,0,1.4,-3.7,.16,2.6,1.6);batch.box(stone,0,-1.4,3.2,.3,.6,.6);
 const group=new THREE.Group();batch.finish(group);return group;
}

export class GovernmentDistrictRenderer{
 readonly buildings=new Map<string,THREE.Group>();
 readonly root=new THREE.Group();
 private aircraft:THREE.Group[]=[];
 private fleet:MilitaryAircraft[]=[];
 private readonly ships=new Map<string,THREE.Group>();
 private military:MilitaryVisualState|undefined;
 private members:MilitaryMemberVisual[]=[];
 private memberPosition:((id:string)=>MemberPosition|null)|null=null;
 private readonly helmets:THREE.InstancedMesh;
 private readonly rifles:THREE.InstancedMesh;
 private readonly shots:THREE.InstancedMesh;
 private readonly dummy=new THREE.Object3D();
 private readonly shotAxis=new THREE.Vector3(1,0,0);
 private readonly shotDirection=new THREE.Vector3();
 readonly stats={ships:0,armedMembers:0,shots:0};
 constructor(parent:THREE.Object3D,makeSign?:Sign){
  parent.add(this.root);this.root.add(grounds(),navalGrounds());
  for(const [id,group]of [['white-house',whiteHouse()],['police-hq',policeHeadquarters()],['military-base',barracks()],['military-hangar-west',hangar(625)],['military-hangar-east',hangar(795)],['naval-command',navalWatch()]] as Array<[string,THREE.Group]>){
   this.buildings.set(id,group);this.root.add(group);
   if(makeSign){const b=GOVERNMENT_BUILDINGS.find(b=>b.id===id)!;const label=makeSign(b.name.toUpperCase(),25,id==='military-base'?1.7:1.1);label.position.set(0,Math.min(b.h+2,20),b.d/2+.3);group.add(label);}
  }
  const plane=aircraftGeometry();for(let i=0;i<2;i++){const clone=plane.clone();clone.userData.dynamicCity=true;clone.visible=false;this.root.add(clone);this.aircraft.push(clone);}
  const ship=patrolShip();for(const berth of MILITARY_NAVAL_BASE.berths){const clone=ship.clone();clone.name=berth.id;clone.position.set(berth.x,0,berth.z);clone.rotation.y=berth.heading;clone.userData.dynamicCity=true;clone.visible=false;this.root.add(clone);this.ships.set(berth.id,clone);}
  this.helmets=new THREE.InstancedMesh(new THREE.SphereGeometry(.25,6,4,0,Math.PI*2,0,Math.PI/2),olive,50);
  this.rifles=new THREE.InstancedMesh(new THREE.BoxGeometry(.09,.12,.8),slate,50);
  this.shots=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.04,.04),new THREE.MeshBasicMaterial({color:0xffd581,toneMapped:false,transparent:true,opacity:.8,depthWrite:false}),32);
  for(const [name,mesh]of [['Army member helmets',this.helmets],['Army member rifles',this.rifles],['Military exercise shot traces',this.shots]] as const){mesh.name=name;mesh.count=0;mesh.userData.dynamicCity=true;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.root.add(mesh);}
 }
 setMemberPositionSource(source:(id:string)=>MemberPosition|null){this.memberPosition=source;}
 sync(snapshot:PublicServicesSnapshot|undefined){this.fleet=snapshot?.aircraft||[];this.members=snapshot?.army?.members||[];this.military=(snapshot as PublicServicesSnapshot&{military?:MilitaryVisualState}|undefined)?.military;}
 update(gameNow:number){
  for(const [index,group]of this.aircraft.entries()){
   const plane=this.fleet[index];group.visible=Boolean(plane?.owned);if(!plane?.owned)continue;
   const pose=militaryAircraftPose(gameNow,plane);group.position.set(pose.x,pose.y,pose.z);group.rotation.y=pose.heading;
  }
  this.stats.ships=0;for(const [id,ship]of this.ships){
   const record=this.military?.ships?.find(s=>s.id===id);ship.visible=Boolean(record&&record.owned!==false);if(!ship.visible)continue;
   const pose=militaryShipPose(gameNow,record!);ship.position.set(pose.x,pose.y,pose.z);ship.rotation.y=pose.heading;this.stats.ships++;
  }
  const d=this.dummy;let members=0;d.scale.set(1,1,1);d.rotation.set(0,0,0);
  for(const member of this.members){
   if(members>=50)break;if(!member.armed||member.indoors||member.onPlane||member.onTrain)continue;
   const p=this.memberPosition?this.memberPosition(member.id):member;if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)||p.y!==undefined&&!Number.isFinite(p.y))continue;
   const x=p.x!,y=p.y??1.1,z=p.z!;
   d.position.set(x,y+.65,z);d.updateMatrix();this.helmets.setMatrixAt(members,d.matrix);
   d.position.set(x+.48,y+.05,z+.05);d.rotation.x=-.3;d.updateMatrix();this.rifles.setMatrixAt(members++,d.matrix);d.rotation.x=0;
  }
  this.helmets.count=this.rifles.count=members;this.stats.armedMembers=members;
  let shots=0;for(const shot of this.military?.shots||[]){
   if(shots>=32)break;const age=gameNow-shot.at;if(age<0||age>75)continue;
   const {from,to}=shot,dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,length=Math.hypot(dx,dy,dz);if(!Number.isFinite(length)||length<.01)continue;
   d.position.set((from.x+to.x)/2,(from.y+to.y)/2,(from.z+to.z)/2);d.quaternion.setFromUnitVectors(this.shotAxis,this.shotDirection.set(dx,dy,dz).normalize());d.scale.set(length,1,1);d.updateMatrix();this.shots.setMatrixAt(shots++,d.matrix);
  }
  this.shots.count=shots;this.stats.shots=shots;
  for(const mesh of [this.helmets,this.rifles,this.shots]){mesh.visible=mesh.count>0;if(mesh.count)mesh.instanceMatrix.needsUpdate=true;}
 }
}
