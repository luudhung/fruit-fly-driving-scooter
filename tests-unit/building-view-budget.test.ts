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

test('facade streaming compacts unseen windows, paints distant windows on the body and returns roofs with their buildings',()=>{
 const root=new THREE.Group(),near=apartment(root,'NEAR',-60),far=apartment(root,'FAR',-650),behind=apartment(root,'BEHIND',70);
 const batch=new CityBoxBatches(root,[near.group,far.group,behind.group]),c=camera();batch.setView(c);
 assert.equal(batch.stats.instances,603);assert.equal(batch.viewStats.activeInstances,102);
 assert.equal(batch.isBuildingVisible('NEAR'),true);assert.equal(batch.isBuildingVisible('FAR'),true);assert.equal(batch.isBuildingVisible('BEHIND'),false);
 assert.equal(behind.group.visible,true,'presentation culling never rewrites authoritative building visibility');assert.equal(behind.roof.visible,false);
 const facade=root.children.find(o=>o instanceof THREE.InstancedMesh&&o.material.userData.normalizedFacade&&o.geometry.getAttribute('instanceFacadeWindows').getX(0)===1) as THREE.InstancedMesh<THREE.BoxGeometry,THREE.MeshStandardMaterial>;
 assert.ok(facade);assert.equal(facade.count,1,'far building submits its body, not 200 window boxes');
 const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};
 facade.material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms,{} as THREE.WebGLRenderer);
 assert.match(shader.vertexShader,/original facade gradient/);assert.match(shader.fragmentShader,/totalEmissiveRadiance\+=lit/);
 c.position.x=2500;c.lookAt(2500,10,-100);batch.setView(c);assert.equal(batch.viewStats.activeInstances,0);assert.ok([near,far,behind].every(b=>!b.roof.visible));
 c.position.x=0;c.lookAt(0,10,-100);batch.setView(c);assert.equal(batch.viewStats.activeInstances,102);assert.equal(near.roof.visible,true);assert.equal(far.roof.visible,true);
 near.group.visible=false;batch.sync();assert.equal(batch.viewStats.activeInstances,1);assert.equal(near.roof.visible,false);
 near.group.visible=true;near.body.material=near.body.material.clone();near.body.material.color.setHex(0x443322);batch.sync();assert.equal(batch.viewStats.activeInstances,102);assert.equal(near.roof.visible,true);
 const activeBody=root.children.find(o=>o instanceof THREE.InstancedMesh&&o.material.userData.normalizedFacade&&o.count&&o.geometry.getAttribute('instanceFacadeWindows').getX(0)===0) as THREE.InstancedMesh;
 const color=new THREE.Color();activeBody.getColorAt(0,color);assert.ok(color.toArray().every((value,index)=>Math.abs(value-near.body.material.color.toArray()[index])<1e-6),'private damage/restoration colors survive streaming');
});

test('New York ironwork streams nearby visible buildings, preserves hidden construction, and returns after travelling back',()=>{
 const root=new THREE.Group(),buildings=[-60,-320,180].map((z,i)=>({id:`NY-${i}`,x:0,z,w:12,d:14,h:35,kind:'apartment'}));
 const architecture=new NewYorkArchitecture(root,buildings),source=architecture.stats.sourceInstances,c=camera();architecture.setView(c);
 assert.ok(architecture.stats.activeInstances>0&&architecture.stats.activeInstances<source/2);
 const visible=architecture.stats.activeInstances;
 c.position.x=2500;c.lookAt(2500,10,-100);architecture.setView(c);assert.equal(architecture.stats.activeInstances,0);
 c.position.x=0;c.lookAt(0,10,-100);architecture.setView(c);assert.equal(architecture.stats.activeInstances,visible);
 architecture.sync([{id:'NY-0',stage:'construction'}]);assert.ok(architecture.stats.activeInstances<visible);
 architecture.sync([{id:'NY-0',stage:'operational'}]);assert.equal(architecture.stats.activeInstances,visible);
});
