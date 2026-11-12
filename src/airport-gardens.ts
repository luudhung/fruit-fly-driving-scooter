import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {AIRPORT_PARK,AIRPORT_PARK_PATHS,AIRPORT_PARK_PONDS,contains,overlaps,type Rect} from '../worker/city-map.mjs';

type Part={geometry:THREE.BufferGeometry;color:number};
type SignMaker=(text:string,width:number,height:number)=>THREE.Sprite;
type Options={waterMaterial?:THREE.Material;treeScale?:number};
type GardenTree={x:number;z:number;scale:number};

function coloredBatch(parts:Part[],material:THREE.Material){
 const geometries=parts.map(({geometry,color})=>{
  const g=geometry.index?geometry.toNonIndexed():geometry;
  const tint=new THREE.Color(color),colors=new Float32Array(g.getAttribute('position').count*3);
  for(let i=0;i<colors.length;i+=3)tint.toArray(colors,i);
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
 });
 const geometry=mergeGeometries(geometries);
 if(!geometry)throw new Error('Unable to batch Airport Gardens landscape');
 for(const part of new Set([...parts.map(part=>part.geometry),...geometries]))part.dispose();
 return new THREE.Mesh(geometry,material);
}

/** A complete neighborhood park with static batched furnishings and shared trees.
 * Only the viewer draws it; there are no lights, timers or server-side particles. */
export function buildAirportGardens(root:THREE.Object3D,makeSign:SignMaker,options:Options={}){
 const group=new THREE.Group();group.name='Airport Gardens';root.add(group);
 const ground:Part[]=[],furniture:Part[]=[];
 const grass=0x608964,path=0xdac9a8,wood=0x936b46,iron=0x40514c;
 const box=(out:Part[],x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>
  out.push({geometry:new THREE.BoxGeometry(w,h,d).translate(x,y,z),color});
 const cylinder=(out:Part[],x:number,y:number,z:number,r:number,h:number,color:number,segments=8)=>
  out.push({geometry:new THREE.CylinderGeometry(r,r,h,segments).translate(x,y,z),color});
 const clear=(rect:Rect,margin=1)=>
  AIRPORT_PARK_PATHS.every(p=>!overlaps(rect,p,margin))&&AIRPORT_PARK_PONDS.every(p=>!overlaps(rect,p,margin));
 const inside=(rect:Rect)=>contains(AIRPORT_PARK,{x:rect.x-rect.w/2,z:rect.z-rect.d/2},-2)&&
  contains(AIRPORT_PARK,{x:rect.x+rect.w/2,z:rect.z+rect.d/2},-2);
 const reserved:Rect[]=[];

 box(ground,AIRPORT_PARK.x,.085,AIRPORT_PARK.z,AIRPORT_PARK.w,.10,AIRPORT_PARK.d,grass);
 for(const p of AIRPORT_PARK_PATHS)box(ground,p.x,.18,p.z,p.w,.10,p.d,path);
 // A wide entry forecourt sits beside the main avenue, keeping the axial walk open.
 box(ground,AIRPORT_PARK.x,.17,-737,35,.08,8,0xc4b89c);
 for(const side of [-1,1]){
  box(furniture,AIRPORT_PARK.x+side*13,1.6,-737,.55,3,1,0x8a8f80);
  box(furniture,AIRPORT_PARK.x+side*13,3.2,-737,1,.3,1.45,0xc5c8ad);
 }

 const playground:Rect={x:-128,z:-875,w:28,d:22};
 if(inside(playground)&&clear(playground,2)){
  reserved.push(playground);
  box(ground,playground.x,.19,playground.z,playground.w,.08,playground.d,0xb98f74);
  box(ground,playground.x,.245,playground.z,playground.w-2,.025,playground.d-2,0xc4a382);
  // A small climbing tower, slide and a two-seat swing are symbolic, static props.
  for(const x of [-3.4,3.4])for(const z of [-2.4,2.4])
   box(furniture,playground.x+x,1.5,playground.z+z,.25,2.5,.25,0x599588);
  box(furniture,playground.x,1.9,playground.z,7.2,.25,5.4,0xb78a4e);
  const roof=new THREE.ConeGeometry(5.3,1.8,4).rotateY(Math.PI/4).translate(playground.x,3.7,playground.z);
  furniture.push({geometry:roof,color:0xc17c55});
  const slide=new THREE.BoxGeometry(2.0,.16,5.5).rotateX(-.32).translate(playground.x,1.1,playground.z+5);
  furniture.push({geometry:slide,color:0xc8c5ad});
  for(const side of [-1,1]){
   box(furniture,playground.x+8+side*3,1.8,playground.z-5,.2,3,.2,0x728b75);
   box(furniture,playground.x+8+side*1.2,1.7,playground.z-5,.04,2.7,.04,iron);
   box(furniture,playground.x+8+side*1.2,.48,playground.z-5,1,.12,.55,wood);
  }
  box(furniture,playground.x+8,3.25,playground.z-5,6.4,.24,.25,0x728b75);
 }

 const picnic:Rect={x:-213,z:-785,w:28,d:22};
 if(inside(picnic)&&clear(picnic,2)){
  reserved.push(picnic);
  box(ground,picnic.x,.18,picnic.z,picnic.w,.08,picnic.d,0x77a078);
  // A pergola frames four picnic tables rather than closing off a public path.
  for(const side of [-1,1])for(const end of [-1,1])
   box(furniture,picnic.x+side*9,1.7,picnic.z+end*7,.25,3,.25,wood);
  for(let x=-9;x<=9;x+=1.8)box(furniture,picnic.x+x,3.25,picnic.z,.25,.25,15,0xa48b65);
  for(const x of [-5,5])for(const z of [-4,4]){
   box(furniture,picnic.x+x,.95,picnic.z+z,3.3,.18,1.55,0xa67c50);
   for(const side of [-1,1]){
    box(furniture,picnic.x+x,.55,picnic.z+z+side*1.1,3.3,.18,.45,wood);
    box(furniture,picnic.x+x+side*.95,.48,picnic.z+z,.18,.85,1.7,iron);
   }
  }
 }

 let benches=0;
 for(const x of [AIRPORT_PARK.x-60,AIRPORT_PARK.x+60])for(let z=AIRPORT_PARK.z-75;z<=AIRPORT_PARK.z+75;z+=25){
  const site={x,z,w:3.4,d:1.8};
  if(!clear(site,.8)||reserved.some(r=>overlaps(r,site,1)))continue;
  benches++;
  box(furniture,x,.66,z,3.2,.2,.75,wood);
  box(furniture,x,1.1,z+.35,3.2,.8,.14,wood);
  for(const side of [-1,1])box(furniture,x+side*1.1,.36,z,.13,.6,.65,iron);
 }

 const flowerBeds:Rect[]=[];
 for(const side of [-1,1]){
  const bed={x:AIRPORT_PARK.x+side*23,z:-752,w:9,d:7};
  if(clear(bed,1)&&inside(bed)){
   flowerBeds.push(bed);reserved.push(bed);
   box(ground,bed.x,.2,bed.z,bed.w,.12,bed.d,0x826e54);
  }
 }
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.91});
 group.add(coloredBatch(ground,material),coloredBatch(furniture,material));

 // Both ponds reuse the city's analytic water shader when supplied by the viewer.
 const waterParts:THREE.BufferGeometry[]=[];
 for(const pond of AIRPORT_PARK_PONDS){
  waterParts.push(new THREE.CylinderGeometry(1,1,.08,40).scale(pond.w/2,1,pond.d/2).translate(pond.x,.22,pond.z));
 }
 const water=mergeGeometries(waterParts);
 if(water)group.add(new THREE.Mesh(water,options.waterMaterial||new THREE.MeshStandardMaterial({color:0x628d96,roughness:.28,metalness:.25})));
 for(const part of waterParts)part.dispose();

 const trees:GardenTree[]=[];
 const hash=(n:number)=>{const value=Math.sin(n*127.1+47.7)*43758.5453123;return value-Math.floor(value);};
 const target=Math.round(310*THREE.MathUtils.clamp(options.treeScale??1,.3,1));
 for(let i=0;i<target*5&&trees.length<target;i++){
  const x=AIRPORT_PARK.x-AIRPORT_PARK.w/2+5+hash(i+7)*(AIRPORT_PARK.w-10);
  const z=AIRPORT_PARK.z-AIRPORT_PARK.d/2+5+hash(i+401)*(AIRPORT_PARK.d-10);
  const site={x,z,w:4.4,d:4.4};
  if(!clear(site,1.4)||reserved.some(r=>overlaps(r,site,1.2))||
    trees.some(tree=>(tree.x-x)**2+(tree.z-z)**2<22))continue;
  trees.push({x,z,scale:1.35+hash(i+1007)*1.15});
 }
 const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.14,.22,1.8,6),new THREE.MeshStandardMaterial({color:0x6c5138,roughness:1}),trees.length);
 const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.1,0),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),trees.length);
 const dummy=new THREE.Object3D(),color=new THREE.Color();
 trees.forEach((tree,index)=>{
  dummy.position.set(tree.x,.9*tree.scale,tree.z);dummy.scale.setScalar(tree.scale);dummy.updateMatrix();trunks.setMatrixAt(index,dummy.matrix);
  dummy.position.y=2.35*tree.scale;dummy.scale.set(tree.scale,tree.scale*1.15,tree.scale);dummy.updateMatrix();crowns.setMatrixAt(index,dummy.matrix);
  color.setHex([0x355e42,0x477951,0x548359,0x648d5b][index%4]);crowns.setColorAt(index,color);
 });
 trunks.instanceMatrix.needsUpdate=true;crowns.instanceMatrix.needsUpdate=true;
 if(crowns.instanceColor)crowns.instanceColor.needsUpdate=true;
 group.add(trunks,crowns);

 const flowers=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.16,0),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),flowerBeds.length*42);
 let flower=0;
 for(const bed of flowerBeds)for(let i=0;i<42;i++){
  dummy.position.set(bed.x+(hash(i+flower*2)-.5)*(bed.w-1),.38,bed.z+(hash(i+flower*3+97)-.5)*(bed.d-1));
  dummy.scale.set(1,1.4,1);dummy.updateMatrix();flowers.setMatrixAt(flower,dummy.matrix);
  color.setHex([0xe6c786,0xbb797d,0xe4c7b6][i%3]);flowers.setColorAt(flower++,color);
 }
 flowers.count=flower;flowers.instanceMatrix.needsUpdate=true;
 if(flowers.instanceColor)flowers.instanceColor.needsUpdate=true;
 group.add(flowers);

 const sign=makeSign('AIRPORT GARDENS · HANSDREX',31,1.7);
 sign.position.set(AIRPORT_PARK.x,4.8,-737);group.add(sign);
 return {group,stats:{trees:trees.length,benches,ponds:AIRPORT_PARK_PONDS.length,flowerBeds:flowerBeds.length,meshes:6}};
}
