import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {DISTRICT_BRIDGES,DISTRICT_PROMENADES,ROADS,RIVER,HARBOR,DISTRICT_RIVERS} from '../worker/city-map.mjs';
import {subtractRects,unionRects,type Rect} from './surface-rectangles.ts';
export const cityRiverSurfaces=()=>unionRects([RIVER,HARBOR,...DISTRICT_RIVERS]);
/** Fixed bridges use the same deck/walk coordinates as authoritative road and foot routing. */
export function buildDistrictRiverInfrastructure(parent:THREE.Object3D,existingWalks:readonly Rect[]=[]){
 const group=new THREE.Group();group.name='North and West river bridges';parent.add(group);
 const stone=new THREE.MeshStandardMaterial({color:0xadb8b4,roughness:.9}),metal=new THREE.MeshStandardMaterial({color:0x547b80,roughness:.65,metalness:.35});
 const layers=new Map<THREE.Material,THREE.BufferGeometry[]>();
 const box=(mat:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{let list=layers.get(mat);if(!list){list=[];layers.set(mat,list);}list.push(new THREE.BoxGeometry(w,h,d).translate(x,y,z));};
 for(const b of DISTRICT_BRIDGES){
  if(b.motorway)continue;const horizontal=b.axis==='x',length=horizontal?b.w:b.d,span=horizontal?b.d:b.w,offset=b.walkOffset||6.2;
  box(stone,b.x,-.24,b.z,b.w,.64,b.d);
  for(const side of [-1,1]){
   box(stone,b.x+(horizontal?0:side*offset),.24,b.z+(horizontal?side*offset:0),horizontal?length:2.5,.20,horizontal?2.5:length);
   const edge=side*(span/2-.25);
   for(let along=-length/2+1;along<=length/2-1;along+=5)box(metal,b.x+(horizontal?along:edge),.93,b.z+(horizontal?edge:along),.11,1.3,.11);
   for(const y of [.70,1.48])box(metal,b.x+(horizontal?0:edge),y,b.z+(horizontal?edge:0),horizontal?length:.12,.12,horizontal?.12:length);
  }
 }
 for(const p of subtractRects(DISTRICT_PROMENADES,[...ROADS,...existingWalks]))box(stone,p.x,.12,p.z,p.w,.12,p.d);
 for(const [material,parts]of layers){const geometry=mergeGeometries(parts);if(geometry){const mesh=new THREE.Mesh(geometry,material);mesh.updateMatrix();mesh.matrixAutoUpdate=false;group.add(mesh);}for(const part of parts)part.dispose();}
 group.userData.bridgeCount=DISTRICT_BRIDGES.filter(b=>!b.motorway).length;group.userData.realLights=0;return group;
}
