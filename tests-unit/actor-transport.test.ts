import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {isCarTrip,showResidentBody} from '../src/actor-transport.ts';
import {PersonalCars} from '../src/personal-cars.ts';

test('foreign car trips render a car without invented ownership; walking restores the body and leaves no parked hire car',()=>{
 const scene=new THREE.Scene(),cars=new PersonalCars(scene);
 const guest={id:'NORTH-GP-GUEST-1',alive:true,x:0,y:1.1,z:-40,vx:0,vz:-11,traveling:true,transitMode:'car',motion:{at:0,speed:11,mode:'car',points:[{x:0,y:1.1,z:-60}]}};
 assert.equal(isCarTrip(guest),true);assert.equal(showResidentBody(guest),false);
 cars.sync([guest]);cars.update(1/60);
 assert.equal(cars.stats.bodies,1);assert.equal(cars.stats.cabins,1);assert.equal(cars.stats.wheels,4);
 const meshes=scene.children.filter((m):m is THREE.InstancedMesh=>m instanceof THREE.InstancedMesh);
 const matrix=new THREE.Matrix4();meshes[0].getMatrixAt(0,matrix);
 assert.ok(Math.abs(matrix.elements[14]-guest.z)<1,'the actual submitted car mesh covers the guest position');
 const walking={...guest,transitMode:'walk',motion:{...guest.motion,at:120,mode:'walk'}};
 assert.equal(showResidentBody(walking),true);cars.sync([walking]);cars.update(1/60);
 assert.equal(cars.stats.bodies,0);assert.equal(cars.stats.cached,0);
 cars.sync([{...guest,traveling:false,motion:null}]);cars.update(1/60);assert.equal(cars.stats.bodies,0);
 assert.equal('vehicle' in guest,false,'a hired ride does not create permanent vehicle ownership');
});

test('old car-motion snapshots recover while explicit walking and passengers never create duplicate vehicles',()=>{
 const cars=new PersonalCars(new THREE.Scene());
 const guest={id:'legacy-guest',alive:true,x:0,y:1.1,z:-40,vx:0,vz:0,traveling:true,motion:{at:0,speed:11,mode:'car',points:[]}};
 assert.equal(showResidentBody(guest),false);cars.sync([guest]);cars.update(.02);assert.equal(cars.stats.bodies,1);
 for(const flag of ['onPlane','onTrain','heliPassenger','onPrivateHelicopter','onFireEngine','onAmbulance','taxiPassenger','indoors'] as const){
  const passenger={...guest,[flag]:true};assert.equal(isCarTrip(passenger),false,flag);assert.equal(showResidentBody(passenger),false,flag);
  cars.sync([passenger]);cars.update(.02);assert.equal(cars.stats.bodies,0,flag);
 }
 assert.equal(isCarTrip({...guest,transitMode:'walk'}),false,'current walk state overrides an obsolete car plan');
 assert.equal(isCarTrip({...guest,alive:false}),false);
 assert.equal(showResidentBody({...guest,alive:false}),false);
});

test('predicted cars turn with their rendered route instead of sliding sideways under a stale source heading',()=>{
 const scene=new THREE.Scene(),cars=new PersonalCars(scene);
 const guest={id:'CAR-TURN-1',alive:true,vehicle:'compact car',x:0,y:1.1,z:1000,vx:11,vz:0,vehicleHeading:Math.PI/2,traveling:true,transitMode:'car',trafficSignalPermit:true,motion:{at:0,speed:11,mode:'car',signalPermit:true,points:[{x:4,y:1.1,z:1000},{x:4,y:1.1,z:1040}]}};
 cars.sync([guest]);for(let i=0;i<120;i++)cars.update(1/60,i*2);
 const body=scene.children.find((m):m is THREE.InstancedMesh=>m instanceof THREE.InstancedMesh&&m.geometry instanceof THREE.BoxGeometry)!;
 const matrix=new THREE.Matrix4();body.getMatrixAt(0,matrix);const direction=new THREE.Vector3(0,0,1).transformDirection(matrix);
 assert.ok(matrix.elements[14]>1010);assert.ok(direction.z>.999&&Math.abs(direction.x)<.001,'car long axis follows the northbound segment');
 assert.ok(Math.abs(cars.trafficActors[0].vehicleHeading!)<.001,'collision rectangle uses the same turned heading');
 cars.sync([{...guest,motion:{...guest.motion,at:120}}]);cars.update(1/60,242);body.getMatrixAt(0,matrix);direction.set(0,0,1).transformDirection(matrix);assert.ok(direction.z>.999,'a late eastbound source heading does not rotate a predicted northbound car back');
});
