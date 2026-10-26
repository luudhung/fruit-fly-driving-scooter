import {BUILDINGS,ISLAND,WATER,BRIDGES,contains,onIsland,atSea,WORLD_HALF} from '../worker/city-map.mjs';
import {mansionBoxes,mansionFloors,type MansionBox} from './mansion-layout.ts';
export const PLAYER_EYE=1.7;
const RADIUS=.32,HEIGHT=1.78,STEP=.29,EPS=.0001;
export type PlayerInput={forward:number;strafe:number;yaw:number;sprint:number;ascend:boolean;descend:boolean};
const citySolids:MansionBox[]=BUILDINGS.filter(b=>b.kind!=='mansion').map(b=>({...b,y:b.h/2,color:0,solid:true}));
const solids=[...citySolids,...mansionBoxes.filter(b=>b.solid)];
// Local collision queries avoid scanning every tower and room on each physics substep.
const cellSize=24,bins=new Map<string,MansionBox[]>(),empty:MansionBox[]=[];
for(const b of solids)for(let x=Math.floor((b.x-b.w/2-RADIUS)/cellSize);x<=Math.floor((b.x+b.w/2+RADIUS)/cellSize);x++)for(let z=Math.floor((b.z-b.d/2-RADIUS)/cellSize);z<=Math.floor((b.z+b.d/2+RADIUS)/cellSize);z++){
 const key=`${x},${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key)!.push(b);
}
const nearby=(x:number,z:number)=>bins.get(`${Math.floor(x/cellSize)},${Math.floor(z/cellSize)}`)||empty;
function terrain(x:number,z:number){
 if(onIsland({x,z}))return ((x-ISLAND.x)/(ISLAND.rx-18))**2+((z-ISLAND.z)/(ISLAND.rz-17))**2<1?.67:.55;
 if(atSea({x,z})||WATER.some(w=>contains(w,{x,z}))&&!BRIDGES.some(b=>contains(b,{x,z})))return -.65;
 return .2;
}
function support(x:number,z:number,max:number){
 let y=terrain(x,z);
 for(const f of mansionFloors)if(f.y<=max+EPS&&Math.abs(x-f.x)<=f.w/2+RADIUS-EPS&&Math.abs(z-f.z)<=f.d/2+RADIUS-EPS)y=Math.max(y,f.y);
 for(const b of nearby(x,z)){const top=b.y+b.h/2;if(top<=max+EPS&&Math.abs(x-b.x)<=b.w/2+RADIUS-EPS&&Math.abs(z-b.z)<=b.d/2+RADIUS-EPS)y=Math.max(y,top);}
 return y;
}
function collides(x:number,z:number,feet:number){
 return nearby(x,z).some(b=>Math.abs(x-b.x)<b.w/2+RADIUS&&Math.abs(z-b.z)<b.d/2+RADIUS&&feet<b.y+b.h/2-EPS&&feet+HEIGHT>b.y-b.h/2+EPS);
}
/** First-person walking, gravity, step-up collision and Minecraft-style creative flight. */
export class PlayerController{
 x=110;y=2.55;z=819;flying=false;grounded=false;verticalVelocity=0;
 private lastJump=-Infinity;private jumpHeld=false;
 get feet(){return this.y-PLAYER_EYE;}
 get swimming(){return terrain(this.x,this.z)<0&&this.feet<.1&&!this.flying;}
 teleport(x:number,y:number,z:number,flying=false){this.x=x;this.y=y;this.z=z;this.flying=flying;this.grounded=false;this.verticalVelocity=0;this.lastJump=-Infinity;this.jumpHeld=false;}
 jumpDown(now:number,repeat=false){
  if(repeat||this.jumpHeld)return;this.jumpHeld=true;
  if(now-this.lastJump<=280){this.flying=!this.flying;this.verticalVelocity=0;this.grounded=false;this.lastJump=-Infinity;}
  else{this.lastJump=now;if(!this.flying&&this.grounded){this.verticalVelocity=7.15;this.grounded=false;}}
 }
 jumpUp(){this.jumpHeld=false;}
 resetInput(){this.jumpHeld=false;this.lastJump=-Infinity;}
 update(dt:number,input:PlayerInput){
  const count=Math.max(1,Math.ceil(Math.min(.1,dt)/.008)),step=Math.min(.1,dt)/count;
  for(let i=0;i<count;i++)this.advance(step,input);
 }
 private advance(dt:number,input:PlayerInput){
  const length=Math.max(1,Math.hypot(input.forward,input.strafe)),speed=(this.flying?22:this.swimming?2.5:4.4)*input.sprint;
  const dx=(Math.sin(input.yaw)*input.forward-Math.cos(input.yaw)*input.strafe)/length*speed*dt;
  const dz=(Math.cos(input.yaw)*input.forward+Math.sin(input.yaw)*input.strafe)/length*speed*dt;
  const attempt=(x:number,z:number)=>{
   const feet=this.feet,ground=support(x,z,feet+(this.grounded&&!this.flying?STEP:0));
   const candidate=this.grounded&&!this.flying?Math.max(feet,ground):feet;
   if(!collides(x,z,candidate)){this.x=x;this.z=z;this.y=candidate+PLAYER_EYE;}
  };
  attempt(Math.max(-WORLD_HALF+1,Math.min(WORLD_HALF-1,this.x+dx)),this.z);
  attempt(this.x,Math.max(-WORLD_HALF+1,Math.min(WORLD_HALF-1,this.z+dz)));
  if(this.flying){
   const dy=((input.ascend?1:0)-(input.descend?1:0))*speed*.7*dt;
   if(!collides(this.x,this.z,this.feet+dy))this.y=Math.min(520,this.y+dy);
   const ground=support(this.x,this.z,this.feet);this.y=Math.max(ground+PLAYER_EYE,this.y);return;
  }
  const previous=this.feet;this.verticalVelocity=Math.max(-45,this.verticalVelocity-20*dt);
  const next=previous+this.verticalVelocity*dt,ground=support(this.x,this.z,previous);
  if(next<=ground&&this.verticalVelocity<=0){this.y=ground+PLAYER_EYE;this.verticalVelocity=0;this.grounded=true;}
  else if(!collides(this.x,this.z,next)){this.y=next+PLAYER_EYE;this.grounded=false;}
  else{this.verticalVelocity=0;}
 }
}
