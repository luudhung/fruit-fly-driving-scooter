import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {UrbanWorldRenderer,type UrbanWorldSnapshot} from '../src/urban-world-renderer.ts';
import {ROADS,applyUrbanGeometry} from '../worker/city-map.mjs';
import {intersection} from '../src/surface-rectangles.ts';
const empty=():UrbanWorldSnapshot=>({buildings:[],roads:[],fires:[],projects:[],floods:[]});

test('facility snapshot renders distinct equipment, construction and collapse using authoritative footprint without apartments',()=>{
 applyUrbanGeometry();const root=new THREE.Group(),viewer=new UrbanWorldRenderer(root),state=empty();
 const record={id:'CIVIC-INTEGRATION-POWER',x:1000,z:0,w:38,d:30,h:16,kind:'civic',usage:'power-plant',facilityType:'power-plant',stage:'construction',health:100,progress:.4};
 state.buildings=[record];viewer.sync(state);
 const facility=root.children.find(g=>g.userData.buildingId===record.id)!;assert.ok(facility);assert.equal(facility.userData.facilityType,'power-plant');assert.ok(facility.userData.features.includes('transformers'));assert.equal(facility.scale.y,.4);
 for(const child of facility.children)assert.equal(child.matrixAutoUpdate,false);
 record.stage='operational';viewer.sync(state);assert.equal(facility.visible,true);assert.equal(facility.scale.y,1);assert.equal(root.children.filter(g=>g.userData.buildingId===record.id).length,1);
 const bounds=new THREE.Box3().setFromObject(facility);assert.ok(bounds.max.y<=16.0001);assert.ok(bounds.max.x<=1019.0001);
 record.stage='collapsed';viewer.sync(state);assert.equal(facility.visible,false);
 record.stage='operational';viewer.sync(state);assert.equal(facility.visible,true);assert.equal(facility.scale.y,1);
 viewer.sync(empty());assert.ok(!root.children.includes(facility));applyUrbanGeometry();
});

test('commissioned access roads have no duplicated asphalt at joins and rebuild only after network changes',()=>{
 applyUrbanGeometry();const base=ROADS.map(r=>({...r})),root=new THREE.Group(),viewer=new UrbanWorldRenderer(root),state=empty();
 state.roads=[{id:'CIVIC-ACCESS-TEST',x:1000,z:100,w:120,d:8,stage:'operational'}];viewer.sync(state);
 let asphalt=root.children.find(g=>g.name==='Disjoint asphalt surfaces') as THREE.InstancedMesh;assert.ok(asphalt);assert.ok(asphalt.count>0);
 const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
 for(let i=0;i<asphalt.count;i++){asphalt.getMatrixAt(i,matrix);matrix.decompose(position,rotation,scale);const rect={x:position.x,z:position.z,w:scale.x,d:scale.z};for(const road of base)assert.equal(intersection(rect,road),null,'dynamic joins must not draw over authored asphalt');}
 viewer.sync(state);assert.equal(root.children.find(g=>g.name==='Disjoint asphalt surfaces'),asphalt);
 state.roads!.push({id:'CIVIC-ACCESS-CROSS',x:1000,z:120,w:8,d:80,stage:'operational'});viewer.sync(state);assert.ok(!root.children.includes(asphalt));asphalt=root.children.find(g=>g.name==='Disjoint asphalt surfaces') as THREE.InstancedMesh;
 assert.equal(root.children.filter(g=>g.name==='Disjoint asphalt surfaces').length,1);
 const rectangles=[];for(let i=0;i<asphalt.count;i++){asphalt.getMatrixAt(i,matrix);matrix.decompose(position,rotation,scale);rectangles.push({x:position.x,z:position.z,w:scale.x,d:scale.z});}
 for(let i=0;i<rectangles.length;i++)for(let j=i+1;j<rectangles.length;j++)assert.equal(intersection(rectangles[i],rectangles[j]),null);
 viewer.sync(empty());assert.ok(!root.children.includes(asphalt));applyUrbanGeometry();
});
