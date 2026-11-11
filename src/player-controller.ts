import {BUILDINGS,ISLAND,WATER,BRIDGES,contains,onIsland,atSea,onWaterCrossing,WORLD_HALF,UNDERPASSES,METRO_LINES,metroStationGeometry,urbanGeometryRevision,effectiveBuildingHeight,URBAN_FLOODS} from '../worker/city-map.mjs';
import {mansionBoxes,mansionFloors,type MansionBox} from './mansion-layout.ts';
import {FlightDoubleTap} from './flight-double-tap.ts';
import {metroInterchangePaths} from './metro-interchanges.ts';
export const PLAYER_EYE=1.7;
const RADIUS=.32,HEIGHT=1.78,STEP=.29,EPS=.0001;
export type PlayerInput={forward:number;strafe:number;yaw:number;sprint:number;ascend:boolean;descend:boolean};
// Rebuild only after an authoritative geometry revision (collapse, clearing, new construction).
const cellSize=24,bins=new Map<string,MansionBox[]>(),empty:MansionBox[]=[];
let collisionRevision=-1;
function refreshUrbanCollision(){
 if(collisionRevision===urbanGeometryRevision)return;
 collisionRevision=urbanGeometryRevision;bins.clear();
 const citySolids:MansionBox[]=BUILDINGS.filter(b=>b.kind!=='mansion'&&effectiveBuildingHeight(b)>0).map(b=>({...b,h:effectiveBuildingHeight(b),y:effectiveBuildingHeight(b)/2,color:0,solid:true}));
 const solids=[...citySolids,...mansionBoxes.filter(b=>b.solid)];
 for(const b of solids)for(let x=Math.floor((b.x-b.w/2-RADIUS)/cellSize);x<=Math.floor((b.x+b.w/2+RADIUS)/cellSize);x++)for(let z=Math.floor((b.z-b.d/2-RADIUS)/cellSize);z<=Math.floor((b.z+b.d/2+RADIUS)/cellSize);z++){
  const key=`${x},${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key)!.push(b);
 }
}
refreshUrbanCollision();
const nearby=(x:number,z:number)=>bins.get(`${Math.floor(x/cellSize)},${Math.floor(z/cellSize)}`)||empty;
function terrain(x:number,z:number){
 const tunnel=UNDERPASSES.find(t=>Math.abs(x-t.x)<t.w/2+2.6&&Math.abs(z-t.z)<t.halfLength);
 if(tunnel){const d=Math.abs(z-tunnel.z),fraction=d<=tunnel.coveredHalf?1:(tunnel.halfLength-d)/(tunnel.halfLength-tunnel.coveredHalf);return .2-tunnel.depth*fraction;}

 const point={x,z};
 if(onWaterCrossing(point))return .2;
 if(URBAN_FLOODS.some(f=>contains(f,point)))return -.15;
 if(onIsland(point))return ((x-ISLAND.x)/(ISLAND.rx-18))**2+((z-ISLAND.z)/(ISLAND.rz-17))**2<1?.67:.55;
 if(atSea(point)||WATER.some(w=>contains(w,point)))return -.65;
 return .2;
}
type SurfacePoint={x:number;y:number;z:number};
const metroStations=METRO_LINES.flatMap(line=>line.points.flatMap((_,i)=>[metroStationGeometry(line,i,1),metroStationGeometry(line,i,-1)]));
const metroPaths=[...metroStations.map(g=>({points:g.sharedStairs,width:.45})),...metroStations.filter(g=>g.crossover.length>1).map(g=>({points:g.crossover,width:.8})),...metroInterchangePaths().map(points=>({points,width:.8}))];
const metroSurfaces=metroPaths.flatMap(({points,width})=>points.slice(1).map((b,i)=>({a:points[i],b,width})));
const metroLifts=metroSurfaces.filter(s=>Math.hypot(s.a.x-s.b.x,s.a.z-s.b.z)<.05&&Math.abs(s.a.y-s.b.y)>.1);
function metroIndex<T>(entries:readonly T[],bounds:(entry:T)=>{x:number;z:number;w:number;d:number}){
 const index=new Map<string,T[]>();for(const entry of entries){const b=bounds(entry);for(let x=Math.floor((b.x-b.w/2-RADIUS)/cellSize);x<=Math.floor((b.x+b.w/2+RADIUS)/cellSize);x++)for(let z=Math.floor((b.z-b.d/2-RADIUS)/cellSize);z<=Math.floor((b.z+b.d/2+RADIUS)/cellSize);z++){const key=`${x},${z}`;if(!index.has(key))index.set(key,[]);index.get(key)!.push(entry);}}return index;
}
const metroSurfaceBins=metroIndex(metroSurfaces,s=>({x:(s.a.x+s.b.x)/2,z:(s.a.z+s.b.z)/2,w:Math.abs(s.a.x-s.b.x)+s.width*2,d:Math.abs(s.a.z-s.b.z)+s.width*2}));
const metroPlatformBins=metroIndex(metroStations,g=>({x:g.platform.x,z:g.platform.z,w:g.axis==='x'?g.platformLength:3.2,d:g.axis==='x'?3.2:g.platformLength}));
const metroLiftBins=metroIndex(metroLifts,s=>({x:s.a.x,z:s.a.z,w:1.6,d:1.6}));
const metroCell=(x:number,z:number)=>`${Math.floor(x/cellSize)},${Math.floor(z/cellSize)}`;
let rooftopPads:Array<{x:number;z:number;y:number;radius?:number}>=[];
export function setPlayerHelipads(pads:typeof rooftopPads){rooftopPads=Array.isArray(pads)?pads:[];}
function surfaceY(x:number,z:number,a:SurfacePoint,b:SurfacePoint,width:number,max:number){
 const dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;if(len<.001)return -Infinity;
 const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/len)),height=a.y+(b.y-a.y)*t-.9;
 return height<=max+EPS&&Math.hypot(x-a.x-dx*t,z-a.z-dz*t)<=width+RADIUS?height:-Infinity;
}
function support(x:number,z:number,max:number){
 let y=terrain(x,z);
 for(const bridge of BRIDGES)if(contains(bridge,{x,z})){
  const top=Math.abs(Math.abs(z-bridge.z)-6)<1.25?.34:.2;if(top<=max+EPS)y=Math.max(y,top);
 }

 for(const s of metroSurfaceBins.get(metroCell(x,z))||[])y=Math.max(y,surfaceY(x,z,s.a,s.b,s.width,max));
 for(const g of metroPlatformBins.get(metroCell(x,z))||[]){const top=g.platform.y-.9;if(top<=max+EPS&&Math.abs(x-g.platform.x)<(g.axis==='x'?g.platformLength/2:1.6)&&Math.abs(z-g.platform.z)<(g.axis==='x'?1.6:g.platformLength/2))y=Math.max(y,top);}
 for(const pad of rooftopPads)if(pad.y<=max+EPS&&Math.hypot(x-pad.x,z-pad.z)<(pad.radius||6))y=Math.max(y,pad.y);
 for(const f of mansionFloors)if(f.y<=max+EPS&&Math.abs(x-f.x)<=f.w/2+RADIUS-EPS&&Math.abs(z-f.z)<=f.d/2+RADIUS-EPS)y=Math.max(y,f.y);
 for(const b of nearby(x,z)){const top=b.y+b.h/2;if(top<=max+EPS&&Math.abs(x-b.x)<=b.w/2+RADIUS-EPS&&Math.abs(z-b.z)<=b.d/2+RADIUS-EPS)y=Math.max(y,top);}
 return y;
}
function collides(x:number,z:number,feet:number){
 if(UNDERPASSES.some(t=>Math.abs(x-t.x)<t.w/2+2.6&&Math.abs(z-t.z)<t.coveredHalf&&feet<.2-EPS&&feet+HEIGHT>-.5+EPS))return true;
 return nearby(x,z).some(b=>Math.abs(x-b.x)<b.w/2+RADIUS&&Math.abs(z-b.z)<b.d/2+RADIUS&&feet<b.y+b.h/2-EPS&&feet+HEIGHT>b.y-b.h/2+EPS);
}
/** First-person walking, gravity, step-up collision and Minecraft-style creative flight. */
export class PlayerController{
 x=110;y=2.55;z=819;flying=false;grounded=false;verticalVelocity=0;
 private readonly jumpTap=new FlightDoubleTap();
 private metroLift:{x:number;z:number;target:number}|null=null;
 private liftCooldown=0;
 get feet(){return this.y-PLAYER_EYE;}
 get swimming(){const p={x:this.x,z:this.z};return !this.flying&&this.feet<.1&&terrain(this.x,this.z)<0&&(atSea(p)||WATER.some(w=>contains(w,p))||URBAN_FLOODS.some(f=>contains(f,p)))&&!onWaterCrossing(p);}
 teleport(x:number,y:number,z:number,flying=false){this.x=x;this.y=y;this.z=z;this.flying=flying;this.grounded=false;this.verticalVelocity=0;this.jumpTap.reset();this.metroLift=null;this.liftCooldown=0;}
 jumpDown(now:number,repeat=false){
  const tap=this.jumpTap.down(now,repeat);if(tap==='ignored')return;
  if(tap==='double'){this.flying=!this.flying;this.verticalVelocity=0;this.grounded=false;}
  else if(!this.flying&&this.grounded){this.verticalVelocity=7.15;this.grounded=false;}
 }
 jumpUp(now?:number){this.jumpTap.up(now);}
 resetInput(){this.jumpTap.reset();}
 update(dt:number,input:PlayerInput){
  refreshUrbanCollision();
  const count=Math.max(1,Math.ceil(Math.min(.1,dt)/.008)),step=Math.min(.1,dt)/count;
  for(let i=0;i<count;i++)this.advance(step,input);
 }
 private advance(dt:number,input:PlayerInput){
  this.liftCooldown=Math.max(0,this.liftCooldown-dt);
  if(this.flying)this.metroLift=null;
  if(!this.flying&&!this.metroLift&&!this.liftCooldown&&(input.ascend||input.descend)){
   const nearbyLifts=metroLiftBins.get(metroCell(this.x,this.z))||[];
   for(const lift of nearbyLifts){
    const distance=Math.hypot(this.x-lift.a.x,this.z-lift.a.z);if(distance>.62)continue;
    // Lift doors share platform centers. Walking to or away from the platform
    // must not silently start a trip; the existing up/down controls select it.
    const levels=[...new Set(nearbyLifts.filter(s=>Math.hypot(s.a.x-lift.a.x,s.a.z-lift.a.z)<.05).flatMap(s=>[s.a.y-.9,s.b.y-.9]))].sort((a,b)=>a-b);
    if(!levels.some(y=>Math.abs(this.feet-y)<.25))continue;
    const above=levels.find(y=>y>this.feet+.25),below=[...levels].reverse().find(y=>y<this.feet-.25);
    const target=input.descend?(below??above):(above??below);
    if(target!==undefined){this.metroLift={x:lift.a.x,z:lift.a.z,target};break;}
   }
  }
  if(this.metroLift){
   const lift=this.metroLift,delta=lift.target-this.feet,step=Math.sign(delta)*Math.min(Math.abs(delta),dt*3.2);
   this.x=lift.x;this.z=lift.z;this.y+=step;this.verticalVelocity=0;this.grounded=true;
   if(Math.abs(delta)<.015||Math.abs(step)>=Math.abs(delta)){this.y=lift.target+PLAYER_EYE;this.metroLift=null;this.liftCooldown=1.2;}return;
  }
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
