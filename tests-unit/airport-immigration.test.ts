import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {createAirportImmigrationScene} from '../src/airport-immigration-scene.ts';
import {airportImmigrationLayout} from '../worker/airport-immigration.mjs';

test('all fourteen shared immigration gates sit inside their terminals and use bounded static batches without real lights',()=>{
 const root=createAirportImmigrationScene();assert.equal(root.userData.gateCount,14);let lights=0,draws=0;
 root.traverse(o=>{if(o instanceof THREE.Light)lights++;if(o instanceof THREE.Mesh)draws++;});
 assert.equal(lights,0);assert.ok(draws<=3);
 for(const id of ['city','north','island']){
  const layout=airportImmigrationLayout(id)!;
  for(const gate of layout.gates){const g=root.getObjectByName(gate.id)!;assert.ok(g);assert.equal(g.position.x,gate.x);assert.equal(g.position.z,gate.z);assert.ok(Math.abs(gate.x-layout.terminal.x)+gate.width/2<layout.terminal.w/2);assert.ok(Math.abs(gate.z-layout.terminal.z)+gate.depth/2<layout.terminal.d/2);}
 }
});
