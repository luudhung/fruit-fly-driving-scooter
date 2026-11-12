import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {IndustrialDistrictRenderer} from '../src/industrial-district.ts';
import type {IndustrialSnapshot} from '../worker/industrial-economy.mjs';
const snapshot=(trucks:any[])=>({trucks} as IndustrialSnapshot);
const truck=(id:string,x=-1067.8,z=200,at=0)=>({id,x,z,y:1.1,heading:Math.PI,phase:'delivering',motionSpeed:20,routeWaypoints:[{x,z:z-200,y:1.1}],at,driverId:null,orderId:'CARGO'});
test('the full 40-truck capacity shares three draw batches and removes distant vehicles without changing any warehouse',()=>{
 const root=new THREE.Group(),view=new IndustrialDistrictRenderer(root),trucks=Array.from({length:40},(_,i)=>truck(`REGIONAL-FREIGHT-${i+1}`));view.sync(snapshot(trucks));view.update(1/60,0,120);
 const fleet=root.children.filter(c=>c instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];assert.equal(fleet.length,3);assert.ok(fleet.every(m=>m.count===40));const buildings=[...view.buildings.values()].map(g=>({g,visible:g.visible,position:g.position.clone()}));
 const camera=new THREE.PerspectiveCamera(68,1,.1,7000);camera.position.set(5000,30,5000);camera.lookAt(6000,30,6000);view.setView(camera);view.update(1/60,120,120);assert.ok(fleet.every(m=>m.count===0));for(const b of buildings){assert.equal(b.g.visible,b.visible);assert.deepEqual(b.g.position,b.position);}view.dispose();
});
test('truck interpolation obeys the live red stop line instead of visually predicting through the intersection',()=>{
 const root=new THREE.Group(),view=new IndustrialDistrictRenderer(root),t=truck('REGIONAL-FREIGHT-1',310,-14,4200);t.motionSpeed=10;t.routeWaypoints=[{x:310,z:14,y:1.1}];view.sync(snapshot([t]));
 for(let i=0;i<100;i++)view.update(1/60,4200+i*2,120);
 const fleet=root.children.find(c=>c instanceof THREE.InstancedMesh) as THREE.InstancedMesh,m=new THREE.Matrix4();fleet.getMatrixAt(0,m);const p=new THREE.Vector3().setFromMatrixPosition(m);assert.ok(p.z<=-7.39&&p.z>=-7.5,`predicted truck at ${p.z}`);view.dispose();
});
