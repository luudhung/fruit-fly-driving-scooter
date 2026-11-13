import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TrafficSignals} from '../src/traffic-signals.ts';
import {INTERSECTIONS,signalState} from '../worker/traffic.mjs';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
function pose(mesh:THREE.InstancedMesh,index:number){const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();mesh.getMatrixAt(index,matrix);matrix.decompose(position,rotation,scale);return{position,rotation,scale};}
function hex(mesh:THREE.InstancedMesh,index:number){const color=new THREE.Color();mesh.getColorAt(index,color);return color.getHex();}

test('all city intersections retain both full heads and all crossing stripes in fixed spatial batches',()=>{
 const root=new THREE.Group(),signals=new TrafficSignals(root,INTERSECTIONS,1),n=INTERSECTIONS.length;
 assert.ok(root.children.length>4);assert.equal(root.children.length,signals.cells.length);assert.equal(signals.cells.reduce((sum,c)=>sum+c.mesh.count,0),n*18);assert.equal(signals.poles.count,n*2);assert.equal(signals.heads.count,n*2);assert.equal(signals.bulbs.count,n*6);assert.equal(signals.crossings.count,n*8);
 assert.ok(root.children.every(mesh=>mesh instanceof THREE.InstancedMesh));assert.ok(root.children.every(mesh=>!(mesh instanceof THREE.Light)));
 assert.ok(root.children.every(mesh=>(mesh as THREE.InstancedMesh).boundingSphere!==null));signals.dispose();assert.equal(root.children.length,0);
});

test('batched positions, dimensions and rotations preserve the original signal and crossing layout',()=>{
 const root=new THREE.Group(),s=new TrafficSignals(root,[{x:10,z:20}]);
 const ns=pose(s.heads,0),ew=pose(s.heads,1);close(ns.position.x,16.4);close(ns.position.y,3.1);close(ns.position.z,26.2);close(ew.position.x,3.6);close(ew.position.z,13.8);
 const direction=new THREE.Vector3(0,0,1).applyQuaternion(ew.rotation);close(direction.x,1);close(direction.z,0);
 const bulb=pose(s.bulbs,0),sideBulb=pose(s.bulbs,5);close(bulb.position.z,26.39);close(bulb.position.y,3.48);close(sideBulb.position.x,3.79);close(sideBulb.position.y,2.7);
 const stripe=pose(s.crossings,0),second=pose(s.crossings,4);close(stripe.position.x,7.6);close(stripe.position.z,13.9);close(stripe.position.y,.165);close(stripe.scale.x,.8);close(stripe.scale.y,.008);close(stripe.scale.z,3.2);
 close(second.position.x,3.8);close(second.position.z,17.6);close(second.position.y,.166);close(second.scale.x,3.2);close(second.scale.z,.8);
 assert.deepEqual((s.heads.geometry as THREE.BoxGeometry).parameters,{width:.56,height:1.28,depth:.34,widthSegments:1,heightSegments:1,depthSegments:1});s.dispose();
});

test('all three bulb colors follow the shared authoritative cycle without rewriting unchanged phases',()=>{
 const s=new TrafficSignals(new THREE.Group(),[{x:0,z:0}]);
 const colors={red:[0x3a0808,0xff2b2b],yellow:[0x302707,0xffc928],green:[0x07351c,0x35ef87]} as const;
 for(const seconds of [0,24.9,25,29.9,30,54.9,55,59.9,60,-1]){
  s.update(seconds);
  for(const{mesh,indices}of s.cells.filter(c=>c.mesh.geometry===s.bulbs.geometry))indices.forEach((index,i)=>assert.equal(hex(mesh,i),hex(s.bulbs,index),'rendered cell follows authoritative signal color'));
  for(const [head,axis]of (['ns','ew'] as const).entries())for(const [index,name]of (['red','yellow','green'] as const).entries())assert.equal(hex(s.bulbs,head*3+index),colors[name][signalState(seconds,axis)===name?1:0]);
 }
 s.update(1);const version=s.bulbs.instanceColor!.version;s.update(2);assert.equal(s.bulbs.instanceColor!.version,version);s.update(25);assert.ok(s.bulbs.instanceColor!.version>version);s.dispose();s.dispose();
});

test('quality stride selects the same junction indices without altering their geometry',()=>{
 const s=new TrafficSignals(new THREE.Group(),[{x:0,z:0},{x:10,z:10},{x:20,z:20},{x:30,z:30},{x:40,z:40}],2);
 assert.equal(s.heads.count,6);close(pose(s.poles,2).position.x,26.4);close(pose(s.poles,4).position.x,46.4);s.dispose();
 const empty=new TrafficSignals(new THREE.Group(),[]);assert.equal(empty.bulbs.count,0);empty.update(30);empty.dispose();
});
