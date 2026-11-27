import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CityVisitorsRenderer} from '../src/city-visitors-renderer.ts';
import {PersonalCars} from '../src/personal-cars.ts';
const yAt=(mesh:THREE.InstancedMesh)=>{const m=new THREE.Matrix4();mesh.getMatrixAt(0,m);return m.elements[13];};

test('taxi roof markers follow elevated driver actors and retain snapshot height when bodies are outside the resident view',()=>{
 const root=new THREE.Group(),renderer=new CityVisitorsRenderer(root),job={id:'UPPER-TAXI',driverId:'DRIVER',phase:'riding',x:-158,y:6.27,z:-377.5};
 renderer.sync({taxiJobs:[job]},[{id:'DRIVER',x:job.x,y:job.y,z:job.z}]);renderer.update(.016,1000);
 const roofs=root.children[0] as THREE.InstancedMesh;assert.equal(roofs.count,1);assert.ok(Math.abs(yAt(roofs)-7.03)<1e-6);
 renderer.sync({taxiJobs:[job]});renderer.update(.016,1000);assert.ok(Math.abs(yAt(roofs)-7.03)<1e-6);
 renderer.updateActor('DRIVER',{x:job.x,y:3,z:job.z});renderer.update(.016,1000);assert.ok(Math.abs(yAt(roofs)-3.76)<1e-6);
});

test('a parked vehicle keeps its saved deck height instead of appearing on the street below',()=>{
 const scene=new THREE.Scene(),renderer=new PersonalCars(scene),driver={id:'PARKED-UPPER',alive:true,vehicle:'compact car',x:0,y:1.1,z:0,vx:0,vz:0,traveling:false,parkedCar:{x:0,y:6.27,z:0,heading:0}};
 renderer.sync([driver]);renderer.update(.016,1000);const body=(renderer as unknown as {body:THREE.InstancedMesh}).body;
 assert.equal(body.count,1);assert.ok(Math.abs(yAt(body)-(6.27-.31))<1e-6);
});
