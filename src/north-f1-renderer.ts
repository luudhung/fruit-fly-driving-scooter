import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {NORTH_F1_BUILDINGS,NORTH_F1_CIRCUIT,NORTH_F1_PIT_POINTS,NORTH_F1_PIT_WIDTH,northF1PitPose,northF1Pose,type NorthF1Point} from '../worker/north-f1-map.mjs';
import {sampleF1Motion,type F1MotionSegment} from '../worker/north-f1-motion.mjs';

const ROAD_LEVEL=.248;
const PIT_LEVEL=.263;

type Audience={total:number;visitors:number;hansdrex:number;north:number};
type ShuttlePoint=NorthF1Point&{y:number;at:number;mode:string};
type RaceCar={progress?:number;id:string;teamId:string;driverId:string;color:number;lane:number;motion:F1MotionSegment[]};
export type NorthF1View={
 teams:{id:string;name:string;color:number;drivers:string[]}[];
 activeRace?:{startsAt:number;endsAt:number;totalLaps:number;cars:RaceCar[];audience:Audience}|null;
 trackCrowd?:Audience;
 races:number;
 nextAt:number;
 revenue:number;
 charterArrivals:number;
 charterDepartures:number;
 raceStatus:string;
 charterShuttles?:{route:{duration:number;points:ShuttlePoint[]};groups:Array<{id:string;arrivalAt:number;returnAt:number}>}|null;
 lastRace?:{audience?:Audience;winnerId?:string}|null;
};

const normalAt=(prev:NorthF1Point,next:NorthF1Point)=>{
 const x=next.x-prev.x,z=next.z-prev.z,len=Math.hypot(x,z)||1;
 return{x:-z/len,z:x/len};
};

function ribbon(points:readonly NorthF1Point[],width:number,y:number,offset=0,loop=true) {
 const buffer:number[]=[],count=points.length;
 const edge=(i:number,side:number)=>{
  const p=points[i],normal=normalAt(points[i===0&&!loop?0:(i+count-1)%count],points[i===count-1&&!loop?count-1:(i+1)%count]);
  const d=offset+side*width/2;
  return [p.x+normal.x*d,y,p.z+normal.z*d];
 };
 for(let i=0;i<(loop?count:count-1);i++){
  const j=(i+1)%count,a=edge(i,-1),b=edge(i,1),c=edge(j,-1),d=edge(j,1);
  buffer.push(...a,...b,...c,...c,...b,...d);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(buffer,3));
 geometry.computeVertexNormals();return geometry;
}
const finish=(color:number)=>new THREE.MeshBasicMaterial({color,toneMapped:false,side:THREE.DoubleSide});
const box=(w:number,h:number,d:number,x=0,y=0,z=0)=>new THREE.BoxGeometry(w,h,d).translate(x,y,z);
function addBatch(parent:THREE.Group,parts:THREE.BufferGeometry[],material:THREE.Material){
 if(!parts.length)return;
 const indices=parts.map(g=>g.index?g.toNonIndexed():g);
 const built=mergeGeometries(indices);
 for(let i=0;i<parts.length;i++){if(indices[i]!==parts[i])indices[i].dispose();parts[i].dispose();}
 if(built)parent.add(new THREE.Mesh(built,material));
}

export class NorthF1Renderer {
 readonly root=new THREE.Group();
 readonly buildings=new Map<string,THREE.Group>();
 private readonly body:THREE.InstancedMesh;
 private readonly dark:THREE.InstancedMesh;
 private readonly pitCrews:THREE.InstancedMesh;
 private readonly shuttle:THREE.InstancedMesh;
 private readonly crowd:THREE.InstancedMesh;
 private readonly tmp=new THREE.Object3D();
 private readonly color=new THREE.Color();
 private crowdCount=-1;
 private data:NorthF1View|null=null;

 constructor(parent:THREE.Group,sign:(text:string,fontSize?:number,scale?:number)=>THREE.Sprite){
  this.root.name='North City Waterfront Grand Prix';parent.add(this.root);
  const {points,width}=NORTH_F1_CIRCUIT;
  const asphalt=new THREE.MeshStandardMaterial({color:0x39434e,emissive:0x526680,emissiveIntensity:.39,roughness:.88,side:THREE.DoubleSide});
  const concrete=new THREE.MeshStandardMaterial({color:0x93a2ad,roughness:.84});
  const metal=new THREE.MeshStandardMaterial({color:0x344d62,roughness:.72});
  const grandstandRoof=new THREE.MeshStandardMaterial({color:0x20343c,roughness:.68,metalness:.24});
  this.root.add(new THREE.Mesh(ribbon(points,width,ROAD_LEVEL),asphalt));
  this.root.add(new THREE.Mesh(ribbon(NORTH_F1_PIT_POINTS,NORTH_F1_PIT_WIDTH,PIT_LEVEL,0,false),asphalt));
  for(const side of [-1,1]){
   this.root.add(new THREE.Mesh(ribbon(points,.16,ROAD_LEVEL+.013,side*(width/2-.35)),finish(0xe1e4df)));
   this.root.add(new THREE.Mesh(ribbon(NORTH_F1_PIT_POINTS,.12,PIT_LEVEL+.013,side*3.25,false),finish(0xc5d6dd)));
  }
  const lamps:THREE.BufferGeometry[]=[],poles:THREE.BufferGeometry[]=[],red:THREE.BufferGeometry[]=[],white:THREE.BufferGeometry[]=[];
  const barriers:THREE.BufferGeometry[]=[],finishDark:THREE.BufferGeometry[]=[];
  const illumination:number[]=[],lightColors:number[]=[];
  const lightPool=(x:number,z:number,yaw:number)=>{
   for(let i=0;i<10;i++){
    illumination.push(x,ROAD_LEVEL+.007,z);
    lightColors.push(.68,.80,1,.17);
    for(const j of [i,i+1]){
     const a=j/10*Math.PI*2,u=Math.cos(a)*7.4,v=Math.sin(a)*8.5;
     illumination.push(x+Math.cos(yaw)*u+Math.sin(yaw)*v,ROAD_LEVEL+.007,z-Math.sin(yaw)*u+Math.cos(yaw)*v);
     lightColors.push(.68,.80,1,0);
    }
   }
  };
  // Segment furnishings follow the course while major cross streets stay open to vehicles.
  for(let meters=13;meters<NORTH_F1_CIRCUIT.lapLength;meters+=13){
   const p=northF1Pose(meters/NORTH_F1_CIRCUIT.lapLength);
   const at=(side:number,d:number)=>({x:p.x-Math.cos(p.yaw)*d*side,z:p.z+Math.sin(p.yaw)*d*side});
   const downtown=meters>255&&meters<733;
   if(!downtown&&meters%52!==0&&!(meters<198&&meters>13&&meters%26===0)){
    const edge=at(1,width/2+.22);
    barriers.push(box(.42,.78,6.8).rotateY(p.yaw).translate(edge.x,.59,edge.z));
   }
   if((meters%26===0&&!downtown)||(meters%39===0&&downtown)){
    const a=at(-1,width/2+1);
    poles.push(box(.12,5.4,.12,a.x,2.7,a.z));
    lamps.push(box(1.4,.20,.26).rotateY(p.yaw).translate(a.x,5.4,a.z));
    lightPool(p.x,p.z,p.yaw);
   }
   if((meters/13)%4===1||downtown){
    const a=at(-1,width/2-.82);
    for(let i=0;i<6;i++){
     const stripe=box(1.15,.025,.63).rotateY(p.yaw).translate(a.x+Math.sin(p.yaw)*i*.68,ROAD_LEVEL+.022,a.z+Math.cos(p.yaw)*i*.68);
     (i%2?red:white).push(stripe);
    }
   }
  }
  for(let row=0;row<2;row++)for(let col=0;col<18;col++){
   const b=box(.36,.01,.86,-740+row*.37,ROAD_LEVEL+.023,-922.65+col*.9);
   ((row+col)%2?white:finishDark).push(b);
  }
  for(let i=0;i<20;i++){
   const p=northF1Pose(-i*.00165,i%2?3:-3);
   white.push(box(2.05,.018,.15).rotateY(p.yaw).translate(p.x,ROAD_LEVEL+.021,p.z));
  }
  for(let i=0;i<10;i++){
   const x=-680+i*8.4,z=-896.85;
   white.push(box(.12,.018,2.4,x-2.8,PIT_LEVEL+.023,z),box(.12,.018,2.4,x+2.8,PIT_LEVEL+.023,z),box(5.6,.018,.12,x,PIT_LEVEL+.023,z+1.2));
  }
  for(const side of [-1,1])poles.push(box(.48,7.3,.55,-740,3.65,-915+side*8.65));
  poles.push(box(.70,1.45,17.8,-740,7.45,-915));
  for(let i=0;i<5;i++)red.push(box(.12,.3,.3,-740.38,7.22,-916.4+i*.7));
  const banner=sign('NORTH CITY GRAND PRIX',19,9);
  banner.position.set(-740,9.2,-915);
  (banner.material as THREE.SpriteMaterial).depthTest=true;this.root.add(banner);
  if(illumination.length){
   const light=new THREE.BufferGeometry();
   light.setAttribute('position',new THREE.Float32BufferAttribute(illumination,3));
   light.setAttribute('color',new THREE.Float32BufferAttribute(lightColors,4));
   this.root.add(new THREE.Mesh(light,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false})));
  }
  addBatch(this.root,finishDark,finish(0x1a2632));
  addBatch(this.root,barriers,concrete);addBatch(this.root,poles,metal);
  addBatch(this.root,lamps,finish(0xe2f5ff));addBatch(this.root,red,finish(0xca4550));addBatch(this.root,white,finish(0xffeddd));
  for(const building of NORTH_F1_BUILDINGS){
   const group=new THREE.Group();
   const {w,d,h}=building;
   group.name=building.name;group.position.set(building.x,0,building.z);this.root.add(group);
   this.buildings.set(building.id,group);
   const lighting:THREE.BufferGeometry[]=[],stairs:THREE.BufferGeometry[]=[],frame:THREE.BufferGeometry[]=[],roof:THREE.BufferGeometry[]=[];
   if(building.id.includes('garages')){
    stairs.push(box(w,h*.88,d,0,h*.44));
    roof.push(box(w+.8,.42,d+.8,0,h*.9));
    for(let i=0;i<10;i++){
     const x=(i-4.5)*w/10;
     frame.push(box(w/10-1.05,h*.38,.14,x,h*.24,-d/2-.08));
     lighting.push(box(w/10-1.65,.16,.18,x,h*.46,-d/2-.12));
    }
    lighting.push(box(w*.94,.2,.19,0,h*.72,-d/2-.12));
   }else{
    const facing=building.id.includes('waterfront')?1:-1;
    for(let row=0;row<7;row++){
     const y=.58+row*.56,z=facing*(d*.39-row*d*.112);
     stairs.push(box(w,.60,d*.125,0,y,z));
     lighting.push(box(w*.97,.068,.095,0,y+.36,z+facing*d*.065));
    }
    for(let i=0;i<9;i++){
     const x=(i-4)*w/9;frame.push(box(.4,h-1,.4,x,(h-1)/2,-facing*d*.42));
    }
    roof.push(box(w+1,.35,d*.73,0,h-.72,-facing*d*.15));
    lighting.push(box(w,.22,.16,0,h-.96,facing*d*.21));
   }
   addBatch(group,stairs,concrete);addBatch(group,frame,metal);addBatch(group,roof,grandstandRoof);addBatch(group,lighting,finish(0xb7eeff));
   const label=sign(building.name,18,9);
   (label.material as THREE.SpriteMaterial).depthTest=true;
   label.position.set(0,h+1.7,0);group.add(label);
  }
  const bodyParts=[box(1.36,.44,3.1,0,.39),box(.68,.38,3.7,0,.44),box(1.68,.08,.46,0,.27,1.7),box(1.58,.11,.22,0,.79,-1.64)];
  const wheels=[box(.7,.22,.88,0,.61,-.32),...[-1,1].flatMap(x=>[-1,1].map(z=>box(.36,.52,.61,x*.77,.30,z*1.17)))];
  const vehicleShape=(parts:THREE.BoxGeometry[])=>{const geometry=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());return geometry;};
  this.body=new THREE.InstancedMesh(vehicleShape(bodyParts),new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x556679,emissiveIntensity:.14}),20);
  this.dark=new THREE.InstancedMesh(vehicleShape(wheels),new THREE.MeshStandardMaterial({color:0x121920,roughness:.84}),20);
  this.crowd=new THREE.InstancedMesh(new THREE.BoxGeometry(.36,.66,.32),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.82}),900);
  const bus=vehicleShape([box(2.8,2.6,8.2,0,1.38),box(2.94,.45,8.24,0,.68),box(2.82,.50,8.25,0,2.05)]);
  this.shuttle=new THREE.InstancedMesh(bus,new THREE.MeshLambertMaterial({color:0x3e90b9,emissive:0x275065,emissiveIntensity:.28}),4);
  this.pitCrews=new THREE.InstancedMesh(new THREE.BoxGeometry(.32,.72,.29),new THREE.MeshLambertMaterial({color:0xffb748,emissive:0x915b21,emissiveIntensity:.24}),60);
  for(const batch of [this.body,this.dark,this.crowd,this.shuttle,this.pitCrews]){
   batch.count=0;batch.frustumCulled=false;batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.root.add(batch);
  }
 }

 sync(data:NorthF1View|null|undefined){this.data=data||null;}
 update(gameNow:number,camera:THREE.Camera){
  const cx=camera.position.x+655,cz=camera.position.z+770;
  const near=cx*cx+cz*cz<850*850;
  const active=this.data?.activeRace;
  let count=0,crew=0;
  this.tmp.scale.setScalar(1);
  if(near&&active&&gameNow<active.endsAt){
   for(const car of active.cars){
    const sample=sampleF1Motion(car.motion,gameNow);
    if(!sample)continue;
    const pose=sample.pit==null?northF1Pose(sample.progress,car.lane):northF1PitPose(sample.pit,car.lane*.26);
    this.tmp.position.set(pose.x,pose.y,pose.z);this.tmp.rotation.set(0,pose.yaw,0);this.tmp.updateMatrix();
    this.body.setMatrixAt(count,this.tmp.matrix);this.dark.setMatrixAt(count,this.tmp.matrix);
    this.body.setColorAt(count,this.color.setHex(car.color));
    if(sample.pitPhase==='changing tyres')for(const offset of [-1.28,1.28,-1.78]){
     this.tmp.position.set(pose.x+Math.cos(pose.yaw)*offset,pose.y+.36,pose.z-Math.sin(pose.yaw)*offset);
     this.tmp.updateMatrix();this.pitCrews.setMatrixAt(crew++,this.tmp.matrix);
    }
    if(++count>=20)break;
   }
  }
  this.body.count=count;this.dark.count=count;this.pitCrews.count=crew;
  if(crew)this.pitCrews.instanceMatrix.needsUpdate=true;
  this.updateShuttles(gameNow,near);
  if(count){this.body.instanceMatrix.needsUpdate=true;this.dark.instanceMatrix.needsUpdate=true;if(this.body.instanceColor)this.body.instanceColor.needsUpdate=true;}
  const audience=near?Math.min(900,Math.max(0,this.data?.trackCrowd?.total||0)):0;
  if(audience===this.crowdCount)return;
  this.crowdCount=audience;this.crowd.count=audience;this.tmp.rotation.set(0,0,0);
  for(let i=0;i<audience;i++){
   const main=i%4!==0,stand=NORTH_F1_BUILDINGS[main?0:2],n=main?i-Math.floor(i/4)-1:Math.floor(i/4);
   const row=n%7,col=Math.floor(n/7),facing=main?-1:1;
   this.tmp.position.set(stand.x-stand.w*.46+col*(main?1.37:2.2),.95+row*.56,stand.z+facing*(stand.d*.39-row*stand.d*.112));
   this.tmp.updateMatrix();this.crowd.setMatrixAt(i,this.tmp.matrix);
   this.color.setHSL((i*.6180339)%1,.42,.54+i%3*.09);this.crowd.setColorAt(i,this.color);
  }
  this.crowd.instanceMatrix.needsUpdate=true;if(this.crowd.instanceColor)this.crowd.instanceColor.needsUpdate=true;
 }
 private updateShuttles(gameNow:number,near:boolean){
  const shuttles=this.data?.charterShuttles;
  let count=0;
  if(near&&shuttles){
   const {route}=shuttles;
   const phase=route.points;
   for(const group of shuttles.groups){
    const returning=gameNow>=group.returnAt;
    const elapsed=gameNow-(returning?group.returnAt:group.arrivalAt);
    const at=returning?route.duration-elapsed:elapsed;
    if(!(at>=0&&at<route.duration))continue;
    const next=phase.findIndex(p=>p.at>at);
    if(next<=0||phase[next].mode!=='shuttle')continue;
    const a=phase[next-1],b=phase[next],t=(at-a.at)/Math.max(1,b.at-a.at);
    this.tmp.position.set(THREE.MathUtils.lerp(a.x,b.x,t),.18,THREE.MathUtils.lerp(a.z,b.z,t));
    this.tmp.rotation.set(0,Math.atan2(b.x-a.x,b.z-a.z)+(returning?Math.PI:0),0);
    this.tmp.updateMatrix();this.shuttle.setMatrixAt(count++,this.tmp.matrix);
    if(count>=4)break;
   }
  }
  this.shuttle.count=count;if(count)this.shuttle.instanceMatrix.needsUpdate=true;
 }
}
