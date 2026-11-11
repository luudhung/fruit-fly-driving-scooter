import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {VISITOR_STANDS, VISITOR_TAXIWAY_Z, visitorAircraftPose, type VisitorAircraft} from '../worker/visitor-aviation.mjs';

function coloredGeometry(parts: Array<{geometry:THREE.BufferGeometry;color:number}>) {
 const geometries=parts.map(({geometry,color})=>{
  const g=geometry.index?geometry.toNonIndexed():geometry;
  const c=new THREE.Color(color),colors=new Float32Array(g.getAttribute('position').count*3);
  for(let i=0;i<colors.length;i+=3)c.toArray(colors,i);
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));
  return g;
 });
 const result=mergeGeometries(geometries);
 for(const g of new Set([...geometries,...parts.map(p=>p.geometry)]))g.dispose();
 return result;
}

function airlinerGeometry() {
 const parts: Array<{geometry:THREE.BufferGeometry;color:number}>=[];
 const add=(geometry:THREE.BufferGeometry,color:number)=>parts.push({geometry,color});
 const white=0xeaf0f5,teal=0x16817d,dark=0x263949;
 add(new THREE.CylinderGeometry(1.3,1.48,11,12).rotateX(Math.PI/2),white);
 add(new THREE.SphereGeometry(1,12,8).scale(1.48,1.48,2.65).translate(0,0,5.45),white);
 add(new THREE.CylinderGeometry(.36,1.35,3.9,12).rotateX(-Math.PI/2).translate(0,.15,-7.3),white);
 add(new THREE.BoxGeometry(.14,3.25,3.1).rotateX(-.33).translate(0,1.72,-7.1),teal);
 for(const side of [-1,1]){
  add(new THREE.BoxGeometry(8,.18,2.5).rotateY(side*.25).translate(side*4.6,-.26,-.8),white);
  add(new THREE.BoxGeometry(3.4,.16,1.28).rotateY(side*.22).translate(side*1.9,.28,-7.65),teal);
  add(new THREE.CylinderGeometry(.63,.63,2.9,10).rotateX(Math.PI/2).translate(side*3.35,-.95,-.1),white);
  add(new THREE.CircleGeometry(.48,10).translate(side*3.35,-.95,1.36),dark);
  add(new THREE.BoxGeometry(.07,.39,8.6).translate(side*1.37,.15,.25),teal);
  add(new THREE.BoxGeometry(.32,.57,.94).rotateY(side*.38).translate(side*1.07,.48,6.57),dark);
  for(let row=0;row<9;row++)add(new THREE.BoxGeometry(.085,.30,.40).translate(side*1.4,.43,4.1-row*.9),dark);
  add(new THREE.BoxGeometry(.62,.63,.77).translate(side*1.12,-2.29,-2.15),dark);
  add(new THREE.SphereGeometry(.18,6,4).translate(side*8.5,-.28,-1.55),side>0?0x73ef8c:0xff554c);
 }
 add(new THREE.BoxGeometry(.4,.62,.69).translate(0,-2.25,5.15),dark);
 return coloredGeometry(parts);
}

function makeApron() {
 const parts:Array<{geometry:THREE.BufferGeometry;color:number}>=[];
 const ground=(x:number,z:number,w:number,d:number,color:number,y=.24)=>
  parts.push({geometry:new THREE.BoxGeometry(w,.05,d).translate(x,y,z),color});
 const asphalt=0x343f45,yellow=0xf6cb5f,white=0xf5ebcd;
 ground(-180,VISITOR_TAXIWAY_Z,270,12,asphalt,.145);
 for(const x of [-308,-52])ground(x,-495,12,46,asphalt,.145);
 ground(-180,VISITOR_TAXIWAY_Z,259,.18,yellow);
 ground(-180,-414,118,4,0x889293,.19);
 ground(-180,-405,4,20,0x889293,.19);
 for(const x of [-308,-52])ground(x,-495,.18,44,yellow);
 const digits=[[0,1,2,3,4,5],[1,2],[0,1,6,4,3],[0,1,6,2,3],[5,6,1,2]];
 VISITOR_STANDS.forEach(({x,z},index)=>{
  ground(x,z,25,23,0x525d60,.18);
  for(const side of [-1,1])ground(x+side*12,z,.18,23,yellow);
  ground(x,z+11.5,24,.19,yellow);
  ground(x,(z+VISITOR_TAXIWAY_Z)/2,.17,z-VISITOR_TAXIWAY_Z,yellow);
  ground(x,z+8,4,.23,white);
  ground(x-6,-422,2,16,0x889293,.19);
  const segments=[[0,-1.15,1,.13],[.49,-.55,.13,1],[.49,.55,.13,1],[0,1.15,1,.13],[-.49,.55,.13,1],[-.49,-.55,.13,1],[0,0,1,.13]];
  for(const i of digits[index+1]){const [dx,dz,w,d]=segments[i];ground(x+dx,z+9.6+dz,w,d,white);}
 });
 return new THREE.Mesh(coloredGeometry(parts),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9}));
}

function boardingStairsGeometry() {
 const parts:Array<{geometry:THREE.BufferGeometry;color:number}>=[];
 const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>
  parts.push({geometry:new THREE.BoxGeometry(w,h,d).translate(x,y,z),color});
 const steps=10;
 for(let i=0;i<steps;i++){
  const y=1.1+(i+1)*.23,x=-6+(i+.5)*.46;
  box(x,y-.1,4,.47,.2,1.25,0xc8d2d5);
  for(const side of [-1,1])box(x,y+.43,4+side*.65,.06,.95,.06,0x71868c);
 }
 box(-1.55,3.3,4,.6,.2,1.25,0xc8d2d5);
 return coloredGeometry(parts);
}

export class VisitorAviationRenderer {
 private aircraft:THREE.Mesh[];
 private stairs:THREE.Mesh[];
 private flights:readonly VisitorAircraft[]=[];

 constructor(root:THREE.Object3D) {
  root.add(makeApron());
  const geometry=airlinerGeometry();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.55,metalness:.08});
  this.aircraft=VISITOR_STANDS.map(()=>{
   const mesh=new THREE.Mesh(geometry,material);
   mesh.visible=false;
   root.add(mesh);
   return mesh;
  });
  const stairsGeometry=boardingStairsGeometry();
  this.stairs=VISITOR_STANDS.map(()=>{
   const mesh=new THREE.Mesh(stairsGeometry,material);mesh.visible=false;root.add(mesh);return mesh;
  });
 }

 sync(flights:readonly VisitorAircraft[]|undefined) {
  this.flights=flights||[];
 }

 update(gameNow:number) {
  for(const [index,mesh] of this.aircraft.entries()){
   const flight=this.flights[index];
   const pose=flight&&visitorAircraftPose(gameNow,flight);
   mesh.visible=Boolean(pose);
   const stairs=this.stairs[index];stairs.visible=Boolean(pose?.phase==='parked');
   if(stairs.visible&&pose)stairs.position.set(pose.x,0,pose.z);
   if(!pose)continue;
   mesh.position.set(pose.x,pose.y,pose.z);
   mesh.rotation.y=pose.heading;
  }
 }
}
