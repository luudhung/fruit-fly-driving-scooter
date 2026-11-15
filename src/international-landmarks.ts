import * as THREE from 'three';
import {batchStaticMeshes} from './static-box-batches.ts';
import {NORTH_AIRPORT,NORTH_BUILDINGS,NORTH_LANDMARK,NORTH_FARM,NORTH_MILITARY,NORTH_MILITARY_WALLS,HAWAII_COTTAGES,BORDER_CHECKPOINTS,BORDER_CUSTOMS_BUILDINGS,BORDER_CUSTOMS_DECKS,type CountryBuilding} from '../worker/country-map.mjs';
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
  for(const b of [...NORTH_BUILDINGS,...HAWAII_COTTAGES,...BORDER_CUSTOMS_BUILDINGS] as CountryBuilding[]){
   const g=b.id===NORTH_LANDMARK.id?this.auroraTower():this.premises(b);
   g.userData.buildingId=b.id;this.root.add(g);this.buildings.set(b.id,g);
  }
  this.stats.buildings=this.buildings.size;this.airport();this.farm();this.customs();this.armyPerimeter();
 }
 private box(g:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);g.add(mesh);return mesh;}
 private label(g:THREE.Group,text:string,x:number,y:number,z:number,w:number,h=1.1){const s=this.sign(text,w,h);s.position.set(x,y,z);g.add(s);}
 private premises(b:CountryBuilding){
  const g=new THREE.Group();g.position.set(b.x,0,b.z);g.name=b.name;
  const cottage=b.kind==='resort-cottage',height=b.h;
  this.box(g,0,height/2,0,b.w,height,b.d,this.stone);
  this.box(g,0,height-.1,0,b.w+.25,.2,b.d+.25,this.roof);
  if(cottage){const r=new THREE.Mesh(new THREE.ConeGeometry(Math.min(b.w,b.d)*.62,2.2,4),this.roof);r.rotation.y=Math.PI/4;r.position.y=height-1.1;g.add(r);}
  for(const side of [-1,1])for(let x=-b.w/2+2.5;x<b.w/2-1;x+=4)for(let y=2.2;y<height-1;y+=3.2)this.box(g,x,y,side*(b.d/2+.035),1.25,1.5,.05,this.windows);
  this.box(g,0,1.8,b.d/2+.06,2.1,3.2,.1,this.glass);
  if(!cottage&&b.kind!=='customs'&&b.kind!=='farm-service')this.label(g,b.name.toUpperCase(),0,height+2,0,Math.max(17,b.w));
  batchStaticMeshes(g);return g;
 }
 private auroraTower(){
  const b=NORTH_LANDMARK,g=new THREE.Group();g.name=b.name;g.position.set(b.x,0,b.z);
  const bounds=[0,18,46,74,102,130,154,173,184],widths=[18,16.2,14.4,12.6,10.6,8.6,6.6,4.2];
  for(let i=0;i<widths.length;i++){
   const bottom=bounds[i],top=bounds[i+1],w=widths[i],depth=w*.82;
   this.box(g,0,(bottom+top)/2,0,w,top-bottom,depth,this.glass);
   for(const side of [-1,1]){
    this.box(g,side*(w/2-.18),(bottom+top)/2,0,.28,top-bottom,depth+.1,this.metal);
    this.box(g,0,(bottom+top)/2,side*(depth/2+.05),.3,top-bottom,.14,this.copper);
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
  for(const r of [a.runway,a.apron])this.box(g,r.x,.12,r.z,r.w,.12,r.d,this.road);
  this.box(g,a.runway.x,.19,a.runway.z,.25,.025,a.runway.d-16,this.paint);
  for(const z of [a.runway.z-a.runway.d/2+10,a.runway.z+a.runway.d/2-10])for(let x=-7;x<=7;x+=3.5)this.box(g,a.runway.x+x,.2,z,1.1,.025,8,this.paint);
  for(const p of a.stands){this.box(g,p.x,.19,p.z,12,.02,.22,this.paint);this.box(g,p.x,.19,p.z,.22,.02,15,this.paint);}
  this.box(g,-974,.13,-820,8,.1,230,this.road);this.box(g,-987,.13,-900,26,.1,8,this.road);
  this.label(g,'NORTH CITY INTERNATIONAL · NCI',a.terminal.x,16,a.terminal.z,a.terminal.d*.8,1.8);
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
 private armyPerimeter(){
  const g=new THREE.Group(),a=NORTH_MILITARY;g.name='North army perimeter';
  for(const wall of NORTH_MILITARY_WALLS)this.box(g,wall.x,wall.h/2,wall.z,wall.w,wall.h,wall.d,this.stone);
  this.box(g,a.drill.x,.1,a.drill.z,a.drill.w,.15,a.drill.d,this.stone);batchStaticMeshes(g);this.root.add(g);
 }
 updateLighting(night:number){this.glass.emissiveIntensity=.08+night*.65;this.copper.emissiveIntensity=.08+night*.85;this.windows.color.setHex(night>.35?0xffd8a4:0x99b6b0);}
}
