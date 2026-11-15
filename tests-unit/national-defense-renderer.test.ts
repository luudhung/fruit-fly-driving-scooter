import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {NationalDefenseRenderer} from '../src/national-defense-renderer.ts';
import {nationalProjectilePose,type NationalProjectile} from '../worker/national-defense.mjs';
const projectile:NationalProjectile={id:'MISSILE-REAL',countryId:'north-city',from:{x:270,y:.7,z:-995},to:{x:710,y:1.1,z:-560},launchedAt:0,impactAt:10,plannedHit:true,crewIds:['NORTH-ACTUAL-SOLDIER']};
test('defense visuals use actual projectile poses and purchased aircraft records, expire events and create no dynamic lights',()=>{
 const root=new THREE.Group(),renderer=new NationalDefenseRenderer(root);renderer.sync({projectiles:[projectile],events:[]} as any,{aircraft:[{id:'NORTH-TRAINER-1',owned:true,flight:null},{id:'UNPURCHASED',owned:false,flight:null}]} as any);renderer.update(5,1);assert.deepEqual(renderer.stats,{missiles:1,impacts:0,aircraft:1});
 const missiles=renderer.root.children[0] as THREE.InstancedMesh,m=new THREE.Matrix4();missiles.getMatrixAt(0,m);const p=nationalProjectilePose(5,projectile);assert.ok(Math.abs(m.elements[12]-p.x)<.001);assert.ok(Math.abs(m.elements[13]-p.y)<.001);assert.ok(Math.abs(m.elements[14]-p.z)<.001);
 renderer.sync({projectiles:[{...projectile,resolvedAt:10}],events:[{id:'IMPACT-ACTUAL',type:'impact',at:10,x:710,y:1.1,z:-560}]} as any);renderer.update(11,1);assert.deepEqual(renderer.stats,{missiles:0,impacts:1,aircraft:0});renderer.update(13,1);assert.equal(renderer.stats.impacts,0);let lights=0;root.traverse(o=>{if(o instanceof THREE.Light)lights++;});assert.equal(lights,0);assert.equal(renderer.root.children.length,3);
});
test('defense rendering bounds dense actual events and hides all batches on an empty snapshot',()=>{
 const renderer=new NationalDefenseRenderer(new THREE.Group());renderer.sync({projectiles:Array.from({length:100},(_,i)=>({...projectile,id:`ACTUAL-${i}`})),events:Array.from({length:100},(_,i)=>({id:`IMPACT-${i}`,type:'impact',at:4,x:i,y:1,z:0}))} as any);renderer.update(5,1);assert.equal(renderer.stats.missiles,32);assert.equal(renderer.stats.impacts,32);renderer.sync();renderer.update(6);assert.deepEqual(renderer.stats,{missiles:0,impacts:0,aircraft:0});assert.ok(renderer.root.children.every(o=>!o.visible));
});
