import {CityMotion,type MotionPlan} from './city-motion.ts';
import {SceneViewBudget,selectViewBudget} from './view-budget.ts';
import {signalBarrier,createVehicleIndex,type TrafficActor} from '../worker/traffic.mjs';
import * as THREE from 'three';
import {PARKING_SPACES,clearSegment} from '../worker/city-map.mjs';

type Driver={motion?:MotionPlan|null;trafficSignalPermit?:boolean;id:string;alive:boolean;vehicle?:string|null;traveling?:boolean;transitMode?:string;x:number;y?:number;z:number;vx:number;vz:number;parkedCar?:{x:number;z:number;heading?:number}|null;movementTrace?:Array<{x:number;y?:number;z:number;t:number}>};
type Car={id:string;motion?:CityMotion;hasMotion?:boolean;signalPermit?:boolean;color:THREE.Color;x:number;y:number;z:number;heading:number;pitch:number;targetX:number;targetY:number;targetZ:number;targetHeading:number;driving:boolean;lastTrace:number;route:Array<{x:number;y?:number;z:number}>;actor:TrafficActor};
export type RoadIncident={id:string;x:number;z:number;repairAt:number};
const position=(f:Driver)=>!f.alive||!f.vehicle?.includes('car')?null:f.traveling&&f.transitMode==='car'?f:f.parkedCar||null;

/** Only a bounded nearby view creates motion objects or submits GPU instances. */
export class PersonalCars{
 readonly stats={candidates:0,cached:0,dormant:0,created:0,reused:0,pooled:0,bodies:0,cabins:0,wheels:0,triangles:0};
 private readonly cars=new Map<string,Car>();
 // CPU-only checkpoints for previously visible moving IDs. They do not advance
 // or submit instances offscreen, and disappear with their authoritative actor.
 private readonly dormant=new Map<string,Car>();
 private readonly retained=new Set<string>();
 private readonly pool:Car[]=[];
 private readonly view=new SceneViewBudget();
 private camera:THREE.Camera|null=null;
 private drivers:readonly Driver[]=[];
 private incidents:readonly RoadIncident[]=[];
 private selectionAge=Infinity;
 private indexAge=Infinity;
 private dirty=true;
 private uploadDirty=true;
 private colorsDirty=true;
 private actors:TrafficActor[]=[];
 private headway:ReturnType<typeof createVehicleIndex>=()=>Infinity;
 private readonly dummy=new THREE.Object3D();
 private readonly body:THREE.InstancedMesh;
 private readonly cabin:THREE.InstancedMesh;
 private readonly wheels:THREE.InstancedMesh;
 private readonly cones:THREE.InstancedMesh;
 private readonly parkingCells:Array<{mesh:THREE.LineSegments;point:{x:number;y:number;z:number}}>=[];
 private readonly capacity=120;
 constructor(scene:THREE.Scene){
  this.body=new THREE.InstancedMesh(new THREE.BoxGeometry(1.8,.7,3.4),new THREE.MeshStandardMaterial({color:0xffffff,metalness:.35,roughness:.4}),this.capacity);
  this.cabin=new THREE.InstancedMesh(new THREE.BoxGeometry(1.5,.6,1.7),new THREE.MeshStandardMaterial({color:0x90b8c4,metalness:.2,roughness:.4}),this.capacity);
  this.wheels=new THREE.InstancedMesh(new THREE.BoxGeometry(.22,.56,.65),new THREE.MeshStandardMaterial({color:0x222728,roughness:.9}),this.capacity*4);
  this.cones=new THREE.InstancedMesh(new THREE.ConeGeometry(.35,.9,5),new THREE.MeshStandardMaterial({color:0xf38634,roughness:.9}),48);
  for(const mesh of [this.body,this.cabin,this.wheels,this.cones]){mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);}
  const cells=new Map<string,{point:{x:number;y:number;z:number};points:number[]}>(),paint=new THREE.LineBasicMaterial({color:0xc9c4a3,transparent:true,opacity:.55,depthWrite:false});
  for(const p of PARKING_SPACES){
   const cx=Math.floor(p.x/160),cz=Math.floor(p.z/160),key=cx+':'+cz;let cell=cells.get(key);if(!cell){cell={point:{x:cx*160+80,y:.16,z:cz*160+80},points:[]};cells.set(key,cell);}
   const x=p.w/2,z=p.d/2;for(const [a,b,c,d]of [[-x,-z,x,-z],[x,-z,x,z],[x,z,-x,z],[-x,z,-x,-z]])cell.points.push(p.x+a,.16,p.z+b,p.x+c,.16,p.z+d);
  }
  for(const cell of cells.values()){
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(cell.points,3));geometry.computeBoundingSphere();
   const mesh=new THREE.LineSegments(geometry,paint);mesh.name='Nearby curb parking markings';scene.add(mesh);this.parkingCells.push({mesh,point:cell.point});
  }
 }
 setView(camera:THREE.Camera){this.camera=camera;}
 sync(drivers:Driver[],incidents:RoadIncident[]=[]){this.drivers=drivers;this.incidents=incidents;this.dirty=true;}
 private syncDriver(f:Driver,car:Car,fresh:boolean){
  const driving=Boolean(f.traveling&&f.transitMode==='car'),p=position(f)!;
  const heading=driving&&Math.abs(f.vx)+Math.abs(f.vz)>.01?Math.atan2(f.vx,f.vz):f.parkedCar?.heading||0;
  if(fresh||!driving||!car.driving){car.route.length=0;car.x=p.x;car.y=driving?(f.y??1.1):1.1;car.z=p.z;car.heading=heading;car.pitch=0;}
  else for(const q of f.motion?[]:f.movementTrace||[]){if(q.t<=car.lastTrace)continue;const last=car.route.at(-1)||car;if(clearSegment(last,q))car.route.push(q);else{car.route.length=0;car.x=q.x;car.y=q.y??1.1;car.z=q.z;}}
  if(car.route.length>12)car.route=car.route.slice(-8);
  car.hasMotion=Boolean(driving&&f.motion);
  if(car.hasMotion){car.motion ||=new CityMotion();car.motion.accept(f,f.motion!);car.route.length=0;}
  else car.motion=undefined;
  car.signalPermit=Boolean(f.trafficSignalPermit);car.lastTrace=f.movementTrace?.at(-1)?.t??car.lastTrace;
  car.targetX=p.x;car.targetY=driving?(f.y??1.1):1.1;car.targetZ=p.z;car.targetHeading=heading;car.driving=driving;
 }
 private reconcile(){
  if(this.camera)this.view.setCamera(this.camera);
  for(const cell of this.parkingCells)cell.mesh.visible=this.view.visible(cell.point,false,114);
  this.retained.clear();for(const id of this.cars.keys())this.retained.add(id);
  const valid=new Set<string>();
  const selected=selectViewBudget(this.drivers,this.view,f=>{
   const authoritative=position(f);if(!authoritative)return null;
   valid.add(f.id);
   const sleeping=this.dormant.get(f.id);
   if(sleeping){this.syncDriver(f,sleeping,false);if(sleeping.hasMotion&&sleeping.motion){sleeping.x=sleeping.motion.x;sleeping.y=sleeping.motion.y;sleeping.z=sleeping.motion.z;}}
   const car=this.cars.get(f.id)||sleeping,driving=Boolean(f.traveling&&f.transitMode==='car');
   // Interest must follow what the camera actually sees. A delayed snapshot can
   // be up to eight seconds behind a predicted car; culling against it would
   // discard a visible ID and restart its animation when the snapshot catches up.
   return car&&car.driving===driving?car:authoritative;
  },f=>f.id,this.retained,this.capacity),wanted=new Set(selected.map(f=>f.id));
  let changed=false;
  for(const [id,car]of this.cars)if(!wanted.has(id)){
   this.cars.delete(id);
   if(valid.has(id)&&car.driving&&car.hasMotion)this.dormant.set(id,car);
   else{car.motion=undefined;car.hasMotion=false;car.route.length=0;if(this.pool.length<32)this.pool.push(car);}
   changed=true;
  }
  for(const [id,car]of this.dormant)if(!valid.has(id)||!car.driving){this.dormant.delete(id);car.motion=undefined;car.hasMotion=false;if(this.pool.length<32)this.pool.push(car);}
  let created=0;
  for(const f of selected){
   let car=this.cars.get(f.id),fresh=false;
   if(!car&&this.dormant.has(f.id)){car=this.dormant.get(f.id)!;this.dormant.delete(f.id);this.cars.set(f.id,car);this.stats.reused++;changed=true;}
   if(!car){if(created>=12)continue;created++;fresh=true;
    car=this.pool.pop();if(car){this.stats.reused++;car.id=f.id;car.lastTrace=-1;car.motion=undefined;car.hasMotion=false;}
    else{car={id:f.id,color:new THREE.Color(),x:0,y:1.1,z:0,heading:0,pitch:0,targetX:0,targetY:1.1,targetZ:0,targetHeading:0,driving:false,lastTrace:-1,route:[],actor:{id:f.id,alive:true,transitMode:'car',x:0,y:1.1,z:0}};this.stats.created++;}
    car.color.setHSL((Number(f.id.replace(/\D/g,''))*.61803398875)%1,.48,.43);car.actor.id=f.id;this.cars.set(f.id,car);changed=true;
   }
   this.syncDriver(f,car,fresh);
  }
  this.actors.length=0;for(const car of this.cars.values())this.actors.push(car.actor);
  this.stats.candidates=this.drivers.length;this.stats.cached=this.cars.size;this.stats.dormant=this.dormant.size;this.stats.pooled=this.pool.length;
  this.colorsDirty ||=changed;this.uploadDirty=true;this.indexAge=Infinity;this.selectionAge=0;this.dirty=false;
  let count=0;
  for(const incident of this.incidents.slice(-24))if(this.view.visible(incident))for(const side of [-1,1]){this.dummy.position.set(incident.x+side*.8,.59,incident.z);this.dummy.rotation.set(0,0,0);this.dummy.scale.set(1,1,1);this.dummy.updateMatrix();this.cones.setMatrixAt(count++,this.dummy.matrix);}
  this.cones.count=count;this.cones.visible=count>0;this.cones.instanceMatrix.needsUpdate=true;
 }
 update(dt:number,gameSeconds=0,timeScale=120){
  this.selectionAge+=Math.max(0,dt);this.indexAge+=Math.max(0,dt);
  if(this.dirty||this.selectionAge>=.12)this.reconcile();
  let driving=false;
  for(const car of this.cars.values()){
   const actor=car.actor;actor.x=car.hasMotion&&car.motion?car.motion.x:car.x;actor.y=car.hasMotion&&car.motion?car.motion.y:car.y;actor.z=car.hasMotion&&car.motion?car.motion.z:car.z;
   actor.targetX=car.motion?.targetX??car.targetX;actor.targetZ=car.motion?.targetZ??car.targetZ;actor.traveling=car.driving;driving ||=car.driving;
  }
  if(!driving&&!this.uploadDirty)return;
  if(this.indexAge>=.05){this.headway=createVehicleIndex(this.actors);this.indexAge=0;}
  const signalSeconds=gameSeconds/timeScale,d=this.dummy;let index=0,cabins=0,wheels=0;d.scale.set(1,1,1);
  for(const [id,car]of this.cars){
   if(car.hasMotion&&car.motion){car.motion.advance(dt,gameSeconds,timeScale,(from,to)=>this.headway({...from,id},to));car.targetX=car.motion.x;car.targetY=car.motion.y;car.targetZ=car.motion.z;car.route.length=0;}
   const next=car.route[0]||car,tx=car.route.length?next.x:car.targetX,ty=car.route.length?(next.y??car.targetY):car.targetY,tz=car.route.length?next.z:car.targetZ;
   const blend=Math.min(1,dt*(car.route.length>3?10:6)),dx=tx-car.x,dz=tz-car.z;
   const barrier=car.driving&&!car.signalPermit?signalBarrier(car,{x:car.x+dx*blend,z:car.z+dz*blend},signalSeconds):null;
   const length=Math.hypot(dx,dz),fraction=barrier&&length>0?Math.min(blend,barrier.distance/length):blend,dy=ty-car.y;
   car.x+=dx*fraction;car.y+=dy*fraction;car.z+=dz*fraction;
   if(car.driving&&length>.05)car.pitch=Math.atan2(dy,length);else if(!car.driving)car.pitch=0;
   if(car.route.length&&length<.35)car.route.shift();
   if(car.driving&&length>.05)car.heading=Math.atan2(dx,dz);else if(!car.driving)car.heading=car.targetHeading;
   const distance=this.view.distanceSquared(car);
   d.rotation.set(-car.pitch,car.heading,0,'YXZ');d.position.set(car.x,car.y-.31,car.z);d.updateMatrix();this.body.setMatrixAt(index,d.matrix);
   if(this.colorsDirty)this.body.setColorAt(index,car.color);index++;
   if(distance<=260*260){d.position.y=car.y+.24;d.updateMatrix();this.cabin.setMatrixAt(cabins++,d.matrix);}
   if(distance<=95*95){const sin=Math.sin(car.heading),cos=Math.cos(car.heading);for(const x of [-.9,.9])for(const z of [-1,1]){d.position.set(car.x+x*cos+z*sin,car.y-.61+z*Math.sin(car.pitch),car.z-x*sin+z*cos);d.updateMatrix();this.wheels.setMatrixAt(wheels++,d.matrix);}}
  }
  this.body.count=index;this.cabin.count=cabins;this.wheels.count=wheels;
  this.body.visible=index>0;this.cabin.visible=cabins>0;this.wheels.visible=wheels>0;
  for(const mesh of [this.body,this.cabin,this.wheels])mesh.instanceMatrix.needsUpdate=true;
  if(this.colorsDirty&&this.body.instanceColor)this.body.instanceColor.needsUpdate=true;
  this.colorsDirty=false;this.uploadDirty=false;
  this.stats.bodies=index;this.stats.cabins=cabins;this.stats.wheels=wheels;this.stats.triangles=(index+cabins+wheels)*12;
 }
}
