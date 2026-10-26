import * as THREE from 'three';
import {AIRPORT,ISLAND,SEA,MANSION} from '../worker/city-map.mjs';
type Sign=(text:string,width:number,height:number)=>THREE.Sprite;
const stone=new THREE.MeshStandardMaterial({color:0xc8c5b9,roughness:.65,metalness:.12});
const metal=new THREE.MeshStandardMaterial({color:0xa8bdc6,roughness:.26,metalness:.7});
const glass=new THREE.MeshStandardMaterial({color:0x38677d,roughness:.18,metalness:.48});
const gold=new THREE.MeshStandardMaterial({color:0xd7b570,emissive:0xb88b35,emissiveIntensity:.35,metalness:.55,roughness:.3});
const warm=new THREE.MeshBasicMaterial({color:0xffd898,toneMapped:false});
const teal=new THREE.MeshBasicMaterial({color:0x72dfdc,toneMapped:false});
function box(g:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material){const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);b.position.set(x,y,z);g.add(b);return b;}
function cylinder(g:THREE.Group,top:number,bottom:number,h:number,y:number,m:THREE.Material,segments=24){const b=new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,h,segments),m);b.position.y=y;g.add(b);return b;}
function ring(g:THREE.Group,r:number,y:number,m:THREE.Material,tube=.12){const b=new THREE.Mesh(new THREE.TorusGeometry(r,tube,6,40),m);b.rotation.x=Math.PI/2;b.position.y=y;g.add(b);}
function sign(g:THREE.Group,make:Sign,text:string,x:number,y:number,z:number,w=30,h=1.4){const s=make(text,w,h);s.position.set(x,y,z);g.add(s);return s;}
export function buildHansdrexTower(root:THREE.Group,make:Sign){
 const g=new THREE.Group();g.position.set(-11,0,43.5);
 cylinder(g,4.9,5.2,2,1,stone);cylinder(g,.72,2.7,192,97,stone);
 // Three tapering buttresses, continuous elevator glazing and a deep observation pod.
 for(let i=0;i<3;i++){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.25,1.15,146,3),stone);leg.position.set(Math.cos(i*Math.PI*2/3)*1.4,75,Math.sin(i*Math.PI*2/3)*1.4);g.add(leg);}
 box(g,.3,144,.14,0,74,2.15,glass);box(g,.10,144,.12,.35,74,2.15,teal);
 cylinder(g,5.35,1.25,8,149,metal);cylinder(g,5.35,5.35,6,156,glass);
 cylinder(g,4.6,5.35,3,160.5,metal);cylinder(g,1.4,4.6,4,164,stone);
 for(const y of [153,159,162])ring(g,y===162?4.5:5.37,y,y===159?teal:gold);
 for(let i=0;i<24;i++){const a=i*Math.PI/12;box(g,.12,6,.12,Math.cos(a)*5.36,156,Math.sin(a)*5.36,metal);}
 cylinder(g,.72,.8,8,196.5,stone);cylinder(g,2.7,1.1,3,201.5,metal);cylinder(g,2.7,2.7,3,204.5,glass);ring(g,2.72,206,teal);
 cylinder(g,.52,.9,8,211,metal);
 for(let i=0;i<8;i++)cylinder(g,.20-i*.02,.24-i*.02,4.3,217+i*4.3,i%2?stone:new THREE.MeshStandardMaterial({color:0xd55243,roughness:.6}),10);
 cylinder(g,.04,.13,3,248.5,metal);ring(g,.4,249, warm,.09);
 sign(g,make,'HANSDREX TOWER · 250 M',0,258,0,31,1.5);root.add(g);
}
export function buildHansdrexEmpire(root:THREE.Group,make:Sign){
 const g=new THREE.Group();g.position.set(15,0,43.5);
 const tiers=[[10.8,12,18],[9.7,10.6,37],[8.4,9.4,49],[6.8,7.8,32],[5.2,6.2,20],[3.8,4.8,10],[2.7,3.7,8]];
 let base=0;const matrices:THREE.Matrix4[]=[],dummy=new THREE.Object3D();
 for(const [w,d,h] of tiers){
  box(g,w,h,d,0,base+h/2,0,stone);box(g,w+.2,.4,d+.2,0,base+h,0,gold);
  for(const sx of [-1,1])for(const sz of [-1,1])box(g,.19,h,.19,sx*(w/2+.01),base+h/2,sz*(d/2+.01),metal);
  for(let y=base+2;y<base+h-1;y+=2.8)for(let col=-1;col<=1;col++)for(const face of [-1,1]){
   dummy.position.set(col*w*.26,y,face*(d/2+.025));dummy.scale.set(.7,1.5,.03);dummy.rotation.set(0,0,0);dummy.updateMatrix();matrices.push(dummy.matrix.clone());
   dummy.position.set(face*(w/2+.025),y,col*d*.26);dummy.scale.set(.03,1.5,.7);dummy.updateMatrix();matrices.push(dummy.matrix.clone());
  }
  base+=h;
 }
 const windows=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),glass,matrices.length);matrices.forEach((m,i)=>windows.setMatrixAt(i,m));g.add(windows);
 for(let i=0;i<4;i++){cylinder(g,1.1-i*.17,1.3-i*.17,1.6,175+i*1.7,i%2?gold:stone,8);}
 cylinder(g,.15,.53,14,188,metal,12);cylinder(g,.05,.15,2,196, warm,8);
 sign(g,make,'HANSDREX EMPIRE',0,205,0,27,1.4);root.add(g);
}
export function buildAirportAndIsland(root:THREE.Group,make:Sign){
 const g=new THREE.Group(),asphalt=new THREE.MeshStandardMaterial({color:0x293139,roughness:.95}),concrete=new THREE.MeshStandardMaterial({color:0xaeb8b7,roughness:.9});
 const white=new THREE.MeshBasicMaterial({color:0xf4f0db}),yellow=new THREE.MeshBasicMaterial({color:0xeac95e});
 function slab(x:number,z:number,w:number,d:number,m:THREE.Material,y=.15){box(g,w,.12,d,x,y,z,m);}
 function runway(r:{x:number;z:number;w:number;d:number},code:string){
  const level=r.z>470?.85:0;
  slab(r.x,r.z,r.w+12,r.d+10,concrete,level+.05);slab(r.x,r.z,r.w,r.d,asphalt,level+.15);
  for(let x=r.x-r.w/2+16;x<r.x+r.w/2-14;x+=18)slab(x,r.z,8,.55,white,level+.23);
  for(const side of [-1,1]){
   for(let i=0;i<5;i++)slab(r.x+side*(r.w/2-13),r.z+(i-2)*2.3,12,1.1,white,level+.24);
   for(let x=r.x-r.w/2+5;x<r.x+r.w/2;x+=20){const b=new THREE.Mesh(new THREE.SphereGeometry(.28,6,4),teal);b.position.set(x,level+.5,r.z+side*(r.d/2+1));g.add(b);}
  }
  sign(g,make,code,r.x,3,r.z-15,48,1.6);
 }
 slab(AIRPORT.apron.x,AIRPORT.apron.z,AIRPORT.apron.w,AIRPORT.apron.d,concrete);
 slab(-180,-480,13,62,asphalt);slab(-180,-480,.5,62,yellow,.23);
 slab(-180,-375,65,8,concrete);slab(-85,-395,5,70,concrete);
 runway(AIRPORT.runway,'09  HANSDREX CITY AIRPORT  27');
 for(const t of [AIRPORT.terminal,ISLAND.terminal]){
  box(g,t.w,6,t.d,t.x,3,t.z,glass);box(g,t.w+4,.8,t.d+5,t.x,6.4,t.z,stone);
  for(let i=-2;i<=2;i++)box(g,.5,6,.6,t.x+i*t.w/5,3,t.z+t.d/2+.4,metal);
  box(g,t.w+8,.5,8,t.x,4.7,t.z+t.d/2+3,metal);
 }
 sign(g,make,'HCA · HANSDREX CITY AIRPORT',-180,16,-390,66,2.3);
 sign(g,make,'ISLAND DEPARTURES · CHECK IN 30 MIN EARLY',-180,10,-376,54,1.5);
 // Control tower, hangar, ground-service road and parking bays.
 box(g,6,24,6,-245,12,-417,stone);box(g,12,5,12,-245,27,-417,glass);box(g,14,.7,14,-245,30,-417,metal);
 box(g,46,13,32,-310,6.5,-441,metal);box(g,39,9,.4,-310,4.5,-424.8,glass);
 slab(-245,-375,44,22,asphalt);for(let i=0;i<7;i++)slab(-262+i*6,-375,.3,18,white,.23);
 const pad=AIRPORT.helipad;slab(pad.x,pad.z,26,26,asphalt);
 const circle=new THREE.Mesh(new THREE.TorusGeometry(9,.22,5,32),yellow);circle.rotation.x=Math.PI/2;circle.position.set(pad.x,.28,pad.z);g.add(circle);
 for(const x of [-2,2])box(g,.65,.12,6,pad.x+x,.3,pad.z,white);box(g,4,.12,.65,pad.x,.3,pad.z,white);
 sign(g,make,'HELI TOURS · SKYLINE FLIGHTS',pad.x,12,pad.z,44,1.6);
 // Ocean reaches the horizon; an elevated sand ellipse and smaller grass core form the island.
 const sea=new THREE.Mesh(new THREE.PlaneGeometry(SEA.w,SEA.d),new THREE.MeshStandardMaterial({color:0x176c91,roughness:.23,metalness:.25}));sea.rotation.x=-Math.PI/2;sea.position.set(SEA.x,.03,SEA.z);g.add(sea);
 const sand=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,80),new THREE.MeshStandardMaterial({color:0xe4d3a0,roughness:1}));sand.scale.set(ISLAND.rx,.48,ISLAND.rz);sand.position.set(ISLAND.x,.31,ISLAND.z);g.add(sand);
 const grass=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.12,64),new THREE.MeshStandardMaterial({color:0x6fa779,roughness:1}));grass.scale.set(ISLAND.rx-18,1,ISLAND.rz-17);grass.position.set(ISLAND.x,.61,ISLAND.z);g.add(grass);
 runway(ISLAND.runway,'09  HIA · HANSDREX ISLAND  27');
 slab(65,762,11,42,asphalt,.8);slab(130,858,170,4,concrete,.8);slab(65,824,4,68,concrete,.8);
 // Low-rise resort with shaded verandas, villas, pool and a beach pier.
 const r=ISLAND.resort;box(g,r.w,9,r.d,r.x,5,r.z,stone);box(g,r.w+4,.7,r.d+4,r.x,10,r.z,gold);
 for(const z of [-1,1])for(let i=-4;i<=4;i++){box(g,2.8,4,.1,r.x+i*4.5,5,r.z+z*(r.d/2+.1),glass);box(g,.2,7,.2,r.x+i*4.5,4,r.z+z*(r.d/2+3),metal);}
 slab(r.x,r.z+22,32,10,new THREE.MeshStandardMaterial({color:0x5bd4d1,roughness:.18}),.8);
 for(let i=0;i<5;i++){const x=100+i*32,z=884;if(Math.abs(x-MANSION.x)<MANSION.w/2+9)continue;box(g,15,5,12,x,3,z,stone);const roof=new THREE.Mesh(new THREE.ConeGeometry(12,4,4),gold);roof.rotation.y=Math.PI/4;roof.position.set(x,7,z);g.add(roof);}
 for(let i=0;i<26;i++){
  const a=i*2.399,x=ISLAND.x+Math.cos(a)*(i%2?172:126),z=ISLAND.z+Math.sin(a)*105;
  if(Math.abs(x-MANSION.x)<MANSION.w/2+7&&Math.abs(z-MANSION.z)<MANSION.d/2+7)continue;
  if(z<790||Math.abs(x-r.x)<30&&Math.abs(z-r.z)<35)continue;
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.35,.65,9,6),new THREE.MeshStandardMaterial({color:0x8c6b49}));trunk.position.set(x,5,z);g.add(trunk);
  for(let j=0;j<4;j++){const leaf=new THREE.Mesh(new THREE.ConeGeometry(3.5,7,4),new THREE.MeshStandardMaterial({color:0x287d54,roughness:1}));leaf.scale.set(1,.2,1);leaf.rotation.y=j*Math.PI/2;leaf.position.set(x+Math.cos(j*Math.PI/2)*2.5,9,z+Math.sin(j*Math.PI/2)*2.5);g.add(leaf);}
 }
 for(let i=0;i<7;i++){const x=240+i*10,z=865-i*5;const canopy=new THREE.Mesh(new THREE.ConeGeometry(3,1.2,10),i%2?gold:teal);canopy.position.set(x,3,z);g.add(canopy);box(g,.15,2,.15,x,1.5,z,metal);box(g,1.3,.5,3.4,x+2,1,z+2,stone);}
 slab(295,850,64,4,new THREE.MeshStandardMaterial({color:0x977b53}),1.2);
 sign(g,make,'HANSDREX ISLAND · PALM BEACH RESORT',170,34,846,96,3.1);
 sign(g,make,'HIA · ARRIVALS & RETURN FLIGHTS',65,13,785,48,1.5);
 root.add(g);
 // One 15-seat high-wing twin-turboprop, matching the server's scheduled aircraft.
 const plane=new THREE.Group(),whitePaint=new THREE.MeshStandardMaterial({color:0xe5edeb,roughness:.32,metalness:.35});
 const fuselage=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),whitePaint);fuselage.scale.set(1.3,1.4,7.7);plane.add(fuselage);
 box(plane,19,.3,2.7,0,1.1,.8,whitePaint);box(plane,7,.25,1.8,0,1,-5.4,whitePaint);box(plane,.25,3,2.4,0,2,-5.4,teal);
 box(plane,2,.6,.2,0,.6,6.6,glass);
 for(const side of [-1,1]){
  for(let i=0;i<7;i++)box(plane,.07,.55,.65,side*1.25,.55,-4+i*1.3,glass);
  const engine=new THREE.Mesh(new THREE.CylinderGeometry(.65,.55,3,12),metal);engine.rotation.x=Math.PI/2;engine.position.set(side*4,1,1.4);plane.add(engine);
  const prop=new THREE.Group();box(prop,.18,4,.15,0,0,0,metal);box(prop,4,.18,.15,0,0,0,metal);prop.position.set(side*4,1,3.1);plane.add(prop);
 }
 for(const x of [-1.5,1.5]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.35,10),asphalt);wheel.rotation.z=Math.PI/2;wheel.position.set(x,-1.55,-.5);plane.add(wheel);}
 sign(plane,make,'HANSDREX AIR · HCA ↔ HIA',0,5,0,37,1.3);
 const spare=plane.clone();spare.position.set(-300,3,-407);spare.rotation.y=Math.PI/2;root.add(spare);slab(-295,-409,75,20,concrete);
 root.add(plane);return {plane,propellers:plane.children.filter(c=>c instanceof THREE.Group)};
}
