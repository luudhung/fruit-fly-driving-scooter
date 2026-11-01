import * as THREE from 'three';
import {BUILDINGS,applyUrbanGeometry,type UrbanBuildingRecord,type UrbanFlood} from '../worker/city-map.mjs';
export type UrbanWorldSnapshot={buildings:UrbanBuildingRecord[];fires:Array<{id:string;buildingId:string;x:number;z:number;h:number;intensity:number;teamIds:string[];crew?:Array<{x:number;z:number}>}>;projects:Array<{id:string;buildingId:string;x:number;z:number;stage:string;progress:number;pauseReason?:string}>;floods:UrbanFlood[];completedProjects?:number;extinguishedFires?:number;displaced?:number};
type Registered={group:THREE.Group;originalMaterials:Map<THREE.Material,THREE.Color>;height:number;privateMaterials?:boolean};
/** Only the viewer animates particles and machinery; durable world outcomes come from the server. */
export class UrbanWorldRenderer{
 private buildings=new Map<string,Registered>();
 private dynamic=new Map<string,THREE.Group>();
 private sites=new Map<string,THREE.Group>();
 private waters=new Map<string,THREE.Mesh>();
 private state:UrbanWorldSnapshot={buildings:[],fires:[],projects:[],floods:[]};
 private flames:THREE.InstancedMesh;
 private smoke:THREE.InstancedMesh;
 private jets:THREE.LineSegments;
 private dummy=new THREE.Object3D();
 private phase=0;
 private materials={wall:new THREE.MeshStandardMaterial({color:0xa4afb0,roughness:.88}),scaffold:new THREE.MeshStandardMaterial({color:0xb8a75a,metalness:.4,roughness:.6}),rubble:new THREE.MeshStandardMaterial({color:0x585252,roughness:1}),glass:new THREE.MeshBasicMaterial({color:0xedcc85,toneMapped:false})};
 constructor(private root:THREE.Group){
  this.flames=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,5),new THREE.MeshBasicMaterial({color:0xff7c29,toneMapped:false,transparent:true,opacity:.9,depthWrite:false}),96);
  this.smoke=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshBasicMaterial({color:0x55545d,transparent:true,opacity:.36,depthWrite:false}),120);
  for(const mesh of [this.flames,this.smoke]){mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(72),3));geometry.setDrawRange(0,0);
  this.jets=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xc2e6ef,transparent:true,opacity:.7}));this.jets.frustumCulled=false;root.add(this.jets);
 }
 registerBuilding(id:string,group:THREE.Group){
  const colors=new Map<THREE.Material,THREE.Color>();group.traverse(object=>{if(object instanceof THREE.Mesh){for(const material of Array.isArray(object.material)?object.material:[object.material])if('color'in material)colors.set(material,(material as THREE.MeshStandardMaterial).color.clone());}});
  this.buildings.set(id,{group,originalMaterials:colors,height:BUILDINGS.find(b=>b.id===id)?.h||1});
 }
 private box(g:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);g.add(m);return m;}
 private newBuilding(b:UrbanBuildingRecord){
  const group=new THREE.Group();group.position.set(b.x,0,b.z);
  this.box(group,b.w,b.h,b.d,0,b.h/2,0,this.materials.wall.clone());
  this.box(group,b.w+.3,.4,b.d+.3,0,b.h,0,this.materials.scaffold);
  const points:number[]=[];for(let y=2;y<b.h;y+=3)for(const side of [-1,1]){points.push(-b.w*.35,y,side*(b.d/2+.05),b.w*.35,y,side*(b.d/2+.05));}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));group.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0xffd795,toneMapped:false})));
  this.root.add(group);this.dynamic.set(b.id,group);this.registerBuilding(b.id,group);return group;
 }
 sync(data:UrbanWorldSnapshot){
  if(!data)return;this.state=data;applyUrbanGeometry({buildings:data.buildings||[],floods:data.floods||[]});
  const records=new Map((data.buildings||[]).map(b=>[b.id,b]));
  for(const b of data.buildings||[])if(b.id.startsWith('CIVIC-')&&!this.buildings.has(b.id))this.newBuilding(b);
  for(const [id,entry]of this.buildings){
   const b=records.get(id);
   if(b&&b.health!==undefined&&b.health<95&&!entry.privateMaterials){
    // Tint only this damaged facade; shared materials must not darken unrelated city buildings.
    const colors=new Map<THREE.Material,THREE.Color>();
    entry.group.traverse(object=>{if(object instanceof THREE.Mesh){
     const clone=(material:THREE.Material)=>{const copy=material.clone();if('color'in copy)colors.set(copy,(copy as THREE.MeshStandardMaterial).color.clone());return copy;};
     object.material=Array.isArray(object.material)?object.material.map(clone):clone(object.material);
    }});entry.originalMaterials=colors;entry.privateMaterials=true;
   }
   entry.group.visible=b?.stage!=='cleared'&&b?.stage!=='collapsed';
   entry.group.scale.y=b?.stage==='construction'?Math.max(.015,Number(b.progress||0)):1;entry.group.updateMatrix();
   for(const [material,color]of entry.originalMaterials){const target=material as THREE.MeshStandardMaterial;target.color.copy(color);if(b&&b.health!==undefined&&b.health<95)target.color.lerp(new THREE.Color(0x474044),Math.min(.75,(100-b.health)/120));}
  }
  for(const [id,group]of this.dynamic)if(!records.has(id)){this.root.remove(group);this.dynamic.delete(id);this.buildings.delete(id);}
  const active=new Set<string>();
  for(const b of data.buildings||[]){
   if(!['construction','collapsed','cleared'].includes(b.stage))continue;active.add(b.id);
   let g=this.sites.get(b.id);if(!g){g=new THREE.Group();g.position.set(b.x,0,b.z);this.root.add(g);this.sites.set(b.id,g);}
   const signature=`${b.stage}:${Math.floor((b.progress||0)*10)}`;
   if(g.userData.signature===signature)continue;g.userData.signature=signature;
   for(const child of [...g.children]){g.remove(child);if(child instanceof THREE.Mesh)child.geometry.dispose();}
   if(b.stage==='collapsed'){
    for(let i=0;i<10;i++){const x=Math.sin(i*2.4)*b.w*.35,z=Math.cos(i*4.3)*b.d*.35,r=this.box(g,b.w*.24,1.3+i%3*.3,b.d*.19,x,.7,z,this.materials.rubble);r.rotation.y=i*1.7;}
   }else{
    const height=Math.max(5,b.h*(b.progress||0));
    for(const side of [-1,1])for(const z of [-1,1])this.box(g,.2,height,.2,side*(b.w/2+.5),height/2,z*(b.d/2+.5),this.materials.scaffold);
    for(let y=3;y<height;y+=5){this.box(g,b.w+1,.12,.15,0,y,b.d/2+.5,this.materials.scaffold);this.box(g,.15,.12,b.d+1,b.w/2+.5,y,0,this.materials.scaffold);}
    this.box(g,.7,b.h+8,.7,b.w/2+2,(b.h+8)/2,0,this.materials.scaffold);this.box(g,b.w+10,.5,.6,0,b.h+8,0,this.materials.scaffold);this.box(g,.1,8,.1,-b.w/2,b.h+4,0,this.materials.rubble);
    this.box(g,b.w+3,.5,.3,0,.3,b.d/2+1.3,this.materials.scaffold);
   }
  }
  for(const [id,g]of this.sites)if(!active.has(id)){this.root.remove(g);for(const child of g.children)if(child instanceof THREE.Mesh)child.geometry.dispose();this.sites.delete(id);}
  const floods=new Set<string>();for(const f of data.floods||[]){floods.add(f.id);let mesh=this.waters.get(f.id);if(!mesh){mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:0x628c99,transparent:true,opacity:.7,depthWrite:false}));mesh.rotation.x=-Math.PI/2;this.root.add(mesh);this.waters.set(f.id,mesh);}mesh.scale.set(f.w,f.d,1);mesh.position.set(f.x,.22+f.depth*.25,f.z);}
  for(const [id,m]of this.waters)if(!floods.has(id)){this.root.remove(m);m.geometry.dispose();(m.material as THREE.Material).dispose();this.waters.delete(id);}
 }
 update(dt:number,gameNow:number){
  this.phase+=Math.min(.1,dt);let flames=0,smoke=0,jets=0;const d=this.dummy,jet=this.jets.geometry.getAttribute('position') as THREE.BufferAttribute;
  for(const fire of this.state.fires.slice(0,3)){
   if(!Number.isFinite(fire.x)||!Number.isFinite(fire.z))continue;
   const scale=Math.max(.5,Math.min(2,fire.intensity/40)),base=Math.min(12,Math.max(1,fire.h*.15));
   for(let i=0;i<20;i++){
    const a=i*2.399,t=this.phase*3+i*.7,pulse=.7+Math.sin(t)*.2,r=1.5+(i%4)*.8;
    d.position.set(fire.x+Math.cos(a)*r,base+(i%3)*2,fire.z+Math.sin(a)*r);d.rotation.set(0,a,.1*Math.sin(t));d.scale.set(.7*scale*pulse,(2.3+i%3)*scale*pulse,.7*scale*pulse);d.updateMatrix();this.flames.setMatrixAt(flames++,d.matrix);
   }
   for(let i=0;i<28;i++){
    const age=((this.phase*.17+i/28)%1),r=.7+age*4,a=i*2.399;
    d.position.set(fire.x+Math.sin(a)*r+age*3,base+3+age*28,fire.z+Math.cos(a)*r);d.rotation.set(age,i,0);d.scale.setScalar(1+age*3);d.updateMatrix();this.smoke.setMatrixAt(smoke++,d.matrix);
   }
   for(const crew of (fire.crew||[]).slice(0,4))if(jets<12){jet.setXYZ(jets*2,crew.x,2,crew.z);jet.setXYZ(jets*2+1,fire.x,base+2,fire.z);jets++;}
  }
  this.flames.count=flames;this.smoke.count=smoke;this.flames.instanceMatrix.needsUpdate=true;this.smoke.instanceMatrix.needsUpdate=true;this.jets.geometry.setDrawRange(0,jets*2);jet.needsUpdate=true;
 }
}
