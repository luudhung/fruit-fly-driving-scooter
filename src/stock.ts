import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { StockBrain, type StockBrainDecision, type StockBrainStatus } from "./stock-brain";

const worldEl=document.getElementById("world") as HTMLDivElement;
const telemetryEl=document.getElementById("telemetry") as HTMLDivElement;
const decisionEl=document.getElementById("decision") as HTMLDivElement;
const callNoteEl=document.getElementById("call-note") as HTMLSpanElement;
const eventsEl=document.getElementById("events") as HTMLDivElement;
const brainStatusEl=document.getElementById("brain-status") as HTMLSpanElement;
const brainDetailEl=document.getElementById("brain-detail") as HTMLDivElement;
const brainLiveEl=document.getElementById("brain-live") as HTMLDivElement;
const feedStatusEl=document.getElementById("feed-status") as HTMLSpanElement;
const stressFillEl=document.getElementById("stress-fill") as HTMLElement;
const stressValueEl=document.getElementById("stress-value") as HTMLElement;
const stressStateEl=document.getElementById("stress-state") as HTMLElement;
const retinaCanvas=document.getElementById("retina") as HTMLCanvasElement;
const retinaCtx=retinaCanvas.getContext("2d")!;
const retinaImage=retinaCtx.createImageData(64,16);
const tickerButtons=Array.from(document.querySelectorAll<HTMLButtonElement>("[data-symbol]"));

interface MarketPoint{t:number;p:number}
interface MarketResponse{
  symbol:string;
  price:number;
  currency:string;
  exchangeName:string;
  regularMarketTime:number|null;
  previousClose:number|null;
  ageSec:number|null;
  delayed:boolean;
  points:MarketPoint[];
  source:string;
  error?:string;
}
type Position={side:"LONG"|"SHORT";entry:number;qty:number;openedTick:number};

const STARTING_EQUITY=10_000;
const TRADE_NOTIONAL=2_000;
const MAX_HOLD_TICKS=6;
const BREAK_ENTER_STRESS=78;
const BREAK_EXIT_STRESS=42;
const prices:number[]=[];
const returns:number[]=[];
const eventLines:string[]=[];

let symbol="BTCUSDT";
let price=0;
let tick=0;
let lastMarketIdentity="";
let lastFetchAt=0;
let feedState:"loading"|"live"|"delayed"|"error"="loading";
let feedDetail="connecting";
let cryptoSocket:WebSocket|null=null;
let cryptoReconnectTimer:number|null=null;
let cryptoTradeCounter=0;
let stress=18;
let breakMode=false;
let wins=0;
let losses=0;
let realizedPnL=0;
let position:Position|null=null;
let lastDecisionTick=-1;
let latestBrain:StockBrainStatus={stage:"loading",message:"Starting full FlyWire brain…"};

function clamp(v:number,min=0,max=1){return Math.max(min,Math.min(max,v));}
function money(v:number){return (v<0?"-":"")+"$"+Math.abs(v).toFixed(2);}

function addEvent(line:string){
  eventLines.unshift(line);
  while(eventLines.length>8)eventLines.pop();
  eventsEl.innerHTML=eventLines.map(x=>"<div>"+x+"</div>").join("");
}

function rebuildReturns(){
  returns.length=0;
  for(let i=1;i<prices.length;i++){
    const prev=prices[i-1];
    if(prev>0)returns.push((prices[i]-prev)/prev);
  }
}

function momentum(){
  if(prices.length<8)return 0;
  const a=prices[prices.length-1],b=prices[prices.length-8];
  return b?((a-b)/b):0;
}

function volatility(){
  const xs=returns.slice(-18);
  if(!xs.length)return 0;
  const mean=xs.reduce((a,b)=>a+b,0)/xs.length;
  const variance=xs.reduce((s,x)=>s+(x-mean)*(x-mean),0)/xs.length;
  return Math.sqrt(variance);
}

function unrealizedPnL(){
  if(!position||!price)return 0;
  const direction=position.side==="LONG"?1:-1;
  return (price-position.entry)*position.qty*direction;
}

function equity(){return STARTING_EQUITY+realizedPnL+unrealizedPnL();}

function closePosition(reason:string){
  if(!position||!price)return;
  const closed=position;
  const direction=closed.side==="LONG"?1:-1;
  const pnl=(price-closed.entry)*closed.qty*direction;
  realizedPnL+=pnl;
  if(pnl>=0){
    wins++;
    stress=Math.max(0,stress-(7+Math.min(8,pnl/20)));
  }else{
    losses++;
    stress=Math.min(100,stress+(10+Math.min(18,Math.abs(pnl)/14)));
  }
  addEvent((pnl>=0?"✓ ":"✕ ")+closed.side+" closed "+money(pnl)+" · "+reason);
  position=null;
}

function openPosition(side:"LONG"|"SHORT",confidence:number){
  if(!price)return;
  const qty=TRADE_NOTIONAL/price;
  position={side,entry:price,qty,openedTick:tick};
  addEvent("→ "+side+" "+symbol+" @ "+price.toFixed(2)+" · "+Math.round(confidence*100)+"% brain confidence");
}

function onFreshMarketTick(){
  if(!breakMode&&position&&tick-position.openedTick>=MAX_HOLD_TICKS) closePosition("time exit");
  const absMove=returns.length?Math.abs(returns[returns.length-1]):0;
  stress=Math.min(100,stress+Math.max(0,absMove-.0025)*650);
}

function stopCryptoSocket(){
  if(cryptoReconnectTimer!=null){window.clearTimeout(cryptoReconnectTimer);cryptoReconnectTimer=null;}
  if(cryptoSocket){
    cryptoSocket.onclose=null;
    cryptoSocket.onerror=null;
    cryptoSocket.close();
    cryptoSocket=null;
  }
}

function ingestCryptoTrade(nextPrice:number,eventTime:number){
  if(!Number.isFinite(nextPrice)||nextPrice<=0)return;
  const prev=price||nextPrice;
  price=nextPrice;
  cryptoTradeCounter++;
  const shouldSample=cryptoTradeCounter%4===0 || prices.length<20;
  if(shouldSample){
    prices.push(nextPrice);
    while(prices.length>96)prices.shift();
    rebuildReturns();
    tick++;
    const move=prev?Math.abs((nextPrice-prev)/prev):0;
    stress=Math.min(100,stress+Math.max(0,move-.00018)*1450);
    onFreshMarketTick();
    updateChart();
  }
  lastFetchAt=Date.now();
  feedState="live";
  feedDetail="Binance BTCUSDT trade stream · "+new Date(eventTime).toLocaleTimeString();
  renderFeedState();
}

function startCryptoSocket(){
  stopCryptoSocket();
  feedState="loading";feedDetail="opening BTCUSDT WebSocket";renderFeedState();
  const ws=new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@trade");
  cryptoSocket=ws;
  ws.onopen=()=>{
    feedState="live";
    feedDetail="Binance BTCUSDT public trade stream · connected";
    renderFeedState();
    addEvent("● BTCUSDT WebSocket connected · continuous market");
  };
  ws.onmessage=(event)=>{
    try{
      const msg=JSON.parse(String(event.data));
      ingestCryptoTrade(Number(msg.p),Number(msg.T||msg.E||Date.now()));
    }catch{}
  };
  ws.onerror=()=>{
    feedState="error";feedDetail="BTC WebSocket error";renderFeedState();
  };
  ws.onclose=()=>{
    if(symbol!=="BTCUSDT")return;
    feedState="delayed";feedDetail="BTC stream reconnecting";renderFeedState();
    cryptoReconnectTimer=window.setTimeout(()=>startCryptoSocket(),1800);
  };
}

async function fetchMarket(){
  if(symbol==="BTCUSDT")return;
  try{
    const res=await fetch("/api/market?symbol="+encodeURIComponent(symbol),{cache:"no-store"});
    const data=await res.json() as MarketResponse;
    if(!res.ok||data.error)throw new Error(data.error||("HTTP "+res.status));
    lastFetchAt=Date.now();

    const incoming=data.points.filter(p=>Number.isFinite(p.p)).map(p=>p.p);
    if(incoming.length>=2){
      prices.splice(0,prices.length,...incoming.slice(-96));
      rebuildReturns();
    }

    const nextPrice=Number(data.price);
    const lastTs=data.regularMarketTime||data.points[data.points.length-1]?.t||0;
    const identity=lastTs+":"+nextPrice.toFixed(4);
    const changed=identity!==lastMarketIdentity;
    price=nextPrice;

    if(prices.length===0)prices.push(price);
    else if(Math.abs(prices[prices.length-1]-price)>1e-8){
      prices.push(price);
      while(prices.length>96)prices.shift();
      rebuildReturns();
    }

    feedState=data.delayed?"delayed":"live";
    feedDetail=(data.exchangeName||"market")+" · "+(data.ageSec==null?"age unknown":data.ageSec+"s old");
    if(changed){
      lastMarketIdentity=identity;
      tick++;
      onFreshMarketTick();
    }
    updateChart();
  }catch(error){
    feedState="error";
    feedDetail=error instanceof Error?error.message:String(error);
    addEvent("feed error · "+feedDetail);
  }
  renderFeedState();
}

function renderFeedState(){
  feedStatusEl.dataset.state=feedState;
  feedStatusEl.textContent=feedState==="live"
    ? (symbol==="BTCUSDT"?"LIVE WEBSOCKET":"LIVE / BEST-EFFORT")
    : feedState==="delayed"
      ? "DELAYED / MARKET IDLE"
      : feedState==="error"
        ? "FEED ERROR"
        : "CONNECTING";
  feedStatusEl.title=feedDetail;
}

function switchSymbol(next:string){
  if(next===symbol)return;
  closePosition("symbol switch");
  stopCryptoSocket();
  symbol=next;
  prices.length=0;
  returns.length=0;
  price=0;
  tick=0;
  lastMarketIdentity="";
  lastDecisionTick=-1;
  feedState="loading";
  renderFeedState();
  tickerButtons.forEach(b=>b.classList.toggle("active",b.dataset.symbol===symbol));
  addEvent("symbol → "+symbol+" · portfolio preserved");
  if(symbol==="BTCUSDT") startCryptoSocket();
  else void fetchMarket();
}

tickerButtons.forEach(button=>{
  button.addEventListener("click",()=>switchSymbol(button.dataset.symbol||"NVDA"));
});

const scene=new THREE.Scene();
scene.background=new THREE.Color(0xf3a66d);
scene.fog=new THREE.Fog(0xe8a774,38,110);

const camera=new THREE.PerspectiveCamera(47,innerWidth/innerHeight,.1,140);
camera.position.set(8.7,5.2,9.6);

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.15;
worldEl.appendChild(renderer.domElement);

const controls=new OrbitControls(camera,renderer.domElement);
controls.target.set(0,2.45,-.25);
controls.enableDamping=true;
controls.dampingFactor=.065;
controls.enablePan=false;
controls.enableZoom=true;
controls.minDistance=4.4;
controls.maxDistance=12.8;
controls.minPolarAngle=.48;
controls.maxPolarAngle=1.48;
controls.rotateSpeed=.55;
controls.zoomSpeed=.7;
controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;
controls.mouseButtons.MIDDLE=THREE.MOUSE.DOLLY;
controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;
controls.update();

scene.add(new THREE.HemisphereLight(0xffd7b0,0x6d5d58,2.55));
const sun=new THREE.DirectionalLight(0xff9a58,5.2);
sun.position.set(-13,10,-4);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-14;sun.shadow.camera.right=14;
sun.shadow.camera.top=14;sun.shadow.camera.bottom=-14;
scene.add(sun);

const fill=new THREE.DirectionalLight(0xf1c8bc,1.55);
fill.position.set(8,8,-12);scene.add(fill);

function material(color:number,rough=.72,metal=.03){
  return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal});
}
function addBox(
  size:[number,number,number],
  pos:[number,number,number],
  color:number,
  rough=.72,
  metal=.03,
  parent:THREE.Object3D=scene
){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material(color,rough,metal));
  mesh.position.set(...pos);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}

addBox([17,.22,15],[0,-.12,0],0xd8c4a4,.88);
addBox([17,.20,15],[0,7.85,0],0xf7f6f1,.95);
addBox([17,1.05,.22],[0,.45,-5.55],0xf3f1eb,.94);
addBox([17,.9,.22],[0,7.4,-5.55],0xf3f1eb,.94);

const windowGlass=new THREE.Mesh(
  new THREE.PlaneGeometry(15.6,6.0),
  new THREE.MeshPhysicalMaterial({
    color:0xcbe9f7,transparent:true,opacity:.18,roughness:.08,metalness:0,
    transmission:.72,thickness:.08,side:THREE.DoubleSide
  })
);
windowGlass.position.set(0,3.82,-5.43);
scene.add(windowGlass);

for(const x of [-5.25,0,5.25]) addBox([.13,6.1,.16],[x,3.82,-5.39],0xd6dde0,.3,.65);
addBox([15.7,.13,.16],[0,3.84,-5.39],0xd6dde0,.3,.65);

// Warm procedural sunset beyond the glass.
const skyCanvas=document.createElement("canvas");
skyCanvas.width=16;skyCanvas.height=512;
const skyCtx=skyCanvas.getContext("2d")!;
const skyGradient=skyCtx.createLinearGradient(0,0,0,512);
skyGradient.addColorStop(0,"#6b77b8");
skyGradient.addColorStop(.40,"#e38c82");
skyGradient.addColorStop(.70,"#f8b56f");
skyGradient.addColorStop(1,"#f5d6a3");
skyCtx.fillStyle=skyGradient;skyCtx.fillRect(0,0,16,512);
const skyTexture=new THREE.CanvasTexture(skyCanvas);
skyTexture.colorSpace=THREE.SRGBColorSpace;
const skyPlane=new THREE.Mesh(new THREE.PlaneGeometry(120,58),new THREE.MeshBasicMaterial({map:skyTexture,toneMapped:false}));
skyPlane.position.set(0,21,-72);scene.add(skyPlane);

const sunDisk=new THREE.Mesh(new THREE.CircleGeometry(3.5,48),new THREE.MeshBasicMaterial({color:0xffdf9b,toneMapped:false}));
sunDisk.position.set(-19,12,-66);scene.add(sunDisk);

const skyline=new THREE.Group();
skyline.position.set(0,0,-31);
scene.add(skyline);

const river=new THREE.Mesh(
  new THREE.PlaneGeometry(80,24),
  new THREE.MeshStandardMaterial({color:0x83b9d4,roughness:.28,metalness:.08})
);
river.rotation.x=-Math.PI/2;
river.position.set(0,-.03,9);
skyline.add(river);

const cityMatA=material(0x9aa6ae,.78,.08);
const cityMatB=material(0x778692,.75,.12);
const cityMatC=material(0xb7c0c4,.8,.05);
const cityMaterials=[cityMatA,cityMatB,cityMatC];
for(let i=0;i<46;i++){
  const x=-25+i*1.12+(i%3)*.16;
  const depth=-4-(i%5)*1.1;
  const h=2.2+((i*37)%10)*.58;
  const w=.65+((i*19)%4)*.13;
  const d=.9+((i*11)%3)*.34;
  const building=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),cityMaterials[i%cityMaterials.length]);
  building.position.set(x,h/2,depth);
  skyline.add(building);
}
const oneWorld=addBox([1.7,13.5,1.8],[-5.8,6.75,-5.8],0x8799a6,.42,.32,skyline);
const crown=new THREE.Mesh(new THREE.ConeGeometry(.68,3.1,5),material(0xa8b8c0,.35,.28));
crown.position.set(-5.8,15.05,-5.8);skyline.add(crown);
const spire=new THREE.Mesh(new THREE.CylinderGeometry(.055,.095,3.5,8),material(0x707d84,.32,.45));
spire.position.set(-5.8,18.15,-5.8);skyline.add(spire);
oneWorld.castShadow=false;

const empire=addBox([1.45,9.5,1.45],[8.2,4.75,-8.6],0xa9a49a,.78,.06,skyline);
const empireTop=addBox([.9,2.1,.9],[8.2,10.55,-8.6],0x9e9b93,.7,.08,skyline);
const empireSpire=new THREE.Mesh(new THREE.CylinderGeometry(.05,.08,2.7,8),material(0x8e9190,.5,.25));
empireSpire.position.set(8.2,12.95,-8.6);skyline.add(empireSpire);
empire.castShadow=false;empireTop.castShadow=false;

// Street grid directly below the office so traffic remains visible through the open sides.
const roads=new THREE.Group();
scene.add(roads);
const asphalt=material(0x34363a,.96,.01);
const sidewalkMat=material(0xa59d94,.9,.02);
for(const z of [-10.5,-15.2,-20.0]){
  const road=new THREE.Mesh(new THREE.PlaneGeometry(42,3.3),asphalt);
  road.rotation.x=-Math.PI/2;road.position.set(0,.035,z);roads.add(road);
  const s1=new THREE.Mesh(new THREE.PlaneGeometry(42,.65),sidewalkMat);
  s1.rotation.x=-Math.PI/2;s1.position.set(0,.07,z-1.95);roads.add(s1);
  const s2=s1.clone();s2.position.z=z+1.95;roads.add(s2);
  for(let x=-20;x<=20;x+=2.2){
    const mark=new THREE.Mesh(new THREE.PlaneGeometry(1.05,.055),new THREE.MeshBasicMaterial({color:0xf2d878}));
    mark.rotation.x=-Math.PI/2;mark.position.set(x,.08,z);roads.add(mark);
  }
}
for(const x of [-9.5,10.5]){
  const road=new THREE.Mesh(new THREE.PlaneGeometry(3.4,15),asphalt);
  road.rotation.x=-Math.PI/2;road.position.set(x,.04,-15.2);roads.add(road);
}
for(let i=0;i<18;i++){
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.045,.06,2.4,8),material(0x3d4347,.55,.35));
  const z=-9.4-(i%3)*4.7;
  pole.position.set(-18+i*2.05,1.2,z-2.15);roads.add(pole);
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(.11,10,8),new THREE.MeshBasicMaterial({color:0xffc777}));
  lamp.position.set(pole.position.x,2.34,pole.position.z);roads.add(lamp);
}

class TrafficBrain{
  state=0;
  memory=0;
  constructor(public readonly id:number,private readonly w:number[]){}
  step(speed:number,front:number,laneBias:number,dt:number){
    const x0=clamp(speed/7,0,1);
    const x1=clamp(front/8,0,1);
    this.memory=Math.tanh(this.memory*.78 + x0*this.w[0] + x1*this.w[1] + laneBias*this.w[2]);
    this.state=Math.tanh(this.state*.56 + this.memory*this.w[3] + (1-x1)*this.w[4]);
    const throttle=clamp(.58+this.state*.32+x1*.20,0,1);
    const brake=clamp((1-x1)*.92-this.state*.12,0,1);
    const steer=Math.tanh(laneBias*.45+this.memory*.18)*dt;
    return {throttle,brake,steer};
  }
}
type TrafficCar={mesh:THREE.Group;brain:TrafficBrain;speed:number;lane:number;dir:1|-1;roadZ:number;phase:number};
const traffic:TrafficCar[]=[];
const carColors=[0xd9544d,0x2f76c7,0xe7b64b,0xe9e7df,0x25282c,0x5d9c67,0x9b68b5,0xd77735];

function seededWeights(seed:number){
  let s=seed>>>0;
  const out:number[]=[];
  for(let i=0;i<5;i++){
    s=(s*1664525+1013904223)>>>0;
    out.push(((s/4294967295)*2-1)*1.35);
  }
  return out;
}
function makeCar(color:number){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.05,.36,.55),material(color,.55,.12));
  body.position.y=.32;g.add(body);
  const cabin=new THREE.Mesh(new THREE.BoxGeometry(.55,.28,.48),material(0xb8d0dc,.25,.24));
  cabin.position.set(-.08,.62,0);g.add(cabin);
  for(const sx of [-.32,.32])for(const sz of [-.31,.31]){
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.10,12),material(0x1f2022,.8,.05));
    wheel.rotation.x=Math.PI/2;wheel.position.set(sx,.18,sz);g.add(wheel);
  }
  return g;
}
for(let i=0;i<16;i++){
  const roadZ=[-10.5,-15.2,-20.0][i%3];
  const lane=(i%2===0?-0.78:.78);
  const dir:(1|-1)=i%2===0?1:-1;
  const mesh=makeCar(carColors[i%carColors.length]);
  mesh.position.set(-20+(i*3.15)%40,.12,roadZ+lane);
  mesh.rotation.y=dir===1?Math.PI/2:-Math.PI/2;
  scene.add(mesh);
  traffic.push({
    mesh,brain:new TrafficBrain(i+1,seededWeights(9001+i*7919)),
    speed:2.2+(i%5)*.42,lane,dir,roadZ,phase:i*.47
  });
}
function updateTraffic(dt:number,time:number){
  for(let i=0;i<traffic.length;i++){
    const car=traffic[i];
    let front=8;
    for(let j=0;j<traffic.length;j++){
      if(i===j)continue;
      const other=traffic[j];
      if(other.roadZ!==car.roadZ||other.dir!==car.dir)continue;
      const dx=(other.mesh.position.x-car.mesh.position.x)*car.dir;
      if(dx>0&&dx<front)front=dx;
    }
    const laneBias=Math.sin(time*.23+car.phase)*.18;
    const action=car.brain.step(car.speed,front,laneBias,dt);
    car.speed+=((action.throttle*5.2-action.brake*7.6)-car.speed*.34)*dt;
    car.speed=clamp(car.speed,.45,6.4);
    car.mesh.position.x+=car.dir*car.speed*dt;
    car.mesh.position.z=THREE.MathUtils.damp(car.mesh.position.z,car.roadZ+car.lane+action.steer,4,dt);
    if(car.dir===1&&car.mesh.position.x>22)car.mesh.position.x=-22;
    if(car.dir===-1&&car.mesh.position.x<-22)car.mesh.position.x=22;
  }
}

const desk=addBox([8.4,.30,3.25],[0,1.46,-.35],0xe9dfcf,.62);
addBox([.22,1.55,.22],[-3.45,.68,-1.55],0x9ba5a9,.3,.72);
addBox([.22,1.55,.22],[3.45,.68,-1.55],0x9ba5a9,.3,.72);
addBox([.22,1.55,.22],[-3.45,.68,.82],0x9ba5a9,.3,.72);
addBox([.22,1.55,.22],[3.45,.68,.82],0x9ba5a9,.3,.72);

const chartCanvas=document.createElement("canvas");
chartCanvas.width=1000;chartCanvas.height=560;
const chartCtx=chartCanvas.getContext("2d")!;
const chartTexture=new THREE.CanvasTexture(chartCanvas);
chartTexture.colorSpace=THREE.SRGBColorSpace;
chartTexture.minFilter=THREE.LinearFilter;

addBox([5.7,3.45,.17],[0,3.44,-1.68],0x26323a,.34,.28);
const screen=new THREE.Mesh(
  new THREE.PlaneGeometry(5.35,3.06),
  new THREE.MeshBasicMaterial({map:chartTexture,toneMapped:false})
);
screen.position.set(0,3.44,-1.575);scene.add(screen);
addBox([.20,1.12,.20],[0,1.96,-1.69],0x9aa3a8,.28,.72);
addBox([2.0,.12,.75],[0,1.46,-1.69],0x9aa3a8,.28,.72);

const sideScreenCanvas=document.createElement("canvas");
sideScreenCanvas.width=500;sideScreenCanvas.height=560;
const sideCtx=sideScreenCanvas.getContext("2d")!;
const sideTexture=new THREE.CanvasTexture(sideScreenCanvas);
sideTexture.colorSpace=THREE.SRGBColorSpace;
addBox([2.7,3.45,.16],[-4.0,3.42,-1.46],0x26323a,.34,.28);
const sideScreen=new THREE.Mesh(new THREE.PlaneGeometry(2.43,3.05),new THREE.MeshBasicMaterial({map:sideTexture,toneMapped:false}));
sideScreen.position.set(-4.0,3.42,-1.37);scene.add(sideScreen);

const keyboard=addBox([2.55,.09,.78],[0,1.67,.34],0xe9ecec,.52,.08);
keyboard.rotation.x=-.05;
const mouse=addBox([.42,.14,.62],[1.85,1.72,.28],0xdfe4e5,.42,.06);
mouse.rotation.x=-.05;

const mug=new THREE.Mesh(new THREE.CylinderGeometry(.22,.19,.52,20),material(0xf6f7f2,.45,.02));
mug.position.set(-2.45,1.88,.05);mug.castShadow=true;scene.add(mug);

const plantPot=new THREE.Mesh(new THREE.CylinderGeometry(.38,.31,.62,16),material(0xb98563,.75,.02));
plantPot.position.set(5.8,.31,-3.7);scene.add(plantPot);
for(let i=0;i<8;i++){
  const leaf=new THREE.Mesh(new THREE.SphereGeometry(.34,12,8),material(0x5b8d5d,.72,.01));
  leaf.scale.set(.65,1.6,.55);
  leaf.position.set(5.8+Math.cos(i*.8)*.42,1.0+((i%3)*.26),-3.7+Math.sin(i*.8)*.36);
  leaf.rotation.z=Math.sin(i)*.55;scene.add(leaf);
}

const chair=new THREE.Group();
const seat=new THREE.Mesh(new THREE.BoxGeometry(1.7,.22,1.6),material(0xc7d0d3,.58,.08));
seat.position.y=1.18;seat.castShadow=true;chair.add(seat);
const back=new THREE.Mesh(new THREE.BoxGeometry(1.75,2.25,.22),material(0xb8c5ca,.58,.08));
back.position.set(0,2.15,1.0);back.rotation.x=-.09;back.castShadow=true;chair.add(back);
chair.position.z=1.62;scene.add(chair);

const fly=new THREE.Group();
const deskFlyPosition=new THREE.Vector3(0,2.05,1.32);
const windowFlyPosition=new THREE.Vector3(3.15,1.55,-4.35);
fly.position.copy(deskFlyPosition);
fly.rotation.y=0;
const bodyMat=material(0x4a4032,.57,.05);
const darkMat=material(0x242321,.52,.04);
const eyeMat=material(0xa52228,.32,.18);
const wingMat=new THREE.MeshPhysicalMaterial({color:0xd8e9ef,transparent:true,opacity:.45,roughness:.1,transmission:.25,side:THREE.DoubleSide});

const abdomen=new THREE.Mesh(new THREE.SphereGeometry(.48,28,18),bodyMat);
abdomen.scale.set(.82,.9,1.42);abdomen.position.set(0,.08,.3);abdomen.castShadow=true;fly.add(abdomen);
const thorax=new THREE.Mesh(new THREE.SphereGeometry(.48,28,18),darkMat);
thorax.scale.set(.9,.92,.95);thorax.position.set(0,.15,-.3);thorax.castShadow=true;fly.add(thorax);
const head=new THREE.Mesh(new THREE.SphereGeometry(.37,26,18),bodyMat);
head.scale.set(1,.92,.9);head.position.set(0,.2,-.85);head.castShadow=true;fly.add(head);
for(const side of [-1,1]){
  const eye=new THREE.Mesh(new THREE.SphereGeometry(.2,20,14),eyeMat);
  eye.scale.set(.72,1,1);eye.position.set(side*.28,.27,-1.08);fly.add(eye);
  const wing=new THREE.Mesh(new THREE.CircleGeometry(.58,30),wingMat);
  wing.scale.set(.62,1.55,1);wing.position.set(side*.48,.42,.05);
  wing.rotation.set(Math.PI/2,side*.35,side*.25);fly.add(wing);
}
const proboscis=new THREE.Mesh(new THREE.CylinderGeometry(.035,.055,.38,10),darkMat);
proboscis.rotation.x=Math.PI/2;proboscis.position.set(0,.08,-1.18);fly.add(proboscis);
const legMat=material(0x34312b,.65,.03);
function limb(a:THREE.Vector3,b:THREE.Vector3){
  const dir=b.clone().sub(a),len=dir.length();
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.026,.034,len,8),legMat);
  mesh.position.copy(a.clone().add(b).multiplyScalar(.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());
  fly.add(mesh);
}
for(const s of [-1,1]){
  limb(new THREE.Vector3(s*.33,.05,-.25),new THREE.Vector3(s*.72,-.25,-.75));
  limb(new THREE.Vector3(s*.35,.05,-.05),new THREE.Vector3(s*.78,-.38,.08));
  limb(new THREE.Vector3(s*.34,.08,.2),new THREE.Vector3(s*.65,-.35,.75));
}
scene.add(fly);

const cigarette=new THREE.Group();
const paper=new THREE.Mesh(new THREE.CylinderGeometry(.032,.032,.62,12),material(0xf2eee3,.8,.01));
paper.rotation.x=Math.PI/2;cigarette.add(paper);
const ember=new THREE.Mesh(new THREE.SphereGeometry(.044,10,8),new THREE.MeshBasicMaterial({color:0xff5d32}));
ember.position.z=-.32;cigarette.add(ember);
const filter=new THREE.Mesh(new THREE.CylinderGeometry(.034,.034,.15,12),material(0xc28b55,.8,.01));
filter.rotation.x=Math.PI/2;filter.position.z=.235;cigarette.add(filter);
cigarette.position.set(.12,2.08,.04);cigarette.rotation.y=Math.PI;cigarette.visible=false;scene.add(cigarette);

type Smoke={mesh:THREE.Mesh;life:number;speed:number};
const smokes:Smoke[]=[];
const smokeGeo=new THREE.SphereGeometry(.1,12,8);
let smokeClock=0;
let smoking=false;

function spawnSmoke(){
  const mat=new THREE.MeshBasicMaterial({color:0xb8c2c6,transparent:true,opacity:.22,depthWrite:false});
  const mesh=new THREE.Mesh(smokeGeo,mat);
  mesh.position.copy(cigarette.position).add(new THREE.Vector3(0,.08,-.34));
  mesh.scale.setScalar(.6+Math.random()*.5);
  scene.add(mesh);smokes.push({mesh,life:0,speed:.18+Math.random()*.14});
}

function updateSmoking(dt:number,time:number){
  if(breakMode||stress>62)smoking=true;
  if(!breakMode&&stress<40)smoking=false;

  const cigaretteOffset=new THREE.Vector3(.12,.12,-1.18).applyAxisAngle(new THREE.Vector3(0,1,0),fly.rotation.y);
  cigarette.position.copy(fly.position).add(cigaretteOffset);
  cigarette.rotation.y=fly.rotation.y;
  cigarette.visible=smoking;ember.visible=smoking;
  if(smoking){
    cigarette.position.y+=Math.sin(time*2.3)*.018;
    smokeClock+=dt;
    if(smokeClock>.22){smokeClock=0;spawnSmoke();}
  }
  for(let i=smokes.length-1;i>=0;i--){
    const s=smokes[i];s.life+=dt;s.mesh.position.y+=s.speed*dt;s.mesh.position.x+=Math.sin(s.life*3+i)*dt*.035;
    const mat=s.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity=Math.max(0,.22*(1-s.life/2.7));s.mesh.scale.multiplyScalar(1+dt*.18);
    if(s.life>2.7){scene.remove(s.mesh);mat.dispose();smokes.splice(i,1);}
  }
}

function updateChart(){
  const w=chartCanvas.width,h=chartCanvas.height;
  chartCtx.fillStyle="#f7fbfd";chartCtx.fillRect(0,0,w,h);
  chartCtx.strokeStyle="rgba(34,61,77,.10)";chartCtx.lineWidth=1;
  for(let i=1;i<6;i++){const y=i*h/6;chartCtx.beginPath();chartCtx.moveTo(0,y);chartCtx.lineTo(w,y);chartCtx.stroke();}
  for(let i=1;i<8;i++){const x=i*w/8;chartCtx.beginPath();chartCtx.moveTo(x,0);chartCtx.lineTo(x,h);chartCtx.stroke();}

  const view=prices.slice(-72);
  if(view.length>=2){
    let min=Math.min(...view),max=Math.max(...view);
    const pad=Math.max(.01,(max-min)*.18);min-=pad;max+=pad;
    const rising=view[view.length-1]>=view[0];
    chartCtx.strokeStyle=rising?"#15945a":"#dc5151";chartCtx.lineWidth=6;chartCtx.lineJoin="round";chartCtx.lineCap="round";
    chartCtx.beginPath();
    view.forEach((p,i)=>{
      const x=28+i/Math.max(1,view.length-1)*(w-56);
      const y=h-52-(p-min)/(max-min)*(h-112);
      if(i===0)chartCtx.moveTo(x,y);else chartCtx.lineTo(x,y);
    });
    chartCtx.stroke();
  }
  chartCtx.fillStyle="#1d303b";chartCtx.font="800 34px ui-monospace, monospace";
  chartCtx.fillText(symbol+"  "+(price?price.toFixed(2):"—"),28,46);
  const m=momentum()*100;
  chartCtx.fillStyle=m>=0?"#15945a":"#dc5151";
  chartCtx.font="750 19px ui-monospace, monospace";
  chartCtx.fillText((m>=0?"+":"")+m.toFixed(2)+"% momentum",28,76);
  chartCtx.fillStyle="#667781";chartCtx.font="650 15px ui-monospace, monospace";
  chartCtx.fillText(
    breakMode?"STRESS BREAK · MARKET WATCH PAUSED":
    symbol==="BTCUSDT"?"BTCUSDT LIVE TRADE STREAM · PAPER ONLY":
    feedState==="live"?"REAL EQUITY FEED · PAPER ONLY":feedState.toUpperCase()+" · PAPER ONLY",
    28,h-22
  );

  const pnl=unrealizedPnL();
  chartCtx.fillStyle="#1d303b";chartCtx.font="700 17px ui-monospace, monospace";
  chartCtx.fillText(position?position.side+" @ "+position.entry.toFixed(2):"FLAT",w-300,46);
  chartCtx.fillStyle=pnl>=0?"#15945a":"#dc5151";
  chartCtx.fillText("uPnL "+money(pnl),w-300,74);
  chartTexture.needsUpdate=true;

  sideCtx.fillStyle="#17242d";sideCtx.fillRect(0,0,sideScreenCanvas.width,sideScreenCanvas.height);
  sideCtx.fillStyle="#dbe7ec";sideCtx.font="800 28px ui-monospace, monospace";
  sideCtx.fillText("FLY FUND",28,48);
  sideCtx.fillStyle="#8ea4af";sideCtx.font="650 16px ui-monospace, monospace";
  const lines=[
    "EQUITY  "+money(equity()),
    "REALIZED "+money(realizedPnL),
    "POSITION "+(position?.side||"FLAT"),
    "W / L  "+wins+" / "+losses,
    "STRESS "+Math.round(stress)+"/100",
    "MODE "+(breakMode?"WINDOW BREAK":"TRADING"),
    "BRAIN SIGNAL",
    breakMode?"REST":(decisionEl.textContent||"HOLD")
  ];
  lines.forEach((line,i)=>{
    sideCtx.fillStyle=i===7?(decisionEl.dataset.side==="DOWN"?"#ff8d8d":decisionEl.dataset.side==="UP"?"#77e5a9":"#e3c77b"):"#dbe7ec";
    sideCtx.font=i===7?"900 38px ui-monospace, monospace":"650 18px ui-monospace, monospace";
    sideCtx.fillText(line,28,100+i*50);
  });
  sideTexture.needsUpdate=true;
}

function handleDecision(d:StockBrainDecision){
  if(breakMode){
    decisionEl.textContent="BREAK";
    decisionEl.dataset.side="WAIT";
    callNoteEl.textContent="away from desk · watching New York · trading paused";
    return;
  }
  const label=d.side==="UP"?"BUY":d.side==="DOWN"?"SHORT":"HOLD";
  decisionEl.textContent=label;
  decisionEl.dataset.side=d.side;
  callNoteEl.textContent=Math.round(d.confidence*100)+"% confidence · signal "+d.signal.toFixed(2)+" · tick "+d.tick;
  updateChart();

  if(d.tick===lastDecisionTick||d.tick<=0||!price)return;
  lastDecisionTick=d.tick;

  if(d.side==="WAIT"){
    addEvent("· HOLD "+symbol+" @ "+price.toFixed(2));
    return;
  }
  const desired=d.side==="UP"?"LONG":"SHORT";
  if(position?.side===desired){
    addEvent("· KEEP "+desired+" "+symbol+" · "+money(unrealizedPnL()));
    return;
  }
  if(position)closePosition("brain reversed");
  openPosition(desired,d.confidence);
}

const brain=new StockBrain({
  getSnapshot:()=>({prices:[...prices],momentum:momentum(),volatility:volatility(),stress,tick,resting:breakMode}),
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

function updateStressHud(){
  stressFillEl.style.width=clamp(stress,0,100).toFixed(1)+"%";
  stressValueEl.textContent=Math.round(stress)+" / 100";
  let state:"calm"|"tense"|"smoking"|"break"="calm";
  let label="TRADING";
  if(breakMode){state="break";label="WINDOW BREAK";}
  else if(stress>=62){state="smoking";label="SMOKING";}
  else if(stress>=45){state="tense";label="TENSE";}
  stressStateEl.dataset.state=state;
  stressStateEl.textContent=label;
}

function updateBreakBehavior(dt:number,time:number){
  if(!breakMode&&stress>=BREAK_ENTER_STRESS){
    breakMode=true;
    if(position)closePosition("stress break");
    decisionEl.textContent="BREAK";
    decisionEl.dataset.side="WAIT";
    callNoteEl.textContent="too stressed · leaving desk to watch New York";
    addEvent("☕ STRESS BREAK · leaves desk, city view + cigarette");
    updateChart();
  }else if(breakMode&&stress<=BREAK_EXIT_STRESS){
    breakMode=false;
    lastDecisionTick=-1;
    decisionEl.textContent="HOLD";
    decisionEl.dataset.side="WAIT";
    callNoteEl.textContent="calmed down · returning to trading desk";
    addEvent("↩ CALM AGAIN · returns to desk and resumes trading");
    updateChart();
  }

  const target=breakMode?windowFlyPosition:deskFlyPosition;
  const targetPos=target.clone();
  targetPos.y+=breakMode?Math.sin(time*.8)*.015:Math.sin(time*2.1)*.025;
  fly.position.lerp(targetPos,1-Math.exp(-dt*(breakMode?1.05:1.45)));
  const targetYaw=0;
  fly.rotation.y=THREE.MathUtils.damp(fly.rotation.y,targetYaw,3.5,dt);
  fly.rotation.z=THREE.MathUtils.damp(fly.rotation.z,breakMode?0:Math.sin(time*.85)*.018,3.2,dt);

  stress=Math.max(0,stress-dt*(breakMode?2.8:.12));
  updateStressHud();
}

function updateHud(){
  const prev=prices.length>1?prices[prices.length-2]:price;
  const change=price&&prev?((price-prev)/prev*100):0;
  const staleSec=lastFetchAt?Math.floor((Date.now()-lastFetchAt)/1000):0;
  telemetryEl.innerHTML=[
    '<div class="metric"><span>symbol / price</span><b>'+symbol+' '+(price?price.toFixed(2):'—')+'</b></div>',
    '<div class="metric"><span>last move</span><b>'+(change>=0?'+':'')+change.toFixed(3)+'%</b></div>',
    '<div class="metric"><span>position</span><b>'+(position?.side||'FLAT')+'</b></div>',
    '<div class="metric"><span>unrealized</span><b>'+money(unrealizedPnL())+'</b></div>',
    '<div class="metric"><span>equity</span><b>'+money(equity())+'</b></div>',
    '<div class="metric"><span>realized</span><b>'+money(realizedPnL)+'</b></div>',
    '<div class="metric"><span>W / L</span><b>'+wins+' / '+losses+'</b></div>',
    '<div class="metric"><span>behavior</span><b>'+(breakMode?'CITY BREAK':smoking?'SMOKING':'TRADING')+'</b></div>',
    '<div class="metric"><span>market tick</span><b>'+tick+'</b></div>',
    '<div class="metric"><span>feed poll</span><b>'+staleSec+'s ago</b></div>',
    '<div class="metric"><span>DN activity</span><b>'+(latestBrain.activity??0).toFixed(4)+'</b></div>',
    '<div class="metric"><span>volatility</span><b>'+(volatility()*100).toFixed(3)+'%</b></div>',
    '<div class="metric wide"><span>FlyWire</span><b>'+fmt(latestBrain.neurons)+' neurons · '+fmt(latestBrain.edges)+' edges</b></div>',
    '<div class="metric wide"><span>MANC</span><b>'+fmt(latestBrain.vncNeurons)+' neurons · '+fmt(latestBrain.vncEdges)+' edges</b></div>',
  ].join("");
}

const clock=new THREE.Clock();
let feedAccumulator=999;
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(.05,clock.getDelta());
  const time=clock.elapsedTime;
  feedAccumulator+=dt;
  if(feedAccumulator>=6){
    feedAccumulator=0;
    if(symbol!=="BTCUSDT")void fetchMarket();
  }
  updateBreakBehavior(dt,time);
  updateSmoking(dt,time);
  updateTraffic(dt,time);
  controls.update();
  updateHud();
  renderer.render(scene,camera);
}
animate();

renderFeedState();
updateChart();
startCryptoSocket();
addEvent("NYC sunset trading desk ready · BTC live stream connecting");
addEvent("full FlyWire trader evaluates live BTC samples · paper capital $10,000");
addEvent("16 independent traffic neural agents driving below");
addEvent("stress 62 → smoking · stress 78 → city break · return at 42");

window.addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});
