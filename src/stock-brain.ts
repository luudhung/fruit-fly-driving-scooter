import { loadBrain, type Brain } from "./brain";
import { FlySim, DEFAULT_PARAMS } from "./sim";
import { loadManifest } from "./manifest";

export type TradeSide = "UP" | "DOWN" | "WAIT";

export interface StockSnapshot {
  prices: number[];
  momentum: number;
  volatility: number;
  stress: number;
  tick: number;
}

export interface StockBrainStatus {
  stage: "loading" | "running" | "error";
  message: string;
  neurons?: number;
  edges?: number;
  vncNeurons?: number;
  vncEdges?: number;
  activity?: number;
  signal?: number;
}

export interface StockBrainDecision {
  side: TradeSide;
  confidence: number;
  signal: number;
  activity: number;
  tick: number;
}

export interface StockBrainOptions {
  getSnapshot: () => StockSnapshot;
  onStatus?: (status: StockBrainStatus) => void;
  onRetina?: (pixels: Uint8Array, w: number, h: number) => void;
  onDecision?: (decision: StockBrainDecision) => void;
}

const SUPER_SENSORY = 1;
const SUPER_OPTIC = 10;
const HERO_DN = 7;
const HERO_MBON = 2;

function clamp(v:number,min=0,max=1){return Math.max(min,Math.min(max,v));}

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

function drawLine(pixels:Uint8Array,w:number,h:number,x0:number,y0:number,x1:number,y1:number){
  let x=x0,y=y0;
  const dx=Math.abs(x1-x0),sx=x0<x1?1:-1;
  const dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;
  let err=dx+dy;
  for(;;){
    if(x>=0&&x<w&&y>=0&&y<h){
      const i=(y*w+x)*4;
      pixels[i]=104; pixels[i+1]=230; pixels[i+2]=151; pixels[i+3]=255;
    }
    if(x===x1&&y===y1)break;
    const e2=2*err;
    if(e2>=dy){err+=dy;x+=sx;}
    if(e2<=dx){err+=dx;y+=sy;}
  }
}

export class StockBrain {
  private running=false;
  private brain:Brain|null=null;
  private sim:FlySim|null=null;
  private ext:Float32Array|null=null;
  private opticLeft:number[]=[];
  private opticRight:number[]=[];
  private sensory:number[]=[];
  private dnLeft:number[]=[];
  private dnRight:number[]=[];
  private mbon:number[]=[];
  private vncInfo:{neurons:number;edges:number}|null=null;
  private lastDecisionAt=0;

  constructor(private readonly options:StockBrainOptions){}

  async start(){
    if(this.running)return;
    this.running=true;
    try{
      const adapter=await navigator.gpu?.requestAdapter();
      if(!adapter)throw new Error("WebGPU adapter unavailable");

      const versionFor=await loadManifest();
      const brainUrl=(import.meta.env.VITE_BRAIN_URL||"/brain.bin")+versionFor("brain.bin");
      this.emit({stage:"loading",message:"Loading full FlyWire connectome…"});

      this.brain=await loadBrain(brainUrl,(got,total)=>{
        const pct=total>0?Math.round(got/total*100):0;
        this.emit({
          stage:"loading",
          message:total>0
            ? `FlyWire ${pct}% · ${(got/1e6).toFixed(1)}/${(total/1e6).toFixed(1)} MB`
            : `FlyWire · ${(got/1e6).toFixed(1)} MB`,
        });
      });

      this.partition(this.brain);
      this.ext=new Float32Array(this.brain.header.numNeurons);
      this.sim=await FlySim.create(this.brain,{...DEFAULT_PARAMS});

      this.emit({
        stage:"running",
        message:"Full FlyWire brain online · market retina attached",
        neurons:this.brain.header.numNeurons,
        edges:this.brain.header.numEdges,
      });

      void this.loadVnc(versionFor);
      void this.loop();
    }catch(error){
      this.running=false;
      this.emit({stage:"error",message:error instanceof Error?error.message:String(error)});
    }
  }

  stop(){this.running=false;}

  private partition(brain:Brain){
    let cx=0,n=0;
    for(let i=0;i<brain.header.numNeurons;i++){
      const x=brain.neurons.pos[i*3];
      if(x!==0){cx+=x;n++;}
    }
    cx=n?cx/n:0;
    const ol:number[]=[],or:number[]=[],sens:number[]=[],dl:number[]=[],dr:number[]=[],mb:number[]=[];
    for(let i=0;i<brain.header.numNeurons;i++){
      const x=brain.neurons.pos[i*3];
      const sc=brain.neurons.superClass[i];
      const hero=brain.neurons.cellType[i]&0xff;
      if(sc===SUPER_OPTIC)(x<cx?ol:or).push(i);
      if(sc===SUPER_SENSORY)sens.push(i);
      if(hero===HERO_DN)(x<cx?dl:dr).push(i);
      if(hero===HERO_MBON)mb.push(i);
    }
    this.opticLeft=sampleEvenly(ol,4200);
    this.opticRight=sampleEvenly(or,4200);
    this.sensory=sampleEvenly(sens,2200);
    this.dnLeft=dl; this.dnRight=dr; this.mbon=mb;
  }

  private makeRetina(snapshot:StockSnapshot){
    const w=64,h=16,pixels=new Uint8Array(w*h*4);
    for(let i=0;i<pixels.length;i+=4){pixels[i]=5;pixels[i+1]=8;pixels[i+2]=10;pixels[i+3]=255;}
    const prices=snapshot.prices.slice(-w);
    if(prices.length<2)return {pixels,w,h};
    let min=Infinity,max=-Infinity;
    for(const p of prices){min=Math.min(min,p);max=Math.max(max,p);}
    const span=Math.max(0.001,max-min);
    const start=w-prices.length;
    let px=start;
    let py=h-1-Math.round((prices[0]-min)/span*(h-3))-1;
    for(let i=1;i<prices.length;i++){
      const x=start+i;
      const y=h-1-Math.round((prices[i]-min)/span*(h-3))-1;
      drawLine(pixels,w,h,px,py,x,y);
      px=x;py=y;
    }
    const split=Math.floor(w/2);
    for(let y=0;y<h;y++){
      const i=(y*w+split)*4;
      pixels[i]=38;pixels[i+1]=54;pixels[i+2]=63;pixels[i+3]=255;
    }
    return {pixels,w,h};
  }

  private applyInput(s:StockSnapshot){
    if(!this.ext)return;
    this.ext.fill(0);
    const trend=clamp(Math.abs(s.momentum)*8,0,1);
    const calm=1-clamp(s.volatility*12,0,1);
    const base=.22+calm*.08;
    const up=s.momentum>=0;
    const leftAmp=base+(up?trend*.45:trend*3.8);
    const rightAmp=base+(up?trend*3.8:trend*.45);
    for(const i of this.opticLeft)this.ext[i]=leftAmp;
    for(const i of this.opticRight)this.ext[i]=rightAmp;

    const arousal=.06+clamp(s.volatility*9,0,1)*1.5+clamp(s.stress/100,0,1)*.9;
    for(const i of this.sensory){
      if(this.ext[i]===0)this.ext[i]=arousal;
    }
  }

  private async loop(){
    if(!this.brain||!this.sim||!this.ext)return;
    while(this.running){
      const snapshot=this.options.getSnapshot();
      const retina=this.makeRetina(snapshot);
      this.options.onRetina?.(retina.pixels,retina.w,retina.h);
      this.applyInput(snapshot);
      this.sim.setExternalInput(this.ext);

      const rate=await this.sim.captureRollingRate(24);
      const l=meanAt(rate,this.dnLeft);
      const r=meanAt(rate,this.dnRight);
      const activity=l+r;
      const mbon=meanAt(rate,this.mbon);
      const asym=activity>.0004?(r-l)/(activity+.0005):0;
      const signal=Math.tanh(asym*2.15+(mbon-.01)*.35);

      this.emit({
        stage:"running",
        message:this.vncInfo?"FlyWire + MANC online · reading chart":"FlyWire online · MANC loading · reading chart",
        neurons:this.brain.header.numNeurons,
        edges:this.brain.header.numEdges,
        vncNeurons:this.vncInfo?.neurons,
        vncEdges:this.vncInfo?.edges,
        activity,signal,
      });

      const now=performance.now();
      if(now-this.lastDecisionAt>900){
        this.lastDecisionAt=now;
        const threshold=.105+clamp(snapshot.volatility*2.5,0,.13);
        const side:TradeSide=Math.abs(signal)<threshold?"WAIT":signal>0?"UP":"DOWN";
        const confidence=clamp(Math.abs(signal)*.88+activity*9.5,0,1);
        this.options.onDecision?.({side,confidence,signal,activity,tick:snapshot.tick});
      }

      await new Promise(r=>setTimeout(r,48));
    }
  }

  private async loadVnc(versionFor:(name:string)=>string){
    try{
      const url=(import.meta.env.VITE_VNC_URL||"/vnc.bin")+versionFor("vnc.bin");
      const vnc=await loadBrain(url);
      this.vncInfo={neurons:vnc.header.numNeurons,edges:vnc.header.numEdges};
    }catch{
      this.vncInfo=null;
    }
  }

  private emit(status:StockBrainStatus){this.options.onStatus?.(status);}
}
