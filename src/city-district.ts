import * as THREE from 'three';
import {BRIDGES,SPORTS_VENUES} from '../worker/city-map.mjs';
type Sign=(text:string,width:number,height:number)=>THREE.Sprite;
const steel=new THREE.MeshStandardMaterial({color:0x657b86,roughness:.55,metalness:.5});
const concrete=new THREE.MeshStandardMaterial({color:0xa7aaa5,roughness:.9});
const white=new THREE.LineBasicMaterial({color:0xf4eee1});
function block(root:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);root.add(m);return m;}
/** All arch members share geometry and a draw call, rather than one mesh per steel bar. */
export function buildRiverBridges(root:THREE.Group){
 const beam=new THREE.CylinderGeometry(1,1,1,6),up=new THREE.Vector3(0,1,0),dummy=new THREE.Object3D();
 for(const bridge of BRIDGES){
  const main=bridge.z===0,rise=main?36:14,steps=main?32:20,half=bridge.w/2,side=bridge.d/2-.6;
  block(root,bridge.w,.5,bridge.d,bridge.x,-.12,bridge.z,new THREE.MeshStandardMaterial({color:0x424b50,roughness:.9}));
  const bars:Array<{a:THREE.Vector3;b:THREE.Vector3;r:number}>=[];
  const add=(ax:number,ay:number,az:number,bx:number,by:number,bz:number,r=.22)=>bars.push({a:new THREE.Vector3(ax,ay,az),b:new THREE.Vector3(bx,by,bz),r});
  const arch=(t:number)=>2.6+rise*Math.sin(Math.PI*t);
  for(const direction of [-1,1]){
   const z=bridge.z+direction*side;
   add(bridge.x-half,1.2,z,bridge.x+half,1.2,z,.3);
   for(let i=0;i<steps;i++){
    const a=i/steps,b=(i+1)/steps,x=bridge.x-half+bridge.w*a,next=bridge.x-half+bridge.w*b;
    add(x,arch(a),z,next,arch(b),z,main?.42:.28);
    add(x,arch(a)+2.1,z,next,arch(b)+2.1,z,main?.26:.18);
    add(x,arch(a),z,next,arch(b)+2.1,z,.14);
    if(i%2===0){add(x,1.2,z,x,arch(a),z,.12);add(x,arch(a),bridge.z-side,x,arch(a),bridge.z+side,.18);}
   }
   for(const x of [bridge.x-half+4,bridge.x+half-4])block(root,main?5:3,main?12:5,4,x,main?6:2.5,z+direction*3.5,concrete);
  }
  const mesh=new THREE.InstancedMesh(beam,steel,bars.length);
  bars.forEach(({a,b,r},i)=>{const delta=b.clone().sub(a);dummy.position.copy(a).add(b).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(up,delta.clone().normalize());dummy.scale.set(r,delta.length(),r);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});root.add(mesh);
  const lamps:number[]=[];for(let i=0;i<=steps;i++){const t=i/steps;for(const sideSign of [-1,1])lamps.push(bridge.x-half+bridge.w*t,arch(t),bridge.z+sideSign*side);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(lamps,3));root.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0xffd488,size:.38,toneMapped:false})));
 }
}
function fieldLines(root:THREE.Group,segments:number[][],x:number,z:number){
 const positions=segments.flatMap(([ax,az,bx,bz])=>[x+ax,.245,z+az,x+bx,.245,z+bz]);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));root.add(new THREE.LineSegments(g,white));
}
export function buildSportsDistrict(root:THREE.Group,makeSign:Sign){
 const turf=new THREE.MeshStandardMaterial({color:0x3f814f,roughness:1}),court=new THREE.MeshStandardMaterial({color:0x3b7890,roughness:1});
 for(const v of SPORTS_VENUES){
  const g=new THREE.Group();g.position.set(v.x,0,v.z);root.add(g);
  if(v.id==='riverside-park'){
   block(g,v.w,.08,v.d,0,.13,0,turf);block(g,3,.1,v.d,0,.19,0,concrete);
   for(const x of [-14,14])for(const z of [-20,-7,7,20]){
    const tree=new THREE.Mesh(new THREE.ConeGeometry(3.2,9,6),turf);tree.position.set(x,5,z);g.add(tree);
    block(g,1,3,1,x,1.5,z,new THREE.MeshStandardMaterial({color:0x6b5140}));
   }
   continue;
  }
  block(g,v.w,.1,v.d,0,.13,0,turf);
  if(v.id==='stadium'){
   block(g,26,.08,46,0,.18,0,turf);
   fieldLines(g,[[-13,-23,13,-23],[13,-23,13,23],[13,23,-13,23],[-13,23,-13,-23],[-13,0,13,0],[-8,-23,-8,-14],[-8,-14,8,-14],[8,-14,8,-23],[-8,23,-8,14],[-8,14,8,14],[8,14,8,23]],0,0);
   const circle=new THREE.BufferGeometry().setFromPoints(Array.from({length:49},(_,i)=>new THREE.Vector3(Math.cos(i/48*Math.PI*2)*5,.245,Math.sin(i/48*Math.PI*2)*5)));g.add(new THREE.Line(circle,white));
   const standMatrices:THREE.Matrix4[]=[],d=new THREE.Object3D();
   for(let row=0;row<5;row++)for(const side of [-1,1]){
    d.position.set(side*(15+row*1.4),.4+row*.8,0);d.scale.set(1.5,.8,48);d.updateMatrix();standMatrices.push(d.matrix.clone());
   }
   const stands=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),concrete,standMatrices.length);standMatrices.forEach((m,i)=>stands.setMatrixAt(i,m));g.add(stands);
   const roof=new THREE.MeshStandardMaterial({color:0x366075,metalness:.25,roughness:.6});
   for(const side of [-1,1]){block(g,8,.45,51,side*19,8,0,roof);for(const z of [-23,23])block(g,.5,8,.5,side*21,4,z,steel);}
   const goalMat=new THREE.MeshBasicMaterial({color:0xf3ede4});for(const side of [-1,1]){for(const x of [-4,4])block(g,.18,3,.18,x,1.7,side*23,goalMat);block(g,8.2,.18,.18,0,3.2,side*23,goalMat);}
   const label=makeSign('RIVERSIDE STADIUM',32,1.3);label.position.set(0,11,-25);g.add(label);
  }else{
   for(const x of [-10,10]){
    block(g,16,.06,34,x,.2,0,court);fieldLines(g,[[-7,-14,7,-14],[7,-14,7,14],[7,14,-7,14],[-7,14,-7,-14],[-5,-14,-5,14],[5,-14,5,14],[-5,-6,5,-6],[-5,6,5,6],[0,-6,0,6]],x,0);
    block(g,14,1,.06,x,.8,0,new THREE.MeshBasicMaterial({color:0xe0e0ce,transparent:true,opacity:.55}));for(const side of [-1,1])block(g,.14,1.4,.14,x+side*7,.9,0,steel);
   }
   const label=makeSign('RIVERSIDE TENNIS CLUB',28,1.2);label.position.set(0,6,-23);g.add(label);
  }
 }
}
