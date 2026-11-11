import * as THREE from 'three';
import {ROADS,BRIDGES,UNDERPASSES,BUILDINGS,WORLD_HALF,contains,blocked,roadTravelY,effectiveBuildingHeight,urbanGeometryRevision} from '../worker/city-map.mjs';
import {PLAYER_EYE} from './player-controller.ts';
import {streetCollidersNear} from '../worker/street-furniture.mjs';

export const CAR_HALF_WIDTH=.93,CAR_HALF_LENGTH=2.1;
/** East-facing curb space on the main-city approach, before the west-bank underpass. */
export const PLAYER_CAR_PARKING=Object.freeze({x:342,z:3.25,heading:Math.PI/2,ground:.2});
export type CarInput={throttle:number;steer:number;brake?:boolean};
export type CarWorld={clear:(x:number,z:number,heading:number,ground:number)=>boolean;ground:(x:number,z:number,previous:number)=>number|null};
const footprint=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,0],[0,1],[1,-1],[1,0],[1,1]];
const size=24,solids=new Map<string,typeof BUILDINGS>();let revision=-1;
function refreshSolids(){
 if(revision===urbanGeometryRevision)return;revision=urbanGeometryRevision;solids.clear();
 for(const b of BUILDINGS)if(effectiveBuildingHeight(b)>0)for(let x=Math.floor((b.x-b.w/2-3)/size);x<=Math.floor((b.x+b.w/2+3)/size);x++)for(let z=Math.floor((b.z-b.d/2-3)/size);z<=Math.floor((b.z+b.d/2+3)/size);z++){
  const key=`${x},${z}`;if(!solids.has(key))solids.set(key,[]);solids.get(key)!.push(b);
 }
}
/** Oriented rectangle against city solids; all corners must also stay on dry pavement. */
export function cityCarClear(x:number,z:number,heading:number,ground=.2){
 if(!sceneryClear(x,z,heading,ground))return false;
 const sin=Math.sin(heading),cos=Math.cos(heading);
 return footprint.every(([a,b])=>pavedAtLevel({x:x+a*CAR_HALF_WIDTH*cos+b*CAR_HALF_LENGTH*sin,z:z-a*CAR_HALF_WIDTH*sin+b*CAR_HALF_LENGTH*cos},ground,.02));
}
function sceneryClear(x:number,z:number,heading:number,ground:number){
 refreshSolids();const sin=Math.sin(heading),cos=Math.cos(heading),w=CAR_HALF_WIDTH,l=CAR_HALF_LENGTH;
 if(Math.abs(x)>WORLD_HALF-4-l||Math.abs(z)>WORLD_HALF-4-l)return false;
 for(const [a,b]of footprint){const p={x:x+a*w*cos+b*l*sin,z:z-a*w*sin+b*l*cos};if(blocked(p))return false;}
 return !(solids.get(`${Math.floor(x/size)},${Math.floor(z/size)}`)||[]).some(b=>{
  const dx=b.x-x,dz=b.z-z,bw=b.w/2+.12,bl=b.d/2+.12;
  return Math.abs(dx)<bw+w*Math.abs(cos)+l*Math.abs(sin)&&Math.abs(dz)<bl+w*Math.abs(sin)+l*Math.abs(cos)&&Math.abs(dx*cos-dz*sin)<w+bw*Math.abs(cos)+bl*Math.abs(sin)&&Math.abs(dx*sin+dz*cos)<l+bw*Math.abs(sin)+bl*Math.abs(cos);
 });
}
/** Choose the connected deck or ramp, retaining the current level at grade-separated crossings. */
export function cityCarGround(x:number,z:number,previous:number){
 const p={x,z},levels=[roadTravelY(p,'z')-.9];
 if(BRIDGES.some(b=>contains(b,p)))levels.push(.2);
 const ground=levels.reduce((a,b)=>Math.abs(b-previous)<Math.abs(a-previous)?b:a);
 return Math.abs(ground-previous)<=.24?ground:null;
}
function pavedAtLevel(p:{x:number;z:number},ground:number,margin=0){
 return ROADS.some(r=>contains(r,p,margin)&&!(ground<-.5&&r.w>r.d&&BRIDGES.some(b=>contains(b,p))));
}
const cityWorld:CarWorld={clear:cityCarClear,ground:cityCarGround};
/** Player wheels may climb low pavement, while buildings, water and street furniture stay solid. */
export function playerCarClear(x:number,z:number,heading:number,ground=.2){
 if(!sceneryClear(x,z,heading,ground))return false;
 const sin=Math.sin(heading),cos=Math.cos(heading),w=CAR_HALF_WIDTH,l=CAR_HALF_LENGTH;
 for(const b of streetCollidersNear(x,z,Math.hypot(w,l))){
  if(b.maxY<=ground+.02||b.minY>=ground+1.8)continue;
  const dx=b.x-x,dz=b.z-z;
  if(b.radius!==undefined){
   const lateral=Math.max(0,Math.abs(dx*cos-dz*sin)-w),forward=Math.max(0,Math.abs(dx*sin+dz*cos)-l);
   if(lateral*lateral+forward*forward<(b.radius+.015)**2)return false;
  }else{
   const bw=b.w!/2+.015,bl=b.d!/2+.015;
   if(Math.abs(dx)<bw+w*Math.abs(cos)+l*Math.abs(sin)&&Math.abs(dz)<bl+w*Math.abs(sin)+l*Math.abs(cos)&&Math.abs(dx*cos-dz*sin)<w+bw*Math.abs(cos)+bl*Math.abs(sin)&&Math.abs(dx*sin+dz*cos)<l+bw*Math.abs(sin)+bl*Math.abs(cos))return false;
  }
 }
 return true;
}
export function playerCarGround(x:number,z:number,previous:number){
 const p={x,z},bridge=BRIDGES.find(b=>contains(b,p));
 let floor=cityCarGround(x,z,previous);
 if(floor===null){
  const tunnel=UNDERPASSES.find(t=>Math.abs(x-t.x)<t.w/2+2.6&&Math.abs(z-t.z)<t.halfLength);
  if(tunnel&&previous<-.5){const d=Math.abs(z-tunnel.z);floor=.2-tunnel.depth*(d<=tunnel.coveredHalf?1:(tunnel.halfLength-d)/(tunnel.halfLength-tunnel.coveredHalf));}
  else floor=.2;
 }
 if(floor>-.1){
  if(bridge&&Math.abs(z-bridge.z)>4.45)floor=Math.abs(Math.abs(z-bridge.z)-4.65)<.15?.66:.40;
  else if(!ROADS.some(r=>contains(r,p))&&ROADS.some(r=>contains(r,p,3)))floor=.30;
 }
 return Math.max(previous-.08,Math.min(previous+.08,floor));
}
export const PLAYER_CAR_WORLD:CarWorld={
 clear:playerCarClear,
 ground:playerCarGround,
};
function approach(value:number,target:number,step:number){return value<target?Math.min(target,value+step):Math.max(target,value-step);}

/** Local observer vehicle: independent of the city's resident and traffic simulation. */
export class PlayerCar{
 x:number=PLAYER_CAR_PARKING.x;z:number=PLAYER_CAR_PARKING.z;heading:number=PLAYER_CAR_PARKING.heading;ground:number=PLAYER_CAR_PARKING.ground;
 speed=0;steering=0;pitch=0;active=false;
 private readonly world:CarWorld;
 constructor(world:CarWorld=cityWorld){this.world=world;}
 // A fresh page constructs the car by the bridge; re-entry keeps its parked pose.
 enter(){this.speed=this.steering=0;this.active=true;}
 stop(){this.speed=this.steering=0;this.active=false;}
 update(dt:number,input:CarInput){
  if(!this.active||!Number.isFinite(dt)||dt<=0)return;
  const duration=Math.min(.1,dt),steps=Math.ceil(duration/.008);
  for(let i=0;i<steps;i++)this.advance(duration/steps,input);
  // Suspension is visual: sample it once per rendered frame, while collision and
  // wheel height still use every swept substep. Exponential damping avoids a
  // sudden seat/camera tilt at curb edges without changing physical clearance.
  const sin=Math.sin(this.heading),cos=Math.cos(this.heading);
  const ahead=this.world.ground(this.x+sin*.7,this.z+cos*.7,this.ground),behind=this.world.ground(this.x-sin*.7,this.z-cos*.7,this.ground);
  const pitch=ahead===null||behind===null?0:Math.atan2(ahead-behind,1.4);
  this.pitch+=(pitch-this.pitch)*-Math.expm1(-12*duration);
 }
 private advance(dt:number,input:CarInput){
  const throttle=Math.max(-1,Math.min(1,input.throttle||0)),steer=Math.max(-1,Math.min(1,input.steer||0));
  this.steering=approach(this.steering,steer,dt*4.5);
  if(input.brake)this.speed=approach(this.speed,0,dt*12);
  else if(throttle&&this.speed*throttle<-.1)this.speed=approach(this.speed,0,dt*9);
  else if(throttle)this.speed=Math.max(-5,Math.min(15,this.speed+throttle*dt*(throttle>0?4.1:3)));
  else this.speed=approach(this.speed,0,dt*(.65+Math.abs(this.speed)*.065));
  // Positive steering is right, consistent with D / the right mobile arrow.
  const turn=-this.speed/2.7*Math.tan(this.steering*.48)*dt/(1+Math.abs(this.speed)*.055);
  let heading=this.heading+turn,x=this.x+Math.sin(heading)*this.speed*dt,z=this.z+Math.cos(heading)*this.speed*dt,ground=this.world.ground(x,z,this.ground);
  if(ground===null||!this.world.clear(x,z,heading,ground)){
   // Keep the free component of motion at contact; a rejected turn must not lock reverse escape.
   const travel=Math.abs(this.speed*dt),dx=Math.sin(this.heading)*this.speed*dt,dz=Math.cos(this.heading)*this.speed*dt;
   const candidates=[{x:this.x+dx,z:this.z+dz},{x:this.x+dx,z:this.z},{x:this.x,z:this.z+dz}];
   let free:{x:number;z:number;ground:number}|undefined;
   for(const p of candidates){
    if(Math.hypot(p.x-this.x,p.z-this.z)<=1e-7)continue;
    const candidateGround=this.world.ground(p.x,p.z,this.ground);
    if(candidateGround!==null&&this.world.clear(p.x,p.z,this.heading,candidateGround)){free={...p,ground:candidateGround};break;}
   }
   if(!free){this.speed=0;return;}
   this.speed*=Math.min(1,Math.hypot(free.x-this.x,free.z-this.z)/Math.max(1e-7,travel));
   x=free.x;z=free.z;heading=this.heading;ground=free.ground;
  }
  this.heading=heading;this.x=x;this.z=z;this.ground=ground;
 }
 driverPosition(){
  const side=.38,forward=-.30*Math.cos(this.pitch)-1.45*Math.sin(this.pitch);
  return {x:this.x+side*Math.cos(this.heading)+forward*Math.sin(this.heading),y:this.ground+1.45*Math.cos(this.pitch)-.30*Math.sin(this.pitch),z:this.z-side*Math.sin(this.heading)+forward*Math.cos(this.heading)};
 }
 exitPosition(){return carExitPosition(this.x,this.z,this.ground);}
}

/** Find the nearest dry sidewalk beside the current road, at the car's own level. */
export function carExitPosition(x:number,z:number,ground:number){
 const candidates:Array<{x:number;z:number}>=[];
 for(const b of BRIDGES)if(contains(b,{x,z})&&ground>-.1)for(const side of [-1,1])candidates.push({x,z:b.z+side*6.1});
 for(const r of ROADS){
  if(Math.abs(x-r.x)>r.w/2+12||Math.abs(z-r.z)>r.d/2+12)continue;
  if(r.w>r.d)for(const side of [-1,1])candidates.push({x:Math.max(r.x-r.w/2+1,Math.min(r.x+r.w/2-1,x)),z:r.z+side*(r.d/2+1.1)});
  else for(const side of [-1,1])candidates.push({x:r.x+side*(r.w/2+1.1),z:Math.max(r.z-r.d/2+1,Math.min(r.z+r.d/2-1,z))});
 }
 candidates.sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z));
 for(const p of candidates){
  if(blocked(p))continue;
  let floor=.2;
  const tunnel=UNDERPASSES.find(t=>Math.abs(p.x-t.x)<t.w/2+2.6&&Math.abs(p.z-t.z)<t.halfLength);
  if(tunnel&&ground<-.1){const d=Math.abs(p.z-tunnel.z);floor=.2-tunnel.depth*(d<=tunnel.coveredHalf?1:(tunnel.halfLength-d)/(tunnel.halfLength-tunnel.coveredHalf));}
  if(Math.abs(floor-ground)>.55||pavedAtLevel(p,floor,.35))continue;
  let safe=true;const n=Math.ceil(Math.hypot(p.x-x,p.z-z)/.3);
  for(let i=1;i<=n;i++)if(blocked({x:x+(p.x-x)*i/n,z:z+(p.z-z)*i/n})){safe=false;break;}
  if(safe)return {...p,y:floor+PLAYER_EYE};
 }
 return null;
}

type CarBox=[number,number,number,number,number,number];
/** Open-top cabin with low doors and a small, low steering wheel. */
export class PlayerCarVisual{
 readonly root=new THREE.Group();private readonly wheel=new THREE.Group();
 constructor(scene:THREE.Scene){
  const boxes=(color:number,entries:CarBox[],metalness=0)=>{
   const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color,roughness:.65,metalness}),entries.length),dummy=new THREE.Object3D();
   entries.forEach(([x,y,z,w,h,d],i)=>{dummy.position.set(x,y,z);dummy.scale.set(w,h,d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});this.root.add(mesh);
  };
  boxes(0x225a58,[[0,.49,0,1.78,.5,4.15],[0,.77,1.4,1.78,.10,1.35],[-.87,.78,-.1,.065,.26,2.1],[.87,.78,-.1,.065,.26,2.1]],.35);
  boxes(0x192225,[[0,.85,.70,1.68,.12,.32],[0,.71,-1.15,1.55,.45,.7],[-.41,.89,-.54,.58,.6,.3],[.41,.89,-.54,.58,.6,.3],[0,.70,-.15,.2,.26,.8],[-.94,.3,-1.3,.18,.6,.65],[.94,.3,-1.3,.18,.6,.65],[-.94,.3,1.3,.18,.6,.65],[.94,.3,1.3,.18,.6,.65]]);
  boxes(0x9ae4c8,[[.38,.92,.535,.28,.045,.012],[-.25,.915,.535,.24,.045,.012]]);
  boxes(0xe8e3c5,[[-.65,.64,2.085,.37,.16,.025],[.65,.64,2.085,.37,.16,.025]]);
  boxes(0xc95143,[[-.65,.64,-2.085,.32,.16,.025],[.65,.64,-2.085,.32,.16,.025]]);
  this.wheel.position.set(.38,.98,.40);this.wheel.rotation.x=-.35;
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.12,.014,6,20),new THREE.MeshStandardMaterial({color:0x111719,roughness:.8}));
  this.wheel.add(ring);this.root.add(this.wheel);this.root.name='viewer-personal-car';scene.add(this.root);
 }
 sync(car:PlayerCar){this.root.position.set(car.x,car.ground,car.z);this.root.rotation.set(-car.pitch,car.heading,0,'YXZ');this.wheel.rotation.z=car.steering*.65;}
}
