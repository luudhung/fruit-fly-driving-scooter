import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {AIRPORT,ISLAND,ROADS,RIVER,SEA} from '../worker/city-map.mjs';
import {createAirportGroundLayout,AIRPORT_ROAD_EXCLUSIONS,AIRPORT_SPARE_APRON,AIRPORT_SPARE_PLANE,AIRPORT_TAXI_AXIS,AIRPORT_TAXI_SPUR,AIRPORT_HELIPAD,AIRPORT_HELI_WALK} from '../src/airport-ground-layout.ts';
import {intersection,subtractRects,unionRects,type Rect} from '../src/surface-rectangles.ts';
import {buildAirportAndIsland} from '../src/city-landmarks.ts';
const area=(rs:readonly Rect[])=>rs.reduce((n,r)=>n+r.w*r.d,0);
const contains=(r:Rect,x:number,z:number)=>Math.abs(r.x-x)<=r.w/2&&Math.abs(r.z-z)<=r.d/2;

test('airport ground has explicit concrete/asphalt/paint tiers and disjoint equal-height material unions',()=>{
 const floors=createAirportGroundLayout();assert.ok(Object.isFrozen(floors));assert.ok(floors.length<200);
 for(const [i,a]of floors.entries()){
  assert.ok(Object.isFrozen(a));assert.ok(a.w>0&&a.d>0);assert.ok([.20,.25,.30,1.05,1.10,1.15].some(y=>Math.abs(a.topY-y)<1e-9));
  for(const b of floors.slice(i+1))if(Math.abs(a.topY-b.topY)<1e-9)assert.equal(intersection(a,b),null,`${a.material}/${b.material} at ${a.topY}`);
 }
 const covering=(x:number,z:number,material:string)=>floors.filter(r=>r.material===material&&contains(r,x,z)).map(r=>r.topY);
 assert.ok(covering(-180,-460,'asphalt').includes(.25));assert.ok(covering(-180,-460,'concrete').includes(.20));
 assert.ok(covering(AIRPORT.runway.x,AIRPORT.runway.z,'asphalt').includes(.25));assert.ok(covering(ISLAND.runway.x,ISLAND.runway.z,'asphalt').includes(1.10));
 assert.ok(floors.filter(r=>r.material==='white'||r.material==='yellow').every(r=>r.topY>=.30));
});

test('helicopter walkway stops at public carriageways and the raised helipad instead of repainting their surface',()=>{
 const floors=createAirportGroundLayout(),wanted=subtractRects([AIRPORT_HELI_WALK],[...ROADS,AIRPORT_HELIPAD]),pieces=floors.filter(r=>r.material==='concrete'&&r.topY===.20).flatMap(r=>{const p=intersection(r,AIRPORT_HELI_WALK);return p?[p]:[];});
 assert.ok(wanted.length>=2);assert.ok(Math.abs(area(unionRects(pieces))-area(wanted))<1e-8);
 for(const piece of pieces)for(const cut of [...ROADS,AIRPORT_HELIPAD])assert.equal(intersection(piece,cut),null);
 assert.ok(pieces.some(r=>r.z< -405));assert.ok(pieces.some(r=>r.z> -395));
});

test('the spare aircraft moves behind its hangar with a connected taxi spur and no apron over the public road',()=>{
 assert.deepEqual(AIRPORT_SPARE_APRON,{x:-295,z:-482,w:75,d:20});assert.deepEqual(AIRPORT_SPARE_PLANE,{x:-295,y:3,z:-482});
 assert.ok(intersection(AIRPORT_SPARE_APRON,AIRPORT_TAXI_SPUR));assert.ok(intersection(AIRPORT_TAXI_AXIS,AIRPORT_TAXI_SPUR));
 for(const road of ROADS)assert.equal(intersection(AIRPORT_SPARE_APRON,road),null);
 for(const footprint of [AIRPORT.apron,{...AIRPORT.runway,w:AIRPORT.runway.w+12,d:AIRPORT.runway.d+10},AIRPORT_TAXI_AXIS,AIRPORT_HELIPAD,AIRPORT.terminal,AIRPORT_SPARE_APRON])assert.equal(area(subtractRects([footprint],AIRPORT_ROAD_EXCLUSIONS)),0);
 assert.ok(Object.isFrozen(AIRPORT_ROAD_EXCLUSIONS));assert.ok(AIRPORT_ROAD_EXCLUSIONS.every(Object.isFrozen));
});

test('sea preserves its complete footprint outside the river and airport ground batches into a few ordinary opaque meshes',()=>{
 const pieces=subtractRects([SEA],[RIVER]),overlap=intersection(SEA,RIVER);assert.equal(pieces.length,3);assert.equal(area(pieces)+(overlap?area([overlap]):0),SEA.w*SEA.d);for(const p of pieces)assert.equal(intersection(p,RIVER),null);
 const root=new THREE.Group();buildAirportAndIsland(root,()=>new THREE.Sprite());const water:THREE.Mesh[]=[];
 root.traverse(object=>{if(object instanceof THREE.Mesh&&!Array.isArray(object.material)&&object.material instanceof THREE.MeshStandardMaterial&&object.material.color.getHex()===0x176c91)water.push(object);});
 assert.equal(water.length,1);const position=water[0].geometry.getAttribute('position');for(let i=0;i<position.count;i++)assert.ok(Math.abs(position.getY(i)-.03)<1e-7);
 const bounds=new THREE.Box3().setFromObject(water[0]);assert.ok(Math.abs(bounds.min.x-(SEA.x-SEA.w/2))<1e-5);assert.ok(Math.abs(bounds.max.z-(SEA.z+SEA.d/2))<1e-5);assert.equal((water[0].material as THREE.Material).polygonOffset,false);
});
