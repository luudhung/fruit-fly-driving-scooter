import {signalBarrier} from '../worker/traffic.mjs';
export type MotionPoint={x:number;y?:number;z:number};
export type MotionPlan={at:number;speed:number;mode:string;points:MotionPoint[];blocked?:boolean;signalPermit?:boolean};
/** Client-only locomotion. Never changes server state, money, needs, jobs or neural checkpoints. */
export class CityMotion{
 x=0;y=1.1;z=0;
 private plan:MotionPlan|null=null;private index=0;private remaining=0;
 accept(position:MotionPoint,plan:MotionPlan){
  if(!Number.isFinite(plan.at)||!Number.isFinite(position.x)||!Number.isFinite(position.z)||this.plan&&plan.at<=this.plan.at)return;
  plan={...plan,speed:Number.isFinite(plan.speed)?Math.max(0,Math.min(40,plan.speed)):0,points:plan.points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)).slice(0,9)};
  const path=[position,...plan.points];let closest=Infinity,segment=0;
  if(this.plan)for(let i=0;i<path.length-1;i++){
   const a=path[i],b=path[i+1],dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;
   const t=len?Math.max(0,Math.min(1,((this.x-a.x)*dx+(this.z-a.z)*dz)/len)):0;
   const distance=Math.hypot(this.x-a.x-dx*t,this.z-a.z-dz*t);
   if(distance<closest){closest=distance;segment=i;}
  }
  if(!this.plan||closest>(plan.mode==='car'?4:2)){
   this.x=position.x;this.y=position.y??1.1;this.z=position.z;segment=0;
  }
  this.plan={...plan,points:plan.points.slice(segment)};this.index=0;this.remaining=8;
 }
 get targetX(){return this.plan?.points[this.index]?.x??this.x;}
 get targetZ(){return this.plan?.points[this.index]?.z??this.z;}
 advance(dt:number,gameSeconds:number,timeScale=120,headway?:(from:{x:number;z:number},to:{x:number;z:number})=>number){
  const plan=this.plan;if(!plan||plan.blocked||this.remaining<=0)return;
  dt=Math.min(.1,Math.max(0,dt),this.remaining);this.remaining-=dt;
  let distance=Math.max(0,plan.speed)*dt;
  for(let hops=0;distance>1e-5&&this.index<plan.points.length&&hops<12;hops++){
   const target=plan.points[this.index],dx=target.x-this.x,dz=target.z-this.z,len=Math.hypot(dx,dz);
   if(len<.01){this.y=target.y??this.y;this.index++;continue;}
   let step=Math.min(len,distance);const ux=dx/len,uz=dz/len;
   if(!plan.signalPermit&&['car','scooter'].includes(plan.mode)){
    const barrier=signalBarrier(this,{x:this.x+ux*step,z:this.z+uz*step},gameSeconds/timeScale);
    if(barrier)step=Math.min(step,barrier.distance);
   }
   if(headway)step=Math.min(step,headway(this,{x:this.x+ux*step,z:this.z+uz*step}));
   this.x+=ux*step;this.z+=uz*step;this.y+=((target.y??this.y)-this.y)*Math.min(1,step/len);
   if(step<Math.min(len,distance)-1e-5)break;
   distance-=step;if(step>=len-.001)this.index++;
  }
 }
}
