import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {INDUSTRIAL_BUILDINGS,INDUSTRIAL_PLANTS,INDUSTRIAL_ZONES,INDUSTRIAL_LOADING_BAYS,MAX_FREIGHT_TRUCKS} from '../worker/industry-map.mjs';
import type {IndustrialSnapshot,FreightTruckView} from '../worker/industrial-economy.mjs';
const brick=new THREE.MeshStandardMaterial({color:0x836957,roughness:1}),concrete=new THREE.MeshStandardMaterial({color:0xb1aca0,roughness:1}),roof=new THREE.MeshStandardMaterial({color:0x536470,roughness:.8}),dark=new THREE.MeshStandardMaterial({color:0x25343d,roughness:.9}),glass=new THREE.MeshBasicMaterial({color:0xb6cbd1}),marking=new THREE.MeshBasicMaterial({color:0xd5be69,toneMapped:false});
type Layer={material:THREE.Material;parts:THREE.BufferGeometry[]};
class Batch{
 layers=new Map<THREE.Material,Layer>();
 add(g:THREE.BufferGeometry,m:THREE.Material){let l=this.layers.get(m);if(!l){l={material:m,parts:[]};this.layers.set(m,l);}l.parts.push(g);}
 box(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number){this.add(new THREE.BoxGeometry(w,h,d).translate(x,y,z),m);}
 cylinder(m:THREE.Material,x:number,y:number,z:number,r:number,h:number){this.add(new THREE.CylinderGeometry(r,r,h,8).translate(x,y,z),m);}
 finish(g:THREE.Object3D){for(const l of this.layers.values()){const geometry=mergeGeometries(l.parts);if(geometry)g.add(new THREE.Mesh(geometry,l.material));for(const p of l.parts)p.dispose();}}
}
function factory(site:typeof INDUSTRIAL_BUILDINGS[number]){
 const g=new THREE.Group();g.position.set(site.x,0,site.z);g.name=site.id;const b=new Batch(),front=Math.sign(site.frontage.z-site.z),h=site.h,w=site.w,d=site.d;
 b.box(concrete,0,.25,0,w,.5,d);b.box(brick,0,h*.39,0,w,h*.76,d);b.box(roof,0,h*.78,0,w+1,.7,d+1);
 // Light clerestories, roof vents and loading bays distinguish productive low-rise buildings.
 for(let x=-w/2+5;x<w/2-1;x+=8){b.box(glass,x,h*.57,front*(d/2+.04),5,2,.08);b.box(concrete,x,h*.57,front*(d/2+.12),.14,2.5,.18);}
 for(let x=-w/2+8;x<w/2-3;x+=13){b.box(dark,x,3.2,front*(d/2+.08),7,5.8,.15);b.box(concrete,x,.8,front*(d/2+1),9,1.5,2);for(let y=1.3;y<6;y+=.7)b.box(roof,x,y,front*(d/2+.2),6.8,.08,.05);b.box(marking,x,6.5,front*(d/2+.22),7,.2,.12);}
 for(let x=-w/2+7;x<w/2-2;x+=11){b.box(roof,x,h*.81,-d*.18,4,1.2,3);b.cylinder(concrete,x,h*.88,-d*.18,.7,h*.12);}
 for(const side of [-1,1])for(let z=-d/2+4;z<d/2-1;z+=7)b.box(glass,side*(w/2+.03),h*.55,z,.06,1.6,3.5);
 if('sector'in site&&site.sector==='building-materials'){for(let i=0;i<2;i++)b.cylinder(concrete,w*.30+i*3,h*.56,-d*.23,1.2,h*.8);}
 if('sector'in site&&site.sector==='freight-logistics'){b.box(roof,0,h*.35,front*(d/2+1.5),w-3,.4,4);}
 b.finish(g);return g;
}
function truckGeometry(){const a=new Batch();a.box(concrete,0,2.1,-.65,2.15,2.7,4.3);a.box(marking,0,1.6,2,2.1,2.1,1.5);a.box(dark,0,.66,0,2,.32,6);for(const side of [-1,1])for(const z of [-2,.0,2.3])a.add(new THREE.CylinderGeometry(.49,.49,.38,8).rotateZ(Math.PI/2).translate(side*1.07,.65,z),dark);const group=new THREE.Group();a.finish(group);return group;}
/** Batched static warehouses and a capped instanced fleet; no dynamic lights. */
export class IndustrialDistrictRenderer{
 buildings=new Map<string,THREE.Group>();
 private fleet:THREE.InstancedMesh[]=[];
 private snapshotData:IndustrialSnapshot|null=null;
 private dummy=new THREE.Object3D();
 private signs:THREE.Sprite[]=[];
 private camera:THREE.Camera|null=null;
 constructor(root:THREE.Object3D,sign?:(text:string,width:number,height:number)=>THREE.Sprite){
  for(const site of INDUSTRIAL_BUILDINGS){const g=factory(site);this.buildings.set(site.id,g);root.add(g);if(sign){const label=sign(site.name,site.w*.85,3);label.position.set(0,site.h*.82,0);g.add(label);this.signs.push(label);}}
  if(sign)for(const zone of Object.values(INDUSTRIAL_ZONES)){const first=INDUSTRIAL_PLANTS.find(p=>p.zone===zone.id)!;const label=sign(zone.name,70,5);label.position.set(0,34,-25);this.buildings.get(first.id)!.add(label);this.signs.push(label);}
  const bays=new Batch();for(const p of Object.values(INDUSTRIAL_LOADING_BAYS)){for(const side of [-1,1]){bays.box(marking,p.x+side*3.3,.21,p.z,.12,.015,2.6);bays.box(marking,p.x,.21,p.z+side*1.3,6.7,.015,.12);}}bays.finish(root);const template=truckGeometry();template.traverse(o=>{if(o instanceof THREE.Mesh){const mesh=new THREE.InstancedMesh(o.geometry,o.material,MAX_FREIGHT_TRUCKS);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);this.fleet.push(mesh);}});
 }
 setView(camera:THREE.Camera){this.camera=camera;}
 sync(data:IndustrialSnapshot){this.snapshotData=data||null;}
 update(_dt:number,gameNow:number,timeScale=120){
  const trucks=this.snapshotData?.trucks||[];let count=0;for(const t of trucks.slice(0,MAX_FREIGHT_TRUCKS)){if(this.camera&&Math.hypot(t.x-this.camera.position.x,t.z-this.camera.position.z)>1450)continue;const p=this.pose(t,gameNow,timeScale);this.dummy.position.set(p.x,(p.y??1.1)-1.1,p.z);this.dummy.rotation.set(0,p.heading,0);this.dummy.scale.set(1,1,1);this.dummy.updateMatrix();for(const mesh of this.fleet)mesh.setMatrixAt(count,this.dummy.matrix);count++;}for(const mesh of this.fleet){mesh.count=count;mesh.instanceMatrix.needsUpdate=true;}
 }
 private pose(t:FreightTruckView,gameNow:number,timeScale:number){
  let x=t.x,z=t.z,y=t.y,heading=t.heading,left=Math.max(0,Math.min(360,gameNow-t.at))/Math.max(1,timeScale)*t.motionSpeed;
  for(const p of t.routeWaypoints){if(left<=0)break;const dx=p.x-x,dz=p.z-z,d=Math.hypot(dx,dz);if(d<.01)continue;heading=Math.atan2(dx,dz);if(left<d){x+=dx/d*left;z+=dz/d*left;left=0;}else{x=p.x;z=p.z;y=p.y??y;left-=d;}}
  return{x,y,z,heading};
 }
 dispose(){for(const g of this.buildings.values()){g.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});g.removeFromParent();}for(const mesh of this.fleet){mesh.geometry.dispose();mesh.removeFromParent();}for(const s of this.signs){s.material.map?.dispose();s.material.dispose();s.removeFromParent();}}
}
