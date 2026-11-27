import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {HANSDREX_AIRPORT as AIRPORT} from '../worker/hansdrex-airport-map.mjs';
import {airportDeparturePath} from '../worker/airport-campus.mjs';
import {airportTerminalPassengerLayout} from '../worker/airport-terminal-layout.mjs';
import {createPassengerTerminal} from '../src/passenger-terminal.ts';
import {createAirportImmigrationScene} from '../src/airport-immigration-scene.ts';
import {buildAirportDepartureRoad} from '../src/airport-departure-road.ts';

test('all sixteen boarding paths pass through real upper passport doors and exterior stairs without hitting furniture, walls or the taxi deck',()=>{
 const root=new THREE.Group(),terminals=[];
 root.add(createAirportImmigrationScene());buildAirportDepartureRoad(root,()=>new THREE.Sprite());
 for(const terminal of AIRPORT.terminals){const mesh=createPassengerTerminal({terminal,gate:terminal.gate},()=>new THREE.Sprite(),{name:terminal.id,modern:true});root.add(mesh);terminals.push(mesh);}
 root.updateMatrixWorld(true);const meshes:THREE.Mesh[]=[];let lights=0;
 root.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);if(o instanceof THREE.Light)lights++;});
 assert.equal(lights,0);
 for(const terminal of terminals){assert.equal(terminal.userData.departurePassportFloor,2);assert.equal(terminal.userData.arrivalImmigrationFloor,1);assert.equal(terminal.userData.stairs,4);assert.ok(terminal.children.filter(o=>o instanceof THREE.Mesh).length<=5);}
 for(const stand of AIRPORT.stands){const terminal=AIRPORT.terminals.find(t=>t.id===stand.terminalId)!;
  for(const upperStart of [false,true]){
   const path=airportDeparturePath(stand,terminal.id,{upperStart});
   for(let i=1;i<path.length;i++)for(const height of [-.2,0,.3]){
    const a=path[i-1],b=path[i],origin=new THREE.Vector3(a.x,a.y+height,a.z),delta=new THREE.Vector3(b.x,b.y+height,b.z).sub(origin),distance=delta.length();if(distance<.03)continue;
    const hits=new THREE.Raycaster(origin,delta.normalize(),.015,distance-.015).intersectObjects(meshes,false);
    assert.equal(hits.length,0,`${terminal.id} / ${stand.id} ${a.stage} → ${b.stage} at ${height}: ${hits[0]?.point.toArray()}`);
   }
  }
  const layout=airportTerminalPassengerLayout(terminal),path=airportDeparturePath(stand,terminal.id);
  const stamp=path.findIndex(p=>p.stage==='departure-emigration'),stairs=path.findIndex(p=>p.stage==='departure-airside-stairs');
  assert.ok(stamp>=0&&stairs>stamp);assert.equal(path[stamp].y,layout.upperY);
  assert.ok(layout.airside.landing.z<terminal.z-terminal.d/2);
  assert.ok(path.slice(stairs).every(p=>p.z<terminal.z-terminal.d/2),'secure passengers stay outside the arrivals hall all the way to their own aircraft');
 }
});
