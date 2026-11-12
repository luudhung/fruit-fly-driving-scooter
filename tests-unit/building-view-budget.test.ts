import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CityBoxBatches} from '../src/city-box-batches.ts';
import {NewYorkArchitecture} from '../src/new-york-architecture.ts';

function apartment(root:THREE.Group,id:string,z:number){
 const group=new THREE.Group();group.position.z=z;group.userData.buildingId=id;root.add(group);
 const material=new THREE.MeshStandardMaterial({color:0xaabbcc});material.userData.cityFacade=true;material.userData.normalizedFacade=true;
 material.onBeforeCompile=shader=>{shader.vertexShader+='\n// original facade gradient';};material.customProgramCacheKey=()=>'original-facade';
 const body=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);body.scale.set(10,30,12);body.position.y=15;group.add(body);
 const windowMaterial=new THREE.MeshBasicMaterial();windowMaterial.userData.cityWindow=true;
 const windows=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),windowMaterial,200),dummy=new THREE.Object3D();let index=0;
 for(let floor=0;floor<10;floor++)for(let col=0;col<10;col++)for(const face of [-1,1]){
  dummy.position.set(col-4.5,1.8+floor*2.4,face*6.09);dummy.scale.set(.92,1.12,.025);dummy.updateMatrix();windows.setMatrixAt(index++,dummy.matrix);
 }
 group.add(windows);
 const roof=new THREE.Mesh(new THREE.ConeGeometry(7,3,4),new THREE.MeshStandardMaterial());roof.position.y=31.5;group.add(roof);
 return {group,roof,body};
}
function camera(){const c=new THREE.PerspectiveCamera(60,1.5,.1,3000);c.position.set(0,10,0);c.lookAt(0,10,-100);c.updateProjectionMatrix();return c;}

test('static facades keep every building, fixed baked window grid and colors unchanged by camera approach',()=>{
 const root=new THREE.Group(),near=apartment(root,'NEAR',-60),far=apartment(root,'FAR',-650),behind=apartment(root,'BEHIND',70);
 const batch=new CityBoxBatches(root,[near.group,far.group,behind.group]),c=camera();batch.enableStaticFacades();batch.sync();
 assert.equal(batch.stats.instances,603);assert.equal(batch.viewStats.activeInstances,3,'all ordinary windows are baked at every distance');
 const meshes=root.children.filter(o=>o instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
 const facades=meshes.filter(o=>!Array.isArray(o.material)&&o.material.userData.normalizedFacade);
 assert.equal(facades.reduce((sum,o)=>sum+o.count,0),3);
 for(const mesh of facades)for(let i=0;i<mesh.count;i++)assert.equal(mesh.geometry.getAttribute('instanceFacadeWindows').getX(i),1);
 const before=meshes.map(o=>({count:o.count,visible:o.visible,matrix:[...o.instanceMatrix.array],colors:[...(o.instanceColor?.array??[])],version:o.instanceMatrix.version}));
 const facade=facades[0] as THREE.InstancedMesh<THREE.BoxGeometry,THREE.MeshStandardMaterial>;
 const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};
 facade.material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms,{} as THREE.WebGLRenderer);
 assert.match(shader.vertexShader,/original facade gradient/);
 assert.match(shader.fragmentShader,/totalEmissiveRadiance\+=lit\*windowMask\*uCityWindowBrightness/);
 assert.doesNotMatch(shader.fragmentShader,/distance\(.*cameraPosition|vViewPosition.*windowMask/,'window grid does not depend on camera distance');
 const brightness=(shader.uniforms as Record<string,{value:number}>).uCityWindowBrightness;
 batch.setNight(1);assert.equal(brightness.value,1);batch.setNight(0);assert.equal(brightness.value,.72);
 for(const [x,z] of [[0,-620],[2500,0],[0,0],[0,100]]){
  c.position.set(x,10,z);c.lookAt(x,10,z-100);batch.setView(c);batch.sync();batch.enableStaticFacades();
  assert.equal(batch.viewStats.activeInstances,3);
  assert.deepEqual(meshes.map(o=>({count:o.count,visible:o.visible,matrix:[...o.instanceMatrix.array],colors:[...(o.instanceColor?.array??[])],version:o.instanceMatrix.version})),before);
  assert.ok([near,far,behind].every(b=>b.group.visible&&b.roof.visible&&batch.isBuildingVisible(b.group.userData.buildingId)));
 }
 near.group.visible=false;batch.sync();assert.equal(batch.viewStats.activeInstances,2);assert.equal(near.roof.visible,false);assert.equal(batch.isBuildingVisible('NEAR'),false);
 near.group.visible=true;near.body.material=near.body.material.clone();near.body.material.color.setHex(0x443322);near.group.scale.y=.5;batch.sync();
 assert.equal(batch.viewStats.activeInstances,3);assert.equal(near.roof.visible,true);
 const activeBody=facades.find(o=>o.count&&Math.abs(o.instanceMatrix.array[14]+60)<1e-6)!;
 const color=new THREE.Color(),matrix=new THREE.Matrix4();activeBody.getColorAt(0,color);activeBody.getMatrixAt(0,matrix);
 assert.ok(color.toArray().every((value,index)=>Math.abs(value-near.body.material.color.toArray()[index])<1e-6),'damage/restoration colors remain authoritative');
 assert.equal(matrix.elements[5],15,'rebuilding building height still synchronizes');
});

test('New York ironwork stays fully preloaded during travel and hides only actual construction',()=>{
 const root=new THREE.Group(),buildings=[-60,-320,180].map((z,i)=>({id:`NY-${i}`,x:0,z,w:12,d:14,h:35,kind:'apartment'}));
 const architecture=new NewYorkArchitecture(root,buildings),source=architecture.stats.sourceInstances,c=camera();
 assert.equal(architecture.stats.activeInstances,source);assert.equal(architecture.stats.activeBuildings,3);
 const meshes=root.children as THREE.InstancedMesh[],versions=meshes.map(o=>o.instanceMatrix.version);
 for(const [x,z] of [[0,-620],[2500,0],[0,0],[0,100]]){
  c.position.set(x,10,z);c.lookAt(x,10,z-100);architecture.setView(c);architecture.sync([]);
  assert.equal(architecture.stats.activeInstances,source);assert.deepEqual(meshes.map(o=>o.instanceMatrix.version),versions);
 }
 architecture.sync([{id:'NY-0',stage:'construction'}]);assert.ok(architecture.stats.activeInstances<source);
 architecture.sync([{id:'NY-0',stage:'operational'}]);assert.equal(architecture.stats.activeInstances,source);
});
