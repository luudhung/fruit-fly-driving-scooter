import {signalBarrier} from '../worker/traffic.mjs';
export const CITY_ROUTE_PREDICTION_SECONDS=75;
export type MotionPoint={x:number;y?:number;z:number;at?:number};
export type MotionPlan={at:number;speed:number;mode:string;points:MotionPoint[];blocked?:boolean;signalPermit?:boolean;timed?:boolean};
/** Client-only locomotion. Never changes server state, money, needs, jobs or neural checkpoints. */
export class CityMotion{
 x=0;y=1.1;z=0;
 private plan:MotionPlan|null=null;private index=0;private remaining=0;
 private readonly predictionSeconds:number;
 constructor(predictionSeconds=8){this.predictionSeconds=predictionSeconds;}
 accept(position:MotionPoint,plan:MotionPlan){
  if(!Number.isFinite(plan.at)||!Number.isFinite(position.x)||!Number.isFinite(position.z)||this.plan&&plan.at<=this.plan.at)return;
  plan={...plan,speed:Number.isFinite(plan.speed)?Math.max(0,Math.min(40,plan.speed)):0,points:plan.points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)).slice(0,16)};
  if(plan.timed){
   if(plan.mode!=='walk'||!plan.points.length||plan.points.some((p,i)=>!Number.isFinite(p.at)||i>0&&p.at! < plan.points[i-1].at!))return;
   this.plan=plan;this.index=0;this.remaining=0;
   this.x=position.x;this.y=position.y??1.1;this.z=position.z;
   return;
  }
  const path=[position,...plan.points];let closest=Infinity,segment=0,ahead=0,travelled=0;
  if(this.plan)for(let i=0;i<path.length-1;i++){
   const a=path[i],b=path[i+1],dx=b.x-a.x,dy=(b.y??a.y??1.1)-(a.y??1.1),dz=b.z-a.z,len=dx*dx+dy*dy+dz*dz;
   const t=len?Math.max(0,Math.min(1,((this.x-a.x)*dx+(this.y-(a.y??1.1))*dy+(this.z-a.z)*dz)/len)):0;
   const distance=Math.hypot(this.x-a.x-dx*t,this.y-(a.y??1.1)-dy*t,this.z-a.z-dz*t);
   if(distance<closest){closest=distance;segment=i;ahead=travelled+Math.sqrt(len)*t;}
   travelled+=Math.sqrt(len);
  }
  // Compare against the complete 3D route: being higher on the same staircase
  // is valid prediction, not a teleport that should return to street height.
  if(!this.plan||this.plan.timed||this.plan.mode!==plan.mode||closest>(plan.mode==='car'?4:2)){
   this.x=position.x;this.y=position.y??1.1;this.z=position.z;segment=0;ahead=0;
  }
  // A refresh must not renew prediction on top of existing lead.
  // Only actual server progress releases more of the prediction budget.
  this.plan={...plan,points:plan.points.slice(segment)};this.index=0;this.remaining=plan.speed>0?Math.max(0,this.predictionSeconds-ahead/plan.speed):0;
 }
 get timed(){return Boolean(this.plan?.timed);}
 get targetX(){return this.plan?.points[this.index]?.x??this.x;}
 get targetZ(){return this.plan?.points[this.index]?.z??this.z;}
 advance(dt:number,gameSeconds:number,timeScale=120,headway?:(from:{x:number;z:number},to:{x:number;z:number})=>number){
  const plan=this.plan;if(!plan)return;
  if(plan.timed){
   if(!Number.isFinite(gameSeconds))return;
   const points=plan.points,next=points.findIndex(p=>p.at! > gameSeconds);
   const b=points[next<0?points.length-1:next],a=points[Math.max(0,(next<0?points.length-1:next)-1)];
   const u=next<=0?1:Math.max(0,Math.min(1,(gameSeconds-a.at!)/Math.max(.001,b.at!-a.at!)));
   this.x=a.x+(b.x-a.x)*u;this.y=(a.y??1.1)+((b.y??1.1)-(a.y??1.1))*u;this.z=a.z+(b.z-a.z)*u;
   return;
  }
  if(plan.blocked||this.remaining<=0)return;
  dt=Math.min(.1,Math.max(0,dt),this.remaining);this.remaining-=dt;
  const elapsed=this.predictionSeconds-this.remaining;
  const continuation=this.predictionSeconds>8?Math.max(.5,1-Math.max(0,elapsed-12)*.02):1;
  let distance=Math.max(0,plan.speed)*dt*continuation;
  for(let hops=0;distance>1e-5&&this.index<plan.points.length&&hops<12;hops++){
   const target=plan.points[this.index],dx=target.x-this.x,dy=(target.y??this.y)-this.y,dz=target.z-this.z,len=plan.mode==='walk'?Math.hypot(dx,dy,dz):Math.hypot(dx,dz);
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
