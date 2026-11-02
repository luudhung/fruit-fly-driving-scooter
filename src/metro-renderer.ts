import * as THREE from 'three';
import {METRO_LINES,metroStationGeometry,metroTrackPoints,trainStates,ROADS,BUILDINGS,WATER,PARK,contains,type MetroLine} from '../worker/city-map.mjs';
import {batchStaticBoxes} from './static-box-batches.ts';
import {buildElevatedMetroWalkways,buildMetroInterchanges} from './metro-interchanges.ts';
type Point={x:number;y:number;z:number};
type Actor={alive:boolean;onTrain?:boolean;metroLineId?:string;metroTrainId?:string;metroTrainDirection?:number;transitStage?:string|null;x:number;z:number};
type Sign=(text:string,fontSize?:number,scale?:number)=>THREE.Sprite;
type Train={group:THREE.Group;lineIndex:number;id:string;direction:number;label:THREE.Sprite};
type Station={lineId:string;index:number;direction:number;x:number;z:number;label:THREE.Sprite;title:string};
const colors=[0xe34a45,0x2f74c0,0x4aa75f,0xf0b541,0x9b5db5,0x46a7ae,0xd7835e];
export function metroDirectionLabel(line:MetroLine,direction:number){return `${line.id} ${direction>=0?'→ BẾN CUỐI':'← BẾN ĐẦU'}`;}
/** Two physical trains and two parallel services per line; infrastructure stays batched. */
export class MetroRenderer{
 readonly trains:Train[]=[];
 readonly stations:Station[]=[];
 readonly infrastructure=new THREE.Group();
 private readonly beam=new THREE.MeshStandardMaterial({color:0x6e7478,roughness:.66,metalness:.38});
 private readonly rail=new THREE.MeshStandardMaterial({color:0x555b60,roughness:.42,metalness:.72});
 private readonly sleeper=new THREE.MeshStandardMaterial({color:0x4a4038,roughness:.88,metalness:.10});
 private readonly platform=new THREE.MeshStandardMaterial({color:0xb9bec0,roughness:.72,metalness:.12});
 private readonly step=new THREE.MeshStandardMaterial({color:0x8e9497,roughness:.82,metalness:.16});
 private readonly canopy=new THREE.MeshStandardMaterial({color:0x535b60,roughness:.55,metalness:.45});
 private readonly body=new THREE.MeshStandardMaterial({color:0xc6cbce,roughness:.28,metalness:.78});
 private readonly window=new THREE.MeshStandardMaterial({color:0x8db9d0,emissive:0x3c9fd4,emissiveIntensity:.95,roughness:.28});
 private readonly edgeMaterials=colors.map(color=>new THREE.MeshBasicMaterial({color,toneMapped:false}));
 private readonly stripeMaterials=colors.map(color=>new THREE.MeshBasicMaterial({color}));
 private readonly counts=new Map<string,number>();
 private readonly writeSign:(sprite:THREE.Sprite,text:string)=>void;
 constructor(root:THREE.Group,makeSign:Sign,writeSign:(sprite:THREE.Sprite,text:string)=>void,detail=2){
  this.writeSign=writeSign;this.infrastructure.name='Twin-track metro infrastructure';root.add(this.infrastructure);
  const crossovers:Point[][]=[];
  for(const [lineIndex,line]of METRO_LINES.entries()){
   for(const direction of [1,-1]){
    const points=metroTrackPoints(line,direction);
    for(let i=1;i<points.length;i++)this.addRailSegment({...points[i-1],y:line.height},{...points[i],y:line.height});
   }
   for(let index=0;index<line.points.length;index++){
    const geos=[metroStationGeometry(line,index,1),metroStationGeometry(line,index,-1)];
    const shared=geos[0].sharedStairs;
    for(let i=1;i<shared.length;i++)this.addStaircase(shared[i-1],shared[i]);
    for(const geo of geos){
     if(geo.crossover.length>1)crossovers.push(geo.crossover);
     this.addStation(line,index,lineIndex,geo.direction,makeSign,detail);
    }
    const interchangeLines=METRO_LINES.filter(other=>other.id!==line.id&&other.points.some(([x,z])=>x===line.points[index][0]&&z===line.points[index][1])).map(other=>other.id);
    const geo=geos[0],sign=makeSign(`${line.id} ↑ ${interchangeLines.length?`↔ ${interchangeLines.join('/')}`:'METRO'} · → / ←`,17,.9);
    sign.position.set(geo.access.x,3.1,geo.access.z);root.add(sign);
   }
   for(const slot of ['A','B'])this.addTrain(root,lineIndex,`${line.id}-${slot}`,makeSign,detail);
  }
  batchStaticBoxes(this.infrastructure);
  buildElevatedMetroWalkways(root,crossovers);
  buildMetroInterchanges(root);
 }
 private box(w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material,yaw=0,target=this.infrastructure){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.rotation.y=yaw;target.add(mesh);return mesh;
 }
 private addStaircase(from:Point,to:Point){
  const dx=to.x-from.x,dz=to.z-from.z,length=Math.hypot(dx,dz);if(length<.01)return;
  const steps=Math.max(2,Math.ceil(Math.abs(to.y-from.y)/.22)),yaw=Math.atan2(-dz,dx);
  for(let i=0;i<steps;i++){
   const u=(i+.5)/steps;
   this.box(Math.max(.1,length/steps+.05),.22,.9,from.x+dx*u,from.y+(to.y-from.y)*u-1.01,from.z+dz*u,this.step,yaw);
  }
  const vector=new THREE.Vector3(dx,to.y-from.y,dz),quaternion=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1,0,0),vector.clone().normalize());
  for(const side of [-1,1]){
   const rail=this.box(vector.length(),.06,.06,(from.x+to.x)/2-dz/length*side*.52,(from.y+to.y)/2+.02,(from.z+to.z)/2+dx/length*side*.52,this.step);rail.quaternion.copy(quaternion);
  }
 }
 private addStation(line:MetroLine,index:number,lineIndex:number,direction:number,makeSign:Sign,detail:number){
  const geo=metroStationGeometry(line,index,direction),horizontal=geo.axis==='x',root=this.infrastructure;
  this.box(horizontal?16:3.2,.55,horizontal?3.2:16,geo.platform.x,geo.platform.y-1.175,geo.platform.z,this.platform);
  const towardTrack=new THREE.Vector3(geo.track.x-geo.platform.x,0,geo.track.z-geo.platform.z).normalize();
  this.box(horizontal?15.4:.16,.08,horizontal?.16:15.4,geo.platform.x+towardTrack.x*1.45,geo.platform.y-.87,geo.platform.z+towardTrack.z*1.45,this.edgeMaterials[lineIndex]);
  if(detail>=1){
   // Leave the middle clear for the crossover lift, instead of sealing it with a canopy.
   for(const side of [-1,1]){
    this.box(horizontal?5.1:3.2,.28,horizontal?3.2:5.1,geo.platform.x+(horizontal?side*3.45:0),geo.platform.y+1.65,geo.platform.z+(horizontal?0:side*3.45),this.canopy);
    this.box(.16,2.7,.16,geo.platform.x+(horizontal?side*5:0),geo.platform.y+.35,geo.platform.z+(horizontal?0:side*5),this.beam);
   }
  }
  const title=metroDirectionLabel(line,direction),label=makeSign(`${title} · 0 CHỜ`,16,1.15);
  label.position.set(geo.platform.x,geo.platform.y+3.45,geo.platform.z);root.add(label);
  this.stations.push({lineId:line.id,index,direction,x:geo.platform.x,z:geo.platform.z,label,title});
 }
 private addRailSegment(a:Point,b:Point){
  const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<.01)return;
  const x=(a.x+b.x)/2,z=(a.z+b.z)/2,y=a.y,yaw=Math.atan2(-dz,dx),px=-dz/length,pz=dx/length;
  this.box(length, .24,3.4,x,y-.48,z,this.beam,yaw);
  for(const side of [-1,1])this.box(length,.22,.20,x+px*side*1.05,y-.20,z+pz*side*1.05,this.rail,yaw);
  const sleepers=Math.max(2,Math.floor(length/4.5));
  for(let i=0;i<=sleepers;i++){const t=i/sleepers;this.box(.30,.12,3.05,a.x+dx*t,y-.34,a.z+dz*t,this.sleeper,yaw);}
  for(let d=13;d<length;d+=26){
   const t=d/length,sx=a.x+dx*t,sz=a.z+dz*t;
   if(WATER.some(w=>contains(w,{x:sx,z:sz},4)))continue;
   const offset=[6.4,-6.4].find(side=>{const p={x:sx+px*side,z:sz+pz*side};return !ROADS.some(r=>contains(r,p,.75))&&!BUILDINGS.some(b=>contains(b,p,.75))&&!contains(PARK,p,1);});
   if(offset===undefined)continue;
   this.box(.72,y-.55,.72,sx+px*offset,(y-.55)/2,sz+pz*offset,this.beam);
   this.box(.8,.45,Math.abs(offset)+.8,sx+px*offset/2,y-.68,sz+pz*offset/2,this.beam,yaw);
  }
 }
 private addTrain(root:THREE.Group,lineIndex:number,id:string,makeSign:Sign,detail:number){
  const group=new THREE.Group(),cars=detail>=2?3:2;group.name=`Metro ${id}`;
  for(let car=0;car<cars;car++){
   const z=(car-(cars-1)/2)*8.05;
   this.box(3.2,2.5,7.6,0,0,z,this.body,0,group);
   this.box(3.24,.22,7.66,0,-.52,z,this.stripeMaterials[lineIndex],0,group);
   if(detail>=1)for(const side of [-1,1])for(let w=-2;w<=2;w++)this.box(.06,.8,.75,side*1.63,.4,z+w*1.25,this.window,0,group);
  }
  batchStaticBoxes(group);
  const label=makeSign(`${METRO_LINES[lineIndex].id} · ${id.endsWith('A')?'A':'B'}`,18,1.15);label.position.y=4;group.add(label);root.add(group);
  this.trains.push({group,lineIndex,id,direction:0,label});
 }
 syncOccupancy(actors:readonly Actor[]){
  this.counts.clear();for(const actor of actors)if(actor.alive&&actor.onTrain&&actor.metroTrainId)this.counts.set(actor.metroTrainId,(this.counts.get(actor.metroTrainId)||0)+1);
  for(const station of this.stations){
   const waiting=actors.filter(a=>a.alive&&!a.onTrain&&a.metroLineId===station.lineId&&a.metroTrainDirection===station.direction&&a.transitStage==='platform-wait'&&Math.hypot(a.x-station.x,a.z-station.z)<9).length;
   this.writeSign(station.label,`${station.title} · ${waiting} CHỜ`);
  }
  for(const train of this.trains)this.trainLabel(train);
 }
 private trainLabel(train:Train){this.writeSign(train.label,`${metroDirectionLabel(METRO_LINES[train.lineIndex],train.direction||1)} · ${this.counts.get(train.id)||0} KHÁCH`);}
 update(seconds:number){
  for(const [lineIndex,line]of METRO_LINES.entries())for(const pose of trainStates(line,seconds)){
   const train=this.trains.find(t=>t.lineIndex===lineIndex&&t.id===pose.id);if(!train)continue;
   train.group.visible=pose.active;train.group.position.set(pose.x,pose.y,pose.z);
   const a=line.points[pose.from],b=line.points[pose.to];train.group.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1]);
   if(train.direction!==pose.direction){train.direction=pose.direction;this.trainLabel(train);}
  }
 }
}
