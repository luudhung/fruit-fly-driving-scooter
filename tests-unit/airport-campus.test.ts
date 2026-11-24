import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {AIRPORT,BUILDINGS,ROADS,WATER,overlaps,METRO_LINES,metroStationGeometry,pedestrianRoute,blocked,clearSegment} from '../worker/city-map.mjs';
import {airportTerminalForStand,airportTerminalAccess,airportDeparturePath,AIRPORT_TAXI_BAYS,airportTerminalTransfer,airportTerminalTrainStates} from '../worker/airport-campus.mjs';
import {airportImmigrationLayout} from '../worker/airport-immigration.mjs';
import {createPassengerTerminal} from '../src/passenger-terminal.ts';
import {AirportTerminalTrains} from '../src/airport-terminal-trains.ts';

test('four two-floor terminals register sixteen original and new aircraft bays without touching roads or water',()=>{
 assert.equal(AIRPORT.terminals.length,4);assert.equal(AIRPORT.runways.length,4);assert.equal(AIRPORT.stands.length,16);assert.equal(AIRPORT.aprons.length,4);
 assert.deepEqual(AIRPORT.stands.slice(0,8).map(s=>[s.id,s.x,s.z]),Array.from({length:8},(_,i)=>[`INTL-${i+1}`,-270+i*30,-443]));
 for(const terminal of AIRPORT.terminals){assert.equal(terminal.floors,2);assert.equal(terminal.standIds.length,4);assert.ok(BUILDINGS.some(b=>b.kind==='airport'&&b.x===terminal.x));assert.equal(airportImmigrationLayout('city',terminal.id)!.gates.length,8);}
 for(const footprint of [...AIRPORT.terminals,...AIRPORT.runways,...AIRPORT.aprons]){assert.ok(!ROADS.some(r=>overlaps(r,footprint)),JSON.stringify(footprint));assert.ok(!WATER.some(r=>overlaps(r,footprint)));}
 for(const stand of AIRPORT.stands)assert.ok(airportTerminalForStand(stand).standIds.includes(stand.id));
 assert.equal(AIRPORT_TAXI_BAYS.length,8);assert.ok(AIRPORT_TAXI_BAYS.every(b=>b.walk.length>=3));
});

test('each terminal has reachable taxi pickup and drop-off bays connected to the city streets',()=>{
 for(const bay of AIRPORT_TAXI_BAYS){
  const terminal=AIRPORT.terminals.find(t=>t.id===bay.terminalId)!;
  assert.equal(blocked(terminal.gate),false);assert.equal(blocked(bay),false);
  const walk=pedestrianRoute(terminal.gate,{x:bay.x,z:bay.z});assert.ok(walk.length,bay.id);
  const car=pedestrianRoute({x:-210,z:0},bay.access,'car');assert.ok(car.length,bay.id);
  for(const route of [walk,car])assert.ok(route.every((p,i)=>!i||clearSegment(route[i-1],p)),bay.id);
 }
});

test('upstairs terminal train access and separate check-in/security departures avoid all terminal walls and furniture',()=>{
 for(const terminal of AIRPORT.terminals){
  const group=createPassengerTerminal({terminal,gate:terminal.gate},()=>new THREE.Sprite(),{name:terminal.name,modern:true});group.updateMatrixWorld(true);
  const meshes:THREE.Object3D[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
  const departure=airportDeparturePath(terminal.standIds[0]);
  assert.ok(departure.some(p=>p.stage==='departure-security'&&p.y===6.52));assert.ok(departure.some(p=>p.stage==='departure-check-in'&&p.y===6.52));assert.equal(departure.at(-1)!.y,3.4);
  for(const path of [airportTerminalAccess(terminal.id),departure])for(let i=1;i<path.length;i++){
   const a=path[i-1],b=path[i],from=new THREE.Vector3(a.x,a.y,a.z),to=new THREE.Vector3(b.x,b.y,b.z),length=from.distanceTo(to);if(length<.01)continue;
   const ray=new THREE.Raycaster(from,to.sub(from).normalize(),.01,length-.01);
   assert.equal(ray.intersectObjects(meshes,false).length,0,`${terminal.id} leg ${i}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  }
 }
});

test('free trains carry a transfer in either direction only during real station dwell and stay bounded at two cars',()=>{
 for(const [from,to]of [['T1','T4'],['T4','T1'],['T2','T3'],['T3','T2']])for(const at of [0,1000,100000]){
  const transfer=airportTerminalTransfer(from,to,at,120);assert.equal(transfer.fare,0);assert.ok(transfer.arrivalAt>at);
  const board=transfer.waypoints.find(p=>p.stage==='terminal-train-board')!,train=airportTerminalTrainStates(board.at/120).find(t=>t.id===transfer.trainId)!;
  assert.ok(train.visible&&train.dwelling);assert.equal(train.x,board.x);assert.equal(train.z,board.z);
  for(const point of transfer.waypoints.filter(p=>p.stage==='terminal-train')){const pose=airportTerminalTrainStates(point.at/120).find(t=>t.id===transfer.trainId)!;assert.ok(pose.visible&&pose.dwelling);assert.ok(Math.abs(pose.x-point.x)<1e-6);assert.equal(pose.z,point.z);}
  const ride=transfer.waypoints.filter(p=>p.stage==='terminal-train-board'||p.stage==='terminal-train'||p.stage==='terminal-train-departure');
  for(let i=1;i<ride.length;i++)for(let time=ride[i-1].at;time<=ride[i].at;time+=60){
   const a=ride[i-1],b=ride[i],fraction=(time-a.at)/Math.max(1,b.at-a.at),pose=airportTerminalTrainStates(time/120).find(t=>t.id===transfer.trainId)!;
   assert.ok(pose.visible);assert.ok(Math.abs(pose.x-(a.x+(b.x-a.x)*fraction))<1e-6,`${from} to ${to}: passenger leaves train during a station dwell`);assert.equal(pose.z,a.z);
  }
 }
 const group=new THREE.Group(),renderer=new AirportTerminalTrains(group,()=>new THREE.Sprite());assert.equal(renderer.trains.length,2);
 let lights=0,draws=0;group.traverse(o=>{if(o instanceof THREE.Light)lights++;if(o instanceof THREE.Mesh)draws++;});assert.equal(lights,0);assert.ok(draws<=12);
 for(let s=0;s<1000;s+=.5){renderer.update(s);assert.equal(renderer.trains.length,2);for(const train of renderer.trains)assert.ok(Number.isFinite(train.position.x));}
});

test('M12 has no airport bend stop and continues on the same avenue to the south city edge',()=>{
 const line=METRO_LINES.find(l=>l.id==='M12')!;assert.ok(!line.points.some(([x,z])=>x===-210&&z===-400));
 assert.deepEqual(line.points.filter(([x])=>x===-210).map(([,z])=>z),[-340,-220,-116,0,87,145,260,340]);
 for(let i=0;i<line.points.length;i++)for(const direction of [-1,1])assert.equal(metroStationGeometry(line,i,direction).accessViolations,0);
});
