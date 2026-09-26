import { loadBrain, type Brain } from "./brain";
import { FlySim, DEFAULT_PARAMS } from "./sim";
import { loadManifest } from "./manifest";
import type { OpenWorld, OpenWorldSensory } from "./openworld-world";

export interface OpenWorldBrainStatus {
  stage: "loading" | "running" | "error";
  message: string;
  neurons?: number;
  edges?: number;
  vncNeurons?: number;
  vncEdges?: number;
  dnActivity?: number;
  gfActivity?: number;
  mbonActivity?: number;
  turn?: number;
  drive?: number;
  lift?: number;
  feed?: number;
}

export interface OpenWorldBrainOptions {
  onStatus?: (status: OpenWorldBrainStatus) => void;
  onRetina?: (pixels: Uint8Array, w: number, h: number) => void;
}

const SUPER_SENSORY = 1;
const SUPER_OPTIC = 10;
const HERO = { kenyon: 1, mbon: 2, lhn: 3, pn: 4, orn: 5, gf: 6, dn: 7 };

function meanAt(values: Float32Array, idxs: number[]) {
  if (!idxs.length) return 0;
  let sum = 0;
  for (const i of idxs) sum += values[i];
  return sum / idxs.length;
}

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

function sampleEvenly(values: number[], max: number) {
  if (values.length <= max) return values.slice();
  const out: number[] = [];
  const stride = values.length / max;
  for (let i = 0; i < max; i++) out.push(values[Math.floor(i * stride)]);
  return out;
}

export class OpenWorldBrain {
  private running = false;
  private brain: Brain | null = null;
  private sim: FlySim | null = null;
  private ext: Float32Array | null = null;

  private opticLeft: number[] = [];
  private opticRight: number[] = [];
  private sensory: number[] = [];
  private orn: number[] = [];
  private dnLeft: number[] = [];
  private dnRight: number[] = [];
  private gf: number[] = [];
  private mbon: number[] = [];
  private lhn: number[] = [];
  private pn: number[] = [];
  private vncInfo: { neurons: number; edges: number } | null = null;

  constructor(
    private readonly world: OpenWorld,
    private readonly options: OpenWorldBrainOptions = {},
  ) {}

  async start() {
    if (this.running) return;
    this.running = true;
    try {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU adapter unavailable");

      const versionFor = await loadManifest();
      const brainUrl = (import.meta.env.VITE_BRAIN_URL || "/brain.bin") + versionFor("brain.bin");
      this.emit({ stage:"loading", message:"Loading full FlyWire connectome…" });

      this.brain = await loadBrain(brainUrl, (got,total)=>{
        const pct = total > 0 ? Math.round(got / total * 100) : 0;
        this.emit({
          stage:"loading",
          message: total > 0
            ? `FlyWire ${pct}% · ${(got/1e6).toFixed(1)}/${(total/1e6).toFixed(1)} MB`
            : `FlyWire · ${(got/1e6).toFixed(1)} MB`,
        });
      });

      this.partition(this.brain);
      this.ext = new Float32Array(this.brain.header.numNeurons);
      this.sim = await FlySim.create(this.brain, { ...DEFAULT_PARAMS });

      this.emit({
        stage:"running",
        message:"Full FlyWire brain online · ecological sensory loop active",
        neurons:this.brain.header.numNeurons,
        edges:this.brain.header.numEdges,
      });

      void this.loadVnc(versionFor);
      void this.loop();
    } catch (error) {
      this.running = false;
      this.world.setBrainSignal({ turn:0, drive:0, lift:0, feed:0, escape:0, activity:0, ready:false });
      this.emit({ stage:"error", message:error instanceof Error ? error.message : String(error) });
    }
  }

  stop() { this.running = false; }

  private partition(brain: Brain) {
    let cx = 0, n = 0;
    for (let i=0;i<brain.header.numNeurons;i++) {
      const x=brain.neurons.pos[i*3];
      if (x!==0) { cx+=x; n++; }
    }
    cx=n?cx/n:0;

    const opticL:number[]=[]; const opticR:number[]=[]; const sensory:number[]=[]; const orn:number[]=[];
    const dnL:number[]=[]; const dnR:number[]=[]; const gf:number[]=[]; const mbon:number[]=[]; const lhn:number[]=[]; const pn:number[]=[];

    for(let i=0;i<brain.header.numNeurons;i++){
      const hero=brain.neurons.cellType[i]&0xff;
      const sc=brain.neurons.superClass[i];
      const x=brain.neurons.pos[i*3];
      if(sc===SUPER_OPTIC)(x<cx?opticL:opticR).push(i);
      if(sc===SUPER_SENSORY)sensory.push(i);
      if(hero===HERO.orn)orn.push(i);
      if(hero===HERO.dn)(x<cx?dnL:dnR).push(i);
      if(hero===HERO.gf)gf.push(i);
      if(hero===HERO.mbon)mbon.push(i);
      if(hero===HERO.lhn)lhn.push(i);
      if(hero===HERO.pn)pn.push(i);
    }

    this.opticLeft=sampleEvenly(opticL,4200);
    this.opticRight=sampleEvenly(opticR,4200);
    this.sensory=sampleEvenly(sensory,2500);
    this.orn=sampleEvenly(orn,2200);
    this.dnLeft=dnL; this.dnRight=dnR; this.gf=gf; this.mbon=mbon; this.lhn=lhn; this.pn=pn;
  }

  private retinaStats(pixels: Uint8Array, w:number, h:number) {
    let l=0,r=0,ln=0,rn=0;
    for(let y=1;y<h-1;y++){
      for(let x=0;x<w;x++){
        const i=(y*w+x)*4;
        const rr=pixels[i]/255, gg=pixels[i+1]/255, bb=pixels[i+2]/255;
        const edge=Math.abs(rr-gg)+Math.abs(gg-bb)+Math.abs(bb-rr);
        const brightness=(rr+gg+bb)/3;
        const score=edge*0.13+brightness*0.025;
        if(x<w/2){l+=score;ln++;}else{r+=score;rn++;}
      }
    }
    return {left:ln?l/ln:0,right:rn?r/rn:0};
  }

  private applyEcologicalInput(s:OpenWorldSensory, vision:{left:number;right:number}) {
    if (!this.ext) return;
    this.ext.fill(0);

    const hungerGain = 0.7 + (1 - s.energy/100) * 1.5;
    const odorAmp = 0.18 + s.foodOdor * 4.2 * hungerGain;
    for(const i of this.orn)this.ext[i]=odorAmp;

    const dangerLeft = s.dangerAngle < 0 ? s.danger : s.danger*0.22;
    const dangerRight = s.dangerAngle > 0 ? s.danger : s.danger*0.22;
    const foodLeft = s.foodAngle < 0 ? s.foodOdor : s.foodOdor*0.35;
    const foodRight = s.foodAngle > 0 ? s.foodOdor : s.foodOdor*0.35;
    const leftAmp = 0.34 + vision.left*5.0 + dangerLeft*4.5 + foodLeft*0.8;
    const rightAmp = 0.34 + vision.right*5.0 + dangerRight*4.5 + foodRight*0.8;
    for(const i of this.opticLeft)this.ext[i]=leftAmp;
    for(const i of this.opticRight)this.ext[i]=rightAmp;

    const somaticAmp = 0.08 + s.groundContact*0.08 + s.danger*1.4;
    for(const i of this.sensory) {
      if (this.ext[i] === 0) this.ext[i]=somaticAmp;
    }
  }

  private async loop() {
    if(!this.brain||!this.sim||!this.ext)return;

    while(this.running){
      const sensory=this.world.getSensorySnapshot();
      const retina=this.world.captureRetina();
      this.options.onRetina?.(retina.pixels,retina.w,retina.h);
      const vision=this.retinaStats(retina.pixels,retina.w,retina.h);
      this.applyEcologicalInput(sensory,vision);
      this.sim.setExternalInput(this.ext);

      const rate=await this.sim.captureRollingRate(24);
      const dnL=meanAt(rate,this.dnLeft);
      const dnR=meanAt(rate,this.dnRight);
      const dnActivity=dnL+dnR;
      const gf=meanAt(rate,this.gf);
      const mbon=meanAt(rate,this.mbon);
      const lhn=meanAt(rate,this.lhn);
      const pn=meanAt(rate,this.pn);

      const asym=(dnR-dnL)/(dnActivity+0.001);
      const turn=Math.max(-1,Math.min(1,asym*1.7));
      const drive=clamp01(dnActivity*9 + lhn*2.6 + pn*1.7);
      const escape=clamp01(gf*24 + sensory.danger*0.25);
      const lift=clamp01(escape*0.72 + dnActivity*4.5 + sensory.danger*0.36 - sensory.foodOdor*0.08);
      const feed=clamp01(
        sensory.foodOdor *
        (0.28 + mbon*10 + pn*4) *
        (0.6 + (1-sensory.energy/100)*0.8) *
        (1-sensory.danger*0.9)
      );

      this.world.setBrainSignal({
        turn,drive,lift,feed,escape,
        activity:dnActivity+lhn+pn,
        ready:true,
      });

      this.emit({
        stage:"running",
        message:this.vncInfo
          ? "FlyWire online · MANC loaded · ecological loop running"
          : "FlyWire online · MANC loading · ecological loop running",
        neurons:this.brain.header.numNeurons,
        edges:this.brain.header.numEdges,
        vncNeurons:this.vncInfo?.neurons,
        vncEdges:this.vncInfo?.edges,
        dnActivity,gfActivity:gf,mbonActivity:mbon,turn,drive,lift,feed,
      });

      await new Promise(r=>setTimeout(r,42));
    }
  }

  private async loadVnc(versionFor:(name:string)=>string) {
    try {
      const url=(import.meta.env.VITE_VNC_URL||"/vnc.bin")+versionFor("vnc.bin");
      const vnc=await loadBrain(url);
      this.vncInfo={neurons:vnc.header.numNeurons,edges:vnc.header.numEdges};
    } catch {
      this.vncInfo=null;
    }
  }

  private emit(status:OpenWorldBrainStatus){ this.options.onStatus?.(status); }
}
