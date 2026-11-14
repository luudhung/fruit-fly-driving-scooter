import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GovernmentDistrictRenderer} from '../src/government-district.ts';
import {GOVERNMENT_BUILDINGS,GOVERNMENT_ROADS,MILITARY_NAVAL_BASE} from '../worker/government-map.mjs';
import {RIVER,BRIDGES,contains} from '../worker/city-map.mjs';
import {militaryShipPose} from '../worker/military-life.mjs';
import type {PublicServicesSnapshot} from '../worker/public-services.mjs';
const snapshot=(members:any[]=[],military:any={})=>({army:{members},aircraft:[],military} as unknown as PublicServicesSnapshot);
const accessory=(renderer:GovernmentDistrictRenderer,name:string)=>renderer.root.getObjectByName(name) as THREE.InstancedMesh;

test('the two naval berths fit the existing river and have a connected shore access without moving old government premises',()=>{
 assert.equal(MILITARY_NAVAL_BASE.berths.length,2);
 for(const berth of MILITARY_NAVAL_BASE.berths){
  assert.equal(contains(RIVER,{x:berth.x-6,z:berth.z-24}),true);assert.equal(contains(RIVER,{x:berth.x+6,z:berth.z+24}),true);
  assert.equal(BRIDGES.some(b=>contains(b,berth,30)),false,'ships do not overlap a bridge');
 }
 assert.equal(contains(RIVER,MILITARY_NAVAL_BASE.dock),false,'dock access is on the European bank');
 const access=GOVERNMENT_ROADS.find(r=>r.id==='NAVAL-ACCESS')!,shore=GOVERNMENT_ROADS.find(r=>r.id==='NAVAL-SHORE')!,avenue=GOVERNMENT_ROADS.find(r=>r.id==='GOVERNMENT-AVENUE')!;
 assert.ok(Math.abs(access.x-avenue.x)<(access.w+avenue.w)/2&&Math.abs(access.z-avenue.z)<(access.d+avenue.d)/2);
 assert.ok(Math.abs(access.x-shore.x)<(access.w+shore.w)/2&&Math.abs(access.z-shore.z)<(access.d+shore.d)/2);
 assert.equal(contains(shore,MILITARY_NAVAL_BASE.dock),true);
 const original=GOVERNMENT_BUILDINGS.filter(b=>b.id!=='naval-command').map(b=>[b.id,b.x,b.z,b.w,b.d,b.h]);
 assert.deepEqual(original,[['white-house',-390,-310,42,22,18],['police-hq',710,-300,42,32,25],['military-base',710,-560,98,34,17],['military-hangar-west',625,-665,42,30,13],['military-hangar-east',795,-665,42,30,13]]);
});
test('naval visuals follow the two actual owned ships, and empty snapshots do not invent soldiers or aircraft',()=>{
 const renderer=new GovernmentDistrictRenderer(new THREE.Group());renderer.sync(undefined);renderer.update(0);
 assert.deepEqual(renderer.stats,{ships:0,armedMembers:0,shots:0});
 renderer.sync(snapshot([],{ships:[{id:'ARMY-PATROL-1',owned:true},{id:'ARMY-PATROL-2',owned:false},{id:'UNKNOWN',owned:true}]}));renderer.update(0);
 assert.equal(renderer.stats.ships,1);assert.equal(renderer.root.getObjectByName('ARMY-PATROL-1')!.visible,true);assert.equal(renderer.root.getObjectByName('ARMY-PATROL-2')!.visible,false);
 for(const berth of MILITARY_NAVAL_BASE.berths){const ship=renderer.root.getObjectByName(berth.id)!;assert.equal(ship.position.x,berth.x);assert.equal(ship.position.z,berth.z);assert.equal(ship.userData.dynamicCity,true);}
 assert.equal(renderer.buildings.has('naval-command'),true);
});
test('an owned ship follows the same exercise trajectory used for its actual server crew and returns to its berth',()=>{
 const renderer=new GovernmentDistrictRenderer(new THREE.Group()),record={id:'ARMY-PATROL-1',owned:true,crewIds:[],exercise:{departure:100,arrival:3700}};
 renderer.sync(snapshot([],{ships:[record]}));const ship=renderer.root.getObjectByName(record.id)!;
 for(const now of [99,100,500,1800,3699,3700]){renderer.update(now);const expected=militaryShipPose(now,record);assert.deepEqual({x:ship.position.x,y:ship.position.y,z:ship.position.z,heading:ship.rotation.y},{x:expected.x,y:expected.y,z:expected.z,heading:expected.heading});assert.equal(ship.visible,true);}
 const berth=MILITARY_NAVAL_BASE.berths[0];assert.equal(ship.position.x,berth.x);assert.equal(ship.position.z,berth.z);
});
test('army equipment follows actual outside armed members rather than cloning a target population',()=>{
 const renderer=new GovernmentDistrictRenderer(new THREE.Group()),members=[{id:'ARMY-1',x:790,y:1.1,z:-590,armed:true},{id:'ARMY-2',x:791,z:-592,armed:true,indoors:true},{id:'ARMY-3',x:792,z:-594,armed:false},{id:'ARMY-4',x:793,z:-596,armed:true,onPlane:true},{id:'ARMY-5',armed:true}];
 renderer.sync(snapshot(members));renderer.update(0);assert.equal(renderer.stats.armedMembers,1);
 const helmets=accessory(renderer,'Army member helmets'),rifles=accessory(renderer,'Army member rifles'),m=new THREE.Matrix4();assert.equal(helmets.count,1);assert.equal(rifles.count,1);helmets.getMatrixAt(0,m);assert.ok(Math.abs(m.elements[12]-790)<.001);assert.ok(Math.abs(m.elements[14]+590)<.001);
 members[0].x=795;renderer.update(1);helmets.getMatrixAt(0,m);assert.ok(Math.abs(m.elements[12]-795)<.001,'equipment follows the actual moving member');
 renderer.sync(snapshot(Array.from({length:100},(_,i)=>({id:`ARMY-${i}`,x:790,y:1.1,z:-590,armed:true}))));renderer.update(2);assert.equal(renderer.stats.armedMembers,50,'accessory batches remain capped');
 renderer.sync(snapshot());renderer.update(3);assert.equal(helmets.count,0);assert.equal(rifles.visible,false);
});
test('military equipment uses the same displayed member pose as the resident body and hides with that body',()=>{
 const renderer=new GovernmentDistrictRenderer(new THREE.Group()),pose={x:795,y:2,z:-590};
 renderer.sync(snapshot([{id:'ARMY-1',x:790,y:1.1,z:-590,armed:true},{id:'ARMY-2',x:792,y:1.1,z:-592,armed:true}]));
 renderer.setMemberPositionSource(id=>id==='ARMY-1'?pose:null);renderer.update(0);assert.equal(renderer.stats.armedMembers,1);
 const helmets=accessory(renderer,'Army member helmets'),m=new THREE.Matrix4();helmets.getMatrixAt(0,m);assert.ok(Math.abs(m.elements[12]-795)<.001);assert.ok(Math.abs(m.elements[13]-2.65)<.001);
 pose.x=798;renderer.update(1);helmets.getMatrixAt(0,m);assert.ok(Math.abs(m.elements[12]-798)<.001,'equipment follows frame interpolation, not stale snapshot positions');
 renderer.setMemberPositionSource(()=>null);renderer.update(2);assert.equal(renderer.stats.armedMembers,0);
});
test('only current actual shot records produce bounded traces, which expire without creating lights',()=>{
 const parent=new THREE.Group(),renderer=new GovernmentDistrictRenderer(parent),shot={id:'SHOT-1',at:100,from:{x:790,y:1.8,z:-590},to:{x:810,y:1.8,z:-590}};
 renderer.sync(snapshot([],{shots:[shot,{...shot,id:'FUTURE',at:200},{...shot,id:'OLD',at:0}]}));renderer.update(110);assert.equal(renderer.stats.shots,1);
 const traces=accessory(renderer,'Military exercise shot traces'),m=new THREE.Matrix4();traces.getMatrixAt(0,m);assert.ok(Math.abs(m.elements[12]-800)<.001);assert.ok(Math.abs(m.elements[0]-20)<.001);
 renderer.update(176);assert.equal(renderer.stats.shots,0);assert.equal(traces.visible,false);
 renderer.sync(snapshot([],{shots:Array.from({length:50},(_,i)=>({...shot,id:`SHOT-${i}`}))}));renderer.update(110);assert.equal(renderer.stats.shots,32);
 let lights=0;parent.traverse(o=>{if(o instanceof THREE.Light)lights++;});assert.equal(lights,0);
});

test('the complete army perimeter is merged into three static material batches without lights',()=>{
 const renderer=new GovernmentDistrictRenderer(new THREE.Group()),perimeter=renderer.root.getObjectByName('Army compound perimeter')!;
 assert.ok(perimeter);assert.equal(perimeter.children.length,3);let triangles=0;
 perimeter.traverse(o=>{assert.equal(o instanceof THREE.Light,false);assert.equal(Boolean(o.userData.dynamicCity),false);if(o instanceof THREE.Mesh)triangles+=(o.geometry.index?.count||0)/3;});
 assert.ok(triangles<5000,'walls and gate posts stay a small static mesh budget');
});
