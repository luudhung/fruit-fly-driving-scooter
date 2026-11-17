import {northF1ClosureActive,type NorthF1TrackClosure} from '../worker/north-f1-closure.mjs';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {NORTH_F1_CIRCUIT,NORTH_F1_AIRPORT_FOOTBRIDGE,NORTH_F1_GARAGES,NORTH_F1_GRANDSTANDS,NORTH_F1_PIT_APRON,NORTH_F1_PIT_BOXES,NORTH_F1_PIT_BOX_LENGTH,NORTH_F1_PIT_BOX_WIDTH,NORTH_F1_PIT_POINTS,NORTH_F1_PIT_WIDTH,northF1RacePose,northF1Pose,type NorthF1Point} from '../worker/north-f1-map.mjs';
import {sampleF1Motion,type F1MotionSegment} from '../worker/north-f1-motion.mjs';

const ROAD_LEVEL=.248;
const PIT_LEVEL=.263;

type Audience={total:number;visitors:number;hansdrex:number;north:number};
type ShuttlePoint=NorthF1Point&{y:number;at:number;mode:string};
type RaceCar={progress?:number;id:string;teamId:string;driverId:string;color:number;lane:number;pitBox?:number;motion:F1MotionSegment[]};
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
 trackClosure?:NorthF1TrackClosure|null;
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
 private readonly closure=new THREE.Group();
 private readonly body:THREE.InstancedMesh;
 private readonly dark:THREE.InstancedMesh;
 private readonly pitCrews:THREE.InstancedMesh;
 private readonly shuttle:THREE.InstancedMesh;
 private readonly crowd:THREE.InstancedMesh;
 private readonly tmp=new THREE.Object3D();
 private readonly color=new THREE.Color();
 private readonly seats:{x:number;y:number;z:number;yaw:number}[]=[];
 private readonly legacyPitBoxes=new Map<string,number>();
 private crowdCount=-1;
 private data:NorthF1View|null=null;

 constructor(parent:THREE.Group,sign:(text:string,fontSize?:number,scale?:number)=>THREE.Sprite){
  this.root.name='North City Waterfront Grand Prix';parent.add(this.root);
  const {points,width}=NORTH_F1_CIRCUIT;
  // Conspicuous marshals' barriers stand across the public approaches,
  // just outside the swept course so they never cover the racing line.
  this.closure.name='Grand Prix road closures';
  this.closure.visible=false;
  this.root.add(this.closure);
  const warning:THREE.BufferGeometry[]=[],whiteStripes:THREE.BufferGeometry[]=[];
  const roadGates=[[-430,-907,9.5,0],[-430,-823,9.5,0],[-430,-782,9.5,0],[-430,-758,9.5,0],
   [-370,-837,9.5,0],[-370,-762,9.5,0],[-419,-890,9,Math.PI/2],[-362,-830,9,Math.PI/2],
   [-362,-770,9,Math.PI/2],[-547,-600,8,Math.PI/2],[-553,-594,8,0]];
  for(const [x,z,span,angle] of roadGates){
   for(const side of [-1,1])warning.push(box(.22,1,.38,side*span*.45,.71,0).rotateY(angle).translate(x,0,z));
   warning.push(box(span, .38,.24,0,.95,0).rotateY(angle).translate(x,0,z));
   for(let i=0;i<6;i++)whiteStripes.push(box(span/12,.34,.26,(i-2.5)*span/6,.95,0).rotateY(angle).translate(x,0,z));
  }
  addBatch(this.closure,warning,finish(0xe04331));
  addBatch(this.closure,whiteStripes,finish(0xffebda));

  const asphalt=new THREE.MeshStandardMaterial({color:0x39434e,emissive:0x526680,emissiveIntensity:.39,roughness:.88,side:THREE.DoubleSide});
  const concrete=new THREE.MeshStandardMaterial({color:0x93a2ad,roughness:.84});
  const metal=new THREE.MeshStandardMaterial({color:0x344d62,roughness:.72});
  const grandstandRoof=new THREE.MeshStandardMaterial({color:0x20343c,roughness:.68,metalness:.24});
  this.root.add(new THREE.Mesh(ribbon(points,width,ROAD_LEVEL),asphalt));
  this.root.add(new THREE.Mesh(ribbon(NORTH_F1_PIT_POINTS,NORTH_F1_PIT_WIDTH,PIT_LEVEL,0,false),asphalt));
  const apron=NORTH_F1_PIT_APRON;
  const apronMesh=new THREE.Mesh(new THREE.PlaneGeometry(apron.w,apron.d).rotateX(-Math.PI/2),asphalt);
  apronMesh.position.set(apron.x,PIT_LEVEL-.005,apron.z);this.root.add(apronMesh);
  const boundaryPaint=finish(0xc5d6dd);
  for(const side of [-1,1])this.root.add(new THREE.Mesh(ribbon(points,.16,ROAD_LEVEL+.013,side*(width/2-.35)),boundaryPaint));
  this.root.add(new THREE.Mesh(ribbon(NORTH_F1_PIT_POINTS,.12,PIT_LEVEL+.013,-3.25,false),boundaryPaint));
  // The garage-side edge opens over the apron. Continue the edge paint only
  // before and after the parking row so it cannot cut through its boxes.
  for(const segment of [NORTH_F1_PIT_POINTS.slice(0,4),NORTH_F1_PIT_POINTS.slice(4)]){
   this.root.add(new THREE.Mesh(ribbon(segment,.12,PIT_LEVEL+.013,3.25,false),boundaryPaint));
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
  for(const {x,z} of NORTH_F1_PIT_BOXES){
   white.push(box(2.1,.014,.10,x,PIT_LEVEL+.014,z-2));
   const y=PIT_LEVEL+.023,halfWidth=NORTH_F1_PIT_BOX_WIDTH/2,halfLength=NORTH_F1_PIT_BOX_LENGTH/2;
   for(const side of [-1,1])white.push(box(NORTH_F1_PIT_BOX_LENGTH,.014,.10,x,y,z+side*halfWidth));
   white.push(box(.12,.014,NORTH_F1_PIT_BOX_WIDTH,x+halfLength,y,z));
   red.push(box(.18,.014,.64,x-halfLength,y,z));
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
  const standSeats=[];
  for(const building of [...NORTH_F1_GRANDSTANDS,NORTH_F1_GARAGES]){
   const group=new THREE.Group();
   const yaw='yaw'in building&&typeof building.yaw==='number'?building.yaw:null;
   const angle=yaw??0;
   const rotated=Math.abs(Math.sin(angle))>.5;
   const w=rotated?building.d:building.w,d=rotated?building.w:building.d,h=building.h;
   group.name=building.name;group.position.set(building.x,0,building.z);group.rotation.y=angle;this.root.add(group);
   this.buildings.set(building.id,group);
   const lighting:THREE.BufferGeometry[]=[],stairs:THREE.BufferGeometry[]=[],frame:THREE.BufferGeometry[]=[],roof:THREE.BufferGeometry[]=[];
   if(yaw===null){
    stairs.push(box(w,h*.88,d,0,h*.44));
    roof.push(box(w+.8,.42,d+.8,0,h*.9));
    for(let team=0;team<NORTH_F1_PIT_BOXES.length;team+=2){
     const doors=NORTH_F1_PIT_BOXES.slice(team,team+2);
     for(const stall of doors){
      const x=stall.x-building.x;
      frame.push(box(w/20-.65,h*.38,.14,x,h*.24,-d/2-.08));
      lighting.push(box(w/20-.85,.16,.18,x,h*.46,-d/2-.12));
     }
    }
    lighting.push(box(w*.94,.2,.19,0,h*.72,-d/2-.12));
   }else{
    const rows=7,columns=Math.floor((w-3)/1.5),seats=[];
    for(let row=0;row<rows;row++){
     const y=.58+row*.56,z=d*.39-row*d*.112;
     stairs.push(box(w,.60,d*.125,0,y,z));
     lighting.push(box(w*.97,.068,.095,0,y+.36,z+d*.065));
    }
    for(let col=0;col<columns;col++)for(let row=0;row<rows;row++){
     const x=(col-(columns-1)/2)*1.5,z=d*.39-row*d*.112;
     seats.push({x:building.x+x*Math.cos(yaw)+z*Math.sin(yaw),y:.95+row*.56,z:building.z-x*Math.sin(yaw)+z*Math.cos(yaw),yaw});
    }
    standSeats.push(seats);
    const supports=Math.max(4,Math.floor(w/13));
    for(let i=0;i<supports;i++){
     const x=(i-(supports-1)/2)*w/supports;frame.push(box(.4,h-1,.4,x,(h-1)/2,-d*.42));
    }
    roof.push(box(w+1,.35,d*.62,0,h-.72,-d*.19));
    lighting.push(box(w,.22,.16,0,h-.96,d*.12));
   }
   addBatch(group,stairs,concrete);addBatch(group,frame,metal);addBatch(group,roof,grandstandRoof);addBatch(group,lighting,finish(0xb7eeff));
   const label=sign(building.name,18,9);
   (label.material as THREE.SpriteMaterial).depthTest=true;
   label.position.set(0,h+1.7,0);group.add(label);
  }
  // Distribute the same audience across all stands while respecting each footprint.
  for(let i=0;this.seats.length<NORTH_F1_CIRCUIT.capacity;i++){
   const band=standSeats.flatMap(seats=>seats[i]?[seats[i]]:[]);
   if(!band.length)break;
   this.seats.push(...band.slice(0,NORTH_F1_CIRCUIT.capacity-this.seats.length));
  }
  const bridgeParts:THREE.BufferGeometry[]=[];
  for(let i=1;i<NORTH_F1_AIRPORT_FOOTBRIDGE.length;i++){
   const a=NORTH_F1_AIRPORT_FOOTBRIDGE[i-1],b=NORTH_F1_AIRPORT_FOOTBRIDGE[i];
   const count=i===2?1:18;
   for(let step=0;step<count;step++){
    const t=(step+.5)/count,x=THREE.MathUtils.lerp(a.x,b.x,t),y=THREE.MathUtils.lerp(a.y,b.y,t);
    bridgeParts.push(box(Math.abs(b.x-a.x)/count+.06,.18,2.7,x,y-.9,a.z));
   }
   for(const side of [-1,1]){
    const beam=box(Math.hypot(b.x-a.x,b.y-a.y),.10,.1);
    beam.rotateZ(Math.atan2(b.y-a.y,b.x-a.x)).translate((a.x+b.x)/2,(a.y+b.y)/2+.2,a.z+side*1.4);
    bridgeParts.push(beam);
   }
  }
  addBatch(this.root,bridgeParts,concrete);
  const bodyParts=[box(1.36,.44,3.1,0,.39),box(.68,.38,3.7,0,.44),box(1.68,.08,.46,0,.27,1.7),box(1.58,.11,.22,0,.79,-1.64)];
  const wheels=[box(.7,.22,.88,0,.61,-.32),...[-1,1].flatMap(x=>[-1,1].map(z=>box(.36,.52,.61,x*.77,.30,z*1.17)))];
  const vehicleShape=(parts:THREE.BoxGeometry[])=>{const geometry=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());return geometry;};
  this.body=new THREE.InstancedMesh(vehicleShape(bodyParts),new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x556679,emissiveIntensity:.14}),20);
  this.dark=new THREE.InstancedMesh(vehicleShape(wheels),new THREE.MeshStandardMaterial({color:0x121920,roughness:.84}),20);
  this.crowd=new THREE.InstancedMesh(new THREE.BoxGeometry(.36,.66,.32),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.82}),NORTH_F1_CIRCUIT.capacity);
  const bus=vehicleShape([box(2.8,2.6,8.2,0,1.38),box(2.94,.45,8.24,0,.68),box(2.82,.50,8.25,0,2.05)]);
  this.shuttle=new THREE.InstancedMesh(bus,new THREE.MeshLambertMaterial({color:0x3e90b9,emissive:0x275065,emissiveIntensity:.28}),4);
  this.pitCrews=new THREE.InstancedMesh(new THREE.BoxGeometry(.32,.72,.29),new THREE.MeshLambertMaterial({color:0xffb748,emissive:0x915b21,emissiveIntensity:.24}),60);
  for(const batch of [this.body,this.dark,this.crowd,this.shuttle,this.pitCrews]){
   batch.count=0;batch.frustumCulled=false;batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.root.add(batch);
  }
 }

 sync(data:NorthF1View|null|undefined){
  this.data=data||null;
  this.legacyPitBoxes.clear();
  data?.teams.forEach((team,index)=>team.drivers.forEach((id,slot)=>this.legacyPitBoxes.set(id,index*2+slot)));
 }
 trackIsClosed(gameNow:number){
  const race=this.data?.activeRace;
  return northF1ClosureActive(this.data?.trackClosure??race,gameNow);
 }
 update(gameNow:number,camera:THREE.Camera){
  this.closure.visible=this.trackIsClosed(gameNow);
  const cx=camera.position.x+655,cz=camera.position.z+770;
  const near=cx*cx+cz*cz<850*850;
  const active=this.data?.activeRace;
  let count=0,crew=0;
  this.tmp.scale.setScalar(1);
  if(near&&active&&gameNow<active.endsAt){
   for(const car of active.cars){
    const sample=sampleF1Motion(car.motion,gameNow);
    if(!sample)continue;
    const pitBox=car.pitBox??this.legacyPitBoxes.get(car.driverId)??0;
    const pose=northF1RacePose(sample,car.lane,pitBox,car.pitBox==null);
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
  const audience=near?Math.min(NORTH_F1_CIRCUIT.capacity,this.seats.length,Math.max(0,this.data?.trackCrowd?.total||0)):0;
  if(audience===this.crowdCount)return;
  this.crowdCount=audience;this.crowd.count=audience;this.tmp.rotation.set(0,0,0);
  for(let i=0;i<audience;i++){
   const seat=this.seats[i];
   this.tmp.position.set(seat.x,seat.y,seat.z);this.tmp.rotation.y=seat.yaw;
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
