import { loadBrain, type Brain } from "./brain";
import { FlySim, DEFAULT_PARAMS } from "./sim";
import { loadManifest } from "./manifest";
import type { MotorbikeWorld } from "./motorbike-world";

export interface BrainStatus {
  stage: "loading" | "running" | "error";
  message: string;
  neurons?: number;
  edges?: number;
  vncNeurons?: number;
  vncEdges?: number;
  leftDn?: number;
  rightDn?: number;
  steer?: number;
  activity?: number;
}

export interface BrainDriveOptions {
  onStatus?: (status: BrainStatus) => void;
  onRetina?: (pixels: Uint8Array, w: number, h: number) => void;
}

const SUPER_OPTIC = 10;
const HERO_DN = 7;

function meanAt(values: Float32Array, idxs: number[]) {
  if (!idxs.length) return 0;
  let sum = 0;
  for (const i of idxs) sum += values[i];
  return sum / idxs.length;
}

function sampleEvenly(values: number[], maxCount: number) {
  if (values.length <= maxCount) return values.slice();
  const out: number[] = [];
  const step = values.length / maxCount;
  for (let i = 0; i < maxCount; i++) out.push(values[Math.floor(i * step)]);
  return out;
}

export class BrainDrive {
  private running = false;
  private sim: FlySim | null = null;
  private brain: Brain | null = null;
  private opticLeft: number[] = [];
  private opticRight: number[] = [];
  private dnLeft: number[] = [];
  private dnRight: number[] = [];
  private ext: Float32Array | null = null;
  private vncInfo: { neurons: number; edges: number } | null = null;

  constructor(
    private readonly world: MotorbikeWorld,
    private readonly options: BrainDriveOptions = {},
  ) {}

  async start() {
    if (this.running) return;
    this.running = true;

    try {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU adapter unavailable");

      this.emit({
        stage: "loading",
        message: "Loading full FlyWire connectome…",
      });

      const versionFor = await loadManifest();
      const brainUrl = (import.meta.env.VITE_BRAIN_URL || "/brain.bin") + versionFor("brain.bin");
      this.brain = await loadBrain(brainUrl, (got, total) => {
        const pct = total > 0 ? Math.round((got / total) * 100) : 0;
        this.emit({
          stage: "loading",
          message: total > 0
            ? "Loading FlyWire brain " + pct + "% · " + (got / 1e6).toFixed(1) + "/" + (total / 1e6).toFixed(1) + " MB"
            : "Loading FlyWire brain · " + (got / 1e6).toFixed(1) + " MB",
        });
      });

      this.partitionBrain(this.brain);
      this.ext = new Float32Array(this.brain.header.numNeurons);
      this.sim = await FlySim.create(this.brain, { ...DEFAULT_PARAMS });

      this.emit({
        stage: "running",
        message: "Full FlyWire brain online",
        neurons: this.brain.header.numNeurons,
        edges: this.brain.header.numEdges,
        leftDn: this.dnLeft.length,
        rightDn: this.dnRight.length,
      });
      this.world.setBrainSignal(0, 0, true);

      this.loadVnc(versionFor).catch(() => {
        // Brain driving remains valid if the optional MANC readout fails.
      });
      void this.brainLoop();
    } catch (error) {
      this.running = false;
      this.world.setBrainSignal(0, 0, false);
      this.emit({
        stage: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  stop() {
    this.running = false;
  }

  private partitionBrain(brain: Brain) {
    let cx = 0;
    let n = 0;
    for (let i = 0; i < brain.header.numNeurons; i++) {
      const x = brain.neurons.pos[3 * i];
      if (x !== 0) {
        cx += x;
        n++;
      }
    }
    cx = n ? cx / n : 0;

    const leftOptic: number[] = [];
    const rightOptic: number[] = [];
    const leftDn: number[] = [];
    const rightDn: number[] = [];

    for (let i = 0; i < brain.header.numNeurons; i++) {
      const x = brain.neurons.pos[3 * i];
      if (brain.neurons.superClass[i] === SUPER_OPTIC) {
        if (x < cx) leftOptic.push(i);
        else rightOptic.push(i);
      }
      if ((brain.neurons.cellType[i] & 0xff) === HERO_DN) {
        if (x < cx) leftDn.push(i);
        else rightDn.push(i);
      }
    }

    this.opticLeft = sampleEvenly(leftOptic, 4000);
    this.opticRight = sampleEvenly(rightOptic, 4000);
    this.dnLeft = leftDn;
    this.dnRight = rightDn;
  }

  private retinaScores(pixels: Uint8Array, w: number, h: number) {
    let left = 0;
    let right = 0;
    let leftN = 0;
    let rightN = 0;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = pixels[i] / 255;
        const g = pixels[i + 1] / 255;
        const b = pixels[i + 2] / 255;
        const warmObstacle = Math.max(0, r - (g + b) * 0.42);
        const contrast = Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
        const score = warmObstacle * 0.85 + contrast * 0.08;
        if (x < w / 2) {
          left += score;
          leftN++;
        } else {
          right += score;
          rightN++;
        }
      }
    }

    return {
      left: leftN ? left / leftN : 0,
      right: rightN ? right / rightN : 0,
    };
  }

  private async brainLoop() {
    if (!this.sim || !this.ext || !this.brain) return;

    while (this.running) {
      const retina = this.world.captureRetina();
      this.options.onRetina?.(retina.pixels, retina.w, retina.h);
      const vision = this.retinaScores(retina.pixels, retina.w, retina.h);

      this.ext.fill(0);
      const base = 1.0;
      const leftAmp = base + Math.min(3.8, vision.left * 16);
      const rightAmp = base + Math.min(3.8, vision.right * 16);
      for (const i of this.opticLeft) this.ext[i] = leftAmp;
      for (const i of this.opticRight) this.ext[i] = rightAmp;
      this.sim.setExternalInput(this.ext);

      const rate = await this.sim.captureRollingRate(24);
      const l = meanAt(rate, this.dnLeft);
      const r = meanAt(rate, this.dnRight);
      const activity = l + r;
      const asym = activity > 0.0005 ? (r - l) / (activity + 0.0005) : 0;
      const steer = Math.max(-1, Math.min(1, asym * 1.8));

      this.world.setBrainSignal(steer, activity, true);
      this.emit({
        stage: "running",
        message: this.vncInfo ? "Full FlyWire + MANC online" : "Full FlyWire brain online · MANC loading",
        neurons: this.brain.header.numNeurons,
        edges: this.brain.header.numEdges,
        vncNeurons: this.vncInfo?.neurons,
        vncEdges: this.vncInfo?.edges,
        leftDn: this.dnLeft.length,
        rightDn: this.dnRight.length,
        steer,
        activity,
      });

      await new Promise((resolve) => setTimeout(resolve, 35));
    }
  }

  private async loadVnc(versionFor: (name: string) => string) {
    const url = (import.meta.env.VITE_VNC_URL || "/vnc.bin") + versionFor("vnc.bin");
    const vnc = await loadBrain(url);
    this.vncInfo = {
      neurons: vnc.header.numNeurons,
      edges: vnc.header.numEdges,
    };
    if (this.brain) {
      this.emit({
        stage: "running",
        message: "Full FlyWire + MANC online",
        neurons: this.brain.header.numNeurons,
        edges: this.brain.header.numEdges,
        vncNeurons: vnc.header.numNeurons,
        vncEdges: vnc.header.numEdges,
        leftDn: this.dnLeft.length,
        rightDn: this.dnRight.length,
      });
    }
  }

  private emit(status: BrainStatus) {
    this.options.onStatus?.(status);
  }
}
