import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

type Point = [x:number, z:number];

// Tee to green, at ground scale within the golf parcel. The layout alternates
// directions so no two adjacent holes are copies of the same runway.
const holes: Point[][] = [
 [[88,79],[54,79],[23,68],[-12,64],[-43,76]],
 [[-94,70],[-95,44],[-86,20],[-57,10],[-29,-4]],
 [[-22,35],[7,36],[38,25],[66,28],[94,10]],
 [[82,-23],[54,-34],[20,-27],[-16,-32],[-53,-39]],
 [[-87,-25],[-93,-48],[-70,-62],[-40,-67],[-13,-82]],
 [[8,-72],[37,-70],[60,-58],[82,-66],[96,-85]],
];
const path: Point[] = [[95,96],[56,94],[15,94],[-25,90],[-62,93],[-102,91],[-107,59],[-107,22],[-104,-17],[-107,-52],[-95,-78],[-62,-89],[-29,-96],[8,-92],[40,-92],[75,-96],[105,-91],[108,-56],[110,0],[109,47],[106,86],[95,96]];
const bunkers: [Point,number,number,number][] = [
 [[-49,63],9,4,-.6],[[38,85],10,4,.3],
 [[-43,0],10,4,-.36],[[-96,7],4.5,7,.33],
 [[94,25],8,4,-.12],[[37,14],8,4,-.22],
 [[-50,-24],9,4,.22],[[38,-41],10,4.5,.1],
 [[-22,-68],8.5,4,-.3],[[-86,-63],7,4,.28],
 [[85,-81],7,4.3,-.48],[[64,-48],8,4,.17],
];
const groves: Point[] = [
 [-99,82],[-110,76],[-101,30],[-106,-12],[-102,-36],[-95,-77],[-79,-84],[-64,-82],[-54,-83],[-40,-86],
 [-2,84],[5,87],[21,88],[53,91],[68,89],[81,91],[103,62],[104,54],[102,44],[107,-17],[106,-31],
 [-52,49],[-46,50],[-64,53],[-69,43],[-64,30],[-47,24],[-9,16],[2,12],[9,9],[17,8],[37,-4],[44,-5],
 [-75,-13],[-67,-18],[-65,-38],[-61,-51],[-11,-52],[3,-52],[11,-55],[82,-49],[91,-53],[91,-98],
];

const vectorPath = (points:Point[]) => new THREE.CatmullRomCurve3(points.map(([x,z])=>new THREE.Vector3(x,0,z)));
const color = (n:number) => new THREE.Color(n);
const seeded = (n:number) => {const v=Math.sin(n*127.1+18.91)*43758.5453;return v-Math.floor(v);};

function outline([cx,cz]:Point,rx:number,rz:number,angle:number,irregularity:number,seed:number): Point[] {
 const c=Math.cos(angle),s=Math.sin(angle);
 return Array.from({length:30},(_,i)=>{
  const a=i/30*Math.PI*2;
  const r=1+irregularity*(Math.sin(a*3+seed)*.64+Math.cos(a*5+seed)*.36);
  const x=Math.cos(a)*rx*r,z=Math.sin(a)*rz*r;
  return [cx+x*c-z*s,cz+x*s+z*c];
 });
}

export function createNorthGolfCourse(x:number,z:number){
 const root=new THREE.Group();
 root.name='North Airport Golf · six landscaped holes';
 root.position.set(x,0,z);
 const positions:number[]=[],colors:number[]=[];
 function vertex(p:Point,y:number,c:THREE.Color){
  positions.push(p[0],y,p[1]);colors.push(c.r,c.g,c.b);
 }
 function triangle(a:Point,b:Point,c:Point,y:number,shade:THREE.Color){
  const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  vertex(a,y,shade);vertex(area>0?c:b,y,shade);vertex(area>0?b:c,y,shade);
 }
 function patch(polygon:Point[],y:number,shade:number){
  const tint=color(shade);
  const faces=THREE.ShapeUtils.triangulateShape(polygon.map(([x,z])=>new THREE.Vector2(x,z)),[]);
  for(const [a,b,c] of faces)triangle(polygon[a],polygon[b],polygon[c],y,tint);
 }
 function ribbon(curve:THREE.CatmullRomCurve3,y:number,halfwidth:(t:number)=>number,palette:number[],steps:number){
  const shades=palette.map(color);
  const get=(t:number)=>{
   const p=curve.getPointAt(t),v=curve.getTangentAt(t);
   const w=halfwidth(t);
   return [[p.x+v.z*w,p.z-v.x*w],[p.x-v.z*w,p.z+v.x*w]] as [Point,Point];
  };
  let previous=get(0);
  for(let i=1;i<=steps;i++){
   const next=get(i/steps),shade=shades[Math.floor((i-1)/3)%shades.length];
   triangle(previous[0],previous[1],next[0],y,shade);
   triangle(next[0],previous[1],next[1],y,shade);
   previous=next;
  }
 }
 // The perimeter and plantings blend into the surrounding park. All mowing
 // bands and sand are baked into the same surface draw, with no textures.
 const boundary=path.slice(0,-1);
 patch(boundary,.082,0x5e863e);
 patch(boundary.map(([x,z])=>[x*.96,z*.95]),.092,0x5b823a);
 ribbon(vectorPath(path),.26,()=>1.05,[0xb0aa92],144);
 const innerPath:Point[]=[[-104,85],[-80,79],[-71,61],[-49,51],[-21,51],[13,51],[44,49],[72,51],[94,47],[108,43]];
 ribbon(vectorPath(innerPath),.255,()=>.82,[0xa9a48b],75);
 for(const [i,hole] of holes.entries()){
  const curve=vectorPath(hole),tee=hole[0],green=hole.at(-1)!;
  const taper=(t:number)=>Math.sqrt(Math.max(0,1-Math.max(0,Math.abs(t-.5)-.435)**2/.065**2));
  const halfwidth=(t:number)=>(5+Math.sin(Math.PI*t)**.8*(6.6+Math.sin(t*10+i)*2))*taper(t);
  ribbon(curve,.112,t=>halfwidth(t)+3*taper(t),[0x648e3d,0x688f40],54);
  ribbon(curve,.142,halfwidth,[0x79a448,0x719b45],54);
  const tangent=curve.getTangentAt(1),angle=Math.atan2(tangent.z,tangent.x);
  patch(outline(tee,4.6,3,angle,.07,i),.172,0x8eac58);
  patch(outline(green,10,8,angle,.13,i),.169,0x699c41);
  patch(outline(green,8.5,6.7,angle,.12,i),.197,0x97b96b);
  patch(outline(green,.36,.36,0,0,i),.213,0x2b3830);
 }
 for(const [i,[p,rx,rz,turn]] of bunkers.entries()){
  patch(outline(p,rx+.85,rz+.7,turn,.27,i),.195,0x657741);
  patch(outline(p,rx,rz,turn,.27,i),.222,0xc2a677);
  patch(outline([p[0]-.15,p[1]-.1],rx*.86,rz*.8,turn,.27,i),.243,0xe4cd9c);
 }
 for(const [i,p] of ([[-58,37],[72,-1]] as Point[]).entries()){
  patch(outline(p,12,7,.4,.18,i),.178,0x547740);
  patch(outline(p,10.7,5.8,.4,.18,i),.205,0x437f85);
  patch(outline([p[0]+.8,p[1]-.45],9.4,4.4,.4,.18,i),.222,0x59959a);
 }
 const terrain=new THREE.BufferGeometry();
 terrain.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 terrain.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 terrain.computeVertexNormals();
 terrain.computeBoundingSphere();
 root.add(new THREE.Mesh(terrain,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1})));

 const treeParts=[
  new THREE.BoxGeometry(.1,.58,.1).translate(0,.32,0),
  new THREE.IcosahedronGeometry(1,1).scale(.36,.43,.34).translate(0,.69,0),
 ].map((g,i)=>{
  const geometry=g.index?g.toNonIndexed():g;
  const tint=color(i?0xffffff:0x88776a),data=new Float32Array(geometry.getAttribute('position').count*3);
  for(let j=0;j<data.length;j+=3)data.set([tint.r,tint.g,tint.b],j);
  geometry.setAttribute('color',new THREE.BufferAttribute(data,3));
  if(geometry!==g)g.dispose();
  return geometry;
 });
 const treeGeometry=mergeGeometries(treeParts);
 for(const part of treeParts)part.dispose();
 const trees=new THREE.InstancedMesh(treeGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}),groves.length);
 const dummy=new THREE.Object3D();
 for(const [i,[x,z]] of groves.entries()){
  const h=2.8+seeded(i)*1.5;
  dummy.position.set(x,.1,z);dummy.scale.setScalar(h);dummy.rotation.y=i*.72;dummy.updateMatrix();
  trees.setMatrixAt(i,dummy.matrix);
  trees.setColorAt(i,color([0x466f3b,0x5b8443,0x365831,0x658e49][i%4]));
 }
 trees.instanceMatrix.needsUpdate=true;trees.computeBoundingSphere();root.add(trees);
 const pennantPositions:number[]=[],pennantColors:number[]=[];
 const white=color(0xf0e6d1),red=color(0xb74e2f);
 function markerVertex(x:number,y:number,z:number,c:THREE.Color){pennantPositions.push(x,y,z);pennantColors.push(c.r,c.g,c.b);}
 for(const h of holes){
  const [x,z]=h.at(-1)!;
  markerVertex(x-.055,.2,z,white);markerVertex(x+.055,.2,z,white);markerVertex(x-.055,2.5,z,white);
  markerVertex(x-.055,2.5,z,white);markerVertex(x+.055,.2,z,white);markerVertex(x+.055,2.5,z,white);
  markerVertex(x+.06,2.48,z,red);markerVertex(x+1.35,2.19,z-.18,red);markerVertex(x+.06,1.93,z,red);
 }
 const markers=new THREE.BufferGeometry();
 markers.setAttribute('position',new THREE.Float32BufferAttribute(pennantPositions,3));
 markers.setAttribute('color',new THREE.Float32BufferAttribute(pennantColors,3));
 markers.computeBoundingSphere();
 root.add(new THREE.Mesh(markers,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide})));
 return root;
}
