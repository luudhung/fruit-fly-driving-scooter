import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildCivicFacility} from '../src/civic-facility-renderer.ts';
import {CIVIC_FACILITY_CATALOG} from '../worker/civic-development.mjs';

test('each civic catalog site has a distinct static symbolic model entirely inside its authoritative physics bounds',()=>{
 const signatures=new Set<string>();
 for(const spec of Object.values(CIVIC_FACILITY_CATALOG)){
  const record={id:`CIVIC-${spec.id}`,x:1000,z:-780,w:spec.w,d:spec.d,h:spec.h,facilityType:spec.id};
  const group=buildCivicFacility(record)!;assert.ok(group);assert.deepEqual(group.position.toArray(),[record.x,0,record.z]);assert.equal(group.scale.y,1);
  assert.ok(group.children.length>=3&&group.children.length<=9,'shared opaque material batches stay bounded');
  const bounds=new THREE.Box3().setFromObject(group);assert.ok(bounds.min.x>=record.x-record.w/2-1e-5);assert.ok(bounds.max.x<=record.x+record.w/2+1e-5);assert.ok(bounds.min.z>=record.z-record.d/2-1e-5);assert.ok(bounds.max.z<=record.z+record.d/2+1e-5);assert.ok(bounds.min.y>=-1e-5);assert.ok(bounds.max.y<=record.h+1e-5,`${spec.id} exceeds actual building height`);
  const feature=group.userData.features.join('|');assert.ok(!signatures.has(feature));signatures.add(feature);
  assert.ok(group.userData.facilityStats.triangles<2500,'no expensive details required for symbolic facilities');
  const before=group.children.map(child=>child.matrix.clone());for(let i=0;i<5;i++)group.updateMatrixWorld(true);assert.ok(group.children.every((child,i)=>child.matrix.equals(before[i])));
  group.traverse(child=>{assert.ok(!(child instanceof THREE.Light));if(child instanceof THREE.Mesh){assert.ok(child.material instanceof THREE.MeshStandardMaterial);assert.equal(child.material.transparent,false);assert.ok(child.geometry.getAttribute('position').array.every(Number.isFinite));}});
 }
 assert.equal(signatures.size,6);
});

test('models share material finishes and keep stage/health handling with the world renderer',()=>{
 const record={x:50,z:80,w:42,d:28,h:18,usage:'factory'},one=buildCivicFacility({...record,stage:'construction',health:20} as typeof record)!,two=buildCivicFacility(record)!;
 assert.equal(one.scale.y,1);assert.equal(one.visible,true);assert.equal(one.children.length,two.children.length);
 for(let i=0;i<one.children.length;i++){const a=one.children[i] as THREE.Mesh,b=two.children[i] as THREE.Mesh;assert.equal(a.material,b.material);assert.deepEqual([...a.geometry.getAttribute('position').array],[...b.geometry.getAttribute('position').array]);}
 assert.ok(one.userData.features.includes('industrial-stacks'));assert.ok(buildCivicFacility({...record,usage:'clinic'})!.userData.features.includes('medical-cross'));assert.ok(buildCivicFacility({...record,usage:'power-plant'})!.userData.features.includes('lightning-mark'));
});

test('ordinary homes, unknown facilities and nonfinite or degenerate authoritative dimensions have no special model',()=>{
 const b={x:0,z:0,w:20,d:20,h:15};
 for(const usage of ['apartment','house','hotel','restaurant','unknown'])assert.equal(buildCivicFacility({...b,usage}),null);
 for(const invalid of [{x:NaN},{z:Infinity},{w:0},{d:-3},{h:NaN}])assert.equal(buildCivicFacility({...b,...invalid,usage:'factory'}),null);
});
