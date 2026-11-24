import * as THREE from 'three';
import {AIRPORT_TERMINAL_RAIL,AIRPORT_TERMINAL_STATIONS,AIRPORT_TAXI_BAYS,airportTerminalTrainStates} from '../worker/airport-campus.mjs';
import {batchStaticMeshes} from './static-box-batches.ts';
type Sign=(text:string,w:number,h:number)=>THREE.Sprite;
/** Two lightweight cars on a shared zero-fare terminal rail; all infrastructure is static. */
export class AirportTerminalTrains{
 readonly root=new THREE.Group();readonly trains:THREE.Group[]=[];
 constructor(parent:THREE.Group,make:Sign){
  this.root.name='airport-free-terminal-trains';parent.add(this.root);
  const infrastructure=new THREE.Group(),stone=new THREE.MeshStandardMaterial({color:0xcdd8d3,roughness:.75}),metal=new THREE.MeshStandardMaterial({color:0x50696e,roughness:.5}),glass=new THREE.MeshStandardMaterial({color:0x296c79,roughness:.4}),green=new THREE.MeshBasicMaterial({color:0x77e9c8});
  const box=(g:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);g.add(mesh);};
  const first=AIRPORT_TERMINAL_STATIONS[0],last=AIRPORT_TERMINAL_STATIONS.at(-1)!,length=last.x-first.x+28,middle=(first.x+last.x)/2,rail=AIRPORT_TERMINAL_RAIL;
  for(const direction of [1,-1]){
   const z=rail.z+direction*rail.trackOffset;
   box(infrastructure,middle,4.65,z,length,.35,3.2,stone);
   for(const side of [-1,1])box(infrastructure,middle,4.88,z+side*.68,length,.15,.12,metal);
   for(let x=first.x-10;x<=last.x+10;x+=25)box(infrastructure,x,2.3,z,.55,4.6,.65,stone);
   const car=new THREE.Group();car.name=`HCA-FREE-${direction>0?'A':'B'}`;
   // Long axis x matches the horizontal guideway; no animated doors or lights.
   box(car,0,1.22,0,12,2.4,2.8,stone);box(car,0,1.75,0,10,.8,2.86,glass);box(car,0,2.5,0,12.4,.16,3,metal);
   box(car,0,.45,0,12,.14,2.88,green);
   const label=make('FREE · T1 ↔ T2 ↔ T3 ↔ T4',14,.65);label.position.set(0,3.1,0);car.add(label);
   batchStaticMeshes(car);this.trains.push(car);this.root.add(car);
  }
  for(const station of AIRPORT_TERMINAL_STATIONS){
   box(infrastructure,station.x,5.31,rail.z,24,.22,5,stone);
   box(infrastructure,station.x,9.25,rail.z,26,.2,7,stone);
   for(const side of [-1,1])box(infrastructure,station.x+side*11,7.3,rail.z,.22,4,.22,metal);
   const label=make(`${station.terminalId} · FREE AIRPORT TRAIN`,27,.85);label.position.set(station.x,10.2,rail.z);infrastructure.add(label);
  }
  for(const bay of AIRPORT_TAXI_BAYS){const label=make(`${bay.terminalId} · TAXI ${bay.kind.toUpperCase()}`,18,.65);label.position.set(bay.x,2.7,bay.z);infrastructure.add(label);}
  batchStaticMeshes(infrastructure);this.root.add(infrastructure);this.root.userData={fare:0,trainCount:2,stations:4,lights:0};this.update(0);
 }
 update(seconds:number){for(const [i,pose]of airportTerminalTrainStates(seconds).entries()){const train=this.trains[i];train.visible=pose.visible;train.position.set(pose.x,4.95,pose.z);train.userData={trainId:pose.id,fare:0,direction:pose.direction,stationId:pose.stationId,dwelling:pose.dwelling};}}
}
