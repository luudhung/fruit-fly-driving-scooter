import * as THREE from "three";
import { loadBrain, type Brain } from "./brain";
import { FlySim, DEFAULT_PARAMS } from "./sim";
import { loadManifest } from "./manifest";

type MotorSignal = {
  turn:number;
  drive:number;
  lift:number;
  interact:number;
  activity:number;
  ready:boolean;
};

type FlyAgent = {
  id:string;
  sex:"female"|"male";
  mesh:THREE.Group;
  heading:number;
  velocityY:number;
  energy:number;
  hunger:number;
  cash:number;
  motor:MotorSignal;
  brainOnline:boolean;
};

type BrainPartition = {
  opticLeft:number[];
  opticRight:number[];
  sensory:number[];
  orn:number[];
  dnLeft:number[];
  dnRight:number[];
  mbon:number[];
  lhn:number[];
  pn:number[];
};

const WORLD_SEED=948291;
const STARTING_FLY_COUNT=2;
const WORLD_HALF=105;
const GROUND_Y=0.34;

function clamp01(v:number){return Math.max(0,Math.min(1,v));}
function clamp(v:number,lo:number,hi:number){return Math.max(lo,Math.min(hi,v));}
function wrapAngle(v:number){
  while(v>Math.PI)v-=Math.PI*2;
  while(v<-Math.PI)v+=Math.PI*2;
  return v;
}
function meanAt(values:Float32Array,idxs:number[]){
  if(!idxs.length)return 0;
  let sum=0;
  for(const i of idxs)sum+=values[i];
  return sum/idxs.length;
}
function sampleEvenly(values:number[],max:number){
  if(values.length<=max)return values.slice();
  const out:number[]=[];
  const stride=values.length/max;
  for(let i=0;i<max;i++)out.push(values[Math.floor(i*stride)]);
  return out;
}
function mesh(geometry:THREE.BufferGeometry,material:THREE.Material,x=0,y=0,z=0){
  const m=new THREE.Mesh(geometry,material);
  m.position.set(x,y,z);
  m.castShadow=true;
  m.receiveShadow=true;
  return m;
}

class SeededRng{
  private state:number;
  constructor(seed:number){this.state=seed>>>0;}
  next(){
    let t=this.state+=0x6d2b79f5;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return((t^(t>>>14))>>>0)/4294967296;
  }
  range(lo:number,hi:number){return lo+(hi-lo)*this.next();}
}

class BrainRuntime{
  readonly motors=new Map<string,MotorSignal>();
  private brain:Brain|null=null;
  private partition:BrainPartition|null=null;
  private sims=new Map<string,{sim:FlySim;ext:Float32Array}>();
  private running=false;

  constructor(
    private sensoryFor:(id:string)=>{foodOdor:number;left:number;right:number;contact:number;energy:number;hunger:number}|null,
    private onStatus:(state:"loading"|"running"|"error",detail:string)=>void,
  ){}

  async start(ids:string[]){
    if(this.running)return;
    this.running=true;
    try{
      const versionFor=await loadManifest();
      const brainUrl=(import.meta.env.VITE_BRAIN_URL||"/brain.bin")+versionFor("brain.bin");
      this.onStatus("loading","Loading shared immutable FlyWire graph…");
      this.brain=await loadBrain(brainUrl,(got,total)=>{
        const pct=total>0?Math.round(got/total*100):0;
        this.onStatus("loading",total>0?"FlyWire "+pct+"%":"FlyWire "+(got/1e6).toFixed(1)+" MB");
      });
      this.partition=this.makePartition(this.brain);
      for(const id of ids)await this.addAgent(id);
      this.onStatus("running",this.sims.size+" independent FlyWire LIF states online · "+this.brain.header.numNeurons.toLocaleString()+" neurons each");
      void this.loop();
    }catch(error){
      this.running=false;
      this.onStatus("error",error instanceof Error?error.message:String(error));
    }
  }

  async addAgent(id:string){
    if(!this.brain||!this.partition||this.sims.has(id))return false;
    const sim=await FlySim.create(this.brain,{...DEFAULT_PARAMS});
    const ext=new Float32Array(this.brain.header.numNeurons);
    this.sims.set(id,{sim,ext});
    this.motors.set(id,{turn:0,drive:0,lift:0,interact:0,activity:0,ready:false});
    return true;
  }

  private makePartition(brain:Brain):BrainPartition{
    let cx=0,n=0;
    for(let i=0;i<brain.header.numNeurons;i++){
      const x=brain.neurons.pos[i*3];
      if(x!==0){cx+=x;n++;}
    }
    cx=n?cx/n:0;
    const opticLeft:number[]=[];
    const opticRight:number[]=[];
    const sensory:number[]=[];
    const orn:number[]=[];
    const dnLeft:number[]=[];
    const dnRight:number[]=[];
    const mbon:number[]=[];
    const lhn:number[]=[];
    const pn:number[]=[];
    for(let i=0;i<brain.header.numNeurons;i++){
      const hero=brain.neurons.cellType[i]&0xff;
      const sc=brain.neurons.superClass[i];
      const x=brain.neurons.pos[i*3];
      if(sc===10)(x<cx?opticLeft:opticRight).push(i);
      if(sc===1)sensory.push(i);
      if(hero===5)orn.push(i);
      if(hero===7)(x<cx?dnLeft:dnRight).push(i);
      if(hero===2)mbon.push(i);
      if(hero===3)lhn.push(i);
      if(hero===4)pn.push(i);
    }
    return{
      opticLeft:sampleEvenly(opticLeft,3200),
      opticRight:sampleEvenly(opticRight,3200),
      sensory:sampleEvenly(sensory,2200),
      orn:sampleEvenly(orn,1800),
      dnLeft,dnRight,mbon,lhn,pn,
    };
  }

  private encode(ext:Float32Array,s:{foodOdor:number;left:number;right:number;contact:number;energy:number;hunger:number}){
    const p=this.partition;
    if(!p)return;
    ext.fill(0);
    const hungerGain=.65+s.hunger*1.4+(1-s.energy/100)*.7;
    const odor=.1+s.foodOdor*4.1*hungerGain;
    for(const i of p.orn)ext[i]=odor;
    for(const i of p.opticLeft)ext[i]=.2+s.left*4.5;
    for(const i of p.opticRight)ext[i]=.2+s.right*4.5;
    for(const i of p.sensory)if(ext[i]===0)ext[i]=.05+s.contact*.16;
  }

  private decode(rate:Float32Array):MotorSignal{
    const p=this.partition;
    if(!p)return{turn:0,drive:0,lift:0,interact:0,activity:0,ready:false};
    const dl=meanAt(rate,p.dnLeft);
    const dr=meanAt(rate,p.dnRight);
    const dn=dl+dr;
    const mbon=meanAt(rate,p.mbon);
    const lhn=meanAt(rate,p.lhn);
    const pn=meanAt(rate,p.pn);
    return{
      turn:clamp(((dr-dl)/(dn+.001))*1.7,-1,1),
      drive:clamp01(dn*8.5+lhn*2.5+pn*1.5),
      lift:clamp01(dn*4.2+lhn*1.6),
      interact:clamp01(mbon*7+pn*3),
      activity:dn+lhn+pn+mbon,
      ready:true,
    };
  }

  private async loop(){
    while(this.running){
      for(const [id,rt] of this.sims){
        const s=this.sensoryFor(id);
        if(!s)continue;
        this.encode(rt.ext,s);
        rt.sim.setExternalInput(rt.ext);
        const rate=await rt.sim.captureRollingRate(10);
        this.motors.set(id,this.decode(rate));
      }
      await new Promise<void>((resolve)=>setTimeout(resolve,34));
    }
  }
}

class FullLifeWorld{
  readonly scene=new THREE.Scene();
  readonly camera=new THREE.PerspectiveCamera(52,1,.08,430);
  readonly renderer:THREE.WebGLRenderer;
  readonly flies:FlyAgent[]=[];
  readonly food:{mesh:THREE.Mesh;quantity:number;capacity:number}[]=[];
  private readonly clock=new THREE.Clock();
  private readonly rng=new SeededRng(WORLD_SEED);
  private simSeconds=0;
  private selectedId:string|null=null;

  constructor(private container:HTMLElement){
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
    this.renderer.shadowMap.enabled=true;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);
    this.scene.background=new THREE.Color(0xd7e8f4);
    this.scene.fog=new THREE.Fog(0xd7e8f4,130,360);
    const hemi=new THREE.HemisphereLight(0xdff2ff,0x69543d,1.45);
    const sun=new THREE.DirectionalLight(0xffd79c,2.2);
    sun.position.set(-80,120,-35);
    sun.castShadow=true;
    this.scene.add(hemi,sun);
    this.buildWorld();
    this.spawnFly("FLY-000001","female",-7,4);
    this.spawnFly("FLY-000002","male",8,7);
    this.camera.position.set(0,92,145);
    this.camera.lookAt(0,0,0);
    addEventListener("resize",this.resize);
    this.resize();
    this.clock.start();
    this.loop();
  }

  private buildWorld(){
    const ground=mesh(new THREE.PlaneGeometry(WORLD_HALF*2,WORLD_HALF*2),new THREE.MeshStandardMaterial({color:0x91ad72,roughness:.95}));
    ground.rotation.x=-Math.PI/2;
    this.scene.add(ground);
    const roadMat=new THREE.MeshStandardMaterial({color:0x3e444a,roughness:.94});
    for(const x of [-55,0,55])this.scene.add(mesh(new THREE.BoxGeometry(12,.08,WORLD_HALF*2),roadMat,x,.05,0));
    for(const z of [-55,0,55])this.scene.add(mesh(new THREE.BoxGeometry(WORLD_HALF*2,.08,12),roadMat,0,.05,z));
    const colors=[0xb7a798,0xaab6c4,0xc7af95,0x9fb0a2];
    let ci=0;
    for(const cx of [-82,-28,28,82]){
      for(const cz of [-82,-28,28,82]){
        if(Math.abs(cx-28)<2&&cz>45)continue;
        const count=2+Math.floor(this.rng.range(0,3));
        for(let i=0;i<count;i++){
          const w=this.rng.range(12,21);
          const d=this.rng.range(12,21);
          const h=this.rng.range(10,38);
          const b=mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:colors[ci++%colors.length],roughness:.84}),cx+this.rng.range(-13,13),h/2,cz+this.rng.range(-13,13));
          this.scene.add(b);
        }
      }
    }
    const park=mesh(new THREE.BoxGeometry(38,.12,34),new THREE.MeshStandardMaterial({color:0x5f8d57,roughness:1}),28,.07,76);
    this.scene.add(park);
    const foodMat=new THREE.MeshStandardMaterial({color:0xd86a5e,emissive:0x3a100a,emissiveIntensity:.2});
    for(const [x,z] of [[-78,76],[28,76],[72,-74]] as const){
      const f=mesh(new THREE.SphereGeometry(2.2,16,12),foodMat,x,2.1,z);
      this.scene.add(f);
      this.food.push({mesh:f,quantity:70,capacity:70});
    }
  }

  private spawnFly(id:string,sex:"female"|"male",x:number,z:number){
    const g=new THREE.Group();
    const bodyMat=new THREE.MeshStandardMaterial({color:sex==="female"?0x5a3a2d:0x403129,roughness:.76});
    const eyeMat=new THREE.MeshStandardMaterial({color:0xa9262b,emissive:0x4c0508,emissiveIntensity:.5});
    const wingMat=new THREE.MeshStandardMaterial({color:0xdceef2,transparent:true,opacity:.46,side:THREE.DoubleSide});
    const body=mesh(new THREE.SphereGeometry(.45,14,10),bodyMat,0,.55,0);body.scale.set(.8,.9,1.2);g.add(body);
    const head=mesh(new THREE.SphereGeometry(.33,14,10),bodyMat,0,.6,-.52);g.add(head);
    for(const ex of [-.25,.25]){const e=mesh(new THREE.SphereGeometry(.2,12,8),eyeMat,ex,.63,-.66);e.scale.set(.65,1,.7);g.add(e);}
    for(const side of [-1,1]){const w=mesh(new THREE.PlaneGeometry(.7,1.7),wingMat,side*.36,.82,.16);w.rotation.x=-.45;w.rotation.z=side*.55;g.add(w);}
    g.position.set(x,GROUND_Y,z);
    this.scene.add(g);
    this.flies.push({
      id,sex,mesh:g,heading:this.rng.range(-Math.PI,Math.PI),velocityY:0,energy:this.rng.range(76,90),hunger:.18,cash:0,
      motor:{turn:0,drive:0,lift:0,interact:0,activity:0,ready:false},brainOnline:false,
    });
    if(!this.selectedId)this.selectedId=id;
  }

  getSensory(id:string){
    const fly=this.flies.find((f)=>f.id===id);
    if(!fly)return null;
    let odor=0,left=0,right=0;
    for(const food of this.food){
      const dx=food.mesh.position.x-fly.mesh.position.x;
      const dz=food.mesh.position.z-fly.mesh.position.z;
      const d=Math.max(.7,Math.hypot(dx,dz));
      const angle=wrapAngle(Math.atan2(dx,-dz)-fly.heading);
      const strength=(food.quantity/food.capacity)/(1+d*d*.02);
      odor+=strength*1.2;
      if(angle<0)left+=strength;else right+=strength;
    }
    for(const other of this.flies){
      if(other.id===fly.id)continue;
      const dx=other.mesh.position.x-fly.mesh.position.x;
      const dz=other.mesh.position.z-fly.mesh.position.z;
      const d=Math.max(.7,Math.hypot(dx,dz));
      const angle=wrapAngle(Math.atan2(dx,-dz)-fly.heading);
      const strength=.4/(1+d*.16);
      if(angle<0)left+=strength;else right+=strength;
    }
    const edge=Math.max(Math.abs(fly.mesh.position.x),Math.abs(fly.mesh.position.z));
    return{
      foodOdor:clamp01(odor),
      left:clamp01(left),
      right:clamp01(right),
      contact:edge>WORLD_HALF-5?1:0,
      energy:fly.energy,
      hunger:fly.hunger,
    };
  }

  applyMotor(id:string,motor:MotorSignal){
    const fly=this.flies.find((f)=>f.id===id);
    if(!fly)return;
    fly.motor=motor;
    fly.brainOnline=motor.ready;
  }

  getSelected(){return this.flies.find((f)=>f.id===this.selectedId)??this.flies[0]??null;}
  select(id:string){if(this.flies.some((f)=>f.id===id))this.selectedId=id;}
  getSimSeconds(){return this.simSeconds;}

  private loop=()=>{
    requestAnimationFrame(this.loop);
    const dt=Math.min(.04,this.clock.getDelta());
    this.simSeconds+=dt*90;
    for(const f of this.flies)this.stepFly(f,dt);
    this.renderer.render(this.scene,this.camera);
  };

  private stepFly(f:FlyAgent,dt:number){
    const m=f.motor;
    f.heading=wrapAngle(f.heading+m.turn*dt*2.8);
    const airborne=f.mesh.position.y>GROUND_Y+.12;
    const speed=(.16+m.drive*(airborne?4.6:2))*clamp01(f.energy/18);
    f.mesh.position.x+=Math.sin(f.heading)*speed*dt;
    f.mesh.position.z-=Math.cos(f.heading)*speed*dt;
    f.velocityY+=(m.lift*5.6-3.1)*dt;
    f.velocityY*=Math.exp(-dt*1.35);
    f.mesh.position.y+=f.velocityY*dt;
    if(f.mesh.position.y<GROUND_Y){f.mesh.position.y=GROUND_Y;if(f.velocityY<0)f.velocityY=0;}
    f.mesh.position.y=Math.min(15,f.mesh.position.y);
    f.mesh.position.x=clamp(f.mesh.position.x,-WORLD_HALF+2,WORLD_HALF-2);
    f.mesh.position.z=clamp(f.mesh.position.z,-WORLD_HALF+2,WORLD_HALF-2);
    f.mesh.rotation.y=f.heading;
    const drain=.012+m.drive*.045+(airborne?.11:0);
    f.energy=Math.max(0,f.energy-drain*dt);
    f.hunger=clamp01(1-f.energy/100);
    for(const food of this.food){
      const d=f.mesh.position.distanceTo(food.mesh.position);
      if(d<2.8&&m.interact>.14&&food.quantity>0){
        const bite=Math.min(food.quantity,dt*(1.7+m.interact*3.5));
        food.quantity-=bite;
        f.energy=Math.min(100,f.energy+bite*.72);
        food.mesh.scale.setScalar(.45+.55*(food.quantity/food.capacity));
      }
    }
  }

  private resize=()=>{
    const w=this.container.clientWidth,h=this.container.clientHeight;
    this.camera.aspect=Math.max(1,w)/Math.max(1,h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w,h,false);
  };
}

const root=document.getElementById("world") as HTMLDivElement;
const brainState=document.getElementById("brain-state") as HTMLDivElement;
const brainDetail=document.getElementById("brain-detail") as HTMLDivElement;
const stats=document.getElementById("stats") as HTMLDivElement;
const flyList=document.getElementById("fly-list") as HTMLDivElement;
const inspector=document.getElementById("inspector") as HTMLDivElement;
const simTime=document.getElementById("sim-time") as HTMLSpanElement;
const modelLine=document.getElementById("model-line") as HTMLDivElement;

const world=new FullLifeWorld(root);
const brains=new BrainRuntime(
  (id)=>world.getSensory(id),
  (state,detail)=>{
    brainState.dataset.state=state;
    brainState.textContent=state==="running"?"FULL BRAINS ONLINE":state==="error"?"BRAIN ERROR":"LOADING BRAINS";
    brainDetail.textContent=detail;
  },
);
void brains.start(world.flies.slice(0,STARTING_FLY_COUNT).map((f)=>f.id));

function formatTime(seconds:number){
  const day=Math.floor(seconds/86400);
  const hour=Math.floor((seconds%86400)/3600);
  const minute=Math.floor((seconds%3600)/60);
  return "DAY "+day+" · "+String(hour).padStart(2,"0")+":"+String(minute).padStart(2,"0");
}

function tickUi(){
  for(const f of world.flies){
    const motor=brains.motors.get(f.id);
    if(motor)world.applyMotor(f.id,motor);
  }
  simTime.textContent=formatTime(world.getSimSeconds());
  const avgEnergy=world.flies.reduce((s,f)=>s+f.energy,0)/Math.max(1,world.flies.length);
  stats.innerHTML=[
    ["Population",String(world.flies.length)],
    ["Independent brains",String(brains.motors.size)],
    ["Avg energy",avgEnergy.toFixed(1)+"%"],
    ["Food patches",String(world.food.length)],
    ["Money supply","0 FC"],
    ["Deaths","0"],
  ].map(([k,v])=>"<div><span>"+k+"</span><b>"+v+"</b></div>").join("");
  flyList.innerHTML=world.flies.map((f)=>"<button class=\"fly-row\" data-id=\""+f.id+"\"><span>"+f.id+"</span><small>"+f.sex+" · "+(f.brainOnline?"brain online":"loading")+"</small></button>").join("");
  flyList.querySelectorAll<HTMLButtonElement>("button[data-id]").forEach((button)=>{
    button.onclick=()=>world.select(button.dataset.id??"");
  });
  const f=world.getSelected();
  if(f){
    inspector.innerHTML=
      "<div class=\"inspect-head\"><b>"+f.id+"</b><span>"+f.sex+"</span></div>"+
      "<div class=\"inspect-grid\">"+
      "<span>Energy</span><b>"+f.energy.toFixed(1)+"%</b>"+
      "<span>Hunger</span><b>"+(f.hunger*100).toFixed(1)+"%</b>"+
      "<span>Cash</span><b>"+f.cash.toFixed(0)+" FC</b>"+
      "<span>Brain</span><b>"+(f.brainOnline?"online":"loading")+"</b>"+
      "<span>Activity</span><b>"+f.motor.activity.toFixed(4)+"</b>"+
      "<span>Turn</span><b>"+f.motor.turn.toFixed(2)+"</b>"+
      "<span>Drive</span><b>"+f.motor.drive.toFixed(2)+"</b>"+
      "<span>Lift</span><b>"+f.motor.lift.toFixed(2)+"</b>"+
      "<span>Interact</span><b>"+f.motor.interact.toFixed(2)+"</b>"+
      "</div>";
  }
  modelLine.textContent="WORLD-A · seed "+WORLD_SEED+" · "+brains.motors.size+" independent WebGPU LIF states · browser-authoritative milestone";
  requestAnimationFrame(tickUi);
}
tickUi();
