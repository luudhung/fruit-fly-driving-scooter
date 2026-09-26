import { OpenWorld } from "./openworld-world";
import { OpenWorldBrain, type OpenWorldBrainStatus } from "./openworld-brain";

const worldEl=document.getElementById("world") as HTMLDivElement;
const brainStatus=document.getElementById("brain-status") as HTMLDivElement;
const brainDetail=document.getElementById("brain-detail") as HTMLDivElement;
const behavior=document.getElementById("behavior") as HTMLDivElement;
const telemetry=document.getElementById("telemetry") as HTMLDivElement;
const eventLog=document.getElementById("event-log") as HTMLDivElement;
const retina=document.getElementById("retina") as HTMLCanvasElement;
const rctx=retina.getContext("2d")!;
const retinaImg=rctx.createImageData(64,16);

const logLines:string[]=[];
const appendEvent=(line:string)=>{
  logLines.unshift(line);
  while(logLines.length>8)logLines.pop();
  eventLog.innerHTML=logLines.map(x=>'<div>'+x+'</div>').join("");
};

const world=new OpenWorld(worldEl,appendEvent);
let latestBrain:OpenWorldBrainStatus={stage:"loading",message:"Starting full FlyWire brain…" };

const brain=new OpenWorldBrain(world,{
  onStatus(status){
    latestBrain={...latestBrain,...status};
    brainStatus.dataset.state=status.stage;
    brainStatus.textContent=
      status.stage==="running"?"FULL BRAIN ONLINE":
      status.stage==="error"?"BRAIN ERROR":"LOADING FULL BRAIN";
    brainDetail.textContent=status.message;
  },
  onRetina(pixels,w,h){
    const dst=retinaImg.data;
    for(let y=0;y<h;y++){
      const src=(h-1-y)*w*4;
      const out=y*w*4;
      for(let i=0;i<w*4;i++)dst[out+i]=pixels[src+i];
    }
    rctx.putImageData(retinaImg,0,0);
  },
});
void brain.start();

function pct(v:number){return Math.round(v*100)+"%";}
function fmt(n:number|undefined){return n==null?"—":n.toLocaleString();}
function modeLabel(mode:string){
  if(mode==="fly")return "FLYING";
  if(mode==="feed")return "FEEDING";
  if(mode==="rest")return "RESTING";
  return "WALKING";
}

function tick(){
  const t=world.getTelemetry();
  behavior.dataset.mode=t.mode;
  behavior.innerHTML=
    '<b>'+modeLabel(t.mode)+'</b>'+
    '<span>energy '+Math.round(t.energy)+'%</span>'+
    '<span>odor '+pct(t.foodOdor)+'</span>'+
    '<span>danger '+pct(t.danger)+'</span>';

  telemetry.innerHTML=[
    '<div><span>nearest food</span><b>'+t.nearestFood+'</b></div>',
    '<div><span>distance</span><b>'+((Number.isFinite(t.foodDistance))?t.foodDistance.toFixed(1):"—")+' m</b></div>',
    '<div><span>nearest animal</span><b>'+t.nearestAnimal+'</b></div>',
    '<div><span>altitude</span><b>'+t.altitude.toFixed(2)+' m</b></div>',
    '<div><span>speed</span><b>'+t.speed.toFixed(2)+' m/s</b></div>',
    '<div><span>brain turn</span><b>'+t.brainTurn.toFixed(2)+'</b></div>',
    '<div><span>brain drive</span><b>'+t.brainDrive.toFixed(2)+'</b></div>',
    '<div><span>brain lift</span><b>'+t.brainLift.toFixed(2)+'</b></div>',
    '<div><span>brain feed</span><b>'+t.brainFeed.toFixed(2)+'</b></div>',
    '<div><span>DN activity</span><b>'+t.brainActivity.toFixed(4)+'</b></div>',
    '<div><span>food consumed</span><b>'+t.foodEaten.toFixed(1)+'</b></div>',
    '<div><span>takeoff / land</span><b>'+t.takeoffs+' / '+t.landings+'</b></div>',
    '<div class="wide"><span>FlyWire</span><b>'+fmt(latestBrain.neurons)+' neurons · '+fmt(latestBrain.edges)+' edges</b></div>',
    '<div class="wide"><span>MANC</span><b>'+fmt(latestBrain.vncNeurons)+' neurons · '+fmt(latestBrain.vncEdges)+' edges</b></div>',
  ].join("");
  requestAnimationFrame(tick);
}
tick();
