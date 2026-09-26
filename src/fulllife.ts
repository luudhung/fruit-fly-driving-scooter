import * as THREE from "three";
import { loadBrain, type Brain } from "./brain";
import { FlySim, DEFAULT_PARAMS } from "./sim";
import { loadManifest } from "./manifest";

type Sex = "female" | "male";
type LifeStage = "adult" | "dead";

type MotorSignal = {
  turn: number;
  drive: number;
  lift: number;
  interact: number;
  escape: number;
  activity: number;
  ready: boolean;
};

type SensoryFrame = {
  opticLeft: number;
  opticRight: number;
  opticForward: number;
  foodOdor: number;
  pheromoneLeft: number;
  pheromoneRight: number;
  collision: number;
  groundContact: number;
  energy: number;
  hunger: number;
};

type Genome = {
  metabolism: number;
  sensoryGain: number;
  locomotionGain: number;
  stressGain: number;
  lifespanDays: number;
  fertility: number;
};

type FlyRecord = {
  id: string;
  mesh: THREE.Group;
  sex: Sex;
  stage: LifeStage;
  generation: number;
  parents: [string, string] | null;
  genome: Genome;
  heading: number;
  verticalVelocity: number;
  energy: number;
  hydration: number;
  hunger: number;
  stress: number;
  ageDays: number;
  cash: number;
  homeId: string | null;
  vehicleId: string | null;
  inVehicle: boolean;
  carryingCrateId: string | null;
  children: string[];
  distance: number;
  foodConsumed: number;
  incomeEarned: number;
  accidents: number;
  brainOnline: boolean;
  brainActivity: number;
  motor: MotorSignal;
  interactionCooldown: number;
};

type FoodPatch = {
  id: string;
  mesh: THREE.Mesh;
  quantity: number;
  capacity: number;
  odor: number;
  productionPerSecond: number;
};

type Crate = {
  id: string;
  mesh: THREE.Mesh;
  carrierId: string | null;
  available: boolean;
  respawnAt: number;
};

type House = {
  id: string;
  mesh: THREE.Group;
  gate: THREE.Object3D;
  price: number;
  ownerId: string | null;
};

type Vehicle = {
  id: string;
  mesh: THREE.Group;
  price: number;
  ownerId: string | null;
  heading: number;
  speed: number;
  condition: number;
  battery: number;
};

type BrainParts = {
  opticLeft: number[];
  opticRight: number[];
  sensory: number[];
  orn: number[];
  dnLeft: number[];
  dnRight: number[];
  gf: number[];
  mbon: number[];
  lhn: number[];
  pn: number[];
};

type BrainRuntime = {
  sim: FlySim;
  ext: Float32Array;
  motor: MotorSignal;
};

const WORLD_SEED = 948291;
const STARTING_FLY_COUNT = 2;
const MAX_FULL_BRAINS = 3;
const SIM_SECONDS_PER_REAL_SECOND = 120;
const WORLD_HALF = 145;
const GROUND_Y = 0.34;
const HERO = { mbon: 2, lhn: 3, pn: 4, orn: 5, gf: 6, dn: 7 } as const;
const SUPER_SENSORY = 1;
const SUPER_OPTIC = 10;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function wrapAngle(v: number) {
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
}

function meanAt(values: Float32Array, idxs: number[]) {
  if (!idxs.length) return 0;
  let sum = 0;
  for (const i of idxs) sum += values[i];
  return sum / idxs.length;
}

function sampleEvenly(values: number[], max: number) {
  if (values.length <= max) return values.slice();
  const out: number[] = [];
  const stride = values.length / max;
  for (let i = 0; i < max; i++) out.push(values[Math.floor(i * stride)]);
  return out;
}

class SeededRng {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0; }
  next() {
    let t = this.state += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number) { return lo + (hi - lo) * this.next(); }
  signed(scale = 1) { return (this.next() * 2 - 1) * scale; }
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

class CivilizationBrainPool {
  private brain: Brain | null = null;
  private parts: BrainParts | null = null;
  private runtimes = new Map<string, BrainRuntime>();
  private running = false;
  private vncInfo: { neurons: number; edges: number } | null = null;

  constructor(
    private readonly sensoryFor: (id: string) => SensoryFrame | null,
    private readonly motorFor: (id: string, motor: MotorSignal) => void,
    private readonly onStatus: (status: string, detail: string) => void,
  ) {}

  async start(ids: string[]) {
    if (this.running) return;
    this.running = true;
    try {
      const versionFor = await loadManifest();
      const brainUrl = (import.meta.env.VITE_BRAIN_URL || "/brain.bin") + versionFor("brain.bin");
      this.onStatus("loading", "Loading one shared FlyWire connectome fileâ€¦");
      this.brain = await loadBrain(brainUrl, (got, total) => {
        const pct = total > 0 ? Math.round(got / total * 100) : 0;
        this.onStatus("loading", total > 0 ? `FlyWire ${pct}% Â· ${(got / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB` : `FlyWire ${(got / 1e6).toFixed(1)} MB`);
      });
      this.parts = this.partition(this.brain);
      for (const id of ids.slice(0, MAX_FULL_BRAINS)) await this.addAgent(id);
      this.onStatus("running", `${this.runtimes.size} independent FlyWire LIF states online Â· ${this.brain.header.numNeurons.toLocaleString()} neurons each`);
      void this.loadVnc(versionFor);
      void this.loop();
    } catch (error) {
      this.running = false;
      this.onStatus("error", error instanceof Error ? error.message : String(error));
    }
  }

  async addAgent(id: string) {
    if (!this.brain || !this.parts || this.runtimes.has(id)) return false;
    if (this.runtimes.size >= MAX_FULL_BRAINS) return false;
    const sim = await FlySim.create(this.brain, { ...DEFAULT_PARAMS });
    const ext = new Float32Array(this.brain.header.numNeurons);
    const motor: MotorSignal = { turn: 0, drive: 0, lift: 0, interact: 0, escape: 0, activity: 0, ready: false };
    this.runtimes.set(id, { sim, ext, motor });
    return true;
  }

  count() { return this.runtimes.size; }
  getVncInfo() { return this.vncInfo; }

  private partition(brain: Brain): BrainParts {
    let cx = 0;
    let n = 0;
    for (let i = 0; i < brain.header.numNeurons; i++) {
      const x = brain.neurons.pos[i * 3];
      if (x !== 0) { cx += x; n++; }
    }
    cx = n ? cx / n : 0;
    const opticLeft: number[] = [];
    const opticRight: number[] = [];
    const sensory: number[] = [];
    const orn: number[] = [];
    const dnLeft: number[] = [];
    const dnRight: number[] = [];
    const gf: number[] = [];
    const mbon: number[] = [];
    const lhn: number[] = [];
    const pn: number[] = [];
    for (let i = 0; i < brain.header.numNeurons; i++) {
      const hero = brain.neurons.cellType[i] & 0xff;
      const sc = brain.neurons.superClass[i];
      const x = brain.neurons.pos[i * 3];
      if (sc === SUPER_OPTIC) (x < cx ? opticLeft : opticRight).push(i);
      if (sc === SUPER_SENSORY) sensory.push(i);
      if (hero === HERO.orn) orn.push(i);
      if (hero === HERO.dn) (x < cx ? dnLeft : dnRight).push(i);
      if (hero === HERO.gf) gf.push(i);
      if (hero === HERO.mbon) mbon.push(i);
      if (hero === HERO.lhn) lhn.push(i);
      if (hero === HERO.pn) pn.push(i);
    }
    return {
      opticLeft: sampleEvenly(opticLeft, 4200),
      opticRight: sampleEvenly(opticRight, 4200),
      sensory: sampleEvenly(sensory, 2600),
      orn: sampleEvenly(orn, 2200),
      dnLeft,
      dnRight,
      gf,
      mbon,
      lhn,
      pn,
    };
  }

  private applySensory(runtime: BrainRuntime, s: SensoryFrame) {
    const parts = this.parts;
    if (!parts) return;
    const ext = runtime.ext;
    ext.fill(0);
    const hungerGain = 0.72 + s.hunger * 1.45 + (1 - s.energy / 100) * 0.7;
    const odorAmp = 0.12 + s.foodOdor * 4.4 * hungerGain;
    for (const i of parts.orn) ext[i] = odorAmp;
    const socialLeft = s.pheromoneLeft * 0.35;
    const socialRight = s.pheromoneRight * 0.35;
    const leftAmp = 0.24 + s.opticLeft * 5.2 + socialLeft + s.collision * 2.8;
    const rightAmp = 0.24 + s.opticRight * 5.2 + socialRight + s.collision * 2.8;
    for (const i of parts.opticLeft) ext[i] = leftAmp;
    for (const i of parts.opticRight) ext[i] = rightAmp;
    const somaticAmp = 0.05 + s.groundContact * 0.12 + s.collision * 1.9 + s.opticForward * 0.08;
    for (const i of parts.sensory) if (ext[i] === 0) ext[i] = somaticAmp;
  }

  private decode(rate: Float32Array, s: SensoryFrame): MotorSignal {
    const parts = this.parts;
    if (!parts) return { turn: 0, drive: 0, lift: 0, interact: 0, escape: 0, activity: 0, ready: false };
    const dnL = meanAt(rate, parts.dnLeft);
    const dnR = meanAt(rate, parts.dnRight);
    const dnActivity = dnL + dnR;
    const gf = meanAt(rate, parts.gf);
    const mbon = meanAt(rate, parts.mbon);
    const lhn = meanAt(rate, parts.lhn);
    const pn = meanAt(rate, parts.pn);
    const asym = (dnR - dnL) / (dnActivity + 0.001);
    const turn = clamp(asym * 1.75, -1, 1);
    const drive = clamp01(dnActivity * 9 + lhn * 2.8 + pn * 1.8);
    const escape = clamp01(gf * 24 + s.collision * 0.6);
    const lift = clamp01(escape * 0.72 + dnActivity * 4.7 + s.opticForward * 0.05 - s.foodOdor * 0.05);
    const interact = clamp01(s.foodOdor * (0.22 + mbon * 10 + pn * 4.4) + mbon * 2.2 + pn * 0.8);
    return { turn, drive, lift, interact, escape, activity: dnActivity + lhn + pn + mbon, ready: true };
  }

  private async loop() {
    while (this.running) {
      for (const [id, runtime] of this.runtimes) {
        const sensory = this.sensoryFor(id);
        if (!sensory) continue;
        this.applySensory(runtime, sensory);
        runtime.sim.setExternalInput(runtime.ext);
        const rate = await runtime.sim.captureRollingRate(12);
        runtime.motor = this.decode(rate, sensory);
        this.motorFor(id, runtime.motor);
      }
      await sleep(32);
    }
  }

  private async loadVnc(versionFor: (name: string) => string) {
    try {
      const url = (import.meta.env.VITE_VNC_URL || "/vnc.bin") + versionFor("vnc.bin");
      const vnc = await loadBrain(url);
      this.vncInfo = { neurons: vnc.header.numNeurons, edges: vnc.header.numEdges };
    } catch {
      this.vncInfo = null;
    }
  }
}

class FullLifeWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 700);
  readonly renderer: THREE.WebGLRenderer;

  readonly flies: FlyRecord[] = [];
  readonly foods: FoodPatch[] = [];
  readonly crates: Crate[] = [];
  readonly houses: House[] = [];
  readonly vehicles: Vehicle[] = [];

  private readonly clock = new THREE.Clock();
  private readonly rng = new SeededRng(WORLD_SEED);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly flyPickMeshes = new Map<THREE.Object3D, string>();
  private readonly social = new Map<string, number>();
  private readonly mating = new Map<string, number>();
  private readonly workZone = new THREE.Vector3(-53, GROUND_Y, 26);
  private readonly warehouseZone = new THREE.Vector3(-78, GROUND_Y, 18);
  private readonly storeZone = new THREE.Vector3(35, GROUND_Y, -18);
  private readonly waterCenter = new THREE.Vector3(96, 0, 28);
  private readonly sun = new THREE.DirectionalLight(0xffd2a1, 2.2);
  private readonly ambient = new THREE.HemisphereLight(0xdcecff, 0x66513d, 1.55);

  private raf = 0;
  private running = true;
  private simSeconds = 0;
  private births = 0;
  private deaths = 0;
  private treasury = 120;
  private storeBalance = 0;
  private deliveredCrates = 0;
  private selectedId: string | null = null;
  private cameraMode: "city" | "follow" = "city";
  private followId: string | null = null;
  private birthHandler: ((id: string) => Promise<boolean>) | null = null;
  private readonly events: string[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly onEvent: (line: string) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0xd8edf8);
    this.scene.fog = new THREE.Fog(0xd8edf8, 180, 430);
    this.sun.position.set(-70, 120, -40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(this.sun, this.ambient);

    this.buildWorld();
    this.spawnFounder("FLY-000001", "female", new THREE.Vector3(-8, GROUND_Y, 4));
    this.spawnFounder("FLY-000002", "male", new THREE.Vector3(7, GROUND_Y, 8));

    this.camera.position.set(0, 118, 178);
    this.camera.lookAt(0, 0, 0);
    window.addEventListener("resize", this.resize);
    this.renderer.domElement.addEventListener("pointerdown", this.pickFly);
    this.resize();
    this.clock.start();
    this.emit("WORLD-A started Â· seed 948291 Â· observer mode READ ONLY");
    this.loop();
  }

  setBirthHandler(handler: (id: string) => Promise<boolean>) { this.birthHandler = handler; }
  setRunning(value: boolean) { this.running = value; }
  setCameraMode(mode: "city" | "follow", id?: string) {
    this.cameraMode = mode;
    if (id) this.followId = id;
  }
  getSelectedId() { return this.selectedId; }
  selectFly(id: string | null) { this.selectedId = id; if (id) this.followId = id; }
  getSimSeconds() { return this.simSeconds; }
  getEvents() { return this.events.slice(); }

  private buildWorld() {
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x91ab72, roughness: 0.96 });
    const ground = mesh(new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x3b4248, roughness: 0.94 });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb9b6ad, roughness: 0.9 });
    for (const x of [-62, 0, 62]) {
      const road = mesh(new THREE.BoxGeometry(15, 0.08, WORLD_HALF * 2), roadMat, x, 0.05, 0);
      this.scene.add(road);
      this.scene.add(mesh(new THREDRä&÷„vVöÖWG'’ƒ2ÂãÂtõ$ÄEô„Äb¢"’Â6–FWvÆ´ÖBÂ‚Ò’Âã‚Â’“°¢F†—2ç66VæRæFB†ÖW6‚†æWrD…$TRä&÷„vVöÖWG'’ƒ2ÂãÂtõ$ÄEô„Äb¢"’Â6–FWvÆ´ÖBÂ‚²’Âã‚Â’“°¢Ð¢f÷"†6öç7B¢öb²ÓcBÂÂcEÒ’°¢6öç7B&öBÒÖW6‚†æWrD…$TRä&÷„vVöÖWG'’…tõ$ÄEô„Äb¢"Âã‚ÂR’Â&öDÖBÂÂãRÂ¢“°¢F†—2ç66VæRæFB‡&öB“°¢F†—2ç66VæRæFB†ÖW6‚†æWrD…$TRä&÷„vVöÖWG'’…tõ$ÄEô„Äb¢"ÂãÂ2’Â6–FWvÆ´ÖBÂÂã‚Â¢Ò’’“°¢F†—2ç66VæRæFB†ÖW6‚†æWrD…$TRä&÷„vVöÖWG'’…tõ$ÄEô„Äb¢"ÂãÂ2’Â6–FWvÆ´ÖBÂÂã‚Â¢²’’“°¢Ð ¢6öç7BF—7G&–7G2Ò°¢²Ó“‚ÂÓ“‚Â†3†#†5ÒÂ²Ó3BÂÓ“‚Â†v#v3EÒÂ³3BÂÓ“‚Â†36&%ÒÂ³“‚ÂÓ“‚Â†v#3“UÒÀ¢²Ó“‚ÂÓ3BÂ†#–sƒ•ÒÂ²Ó3BÂÓ3BÂƒ–F#UÒÂ³3BÂÓ3BÂ†3&S“UÒÂ³“‚ÂÓ3BÂƒ–VC–ÒÀ¢²Ó“‚Â3BÂ†#3–SƒUÒÂ²Ó3BÂ3BÂ†v#f&ÒÂ³3BÂ3BÂ†#V•ÒÂ³“‚Â3BÂƒ–f#†EÒÀ¢²Ó“‚Â“‚Â†&Fs†EÒÂ²Ó3BÂ“‚Â†6#6&EÒÂ³3BÂ“‚Â†3#“ÒÂ³“‚Â“‚Âƒ–6C“5ÒÀ¢Ò26öç7C°¢f÷"†6öç7B¶7‚Â7¢Â6öÆ÷%ÒöbF—7G&–7G2’F†—2æ'V–ÆD&Æö6²†7‚Â7¢Â6öÆ÷"“° ¢6öç7B&´ÖBÒæWrD…$TRäÖW6…7FæF&DÖFW&–Â‡²6öÆ÷#¢ƒcc†3S‚Â&÷Vv†æW73¢Ò“°¢F†—2ç66VæRæFB†ÖW6‚†æWrD…$TRä&÷„vVöÖWG'’ƒCBÂã"ÂC"’Â&´ÖBÂ3BÂã‚Â“b’“°¢6öç7BvFW$ÖBÒæWrD…$TRäÖW6…7FæF&DÖFW&–Â‡²6öÆ÷#¢ƒc––3RÂ&÷Vv†æW73¢ã2ÂÖWFÆæW73¢ã‚Ò“°¢F†—2ç66VæRæFB†ÖW6‚†æWrD…$TRä6—&6ÆTvVöÖWG'’ƒ#"ÂC‚’ÂvFW$ÖBÂF†—2çvFW$6VçFW"ç‚ÂãrÂF†—2çvFW$6VçFW"ç¢’“°¢6öç7BÆ¶RÒF†—2ç66VæRæ6†–ÆG&Vå·F†—2ç66VæRæ6†–ÆG&VâæÆVæwF‚ÒÓ°¢Æ¶Rç&÷FF–öâç‚ÒÔÖF‚å’ò#° ¢f÷"†ÆWB’Ò²’Âs²’²²’F†—2æFEG&VR‡F†—2ç&ærç&ævR‚Ó3"Â3"’ÂF†—2ç&ærç&ævR‚Ó3"Â3"’“°¢F†—2æ'V–ÆDV6öæö×’‚“°¢Ð ¢&—fFR'V–ÆD&Æö6²†7ƒ¢çVÖ&W"Â7£¢çVÖ&W"Â&6T6öÆ÷#¢çVÖ&W"’°¢6öç7B6÷VçBÒ2²ÖF‚æfÆö÷"‡F†—2ç&ærç&ævRƒÂB’“°¢f÷"†ÆWB’Ò²’Â6÷VçC²’²²’°¢6öç7BrÒF†—2ç&ærç&ævRƒ2Â#2“°¢6öç7BBÒF†—2ç&ærç&ævRƒ"Â#B“°¢6öç7B‚ÒF†—2ç&ærç&ævRƒ"ÂC‚“°¢6öç7B‚Ò7‚²F†—2ç&ærç&ævR‚Ó#Â#“°¢6öç7B¢Ò7¢²F†—2ç&ærç&ævR‚Ó#"Â#"“°¢6öç7BÖBÒæWrD…$TRäÖW6…7FæF&DÖFW&–Â‡²6öÆ÷#¢&6T6öÆ÷"Â&÷Vv†æW73¢ãƒ2ÂÖWFÆæW73¢ã2Ò“°¢6öç7B"ÒÖW6‚†æWrD…$TRä&÷„vVöÖWG'’‡rÂ‚ÂB’ÂÖBÂ‚Â‚ò"Â¢“°¢F†—2ç66VæRæFB†"“°¢6öç7B&ööbÒÖW6‚†æWrD…$TRä&÷„vVöÖWG'’‡r¢ãrÂãRÂB¢ãr’ÂæWrD…$TRäÖW6…7FæF&DÖFW&–Â‡²6öÆ÷#¢ƒccf#fBÂ&÷Vv†æW73¢ã’Ò’Â‚Â‚²ã2Â¢“°¢F†—2ç66VæRæFB‡&ööb“°¢Ð¢Ð ¢&—fFRFEG&VR‡ƒ¢çVÖ&W"Â£¢çVÖ&W"’°¢–b„ÖF‚æ'2‡‚’Â"ÇÂÖF‚æ'2‡¢’Â"’&WGW&ã°¢6öç7BG'Væ²ÒÖW6‚†æWrD…$TRä7–Æ–æFW$vVöÖWG'’ƒã3RÂãRÂBã"Â‚’ÂæWrD…$TRäÖW6…7FæF&DÖFW&–Â‡²6öÆ÷#¢ƒsS3’Â&÷Vv†æW73¢Ò’Â‚Â"ãÂ¢“°¢6öç7B7&÷vâÒÖW6‚†æWrD…$TRå7†W&TvVöÖWG'’ƒ"ã"ÂÂ‚’ÂæWrD…$TRäÖW6…7FæF&DÖFW&–Â‡²6öÆ÷#¢ƒFCvCFBÂ&÷Vv†æW73¢ã“RÒ’Â‚ÂRã"Â¢“°¢7&÷vâç66ÆRç6WBƒÂã2Â“°¢F†—2ç66VæRæFB‡G'Væ²Â7&÷vâ“°¢Ð ¢&—fFR'V–ÆDV6öæö×’‚’°¢6öç7BfööDÖBÒæWrD…$TRäÖW6…7FæF&DÖFW&–Â‡²6öÆ÷#¢†C“fcÂVÖ—76—fS¢ƒCcS"ÂVÖ—76—fT–çFVç6—G“¢ã‚Â&÷Vv†æW73¢ãSRÒ“°¢6öç7BfööE7V72Ò°¢²$dôôBÔõ$4„$B"ÂÓ"Â“BÂƒRÂãRÂãeÒÀ¢²$dôôBÔÔ$´UB"Â3BÂÓ#RÂCRÂãƒ‚ÂãUÒÀ¢²$dôôBÕ$²"Â#‚ÂÂSBÂã“RÂã…ÒÀ¢Ò26öç7C°¢f÷"†6öç7B¶–BÂ‚Â¢ÂVçF—G’ÂöF÷"Â&öGV7F–öåÒöbfööE7V72’°¢6öç7BÒÒÖW6‚†æWrD…$TRå7†W&TvVöÖWG'’ƒ"ã"ÂbÂ"’ÂfööDÖBÂ‚Âã’Â¢“°¢F†—2ç66VæRæFB†Ò“°¢F†—2æfööG2çW6‚‡²–BÂÖW6ƒ¢ÒÂVçF—G’Â6¥ÑäèÅÕ…¹Ñ¥Ñä°½‘½È°ÁÉ½‘ÕÑ¥½¹A•ÉM•½¹èÁÉ½‘ÕÑ¥½¸ô¤ì(€€€ô((€€€½¹ÍÐÍÑ…Ñ¥½¹5…Ð€ô¹•ÜQ!I¹5•Í¡MÑ…¹‘…É‘5…Ñ•É¥…°¡ì½±½Èè€Áá”á‰Ñ˜°•µ¥ÍÍ¥Ù”è€ÁàÕ„Í”Àä°•µ¥ÍÍ¥Ù•%¹Ñ•¹Í¥Ñäè€À¸Èà°É½Õ¡¹•ÍÌè€À¸Ôô¤ì(€€€Ñ¡¥Ì¹Í•¹”¹…‘¡µ•Í ¡¹•ÜQ!I¹å±¥¹‘•É•½µ•ÑÉä Ì¸à°€Ì¸à°€À¸Ô°€ÈÐ¤°ÍÑ…Ñ¥½¹5…Ð°Ñ¡¥Ì¹Ý½É­i½¹”¹à°€À¸Èà°Ñ¡¥Ì¹Ý½É­i½¹”¹è¤¤ì(€€€Ñ¡¥Ì¹Í•¹”¹…‘¡µ•Í ¡¹•ÜQ!I¹	½á•½µ•ÑÉä ÄØ°€Ü°€ÄÐ¤°¹•ÜQ!I¹5•Í¡MÑ…¹‘…É‘5…Ñ•É¥…°¡ì½±½Èè€ÁàÝàÌá„°É½Õ¡¹•ÍÌè€À¸ààô¤°Ñ¡¥Ì¹Ý…É•¡½ÕÍ•i½¹”¹à°€Ì¸Ô°Ñ¡¥Ì¹Ý…É•¡½ÕÍ•i½¹”¹è¤¤ì((€€€½¹ÍÐÉ…Ñ•5…Ð€ô¹•ÜQ!I¹5•Í¡MÑ…¹‘…É‘5…Ñ•É¥…°¡ì½±½Èè€Áá„ÜÝ„Ðà°É½Õ¡¹•ÍÌè€À¸äÈô¤ì(€€€™½È€¡±•Ð¤€ô€Àì¤€ð€Øì¤¬¬¤ì(€€€€€½¹ÍÐ´€ôµ•Í ¡¹•ÜQ!I¹	½á•½µ•ÑÉä Ä¸Ø°€Ä¸Ä°€Ä¸Ø¤°É…Ñ•5…Ð°Ñ¡¥Ì¹Ý…É•¡½ÕÍ•i½¹”¹à€¬Ñ¡¥Ì¹É¹œ¹É…¹” ´Ô°€Ô¤°€À¸Ü°Ñ¡¥Ì¹Ý…É•¡½ÕÍ•i½¹”¹è€¬Ñ¡¥Ì¹É¹œ¹É…¹” ´Ô°€Ô¤¤ì(€€€€€Ñ¡¥Ì¹Í•¹”¹…‘¡´¤ì(€€€€€Ñ¡¥Ì¹É…Ñ•Ì¹ÁÕÍ ¡ì¥èIQ´‘íMÑÉ¥¹œ¡¤€¬€Ä¤¹Á…‘MÑ…ÉÐ Ì°€ˆÀˆ¥õ€°µ•Í è´°…ÉÉ¥•É%è¹Õ±°°…Ù…¥±…‰±”èÑÉÕ”°É•ÍÁ…Ý¹Ðè€Àô¤ì(€€€ô((€€€½¹ÍÐÍÑ½É”€ôµ•Í ¡¹•ÜQ!I¹	½á•½µ•ÑÉä Ü°€à°€Ø¤°¹•ÜQ!I¹5•Í¡MÑ…¹‘…É‘5…Ñ•É¥…°¡ì½±½Èè€ÁàÙ™„Ùˆà°É½Õ¡¹•ÍÌè€À¸ÜÈô¤°Ñ¡¥Ì¹ÍÑ½É•i½¹”¹à°€Ð°Ñ¡¥Ì¹ÍÑ½É•i½¹”¹è¤ì(€€€Ñ¡¥Ì¹Í•¹”¹…‘¡ÍÑ½É”¤ì(€€€½¹ÍÐÍ±½Ð€ôµ•Í ¡¹•ÜQ!I¹	½á•½µ•ÑÉä Ä¸à°€À¸Ø°€À¸ÐÔ¤°¹•ÜQ!I¹5•Í¡MÑ…¹‘…É‘5…Ñ•É¥…°¡ì½±½Èè€ÁàÈÐÉˆÌÄ°É½Õ¡¹•ÍÌè€À¸Ôô¤°Ñ¡¥Ì¹ÍÑ½É•i½¹”¹à°€Ì¸Ð°Ñ¡¥Ì¹ÍÑ½É•i½¹”¹è€´€Ì¸È¤ì(€€€Ñ¡¥Ì¹Í•¹”¹…‘¡Í±½Ð¤ì((€€€™½È€¡±•Ð¤€ô€Àì¤€ð€Ôì¤¬¬¤ì(€€€€€½¹ÍÐà€ô€ÜØ€¬€¡¤€”€È¤€¨€ÈÐì(€€€€€½¹ÍÐè€ô€´äØ€¬5…Ñ ¹™±½½È¡¤€¼€È¤€¨€Èàì(€€€€€½¹ÍÐœ€ô¹•ÜQ!I¹É½ÕÀ ¤ì(€€€€€½¹ÍÐÍ¡•±°€ôµ•Í ¡¹•ÜQ!I¹	½á•½µ•ÑÉä ÄÔ°€ÄÈ°€ÄÌ¤°¹•ÜQ!I¹5•Í¡MÑ…¹‘…É‘5…Ñ•É¥…°¡ì½±½Èè€ÁáÙŒÝ…°É½Õ¡¹•ÍÌè€À¸àÔô¤°€À°€Ø°€À¤ì(€€€€€½¹ÍÐ‘½½È€ôµ•Í ¡¹•ÜQ!I¹	½á•½µ•ÑÉä È¸Ø°€Ô°€À¸Ô¤°¹•ÜQ!I¹5•Í¡MÑ…¹‘…É‘5…Ñ•É¥…°¡ì½±½Èè€ÁàÙŒÑÍŒ°É½Õ¡¹•ÍÌè€À¸ÜÔô¤°€À°€È¸Ü°€´Ø¸Ü¤ì(€€€€€œ¹Á½Í¥Ñ¥½¸¹Í•Ð¡à°€À°è¤ì(€€€€€œ¹…‘¡Í¡•±°°‘½½È¤ì(€€€€€Ñ¡¥Ì¹Í•¹”¹…‘¡œ¤ì(€€€€€Ñ¡¥Ì¹¡½ÕÍ•Ì¹ÁÕÍ ¡ì¥è!=5´‘íMÑÉ¥¹œ¡¤€¬€Ä¤¹Á…‘MÑ…ÉÐ Ì°€ˆÀˆ¥õ€°µ•Í èœ°…Ñ”è‘½½È°ÁÉ¥”è€Ø€¬¤€¨€È°½Ý¹•É%è¹Õ±°ô¤ì(€€€ô((€€€™½È€¡±•Ð¤€ô€Àì¤€ð€Ìì¤¬¬¤ì(€€€€€½¹ÍÐØ€ôÑ¡¥Ì¹‰Õ¥±‘Y•¡¥±” ¤ì(€€€€€Ø¹Á½Í¥Ñ¥½¸¹Í•Ð ´ÈÔ€¬¤€¨€ä°€À¸ÔÔ°€´Ôà¤ì(€€€€€Ñ¡¥Ì¹Í•¹”¹…‘¡Ø¤ì(€€€€€Ñ¡¥Ì¹Ù•¡¥±•Ì¹ÁÕÍ ¡ì¥èY ´‘íMÑÉ¥¹œ¡¤€¬€Ä¤¹Á…‘MÑ…ÉÐ Ì°€ˆÀˆ¥õ€°µ•Í èØ°ÁÉ¥”è€Ð€¬¤°½Ý¹•É%è¹Õ±°°¡•…‘¥¹œè€À°ÍÁ••è€À°½¹‘¥Ñ¥½¸è€ÄÀÀ°‰…ÑÑ•Éäè€ÄÀÀô¤ì(€€€ô(€ô((€ÁÉ¥Ù…Ñ”‰Õ¥±‘Y•¡¥±” ¤ì(€€€½¹ÍÐœ€ô¹•ÜQ!I¹É½ÕÀ ¤ì(€€€½¹ÍÐ‰½‘å5…Ð€ô¹•ÜQ!I¹5•Í¡MÑ…¹‘…É‘5…Ñ•É¥…°¡ì½±½Èè€ÁàÑ”Ý•…„°µ•Ñ…±¹•ÍÌè€À¸ÈÈ°É½Õ¡¹•ÍÌè€À¸Ôô¤ì(€€€½¹ÍÐÑ¥É•5…Ð€ô¹•ÜQ!I¹5•Í¡MÑ…¹‘…É‘5…Ñ•É¥…°¡ì½±½Èè€ÁàÅ˜ÈÈÈÔ°É½Õ¡¹•ÍÌè€À¸äÔô¤ì(€€€œ¹…‘¡µ•Í ¡¹•ÜQ!I¹	½á•½µ•ÑÉä Ð¸Ô°€Ä¸Ä°€È¸Ø¤°‰½‘å5…Ð°€À°€Ä°€À¤¤ì(€€€œ¹…‘¡µ•Í ¡¹•ÜQ!I¹	½á•½µ•ÑÉä È¸È°€À¸à°€È¸È¤°¹•ÜQ!I¹5•Í¡MÑ…¹‘…É‘5…Ñ•É¥…°¡ì½±½Èè€Áá„å•‘°ÑÉ…¹ÍÁ…É•¹ÐèÑÉÕ”°½Á…¥Ñäè€À¸Ü°É½Õ¡¹•ÍÌè€À¸Èô¤°€´À¸Ì°€Ä¸à°€À¤¤ì(€€€™½È€¡½¹ÍÐà½˜l´Ä¸ÐÔ°€Ä¸ÐÕt¤™½È€¡½¹ÍÐè½˜l´Ä¸ÄÔ°€Ä¸ÄÕt¤ì(€€€€€½¹ÍÐÝ¡••°€ôµ•Í ¡¹•ÜQ!I¹å±¥¹‘•É•½µ•ÑÉä À¸Ðà°€À¸Ðà°€À¸ÌÈ°€ÄÐ¤°Ñ¥É•5…Ð°à°€À¸ÐÔ°è¤ì(€€€€€Ý¡••°¹É½Ñ…Ñ¥½¸¹à€ô5…Ñ ¹A$€¼€Èì(€€€€€œ¹…‘¡Ý¡••°¤ì(€€€ô(€€€É•ÑÕÉ¸œì(€ô((€ÁÉ¥Ù…Ñ”‰Õ¥±‘±å	½‘ä¡¥èÍÑÉ¥¹œ°Í•àèM•à¤ì(€€€½¹ÍÐœ€ô¹•ÜQ!I¹É½ÕÀ ¤ì(€€€½¹ÍÐ‰½‘å5…Ð€ô¹•ÜQ!I¹5•Í¡MÑ…¹‘…É‘5…Ñ•É¥…°¡ì½±½ÈèÍ•à€ôôô€‰™•µ…±”ˆ€ü€ÁàÔàÍŒÉ”€è€ÁàÐÌÌÔÉ”°É½Õ¡¹•ÍÌè€À¸ÜÈô¤ì(€€€½¹ÍÐ…‰‘½µ•¹5…Ð€ô¹•ÜQ!I¹5•Í¡MÑ…¹‘…É‘5…Ñ•É¥…°¡ì½±½Èè€ÁàÈäÈÈÅ°É½Õ¡¹•ÍÌè€À¸àô¤ì(€€€½¹ÍÐ•å•5…Ð€ô¹•ÜQ!IK“Y\ÚÝ[™\™X]\šX[
ÈÛÛÜŽˆMLYL˜‹[Z\ÜÚ]™NˆÌL‹[Z\ÜÚ]™R[[œÚ]NˆMK›ÝYÚ™\ÜÎˆˆJNÂˆÛÛœÝÚ[™ÓX]H™]È‘QK“Y\ÚÝ[™\™X]\šX[
ÈÛÛÜŽˆYYŒ‹˜[œÜ\™[ˆYKÜXÚ]NˆÚYNˆ‘QK‘ÝX›TÚYK›ÝYÚ™\ÜÎˆŒNJNÂˆÛÛœÝÜ˜^HY\Ú
™]È‘QK”Ü\™QÙ[ÛY]žJM‹LŠK›ÙSX]L‹
NÂˆÜ˜^œØØ[KœÙ]
Ž‹ŽL‹KŒŠNÂˆÛÛœÝX™ÛY[ˆHY\Ú
™]È‘QK”Ü\™QÙ[ÛY]žJËM‹LŠKX™ÛY[“X]LKÌŠNÂˆX™ÛY[‹œØØ[KœÙ]
ÌËËKJNÂˆÛÛœÝXYHY\Ú
™]È‘QK”Ü\™QÙ[ÛY]žJŒÎM‹LŠK›ÙSX]NLLŠNÂˆË˜Y
Ü˜^X™ÛY[‹XY
NÂˆ›Üˆ
ÛÛœÝÙˆËLŒŽKŒŽWJHÂˆÛÛœÝ^YHHY\Ú
™]È‘QK”Ü\™QÙ[ÛY]žJŒŒËML
K^YSX]Œ‹LÊNÂˆ^YKœØØ[KœÙ]
Œ‹KÌŠNÂˆË˜Y
^YJNÂˆBˆ›Üˆ
ÛÛœÝÚYHÙˆËLKWJHÂˆÛÛœÝÚ[™ÈHY\Ú
™]È‘QK”[™QÙ[ÛY]žJÌ‹KŽJKÚ[™ÓX]ÚYH
ˆŒÎÎKŒJNÂˆÚ[™Ëœ›Ý][Û‹žHLÂˆÚ[™Ëœ›Ý][Û‹žˆHÚYH
ˆNÂˆË˜Y
Ú[™ÊNÂˆBˆÛÛœÝYÓX]H™]È‘QK“Y\ÚÝ[™\™X]\šX[
ÈÛÛÜŽˆ˜LXÌMË›ÝYÚ™\ÜÎˆŽJNÂˆ›Üˆ
]Z\ˆHÈZ\ˆÎÈZ\ŠÊÊH›Üˆ
ÛÛœÝÚYHÙˆËLKWJHÂˆÛÛœÝYÈHY\Ú
™]È‘QKÞ[[™\‘Ù[ÛY]žJŒKŒNŽMKŠKYÓX]ÚYH
ˆËŒ‹LŒMH
ÈZ\ˆ
ˆŒÍŠNÂˆYËœ›Ý][Û‹žˆHÚYH
ˆŽNÂˆË˜Y
YÊNÂˆBˆË›˜[YHHYÂˆ›Üˆ
ÛÛœÝÚ[ÙˆË˜Ú[™[ŠH\Ë™›TXÚÓY\Ú\ËœÙ]
Ú[Y
NÂˆ™]\›ˆÎÂˆB‚ˆš]˜]H›Ý[™\‘Ù[›ÛYJ
NˆÙ[›ÛYHÂˆ™]\›ˆÂˆY]X›Û\ÛNˆ\Ëœ›™Ëœ˜[™ÙJŽL‹KŒ
KˆÙ[œÛÜžQØZ[Žˆ\Ëœ›™Ëœ˜[™ÙJŽL‹KŒ
KˆØÛÛ[Ý[Û‘ØZ[Žˆ\Ëœ›™Ëœ˜[™ÙJŽL‹KŒ
KˆÝ™\ÜÑØZ[Žˆ\Ëœ›™Ëœ˜[™ÙJŽKKŒJKˆY™\Ü[‘^\Îˆ\Ëœ›™Ëœ˜[™ÙJÎN
Kˆ™\[]Nˆ\Ëœ›™Ëœ˜[™ÙJŽKKŒJKˆNÂˆB‚ˆš]˜]HÜ]Û‘›Ý[™\ŠYˆÝš[™ËÙ^ˆÙ^ÜÚ][ÛŽˆ‘QK•™XÝÜŒÊHÂˆÛÛœÝ™XÛÜ™H\Ë›XZÙQ›JYÙ^[\Ë™›Ý[™\‘Ù[›ÛYJ
KÜÚ][ÛŠNÂˆ\Ë™›Y\Ëœ\Ú
™XÛÜ™
NÂˆ\ËœØÙ[™K˜Y
™XÛÜ™›Y\Ú
NÂˆB‚ˆš]˜]HXZÙQ›JYˆÝš[™ËÙ^ˆÙ^Ù[™\˜][ÛŽˆ[X™\‹\™[ÎˆÜÝš[™ËÝš[™×H[Ù[›ÛYNˆÙ[›ÛYKÜÚ][ÛŽˆ‘QK•™XÝÜŒÊNˆ›T™XÛÜ™ÂˆÛÛœÝ›SY\ÚH\Ë˜Z[›P›ÙJYÙ^
NÂˆ›SY\ÚœÜÚ][Û‹˜ÛÜJÜÚ][ÛŠNÂˆ™]\›ˆÂˆYˆY\Úˆ›SY\ÚˆÙ^ˆÝYÙNˆ˜Y[‹ˆÙ[™\˜][Û‹ˆ\™[ËˆÙ[›ÛYKˆXY[™Îˆ\Ëœ›™Ëœ˜[™ÙJSX]”KX]”JKˆ™\XØ[™[ØÚ]Nˆˆ[™\™ÞNˆ\Ëœ›™Ëœ˜[™ÙJÌ‹LŠKˆY˜][ÛŽˆ\Ëœ›™Ëœ˜[™ÙJÍ‹M
Kˆ[™Ù\ˆˆ\Ëœ›™Ëœ˜[™ÙJŒŒŠKˆÝ™\ÜÎˆ\Ëœ›™Ëœ˜[™ÙJŒKŒN
KˆYÙQ^\ÎˆÙ[™\˜][ÛˆOOHÈ\Ëœ›™Ëœ˜[™ÙJL
HˆˆØ\ÚˆˆÛYRYˆ[ˆ™ZXÛRYˆ[ˆ[•™ZXÛNˆ˜[ÙKˆØ\œžZ[™ÐÜ˜]RYˆ[ˆÚ[™[Žˆ×Kˆ\Ý[˜ÙNˆˆ›ÛÙÛÛœÝ[YYˆˆ[˜ÛÛYQX\›™YˆˆXØÚY[Îˆˆœ˜Z[“Û›[™Nˆ˜[ÙKˆœ˜Z[XÝ]š]Nˆˆ[ÝÜˆˆÈ\›Žˆš]™NˆYˆ[\˜XÝˆ\ØØ\NˆXÝ]š]Nˆ™XYNˆ˜[ÙHKˆ[\˜XÝ[ÛÛÛÛÝÛˆˆˆNÂˆB‚ˆš]˜]HÚ[™[›ÛYJNˆÙ[›ÛYKŽˆÙ[›ÛYJNˆÙ[›ÛYHÂˆÛÛœÝZ^H
ˆ[X™\‹Nˆ[X™\‹]]][ÛŽˆ[X™\ŠHOˆ

ÈJHÈˆ
ˆ
H
È\Ëœ›™ËœÚYÛ™Y
]]][ÛŠJNÂˆ™]\›ˆÂˆY]X›Û\ÛNˆÛ[\
Z^
K›Y]X›Û\ÛK‹›Y]X›Û\ÛKŒÍJKÎKŒJKˆÙ[œÛÜžQØZ[ŽˆÛ[\
Z^
KœÙ[œÛÜžQØZ[‹‹œÙ[œÛÜžQØZ[‹Œ
KÌ‹KŒÍJKˆØÛÛ[Ý[Û‘ØZ[ŽˆÛ[\
Z^
K›ØÛÛ[Ý[Û‘ØZ[‹‹›ØÛÛ[Ý[Û‘ØZ[‹Œ
KÌ‹KŒÍJKˆÝ™\ÜÑØZ[ŽˆÛ[\
Z^
KœÝ™\ÜÑØZ[‹‹œÝ™\ÜÑØZ[‹Œ
KÌ‹K
KˆY™\Ü[‘^\ÎˆÛ[\
Z^
K›Y™\Ü[‘^\Ë‹›Y™\Ü[‘^\ËŒMJKKÍJKˆ™\[]NˆÛ[\
Z^
K™™\[]K‹™™\[]KŒJKMKKJKˆNÂˆB‚ˆÙ]Ù[œÛÜžJYˆÝš[™ÊNˆÙ[œÛÜžQœ˜[YH[ÂˆÛÛœÝ›HH\Ë™›Y\Ë™š[™

ŠHOˆ‹šYOOHY	‰ˆ‹œÝYÙHOOH˜Y[ŠNÂˆYˆ
Y›JH™]\›ˆ[ÂˆÛÛœÝH›K›Y\ÚœÜÚ][ÛŽÂˆ]ÜXÓYHÂˆ]ÜXÔšYÚHÂˆ]ÜXÑ›ÜØ\™HÂˆ]›ÛÙÙÜˆHÂˆ]ÛÛ\Ú[ÛˆHÂˆ]\›Û[Û™SYHÂˆ]\›Û[Û™TšYÚHÂ‚ˆÛÛœÝÙ[œÙTÚ[H
Ú[ˆ‘QK•™XÝÜŒËØ[Y[˜ÙNˆ[X™\‹ÛØÚX[H˜[ÙJHOˆÂˆÛÛœÝHÚ[žHžÂˆÛÛœÝˆHÚ[žˆHžŽÂˆÛÛœÝHX]›X^
‹X]š\Ý
ŠJNÂˆYˆ
ˆ
H™]\›ŽÂˆÛÛœÝ[™ÛHHÜ˜\[™ÛJX]˜][ŒŠYŠHH›KšXY[™ÊNÂˆÛÛœÝ˜XÚ[™ÈHÛ[\JHHX]˜XœÊ[™ÛJHÈX]”JNÂˆÛÛœÝÝ™[™ÝHØ[Y[˜ÙH
ˆ˜XÚ[™ÈÈ
H
È
ˆŒLŠNÂˆYˆ
[™ÛH
HÜXÓY
ÏHÝ™[™ÝÈ[ÙHÜXÔšYÚ
ÏHÝ™[™ÝÂˆYˆ
X]˜XœÊ[™ÛJHŠHÜXÑ›ÜØ\™
ÏHÝ™[™ÝÂˆYˆ
ÛØÚX[
HÂˆYˆ
[™ÛH
H\›Û[Û™SY
ÏHÝ™[™ÝÈ[ÙH\›Û[Û™TšYÚ
ÏHÝ™[™ÝÂˆBˆYˆ
KŠHÛÛ\Ú[ÛˆHX]›X^
ÛÛ\Ú[Û‹HHÈKŠNÂˆNÂ‚ˆ›Üˆ
ÛÛœÝ›ÛÙÙˆ\Ë™›ÛÙÊHÂˆYˆ
›ÛÙœ]X[]HHŒŠHÛÛ[YNÂˆÛÛœÝHX]›X^
Ë™\Ý[˜ÙUÊ›ÛÙ›Y\ÚœÜÚ][ÛŠJNÂˆ›ÛÙÙÜˆ
ÏH›ÛÙ›ÙÜˆ
ˆ
›ÛÙœ]X[]HÈ›ÛÙ˜Ø\XÚ]JHÈ
H
È
ˆ
ˆŒN
NÂˆÙ[œÙTÚ[
›ÛÙ›Y\ÚœÜÚ][Û‹Ž
NÂˆBˆ›Üˆ
ÛÛœÝÜ˜]HÙˆ\Ë˜Ü˜]\ÊHYˆ
Ü˜]K˜]˜Z[X›HÜ˜]K˜Ø\œšY\’YOOH›KšY
HÙ[œÙTÚ[
Ü˜]K›Y\ÚœÜÚ][Û‹MJNÂˆ›Üˆ
ÛÛœÝÝ\ÙHÙˆ\ËšÝ\Ù\ÊHÙ[œÙTÚ[
Ý\ÙK›Y\ÚœÜÚ][Û‹ŒÍ
NÂˆ›Üˆ
ÛÛœÝ™ZXÛHÙˆ\Ë™ZXÛ\ÊHÙ[œÙTÚ[
™ZXÛK›Y\ÚœÜÚ][Û‹ŒŠNÂˆÙ[œÙTÚ[
\ËÛÜšÖ›Û™KŽJNÂˆÙ[œÙTÚ[
\ËœÝÜ™V›Û™KÍJNÂˆ›Üˆ
ÛÛœÝÝ\ˆÙˆ\Ë™›Y\ÊHYˆ
Ý\‹šYOOH›KšY	‰ˆÝ\‹œÝYÙHOOH˜Y[ŠHÙ[œÙTÚ[
Ý\‹›Y\ÚœÜÚ][Û‹Ì‹YJNÂ‚ˆÛÛœÝYÙHHX]›X^
X]˜XœÊž
KX]˜XœÊžŠJNÂˆYˆ
YÙHˆÓÔ“ÒSˆH
HÛÛ\Ú[ÛˆHX]›X^
ÛÛ\Ú[Û‹Û[\J
YÙHH
ÓÔ“ÒSˆH
JHÈ
JNÂˆ™]\›ˆÂˆÜXÓYˆÛ[\JÜXÓY
ˆ›K™Ù[›ÛYKœÙ[œÛÜžQØZ[ŠKˆÜXÔšYÚˆÛ[\JÜXÔšYÚ
ˆ›K™Ù[›ÛYKœÙ[œÛÜžQØZ[ŠKˆÜXÑ›ÜØ\™ˆÛ[\JÜXÑ›ÜØ\™
ˆ›K™Ù[›ÛYKœÙ[œÛÜžQØZ[ŠKˆ›ÛÙÙÜŽˆÛ[\J›ÛÙÙÜˆ
ˆ›K™Ù[›ÛYKœÙ[œÛÜžQØZ[ŠKˆ\›Û[Û™SYˆÛ[\J\›Û[Û™SY
Kˆ\›Û[Û™TšYÚˆÛ[\J\›Û[Û™TšYÚ
KˆÛÛ\Ú[ÛŽˆÛ[\JÛÛ\Ú[ÛŠKˆÜ›Ý[™ÛÛXÝˆžHHÔ“ÕS‘ÖH
ÈŒÈHˆˆ[™\™ÞNˆ›K™[™\™ÞKˆ[™Ù\Žˆ›Kš[™Ù\‹ˆNÂˆB‚ˆÙ][ÝÜŠYˆÝš[™Ë[ÝÜŽˆ[ÝÜ”ÚYÛ˜[
HÂˆÛÛœÝ›HH\Ë™›Y\Ë™š[™

ŠHOˆ‹šYOOHY
NÂˆYˆ
Y›H›KœÝYÙHOOH˜Y[ŠH™]\›ŽÂˆ›K›[ÝÜˆH[ÝÜŽÂˆ›K˜œ˜Z[“Û›[™HH[ÝÜ‹œ™XYNÂˆ›K˜œ˜Z[XÝ]š]HH[ÝÜ‹˜XÝ]š]NÂˆB‚ˆÙ]Ý]Ê
HÂˆÛÛœÝ]š[™ÈH\Ë™›Y\Ë™š[\Š
ŠHOˆ‹œÝYÙHOOH˜Y[ŠNÂˆÛÛœÝÝ[Ø\ÚH]š[™Ëœ™YXÙJ
ËŠHOˆÈ
È‹˜Ø\Ú
NÂˆÛÛœÝ›ÛÙH\Ë™›ÛÙËœ™YXÙJ
ËŠHOˆÈ
È‹œ]X[]K
NÂˆÛÛœÝ]™Ñ[™\™ÞHH]š[™Ë›[™ÝÈ]š[™Ëœ™YXÙJ
ËŠHOˆÈ
È‹™[™\™ÞK
HÈ]š[™Ë›[™ÝˆÂˆÛÛœÝ]™ÔÝ™\ÜÈH]š[™Ë›[™ÝÈ]š[™Ëœ™YXÙJ
ËŠHOˆÈ
È‹œÝ™\ÜË
HÈ]š[™Ë›[™ÝˆÂˆÛÛœÝX^Ù[™\˜][ÛˆH\Ë™›Y\Ëœ™YXÙJ
KŠHOˆX]›X^
K‹™Ù[™\˜][ÛŠK
NÂˆÛÛœÝÝÛ™YÛY\ÈH\ËšÝ\Ù\Ë™š[\Š

HOˆ›ÝÛ™\’Y
K›[™ÝÂˆÛÛœÝÝÛ™Y™ZXÛ\ÈH\Ë™ZXÛ\Ë™š[\Š
ŠHOˆ‹›ÝÛ™\’Y
K›[™ÝÂˆ™]\›ˆÂˆÜ[][ÛŽˆ]š[™Ë›[™ÝˆÝ[]™\Žˆ\Ë™›Y\Ë›[™Ýˆš\Îˆ\Ë˜š\ËˆX]Îˆ\Ë™X]ËˆÙ[™\˜][ÛŽˆX^Ù[™\˜][Û‹ˆ›ÛÙˆ[Û™^TÝ\NˆÝ[Ø\Ú
È\Ë™X\Ý\žH
È\ËœÝÜ™P˜[[˜ÙKˆÚ\˜Ý[][™ÐØ\ÚˆÝ[Ø\Úˆ™X\Ý\žNˆ\Ë™X\Ý\žKˆÝÛ™YÛY\ËˆÝÛ™Y™ZXÛ\Ëˆ]™Ñ[™\™ÞKˆ]™ÔÝ™\ÜËˆ[]™\™YÜ˜]\Îˆ\Ë™[]™\™YÜ˜]\ËˆNÂˆB‚ˆš]˜]HÛÜH

HOˆÂˆ\Ëœ˜YˆH™\]Y\Ý[š[X][Û‘œ˜[YJ\Ë›ÛÜ
NÂˆÛÛœÝHX]›Z[ŠŒK\Ë˜ÛØÚË™Ù][J
JNÂˆYˆ
\Ëœ[›š[™ÊH\ËœÝ\

NÂˆ\Ë\]PØ[Y\˜J
NÂˆ\Ëœ™[™\™\‹œ™[™\Š\ËœØÙ[™K\Ë˜Ø[Y\˜JNÂˆNÂ‚ˆš]˜]HÝ\
ˆ[X™\ŠHÂˆÛÛœÝÚ[QH
ˆÒSWÔÑPÓÓ‘×ÔT—Ô‘PSÔÑPÓÓ‘Âˆ\ËœÚ[TÙXÛÛ™È
ÏHÚ[QÂˆ\Ë\]Q[š\›Û›Y[
Ú[Q
NÂˆ›Üˆ
ÛÛœÝ›HÙˆ\Ë™›Y\ÊHYˆ
›KœÝYÙHOOH˜Y[ŠH\ËœÝ\›J›KÚ[Q
NÂˆ\Ë\]TÛØÚX[[™™\›ÙXÝ[ÛŠ
NÂˆB‚ˆš]˜]H\]Q[š\›Û›Y[
ˆ[X™\‹Ú[Qˆ[X™\ŠHÂˆ›Üˆ
ÛÛœÝ›ÛÙÙˆ\Ë™›ÛÙÊHÂˆ›ÛÙœ]X[]HHX]›Z[Š›ÛÙ˜Ø\XÚ]K›ÛÙœ]X[]H
È›ÛÙœ›ÙXÝ[Û”\”ÙXÛÛ™
ˆ
NÂˆÛÛœÝØØ[HHH
ÈMH
ˆ
›ÛÙœ]X[]HÈ›ÛÙ˜Ø\XÚ]JNÂˆ›ÛÙ›Y\ÚœØØ[KœÙ]ØØ[\ŠØØ[JNÂˆBˆ›Üˆ
ÛÛœÝÜ˜]HÙˆ\Ë˜Ü˜]\ÊHÂˆYˆ
XÜ˜]K˜]˜Z[X›H	‰ˆXÜ˜]K˜Ø\œšY\’Y	‰ˆ\ËœÚ[TÙXÛÛ™ÈHÜ˜]Kœ™\Ü]Û]
HÂˆÜ˜]K˜]˜Z[X›HHYNÂˆÜ˜]K›Y\Úš\ÚX›HHYNÂˆÜ˜]K›Y\ÚœÜÚ][Û‹œÙ]
\ËØ\™ZÝ\ÙV›Û™Kž
È\Ëœ›™Ëœ˜[™ÙJMKJKË\ËØ\™ZÝ\ÙV›Û™Kžˆ
È\Ëœ›™Ëœ˜[™ÙJMKJJNÂˆBˆBˆÛÛœÝ^HH
\ËœÚ[TÙXÛÛ™ÈÈ
H	HNÂˆÛÛœÝÝ[[™ÛHH^H
ˆX]”H
ˆˆHX]”H
ˆNÂˆÛÛœÝ^[YÚHÛ[\JX]œÚ[ŠÝ[[™ÛJH
ˆH
ÈJNÂˆ\ËœÝ[‹œÜÚ][Û‹œÙ]
X]˜ÛÜÊÝ[[™ÛJH
ˆLŒH
È^[YÚ
ˆLLX]œÚ[ŠÝ[[™ÛJH
ˆLŒ
NÂˆ\ËœÝ[‹š[[œÚ]HHŒÍH
È^[YÚ
ˆ‹ŒMNÂˆ\Ë˜[XšY[š[[œÚ]HHH
È^[YÚ
ˆKŒNÂˆÛÛœÝÚÞHH™]È‘QKÛÛÜŠ
KœÙ]Ó
MˆH^[YÚ
ˆŒÍK‹ŒMˆ
È^[YÚ
ˆŽ
NÂˆ\ËœØÙ[™K˜˜XÚÙÜ›Ý[™HÚÞNÂˆYˆ
\ËœØÙ[™K™›ÙÈ[œÝ[˜Ù[Ùˆ‘QK‘›ÙÊH\ËœØÙ[™K™›ÙË˜ÛÛÜ‹˜ÛÜJÚÞJNÂˆ›ÚYÚ[QÂˆB‚ˆš]˜]HÝ\›J›Nˆ›T™XÛÜ™ˆ[X™\‹Ú[Qˆ[X™\ŠHÂˆ›Kš[\˜XÝ[ÛÛÛÛÝÛˆHX]›X^
›Kš[\˜XÝ[ÛÛÛÛÝÛˆH
NÂˆ›K˜YÙQ^\È
ÏHÚ[QÈÂˆÛÛœÝÛH›K›Y\ÚœÜÚ][Û‹˜ÛÛ™J
NÂˆÛÛœÝ[ÝÜˆH›K›[ÝÜŽÂˆÛÛœÝ[™\™ÞQ˜XÝÜˆHÛ[\J›K™[™\™ÞHÈN
NÂˆÛÛœÝØÛÛ[Ý[Û‘ØZ[ˆH›K™Ù[›ÛYK›ØÛÛ[Ý[Û‘ØZ[ŽÂ‚ˆYˆ
›Kš[•™ZXÛH	‰ˆ›K™ZXÛRY
HÂˆÛÛœÝ™ZXÛHH\Ë™ZXÛ\Ë™š[™

ŠHOˆ‹šYOOH›K™ZXÛRY
NÂˆYˆ
™ZXÛJH\ËœÝ\™ZXÛJ›K™ZXÛK[™\™ÞQ˜XÝÜŠNÂˆH[ÙHÂˆ›KšXY[™ÈHÜ˜\[™ÛJ›KšXY[™È
È[ÝÜ‹\›ˆ
ˆØÛÛ[Ý[Û‘ØZ[ˆ
ˆ
ˆ‹ŽJNÂˆÛÛœÝZ\˜›Ü›™HH›K›Y\ÚœÜÚ][Û‹žHˆÔ“ÕS‘ÖH
ÈŒMŽÂˆÛÛœÝ›ÜØ\™ÜYYH
ŒN
È[ÝÜ‹™š]™H
ˆ
Z\˜›Ü›™HÈŽˆ‹ŒJJH
ˆ[™\™ÞQ˜XÝÜˆ
ˆØÛÛ[Ý[Û‘ØZ[ŽÂˆ›K›Y\ÚœÜÚ][Û‹ž
ÏHX]œÚ[Š›KšXY[™ÊH
ˆ›ÜØ\™ÜYY
ˆÂˆ›K›Y\ÚœÜÚ][Û‹žˆOHX]˜ÛÜÊ›KšXY[™ÊH
ˆ›ÜØ\™ÜYY
ˆÂˆÛÛœÝYH[ÝÜ‹›Y
ˆ[™\™ÞQ˜XÝÜˆ
ˆ‹Âˆ›K™\XØ[™[ØÚ]H
ÏH
YHËŒJH
ˆÂˆ›K™\XØ[™[ØÚ]H
HX]™^
Y
ˆKŒŠNÂˆ›K›Y\ÚœÜÚ][Û‹žH
ÏH›K™\XØ[™[ØÚ]H
ˆÂˆYˆ
›K›Y\ÚœÜÚ][Û‹žHHÔ“ÕS‘ÖJHÂˆ›K›Y\ÚœÜÚ][Û‹žHHÔ“ÕS‘ÖNÂˆYˆ
›K™\XØ[™[ØÚ]H
H›K™\XØ[™[ØÚ]HHÂˆBˆ›K›Y\ÚœÜÚ][Û‹žHHX]›Z[ŠN›K›Y\ÚœÜÚ][Û‹žJNÂˆ›K›Y\Úœ›Ý][Û‹žHH›KšXY[™ÎÂˆB‚ˆYˆ
X]˜XœÊ›K›Y\ÚœÜÚ][Û‹ž
HˆÓÔ“ÒSˆHŠHÂˆ›K›Y\ÚœÜÚ][Û‹žHÛ[\
›K›Y\ÚœÜÚ][Û‹žUÓÔ“ÒSˆ
È‹ÓÔ“ÒSˆHŠNÂˆ›KšXY[™ÈHÜ˜\[™ÛJ›KšXY[™È
ÈX]”H
ˆÊNÂˆ›KœÝ™\ÜÈHÛ[\J›KœÝ™\ÜÈ
ÈŒ
ˆ›K™Ù[›ÛYKœÝ™\ÜÑØZ[ŠNÂˆBˆYˆ
X]˜XœÊ›K›Y\ÚœÜÚ][Û‹žŠHˆÓÔ“ÒSˆHŠHÂˆ›K›Y\ÚœÜÚ][Û‹žˆHÛ[\
›K›Y\ÚœÜÚ][Û‹ž‹UÓÔ“ÒSˆ
È‹ÓÔ“ÒSˆHŠNÂˆ›KšXY[™ÈHÜ˜\[™ÛJ›KšXY[™È
ÈX]”H
ˆÊNÂˆ›KœÝ™\ÜÈHÛ[\J›KœÝ™\ÜÈ
ÈŒ
ˆ›K™Ù[›ÛYKœÝ™\ÜÑØZ[ŠNÂˆB‚ˆÛÛœÝ[Ý™YHÛ™\Ý[˜ÙUÊ›K›Y\ÚœÜÚ][ÛŠNÂˆ›K™\Ý[˜ÙH
ÏH[Ý™YÂˆÛÛœÝZ\˜›Ü›™HH›K›Y\ÚœÜÚ][Û‹žHˆÔ“ÕS‘ÖH
ÈŒMŽÂˆÛÛœÝY]X›ÛXÈH›K™Ù[›ÛYK›Y]X›Û\ÛH
ˆ
ŒN
È[ÝÜ‹™š]™H
ˆŒLˆ
È
Z\˜›Ü›™HÈŒLˆˆ
H
È[ÝÜ‹›Y
ˆŒ
NÂˆ›K™[™\™ÞHHX]›X^
›K™[™\™ÞHHY]X›ÛXÈ
ˆ
NÂˆ›KšY˜][ÛˆHX]›X^
›KšY˜][ÛˆH›K™Ù[›ÛYK›Y]X›Û\ÛH
ˆ
ŒÈ
È
Z\˜›Ü›™HÈŒLˆˆ
JH
ˆ
NÂˆ›Kš[™Ù\ˆHÛ[\JHH›K™[™\™ÞHÈL
NÂˆ›KœÝ™\ÜÈHÛ[\J›KœÝ™\ÜÈ
ˆX]™^
Y
ˆŒÍJH
È[ÝÜ‹™\ØØ\H
ˆ
ˆŒÈ
ˆ›K™Ù[›ÛYKœÝ™\ÜÑØZ[ŠNÂ‚ˆ\ËžQ›ÛÙ
›K
NÂˆ\ËžPÜ˜]J›JNÂˆ\ËžSXXÚ[™\Ê›JNÂ‚ˆYˆ
›K™[™\™ÞHHŒH›KšY˜][ÛˆHŒH›K˜YÙQ^\ÈH›K™Ù[›ÛYK›Y™\Ü[‘^\ÊHÂˆÛÛœÝØ]\ÙHH›K˜YÙQ^\ÈH›K™Ù[›ÛYK›Y™\Ü[‘^\ÈÈ˜YÚ[™Èˆˆ›KšY˜][ÛˆHŒHÈ™ZY˜][ÛˆˆˆœÝ\˜][ÛˆŽÂˆ\ËšÚ[›J›KØ]\ÙJNÂˆBˆB‚ˆš]˜]HÝ\™ZXÛJ›Nˆ›T™XÛÜ™™ZXÛNˆ™ZXÛKˆ[X™\‹[™\™ÞQ˜XÝÜŽˆ[X™\ŠHÂˆÛÛœÝ[ÝÜˆH›K›[ÝÜŽÂˆ™ZXÛKšXY[™ÈHÜ˜\[™ÛJ™ZXÛKšXY[™È
È[ÝÜ‹\›ˆ
ˆ
ˆKŽJNÂˆÛÛœÝ\™Ù]ÜYYH[ÝÜ‹™š]™H
ˆKH
ˆ[™\™ÞQ˜XÝÜˆ
ˆ
™ZXÛK˜˜]\žHÈL
NÂˆ™ZXÛKœÜYY
ÏH
\™Ù]ÜYYH™ZXÛKœÜYY
H
ˆÛ[\J
ˆËŒŠNÂˆ™ZXÛK›Y\ÚœÜÚ][Û‹ž
ÏHX]œÚ[Š™ZXÛKšXY[™ÊH
ˆ™ZXÛKœÜYY
ˆÂˆ™ZXÛK›Y\ÚœÜÚ][Û‹žˆOHX]˜ÛÜÊ™ZXÛKšXY[™ÊH
ˆ™ZXÛKœÜYY
ˆÂˆ™ZXÛK›Y\Úœ›Ý][Û‹žHH™ZXÛKšXY[™ÎÂˆ™ZXÛK˜˜]\žHHX]›X^
™ZXÛK˜˜]\žHH™ZXÛKœÜYY
ˆ
ˆŒN
NÂˆ›K›Y\ÚœÜÚ][Û‹œÙ]
™ZXÛK›Y\ÚœÜÚ][Û‹ž™ZXÛK›Y\ÚœÜÚ][Û‹žH
ÈKË™ZXÛK›Y\ÚœÜÚ][Û‹žŠNÂˆ›KšXY[™ÈH™ZXÛKšXY[™ÎÂˆ›K›Y\Úœ›Ý][Û‹žHH™ZXÛKšXY[™ÎÂˆYˆ
X]˜XœÊ™ZXÛK›Y\ÚœÜÚ][Û‹ž
HˆÓÔ“ÒSˆHHX]˜XœÊ™ZXÛK›Y\ÚœÜÚ][Û‹žŠHˆÓÔ“ÒSˆHJHÂˆ™ZXÛKœÜYY
HLŒMNÂˆ™ZXÛK˜ÛÛ™][ÛˆHX]›X^
™ZXÛK˜ÛÛ™][ÛˆH‹JNÂˆ›K˜XØÚY[ÊÊÎÂˆ›KœÝ™\ÜÈHÛ[\J›KœÝ™\ÜÈ
ÈŒN
ˆ›K™Ù[›ÛYKœÝ™\ÜÑØZ[ŠNÂˆ\Ë™[Z]
	Ù›KšYH™ZXÛH[\XÝ0­È	Ý™ZXÛKšYX
NÂˆBˆYˆ
[ÝÜ‹š[\˜XÝˆÌˆ	‰ˆ›Kš[\˜XÝ[ÛÛÛÛÝÛˆH
HÂˆ›Kš[•™ZXÛHH˜[ÙNÂˆ›Kš[\˜XÝ[ÛÛÛÛÝÛˆHŽÂˆ›K›Y\ÚœÜÚ][Û‹œÙ]
™ZXÛK›Y\ÚœÜÚ][Û‹ž
È‹ŒKÔ“ÕS‘ÖK™ZXÛK›Y\ÚœÜÚ][Û‹žŠNÂˆ\Ë™[Z]
	Ù›KšYH^]Y	Ý™ZXÛKšYX
NÂˆBˆB‚ˆš]˜]HžQ›ÛÙ
›Nˆ›T™XÛÜ™ˆ[X™\ŠHÂˆYˆ
›K›[ÝÜ‹š[\˜XÝŒMŠH™]\›ŽÂˆ]™X\™\Ýˆ›ÛÙ]Ú[H[Âˆ]\Ý[˜ÙHH[™š[š]NÂˆ›Üˆ
ÛÛœÝ›ÛÙÙˆ\Ë™›ÛÙÊHÂˆÛÛœÝH›K›Y\ÚœÜÚ][Û‹™\Ý[˜ÙUÊ›ÛÙ›Y\ÚœÜÚ][ÛŠNÂˆYˆ
\Ý[˜ÙJHÈ\Ý[˜ÙHHÈ™X\™\ÝH›ÛÙÈBˆBˆYˆ
[™X\™\Ý\Ý[˜ÙHˆ‹Ž™X\™\Ýœ]X[]HH
H™]\›ŽÂˆÛÛœÝš]HHX]›Z[Š™X\™\Ýœ]X[]K
ˆ
‹Œˆ
È›K›[ÝÜ‹š[\˜XÝ
ˆJJNÂˆ™X\™\Ýœ]X[]HOHš]NÂˆ›K™›ÛÙÛÛœÝ[YY
ÏHš]NÂˆ›K™[™\™ÞHHX]›Z[ŠL›K™[™\™ÞH
Èš]H
ˆÌŠNÂˆ›KšY˜][ÛˆHX]›Z[ŠL›KšY˜][Ûˆ
Èš]H
ˆŒM
NÂˆB‚ˆš]˜]HžPÜ˜]J›Nˆ›T™XÛÜ™
HÂˆYˆ
›Kš[•™ZXÛJH™]\›ŽÂˆYˆ
›K˜Ø\œžZ[™ÐÜ˜]RY
HÂˆÛÛœÝÜ˜]HH\Ë˜Ü˜]\Ë™š[™

ÊHOˆËšYOOH›K˜Ø\œžZ[™ÐÜ˜]RY
NÂˆYˆ
Ü˜]JHÜ˜]K›Y\ÚœÜÚ][Û‹œÙ]
›K›Y\ÚœÜÚ][Û‹ž›K›Y\ÚœÜÚ][Û‹žH
ÈKŒ‹›K›Y\ÚœÜÚ][Û‹žˆ
ÈŽ
NÂˆYˆ
›K›Y\ÚœÜÚ][Û‹™\Ý[˜ÙUÊ\ËÛÜšÖ›Û™JHŒˆ	‰ˆÜ˜]JHÂˆÜ˜]K˜Ø\œšY\’YH[ÂˆÜ˜]K˜]˜Z[X›HH˜[ÙNÂˆÜ˜]K›Y\Úš\ÚX›HH˜[ÙNÂˆÜ˜]Kœ™\Ü]Û]H\ËœÚ[TÙXÛÛ™È
ÈLÂˆ›K˜Ø\œžZ[™ÐÜ˜]RYH[ÂˆYˆ
\Ë™X\Ý\žHHJHÂˆ\Ë™X\Ý\žHOHNÂˆ›K˜Ø\Ú
ÏHNÂˆ›Kš[˜ÛÛYQX\›™Y
ÏHNÂˆBˆ\Ë™[]™\™YÜ˜]\ÊÊÎÂˆ\Ë™[Z]
	Ù›KšYH[]™\™Y	ØÜ˜]KšYH0­È™X\Ý\žH8¡¤ˆ›HHØ
NÂˆBˆ™]\›ŽÂˆBˆYˆ
›K›[ÝÜ‹š[\˜XÝŒÍ›Kš[\˜XÝ[ÛÛÛÛÝÛˆˆ
H™]\›ŽÂˆ›Üˆ
ÛÛœÝÜ˜]HÙˆ\Ë˜Ü˜]\ÊHÂˆYˆ
XÜ˜]K˜]˜Z[X›HÜ˜]K˜Ø\œšY\’Y
HÛÛ[YNÂˆYˆ
›K›Y\ÚœÜÚ][Û‹™\Ý[˜ÙUÊÜ˜]K›Y\ÚœÜÚ][ÛŠH‹ŒJHÂˆÜ˜]K˜Ø\œšY\’YH›KšYÂˆ›K˜Ø\œžZ[™ÐÜ˜]RYHÜ˜]KšYÂˆ›Kš[\˜XÝ[ÛÛÛÛÝÛˆHKŒŽÂˆ\Ë™[Z]
	Ù›KšYHÛÛXÝY[™Ø\œšYY	ØÜ˜]KšYX
NÂˆœ™XZÎÂˆBˆBˆB‚ˆš]˜]HžSXXÚ[™\Ê›Nˆ›T™XÛÜ™
HÂˆYˆ
›Kš[\˜XÝ[ÛÛÛÛÝÛˆˆ›Kš[•™ZXÛJH™]\›ŽÂˆÛÛœÝ[\˜XÝ[ÛˆH›K›[ÝÜ‹š[\˜XÝÂˆYˆ
[\˜XÝ[ÛˆŠH™]\›ŽÂ‚ˆYˆ
›K›Y\ÚœÜÚ][Û‹™\Ý[˜ÙUÊ\ËœÝÜ™V›Û™JHŒˆ	‰ˆ›K˜Ø\ÚHJHÂˆ›K˜Ø\ÚOHNÂˆ\ËœÝÜ™P˜[[˜ÙH
ÏHNÂˆÛÛœÝX\šÙ]H\Ë™›ÛÙË™š[™

ŠHOˆ‹šYOOH‘“ÓÑSPT’ÑUŠNÂˆYˆ
X\šÙ]
HX\šÙ]œ]X[]HHX]›Z[ŠX\šÙ]˜Ø\XÚ]KX\šÙ]œ]X[]H
ÈLŠNÂˆ›Kš[\˜XÝ[ÛÛÛÛÝÛˆH‹ŒŽÂˆ\Ë™[Z]
	Ù›KšYH[œÙ\YHÈ0­È›ÛÙXXÚ[™H™[X\ÙY™\ÛÝ\˜ÙX
NÂˆ™]\›ŽÂˆB‚ˆ›Üˆ
ÛÛœÝÝ\ÙHÙˆ\ËšÝ\Ù\ÊHÂˆYˆ
Ý\ÙK›ÝÛ™\’Y›KšÛYRY›K˜Ø\ÚÝ\ÙKœšXÙJHÛÛ[YNÂˆYˆ
›K›Y\ÚœÜÚ][Û‹™\Ý[˜ÙUÊÝ\ÙK›Y\ÚœÜÚ][ÛŠHJHÂˆ›K˜Ø\ÚOHÝ\ÙKœšXÙNÂˆ\Ë™X\Ý\žH
ÏHÝ\ÙKœšXÙNÂˆÝ\ÙK›ÝÛ™\’YH›KšYÂˆ›KšÛYRYHÝ\ÙKšYÂˆ›Kš[\˜XÝ[ÛÛÛÛÝÛˆHËNÂˆ\Ë™[Z]
	Ù›KšYHXÝ]˜]YXØÙ\ÜÈÈ	ÚÝ\ÙKšYH›Üˆ	ÚÝ\ÙKœšXÙ_HØ
NÂˆ™]\›ŽÂˆBˆB‚ˆ›Üˆ
ÛÛœÝ™ZXÛHÙˆ\Ë™ZXÛ\ÊHÂˆÛÛœÝH›K›Y\ÚœÜÚ][Û‹™\Ý[˜ÙUÊ™ZXÛK›Y\ÚœÜÚ][ÛŠNÂˆYˆ
ˆŒŠHÛÛ[YNÂˆYˆ
]™ZXÛK›ÝÛ™\’Y	‰ˆY›K™ZXÛRY	‰ˆ›K˜Ø\ÚH™ZXÛKœšXÙJHÂˆ›K˜Ø\ÚOH™ZXÛKœšXÙNÂˆ\Ë™X\Ý\žH
ÏH™ZXÛKœšXÙNÂˆ™ZXÛK›ÝÛ™\’YH›KšYÂˆ›K™ZXÛRYH™ZXÛKšYÂˆ›Kš[\˜XÝ[ÛÛÛÛÝÛˆHÎÂˆ\Ë™[Z]
	Ù›KšYHXÝ]˜]YÝÛ™\œÚ\Ùˆ	Ý™ZXÛKšYH›Üˆ	Ý™ZXÛKœšXÙ_HØ
NÂˆ™]\›ŽÂˆBˆYˆ
™ZXÛK›ÝÛ™\’YOOH›KšY	‰ˆY›Kš[•™ZXÛJHÂˆ›Kš[•™ZXÛHHYNÂˆ›Kš[\˜XÝ[ÛÛÛÛÝÛˆHŽÂˆ\Ë™[Z]
	Ù›KšYH[\™Y	Ý™ZXÛKšYH0­Èœ˜Z[ˆ[ÝÜˆÝ]]›ÝÈš]™\È™ZXÛX
NÂˆ™]\›ŽÂˆBˆBˆB‚ˆš]˜]H\]TÛØÚX[[™™\›ÙXÝ[ÛŠˆ[X™\ŠHÂˆÛÛœÝ[]™HH\Ë™›Y\Ë™š[\Š
ŠHOˆ‹œÝYÙHOOH˜Y[ŠNÂˆ›Üˆ
]HHÈH[]™K›[™ÝÈJÊÊHÂˆ›Üˆ
]ˆHH
ÈNÈˆ[]™K›[™ÝÈŠÊÊHÂˆÛÛœÝHH[]™VÚWNÂˆÛÛœÝˆH[]™VÚ—NÂˆÛÛœÝHK›Y\ÚœÜÚ][Û‹™\Ý[˜ÙUÊ‹›Y\ÚœÜÚ][ÛŠNÂˆÛÛœÝÙ^HHKšY‹šYÈ	ØKšY_	Ø‹šYXˆ	Ø‹šY_	ØKšYXÂˆYˆ
ÊH\ËœÛØÚX[œÙ]
Ù^K
\ËœÛØÚX[™Ù]
Ù^JHÏÈ
H
È
NÂˆYˆ
KH	‰ˆKœÙ^OOH‹œÙ^	‰ˆK›[ÝÜ‹š[\˜XÝˆLˆ	‰ˆ‹›[ÝÜ‹š[\˜XÝˆLˆ	‰ˆK™[™\™ÞHˆÎ	‰ˆ‹™[™\™ÞHˆÎ
HÂˆÛÛœÝ˜[YHH
\Ë›X][™Ë™Ù]
Ù^JHÏÈ
H
È
ˆ

K™Ù[›ÛYK™™\[]H
È‹™Ù[›ÛYK™™\[]JHÈŠNÂˆ\Ë›X][™ËœÙ]
Ù^K˜[YJNÂˆYˆ
˜[YHˆËH	‰ˆ\Ë™›Y\Ë™š[\Š
ŠHOˆ‹œÝYÙHOOH˜Y[ŠK›[™ÝPVÑ•SÐ”RS”ÊHÂˆ\Ë›X][™ËœÙ]
Ù^KMŒ
NÂˆ›ÚY\Ë˜Ü™X]SÙ™œÜš[™ÊKŠNÂˆBˆH[ÙHÂˆÛÛœÝ˜[YHH\Ë›X][™Ë™Ù]
Ù^JHÏÈÂˆYˆ
˜[YHˆ
H\Ë›X][™ËœÙ]
Ù^KX]›X^
˜[YHH
ˆŒÊJNÂˆYˆ
˜[YH
H\Ë›X][™ËœÙ]
Ù^KX]›Z[Š˜[YH
È
JNÂˆBˆBˆBˆB‚ˆš]˜]H\Þ[˜ÈÜ™X]SÙ™œÜš[™ÊNˆ›T™XÛÜ™Žˆ›T™XÛÜ™
HÂˆÛÛœÝYH“KIÔÝš[™Ê\Ë™›Y\Ë›[™Ý
ÈJKœYÝ\
‹ŒŠ_XÂˆÛÛœÝÙ^ˆÙ^H\Ëœ›™Ë›™^

HHÈ™™[X[Hˆˆ›X[HŽÂˆÛÛœÝÙ[›ÛYHH\Ë˜Ú[Ù[›ÛYJK™Ù[›ÛYK‹™Ù[›ÛYJNÂˆÛÛœÝZYHK›Y\ÚœÜÚ][Û‹˜ÛÛ™J
K›\œ
‹›Y\ÚœÜÚ][Û‹JNÂˆZYžHHÔ“ÕS‘ÖNÂˆÛÛœÝÚ[H\Ë›XZÙQ›JYÙ^X]›X^
K™Ù[™\˜][Û‹‹™Ù[™\˜][ÛŠH
ÈKØKšY‹šYKÙ[›ÛYKZY
NÂˆ\Ë™›Y\Ëœ\Ú
Ú[
NÂˆ\ËœØÙ[™K˜Y
Ú[›Y\Ú
NÂˆÛÛœÝœ˜Z[“ÚÈH\Ë˜š\[™\ˆÈ]ØZ]\Ë˜š\[™\ŠY
Hˆ˜[ÙNÂˆYˆ
Xœ˜Z[“ÚÊHÂˆ\ËœØÙ[™Kœ™[[Ý™JÚ[›Y\Ú
NÂˆ\Ë™›Y\ËœÜXÙJ\Ë™›Y\Ëš[™^ÙŠÚ[
KJNÂˆ\Ë™[Z]
š\›ØÚÙYˆ›È[™\[™[[Xœ˜Z[ˆØ\XÚ]H›Üˆ	ÚYX
NÂˆ™]\›ŽÂˆBˆK˜Ú[™[‹œ\Ú
Y
NÂˆ‹˜Ú[™[‹œ\Ú
Y
NÂˆK™[™\™ÞHHX]›X^
K™[™\™ÞHH
NÂˆ‹™[™\™ÞHHX]›X^
‹™[™\™ÞHH
NÂˆ\Ë˜š\ÊÊÎÂˆ\Ë™[Z]
	ÚYH›Ü›ˆ0­ÈÙ[™\˜][Ûˆ	ØÚ[™Ù[™\˜][ÛŸH0­È\™[È	ØKšYK	Ø‹šYX
NÂˆB‚ˆš]˜]HÚ[›J›Nˆ›T™XÛÜ™Ø]\ÙNˆÝš[™ÊHÂˆYˆ
›KœÝYÙHOOH™XYŠH™]\›ŽÂˆ›KœÝYÙHH™XYŽÂˆ›K›[ÝÜˆHÈ\›Žˆš]™NˆYˆ[\˜XÝˆ\ØØ\NˆXÝ]š]Nˆ™XYNˆ˜[ÙHNÂˆ›K›Y\Úœ›Ý][Û‹žˆHX]”H
ˆNÂˆ›K›Y\ÚœÜÚ][Û‹žHHÔ“ÕS‘ÖNÂˆ\Ë™X]ÊÊÎÂˆ\Ë™[Z]
	Ù›KšYHYY0­È	ØØ]\Ù_X
NÂˆB‚ˆš]˜]H\]PØ[Y\˜Jˆ[X™\ŠHÂˆYˆ
\Ë˜Ø[Y\˜S[ÙHOOH™›ÛÝÈˆ	‰ˆ\Ë™›ÛÝÒY
HÂˆÛÛœÝ›HH\Ë™›Y\Ë™š[™

ŠHOˆ‹šYOOH\Ë™›ÛÝÒY
NÂˆYˆ
›JHÂˆÛÛœÝ˜XÚÈH™]È‘QK•™XÝÜŒÊSX]œÚ[Š›KšXY[™ÊH
ˆKKŒ‹X]˜ÛÜÊ›KšXY[™ÊH
ˆJNÂˆÛÛœÝ\™Ù]H›K›Y\ÚœÜÚ][Û‹˜ÛÛ™J
K˜Y
˜XÚÊNÂˆ\Ë˜Ø[Y\˜KœÜÚ][Û‹›\œ
\™Ù]Û[\J
ˆËŽ
JNÂˆÛÛœÝÛÚÈH›K›Y\ÚœÜÚ][Û‹˜ÛÛ™J
K˜Y
™]È‘QK•™XÝÜŒÊKŒK
JNÂˆ\Ë˜Ø[Y\˜K›ÛÚÐ]
ÛÚÊNÂˆ™]\›ŽÂˆBˆBˆÛÛœÝH\ËœÚ[TÙXÛÛ™È
ˆŒÂˆÛÛœÝ\™Ù]H™]È‘QK•™XÝÜŒÊX]œÚ[Š
H
ˆM‹LL‹MÌˆ
ÈX]˜ÛÜÊ
H
ˆLŠNÂˆ\Ë˜Ø[Y\˜KœÜÚ][Û‹›\œ
\™Ù]Û[\J
ˆŽ
JNÂˆ\Ë˜Ø[Y\˜K›ÛÚÐ]

NÂˆB‚ˆš]˜]H[Z]
Y\ÜØYÙNˆÝš[™ÊHÂˆÛÛœÝ^HHX]™›ÛÜŠ\ËœÚ[TÙXÛÛ™ÈÈ
NÂˆÛÛœÝÝ\ˆHX]™›ÛÜŠ
\ËœÚ[TÙXÛÛ™È	H
HÈÍŒ
NÂˆÛÛœÝZ[]HHX]™›ÛÜŠ
\ËœÚ[TÙXÛÛ™È	HÍŒ
HÈŒ
NÂˆÛÛœÝ[™HH	Ù^_H	ÔÝš[™ÊÝ\ŠKœYÝ\
‹ŒŠ_N‰ÔÝš[™ÊZ[]JKœYÝ\
‹ŒŠ_H0­È	ÛY\ÜØYÙ_XÂˆ\Ë™]™[Ë[œÚY
[™JNÂˆÚ[H
\Ë™]™[Ë›[™Ýˆ
H\Ë™]™[ËœÜ

NÂˆ\Ë›Û‘]™[
[™JNÂˆB‚ˆš]˜]H™\Ú^™HH

HOˆÂˆÛÛœÝÈH\Ë˜ÛÛZ[™\‹˜ÛY[ÚYÂˆÛÛœÝH\Ë˜ÛÛZ[™\‹˜ÛY[ZYÚÂˆ\Ë˜Ø[Y\˜K˜\ÜXÝHX]›X^
KÊHÈX]›X^
K
NÂˆ\Ë˜Ø[Y\˜K\]T›Ú™XÝ[Û“X]š^

NÂˆ\Ëœ™[™\™\‹œÙ]Ú^™JË˜[ÙJNÂˆNÂ‚ˆš]˜]HXÚÑ›HH
]™[ˆÚ[\‘]™[
HOˆÂˆÛÛœÝ™XÝH\Ëœ™[™\™\‹™ÛQ[[Y[™Ù]›Ý[™[™ÐÛY[™XÝ

NÂˆ\ËœÚ[\‹žH

]™[˜ÛY[H™XÝ›Y
HÈ™XÝÚY
H
ˆˆHNÂˆ\ËœÚ[\‹žHHJ
]™[˜ÛY[HH™XÝÜ
HÈ™XÝšZYÚ
H
ˆˆ
ÈNÂˆ\Ëœ˜^XØ\Ý\‹œÙ]œ›ÛPØ[Y\˜J\ËœÚ[\‹\Ë˜Ø[Y\˜JNÂˆÛÛœÝ]ÈH\Ëœ˜^XØ\Ý\‹š[\œÙXÝØš™XÝÊË‹‹\Ë™›TXÚÓY\Ú\ËšÙ^\Ê
WKYJNÂˆ›Üˆ
ÛÛœÝ]Ùˆ]ÊHÂˆ]ØšŽˆ‘QK“Øš™XÝÑ[H]›Øš™XÝÂˆÚ[H
ØšŠHÂˆÛÛœÝYH\Ë™›TXÚÓY\Ú\Ë™Ù]
ØšŠNÂˆYˆ
Y
HÂˆ\ËœÙ[XÝYYHYÂˆ\Ë™›ÛÝÒYHYÂˆ™]\›ŽÂˆBˆØšˆHØš‹œ\™[ÂˆBˆBˆNÂŸB‚˜ÛÛœÝ›ÛÝHØÝ[Y[™Ù][[Y[žRY
ÛÜ›ŠH\ÈS]‘[[Y[Â˜ÛÛœÝœ˜Z[”Ý]Q[HØÝ[Y[™Ù][[Y[žRY
˜œ˜Z[‹\Ý]HŠH\ÈS]‘[[Y[Â˜ÛÛœÝœ˜Z[‘]Z[[HØÝ[Y[™Ù][[Y[žRY
˜œ˜Z[‹Y]Z[ŠH\ÈS]‘[[Y[Â˜ÛÛœÝÝ]Ñ[HØÝ[Y[™Ù][[Y[žRY
œÝ]ÈŠH\ÈS]‘[[Y[Â˜ÛÛœÝ›S\Ý[HØÝ[Y[™Ù][[Y[žRY
™›K[\ÝŠH\ÈS]‘[[Y[Â˜ÛÛœÝ[œÜXÝÜ‘[HØÝ[Y[™Ù][[Y[žRY
š[œÜXÝÜˆŠH\ÈS]‘[[Y[Â˜ÛÛœÝ]™[ÙÑ[HØÝ[Y[™Ù][[Y[žRY
™]™[[ÙÈŠH\ÈS]‘[[Y[Â˜ÛÛœÝÚ[U[YQ[HØÝ[Y[™Ù][[Y[žRY
œÚ[K][YHŠH\ÈSÜ[‘[[Y[Â˜ÛÛœÝ[Ù[[HØÝ[Y[™Ù][[Y[žRY
›[Ù[[[™HŠH\ÈS]‘[[Y[Â˜ÛÛœÝÚ]PˆHØÝ[Y[™Ù][[Y[žRY
˜Ú]KXØ[Y\˜HŠH\ÈS]Û‘[[Y[Â˜ÛÛœÝ›ÛÝÐˆHØÝ[Y[™Ù][[Y[žRY
™›ÛÝËXØ[Y\˜HŠH\ÈS]Û‘[[Y[Â‚˜ÛÛœÝ]™[[™\ÎˆÝš[™Ö×HH×NÂ˜ÛÛœÝÛÜ›H™]È[Y™UÛÜ›
›ÛÝ
[™JHOˆÂˆ]™[[™\Ë[œÚY
[™JNÂˆÚ[H
]™[[™\Ë›[™ÝˆLJH]™[[™\ËœÜ

NÂˆ]™[ÙÑ[š[›™\’SH]™[[™\Ë›X\


HOˆ]‰ÞOÙ]˜
Kš›Ú[ŠˆŠNÂŸJNÂ‚˜ÛÛœÝœ˜Z[œÈH™]ÈÚ]š[^˜][Ûœ˜Z[”ÛÛ
ˆ
Y
HOˆÛÜ›™Ù]Ù[œÛÜžJY
Kˆ
Y[ÝÜŠHOˆÛÜ›œÙ][ÝÜŠY[ÝÜŠKˆ
Ý]K]Z[
HOˆÂˆœ˜Z[”Ý]Q[™]\Ù]œÝ]HHÝ]NÂˆœ˜Z[”Ý]Q[^ÛÛ[HÝ]HOOHœ[›š[™ÈˆÈ‘•S”RS”ÈÓ“S‘HˆˆÝ]HOOH™\œ›ÜˆˆÈ”RSˆT”“Ôˆˆˆ“ÐQS‘È”RS”ÈŽÂˆœ˜Z[‘]Z[[^ÛÛ[H]Z[ÂˆKŠNÂ‚ÛÜ›œÙ]š\[™\Š\Þ[˜È
Y
HOˆœ˜Z[œË˜YYÙ[
Y
JNÂ›ÚYœ˜Z[œËœÝ\
ÛÜ›™›Y\ËœÛXÙJÕT•S‘×Ñ“WÐÓÕS•
K›X\

ŠHOˆ‹šY
JNÂ‚˜Ú]P‹˜Y]™[\Ý[™\Š˜ÛXÚÈ‹

HOˆÛÜ›œÙ]Ø[Y\˜S[ÙJ˜Ú]HŠJNÂ™›ÛÝÐ‹˜Y]™[\Ý[™\Š˜ÛXÚÈ‹

HOˆÂˆÛÛœÝYHÛÜ›™Ù]Ù[XÝYY

HÏÈÛÜ›™›Y\Ë™š[™

ŠHOˆ‹œÝYÙHOOH˜Y[ŠOËšYÂˆYˆ
Y
HÛÜ›œÙ]Ø[Y\˜S[ÙJ™›ÛÝÈ‹Y
NÂŸJNÂ‚™[˜Ý[Ûˆ›Ü›X]Ú[U[YJÙXÛÛ™Îˆ[X™\ŠHÂˆÛÛœÝ^\ÈHX]™›ÛÜŠÙXÛÛ™ÈÈ
NÂˆÛÛœÝÝ\œÈHX]™›ÛÜŠ
ÙXÛÛ™È	H
HÈÍŒ
NÂˆÛÛœÝZ[]\ÈHX]™›ÛÜŠ
ÙXÛÛ™È	HÍŒ
HÈŒ
NÂˆ™]\›ˆVH	Ù^\ßH0­È	ÔÝš[™ÊÝ\œÊKœYÝ\
‹ŒŠ_N‰ÔÝš[™ÊZ[]\ÊKœYÝ\
‹ŒŠ_XÂŸB‚™[˜Ý[Ûˆ[Û™^JŽˆ[X™\ŠHÈ™]\›ˆ	Ý‹Ñš^Y
ˆ	HHÈHˆ
_HØÈB‚™[˜Ý[Ûˆ™[™\•ZJ
HÂˆÛÛœÝÈHÛÜ›™Ù]Ý]Ê
NÂˆÚ[U[YQ[^ÛÛ[H›Ü›X]Ú[U[YJÛÜ›™Ù]Ú[TÙXÛÛ™Ê
JNÂˆÛÛœÝ›˜ÈHœ˜Z[œË™Ù]›˜Ò[™›Ê
NÂˆ[Ù[[^ÛÛ[HÓÔ“PH0­ÈÙYY	ÕÓÔ“ÔÑQQH0­È	Øœ˜Z[œË˜ÛÝ[

_H[™\[™[Qˆœ˜Z[ˆÝ]\ÉÝ›˜ÈÈ0­ÈPSÈ	Ý›˜Ë›™]\›ÛœËÓØØ[TÝš[™Ê
_H™]\›ÛœØˆˆ0­ÈPSÈØY[™ÈŸXÂˆÝ]Ñ[š[›™\’SHÂˆÈ”Ü[][Ûˆ‹Ýš[™ÊËœÜ[][ÛŠWKÈ‘Ù[™\˜][Ûˆ‹Ýš[™ÊË™Ù[™\˜][ÛŠWKÈš\ÈÈX]È‹	ÜË˜š\ßHÈ	ÜË™X]ßXKˆÈ‘›ÛÙÝ\H‹Ë™›ÛÙÑš^Y
JWKÈ“[Û™^HÝ\H‹[Û™^JË›[Û™^TÝ\JWKÈ‘›HØ\Ú‹[Û™^JË˜Ú\˜Ý[][™ÐØ\Ú
WKˆÈ’ÛYHÝÛ™\œÚ\‹Ýš[™ÊË›ÝÛ™YÛY\ÊWKÈ•™ZXÛHÝÛ™\œÚ\‹Ýš[™ÊË›ÝÛ™Y™ZXÛ\ÊWKÈÜ˜]\È[]™\™Y‹Ýš[™ÊË™[]™\™YÜ˜]\ÊWKˆÈ]™È[™\™ÞH‹	ÜË˜]™Ñ[™\™ÞKÑš^Y
J_IXKÈ]™ÈÝ™\ÜÈ‹	ÊË˜]™ÔÝ™\ÜÈ
ˆL
KÑš^Y
J_IXKÈ•™X\Ý\žH‹[Û™^JË™X\Ý\žJWKˆK›X\

ÚË—JHOˆ]Ü[‰ÚßOÜÜ[‰ÝŸOØÙ]˜
Kš›Ú[ŠˆŠNÂ‚ˆ›S\Ý[š[›™\’SHÛÜ›™›Y\Ë›X\

ŠHOˆÂˆÛÛœÝÙ[XÝYHÛÜ›™Ù]Ù[XÝYY

HOOH‹šYÈˆÙ[XÝYˆˆˆŽÂˆ™]\›ˆ]ÛˆÛ\ÜÏH™›K\›ÝÉÜÙ[XÝYHˆ]KZYH‰Ù‹šYHÜ[‰Ù‹šYOÜÜ[ÛX[‘ÉÙ‹™Ù[™\˜][ÛŸH0­È	Ù‹œÝYÙ_H0­È	Û[Û™^J‹˜Ø\Ú
_OÜÛX[Ø]Û˜ÂˆJKš›Ú[ŠˆŠNÂˆ›Üˆ
ÛÛœÝ]ÛˆÙˆ›S\Ý[œ]Y\žTÙ[XÝÜ[S]Û‘[[Y[Š˜]Û–Ù]KZYHŠJHÂˆ]Û‹›Û˜ÛXÚÈH

HOˆÛÜ›œÙ[XÝ›J]Û‹™]\Ù]šYÏÈ[
NÂˆB‚ˆÛÛœÝÙ[XÝYHÛÜ›™›Y\Ë™š[™

ŠHOˆ‹šYOOHÛÜ›™Ù]Ù[XÝYY

JHÏÈÛÜ›™›Y\ÖÌNÂˆYˆ
Ù[XÝY
HÂˆ[œÜXÝÜ‘[š[›™\’SHˆ]ˆÛ\ÜÏHš[œÜXÝZXY‰ÜÙ[XÝYšYOØÜ[‰ÜÙ[XÝYœÙ^H0­ÈÙ[™\˜][Ûˆ	ÜÙ[XÝY™Ù[™\˜][ÛŸOÜÜ[Ù]‚ˆ]ˆÛ\ÜÏH›Y]\œÈ‚ˆX™[‘[™\™ÞHHÝ[OHÚY‰ØÛ[\JÙ[XÝY™[™\™ÞHÈL
H
ˆLIHÚO[O‰ÜÙ[XÝY™[™\™ÞKÑš^Y
J_IOÙ[OÛX™[‚ˆX™[”Ý™\ÜÈHÝ[OHÚY‰ØÛ[\JÙ[XÝYœÝ™\ÜÊH
ˆLIHÚO[O‰ÊÙ[XÝYœÝ™\ÜÈ
ˆL
KÑš^Y
J_IOÙ[OÛX™[‚ˆX™[œ˜Z[ˆXÝ]š]HHÝ[OHÚY‰ØÛ[\JÙ[XÝY˜œ˜Z[XÝ]š]H
ˆN
H
ˆLIHÚO[O‰ÜÙ[XÝY˜œ˜Z[XÝ]š]KÑš^Y

_OÙ[OÛX™[‚ˆÙ]‚ˆ]ˆÛ\ÜÏHš[œÜXÝYÜšY‚ˆÜ[YÙOÜÜ[‰ÜÙ[XÝY˜YÙQ^\ËÑš^Y
Š_HØÜ[Ø\ÚÜÜ[‰Û[Û™^JÙ[XÝY˜Ø\Ú
_OØ‚ˆÜ[’ÛYOÜÜ[‰ÜÙ[XÝYšÛYRYÏÈ¸ %ŸOØÜ[•™ZXÛOÜÜ[‰ÜÙ[XÝY™ZXÛRYÏÈ¸ %ŸOØ‚ˆÜ[‘\Ý[˜ÙOÜÜ[‰ÜÙ[XÝY™\Ý[˜ÙKÑš^Y
J_HOØÜ[‘›ÛÙÜÜ[‰ÜÙ[XÝY™›ÛÙÛÛœÝ[YYÑš^Y
J_OØ‚ˆÜ[’[˜ÛÛYOÜÜ[‰Û[Û™^JÙ[XÝYš[˜ÛÛYQX\›™Y
_OØÜ[Ú[™[ÜÜ[‰ÜÙ[XÝY˜Ú[™[‹›[™ÝOØ‚ˆÜ[“[ÝÜˆ\›ÜÜ[‰ÜÙ[XÝY›[ÝÜ‹\›‹Ñš^Y
Š_OØÜ[“[ÝÜˆš]™OÜÜ[‰ÜÙ[XÝY›[ÝÜ‹™š]™KÑš^Y
Š_OØ‚ˆÜ[“[ÝÜˆYÜÜ[‰ÜÙ[XÝY›[ÝÜ‹›YÑš^Y
Š_OØÜ[’[\˜XÝÜÜ[‰ÜÙ[XÝY›[ÝÜ‹š[\˜XÝÑš^Y
Š_OØ‚ˆÙ]˜ÂˆBˆ™\]Y\Ý[š[X][Û‘œ˜[YJ™[™\•ZJNÂŸB‚ÛÜ›œÙ[XÝ›JÛÜ›™›Y\ÖÌOËšYÏÈ[
NÂœ™[™\•ZJ
NÂ