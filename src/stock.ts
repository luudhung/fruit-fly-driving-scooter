import * as THREE from "three";
import { StockBrain, type StockBrainDecision, type StockBrainStatus, type TradeSide } from "./stock-brain";

const worldEl=document.getElementById("world") as HTMLDivElement;
const telemetryEl=document.getElementById("telemetry") as HTMLDivElement;
const decisionEl=document.getElementById("decision") as HTMLDivElement;
const callNoteEl=document.getElementById("call-note") as HTMLSpanElement;
const eventsEl=document.getElementById("events") as HTMLDivElement;
const brainStatusEl=document.getElementById("brain-status") as HTMLSpanElement;
const brainDetailEl=document.getElementById("brain-detail") as HTMLDivElement;
const brainLiveEl=document.getElementById("brain-live") as HTMLDivElement;
const retinaCanvas=document.getElementById("retina") as HTMLCanvasElement;
const retinaCtx=retinaCanvas.getContext("2d")!;
const retinaImage=retinaCtx.createImageData(64,16);

type PendingBet={side:"UP"|"DOWN";entry:number;settleTick:number;confidence:number};

const prices:number[]=[];
const returns:number[]=[];
let price=100;
let tick=0;
let marketRegime=0.00025;
let marketVol=0.0024;
let stress=18;
let wins=0;
let losses=0;
let score=0;
let lastDecisionTick=-1;
let latestDecision:StockBrainDecision={side:"WAIT",confidence:0,signal:0,activity:0,tick:0};
let latestBrain:StockBrainStatus={stage:"loading",message:"Starting full FlyWire brain…"};
const pending:PendingBet[]=[];
const eventLines:string[]=[];

for(let i=0;i<54;i++){
  const r=(Math.random()-.5)*marketVol*2+marketRegime;
  price*=1+r;
  prices.push(price);
  returns.push(r);
}

function addEvent(line:string){
  eventLines.unshift(line);
  while(eventLines.length>7)eventLines.pop();
  eventsEl.innerHTML=eventLines.map(x=>"<div>"+x+"</div>").join("");
}

function momentum(){
  if(prices.length<8)return 0;
  const a=prices[prices.length-1];
  const b=prices[prices.length-8];
  return (a-b)/b;
}

function volatility(){
  const xs=returns.slice(-18);
  if(!xs.length)return 0;
  const mean=xs.reduce((a,b)=>a+b,0)/xs.length;
  const variance=xs.reduce((s,x)=>s+(x-mean)*(x-mean),0)/xs.length;
  return Math.sqrt(variance);
}

function settleBets(){
  for(let i=pending.length-1;i>=0;i--){
    const bet=pending[i];
    if(tick<bet.settleTick)continue;
    const up=price>bet.entry;
    const correct=(bet.side==="UP"&&up)||(bet.side==="DOWN"&&!up);
    if(correct){
      wins++;
      score+=1;
      stress=Math.max(0,stress-(8+bet.confidence*5));
      addEvent("✓ "+bet.side+" correct · "+price.toFixed(2)+" · stress ↓");
    }else{
      losses++;
      score-=1;
      stress=Math.min(100,stress+(13+bet.confidence*8));
      addEvent("✕ "+bet.side+" wrong · "+price.toFixed(2)+" · stress ↑");
    }
    pending.splice(i,1);
  }
}

function marketStep(){
  tick++;
  if(Math.random()<0.065){
    marketRegime=(Math.random()-.5)*0.0015;
    marketVol=0.0015+Math.random()*0.0042;
  }
  const meanRevert=(100-price)/100*0.00008;
  const shock=(Math.random()-.5)*2*marketVol;
  const r=marketRegime+meanRevert+shock;
  price=Math.max(12,price*(1+r));
  prices.push(price);
  returns.push(r);
  while(prices.length>96)prices.shift();
  while(returns.length>96)returns.shift();
  stress=Math.min(100,Math.max(0,stress+Math.max(0,Math.abs(r)-0.0028)*520));
  settleBets();
  updateChart();
}

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x070a0d);
scene.fog=new THREE.Fog(0x070a0d,9,22);

const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,60);
camera.position.set(7.1,4.5,8.4);
camera.lookAt(0,2.15,0);

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
worldEl.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x9bb8d5,0x17120e,1.55));
const key=new THREE.DirectionalLight(0xffe2bb,3.2);
key.position.set(4,8,6);key.castShadow=true;scene.add(key);
const screenGlow=new THREE.PointLight(0x5ba7ff,4.5,8);
screenGlow.position.set(0,3,-1);scene.add(screenGlow);

function box(size:[number,number,number],pos:[number,number,number],color:number,rough=.75){
  const m=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color,roughness:rough,metalness:.04}));
  m.position.set(...pos);m.receiveShadow=true;m.castShadow=true;scene.add(m);return m;
}

box([16,.18,14],[0,-.08,0],0x171a1d,.95);
box([16,8,.18],[0,3.9,-5.4],0x111519,.9);
box([.18,8,14],[-7.9,3.9,0],0x0f1316,.9);
box([7.8,.28,3.2],[0,1.42,-.6],0x2a211c,.66);
box([.28,1.5,.28],[-3.2,.65,-1.7],0x262b2d,.55);
box([.28,1.5,.28],[3.2,.65,-1.7],0x262b2d,.55);
box([.28,1.5,.28],[-3.2,.65,.45],0x262b2d,.55);
box([.28,1.5,.28],[3.2,.65,.45],0x262b2d,.55);

const chartCanvas=document.createElement("canvas");
chartCanvas.width=800;chartCanvas.height=450;
const chartCtx=chartCanvas.getContext("2d")!;
const chartTexture=new THREE.CanvasTexture(chartCanvas);
chartTexture.colorSpace=THREE.SRGBColorSpace;
chartTexture.minFilter=THREE.LinearFilter;
box([4.9,3.05,.16],[0,3.32,-1.72],0x171b20,.42);
const screen=new THREE.Mesh(
  new THREE.PlaneGeometry(4.58,2.66),
  new THREE.MeshBasicMaterial({map:chartTexture,toneMapped:false})
);
screen.position.set(0,3.32,-1.625);
scene.add(screen);

box([.18,1.15,.18],[0,1.95,-1.72],0x252a2f,.5);
box([1.8,.12,.65],[0,1.42,-1.72],0x252a2f,.5);

const keyboard=box([2.35,.08,.72],[0,1.61,.25],0x16191c,.5);
keyboard.rotation.x=-.05;

const chair=new THREE.Group();
const seat=new THREE.Mesh(new THREE.BoxGeometry(1.65,.22,1.55),new THREE.MeshStandardMaterial({color:0x22272c,roughness:.72}));
seat.position.y=1.18;seat.castShadow=true;chair.add(seat);
const back=new THREE.Mesh(new THREE.BoxGeometry(1.7,2.2,.24),new THREE.MeshStandardMaterial({color:0x20252a,roughness:.72}));
back.position.set(0,2.15,1.0);back.rotation.x=-.09;back.castShadow=true;chair.add(back);
chair.position.z=1.55;scene.add(chair);

const fly=new THREE.Group();
fly.position.set(0,2.02,1.28);
fly.rotation.y=Math.PI;

const bodyMat=new THREE.MeshStandardMaterial({color:0x2b2923,roughness:.62,metalness:.06});
const darkMat=new THREE.MeshStandardMaterial({color:0x171717,roughness:.55});
const eyeMat=new THREE.MeshStandardMaterial({color:0x7d1d20,roughness:.35,metalness:.18});
const wingMat=new THREE.MeshPhysicalMaterial({color:0xcad9de,transparent:true,opacity:.36,roughness:.18,transmission:.15,side:THREE.DoubleSide});

const abdomen=new THREE.Mesh(new THREE.SphereGeometry(.48,24,16),bodyMat);
abdomen.scale.set(.82,.9,1.42);abdomen.position.set(0,.08,.3);abdomen.castShadow=true;fly.add(abdomen);
const thorax=new THREE.Mesh(new THREE.SphereGeometry(.48,24,16),darkMat);
thorax.scale.set(.9,.92,.95);thorax.position.set(0,.15,-.3);thorax.castShadow=true;fly.add(thorax);
const head=new THREE.Mesh(new THREE.SphereGeometry(.37,24,16),bodyMat);
head.scale.set(1.0,.92,.9);head.position.set(0,.2,-.85);head.castShadow=true;fly.add(head);

for(const side of [-1,1]){
  const eye=new THREE.Mesh(new THREE.SphereGeometry(.2,20,12),eyeMat);
  eye.scale.set(.72,1,1);eye.position.set(side*.28,.27,-1.08);fly.add(eye);
  const wing=new THREE.Mesh(new THREE.CircleGeometry(.58,30),wingMat);
  wing.scale.set(.62,1.55,1);wing.position.set(side*.48,.42,.05);wing.rotation.set(Math.PI/2,side*.35,side*.25);fly.add(wing);
}

const proboscis=new THREE.Mesh(new THREE.CylinderGeometry(.035,.055,.38,10),darkMat);
proboscis.rotation.x=Math.PI/2;proboscis.position.set(0,.08,-1.18);fly.add(proboscis);

const legMat=new THREE.MeshStandardMaterial({color:0x25231f,roughness:.7});
function limb(a:THREE.Vector3,b:THREE.Vector3){
  const dir=b.clone().sub(a);const len=dir.length();
  const m=new THREE.Mesh(new THREE.CylinderGeometry(.026,.034,len,8),legMat);
  m.position.copy(a.clone().add(b).multiplyScalar(.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());
  fly.add(m);
}
for(const s of [-1,1]){
  limb(new THREE.Vector3(s*.33,.05,-.25),new THREE.Vector3(s*.72,-.25,-.75));
  limb(new THREE.Vector3(s*.35,.05,-.05),new THREE.Vector3(s*.78,-.38,.08));
  limb(new THREE.Vector3(s*.34,.08,.2),new THREE.Vector3(s*.65,-.35,.75));
}
scene.add(fly);

const cigarette=new THREE.Group();
const paper=new THREE.Mesh(new THREE.CylinderGeometry(.032,.032,.62,12),new THREE.MeshStandardMaterial({color:0xe9e3d7,roughness:.8}));
paper.rotation.x=Math.PI/2;cigarette.add(paper);
const ember=new THREE.Mesh(new THREE.SphereGeometry(.043,10,8),new THREE.MeshBasicMaterial({color:0xff5f36}));
ember.position.z=-.32;cigarette.add(ember);
const filter=new THREE.Mesh(new THREE.CylinderGeometry(.034,.034,.15,12),new THREE.MeshStandardMaterial({color:0xb98555,roughness:.8}));
filter.rotation.x=Math.PI/2;filter.position.z=.235;cigarette.add(filter);
cigarette.position.set(.12,2.05,.03);
cigarette.rotation.y=Math.PI;
cigarette.visible=false;
scene.add(cigarette);

type Smoke={mesh:THREE.Mesh;life:number;speed:number};
const smokes:Smoke[]=[];
const smokeGeo=new THREE.SphereGeometry(.1,12,8);
let smokeClock=0;
let smoking=false;

function spawnSmoke(){
  const mat=new THREE.MeshBasicMaterial({color:0xc9d0d3,transparent:true,opacity:.22,depthWrite:false});
  const mesh=new THREE.Mesh(smokeGeo,mat);
  mesh.position.copy(cigarette.position).add(new THREE.Vector3(0,.08,-.34));
  mesh.scale.setScalar(.6+Math.random()*.5);
  scene.add(mesh);
  smokes.push({mesh,life:0,speed:.18+Math.random()*.14});
}

function updateSmoking(dt:number,time:number){
  if(stress>62)smoking=true;
  if(stress<40)smoking=false;
  cigarette.visible=smoking;
  ember.visible=smoking;
  if(smoking){
    cigarette.position.y=2.05+Math.sin(time*2.3)*.025;
    smokeClock+=dt;
    if(smokeClock>.22){smokeClock=0;spawnSmoke();}
  }
  for(let i=smokes.length-1;i>=0;i--){
    const s=smokes[i];s.life+=dt;
    s.mesh.position.y+=s.speed*dt;
    s.mesh.position.x+=Math.sin(s.life*3+i)*dt*.035;
    const mat=s.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity=Math.max(0,.22*(1-s.life/2.7));
    s.mesh.scale.multiplyScalar(1+dt*.18);
    if(s.life>2.7){scene.remove(s.mesh);mat.dispose();smokes.splice(i,1);}
  }
}

function updateChart(){
  const w=chartCanvas.width,h=chartCanvas.height;
  chartCtx.fillStyle="#071016";chartCtx.fillRect(0,0,w,h);
  chartCtx.strokeStyle="rgba(255,255,255,.07)";chartCtx.lineWidth=1;
  for(let i=1;i<6;i++){const y=i*h/6;chartCtx.beginPath();chartCtx.moveTo(0,y);chartCtx.lineTo(w,y);chartCtx.stroke();}
  for(let i=1;i<8;i++){const x=i*w/8;chartCtx.beginPath();chartCtx.moveTo(x,0);chartCtx.lineTo(x,h);chartCtx.stroke();}
  const view=prices.slice(-72);
  let min=Math.min(...view),max=Math.max(...view);
  const pad=Math.max(.01,(max-min)*.18);min-=pad;max+=pad;
  chartCtx.strokeStyle="#62e39a";chartCtx.lineWidth=5;chartCtx.lineJoin="round";chartCtx.lineCap="round";
  chartCtx.beginPath();
  view.forEach((p,i)=>{
    const x=22+i/(Math.max(1,view.length-1))*(w-44);
    const y=h-35-(p-min)/(max-min)*(h-72);
    if(i===0)chartCtx.moveTo(x,y);else chartCtx.lineTo(x,y);
  });
  chartCtx.stroke();
  chartCtx.fillStyle="rgba(255,255,255,.88)";chartCtx.font="700 28px ui-monospace, monospace";
  chartCtx.fillText("SYNTH "+price.toFixed(2),24,38);
  const m=momentum()*100;
  chartCtx.fillStyle=m>=0?"#62e39a":"#ff7373";
  chartCtx.font="700 18px ui-monospace, monospace";chartCtx.fillText((m>=0?"+":"")+m.toFixed(2)+"% momentum",24,66);
  chartCtx.fillStyle="rgba(255,255,255,.42)";chartCtx.font="600 14px ui-monospace, monospace";
  chartCtx.fillText("synthetic market · no real money",24,h-16);
  chartTexture.needsUpdate=true;
}
updateChart();

function handleDecision(d:StockBrainDecision){
  latestDecision=d;
  decisionEl.textContent=d.side;
  decisionEl.dataset.side=d.side;
  callNoteEl.textContent=Math.round(d.confidence*100)+"% confidence · signal "+d.signal.toFixed(2);
  if(d.tick===lastDecisionTick)return;
  lastDecisionTick=d.tick;
  if(d.side!=="WAIT"){
    pending.push({side:d.side,entry:price,settleTick:tick+3,confidence:d.confidence});
    addEvent("→ "+d.side+" @ "+price.toFixed(2)+" · settles in 3 ticks");
  }
}

const brain=new StockBrain({
  getSnapshot:()=>({prices:[...prices],momentum:momentum(),volatility:volatility(),stress,tick}),
  onStatus(status){
    latestBrain={...latestBrain,...status};
    brainLiveEl.dataset.state=status.stage;
    brainStatusEl.textContent=status.stage==="running"?"FULL BRAIN ONLINE":status.stage==="error"?"BRAIN ERROR":"LOADING FULL BRAIN";
    brainDetailEl.textContent=status.message;
  },
  onRetina(pixels,w,h){
    const dst=retinaImage.data;
    for(let y=0;y<h;y++){
      const src=y*w*4,out=y*w*4;
      for(let i=0;i<w*4;i++)dst[out+i]=pixels[src+i];
    }
    retinaCtx.putImageData(retinaImage,0,0);
  },
  onDecision:handleDecision,
});
void brain.start();

function fmt(n:number|undefined){return n==null?"—":n.toLocaleString();}

function updateHud(){
  const prev=prices.length>1?prices[prices.length-2]:price;
  const change=(price-prev)/prev*100;
  telemetryEl.innerHTML=[
    '<div class="metric"><span>price</span><b>'+price.toFixed(2)+'</b></div>',
    '<div class="metric"><span>last tick</span><b>'+(change>=0?"+":"")+change.toFixed(2)+'%</b></div>',
    '<div class="metric"><span>momentum</span><b>'+(momentum()*100).toFixed(2)+'%</b></div>',
    '<div class="metric"><span>volatility</span><b>'+(volatility()*100).toFixed(2)+'%</b></div>',
    '<div class="metric"><span>stress</span><b>'+Math.round(stress)+' / 100</b></div>',
    '<div class="metric"><span>smoking</span><b>'+(smoking?"YES":"NO")+'</b></div>',
    '<div class="metric"><span>W / L</span><b>'+wins+' / '+losses+'</b></div>',
    '<div class="metric"><span>score</span><b>'+(score>=0?"+":"")+score+'</b></div>',
    '<div class="metric"><span>open calls</span><b>'+pending.length+'</b></div>',
    '<div class="metric"><span>DN activity</span><b>'+(latestBrain.activity??0).toFixed(4)+'</b></div>',
    '<div class="metric wide"><span>FlyWire</span><b>'+fmt(latestBrain.neurons)+' neurons · '+fmt(latestBrain.edges)+' edges</b></div>',
    '<div class="metric wide"><span>MANC</span><b>'+fmt(latestBrain.vncNeurons)+' neurons · '+fmt(latestBrain.vncEdges)+' edges</b></div>',
  ].join("");
}

const clock=new THREE.Clock();
let marketAccumulator=0;
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(.05,clock.getDelta());
  const time=clock.elapsedTime;
  marketAccumulator+=dt;
  if(marketAccumulator>.78){marketAccumulator=0;marketStep();}
  stress=Math.max(0,stress-dt*.16);
  fly.position.y=2.02+Math.sin(time*2.1)*.025;
  fly.rotation.z=Math.sin(time*.85)*.018;
  updateSmoking(dt,time);
  updateHud();
  renderer.render(scene,camera);
}
animate();

addEvent("market booted · waiting for FlyWire readout");

addEvent("stress > 62 → cigarette auto-on");

window.addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});
