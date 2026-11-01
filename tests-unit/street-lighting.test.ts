import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {StreetLighting} from '../src/street-lighting.ts';
import {ROADS,BUILDINGS,WATER,contains} from '../worker/city-map.mjs';

test('short Manhattan blocks receive lamps near central streets, with three batches',()=>{
 const root=new THREE.Group(),lamps=new StreetLighting(root,ROADS,BUILDINGS);
 assert.ok(lamps.count<1200,'fixture count remains bounded');
 assert.equal(root.children.length,3);
 for(const p of [{x:8,z:-35},{x:41,z:15},{x:67,z:44},{x:-37,z:15}]){
  assert.ok(lamps.lightPositions.some(l=>Math.hypot(l.x-p.x,l.z-p.z)<24),`no lamp near ${p.x},${p.z}`);
 }
 assert.ok(lamps.lightPositions.every(p=>!BUILDINGS.some(b=>contains(b,p))&&!WATER.some(w=>contains(w,p))));
 lamps.update(0);assert.equal(root.children[2].visible,false);
 lamps.update(1);assert.equal(root.children[2].visible,true);
});
