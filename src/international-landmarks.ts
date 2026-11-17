import {NORTH_F1_CHARTER_STANDS} from '../worker/north-f1-map.mjs';
import * as THREE from 'three';
import {NORTH_FIRE_STATION} from '../worker/north-fire-service.mjs';
import {NORTH_TRAINING_STAND} from '../worker/national-services.mjs';
import {createNorthGolfCourse} from './north-golf-course.ts';
import {batchStaticMeshes} from './static-box-batches.ts';
import {createPassengerTerminal} from './passenger-terminal.ts';
import {subtractRects,type Rect} from './surface-rectangles.ts';
import {NORTH_AIRPORT,NORTH_BUILDINGS,NORTH_LANDMARK,NORTH_FARM,NORTH_MILITARY,NORTH_MILITARY_WALLS,NORTH_WHITE_HOUSE,NORTH_SPORTS_PARK,HAWAII_APARTMENTS,HAWAII_COTTAGES,BORDER_CHECKPOINTS,BORDER_CUSTOMS_BUILDINGS,BORDER_CUSTOMS_DECKS,type CountryBuilding} from '../worker/country-map.mjs';
type Sign=(text:string,width:number,height:number)=>THREE.Sprite;
/** Immutable national premises. Dynamic people, vehicles and crop stocks stay in the simulation. */
export class InternationalLandmarks{
 readonly root=new THREE.Group();readonly buildings=new Map<string,THREE.Group>();
 readonly stats={buildings:0,cropRows:0,checkpoints:BORDER_CHECKPOINTS.length};
 private stone=new THREE.MeshStandardMaterial({color:0xd7d6c6,roughness:.82});
 private roof=new THREE.MeshStandardMaterial({color:0x476668,roughness:.65,metalness:.2});
 private metal=new THREE.MeshStandardMaterial({color:0xb9c9ca,roughness:.35,metalness:.6});
 private glass=new THREE.MeshStandardMaterial({color:0x245958,roughness:.3,metalness:.4,emissive:0x17433c,emissiveIntensity:.1});
 private copper=new THREE.MeshStandardMaterial({color:0xb7955b,roughness:.45,metalness:.5,emissive:0x735029,emissiveIntensity:.1});
 private windows=new THREE.MeshBasicMaterial({color:0xa4bcb0,toneMapped:false});
 private road=new THREE.MeshStandardMaterial({color:0x343e44,roughness:1});
 private paint=new THREE.MeshBasicMaterial({color:0xe5e4cf});
 private crops=new THREE.MeshStandardMaterial({color:0x527d3a,roughness:1});
 private rice=new THREE.MeshStandardMaterial({color:0x959843,roughness:1});
 private earth=new THREE.MeshStandardMaterial({color:0x695e45,roughness:1});
 private readonly sign:Sign;
 constructor(parent:THREE.Group,sign:Sign){
  this.sign=sign;
  this.root.name='International national infrastructure';parent.add(this.root);
  for(const b of [...NORTH_BUILDINGS,...HAWAII_COTTAGES,...HAWAII_APARTMENTS,...BORDER_CUSTOMS_BUILDINGS] as CountryBuilding[]){
   const g=b.id===NORTH_LANDMARK.id?this.auroraTower():b.id===NORTH_FIRE_STATION.id?this.fireStation(b):b.id==='north-airport'?createPassengerTerminal(NORTH_AIRPORT,this.sign,{name:'North City International · Race Gateway',height:b.h}):this.premises(b);
   g.userData.buildingId=b.id;this.root.add(g);this.buildings.set(b.id,g);
  }
  this.stats.buildings=this.buildings.size;this.airport();this.farm();this.customs();this.armyPerimeter();this.sportsPark();
 }
 private box(g:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);g.add(mesh);return mesh;}
 private label(g:THREE.Group,text:string,x:number,y:number,z:number,w:number,h=1.1){const s=this.sign(text,w,h);s.position.set(x,y,z);g.add(s);}
 private premises(b:CountryBuilding){
  const g=new THREE.Group();g.position.set(b.x,0,b.z);g.name=b.name;
  const cottage=b.kind==='resort-cottage',height=b.h;
  // The roof owns the outside top surface. Walls stop underneath it so two
  // differently coloured faces never compete for the same depth value.
  const roofHeight=cottage?2.2:.24,wallHeight=height-roofHeight;
  this.box(g,0,wallHeight/2,0,b.w,wallHeight,b.d,this.stone);
  if(cottage){
   const r=new THREE.Mesh(new THREE.ConeGeometry((b.w+.4)/Math.SQRT2,roofHeight,4),this.roof);
   r.rotation.y=Math.PI/4;r.scale.z=(b.d+.4)/(b.w+.4);r.position.y=height-roofHeight/2;g.add(r);
  }else this.box(g,0,height-roofHeight/2,0,b.w+.25,roofHeight,b.d+.25,this.roof);
  for(const side of [-1,1])for(let x=-b.w/2+2.5;x<b.w/2-1;x+=4)for(let y=2.2;y<height-1;y+=3.2)this.box(g,x,y,side*(b.d/2+.035),1.25,1.5,.05,this.windows);
  const doorHeight=Math.min(3.2,wallHeight-.25);
  if(b.kind!=='customs')this.box(g,0,doorHeight/2+.05,b.d/2+.06,Math.min(2.1,b.w-.3),doorHeight,.1,this.glass);
  if(b.kind==='resort-apartment'){
   for(let y=3.05;y<height-.8;y+=3.2){
    this.box(g,0,y,b.d/2+.45,b.w-2,.2,.9,this.stone);
    this.box(g,0,y+.43,b.d/2+.83,b.w-2,.12,.14,this.metal);
   }
  }
  if(b.id===NORTH_WHITE_HOUSE.id){
   for(const x of [-9,-5.4,-1.8,1.8,5.4,9])this.box(g,x,4.6,b.d/2+1.15,.76,8.6,.76,this.stone);
   this.box(g,0,9.12,b.d/2+1.3,21,.5,3.2,this.stone);
   for(let i=0;i<3;i++)this.box(g,0,.1+i*.13,b.d/2+1.5-i*.36,21,.2+i*.26,4-i*.72,this.stone);
  }
  if(b.kind==='customs')this.label(g,b.name.toUpperCase(),0,3.7,0,9,.75);
  if(!cottage&&b.kind!=='customs'&&b.kind!=='farm-service')this.label(g,b.name.toUpperCase(),0,height+2,0,Math.max(17,b.w));
  batchStaticMeshes(g);return g;
 }
 private fireStation(b:CountryBuilding){
  const g=new THREE.Group();g.name=b.name;g.position.set(b.x,0,b.z);
  const red=new THREE.MeshStandardMaterial({color:0x9d3530,roughness:.8});
  const trim=new THREE.MeshStandardMaterial({color:0xc8c5ac,roughness:.85});
  // The two south-facing bays are actually open: engines come from the garage.
  this.box(g,0,4.88,-b.d/2+.2,b.w,9.76,.4,this.stone);
  for(const side of [-1,1])this.box(g,side*(b.w/2-.2),4.88,-.2,.4,9.76,b.d-.4,this.stone);
  for(const x of [-16.5,0,16.5])this.box(g,x,2.8,b.d/2-.2,1,5.6,.4,red);
  this.box(g,0,7.68,b.d/2-.2,b.w,4.16,.4,red);
  this.box(g,0,9.88,0,b.w+.25,.24,b.d+.25,this.roof);
  this.box(g,0,.04,0,b.w-.8,.08,b.d-.8,trim);
  for(const x of [-10,-5,5,10])this.box(g,x,7.6,b.d/2+.035,2.4,1.4,.05,this.windows);
  this.label(g,'NORTH CITY FIRE & RESCUE',0,11.9,0,32,1.5);
  this.label(g,'ENGINE 1',-7,5.05,b.d/2+.2,9,.7);
  this.label(g,'RESCUE',7,5.05,b.d/2+.2,9,.7);
  // An apron ends before the existing sidewalk; no overlapping road surfaces.
  this.box(g,0,.09,b.d/2+1.65,b.w,.1,3.1,trim);
  batchStaticMeshes(g);return g;
 }
 private auroraTower(){
  const b=NORTH_LANDMARK,g=new THREE.Group();g.name=b.name;g.position.set(b.x,0,b.z);
  const bounds=[0,18,46,74,102,130,154,173,184],widths=[18,16.2,14.4,12.6,10.6,8.6,6.6,4.2];
  for(let i=0;i<widths.length;i++){
   const bottom=bounds[i],top=bounds[i+1],w=widths[i],depth=w*.82,shaftHeight=top-bottom-.48,shaftCenter=bottom+shaftHeight/2;
   this.box(g,0,shaftCenter,0,w,shaftHeight,depth,this.glass);
   for(const side of [-1,1]){
    this.box(g,side*(w/2-.18),shaftCenter,0,.28,shaftHeight,depth+.1,this.metal);
    this.box(g,0,shaftCenter,side*(depth/2+.05),.3,shaftHeight,.14,this.copper);
   }
   this.box(g,0,top-.24,0,w+.12,.48,depth+.12,this.copper);
   for(let y=bottom+2;y<top-1;y+=3)for(const side of [-1,1])for(let x=-w/2+1.4;x<w/2-1;x+=2.5)this.box(g,x,y,side*(depth/2+.04),.7,1.2,.04,this.windows);
  }
  // A split silver crown and a restrained needle give North its own silhouette.
  for(const side of [-1,1]){const fin=new THREE.Mesh(new THREE.ConeGeometry(1.25,9,4),this.metal);fin.position.set(side*1.25,188.5,0);g.add(fin);}
  const spire=new THREE.Mesh(new THREE.ConeGeometry(.42,12,8),this.copper);spire.position.y=190;g.add(spire);
  this.box(g,0,.15,0,18,.3,18,this.stone);
  this.label(g,'NORTH CITY · AURORA TOWER',0,200,0,32,1.4);batchStaticMeshes(g);return g;
 }
 private airport(){
  const g=new THREE.Group(),a=NORTH_AIRPORT;g.name='North airport runway and apron';
  const occupied:Rect[]=[];
  for(const r of [a.runway,a.apron,{x:-974,z:-820,w:8,d:292},{x:-987,z:-900,w:26,d:8},...NORTH_F1_CHARTER_STANDS.map(p=>({...p,w:30,d:24}))]){
   for(const part of subtractRects([r],occupied))this.box(g,part.x,.12,part.z,part.w,.12,part.d,this.road);
   occupied.push(r);
  }
  for(let z=a.runway.z-a.runway.d/2+30;z<a.runway.z+a.runway.d/2-25;z+=18)this.box(g,a.runway.x,.2,z,.28,.025,8,this.paint);
  for(const z of [a.runway.z-a.runway.d/2+10,a.runway.z+a.runway.d/2-10])for(let x=-7;x<=7;x+=3.5)this.box(g,a.runway.x+x,.2,z,1.1,.025,8,this.paint);
  for(const [index,p]of a.stands.entries()){this.box(g,p.x,.2,p.z,12,.02,.22,this.paint);this.box(g,p.x,.2,p.z,.22,.02,15,this.paint);this.label(g,`NCI ${index+1}`,p.x,.9,p.z+9,9,.7);}
  for(const [index,p] of NORTH_F1_CHARTER_STANDS.entries()){
   this.box(g,p.x,.19,p.z,13,.02,.22,this.paint);
   for(const side of [-1,1])this.box(g,p.x,.19,p.z+side*6,17,.02,.12,this.paint);
   this.label(g,`CHARTER ${index+1}`,p.x,.86,p.z,10,.8);
  }
  for(const side of [-1,1]){this.box(g,NORTH_TRAINING_STAND.x+side*5,.19,NORTH_TRAINING_STAND.z,.12,.02,12,this.paint);this.box(g,NORTH_TRAINING_STAND.x,.19,NORTH_TRAINING_STAND.z+side*6,10,.02,.12,this.paint);}
  this.label(g,'TRAINING',NORTH_TRAINING_STAND.x,.8,NORTH_TRAINING_STAND.z,10,.8);
  this.box(g,-974,.2,-820,.16,.025,274,this.paint);
  this.box(g,a.terminal.x-a.terminal.w/2-2,.22,a.terminal.z,1.5,.03,145,this.stone);
  this.label(g,'ARRIVALS →',a.terminal.x-a.terminal.w/2-5,2.8,a.terminal.z,12,.9);
  batchStaticMeshes(g);this.root.add(g);
 }
 private farm(){
  const g=new THREE.Group();g.name='North rice and vegetable fields';
  for(const f of NORTH_FARM.fields){
   this.box(g,f.x,.09,f.z,f.w,.12,f.d,this.earth);
   const count=12,geometry=new THREE.BoxGeometry(f.w-4,.42,.85),mesh=new THREE.InstancedMesh(geometry,f.crop==='rice'?this.rice:this.crops,count),matrix=new THREE.Matrix4();
   for(let i=0;i<count;i++)mesh.setMatrixAt(i,matrix.makeTranslation(f.x,.34,f.z-f.d/2+4+i*(f.d-8)/(count-1)));
   mesh.computeBoundingSphere();g.add(mesh);this.stats.cropRows+=count;
  }
  this.box(g,260,.11,-790,10,.1,280,this.stone);this.box(g,260,.12,-790,230,.1,10,this.stone);
  this.label(g,'NORTH CITY · RICE & VEGETABLE COOPERATIVE',NORTH_FARM.gate.x,9,NORTH_FARM.gate.z,60,1.8);
  batchStaticMeshes(g);this.root.add(g);
 }
 private customs(){
  const g=new THREE.Group();g.name='International customs checkpoints';
  for(const r of BORDER_CUSTOMS_DECKS)this.box(g,r.x,.13,r.z,r.w,.18,r.d,this.stone);
  for(const p of BORDER_CHECKPOINTS){
   const half=(p.axis==='z'?p.bounds.w:p.bounds.d)/2;
   for(const side of [-1,1])this.box(g,p.bounds.x+(p.axis==='z'?side*(half+.4):0),3.5,p.bounds.z+(p.axis==='x'?side*(half+.4):0),.3,7,.3,this.metal);
   this.box(g,p.bounds.x,7,p.bounds.z,p.axis==='z'?half*2+.8:1.5,.3,p.axis==='x'?half*2+.8:1.5,this.roof);
   this.label(g,'NORTH CITY ↔ HANSDREX · PASSPORT CONTROL',p.bounds.x,9,p.bounds.z,p.motorway?54:38,1.4);
  }
  batchStaticMeshes(g);this.root.add(g);
 }
 private sportsPark(){
  const park=NORTH_SPORTS_PARK,g=new THREE.Group();
  g.name=park.name;
  const fairway=new THREE.MeshStandardMaterial({color:0x81a653,roughness:1});
  const court=new THREE.MeshStandardMaterial({color:0x315e85,roughness:.9});
  const net=new THREE.MeshStandardMaterial({color:0x343e49,roughness:1});
  g.add(createNorthGolfCourse(park.golf.x,park.golf.z));
  const lines=(x:number,z:number,w:number,d:number,y:number)=>{
   for(const side of [-1,1]){
    this.box(g,x+side*w/2,y,z,.16,.012,d,this.paint);
    this.box(g,x,y,z+side*d/2,w,.012,.16,this.paint);
   }
  };
  for(const c of park.tennis){
   this.box(g,c.x,.09,c.z,c.w,.07,c.d,court);
   lines(c.x,c.z,11,24,.14);
   for(const side of [-1,1]){
    this.box(g,c.x,.14,c.z+side*6.4,8.2,.012,.15,this.paint);
    this.box(g,c.x+side*4.1,.14,c.z,.14,.012,24,this.paint);
   }
   this.box(g,c.x,.14,c.z,.14,.012,12.8,this.paint);
   this.box(g,c.x,.57,c.z,12,.82,.045,net);
   this.box(g,c.x,.98,c.z,12,.09,.08,this.paint);
  }
  const f=park.football;
  this.box(g,f.x,.085,f.z,f.w,.055,f.d,fairway);
  lines(f.x,f.z,43,70,.13);
  this.box(g,f.x,.13,f.z,43,.012,.16,this.paint);
  for(const side of [-1,1]){
   lines(f.x,f.z+side*30,18,10,.134);
   for(const dx of [-3.7,3.7])this.box(g,f.x+dx,1.4,f.z+side*35,.16,2.55,.16,this.paint);
   this.box(g,f.x,2.65,f.z+side*35,7.5,.16,.16,this.paint);
  }
  for(let i=0;i<32;i++){
   const angle=i*Math.PI/16;
   this.box(g,f.x+Math.cos(angle)*6,.13,f.z+Math.sin(angle)*6,1.2,.012,.16,this.paint).rotation.y=-angle-Math.PI/2;
  }
  this.box(g,park.gate.x,.085,-620,3,.07,35,this.stone);
  this.box(g,-702,.07,-638,290,.055,3.5,this.stone);
  this.label(g,'AIRPORT SPORTS PARK',park.gate.x,4,-619,35,1.35);
  batchStaticMeshes(g);
  this.root.add(g);
 }
 private armyPerimeter(){
  const g=new THREE.Group(),a=NORTH_MILITARY;g.name='North army perimeter';
  for(const wall of NORTH_MILITARY_WALLS)this.box(g,wall.x,wall.h/2,wall.z,wall.w,wall.h,wall.d,this.stone);
  this.box(g,a.drill.x,.1,a.drill.z,a.drill.w,.15,a.drill.d,this.stone);batchStaticMeshes(g);this.root.add(g);
 }
 updateLighting(night:number){this.glass.emissiveIntensity=.08+night*.65;this.copper.emissiveIntensity=.08+night*.85;this.windows.color.setHex(night>.35?0xffd8a4:0x99b6b0);}
}
