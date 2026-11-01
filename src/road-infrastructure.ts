import {createRoadMaterial} from './road-lighting.ts';
import * as THREE from 'three';
import {UNDERPASSES,WORLD_HALF,ROADS,type Rect} from '../worker/city-map.mjs';
/** Excavate only the grade-separated riverbank corridors; the bridge deck stays at surface level. */
export function groundWithUnderpassOpenings(){
 const shape=new THREE.Shape();shape.moveTo(-WORLD_HALF,-WORLD_HALF);shape.lineTo(WORLD_HALF,-WORLD_HALF);shape.lineTo(WORLD_HALF,WORLD_HALF);shape.lineTo(-WORLD_HALF,WORLD_HALF);shape.closePath();
 for(const t of UNDERPASSES){const half=t.w/2+2.8,hole=new THREE.Path();hole.moveTo(t.x-half,-t.z-t.halfLength);hole.lineTo(t.x-half,-t.z+t.halfLength);hole.lineTo(t.x+half,-t.z+t.halfLength);hole.lineTo(t.x+half,-t.z-t.halfLength);hole.closePath();shape.holes.push(hole);}
 return new THREE.ShapeGeometry(shape);
}
export function surfaceRoadPieces(r:Rect){
 if(r.w>=r.d)return[r];const tunnels=UNDERPASSES.filter(t=>Math.abs(r.x-t.x)<.1).sort((a,b)=>a.z-b.z);if(!tunnels.length)return[r];
 const result:Rect[]=[];let from=r.z-r.d/2;const end=r.z+r.d/2;
 for(const t of tunnels){const a=Math.max(from,t.z-t.halfLength),b=Math.min(end,t.z+t.halfLength);if(a>from)result.push({x:r.x,z:(a+from)/2,w:r.w,d:a-from});from=Math.max(from,b);}
 if(from<end)result.push({x:r.x,z:(from+end)/2,w:r.w,d:end-from});return result;
}
export function buildUnderpasses(root:THREE.Group){
 const asphalt=createRoadMaterial(0x252d31,.95),wall=new THREE.MeshStandardMaterial({color:0xa5aaa6,roughness:.9}),paint=new THREE.LineBasicMaterial({color:0xede0ab}),lamps=new THREE.MeshBasicMaterial({color:0xffe0a0,toneMapped:false});
 // Keep upper-level bank promenades outside the ramp excavations.
 for(const r of ROADS.filter(r=>r.d>r.w&&(r.x===372||r.x===500)))for(const side of [-1,1]){const offset=r.x===372?8:10.5;const walk=new THREE.Mesh(new THREE.BoxGeometry(2.3,.13,r.d),wall);walk.position.set(r.x+side*offset,.135,r.z);root.add(walk);}
 for(const t of UNDERPASSES){
  const profile=[[-t.halfLength,.14],[-t.coveredHalf,.14-t.depth],[t.coveredHalf,.14-t.depth],[t.halfLength,.14]],positions:number[]=[],indices:number[]=[],walls:number[]=[],wallIndices:number[]=[],lines:number[]=[];
  for(let i=0;i<profile.length;i++){
   const [z,y]=profile[i];positions.push(t.x-t.w/2,y,t.z+z,t.x+t.w/2,y,t.z+z);lines.push(t.x,y+.035,t.z+z);
   for(const side of [-1,1])walls.push(t.x+side*(t.w/2+2.8),y-.2,t.z+z,t.x+side*(t.w/2+2.8),.12,t.z+z);
   if(i){const a=(i-1)*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);for(const side of [0,1]){const b=(i-1)*4+side*2;wallIndices.push(b,b+1,b+4,b+1,b+5,b+4);}}
  }
  const roadGeo=new THREE.BufferGeometry();roadGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));roadGeo.setIndex(indices);roadGeo.computeVertexNormals();root.add(new THREE.Mesh(roadGeo,asphalt));
  const wallGeo=new THREE.BufferGeometry();wallGeo.setAttribute('position',new THREE.Float32BufferAttribute(walls,3));wallGeo.setIndex(wallIndices);wallGeo.computeVertexNormals();const wallMat=wall.clone();wallMat.side=THREE.DoubleSide;root.add(new THREE.Mesh(wallGeo,wallMat));
  const lineGeo=new THREE.BufferGeometry();lineGeo.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));root.add(new THREE.Line(lineGeo,paint));
  for(const side of [-1,1]){
   const sidewalkPositions:number[]=[],sidewalkIndices:number[]=[];
   for(let i=0;i<profile.length;i++){const[z,y]=profile[i];sidewalkPositions.push(t.x+side*(t.w/2+.15),y+.12,t.z+z,t.x+side*(t.w/2+2.5),y+.12,t.z+z);if(i){const a=(i-1)*2;sidewalkIndices.push(a,a+1,a+2,a+1,a+3,a+2);}}
   const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(sidewalkPositions,3));geo.setIndex(sidewalkIndices);geo.computeVertexNormals();const mat=wall.clone();mat.side=THREE.DoubleSide;root.add(new THREE.Mesh(geo,mat));
   const lintel=new THREE.Mesh(new THREE.BoxGeometry(t.w+5.6,.5,.7),wall);lintel.position.set(t.x,-.1,t.z+side*t.coveredHalf);root.add(lintel);
   const strip=new THREE.Mesh(new THREE.BoxGeometry(t.w,.12,.18),lamps);strip.position.set(t.x,-.42,t.z+side*(t.coveredHalf-.7));root.add(strip);
  }
 }
}
