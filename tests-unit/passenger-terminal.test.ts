import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPassengerTerminal} from '../src/passenger-terminal.ts';
import {AIRPORT} from '../worker/city-map.mjs';
import {NORTH_AIRPORT} from '../worker/country-map.mjs';
import {visitorArrivalPath,visitorStands} from '../worker/visitor-aviation.mjs';

test('both airport terminals have a physically open door on the actual apron-to-immigration route',()=>{
 for(const [id,port]of [['city',AIRPORT],['north',NORTH_AIRPORT]] as const){
  const group=createPassengerTerminal(port,()=>new THREE.Sprite(),{name:id,modern:id==='city'});group.updateMatrixWorld(true);
  const meshes:THREE.Object3D[]=[];let lights=0;group.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);if(o instanceof THREE.Light)lights++;});
  assert.equal(lights,0);assert.ok(meshes.length<=6,'fixed architecture stays merged by material');
  for(const stand of visitorStands(id)){
   const path=visitorArrivalPath({id:'test',airportId:id,standId:stand.id,arrivalStand:stand,sector:'west',direction:1,inboundAt:0,parkedAt:1020,outboundAt:null,exitAt:null});
   const immigration=path.findIndex(p=>p.phase==='immigration'),a=path[immigration-1],b=path[immigration];
   const from=new THREE.Vector3(a.x,1.6,a.z),to=new THREE.Vector3(b.x,1.6,b.z),length=from.distanceTo(to);
   const ray=new THREE.Raycaster(from,to.sub(from).normalize(),0,length-.01);
   assert.equal(ray.intersectObjects(meshes,false).length,0,`${id}:${stand.id} entrance must not pass through a wall or counter`);
  }
 }
});
