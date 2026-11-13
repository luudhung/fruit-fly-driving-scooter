import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {STREET_COLLIDERS,streetCollidersNear,signalPolePose,SIGNAL_POLE_PLACEMENT_ISSUES,type StreetCollider} from '../worker/street-furniture.mjs';
import {INTERSECTIONS} from '../worker/traffic.mjs';
import {ROADS,BUILDINGS,contains} from '../worker/city-map.mjs';
import {TrafficSignals} from '../src/traffic-signals.ts';
import {MetroRenderer} from '../src/metro-renderer.ts';
import {buildRiverBridges} from '../src/city-district.ts';
const named=(prefix:string)=>STREET_COLLIDERS.filter(c=>c.id.startsWith(prefix));
const close=(a:number,b:number)=>Math.abs(a-b)<1e-4;
function transforms(root:THREE.Object3D){
 const result:Array<{geometry:THREE.BufferGeometry;position:THREE.Vector3;scale:THREE.Vector3}>=[];
 root.traverse(o=>{if(!(o instanceof THREE.InstancedMesh))return;for(let i=0;i<o.count;i++){
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
  o.getMatrixAt(i,matrix);matrix.decompose(position,rotation,scale);result.push({geometry:o.geometry,position,scale});
 }});return result;
}
function matches(c:StreetCollider,p:THREE.Vector3){return close(c.x,p.x)&&close(c.z,p.z)&&close((c.minY+c.maxY)/2,p.y);}

test('signal collider poles exactly match all rendered signal instance positions',()=>{
 const root=new THREE.Group(),signals=new TrafficSignals(root,INTERSECTIONS),matrix=new THREE.Matrix4(),p=new THREE.Vector3();
 const cs=named('signal:');assert.equal(cs.length,signals.poles.count);assert.equal(cs.length,INTERSECTIONS.length*2);
 for(let i=0;i<signals.poles.count;i++){
  signals.poles.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);assert.ok(cs.some(c=>matches(c,p)&&c.radius===.09&&c.minY===0&&c.maxY===3.2));
  const axis=i%2?'ew':'ns',head=new THREE.Vector3(),bulb=new THREE.Vector3();
  signals.heads.getMatrixAt(i,matrix);head.setFromMatrixPosition(matrix);assert.ok(close(head.x,p.x)&&close(head.z,p.z)&&close(head.y,3.1));
  for(let color=0;color<3;color++){
   signals.bulbs.getMatrixAt(i*3+color,matrix);bulb.setFromMatrixPosition(matrix);
   assert.ok(close(bulb.x,p.x+(axis==='ew'?.19:0))&&close(bulb.z,p.z+(axis==='ns'?.19:0))&&close(bulb.y,3.48-color*.39));
  }
 }
 assert.equal(cs.filter(c=>ROADS.some(r=>contains(r,c,.15))).length,0);
 assert.equal(cs.filter(c=>BUILDINGS.some(r=>contains(r,c,.4))).length,0);
 assert.deepEqual(SIGNAL_POLE_PLACEMENT_ISSUES,[]);
 signals.dispose();
});

test('metro column colliders match renderer supports, including offset choice and height',()=>{
 const root=new THREE.Group(),sign=()=>new THREE.Sprite();new MetroRenderer(root,sign,()=>{},2);
 const columns=transforms(root).filter(v=>close(v.scale.x,.72)&&close(v.scale.z,.72));
 const cs=named('metro:');assert.ok(cs.length>0);assert.equal(columns.length,cs.length,'every current directional track support has one physical collider');
 const unmatched=[...columns];for(const c of cs){const index=unmatched.findIndex(v=>matches(c,v.position)&&close(c.maxY-c.minY,v.scale.y));assert.ok(index>=0,`missing rendered support ${c.id}`);unmatched.splice(index,1);assert.ok(!ROADS.some(r=>contains(r,c,.36)));}assert.equal(unmatched.length,0,'no rendered column is missing its own collider');
});

test('bridge lamp and concrete pier colliders match renderer and stay above tunnel cars',()=>{
 const root=new THREE.Group();buildRiverBridges(root);
 const lamps=transforms(root).filter(v=>v.geometry instanceof THREE.CylinderGeometry&&close(v.geometry.parameters.radiusBottom,.09));
 assert.equal(lamps.length,named('bridge-lamp:').length);
 for(const c of named('bridge-lamp:'))assert.ok(lamps.some(v=>matches(c,v.position)));
 const boxes=root.children.filter((v):v is THREE.Mesh<THREE.BoxGeometry>=>v instanceof THREE.Mesh&&v.geometry instanceof THREE.BoxGeometry);
 for(const c of named('bridge-pier:')){
  assert.ok(boxes.some(v=>matches(c,v.position)&&close(v.geometry.parameters.width,c.w!)&&close(v.geometry.parameters.depth,c.d!)&&close(v.geometry.parameters.height,c.maxY-c.minY)));
 }
 const near=streetCollidersNear(372,7.35,3);
 const bridge=near.filter(c=>c.id.startsWith('bridge-'));
 assert.ok(bridge.length);assert.ok(bridge.every(c=>c.minY>-3.9),'street structures do not extend down into the tunnel roof');
 assert.ok(bridge.some(c=>c.minY<1.7&&c.maxY>.2),'the same structures remain solid at deck height');
});

test('park and power lamps retain their visible pole extents and finite immutable records',()=>{
 assert.equal(named('park-lamp:').length,14);assert.equal(named('power-pole:').length,5);
 assert.ok(named('park-lamp:').some(c=>c.x===-43&&c.z===-284&&c.radius===.09&&c.minY===0&&c.maxY===3));
 assert.ok(named('power-pole:').some(c=>c.x===-285&&c.z===-67&&c.radius===.16&&c.minY===2&&c.maxY===10));
 assert.ok(Object.isFrozen(STREET_COLLIDERS));
 for(const c of STREET_COLLIDERS){assert.ok(Object.isFrozen(c));assert.ok([c.x,c.z,c.minY,c.maxY].every(Number.isFinite));assert.ok(c.maxY>c.minY);assert.ok(c.radius!==undefined?c.radius>0:c.w!>0&&c.d!>0);}
 assert.equal(new Set(STREET_COLLIDERS.map(c=>c.id)).size,STREET_COLLIDERS.length);
});

test('spatial query finds every intersecting collider once across cells and huge queries',()=>{
 for(let i=0;i<180;i++){
  const c=STREET_COLLIDERS[(i*97)%STREET_COLLIDERS.length],x=c.x+(i%7-3)*2,z=c.z+(i%5-2)*2,radius=(i%9)/2;
  const expected=STREET_COLLIDERS.filter(c=>{if(c.radius!==undefined)return Math.hypot(c.x-x,c.z-z)<=radius+c.radius;const dx=Math.max(0,Math.abs(x-c.x)-c.w/2),dz=Math.max(0,Math.abs(z-c.z)-c.d/2);return Math.hypot(dx,dz)<=radius;});
  assert.deepEqual(streetCollidersNear(x,z,radius).map(c=>c.id).sort(),expected.map(c=>c.id).sort());
 }
 assert.equal(streetCollidersNear(0,0,1e12).length,STREET_COLLIDERS.length);
 assert.deepEqual(streetCollidersNear(NaN,0),[]);assert.deepEqual(streetCollidersNear(0,0,-1),[]);
});


test('only obstructed base poles move to clear nearby corners, with stable cached poses',()=>{
 const used=new Set<string>();
 for(const j of INTERSECTIONS)for(const axis of ['ns','ew'] as const){
  const original={x:j.x+(axis==='ns'?6.4:-6.4),z:j.z+(axis==='ns'?6.2:-6.2)},pose=signalPolePose(j,axis);
  assert.equal(signalPolePose(j,axis),pose);assert.ok(Object.isFrozen(pose));
  const obstructed=ROADS.some(r=>contains(r,original,.15))||BUILDINGS.some(b=>contains(b,original,.4));
  if(obstructed){assert.ok(Math.hypot(pose.x-original.x,pose.z-original.z)<=20);assert.ok(Math.hypot(pose.x-j.x,pose.z-j.z)<=20);}
  else assert.deepEqual(pose,original);
  assert.ok(!ROADS.some(r=>contains(r,pose,.15)));assert.ok(!BUILDINGS.some(b=>contains(b,pose,.4)));
  const key=`${pose.x},${pose.z}`;assert.ok(!used.has(key));used.add(key);
 }
 assert.equal(used.size,INTERSECTIONS.length*2);
});
