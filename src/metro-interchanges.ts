import * as THREE from 'three';
import {METRO_LINES,metroStationGeometry} from '../worker/city-map.mjs';
import {METRO_INTERCHANGES,metroTransferWaypoints} from '../worker/metro-planner.mjs';
export type MetroWalkPoint={x:number;y:number;z:number};
/** Every directional transfer uses the same elevated paths as the resident planner. */
export function metroInterchangePaths():MetroWalkPoint[][]{
 const paths:MetroWalkPoint[][]=[],visited=new Set<string>();
 for(const station of METRO_INTERCHANGES){
  const key=`${station.x},${station.z}`;if(visited.has(key))continue;visited.add(key);
  const stops=station.lines.map(id=>{const line=METRO_LINES.find(l=>l.id===id)!;return{line,index:line.points.findIndex(p=>p[0]===station.x&&p[1]===station.z)};});
  for(let i=0;i<stops.length;i++)for(let j=i+1;j<stops.length;j++)for(const fromDirection of [1,-1])for(const toDirection of [1,-1]){
   const a=stops[i],b=stops[j],from=metroStationGeometry(a.line,a.index,fromDirection).platform;
   const route=metroTransferWaypoints(a.line,a.index,b.line,b.index,fromDirection,toDirection);if(!route)continue;
   paths.push([from,...route.map(point=>({x:point.x,y:point.y??b.line.height+1.15,z:point.z}))]);
  }
 }
 return paths;
}
/** Shared batches for bridges/lift shafts, with duplicate overlapping segments removed. */
export function buildElevatedMetroWalkways(root:THREE.Object3D,paths:readonly (readonly MetroWalkPoint[])[],cellSize=0){
 const pieces:THREE.Matrix4[]=[],glass:THREE.Matrix4[]=[],dummy=new THREE.Object3D(),keys=new Set<string>();
 const block=(list:THREE.Matrix4[],x:number,y:number,z:number,w:number,h:number,d:number,yaw=0)=>{dummy.position.set(x,y,z);dummy.rotation.set(0,yaw,0);dummy.scale.set(w,h,d);dummy.updateMatrix();list.push(dummy.matrix.clone());};
 const key=(a:MetroWalkPoint,b:MetroWalkPoint)=>[a,b].map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`).sort().join('|');
 for(const points of paths)for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],id=key(a,b);if(keys.has(id))continue;keys.add(id);
  const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),y=(a.y+b.y)/2;
  if(length<.05){
   if(Math.abs(a.y-b.y)>.1){
    block(glass,a.x,y-.9,a.z,1.4,Math.abs(a.y-b.y),1.4);
    // The small solid lower/upper landings make the lift access visible from either level.
    for(const height of [a.y,b.y])block(pieces,a.x,height-1.025,a.z,1.6,.25,1.6);
   }
   continue;
  }
  const angle=Math.atan2(-dz,dx);block(pieces,(a.x+b.x)/2,y-1.025,(a.z+b.z)/2,length,.25,1.6,angle);
  for(const side of [-1,1])block(pieces,(a.x+b.x)/2-dz/length*side*.72,y+.1,(a.z+b.z)/2+dx/length*side*.72,length,.075,.075,angle);
 }
 const meshes:THREE.InstancedMesh[]=[];
 for(const [list,material]of [[pieces,new THREE.MeshStandardMaterial({color:0x9ba9ad,roughness:.7,metalness:.3})],[glass,new THREE.MeshStandardMaterial({color:0x83b9cd,roughness:.28,metalness:.25,transparent:true,opacity:.45,depthWrite:false})]] as const){
  const cells=new Map<string,THREE.Matrix4[]>();
  for(const matrix of list){const key=cellSize>0?Math.floor(matrix.elements[12]/cellSize)+':'+Math.floor(matrix.elements[14]/cellSize):'all';const cell=cells.get(key)||[];cell.push(matrix);cells.set(key,cell);}
  for(const cell of cells.values()){
   const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,cell.length);cell.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();root.add(mesh);meshes.push(mesh);
  }
 }
 return meshes;
}
/** Platforms share elevated walkways and short lifts, entirely above the carriageway. */
export function buildMetroInterchanges(root:THREE.Object3D,cellSize=0){return buildElevatedMetroWalkways(root,metroInterchangePaths(),cellSize);}
