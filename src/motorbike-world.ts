import * as THREE from "three";

export interface MotorbikeTelemetry {
  speedKmh: number;
  positionX: number;
  positionZ: number;
  headingRad: number;
  steering: number;
  throttle: number;
  brake: number;
  collisionCount: number;
}

interface Obstacle {
  mesh: THREE.Mesh;
  halfX: number;
  halfZ: number;
}

const ROAD_HALF_WIDTH = 4;
const WORLD_LENGTH = 220;
const MAX_SPEED_MPS = 5.5;
const CRUISE_SPEED_MPS = 4.5;
const MAX_STEER_RAD = THREE.MathUtils.degToRad(28);
const WHEELBASE = 1.35;
const BIKE_RADIUS = 0.55;

export class MotorbikeWorld {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.05, 500);

  private readonly bike = new THREE.Group();
  private readonly obstacles: Obstacle[] = [];
  private readonly clock = new THREE.Clock();
  private readonly keys = new Set<string>();

  private raf = 0;
  private running = false;
  private heading = 0;
  private speed = 0;
  private steering = 0;
  private throttle = 0;
  private brake = 0;
  private collisionCount = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x07090d);
    this.scene.fog = new THREE.Fog(0x07090d, 45, 190);

    this.buildLights();
    this.buildRoad();
    this.buildBike();
    this.buildObstacles();

    this.reset();

    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.resize();
    this.clock.start();
    this.loop();
  }

  start() {
    this.running = true;
  }

  pause() {
    this.running = false;
  }

  reset() {
    this.running = false;
    this.heading = 0;
    this.speed = 0;
    this.steering = 0;
    this.throttle = 0;
    this.brake = 0;
    this.collisionCount = 0;
    this.bike.position.set(0, 0, 78);
    this.bike.rotation.set(0, 0, 0);
    this.updateCamera();
  }

  setManualInput(steering: number, throttle: number, brake: number) {
    this.steering = THREE.MathUtils.clamp(steering, -1, 1);
    this.throttle = THREE.MathUtils.clamp(throttle, 0, 1);
    this.brake = THREE.MathUtils.clamp(brake, 0, 1);
  }

  getTelemetry(): MotorbikeTelemetry {
    return {
      speedKmh: this.speed * 3.6,
      positionX: this.bike.position.x,
      positionZ: this.bike.position.z,
      headingRad: this.heading,
      steering: this.steering,
      throttle: this.throttle,
      brake: this.brake,
      collisionCount: this.collisionCount,
    };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.renderer.dispose();
    this.container.replaceChildren();
  }

  private buildLights() {
    const hemi = new THREE.HemisphereLight(0xc8d9ff, 0x101317, 1.5);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(8, 16, 10);
    sun.castShadow = true;
    this.scene.add(sun);
  }

  private buildRoad() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, WORLD_LENGTH + 80),
      new THREE.MeshStandardMaterial({ color: 0x11151b, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -20;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, WORLD_LENGTH),
      new THREE.MeshStandardMaterial({ color: 0x252a31, roughness: 0.96 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.012, -20);
    road.receiveShadow = true;
    this.scene.add(road);

    const laneMat = new THREE.MeshBasicMaterial({ color: 0xcfd3d8 });
    for (let z = 85; z > -120; z -= 8) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 3.6), laneMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.018, z);
      this.scene.add(stripe);
    }

    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x535a64, roughness: 0.9 });
    for (const x of [-ROAD_HALF_WIDTH - 0.25, ROAD_HALF_WIDTH + 0.25]) {
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, WORLD_LENGTH), barrierMat);
      barrier.position.set(x, 0.4, -20);
      barrier.castShadow = true;
      barrier.receiveShadow = true;
      this.scene.add(barrier);
    }
  }

  private buildBike() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0.55, roughness: 0.3 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x303843, metalness: 0.35, roughness: 0.4 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.95 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.42, 1.25), bodyMat);
    body.position.y = 0.78;
    body.castShadow = true;
    this.bike.add(body);

    const tank = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), dark);
    tank.scale.set(1.0, 0.72, 1.2);
    tank.position.set(0, 1.02, -0.16);
    tank.castShadow = true;
    this.bike.add(tank);

    const wheelGeo = new THREE.TorusGeometry(0.35, 0.085, 12, 28);
    for (const z of [-0.74, 0.74]) {
      const wheel = new THREE.Mesh(wheelGeo, tireMat);
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(0, 0.38, z);
      wheel.castShadow = true;
      this.bike.add(wheel);
    }

    const fork = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), dark);
    fork.position.set(0, 0.72, -0.72);
    fork.rotation.x = -0.22;
    this.bike.add(fork);

    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.055, 0.055), dark);
    bar.position.set(0, 1.19, -0.62);
    this.bike.add(bar);

    const cameraMarker = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.08, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x8bc6ff, emissive: 0x254f75, emissiveIntensity: 1.6 }),
    );
    cameraMarker.position.set(0, 1.34, -0.72);
    this.bike.add(cameraMarker);

    this.scene.add(this.bike);
  }

  private buildObstacles() {
    const addBox = (x: number, z: number, sx: number, sy: number, sz: number, color: number) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(sx, sy, sz),
        new THREE.MeshStandardMaterial({ color, roughness: 0.75 }),
      );
      mesh.position.set(x, sy / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.obstacles.push({ mesh, halfX: sx / 2, halfZ: sz / 2 });
    };

    addBox(-1.7, 42, 1.4, 1.5, 2.6, 0x71343e);
    addBox(1.6, 18, 1.6, 1.35, 3.1, 0x374f70);
    addBox(-1.2, -10, 1.9, 1.7, 3.4, 0x59633c);
    addBox(1.9, -39, 1.3, 1.3, 2.8, 0x6a573a);
    addBox(0.0, -72, 1.4, 1.6, 1.4, 0x6d436e);
  }

  private step(dt: number) {
    const manualSteer = (this.keys.has("ArrowLeft") || this.keys.has("KeyA") ? -1 : 0)
      + (this.keys.has("ArrowRight") || this.keys.has("KeyD") ? 1 : 0);
    const manualBrake = this.keys.has("Space") || this.keys.has("ArrowDown") ? 1 : 0;
    const manualThrottle = this.keys.has("ArrowUp") || this.keys.has("KeyW") ? 1 : 0;

    this.setManualInput(manualSteer, manualThrottle, manualBrake);

    const target = this.brake > 0 ? 0 : (this.throttle > 0 ? MAX_SPEED_MPS : CRUISE_SPEED_MPS);
    const accel = target > this.speed ? 2.6 : 4.5;
    this.speed += THREE.MathUtils.clamp(target - this.speed, -accel * dt, accel * dt);

    const steerAngle = this.steering * MAX_STEER_RAD;
    const yawRate = Math.tan(steerAngle) * this.speed / WHEELBASE;
    this.heading += yawRate * dt;

    const oldX = this.bike.position.x;
    const oldZ = this.bike.position.z;
    this.bike.position.x += Math.sin(this.heading) * this.speed * dt;
    this.bike.position.z -= Math.cos(this.heading) * this.speed * dt;

    if (this.collides()) {
      this.bike.position.x = oldX;
      this.bike.position.z = oldZ;
      this.speed = 0;
      this.collisionCount += 1;
    }

    this.bike.rotation.y = this.heading;
    this.bike.rotation.z = -this.steering * 0.16;
  }

  private collides() {
    if (Math.abs(this.bike.position.x) + BIKE_RADIUS > ROAD_HALF_WIDTH) return true;
    for (const obstacle of this.obstacles) {
      const dx = Math.abs(this.bike.position.x - obstacle.mesh.position.x);
      const dz = Math.abs(this.bike.position.z - obstacle.mesh.position.z);
      if (dx < obstacle.halfX + BIKE_RADIUS && dz < obstacle.halfZ + BIKE_RADIUS) return true;
    }
    return false;
  }

  private updateCamera() {
    const localOffset = new THREE.Vector3(0, 2.6, 5.7);
    localOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
    const target = this.bike.position.clone().add(new THREE.Vector3(0, 0.85, 0));
    this.camera.position.copy(target).add(localOffset);
    this.camera.lookAt(target.clone().add(new THREE.Vector3(
      Math.sin(this.heading) * 4.5,
      0.25,
      -Math.cos(this.heading) * 4.5,
    )));
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.running) this.step(dt);
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
  };

  private resize = () => {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  private onKeyDown = (event: KeyboardEvent) => {
    this.keys.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };
}
