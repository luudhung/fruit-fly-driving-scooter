import {CityMotion,type MotionPlan} from './city-motion.ts';
import {signalBarrier,createVehicleIndex} from '../worker/traffic.mjs';
import * as THREE from 'three';
import {PARKING_SPACES,clearSegment} from '../worker/city-map.mjs';

type Driver={motion?:MotionPlan|null;trafficSignalPermit?:boolean;id:string;alive:boolean;vehicle?:string|null;traveling?:boolean;transitMode?:string;x:number;z:number;vx:number;vz:number;parkedCar?:{x:number;z:number;heading?:number}|null;movementTrace?:Array<{x:number;z:number;t:number}>};
type Car={motion?:CityMotion;hasMotion?:boolean;signalPermit?:boolean;color:THREE.Color;x:number;z:number;heading:number;targetX:number;targetZ:number;targetHeading:number;driving:boolean;lastTrace:number;route:Array<{x:number;z:number}>};
export type RoadIncident={id:string;x:number;z:number;repairAt:number};

/** All personal vehicles share three draw calls, including their four wheels. */
export class PersonalCars{
 private readonly cars=new Map<string,Car>();
 private readonly dummy=new THREE.Object3D();
 private readonly body:THREE.InstancedMesh;
 private readonly cabin:THREE.InstancedMesh;
 private readonly wheels:THREE.InstancedMesh;
 private readonly cones:THREE.InstancedMesh;
 private readonly capacity=640;
 constructor(scene:THREE.Scene){
  this.body=new THREE.InstancedMesh(new THREE.BoxGeometry(1.8,.7,3.4),new THREE.MeshStandardMaterial({color:0xffffff,metalness:.35,roughness:.4}),this.capacity);
  this.cabin=new THREE.InstancedMesh(new THREE.BoxGeometry(1.5,.6,1.7),new THREE.MeshStandardMaterial({color:0x90b8c4,metalness:.2,roughness:.4}),this.capacity);
  this.wheels=new THREE.InstancedMesh(new THREE.BoxGeometry(.22,.56,.65),new THREE.MeshStandardMaterial({color:0x222728,roughness:.9}),this.capacity*4);
  this.cones=new THREE.InstancedMesh(new THREE.ConeGeometry(.35,.9,5),new THREE.MeshStandardMaterial({color:0xf38634,roughness:.9}),48);
  for(const mesh of [this.body,this.cabin,this.wheels,this.cones]){mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);}
  const points:number[]=[];
  for(const p of PARKING_SPACES){
   const x=p.w/2,z=p.d/2;
   for(const [a,b,c,d]of [[-x,-z,x,-z],[x,-z,x,z],[x,z,-x,z],[-x,z,-x,-z]])points.push(p.x+a,.16,p.z+b,p.x+c,.16,p.z+d);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  scene.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xc9c4a3,transparent:true,opacity:.55,depthWrite:false})));
 }
 sync(drivers:Driver[],incidents:RoadIncident[]=[]){
  const live=new Set<string>();
  for(const f of drivers){
   if(!f.alive||!f.vehicle?.includes('car'))continue;
   const driving=Boolean(f.traveling&&f.transitMode==='car'),p=driving?f:f.parkedCar;if(!p)continue;live.add(f.id);
   const heading=driving&&Math.abs(f.vx)+Math.abs(f.vz)>.01?Math.atan2(f.vx,f.vz):f.parkedCar?.heading||0;
   let car=this.cars.get(f.id);
   if(!car){car={color:new THREE.Color().setHSL((Number(f.id.replace(/\D/g,''))*.61803398875)%1,.48,.43),x:p.x,z:p.z,heading,targetX:p.x,targetZ:p.z,targetHeading:heading,driving,lastTrace:-1,route:[]};this.cars.set(f.id,car);}
   if(!driving||!car.driving){car.route=[];car.x=p.x;car.z=p.z;car.heading=heading;}
   else for(const q of f.motion?[]:f.movementTrace||[]){if(q.t<=car.lastTrace)continue;const last=car.route.at(-1)||car;if(clearSegment(last,q))car.route.push(q);else{car.route=[];car.x=q.x;car.z=q.z;}}
   if(car.route.length>12)car.route=car.route.slice(-8);
   car.hasMotion=Boolean(driving&&f.motion);
   if(car.hasMotion){car.motion ||= new CityMotion();car.motion.accept(f,f.motion!);car.route=[];}
   car.signalPermit=Boolean(f.trafficSignalPermit);
   car.lastTrace=f.movementTrace?.at(-1)?.t??car.lastTrace;car.targetX=p.x;car.targetZ=p.z;car.targetHeading=heading;car.driving=driving;
  }
  for(const id of this.cars.keys())if(!live.has(id))this.cars.delete(id);
  let count=0;
  for(const incident of incidents.slice(-24))for(const side of [-1,1]){this.dummy.position.set(incident.x+side*.8,.59,incident.z);this.dummy.rotation.set(0,0,0);this.dummy.scale.set(1,1,1);this.dummy.updateMatrix();this.cones.setMatrixAt(count++,this.dummy.matrix);}
  this.cones.count=count;this.cones.instanceMatrix.needsUpdate=true;
 }
 update(dt:number,gameSeconds=0,timeScale=120){
  const signalSeconds=gameSeconds/timeScale;
  const headway=createVehicleIndex(Array.from(this.cars,([id,c])=>({id,alive:true,traveling:c.driving,transitMode:'car',x:c.motion&&c.hasMotion?c.motion.x:c.x,z:c.motion&&c.hasMotion?c.motion.z:c.z,targetX:c.motion?.targetX??c.targetX,targetZ:c.motion?.targetZ??c.targetZ})));
  let index=0;const d=this.dummy;d.scale.set(1,1,1);
  for(const [id,car]of this.cars){if(index>=this.capacity)break;
   if(car.hasMotion&&car.motion){car.motion.advance(dt,gameSeconds,timeScale,(from,to)=>headway({...from,id},to));car.targetX=car.motion.x;car.targetZ=car.motion.z;car.route=[];}
   const next=car.route[0]||{x:car.targetX,z:car.targetZ},blend=Math.min(1,dt*(car.route.length>3?10:6)),dx=next.x-car.x,dz=next.z-car.z;
   const barrier=car.driving&&!car.signalPermit?signalBarrier(car,{x:car.x+dx*blend,z:car.z+dz*blend},signalSeconds):null;
   const length=Math.hypot(dx,dz),fraction=barrier&&length>0?Math.min(blend,barrier.distance/length):blend;
   car.x+=dx*fraction;car.z+=dz*fraction;
   if(car.route.length&&Math.hypot(dx,dz)<.35)car.route.shift();
   if(car.driving&&Math.hypot(dx,dz)>.05)car.heading=Math.atan2(dx,dz);else if(!car.driving)car.heading=car.targetHeading;
   d.rotation.set(0,car.heading,0);d.position.set(car.x,.79,car.z);d.updateMatrix();this.body.setMatrixAt(index,d.matrix);
   this.body.setColorAt(index,car.color);
   d.position.y=1.34;d.updateMatrix();this.cabin.setMatrixAt(index,d.matrix);
   let wheel=0;const sin=Math.sin(car.heading),cos=Math.cos(car.heading);
   for(const x of [-.9,.9])for(const z of [-1,1]){d.position.set(car.x+x*cos+z*sin,.49,car.z-x*sin+z*cos);d.updateMatrix();this.wheels.setMatrixAt(index*4+wheel++,d.matrix);}
   index++;
  }
  this.body.count=this.cabin.count=index;this.wheels.count=index*4;
  for(const mesh of [this.body,this.cabin,this.wheels])mesh.instanceMatrix.needsUpdate=true;
  if(this.body.instanceColor)this.body.instanceColor.needsUpdate=true;
 }
}
