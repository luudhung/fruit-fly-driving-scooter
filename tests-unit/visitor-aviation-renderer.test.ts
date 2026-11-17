import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VisitorAviationRenderer} from '../src/visitor-aviation-renderer.ts';
import {type VisitorAircraft} from '../worker/visitor-aviation.mjs';
import {AIRPORT} from '../worker/city-map.mjs';

function flight(index:number,inboundAt=0):VisitorAircraft {
 const stand=AIRPORT.stands[index%8];
 return {id:`RENDER-FLIGHT-${index}-${inboundAt}`,airportId:'city',standId:stand.id,arrivalStand:stand,
  sector:'west',direction:1,inboundAt,parkedAt:inboundAt+1020,outboundAt:inboundAt+6000,exitAt:inboundAt+7080,
  arrivingGuests:10};
}
function setup(){
 const root=new THREE.Group(),renderer=new VisitorAviationRenderer(root);
 const aircraft=root.children.filter(child=>child.name==='International passenger aircraft') as THREE.Mesh[];
 return {root,renderer,aircraft};
}

test('all eight marked airport stands can show their parked aircraft using a bounded shared mesh pool',()=>{
 const {root,renderer,aircraft}=setup();
 assert.equal(AIRPORT.stands.length,8);
 assert.ok(aircraft.length>=8&&aircraft.length<=24,'bounded aircraft pool includes approaches and holding');
 assert.equal(new Set(aircraft.map(mesh=>mesh.geometry)).size,1);
 assert.equal(new Set(aircraft.map(mesh=>mesh.material)).size,1);
 let lights=0;root.traverse(object=>{if(object instanceof THREE.Light)lights++;});assert.equal(lights,0);
 renderer.sync(Array.from({length:8},(_,index)=>flight(index)));
 renderer.update(2000);
 const visible=aircraft.filter(mesh=>mesh.visible);
 assert.equal(visible.length,8);
 for(const stand of AIRPORT.stands)assert.ok(visible.some(mesh=>mesh.position.x===stand.x&&mesh.position.z===stand.z));
 assert.equal(root.children.filter(child=>child.name==='International boarding stairs'&&child.visible).length,8);
 const count=root.children.length;
 for(let i=0;i<60;i++)renderer.update(2000+i);
 assert.equal(root.children.length,count,'frame updates never allocate new scene objects');
});

test('future and finished manifests cannot hide a later active flight in the rendering pool',()=>{
 const {renderer,aircraft}=setup();
 const finished=Array.from({length:30},(_,index)=>flight(index,-20000));
 const future=Array.from({length:30},(_,index)=>flight(index,10000+index*2000));
 const current=flight(7);
 renderer.sync([...finished,...future,current]);
 renderer.update(2000);
 const visible=aircraft.filter(mesh=>mesh.visible);
 assert.equal(visible.length,1);
 assert.equal(visible[0].position.x,current.arrivalStand!.x);
 assert.equal(visible[0].position.z,current.arrivalStand!.z);
 renderer.sync([]);renderer.update(2001);
 assert.equal(aircraft.filter(mesh=>mesh.visible).length,0);
});
