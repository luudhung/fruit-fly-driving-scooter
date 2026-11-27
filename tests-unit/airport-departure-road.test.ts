import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {AIRPORT_DEPARTURE_ROAD as ROAD,AIRPORT_DEPARTURE_DROPOFFS as BAYS,airportDepartureDrive,airportDepartureRoadLevels} from '../worker/airport-departure-roads.mjs';
import {HANSDREX_AIRPORT} from '../worker/hansdrex-airport-map.mjs';
import {AIRPORT_TERMINAL_RAIL,AIRPORT_TERMINAL_STATIONS} from '../worker/airport-campus.mjs';
import {clearSegment} from '../worker/city-map.mjs';
import {buildAirportDepartureRoad} from '../src/airport-departure-road.ts';
import {createPassengerTerminal} from '../src/passenger-terminal.ts';
import {cityCarGround,playerCarGround,playerCarClear,carExitPosition} from '../src/player-car.ts';
import {PlayerController,PLAYER_EYE} from '../src/player-controller.ts';
import {createVehicleIndex} from '../worker/traffic.mjs';

test('all four departure curbs have continuous driveable ramps outside runways, aprons and the terminal rail',()=>{
 for(let i=1;i<ROAD.points.length;i++){
  const a=ROAD.points[i-1],b=ROAD.points[i],length=Math.hypot(b.x-a.x,b.z-a.z);
  assert.ok(Math.abs(b.y-a.y)/length<.08);
  for(let d=0;d<=length;d+=.5){const u=d/length,p={x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u};
   for(const field of [...HANSDREX_AIRPORT.runways,...HANSDREX_AIRPORT.aprons,...HANSDREX_AIRPORT.taxiways])assert.ok(Math.abs(p.x-field.x)>field.w/2+ROAD.width/2||Math.abs(p.z-field.z)>field.d/2+ROAD.width/2);
   if(p.x>=AIRPORT_TERMINAL_STATIONS[0].x-14&&p.x<=AIRPORT_TERMINAL_STATIONS.at(-1)!.x+14)for(const side of [-1,1])assert.ok(Math.abs(p.z-(AIRPORT_TERMINAL_RAIL.z+side*AIRPORT_TERMINAL_RAIL.trackOffset))>ROAD.width/2+1.5);
  }
 }
 for(const b of BAYS){
  const incoming=airportDepartureDrive(b.terminalId),outgoing=airportDepartureDrive(b.terminalId,true);
  assert.ok(Math.abs(incoming[0].y-1.1)<1e-9);assert.ok(Math.abs(incoming.at(-1)!.y-6.27)<1e-9);assert.ok(Math.abs(outgoing.at(-1)!.y-1.1)<1e-9);
  assert.ok(incoming.every((p,i)=>!i||clearSegment(incoming[i-1],p)));
  for(const route of [incoming,outgoing])for(const p of route)assert.ok(airportDepartureRoadLevels(p).some(y=>Math.abs(y-(p.y-ROAD.carOffset))<1e-6));
 }
});

test('the static two-floor road has no real lights or rails blocking taxis and provides a clear curb-to-check-in walk',()=>{
 const root=new THREE.Group(),road=buildAirportDepartureRoad(root,()=>new THREE.Sprite());
 for(const t of HANSDREX_AIRPORT.terminals)root.add(createPassengerTerminal({terminal:t,gate:t.gate},()=>new THREE.Sprite(),{name:t.id,modern:true}));
 root.updateMatrixWorld(true);const meshes:THREE.Mesh[]=[];let lights=0;
 root.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);if(o instanceof THREE.Light)lights++;});
 const clear=(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number})=>{const origin=new THREE.Vector3(a.x,a.y,a.z),delta=new THREE.Vector3(b.x,b.y,b.z).sub(origin),length=delta.length();if(length<.02)return;assert.equal(new THREE.Raycaster(origin,delta.normalize(),.01,length-.01).intersectObjects(meshes,false).length,0,JSON.stringify({a,b}));};
 for(const b of BAYS){const route=airportDepartureDrive(b.terminalId);for(let i=1;i<route.length;i++)clear(route[i-1],route[i]);for(let i=1;i<b.walk.length;i++)clear({...b.walk[i-1],y:b.walk[i-1].y-.5},{...b.walk[i],y:b.walk[i].y-.5});}
 assert.equal(lights,0);assert.ok(road.children.filter(o=>o instanceof THREE.Mesh).length<=5,'fixed surfaces are merged by material');
});

test('player wheels climb and descend connected departure ramps and stay at ground level when passing below a high deck',()=>{
 let ground=.25;const points=ROAD.points;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.z-a.z),heading=Math.atan2(b.x-a.x,b.z-a.z);
  for(let d=0;d<=length;d+=.2){const u=d/length,x=a.x+(b.x-a.x)*u,z=a.z+(b.z-a.z)*u,expected=a.y+(b.y-a.y)*u-ROAD.carOffset;
   ground=playerCarGround(x,z,ground);assert.ok(Math.abs(ground-expected)<.081,`height at ${x},${z}: ${ground} expected ${expected}`);assert.ok(playerCarClear(x,z,heading,ground),`blocked at ${x},${z},${ground}`);
  }
 }
 assert.ok(Math.abs(ground-.25)<.081);assert.ok(Math.abs(cityCarGround(-180,-375.5,.2)!-.2)<.01);
});

test('a parked car on the departure deck obstructs cars at its own height and never traffic below',()=>{
 const parked={id:'UPPER-PARKED',alive:true,vehicle:'compact car',x:0,z:0,parkedCar:{x:8,y:6.27,z:1000,heading:Math.PI/2}};
 const lower={id:'LOWER',alive:true,x:0,y:1.1,z:1000,targetX:30,targetZ:1000,vehicleHeading:Math.PI/2};
 const index=createVehicleIndex([parked]);assert.equal(index(lower,{x:30,z:1000}),30);assert.ok(index({...lower,id:'UPPER',y:6.27},{x:30,z:1000})<8);
});

test('leaving a car at a departure curb keeps the observer on the elevated sidewalk',()=>{
 const bay=BAYS[0],exit=carExitPosition(bay.x,bay.z,ROAD.deckTop)!;assert.ok(exit);assert.ok(Math.abs(exit.y-ROAD.deckTop-PLAYER_EYE)<.01);
 const player=new PlayerController();player.teleport(exit.x,exit.y,exit.z);
 for(let i=0;i<30;i++)player.update(1/60,{forward:0,strafe:0,yaw:0,sprint:1,ascend:false,descend:false});
 assert.ok(Math.abs(player.feet-ROAD.deckTop)<.01);
});
