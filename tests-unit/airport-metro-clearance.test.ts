import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MetroRenderer} from '../src/metro-renderer.ts';
import {AIRPORT_DEPARTURE_ROAD as ROAD} from '../worker/airport-departure-roads.mjs';
import {METRO_LINES,metroStationGeometry} from '../worker/city-map.mjs';
import {STREET_COLLIDERS} from '../worker/street-furniture.mjs';

test('M12 stairs and all rendered metro supports leave the complete airport vehicle corridor clear',()=>{
 const root=new THREE.Group();new MetroRenderer(root,()=>new THREE.Sprite(),()=>{},1);root.updateMatrixWorld(true);
 const obstacles:THREE.Mesh[]=[],area=new THREE.Box3(new THREE.Vector3(-470,0,-435),new THREE.Vector3(390,12,-245));
 const matrix=new THREE.Matrix4(),world=new THREE.Matrix4(),bounds=new THREE.Box3(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
 root.traverse(o=>{if(!(o instanceof THREE.InstancedMesh))return;o.geometry.computeBoundingBox();for(let i=0;i<o.count;i++){
  o.getMatrixAt(i,matrix);world.multiplyMatrices(o.matrixWorld,matrix);bounds.copy(o.geometry.boundingBox!).applyMatrix4(world);if(!bounds.intersectsBox(area))continue;
  const mesh=new THREE.Mesh(o.geometry,material);mesh.matrixAutoUpdate=false;mesh.matrix.copy(world);mesh.matrixWorld.copy(world);obstacles.push(mesh);
 }});
 assert.ok(obstacles.length>0);
 for(let i=1;i<ROAD.points.length;i++){
  const a=ROAD.points[i-1],b=ROAD.points[i],length=Math.hypot(b.x-a.x,b.z-a.z),nx=-(b.z-a.z)/length,nz=(b.x-a.x)/length;
  for(const side of [-1.2,0,1.2])for(const height of [.4,1.1,1.9]){
   const origin=new THREE.Vector3(a.x+nx*side,a.y-ROAD.carOffset+height,a.z+nz*side),end=new THREE.Vector3(b.x+nx*side,b.y-ROAD.carOffset+height,b.z+nz*side),delta=end.sub(origin),distance=delta.length();
   const hits=new THREE.Raycaster(origin,delta.normalize(),.01,distance-.01).intersectObjects(obstacles,false);
   assert.equal(hits.length,0,`metro blocks airport road segment ${i}, lateral ${side}, height ${height}: ${hits[0]?.point.toArray()}`);
  }
 }
 const line=METRO_LINES.find(l=>l.id==='M12')!,g=metroStationGeometry(line,1);
 assert.equal(g.accessViolations,0);assert.ok(g.access.x<-310,'the staircase begins on the clear western sidewalk');
 for(const c of STREET_COLLIDERS.filter(c=>c.id.startsWith('metro:'))){
  assert.ok(!ROAD.points.some((b,i)=>{if(!i)return false;const a=ROAD.points[i-1],dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz,u=Math.max(0,Math.min(1,((c.x-a.x)*dx+(c.z-a.z)*dz)/l));return Math.hypot(c.x-a.x-dx*u,c.z-a.z-dz*u)<ROAD.width/2+.72;}),c.id);
 }
 material.dispose();
});
