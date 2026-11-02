import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CityBoxBatches} from '../src/city-box-batches.ts';

test('facade batches preserve box transforms, original instance colors and all geometry',()=>{
 const root=new THREE.Group(),groups:THREE.Group[]=[];
 for(const [x,shade]of [[10,0xff0000],[30,0x00ff00]]){
  const group=new THREE.Group();group.position.x=x;root.add(group);groups.push(group);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(4,2,6),new THREE.MeshStandardMaterial({color:shade}));roof.position.y=12;group.add(roof);
  const windows=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0xffffff}),2);
  const m=new THREE.Matrix4().makeTranslation(1,3,4);windows.setMatrixAt(0,m);windows.setMatrixAt(1,new THREE.Matrix4().makeTranslation(-1,3,4));windows.setColorAt(0,new THREE.Color(0xffcc88));windows.setColorAt(1,new THREE.Color(0x224455));group.add(windows);
 }
 const batches=new CityBoxBatches(root,groups);assert.deepEqual(batches.stats,{sourceDraws:4,batchDraws:2,instances:6});
 const meshes=root.children.filter(o=>o instanceof THREE.InstancedMesh);assert.equal(meshes.reduce((n,m)=>n+m.count,0),6);
 const roofBatch=meshes.find(m=>m.material instanceof THREE.MeshStandardMaterial)!;const matrix=new THREE.Matrix4();roofBatch.getMatrixAt(0,matrix);assert.equal(matrix.elements[12],10);assert.equal(matrix.elements[13],12);assert.equal(matrix.elements[0],4);assert.equal(matrix.elements[5],2);assert.equal(matrix.elements[10],6);
 const windows=meshes.find(m=>m.material instanceof THREE.MeshBasicMaterial)!;const color=new THREE.Color();windows.getColorAt(0,color);assert.ok(color.toArray().every((v,i)=>Math.abs(v-new THREE.Color(0xffcc88).toArray()[i])<1e-6));
 assert.ok(groups.every(g=>g.children.every(o=>!o.visible)));
});
test('collapse, construction scale and private damage material update only the affected building',()=>{
 const root=new THREE.Group(),groups=[new THREE.Group(),new THREE.Group()];
 for(const [i,g]of groups.entries()){g.position.x=i*10;g.add(new THREE.Mesh(new THREE.BoxGeometry(2,10,2),new THREE.MeshStandardMaterial({color:0xffffff})));root.add(g);}
 const batches=new CityBoxBatches(root,groups);const mesh=root.children.find(o=>o instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
 groups[0].visible=false;groups[1].scale.y=.4;const source=groups[1].children[0] as THREE.Mesh<THREE.BoxGeometry,THREE.MeshStandardMaterial>;source.material=source.material.clone();source.material.color.setHex(0x333333);batches.sync();
 const m=new THREE.Matrix4();mesh.getMatrixAt(0,m);assert.equal(m.elements[0],0);mesh.getMatrixAt(1,m);assert.equal(m.elements[5],4);const color=new THREE.Color();mesh.getColorAt(1,color);assert.ok(color.toArray().every((v,i)=>Math.abs(v-source.material.color.toArray()[i])<1e-6));
 const version=mesh.instanceMatrix.version;batches.sync();assert.equal(mesh.instanceMatrix.version,version,'unchanged snapshots do not re-upload matrices');
 groups[0].visible=true;batches.sync();mesh.getMatrixAt(0,m);assert.equal(m.elements[5],10);
});
test('spatial cells retain frustum culling and custom facade shaders stay on their original geometry',()=>{
 const root=new THREE.Group(),groups=[new THREE.Group(),new THREE.Group()];
 for(const [i,g]of groups.entries()){g.position.x=i*300;const material=new THREE.MeshStandardMaterial();g.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material));const wall=new THREE.MeshStandardMaterial();wall.userData.cityFacade=true;g.add(new THREE.Mesh(new THREE.BoxGeometry(1,9,1),wall));root.add(g);}
 const batches=new CityBoxBatches(root,groups,192);assert.equal(batches.stats.batchDraws,2);assert.ok(groups.every(g=>g.children[1].visible));assert.ok(root.children.filter(o=>o instanceof THREE.InstancedMesh).every(o=>o.frustumCulled&&o.boundingSphere));
});
test('normalized walls retain the facade shader and shared night-window brightness needs no instance upload',()=>{
 const root=new THREE.Group(),group=new THREE.Group();root.add(group);
 const wall=new THREE.MeshStandardMaterial({color:0x885544});wall.userData.cityFacade=true;wall.userData.normalizedFacade=true;
 const compile:THREE.Material['onBeforeCompile']=shader=>{shader.vertexShader+='\n// preserved facade gradient';};wall.onBeforeCompile=compile;wall.customProgramCacheKey=()=>'facade-test';
 const body=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),wall);body.scale.set(8,30,10);group.add(body);
 const windowMaterial=new THREE.MeshBasicMaterial({color:0xffffff});windowMaterial.userData.cityWindow=true;group.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),windowMaterial));
 const materials:THREE.Material[]=[];const batches=new CityBoxBatches(root,[group],192,m=>materials.push(m));
 const facade=materials.find(m=>m.userData.normalizedFacade)!;assert.equal(facade.onBeforeCompile,compile);assert.equal(facade.customProgramCacheKey(),'facade-test');
 const windowBatch=root.children.find(o=>o instanceof THREE.InstancedMesh&&o.material instanceof THREE.MeshBasicMaterial) as THREE.InstancedMesh<THREE.BoxGeometry,THREE.MeshBasicMaterial>;
 const version=windowBatch.instanceMatrix.version;windowBatch.material.color.setScalar(.72);batches.sync();assert.equal(windowBatch.instanceMatrix.version,version);assert.equal(windowBatch.material.color.r,.72);
});
