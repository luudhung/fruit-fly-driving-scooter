import * as THREE from "three";

export interface MotorbikeTelemetry {
  speedKmh: number;
  positionX: number;
  positionZ: number;
  headingRad: number;
  steering: number;
  brainSteer: number;
  brainActivity: number;
  throttle: number;
  brake: number;
  collisionCount: number;
  street: string;
  controlMode: string;
}

interface Obstacle {
  node: THREE.Object3D;
  radius: number;
  label: string;
}

const MAX_SPEED_MPS = 4.8;
const MAX_STEER_RAD = THREE.MathUtils.degToRad(30);
const WHEELBASE = 1.42;
const BIKE_RADIUS = 0.55;
const RETINA_W = 64;
const RETINA_H = 16;

function wrapAngle(v: number) {
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
}

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class MotorbikeWorld {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(54, 1, 0.05, 500);

  private readonly bike = new THREE.Group();
  private readonly retinaCamera = new THREE.PerspectiveCamera(112, RETINA_W / RETINA_H, 0.06, 55);
  private readonly retinaTarget = new THREE.WebGLRenderTarget(RETINA_W, RETINA_H, {
    depthBuffer: true,
    stencilBuffer: false,
  });
  private readonly retinaPixels = new Uint8Array(RETINA_W * RETINA_H * 4);
  private readonly obstacles: Obstacle[] = [];
  private readonly clock = new THREE.Clock();
  private readonly keys = new Set<string>();
  private readonly flyWings: THREE.Mesh[] = [];

  private readonly route = new THREE.CatmullRomCurve3([
    new THREE.Vector3(15, 0, 48),
    new THREE.Vector3(15, 0, 15),
    new THREE.Vector3(45, 0, 15),
    new THREE.Vector3(45, 0, -15),
    new THREE.Vector3(15, 0, -15),
    new THREE.Vector3(15, 0, -45),
    new THREE.Vector3(-15, 0, -45),
    new THREE.Vector3(-15, 0, -15),
    new THREE.Vector3(-45, 0, -15),
    new THREE.Vector3(-45, 0, 15),
    new THREE.Vector3(-15, 0, 15),
    new THREE.Vector3(-15, 0, 45),
  ], true, "catmullrom", 0.08);

  private readonly routeLength: number;
  private raf = 0;
  private running = true;
  private heading = 0;
  private speed = 0;
  private steering = 0;
  private throttle = 1;
  private brake = 0;
  private collisionCount = 0;
  private routeT = 0;
  private brainSteer = 0;
  private brainActivity = 0;
  private brainReady = false;
  private recovery = 0;
  private elapsed = 0;

  constructor(private readonly container: HTMLElement) {
    this.routeLength = this.route.getLength();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0xbcc8d2);
    this.scene.fog = new THREE.Fog(0xbcc8d2, 55, 150);

    this.buildLights();
    this.buildOldQuarter();
    this.buildDream();
    this.buildFlyRider();
    this.buildObstacles();

    this.retinaCamera.position.set(0, 1.55, -0.72);
    this.retinaCamera.rotation.set(0.02, 0, 0);
    this.bike.add(this.retinaCamera);

    this.reset();
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.resize();
    this.clock.start();
    this.loop();
  }

  start() { this.running = true; }
  pause() { this.running = false; }

  reset() {
    this.running = true;
    this.routeT = 0;
    this.speed = 0.5;
    this.steering = 0;
    this.throttle = 1;
    this.brake = 0;
    this.collisionCount = 0;
    this.recovery = 0;
    const p = this.route.getPointAt(this.routeT);
    const tangent = this.route.getTangentAt(this.routeT).normalize();
    this.heading = Math.atan2(tangent.x, -tangent.z);
    this.bike.position.copy(p);
    this.bike.position.y = 0;
    this.bike.rotation.set(0, this.heading, 0);
    this.updateCamera(true);
  }

  setBrainSignal(steering: number, activity: number, ready = true) {
    this.brainSteer = THREE.MathUtils.clamp(steering, -1, 1);
    this.brainActivity = Math.max(0, activity);
    this.brainReady = ready;
  }

  getTelemetry(): MotorbikeTelemetry {
    return {
      speedKmh: this.speed * 3.6,
      positionX: this.bike.position.x,
      positionZ: this.bike.position.z,
      headingRad: this.heading,
      steering: this.steering,
      brainSteer: this.brainSteer,
      brainActivity: this.brainActivity,
      throttle: this.throttle,
      brake: this.brake,
      collisionCount: this.collisionCount,
      street: this.streetName(),
      controlMode: this.brainReady
        ? "FULL FLYWIRE + PATH / SAFETY ASSIST"
        : "PATH / SAFETY ASSIST — BRAIN LOADING",
    };
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
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.retinaTarget.dispose();
    this.renderer.dispose();
    this.container.replaceChildren();
  }

  private buildLights() {
    const hemi = new THREE.HemisphereLight(0xe8f3ff, 0x5c4a35, 2.0);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff5dc, 3.2);
    sun.position.set(-28, 45, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    this.scene.add(sun);
  }

  private buildOldQuarter() {
    const sidewalk = new THREE.MeshStandardMaterial({ color: 0xb7a993, roughness: 0.96 });
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x34383b, roughness: 0.92 });
    const curb = new THREE.MeshStandardMaterial({ color: 0xd8d0c2, roughness: 0.9 });
    const line = new THREE.MeshBasicMaterial({ color: 0xd8cfa2 });

    const base = mesh(new THREE.PlaneGeometry(140, 140), sidewalk, 0, -0.03, 0);
    base.rotation.x = -Math.PI / 2;
    this.scene.add(base);

    const roadAxis = [-45, -15, 15, 45];
    for (const x of roadAxis) {
      const road = mesh(new THREE.PlaneGeometry(9, 130), asphalt, x, 0.005, 0);
      road.rotation.x = -Math.PI / 2;
      this.scene.add(road);
      for (let z = -60; z <= 60; z += 7) {
        const dash = mesh(new THREE.PlaneGeometry(0.07, 2.2), line, x, 0.012, z);
        dash.rotation.x = -Math.PI / 2;
        this.scene.add(dash);
      }
      for (const side of [-1, 1]) {
        const c = mesh(new THREE.BoxGeometry(0.18, 0.13, 130), curb, x + side * 4.65, 0.065, 0);
        this.scene.add(c);
      }
    }
    for (const z of roadAxis) {
      const road = mesh(new THREE.PlaneGeometry(130, 9), asphalt, 0, 0.007, z);
      road.rotation.x = -Math.PI / 2;
      this.scene.add(road);
      for (let x = -60; x <= 60; x += 7) {
        const dash = mesh(new THREE.PlaneGeometry(2.2, 0.07), line, x, 0.014, z);
        dash.rotation.x = -Math.PI / 2;
        this.scene.add(dash);
      }
      for (const side of [-1, 1]) {
        const c = mesh(new THREE.BoxGeometry(130, 0.13, 0.18), curb, 0, 0.065, z + side * 4.65);
        this.scene.add(c);
      }
    }

    const centers = [-30, 0, 30];
    for (let ix = 0; ix < centers.length; ix++) {
      for (let iz = 0; iz < centers.length; iz++) {
        this.addShopBlock(centers[ix], centers[iz], ix * 17 + iz * 31);
      }
    }

    const outer = [-60, 60];
    for (const x of outer) {
      for (const z of centers) this.addShopBlock(x, z, Math.abs(x) + z + 91, 16, 20);
    }
    for (const z of outer) {
      for (const x of centers) this.addShopBlock(x, z, Math.abs(z) + x + 123, 20, 16);
    }

    this.addStreetSign(18.8, 18.8, "HÀNG ĐÀO");
    this.addStreetSign(-18.8, 18.8, "HÀNG NGANG");
    this.addStreetSign(-41.2, 18.8, "HÀNG BẠC");
    this.addStreetSign(-18.8, -18.8, "TẠ HIỆN");
    this.addStreetSign(18.8, -41.2, "ĐINH LIỆT");
    this.addStreetSign(41.2, -18.8, "LƯƠNG NGỌC QUYẾN");

    for (const p of [
      [-51, -50], [-23, -51], [8, -51], [53, -25], [52, 7],
      [25, 52], [-7, 52], [-52, 27], [-52, -3], [4, 22],
    ] as Array<[number, number]>) this.addTree(p[0], p[1]);
  }

  private addShopBlock(cx: number, cz: number, seed: number, sx = 20, sz = 20) {
    const wallPalette = [0xd6b48b, 0xc89d7c, 0xe1c6a7, 0xaab5aa, 0xc7b49a, 0x9fadaf];
    const signPalette = [0xa7322b, 0x1e5e52, 0x243f72, 0xb36522, 0x63304b];
    const rand = (n: number) => {
      const v = Math.sin(seed * 13.17 + n * 91.7) * 43758.5453;
      return v - Math.floor(v);
    };

    const count = 4;
    for (let i = 0; i < count; i++) {
      const h = 7 + rand(i) * 8;
      const w = sx / count - 0.3;
      const x = cx - sx / 2 + w / 2 + i * (sx / count);
      const wall = new THREE.MeshStandardMaterial({
        color: wallPalette[Math.floor(rand(i + 20) * wallPalette.length)],
        roughness: 0.82,
      });
      const b = mesh(new THREE.BoxGeometry(w, h, sz), wall, x, h / 2, cz);
      this.scene.add(b);

      const facadeZ = cz + (cz <= 0 ? sz / 2 + 0.025 : -sz / 2 - 0.025);
      const windowMat = new THREE.MeshStandardMaterial({
        color: 0x7aa0aa,
        emissive: 0x223a42,
        emissiveIntensity: 0.55,
        roughness: 0.32,
      });
      for (let floor = 1; floor < Math.floor(h / 2.8); floor++) {
        const win = mesh(new THREE.PlaneGeometry(w * 0.58, 1.05), windowMat, x, 1.5 + floor * 2.25, facadeZ);
        if (cz > 0) win.rotation.y = Math.PI;
        this.scene.add(win);
      }

      const signMat = new THREE.MeshStandardMaterial({
        color: signPalette[Math.floor(rand(i + 40) * signPalette.length)],
        roughness: 0.7,
      });
      const sign = mesh(new THREE.BoxGeometry(w * 0.82, 0.75, 0.12), signMat, x, 1.7, facadeZ + (cz <= 0 ? 0.08 : -0.08));
      this.scene.add(sign);
      const awning = mesh(new THREE.BoxGeometry(w * 0.86, 0.1, 1.0), signMat, x, 1.2, facadeZ + (cz <= 0 ? 0.5 : -0.5));
      this.scene.add(awning);
    }
  }

  private addStreetSign(x: number, z: number, label: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0d4f86";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#f2f5f7";
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 54px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const sign = mesh(new THREE.PlaneGeometry(3.1, 0.78), mat, x, 3.1, z);
    sign.rotation.y = Math.PI / 4;
    this.scene.add(sign);
    const pole = mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.0, 8), new THREE.MeshStandardMaterial({ color: 0x60656b }), x, 1.5, z);
    this.scene.add(pole);
  }

  private addTree(x: number, z: number) {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4b32, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f6f42, roughness: 0.9 });
    const trunk = mesh(new THREE.CylinderGeometry(0.15, 0.2, 2.4, 8), trunkMat, x, 1.2, z);
    this.scene.add(trunk);
    const crown = mesh(new THREE.SphereGeometry(1.2, 12, 8), leafMat, x, 3.0, z);
    crown.scale.set(1.0, 1.25, 1.0);
    this.scene.add(crown);
  }

  private buildDream() {
    const red = new THREE.MeshStandardMaterial({ color: 0x8f171c, metalness: 0.22, roughness: 0.35 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xe7e0cf, metalness: 0.05, roughness: 0.4 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xb8bdc3, metalness: 0.88, roughness: 0.18 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x17191c, metalness: 0.45, roughness: 0.35 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.96 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x161313, roughness: 0.8 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xe8f7ff, emissive: 0x9fcdea, emissiveIntensity: 0.75, roughness: 0.16 });

    const wheelGeo = new THREE.TorusGeometry(0.36, 0.065, 12, 32);
    for (const z of [-0.78, 0.82]) {
      const wheel = mesh(wheelGeo, rubber, 0, 0.38, z);
      wheel.rotation.y = Math.PI / 2;
      this.bike.add(wheel);
      const hub = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.18, 16), chrome, 0, 0.38, z);
      hub.rotation.z = Math.PI / 2;
      this.bike.add(hub);
      for (let s = 0; s < 8; s++) {
        const a = (s / 8) * Math.PI * 2;
        const spoke = mesh(new THREE.BoxGeometry(0.018, 0.018, 0.52), chrome, 0, 0.38, z);
        spoke.rotation.x = a;
        spoke.rotation.y = Math.PI / 2;
        this.bike.add(spoke);
      }
    }

    const frame = mesh(new THREE.BoxGeometry(0.24, 0.24, 1.12), dark, 0, 0.72, 0.05);
    frame.rotation.x = -0.16;
    this.bike.add(frame);

    const engine = mesh(new THREE.BoxGeometry(0.46, 0.42, 0.5), chrome, 0, 0.58, 0.05);
    this.bike.add(engine);
    const sideL = mesh(new THREE.BoxGeometry(0.12, 0.38, 0.58), red, -0.29, 0.82, 0.12);
    const sideR = sideL.clone();
    sideR.position.x = 0.29;
    this.bike.add(sideL, sideR);

    const seat = mesh(new THREE.BoxGeometry(0.52, 0.16, 0.92), seatMat, 0, 1.08, 0.32);
    seat.rotation.x = -0.03;
    this.bike.add(seat);

    const legShield = mesh(new THREE.BoxGeometry(0.56, 0.72, 0.16), cream, 0, 0.92, -0.48);
    legShield.rotation.x = -0.08;
    this.bike.add(legShield);
    const frontCowl = mesh(new THREE.BoxGeometry(0.52, 0.44, 0.32), red, 0, 1.25, -0.72);
    this.bike.add(frontCowl);
    const headlamp = mesh(new THREE.BoxGeometry(0.38, 0.22, 0.07), glass, 0, 1.33, -0.90);
    this.bike.add(headlamp);

    const forkL = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.78, 10), chrome, -0.13, 0.75, -0.73);
    const forkR = forkL.clone();
    forkR.position.x = 0.13;
    forkL.rotation.x = forkR.rotation.x = -0.13;
    this.bike.add(forkL, forkR);

    const handle = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 10), chrome, 0, 1.48, -0.68);
    handle.rotation.z = Math.PI / 2;
    this.bike.add(handle);
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x090909, roughness: 0.9 });
    for (const x of [-0.49, 0.49]) {
      const grip = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.18, 10), gripMat, x, 1.48, -0.68);
      grip.rotation.z = Math.PI / 2;
      this.bike.add(grip);
      const mirrorStem = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 8), chrome, x * 0.88, 1.72, -0.66);
      mirrorStem.rotation.z = x < 0 ? -0.36 : 0.36;
      this.bike.add(mirrorStem);
      const mirror = mesh(new THREE.SphereGeometry(0.11, 16, 10), chrome, x * 0.98, 1.91, -0.66);
      mirror.scale.set(1.2, 0.8, 0.22);
      this.bike.add(mirror);
    }

    const exhaust = mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.02, 14), chrome, -0.34, 0.49, 0.48);
    exhaust.rotation.x = Math.PI / 2;
    this.bike.add(exhaust);
    const rack = mesh(new THREE.BoxGeometry(0.58, 0.045, 0.48), chrome, 0, 1.14, 0.96);
    this.bike.add(rack);

    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 512;
    labelCanvas.height = 128;
    const ctx = labelCanvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, 512, 128);
      ctx.fillStyle = "#efe8d9";
      ctx.font = "italic 900 70px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("DREAM", 256, 86);
      const tex = new THREE.CanvasTexture(labelCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const decal = mesh(new THREE.PlaneGeometry(0.48, 0.12), new THREE.MeshBasicMaterial({ map: tex, transparent: true }), -0.355, 0.9, 0.1);
      decal.rotation.y = -Math.PI / 2;
      this.bike.add(decal);
    }

    this.scene.add(this.bike);
  }

  private buildFlyRider() {
    const rider = new THREE.Group();
    rider.position.set(0, 1.28, 0.2);
    rider.scale.setScalar(0.72);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a2b20, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x18130f, roughness: 0.75 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xa31f24, emissive: 0x4f0709, emissiveIntensity: 0.7, roughness: 0.5 });
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0xc8e7e9,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      roughness: 0.28,
    });

    const thorax = mesh(new THREE.SphereGeometry(0.23, 18, 12), bodyMat, 0, 0.28, 0);
    thorax.scale.set(0.85, 1.0, 1.2);
    rider.add(thorax);
    const abdomen = mesh(new THREE.SphereGeometry(0.21, 18, 12), dark, 0, 0.32, 0.36);
    abdomen.scale.set(0.72, 0.75, 1.35);
    rider.add(abdomen);
    const head = mesh(new THREE.SphereGeometry(0.2, 18, 12), bodyMat, 0, 0.45, -0.28);
    rider.add(head);
    for (const x of [-0.16, 0.16]) {
      const eye = mesh(new THREE.SphereGeometry(0.13, 18, 12), eyeMat, x, 0.48, -0.34);
      eye.scale.set(0.75, 1.0, 0.65);
      rider.add(eye);
    }

    for (const side of [-1, 1]) {
      const wing = mesh(new THREE.PlaneGeometry(0.22, 0.72), wingMat, side * 0.19, 0.48, 0.25);
      wing.rotation.x = -0.35;
      wing.rotation.z = side * 0.5;
      rider.add(wing);
      this.flyWings.push(wing);
    }

    const legMat = new THREE.MeshStandardMaterial({ color: 0x241711, roughness: 0.8 });
    const addLeg = (a: THREE.Vector3, b: THREE.Vector3) => {
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const len = a.distanceTo(b);
      const limb = mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 7), legMat, mid.x, mid.y, mid.z);
      limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      rider.add(limb);
    };
    for (const side of [-1, 1]) {
      addLeg(new THREE.Vector3(side * 0.13, 0.34, -0.1), new THREE.Vector3(side * 0.49, 0.28, -1.18));
      addLeg(new THREE.Vector3(side * 0.14, 0.25, 0.08), new THREE.Vector3(side * 0.32, -0.18, 0.22));
      addLeg(new THREE.Vector3(side * 0.11, 0.25, 0.26), new THREE.Vector3(side * 0.27, -0.12, 0.58));
    }

    rider.rotation.x = -0.08;
    this.bike.add(rider);
  }

  private buildObstacles() {
    this.addParkedScooter(14.0, 28.5, 0.15);
    this.addCrates(43.2, 3.0);
    this.addConeLine(28.0, -15.8);
    this.addParkedScooter(15.9, -32.0, Math.PI);
    this.addCrates(-16.2, -31.5);
    this.addConeLine(-33.5, -14.2);
    this.addParkedScooter(-44.0, 2.0, Math.PI / 2);
    this.addCrates(-15.7, 32.0);
  }

  private addParkedScooter(x: number, z: number, rot: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const mat = new THREE.MeshStandardMaterial({ color: 0x263c5b, roughness: 0.45, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.85 });
    const body = mesh(new THREE.BoxGeometry(0.42, 0.42, 1.0), mat, 0, 0.64, 0);
    g.add(body);
    for (const zz of [-0.56, 0.56]) {
      const w = mesh(new THREE.TorusGeometry(0.24, 0.05, 8, 18), dark, 0, 0.27, zz);
      w.rotation.y = Math.PI / 2;
      g.add(w);
    }
    this.scene.add(g);
    this.obstacles.push({ node: g, radius: 0.72, label: "parked scooter" });
  }

  private addCrates(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const mat = new THREE.MeshStandardMaterial({ color: 0xb87835, roughness: 0.95 });
    for (let i = 0; i < 3; i++) {
      const c = mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), mat, (i - 1) * 0.48, 0.28 + (i === 1 ? 0.42 : 0), 0);
      g.add(c);
    }
    this.scene.add(g);
    this.obstacles.push({ node: g, radius: 0.95, label: "delivery crates" });
  }

  private addConeLine(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const orange = new THREE.MeshStandardMaterial({ color: 0xe86b1f, roughness: 0.78 });
    for (let i = -2; i <= 2; i++) {
      const cone = mesh(new THREE.ConeGeometry(0.17, 0.55, 12), orange, i * 0.48, 0.28, 0);
      g.add(cone);
    }
    this.scene.add(g);
    this.obstacles.push({ node: g, radius: 1.25, label: "road works" });
  }

  private obstacleAvoidance(): { steer: number; danger: number } {
    const forwardX = Math.sin(this.heading);
    const forwardZ = -Math.cos(this.heading);
    const rightX = Math.cos(this.heading);
    const rightZ = Math.sin(this.heading);
    let steer = 0;
    let danger = 0;
    for (const obstacle of this.obstacles) {
      const dx = obstacle.node.position.x - this.bike.position.x;
      const dz = obstacle.node.position.z - this.bike.position.z;
      const ahead = dx * forwardX + dz * forwardZ;
      const lateral = dx * rightX + dz * rightZ;
      if (ahead <= 0 || ahead > 10) continue;
      const width = obstacle.radius + 0.95;
      if (Math.abs(lateral) > width) continue;
      const closeness = 1 - ahead / 10;
      const centerThreat = 1 - Math.min(1, Math.abs(lateral) / width);
      const w = closeness * centerThreat;
      const away = lateral >= 0 ? -1 : 1;
      steer += away * w * 1.8;
      danger = Math.max(danger, w);
    }
    return { steer: THREE.MathUtils.clamp(steer, -1, 1), danger };
  }

  private step(dt: number) {
    this.elapsed += dt;
    const manual =
      (this.keys.has("ArrowLeft") || this.keys.has("KeyA") ? -1 : 0) +
      (this.keys.has("ArrowRight") || this.keys.has("KeyD") ? 1 : 0);

    const lookAheadT = (this.routeT + 0.016 + this.speed * 0.0015) % 1;
    const target = this.route.getPointAt(lookAheadT);
    const dx = target.x - this.bike.position.x;
    const dz = target.z - this.bike.position.z;
    const desiredHeading = Math.atan2(dx, -dz);
    const headingError = wrapAngle(desiredHeading - this.heading);
    const routeSteer = THREE.MathUtils.clamp(headingError * 1.9, -1, 1);
    const avoidance = this.obstacleAvoidance();

    let command = routeSteer * 0.78 + avoidance.steer * 0.95 + this.brainSteer * 0.22;
    if (this.recovery > 0) {
      this.recovery -= dt;
      command += Math.sin(this.elapsed * 7) * 0.7;
    }
    if (manual !== 0) command = manual;
    this.steering = THREE.MathUtils.clamp(command, -1, 1);

    const curveTangent = this.route.getTangentAt(this.routeT).normalize();
    const curveHeading = Math.atan2(curveTangent.x, -curveTangent.z);
    const curveTurn = Math.min(1, Math.abs(wrapAngle(curveHeading - desiredHeading)) * 2.5);
    const targetSpeed = MAX_SPEED_MPS * (1 - 0.45 * avoidance.danger) * (1 - 0.25 * curveTurn);
    this.throttle = targetSpeed > this.speed ? 1 : 0.25;
    this.brake = targetSpeed + 0.7 < this.speed ? 0.5 : 0;
    const accel = targetSpeed > this.speed ? 2.0 : 3.5;
    this.speed += THREE.MathUtils.clamp(targetSpeed - this.speed, -accel * dt, accel * dt);

    const steerAngle = this.steering * MAX_STEER_RAD;
    this.heading += Math.tan(steerAngle) * this.speed / WHEELBASE * dt;

    const old = this.bike.position.clone();
    this.bike.position.x += Math.sin(this.heading) * this.speed * dt;
    this.bike.position.z -= Math.cos(this.heading) * this.speed * dt;
    this.routeT = (this.routeT + (this.speed * dt / this.routeLength)) % 1;

    const hit = this.collides();
    if (hit) {
      this.bike.position.copy(old);
      this.speed *= 0.18;
      this.collisionCount += 1;
      this.recovery = 1.0;
    }

    this.bike.rotation.y = this.heading;
    this.bike.rotation.z = -this.steering * 0.11;
    for (let i = 0; i < this.flyWings.length; i++) {
      this.flyWings[i].rotation.z = (i === 0 ? -1 : 1) * (0.5 + Math.sin(this.elapsed * 16) * 0.08);
    }
  }

  private collides() {
    for (const obstacle of this.obstacles) {
      const dx = this.bike.position.x - obstacle.node.position.x;
      const dz = this.bike.position.z - obstacle.node.position.z;
      if (Math.hypot(dx, dz) < obstacle.radius + BIKE_RADIUS) return true;
    }
    return false;
  }

  private streetName() {
    const t = this.routeT;
    if (t < 0.09) return "Hàng Đào";
    if (t < 0.19) return "Lương Ngọc Quyến";
    if (t < 0.28) return "Đinh Liệt";
    if (t < 0.39) return "Hàng Bạc";
    if (t < 0.50) return "Tạ Hiện";
    if (t < 0.61) return "Mã Mây";
    if (t < 0.72) return "Hàng Buồm";
    if (t < 0.83) return "Hàng Ngang";
    if (t < 0.92) return "Hàng Đường";
    return "Hàng Đào";
  }

  private updateCamera(snap = false) {
    const localOffset = new THREE.Vector3(0.0, 2.8, 5.5);
    localOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
    const target = this.bike.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    const desired = target.clone().add(localOffset);
    if (snap) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, 0.08);
    const look = target.clone().add(new THREE.Vector3(
      Math.sin(this.heading) * 3.2,
      0.35,
      -Math.cos(this.heading) * 3.2,
    ));
    this.camera.lookAt(look);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.running) this.step(dt);
    this.updateCamera();
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  };

  private resize = () => {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  private onKeyDown = (event: KeyboardEvent) => this.keys.add(event.code);
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);
}
