import * as THREE from "three";

export type FlyMode = "walk" | "fly" | "feed" | "rest";

export interface BrainMotorSignal {
  turn: number;
  drive: number;
  lift: number;
  feed: number;
  escape: number;
  activity: number;
  ready: boolean;
}

export interface OpenWorldSensory {
  foodOdor: number;
  foodDistance: number;
  foodAngle: number;
  danger: number;
  dangerDistance: number;
  dangerAngle: number;
  groundContact: number;
  altitude: number;
  energy: number;
  mode: FlyMode;
}

export interface OpenWorldTelemetry extends OpenWorldSensory {
  speed: number;
  heading: number;
  brainTurn: number;
  brainDrive: number;
  brainLift: number;
  brainFeed: number;
  brainActivity: number;
  nearestFood: string;
  nearestAnimal: string;
  foodEaten: number;
  takeoffs: number;
  landings: number;
  distanceTravelled: number;
  timeAlive: number;
}

interface FoodPatch {
  name: string;
  node: THREE.Group;
  energy: number;
  maxEnergy: number;
  odor: number;
  radius: number;
}

interface Creature {
  kind: "ant" | "beetle" | "spider" | "mantis" | "dragonfly" | "frog";
  node: THREE.Group;
  direction: THREE.Vector3;
  speed: number;
  phase: number;
  dangerRadius: number;
  captureRadius: number;
}

const WORLD_HALF = 110;
const GROUND_Y = 0.18;
const RETINA_W = 64;
const RETINA_H = 16;

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
function wrapAngle(v: number) {
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
}
function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x=0, y=0, z=0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class OpenWorld {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(52, 1, 0.06, 420);

  private readonly fly = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly wings: THREE.Mesh[] = [];
  private readonly legRoots: THREE.Group[] = [];
  private readonly proboscis: THREE.Mesh;
  private readonly retinaCamera = new THREE.PerspectiveCamera(118, RETINA_W / RETINA_H, 0.025, 60);
  private readonly retinaTarget = new THREE.WebGLRenderTarget(RETINA_W, RETINA_H, { depthBuffer: true });
  private readonly retinaPixels = new Uint8Array(RETINA_W * RETINA_H * 4);
  private readonly foods: FoodPatch[] = [];
  private readonly creatures: Creature[] = [];
  private readonly clock = new THREE.Clock();
  private readonly events: string[] = [];
  private readonly cameraLook = new THREE.Vector3();

  private raf = 0;
  private running = true;
  private mode: FlyMode = "walk";
  private heading = 0;
  private speed = 0;
  private verticalSpeed = 0;
  private energy = 78;
  private hunger = 0.22;
  private elapsed = 0;
  private stateAge = 0;
  private foodEaten = 0;
  private takeoffs = 0;
  private landings = 0;
  private distanceTravelled = 0;
  private nextWanderBias = 0;
  private wanderBias = 0;
  private nextTakeoffEarliest = 4;
  private currentFood: FoodPatch | null = null;
  private lastPosition = new THREE.Vector3();
  private birdPhase = -100;
  private birdShadow: THREE.Mesh | null = null;
  private predatorCooldown = 0;

  private brain: BrainMotorSignal = {
    turn: 0, drive: 0, lift: 0, feed: 0, escape: 0, activity: 0, ready: false,
  };

  constructor(
    private readonly container: HTMLElement,
    private readonly onEvent?: (message: string) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0xbfd6e5);
    this.scene.fog = new THREE.Fog(0xbfd6e5, 95, 270);

    this.buildLights();
    this.buildTerrain();
    this.buildPlants();
    this.buildFoods();
    this.buildCreatures();
    this.proboscis = this.buildFly();

    this.retinaCamera.position.set(0, 0.24, -0.62);
    this.retinaCamera.rotation.x = 0.03;
    this.head.add(this.retinaCamera);

    this.fly.position.set(0, GROUND_Y, 12);
    this.lastPosition.copy(this.fly.position);
    this.cameraLook.copy(this.fly.position);
    this.scene.add(this.fly);

    window.addEventListener("resize", this.resize);
    this.resize();
    this.clock.start();
    this.emit("spawned in the meadow");
    this.loop();
  }

  start() { this.running = true; }
  pause() { this.running = false; }

  setBrainSignal(signal: BrainMotorSignal) {
    this.brain = {
      turn: THREE.MathUtils.clamp(signal.turn, -1, 1),
      drive: clamp01(signal.drive),
      lift: clamp01(signal.lift),
      feed: clamp01(signal.feed),
      escape: clamp01(signal.escape),
      activity: Math.max(0, signal.activity),
      ready: signal.ready,
    };
  }

  getSensorySnapshot(): OpenWorldSensory {
    const food = this.nearestFood();
    const danger = this.nearestDanger();
    return {
      foodOdor: food.odor,
      foodDistance: food.distance,
      foodAngle: food.angle,
      danger: danger.strength,
      dangerDistance: danger.distance,
      dangerAngle: danger.angle,
      groundContact: this.fly.position.y <= GROUND_Y + 0.05 ? 1 : 0,
      altitude: Math.max(0, this.fly.position.y - GROUND_Y),
      energy: this.energy,
      mode: this.mode,
    };
  }

  getTelemetry(): OpenWorldTelemetry {
    const sensory = this.getSensorySnapshot();
    const food = this.nearestFood();
    const animal = this.nearestCreature();
    return {
      ...sensory,
      speed: this.speed,
      heading: this.heading,
      brainTurn: this.brain.turn,
      brainDrive: this.brain.drive,
      brainLift: this.brain.lift,
      brainFeed: this.brain.feed,
      brainActivity: this.brain.activity,
      nearestFood: food.food?.name ?? "none",
      nearestAnimal: animal.creature?.kind ?? "none",
      foodEaten: this.foodEaten,
      takeoffs: this.takeoffs,
      landings: this.landings,
      distanceTravelled: this.distanceTravelled,
      timeAlive: this.elapsed,
    };
  }

  drainEvents() {
    return this.events.splice(0);
  }

  captureRetina(): { pixels: Uint8Array; w: number; h: number } {
    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.retinaTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.retinaCamera);
    this.renderer.readRenderTargetPixels(this.retinaTarget, 0, 0, RETINA_W, RETINA_H, this.retinaPixels);
    this.renderer.setRenderTarget(previous);
    return { pixels: this.retinaPixels.slice(), w: RETINA_W, h: RETINA_H };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.retinaTarget.dispose();
    this.renderer.dispose();
    this.container.replaceChildren();
  }

  private emit(message: string) {
    const stamp = Math.floor(this.elapsed);
    const line = stamp + "s · " + message;
    this.events.push(line);
    if (this.events.length > 20) this.events.shift();
    this.onEvent?.(line);
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xeef8ff, 0x617148, 2.2));
    const sun = new THREE.DirectionalLight(0xfff4d5, 3.4);
    sun.position.set(-55, 75, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    this.scene.add(sun);
  }

  private buildTerrain() {
    const grass = new THREE.MeshStandardMaterial({ color: 0x607f4c, roughness: 1 });
    const ground = mesh(new THREE.PlaneGeometry(WORLD_HALF * 2.25, WORLD_HALF * 2.25, 1, 1), grass);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.scene.add(ground);

    const pathMat = new THREE.MeshStandardMaterial({ color: 0x9a8567, roughness: 1 });
    for (let i = 0; i < 6; i++) {
      const p = mesh(new THREE.PlaneGeometry(13, 160), pathMat, -70 + i * 28, 0.012, 0);
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = (i % 2 ? 0.12 : -0.09);
      p.material = pathMat;
      this.scene.add(p);
    }

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x4f9ab5, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.82,
    });
    const pond = mesh(new THREE.CircleGeometry(16, 48), waterMat, 55, 0.03, -52);
    pond.rotation.x = -Math.PI / 2;
    pond.scale.set(1.45, 0.8, 1);
    this.scene.add(pond);

    const rockMat = new THREE.MeshStandardMaterial({ color: 0x70736d, roughness: 0.94 });
    for (let i = 0; i < 55; i++) {
      const a = i * 2.399;
      const r = 78 + (i % 7) * 4.2;
      const rock = mesh(new THREE.DodecahedronGeometry(1.1 + (i % 4) * 0.35, 0), rockMat,
        Math.cos(a) * r, 0.8, Math.sin(a) * r);
      rock.scale.y = 0.7 + (i % 3) * 0.2;
      this.scene.add(rock);
    }
  }

  private buildPlants() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x65472f, roughness: 1 });
    const leafPalette = [0x446c3e, 0x507b45, 0x3e6437, 0x668a4f];
    for (let i = 0; i < 36; i++) {
      const a = i * 2.21;
      const r = 32 + (i * 19 % 65);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = 5 + (i % 5) * 1.6;
      const trunk = mesh(new THREE.CylinderGeometry(0.42, 0.65, h, 8), trunkMat, x, h / 2, z);
      this.scene.add(trunk);
      const leaves = mesh(
        new THREE.SphereGeometry(2.8 + (i % 4) * 0.55, 12, 8),
        new THREE.MeshStandardMaterial({ color: leafPalette[i % leafPalette.length], roughness: 0.95 }),
        x, h + 1.7, z,
      );
      leaves.scale.y = 1.25;
      this.scene.add(leaves);
    }

    const stemMat = new THREE.MeshStandardMaterial({ color: 0x3f6b37, roughness: 1 });
    const petals = [0xf5d15e, 0xe87891, 0xeae5f2, 0xd681d9, 0xff9e4d];
    for (let i = 0; i < 150; i++) {
      const x = ((i * 47) % 205) - 102;
      const z = ((i * 83) % 205) - 102;
      if (Math.hypot(x - 55, z + 52) < 19) continue;
      const stem = mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.55, 6), stemMat, x, 0.28, z);
      this.scene.add(stem);
      const flower = mesh(
        new THREE.SphereGeometry(0.14, 8, 5),
        new THREE.MeshStandardMaterial({ color: petals[i % petals.length], roughness: 0.75 }),
        x, 0.6, z,
      );
      flower.scale.set(1.7, 0.55, 1.7);
      this.scene.add(flower);
    }

    const logMat = new THREE.MeshStandardMaterial({ color: 0x735137, roughness: 0.95 });
    for (const [x,z,rot] of [[-42,28,0.7],[36,44,-0.4],[18,-66,1.15],[-67,-25,-0.8]] as Array<[number,number,number]>) {
      const log = mesh(new THREE.CylinderGeometry(1.1, 1.35, 8, 12), logMat, x, 1.2, z);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = rot;
      this.scene.add(log);
    }
  }

  private buildFoods() {
    const add = (name: string, x: number, z: number, color: number, odor: number, kind: "fruit"|"flower"|"sugar") => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      if (kind === "fruit") {
        const fruitMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
        for (let i = 0; i < 5; i++) {
          const f = mesh(new THREE.SphereGeometry(0.75, 14, 10), fruitMat,
            Math.sin(i*2.2)*0.75, 0.55 + (i%2)*0.28, Math.cos(i*2.2)*0.75);
          f.scale.set(1.0, 0.72, 1.15);
          g.add(f);
        }
      } else if (kind === "flower") {
        const petalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.72 });
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2;
          const p = mesh(new THREE.SphereGeometry(0.42, 10, 7), petalMat, Math.cos(a)*0.65, 0.75, Math.sin(a)*0.65);
          p.scale.set(1.4, 0.35, 0.75);
          p.rotation.y = -a;
          g.add(p);
        }
        g.add(mesh(new THREE.SphereGeometry(0.34, 10, 7), new THREE.MeshStandardMaterial({ color: 0xf2c84a }), 0, 0.8, 0));
      } else {
        const plate = mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.16, 24), new THREE.MeshStandardMaterial({ color: 0xe5dfd1 }), 0, 0.1, 0);
        g.add(plate);
        const syrup = mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.04, 24), new THREE.MeshStandardMaterial({ color, roughness: 0.25 }), 0, 0.2, 0);
        g.add(syrup);
      }
      this.scene.add(g);
      this.foods.push({ name, node:g, energy:100, maxEnergy:100, odor, radius:1.5 });
    };

    add("overripe banana", -30, 34, 0xe2bd43, 1.0, "fruit");
    add("watermelon scraps", 38, 8, 0xc7474f, 0.82, "fruit");
    add("mango", -55, -45, 0xf0a83a, 0.95, "fruit");
    add("sugar water", 15, -25, 0xd1aa6b, 1.15, "sugar");
    add("nectar flower", 70, 45, 0xdd6d9d, 0.7, "flower");
    add("fermenting plum", -8, 72, 0x7c496d, 1.25, "fruit");
    add("orange peel", 62, -72, 0xef8f2f, 0.85, "fruit");
  }

  private buildCreatures() {
    // Harmless background insects.
    for (let i=0;i<14;i++) this.addCreature("ant", -75 + (i*17)%150, -68 + (i*29)%136, 0.75 + (i%3)*0.12);
    for (let i=0;i<5;i++) this.addCreature("beetle", -65 + (i*27)%130, -60 + (i*43)%120, 0.38 + (i%2)*0.1);

    // Predators are deliberately placed near the central spawn so the
    // viewer can actually see ecological interactions without waiting.
    this.addCreature("spider", 7, 8, 0.95);
    this.addCreature("spider", -18, 18, 0.72);
    this.addCreature("mantis", -9, -6, 1.05);
    this.addCreature("mantis", 25, 12, 0.82);
    this.addCreature("dragonfly", 0, -18, 2.4);
    this.addCreature("dragonfly", -28, -12, 2.1);
    this.addCreature("frog", 19, -12, 0.78);
    this.addCreature("frog", 48, -48, 0.62);

    const shadowMat = new THREE.MeshBasicMaterial({ color:0x11151a, transparent:true, opacity:0.22, depthWrite:false });
    this.birdShadow = mesh(new THREE.CircleGeometry(3.4, 24), shadowMat, -150, 0.025, -150);
    this.birdShadow.rotation.x = -Math.PI/2;
    this.birdShadow.scale.set(1.8,0.7,1);
    this.scene.add(this.birdShadow);
  }

  private addCreature(kind: Creature["kind"], x:number, z:number, speed:number) {
    const g = new THREE.Group();
    const isDragonfly = kind==="dragonfly";
    const isFrog = kind==="frog";
    const isMantis = kind==="mantis";
    const isSpider = kind==="spider";
    g.position.set(x, isDragonfly ? 2.5 : 0.16, z);

    const dark = new THREE.MeshStandardMaterial({
      color: isSpider ? 0x2c2422 : kind==="beetle" ? 0x263f36 : kind==="ant" ? 0x191817 : 0x30372a,
      roughness:0.78,
    });

    if (isMantis) {
      const green = new THREE.MeshStandardMaterial({ color:0x6f8b45, roughness:0.72 });
      const thorax=mesh(new THREE.SphereGeometry(0.34,12,8),green,0,0.75,0); thorax.scale.set(0.75,1.1,1.25); g.add(thorax);
      const abdomen=mesh(new THREE.SphereGeometry(0.38,12,8),green,0,0.72,0.7); abdomen.scale.set(0.72,0.7,1.45); g.add(abdomen);
      const head=mesh(new THREE.SphereGeometry(0.28,12,8),green,0,1.12,-0.42); head.scale.set(1.05,0.8,0.9); g.add(head);
      for(const side of [-1,1]){
        const eye=mesh(new THREE.SphereGeometry(0.08,8,6),new THREE.MeshStandardMaterial({color:0x111714}),side*0.2,1.17,-0.56);g.add(eye);
        const arm=mesh(new THREE.CylinderGeometry(0.035,0.025,1.25,7),green,side*0.38,0.75,-0.45);
        arm.rotation.z=side*0.55; arm.rotation.x=0.35; g.add(arm);
      }
    } else if (isDragonfly) {
      const blue = new THREE.MeshStandardMaterial({ color:0x2f6f7c, metalness:0.25, roughness:0.42 });
      const wing = new THREE.MeshStandardMaterial({ color:0xd5eef0, transparent:true, opacity:0.42, side:THREE.DoubleSide, roughness:0.18 });
      const thorax=mesh(new THREE.SphereGeometry(0.3,12,8),blue,0,0,0);g.add(thorax);
      const abdomen=mesh(new THREE.CylinderGeometry(0.12,0.07,2.1,10),blue,0,0,0.95);abdomen.rotation.x=Math.PI/2;g.add(abdomen);
      for(const side of [-1,1]){
        for(const zOff of [-0.08,0.3]){
          const w=mesh(new THREE.PlaneGeometry(1.7,0.45),wing,side*0.75,0.05,zOff);
          w.rotation.z=side*0.12; w.rotation.y=side*0.18; g.add(w);
        }
      }
      const head=mesh(new THREE.SphereGeometry(0.28,12,8),new THREE.MeshStandardMaterial({color:0x49695e}),0,0,-0.38);g.add(head);
    } else if (isFrog) {
      const frogMat=new THREE.MeshStandardMaterial({color:0x5a7d46,roughness:0.82});
      const body=mesh(new THREE.SphereGeometry(0.72,14,10),frogMat,0,0.58,0);body.scale.set(1.2,0.7,1.0);g.add(body);
      const head=mesh(new THREE.SphereGeometry(0.58,14,10),frogMat,0,0.68,-0.55);head.scale.set(1.05,0.75,0.9);g.add(head);
      for(const side of [-1,1]){
        const eye=mesh(new THREE.SphereGeometry(0.14,10,7),new THREE.MeshStandardMaterial({color:0xe2d68d}),side*0.32,1.03,-0.72);g.add(eye);
        const pupil=mesh(new THREE.SphereGeometry(0.065,8,6),new THREE.MeshStandardMaterial({color:0x111111}),side*0.34,1.04,-0.84);g.add(pupil);
        const leg=mesh(new THREE.CylinderGeometry(0.08,0.11,1.4,8),frogMat,side*0.66,0.3,0.45);leg.rotation.z=side*0.9;g.add(leg);
      }
    } else {
      const body = mesh(new THREE.SphereGeometry(isSpider?0.55:0.25, 10, 7), dark, 0, isSpider?0.32:0.18, 0);
      body.scale.set(0.85,0.7,1.3);
      g.add(body);
      if (kind==="beetle") {
        const shell = mesh(new THREE.SphereGeometry(0.31, 12, 8), new THREE.MeshStandardMaterial({ color:0x395f4e, metalness:0.35, roughness:0.4 }),0,0.27,0.08);
        shell.scale.set(0.9,0.65,1.2); g.add(shell);
      }
      const legCount = isSpider?8:6;
      for(let i=0;i<legCount;i++){
        const side=i%2?-1:1;
        const row=Math.floor(i/2);
        const limb=mesh(new THREE.CylinderGeometry(0.018,0.018,isSpider?1.05:0.45,6),dark,side*0.34,0.15,(row-(legCount/4-0.5))*0.18);
        limb.rotation.z=side*(isSpider?1.0:0.85);
        g.add(limb);
      }
    }

    this.scene.add(g);
    const angle=(x*0.17+z*0.11)%6.28;
    const dangerRadius =
      isDragonfly ? 22 :
      isMantis ? 13 :
      isFrog ? 12 :
      isSpider ? 11 : 0;
    const captureRadius =
      isDragonfly ? 0.85 :
      isMantis ? 0.9 :
      isFrog ? 1.15 :
      isSpider ? 0.7 : 0;

    this.creatures.push({
      kind,node:g,direction:new THREE.Vector3(Math.cos(angle),0,Math.sin(angle)).normalize(),
      speed,phase:Math.abs(x+z)*0.03,dangerRadius,captureRadius,
    });
  }

  private buildFly() {
    this.fly.scale.setScalar(1.0);
    const bodyMat = new THREE.MeshStandardMaterial({ color:0x4b3326, roughness:0.72 });
    const abdomenMat = new THREE.MeshStandardMaterial({ color:0x2b211a, roughness:0.78 });
    const eyeMat = new THREE.MeshStandardMaterial({ color:0xa8272c, emissive:0x510609, emissiveIntensity:0.65, roughness:0.42 });
    const jointMat = new THREE.MeshStandardMaterial({ color:0x241915, roughness:0.8 });
    const wingMat = new THREE.MeshStandardMaterial({ color:0xcfe5e8, transparent:true, opacity:0.47, side:THREE.DoubleSide, roughness:0.2 });

    const thorax=mesh(new THREE.SphereGeometry(0.34,18,12),bodyMat,0,0.42,0);
    thorax.scale.set(0.85,0.9,1.05); this.fly.add(thorax);
    const abdomen=mesh(new THREE.SphereGeometry(0.31,18,12),abdomenMat,0,0.43,0.52);
    abdomen.scale.set(0.75,0.68,1.42); this.fly.add(abdomen);

    this.head.position.set(0,0.48,-0.38);
    const skull=mesh(new THREE.SphereGeometry(0.29,18,12),bodyMat); this.head.add(skull);
    for(const x of [-0.23,0.23]){
      const eye=mesh(new THREE.SphereGeometry(0.2,18,12),eyeMat,x,0.03,-0.08);
      eye.scale.set(0.66,1.0,0.72); this.head.add(eye);
    }
    const antennaMat=new THREE.MeshStandardMaterial({ color:0x2d2019, roughness:0.85 });
    for(const x of [-0.11,0.11]){
      const ant=mesh(new THREE.CylinderGeometry(0.018,0.012,0.42,6),antennaMat,x,0.2,-0.27);
      ant.rotation.x=0.75; ant.rotation.z=x<0?-0.22:0.22; this.head.add(ant);
    }
    const prob=mesh(new THREE.CylinderGeometry(0.045,0.07,0.48,10),new THREE.MeshStandardMaterial({ color:0x5b3d31,roughness:0.72 }),0,-0.18,-0.36);
    prob.rotation.x=Math.PI/2; prob.scale.y=0.18; this.head.add(prob);
    this.fly.add(this.head);

    for(const side of [-1,1]){
      const wing=mesh(new THREE.PlaneGeometry(0.62,1.55),wingMat,side*0.27,0.64,0.2);
      wing.rotation.x=-0.42; wing.rotation.z=side*0.55; this.fly.add(wing); this.wings.push(wing);
    }

    for(let pair=0;pair<3;pair++){
      for(const side of [-1,1]){
        const root=new THREE.Group();
        root.position.set(side*0.22,0.35,-0.13+pair*0.27);
        const upper=mesh(new THREE.CylinderGeometry(0.025,0.022,0.52,7),jointMat,0,-0.18,0);
        upper.rotation.z=side*0.78;
        const lower=mesh(new THREE.CylinderGeometry(0.018,0.014,0.58,7),jointMat,side*0.26,-0.48,0);
        lower.rotation.z=side*0.52;
        const foot=mesh(new THREE.CylinderGeometry(0.012,0.01,0.36,6),jointMat,side*0.43,-0.69,-0.05);
        foot.rotation.z=side*1.05;
        root.add(upper,lower,foot); this.fly.add(root); this.legRoots.push(root);
      }
    }
    return prob;
  }

  private nearestFood() {
    let best: FoodPatch | null = null;
    let distance = Infinity;
    let angle = 0;
    let odor = 0;
    for(const f of this.foods){
      if(f.energy<=0) continue;
      const dx=f.node.position.x-this.fly.position.x;
      const dz=f.node.position.z-this.fly.position.z;
      const d=Math.max(0.3,Math.hypot(dx,dz));
      const o=(f.odor*(f.energy/f.maxEnergy))*Math.min(1,18/(d*d*0.13+1));
      odor+=o;
      if(d<distance){best=f;distance=d;angle=wrapAngle(Math.atan2(dx,-dz)-this.heading);}
    }
    return { food:best, distance, angle, odor:clamp01(odor) };
  }

  private nearestCreature() {
    let best: Creature|null=null; let distance=Infinity;
    for(const c of this.creatures){
      const d=this.fly.position.distanceTo(c.node.position);
      if(d<distance){distance=d;best=c;}
    }
    return {creature:best,distance};
  }

  private nearestDanger() {
    let distance=Infinity, angle=0, strength=0;
    for(const c of this.creatures){
      if(c.dangerRadius<=0) continue;
      const dx=c.node.position.x-this.fly.position.x;
      const dy=c.node.position.y-this.fly.position.y;
      const dz=c.node.position.z-this.fly.position.z;
      const d=Math.hypot(dx,dy,dz);
      const localStrength=clamp01(1-d/c.dangerRadius);
      if(localStrength>strength){
        strength=localStrength;
        distance=d;
        angle=wrapAngle(Math.atan2(dx,-dz)-this.heading);
      }
    }
    if(this.birdPhase>=0 && this.birdPhase<8 && this.birdShadow){
      const dx=this.birdShadow.position.x-this.fly.position.x;
      const dz=this.birdShadow.position.z-this.fly.position.z;
      const d=Math.hypot(dx,dz);
      const s=clamp01(1-d/20)*0.95;
      if(s>strength){strength=s;distance=d;angle=wrapAngle(Math.atan2(dx,-dz)-this.heading);}
    }
    return {distance,angle,strength};
  }

  private updateCreatures(dt:number) {
    this.predatorCooldown=Math.max(0,this.predatorCooldown-dt);

    for(const c of this.creatures){
      c.phase+=dt;
      const toFly=this.fly.position.clone().sub(c.node.position);
      const horizontal=new THREE.Vector3(toFly.x,0,toFly.z);
      const horizontalDistance=horizontal.length();

      if(c.dangerRadius>0 && horizontalDistance<c.dangerRadius*1.25){
        if(horizontalDistance>0.001)c.direction.lerp(horizontal.normalize(),dt*(c.kind==="dragonfly"?1.4:0.65)).normalize();
      }else{
        c.direction.applyAxisAngle(new THREE.Vector3(0,1,0),Math.sin(c.phase*0.7)*dt*0.22);
      }

      const chaseBoost = c.dangerRadius>0 && horizontalDistance<c.dangerRadius ? 1.55 : 1;
      c.node.position.addScaledVector(c.direction,c.speed*chaseBoost*dt);

      if(c.kind==="dragonfly"){
        const targetY=THREE.MathUtils.clamp(this.fly.position.y+0.5,1.8,10);
        c.node.position.y=THREE.MathUtils.damp(c.node.position.y,targetY,2.4,dt);
        for(const child of c.node.children){
          if(child instanceof THREE.Mesh && child.geometry.type==="PlaneGeometry"){
            child.rotation.x=Math.sin(c.phase*34)*0.22;
          }
        }
      }else if(c.kind==="frog"){
        c.node.position.y=0.16+Math.max(0,Math.sin(c.phase*3.2))*0.28;
      }else{
        c.node.position.y=0.16;
      }

      if(Math.abs(c.node.position.x)>WORLD_HALF-5)c.direction.x*=-1;
      if(Math.abs(c.node.position.z)>WORLD_HALF-5)c.direction.z*=-1;
      c.node.rotation.y=Math.atan2(c.direction.x,c.direction.z);

      if(c.captureRadius>0 && this.predatorCooldown<=0){
        const captureDistance=c.node.position.distanceTo(this.fly.position);
        if(captureDistance<c.captureRadius){
          this.emit("caught by "+c.kind+" · respawning");
          this.fly.position.set(0,2.6,12);
          this.heading=0;
          this.speed=2.2;
          this.verticalSpeed=0.6;
          this.mode="fly";
          this.stateAge=0;
          this.energy=72;
          this.predatorCooldown=4;
          this.takeoffs++;
        }
      }
    }

    if(this.birdPhase<0 && Math.floor(this.elapsed)%38===7 && this.elapsed>10){
      this.birdPhase=0; this.emit("a bird shadow entered the meadow");
    }
    if(this.birdPhase>=0 && this.birdShadow){
      this.birdPhase+=dt;
      this.birdShadow.position.set(-125+this.birdPhase*33,0.03,55-Math.sin(this.birdPhase*0.5)*35);
      if(this.birdPhase>8){this.birdPhase=-100;this.birdShadow.position.set(-150,0.03,-150);}
    }
  }

  private chooseMode(s:OpenWorldSensory) {
    const prev=this.mode;

    if(this.mode==="feed"){
      if(!this.currentFood || this.currentFood.energy<=0 || s.danger>0.2 || this.stateAge>8) {
        this.mode=s.danger>0.2?"fly":"walk";
      }
    } else if(this.mode==="fly"){
      // Once airborne, keep the fly in the air long enough to produce a
      // visible exploratory flight. It may still stay up longer if the brain
      // keeps lift/escape activity high.
      const minimumFlight = this.stateAge < 10;
      const brainStillWantsFlight =
        this.brain.escape>0.08 ||
        this.brain.lift>0.10 ||
        this.brain.activity>0.012;
      const wantsFoodLanding =
        s.foodOdor>0.62 &&
        s.foodDistance<7 &&
        this.hunger>0.42;

      if(!minimumFlight && !brainStillWantsFlight && s.danger<0.12 && (this.energy<30 || wantsFoodLanding)) {
        this.mode="walk";
      }
    } else if(s.danger>0.20 || this.brain.escape>0.10){
      this.mode="fly";
    } else if(s.foodDistance<1.55 && s.altitude<0.45 && (this.hunger>0.38 || this.brain.feed>0.48)){
      this.mode="feed";
      this.currentFood=this.nearestFood().food;
    } else if(this.energy<16 && s.danger<0.1){
      this.mode="rest";
    } else if(this.mode==="rest"){
      if(this.energy>32 || s.danger>0.1 || this.stateAge>10)this.mode=s.danger>0.1?"fly":"walk";
    } else {
      // The old threshold (lift > 0.58) almost never fired with the live
      // connectome. Use a lower, still-neural gate and require several
      // seconds of ground exploration between takeoffs.
      const neuralTakeoff =
        this.brain.ready &&
        this.elapsed>=this.nextTakeoffEarliest &&
        this.energy>28 &&
        this.stateAge>4 &&
        (this.brain.lift>0.10 || this.brain.activity>0.012 || this.brain.drive>0.42);

      if(neuralTakeoff) this.mode="fly";
    }

    if(prev!==this.mode){
      this.stateAge=0;
      if(this.mode==="fly"){
        this.takeoffs++;
        this.emit("takeoff · neural activity crossed flight gate");
      }
      if(prev==="fly" && this.mode!=="fly"){
        this.landings++;
        this.nextTakeoffEarliest=this.elapsed+7;
        this.emit("landed");
      }
      if(this.mode==="feed")this.emit("proboscis extended toward "+(this.currentFood?.name??"food"));
      if(this.mode==="rest")this.emit("stopped to rest");
    }
  }

  private step(dt:number) {
    this.elapsed+=dt; this.stateAge+=dt; this.updateCreatures(dt);
    this.hunger=clamp01(this.hunger+dt*(this.mode==="fly"?0.0045:0.0022));
    this.energy=Math.max(0,this.energy-dt*(this.mode==="fly"?0.48:this.mode==="walk"?0.12:0.035));

    const sensory=this.getSensorySnapshot();
    this.chooseMode(sensory);

    if(this.elapsed>this.nextWanderBias){
      this.nextWanderBias=this.elapsed+2.5+Math.random()*5;
      this.wanderBias=(Math.random()-0.5)*0.65;
    }

    let desiredTurn=this.brain.turn*0.9;
    const food=this.nearestFood();
    const danger=this.nearestDanger();
    // Sensory adapters only bias the body toward/away from stimuli; the
    // full connectome output remains the dominant continuous steering term.
    if(food.food && this.hunger>0.35 && food.distance<28 && danger.strength<0.18){
      desiredTurn+=THREE.MathUtils.clamp(food.angle*0.38,-0.65,0.65)*this.hunger;
    } else {
      desiredTurn+=this.wanderBias*(0.25+0.5*(1-this.brain.drive));
    }
    if(danger.strength>0.05){
      const away=danger.angle>=0?-1:1;
      desiredTurn+=away*danger.strength*1.4;
    }
    desiredTurn=THREE.MathUtils.clamp(desiredTurn,-1,1);

    if(this.mode==="feed"){
      this.speed=THREE.MathUtils.damp(this.speed,0,7,dt);
      this.proboscis.scale.y=THREE.MathUtils.damp(this.proboscis.scale.y,1.35,8,dt);
      if(this.currentFood && this.currentFood.energy>0){
        const bite=Math.min(this.currentFood.energy,dt*5.2);
        this.currentFood.energy-=bite; this.foodEaten+=bite;
        this.energy=Math.min(100,this.energy+bite*0.55); this.hunger=Math.max(0,this.hunger-bite*0.018);
        const scale=0.35+0.65*(this.currentFood.energy/this.currentFood.maxEnergy);
        this.currentFood.node.scale.setScalar(scale);
        if(this.currentFood.energy<=0)this.emit("finished "+this.currentFood.name);
      }
    } else {
      this.proboscis.scale.y=THREE.MathUtils.damp(this.proboscis.scale.y,0.18,10,dt);
      if(this.mode==="walk"){
        this.fly.position.y=THREE.MathUtils.damp(this.fly.position.y,GROUND_Y,8,dt);
        const targetSpeed=0.45+this.brain.drive*1.15+this.hunger*0.4;
        this.speed=THREE.MathUtils.damp(this.speed,targetSpeed,3.5,dt);
        this.heading=wrapAngle(this.heading+desiredTurn*dt*1.45);
        this.verticalSpeed=0;
      } else if(this.mode==="fly"){
        const targetSpeed=2.2+this.brain.drive*3.2+danger.strength*2.2;
        this.speed=THREE.MathUtils.damp(this.speed,targetSpeed,2.8,dt);
        this.heading=wrapAngle(this.heading+desiredTurn*dt*(1.3+this.speed*0.08));
        let targetAlt=3.6+this.brain.lift*9.5+danger.strength*5.5;
        // Do not immediately dive for food during the first part of a flight.
        if(this.stateAge>10 && food.food && this.hunger>0.45 && food.distance<9)targetAlt=0.45;
        targetAlt=Math.min(14,targetAlt);
        const alt=this.fly.position.y-GROUND_Y;
        this.verticalSpeed=THREE.MathUtils.damp(this.verticalSpeed,(targetAlt-alt)*0.95,3.0,dt);
        this.fly.position.y=Math.max(GROUND_Y,this.fly.position.y+this.verticalSpeed*dt);
        if(this.stateAge>10 && targetAlt<0.6 && this.fly.position.y<GROUND_Y+0.3){
          this.mode="walk";
          this.landings++;
          this.nextTakeoffEarliest=this.elapsed+7;
          this.stateAge=0;
          this.emit("landed near "+(food.food?.name??"ground"));
        }
      } else {
        this.speed=THREE.MathUtils.damp(this.speed,0,4,dt);
        this.energy=Math.min(100,this.energy+dt*0.55);
      }
    }

    if(this.mode!=="feed" && this.mode!=="rest"){
      const dx=Math.sin(this.heading)*this.speed*dt;
      const dz=-Math.cos(this.heading)*this.speed*dt;
      this.fly.position.x+=dx; this.fly.position.z+=dz;
      this.distanceTravelled+=Math.hypot(dx,dz);
    }

    if(Math.abs(this.fly.position.x)>WORLD_HALF){
      this.fly.position.x=THREE.MathUtils.clamp(this.fly.position.x,-WORLD_HALF,WORLD_HALF);
      this.heading=wrapAngle(-this.heading);
    }
    if(Math.abs(this.fly.position.z)>WORLD_HALF){
      this.fly.position.z=THREE.MathUtils.clamp(this.fly.position.z,-WORLD_HALF,WORLD_HALF);
      this.heading=wrapAngle(Math.PI-this.heading);
    }

    this.fly.rotation.y=this.heading;
    this.animateBody(dt);
    this.lastPosition.copy(this.fly.position);
  }

  private animateBody(dt:number) {
    const wingPower=this.mode==="fly"?1:0;
    for(let i=0;i<this.wings.length;i++){
      const side=i===0?-1:1;
      const flap=this.mode==="fly"?Math.sin(this.elapsed*47)*0.52:Math.sin(this.elapsed*2.2)*0.025;
      this.wings[i].rotation.z=side*(0.52+flap);
      this.wings[i].rotation.x=-0.4+wingPower*Math.sin(this.elapsed*47+0.7)*0.08;
    }
    const walkPhase=this.elapsed*(6+this.speed*5);
    for(let i=0;i<this.legRoots.length;i++){
      const pair=Math.floor(i/2);
      const side=i%2===0?-1:1;
      const gait=this.mode==="walk"?Math.sin(walkPhase+pair*2.1+(side>0?Math.PI:0))*0.34:0;
      this.legRoots[i].rotation.z=THREE.MathUtils.damp(this.legRoots[i].rotation.z,gait,9,dt);
      this.legRoots[i].rotation.x=THREE.MathUtils.damp(this.legRoots[i].rotation.x,this.mode==="fly"?0.45:0,8,dt);
    }
    this.head.rotation.y=THREE.MathUtils.damp(this.head.rotation.y,this.brain.turn*0.22,6,dt);
  }

  private updateCamera(_dt:number) {
    // True world-space fixed third-person view.
    // The camera and target translate by exactly the same vector as the fly,
    // so camera yaw/pitch never orbit when the fly turns.
    const altitude=this.fly.position.y-GROUND_Y;
    const fixedOffset=new THREE.Vector3(0,4.2+Math.min(1.5,altitude*0.12),9.2);

    this.camera.position.copy(this.fly.position).add(fixedOffset);
    this.cameraLook.copy(this.fly.position).add(new THREE.Vector3(0,0.45,0));
    this.camera.lookAt(this.cameraLook);
  }

  private loop=()=>{
    this.raf=requestAnimationFrame(this.loop);
    const dt=Math.min(this.clock.getDelta(),0.05);
    if(this.running)this.step(dt);
    this.updateCamera(dt);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene,this.camera);
  };

  private resize=()=>{
    const w=Math.max(1,this.container.clientWidth),h=Math.max(1,this.container.clientHeight);
    this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w,h,false);
  };
}
