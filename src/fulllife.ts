import * as THREE from "three";

type FlyState = {
  id: string;
  name: string;
  sex: "F" | "M";
  ageYears: number;
  generation: number;
  alive: boolean;
  causeOfDeath?: string | null;
  x: number; y: number; z: number;
  vx: number; vz: number;
  action: string;
  currentLocationId: string;
  targetLocationId: string;
  hunger: number;
  energy: number;
  stress: number;
  happiness: number;
  excitement: number;
  loneliness: number;
  health: number;
  money: number;
  savings: number;
  debt: number;
  jobTitle?: string | null;
  partnerId?: string | null;
  affection: number;
  flirtingWith?: string | null;
  pregnant?: boolean;
  children: string[];
  parents: string[];
  vehicle?: string | null;
  ownsHome: boolean;
  homeTier?: number;
  homeX?: number;
  homeZ?: number;
  brainDecision?: string;
  brainConfidence?: number;
  smoking?: boolean;
  exercising?: boolean;
  mentalHealthCrisis: boolean;
  traits: Record<string, number>;
};

type LocationState = {
  id: string;
  type: string;
  name: string;
  x: number;
  z: number;
};

type CivilizationSnapshot = {
  authoritative: boolean;
  simulationStatus?: string;
  modelDisclosure?: string;
  worldId: string;
  experimentId: string;
  worldSeed: number | string;
  serverTime: string;
  simulationTime: number;
  simulationAgeSeconds: number;
  timeScale: number;
  day: number;
  gameClock: string;
  gameHour: number;
  gameMinute: number;
  population: number;
  generation: number;
  births: number;
  deaths: number;
  foodReserve: number;
  moneySupply: number;
  totalTransactions?: number;
  daysPerYear?: number;
  locations?: LocationState[];
  flies?: FlyState[];
  selectedFly?: {
    id: string;
    neuralActivity?: number[];
    sensorySummary?: string;
    motorSummary?: string;
  } | null;
  events: Array<{ id?: string; time?: string; day?: number; text: string; source?: "simulation" | "human"; type?: string }>;
  versions?: Record<string, string>;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const connection = $("connection");
const connectionLabel = $("connection-label");
const worldAge = $("world-age");
const population = $("population");
const generation = $("generation");
const speed = $("speed");
const births = $("births");
const deaths = $("deaths");
const food = $("food");
const money = $("money");
const events = $("events");
const brainGrid = $("brain-grid");
const brainNote = $("brain-note");
const gameClockEl = $("game-clock");
const gameDayEl = $("game-day");

const flyIdEl = $("fly-id");
const flyAgeEl = $("fly-age");
const flyActionEl = $("fly-action");
const flyBrainEl = $("fly-brain");
const flyJobEl = $("fly-job");
const flyHomeEl = $("fly-home");
const flyPartnerEl = $("fly-partner");
const flyChildrenEl = $("fly-children");
const flyMoneyEl = $("fly-money");
const flyDebtEl = $("fly-debt");
const flyStressEl = $("fly-stress");
const flyHappyEl = $("fly-happy");
const flyExciteEl = $("fly-excite");
const flyHealthEl = $("fly-health");
const stressMeter = $("stress-meter");
const happyMeter = $("happy-meter");
const exciteMeter = $("excite-meter");
const healthMeter = $("health-meter");

for (let i = 0; i < 100; i += 1) {
  const cell = document.createElement("div");
  cell.className = "neuron";
  brainGrid.appendChild(cell);
}

function num(value: number, digits = 0): string {
  return Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value)
    : "—";
}

function formatAge(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const days = Math.floor(totalSeconds / 86400);
  return `Day ${days + 1}`;
}

function setConnection(state: "authoritative" | "offline" | "connecting", label: string) {
  connection.dataset.state = state;
  connectionLabel.textContent = label;
}

const apiBase = (import.meta.env.VITE_CIVILIZATION_API || "https://civilization-core-v2-production.up.railway.app").replace(/\/$/, "");
let snapshot: CivilizationSnapshot | null = null;
let selectedFlyId: string | null = null;
let latestFlyStates = new Map<string, FlyState>();

function renderInspector(fly: FlyState | null) {
  if (!fly) {
    flyIdEl.textContent = "click a fly";
    flyAgeEl.textContent = flyActionEl.textContent = flyJobEl.textContent = flyPartnerEl.textContent =
      flyChildrenEl.textContent = flyMoneyEl.textContent = flyDebtEl.textContent = flyBrainEl.textContent = flyHomeEl.textContent =
      flyStressEl.textContent = flyHappyEl.textContent = flyExciteEl.textContent = flyHealthEl.textContent = "—";
    for (const el of [stressMeter, happyMeter, exciteMeter, healthMeter]) el.style.width = "0%";
    return;
  }
  flyIdEl.textContent = fly.id + (fly.pregnant ? " · pregnant" : "");
  flyAgeEl.textContent = `${fly.ageYears.toFixed(1)}y · ${fly.sex} · Gen ${fly.generation}`;
  flyActionEl.textContent = fly.action + (fly.mentalHealthCrisis ? " · crisis" : "");
  flyBrainEl.textContent = `${fly.brainDecision || fly.action} · ${Math.round((fly.brainConfidence ?? 0) * 100)}%`;
  flyJobEl.textContent = fly.jobTitle || (fly.ageYears < 18 ? "child" : fly.ageYears > 75 ? "retired" : "unemployed");
  flyHomeEl.textContent = fly.ownsHome ? `owned · tier ${fly.homeTier || 1}` : "rented unit";
  flyPartnerEl.textContent = fly.partnerId || (fly.flirtingWith ? `flirting: ${fly.flirtingWith}` : "single");
  flyChildrenEl.textContent = String(fly.children?.length || 0);
  flyMoneyEl.textContent = `${num(fly.money, 1)} / ${num(fly.savings, 1)} FC`;
  flyDebtEl.textContent = `${num(fly.debt, 1)} FC · ${fly.vehicle || "no vehicle"}`;
  flyStressEl.textContent = `${num(fly.stress, 1)}%`;
  flyHappyEl.textContent = `${num(fly.happiness, 1)}%`;
  flyExciteEl.textContent = `${num(fly.excitement, 1)}%`;
  flyHealthEl.textContent = `${num(fly.health, 1)}%`;
  stressMeter.style.width = `${fly.stress}%`;
  happyMeter.style.width = `${fly.happiness}%`;
  exciteMeter.style.width = `${fly.excitement}%`;
  healthMeter.style.width = `${fly.health}%`;

  const activity = [
    fly.stress / 100,
    fly.hunger / 100,
    fly.excitement / 100,
    fly.happiness / 100,
    fly.energy / 100,
  ];
  ([...brainGrid.children] as HTMLElement[]).forEach((cell, i) => {
    const a = activity[i % activity.length] ?? 0;
    cell.style.background = `rgba(102,227,157,${0.05 + a * 0.9})`;
    cell.style.boxShadow = a > 0.72 ? `0 0 8px rgba(102,227,157,${a * 0.65})` : "none";
  });
  brainNote.textContent =
    `${fly.id}: brain choice “${fly.brainDecision || fly.action}” (${Math.round((fly.brainConfidence ?? 0) * 100)}%). Stress ${fly.stress.toFixed(0)} · hunger ${fly.hunger.toFixed(0)} · excitement ${fly.excitement.toFixed(0)} · happiness ${fly.happiness.toFixed(0)} · energy ${fly.energy.toFixed(0)}. These are synthetic decision-model bands, not biological FlyWire recordings.`;
}

function renderSnapshot(s: CivilizationSnapshot) {
  snapshot = s;
  setConnection(
    s.authoritative ? "authoritative" : "offline",
    s.authoritative ? "SYNTHETIC CIVILIZATION LIVE" : "NON-AUTHORITATIVE",
  );
  worldAge.textContent = formatAge(s.simulationAgeSeconds);
  population.textContent = num(s.population);
  generation.textContent = num(s.generation);
  speed.textContent = "1h = 1m";
  births.textContent = num(s.births);
  deaths.textContent = num(s.deaths);
  food.textContent = num(s.foodReserve);
  money.textContent = `${num(s.moneySupply, 0)} FC`;
  gameClockEl.textContent = s.gameClock || "--:--";
  gameDayEl.textContent = `DAY ${s.day || 1}`;

  const rows = (s.events || []).slice(-16).reverse();
  events.replaceChildren(...rows.map((e) => {
    const row = document.createElement("div");
    const icon =
      e.type === "birth" ? "🐣 " :
      e.type === "relationship" ? "❤ " :
      e.type === "flirt" ? "✨ " :
      e.type === "breakup" ? "💔 " :
      e.type === "accident" ? "⚠ " :
      e.type === "death" ? "† " :
      e.type === "job" ? "▣ " :
      e.type === "vehicle_purchase" ? "◆ " : "";
    row.textContent = `D${e.day ?? s.day} ${e.time || ""} · ${icon}${e.text}`;
    return row;
  }));
  if (!rows.length) events.textContent = "Civilization is running; no recent events.";

  latestFlyStates = new Map((s.flies || []).map((fly) => [fly.id, fly]));
  syncFlyMeshes(s.flies || []);
  syncHomes(s.flies || []);
  updateDayNight(s.gameHour ?? 12, s.gameMinute ?? 0);

  if (selectedFlyId && latestFlyStates.has(selectedFlyId)) {
    renderInspector(latestFlyStates.get(selectedFlyId) || null);
  } else {
    const firstLiving = (s.flies || []).find((f) => f.alive) || null;
    if (firstLiving && !selectedFlyId) selectedFlyId = firstLiving.id;
    renderInspector(firstLiving);
  }
}

async function fetchSnapshot() {
  try {
    const response = await fetch(`${apiBase}/api/civilization/state`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderSnapshot(await response.json() as CivilizationSnapshot);
  } catch {
    setConnection("offline", "WORKER OFFLINE");
    events.textContent = "Persistent civilization worker is unavailable.";
  }
}
void fetchSnapshot();
window.setInterval(fetchSnapshot, 1000);

// ---------- Three.js city ----------
const host = $("world");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91b6cf);
scene.fog = new THREE.Fog(0x91b6cf, 90, 235);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = false;
renderer.domElement.style.cursor = "grab";
host.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xdff2ff, 0x33402d, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe6bd, 2.7);
sun.position.set(-65, 90, 45);
scene.add(sun);
const moon = new THREE.DirectionalLight(0x7e9ddb, 0.1);
moon.position.set(50, 60, -55);
scene.add(moon);

const groundMat = new THREE.MeshStandardMaterial({ color: 0x53775b, roughness: 1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const roadMat = new THREE.MeshStandardMaterial({ color: 0x252a2d, roughness: 0.96 });
const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb1afa7, roughness: 1 });
const laneMat = new THREE.MeshBasicMaterial({ color: 0xe1d8a9 });
for (let i = -60; i <= 60; i += 30) {
  const sideA = new THREE.Mesh(new THREE.BoxGeometry(14, 0.05, 154), sidewalkMat);
  sideA.position.set(i, 0.03, 0);
  scene.add(sideA);
  const roadA = new THREE.Mesh(new THREE.BoxGeometry(9, 0.07, 154), roadMat);
  roadA.position.set(i, 0.07, 0);
  scene.add(roadA);
  const lineA = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 154), laneMat);
  lineA.position.set(i, 0.12, 0);
  scene.add(lineA);

  const sideB = new THREE.Mesh(new THREE.BoxGeometry(154, 0.05, 14), sidewalkMat);
  sideB.position.set(0, 0.031, i);
  scene.add(sideB);
  const roadB = new THREE.Mesh(new THREE.BoxGeometry(154, 0.07, 9), roadMat);
  roadB.position.set(0, 0.071, i);
  scene.add(roadB);
  const lineB = new THREE.Mesh(new THREE.BoxGeometry(154, 0.01, 0.12), laneMat);
  lineB.position.set(0, 0.121, i);
  scene.add(lineB);
}

function seeded(n: number) {
  const x = Math.sin(n * 9283.17 + 17.13) * 43758.5453;
  return x - Math.floor(x);
}

const windowMaterials: THREE.MeshStandardMaterial[] = [];
const streetLights: THREE.PointLight[] = [];

function addBuilding(x: number, z: number, w: number, d: number, h: number, seed: number, special = false) {
  const group = new THREE.Group();
  const wallColor = [
    0xb6afa1, 0x9da8a0, 0xc3b99d, 0x858f8c, 0xb7a6a0, 0xa1a7b3,
  ][Math.floor(seeded(seed) * 6)];
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.82, metalness: 0.02 }),
  );
  body.position.y = h / 2;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.35, 0.35, d + 0.35),
    new THREE.MeshStandardMaterial({ color: 0x50585a, roughness: 0.9 }),
  );
  roof.position.y = h + 0.18;
  group.add(roof);

  const floorCount = Math.max(2, Math.floor(h / 3));
  const colsX = Math.max(2, Math.floor(w / 2.6));
  const colsZ = Math.max(2, Math.floor(d / 2.6));
  const windowGeo = new THREE.BoxGeometry(0.95, 1.15, 0.08);
  const sideWindowGeo = new THREE.BoxGeometry(0.08, 1.15, 0.95);

  for (let floor = 0; floor < floorCount; floor += 1) {
    const wy = 1.8 + floor * 2.8;
    if (wy > h - 0.7) continue;
    for (let c = 0; c < colsX; c += 1) {
      const wx = -w / 2 + 1.3 + c * ((w - 2.6) / Math.max(1, colsX - 1));
      for (const face of [-1, 1]) {
        const mat = new THREE.MeshStandardMaterial({
          color: 0x294351,
          emissive: 0xffd77f,
          emissiveIntensity: seeded(seed + floor * 17 + c * 7 + face) > 0.48 ? 0 : 0,
          roughness: 0.3,
          metalness: 0.25,
        });
        windowMaterials.push(mat);
        const win = new THREE.Mesh(windowGeo, mat);
        win.position.set(wx, wy, face * (d / 2 + 0.045));
        group.add(win);
      }
    }
    for (let c = 0; c < colsZ; c += 1) {
      const wz = -d / 2 + 1.3 + c * ((d - 2.6) / Math.max(1, colsZ - 1));
      for (const face of [-1, 1]) {
        const mat = new THREE.MeshStandardMaterial({
          color: 0x294351,
          emissive: 0xffd77f,
          emissiveIntensity: 0,
          roughness: 0.3,
          metalness: 0.25,
        });
        windowMaterials.push(mat);
        const win = new THREE.Mesh(sideWindowGeo, mat);
        win.position.set(face * (w / 2 + 0.045), wy, wz);
        group.add(win);
      }
    }
  }

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.45, 2.5, 0.12),
    new THREE.MeshStandardMaterial({ color: special ? 0x5f3f2e : 0x3d342d, roughness: 0.75 }),
  );
  door.position.set(0, 1.25, d / 2 + 0.07);
  group.add(door);
  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xc7aa68, metalness: 0.75, roughness: 0.25 }),
  );
  handle.position.set(0.45, 1.25, d / 2 + 0.15);
  group.add(handle);

  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

let bseed = 1;
for (let x = -52; x <= 52; x += 15) {
  for (let z = -52; z <= 52; z += 15) {
    if (Math.abs((x + 60) % 30) < 8 || Math.abs((z + 60) % 30) < 8) continue;
    if (Math.hypot(x, z) < 17) continue;
    const h = 9 + seeded(bseed++) * 23;
    const w = 8 + seeded(bseed++) * 3.5;
    const d = 8 + seeded(bseed++) * 3.5;
    addBuilding(x, z, w, d, h, bseed++);
  }
}

const specialBuildings = [
  { x: -10, z: 6, w: 11, d: 9, h: 7 },
  { x: 34, z: 6, w: 12, d: 10, h: 17 },
  { x: -34, z: 9, w: 13, d: 11, h: 11 },
  { x: 8, z: 37, w: 12, d: 10, h: 15 },
  { x: -15, z: 37, w: 10, d: 9, h: 10 },
  { x: 16, z: 12, w: 9, d: 8, h: 7 },
  { x: 5, z: 20, w: 10, d: 8, h: 7 },
  { x: -22, z: -15, w: 11, d: 9, h: 7 },
  { x: 24, z: -17, w: 9, d: 8, h: 7 },
  { x: 43, z: 25, w: 12, d: 10, h: 8 },
  { x: -43, z: 23, w: 11, d: 9, h: 10 },
  { x: -5, z: -42, w: 16, d: 12, h: 9 },
  { x: 22, z: 43, w: 12, d: 10, h: 9 },
  { x: 38, z: -8, w: 12, d: 10, h: 8 },
];
specialBuildings.forEach((b, i) => addBuilding(b.x, b.z, b.w, b.d, b.h, 900 + i * 13, true));

const farmSoil = new THREE.MeshStandardMaterial({ color: 0x6e5738, roughness: 1 });
const cropMat = new THREE.MeshStandardMaterial({ color: 0x6f8f45, roughness: 1 });
for (let row = 0; row < 6; row += 1) {
  const soil = new THREE.Mesh(new THREE.BoxGeometry(22, 0.08, 1.5), farmSoil);
  soil.position.set(-68, 0.08, -10 + row * 3.2);
  scene.add(soil);
  for (let col = 0; col < 11; col += 1) {
    const crop = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.85, 6), cropMat);
    crop.position.set(-78 + col * 2, 0.52, -10 + row * 3.2);
    scene.add(crop);
  }
}


const locationLabels = [
  { name: "MARKET", x: -10, z: 6, y: 8 },
  { name: "CAFE", x: 16, z: 12, y: 8 },
  { name: "FARM", x: -68, z: -4, y: 5 },
  { name: "BAKERY", x: 5, z: 20, y: 8 },
  { name: "GROCERY", x: -22, z: -15, y: 8 },
  { name: "SHOP", x: 24, z: -17, y: 8 },
  { name: "GYM", x: 43, z: 25, y: 8 },
  { name: "CLINIC", x: -15, z: 37, y: 11 },
  { name: "GARAGE", x: 38, z: -8, y: 9 },
  { name: "LAB", x: 8, z: 37, y: 16 },
  { name: "WAREHOUSE", x: -5, z: -42, y: 10 },
];
for (const l of locationLabels) {
  const s = makeCanvasSprite(l.name, 26, 1.4);
  s.position.set(l.x, l.y, l.z);
  scene.add(s);
}


const trunkMat = new THREE.MeshStandardMaterial({ color: 0x624731, roughness: 1 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7652, roughness: 1 });
for (let i = 0; i < 55; i += 1) {
  const x = -82 + seeded(i + 100) * 164;
  const z = -82 + seeded(i + 200) * 164;
  if (Math.abs((x + 60) % 30) < 8 || Math.abs((z + 60) % 30) < 8) continue;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.8, 7), trunkMat);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85 + seeded(i + 300) * 0.65, 1), leafMat);
  trunk.position.set(x, 0.9, z);
  crown.position.set(x, 2.2, z);
  scene.add(trunk, crown);
}

for (let i = -54; i <= 54; i += 18) {
  for (const z of [-7, 7]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.1, 3.5, 7),
      new THREE.MeshStandardMaterial({ color: 0x34383a, metalness: 0.5, roughness: 0.5 }),
    );
    pole.position.set(i, 1.75, z);
    scene.add(pole);
    const bulb = new THREE.PointLight(0xffd59a, 0, 14, 2);
    bulb.position.set(i, 3.4, z);
    scene.add(bulb);
    streetLights.push(bulb);
  }
}

// ---------- fly rendering ----------
type FlyVisual = {
  group: THREE.Group;
  target: THREE.Vector3;
  current: THREE.Vector3;
  halo: THREE.Mesh;
  status: THREE.Sprite;
};


function makeCanvasSprite(text: string, fontSize = 54, scale = 2.2): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${fontSize}px system-ui, Apple Color Emoji, Segoe UI Emoji`;
  ctx.fillStyle = "white";
  ctx.shadowColor = "rgba(0,0,0,.55)";
  ctx.shadowBlur = 8;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(scale * 2, scale, 1);
  sprite.userData.text = text;
  return sprite;
}

function updateSpriteText(sprite: THREE.Sprite, text: string) {
  if (sprite.userData.text === text) return;
  const old = (sprite.material as THREE.SpriteMaterial).map;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 54px system-ui, Apple Color Emoji, Segoe UI Emoji";
  ctx.fillStyle = "white";
  ctx.shadowColor = "rgba(0,0,0,.55)";
  ctx.shadowBlur = 8;
  ctx.fillText(text, 128, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  (sprite.material as THREE.SpriteMaterial).map = texture;
  (sprite.material as THREE.SpriteMaterial).needsUpdate = true;
  old?.dispose();
  sprite.userData.text = text;
}

function flyStatusEmoji(fly: FlyState) {
  if (fly.mentalHealthCrisis) return "⚠️";
  if (fly.flirtingWith) return "💕";
  if (fly.partnerId) return "❤️";
  if (fly.smoking) return "🚬";
  if (fly.exercising) return "🏃";
  if (fly.action === "working") return "💼";
  if (fly.action.includes("food") || fly.action.includes("meal")) return "🍎";
  if (fly.action.includes("home") || fly.action.includes("rest")) return "🏠";
  return "";
}

const flyVisuals = new Map<string, FlyVisual>();
const flyPickables: THREE.Object3D[] = [];
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x33261f, roughness: 0.55 });
const abdomenMat = new THREE.MeshStandardMaterial({ color: 0x5a3f2a, roughness: 0.65 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0xa51e24, emissive: 0x440000, emissiveIntensity: 0.6 });
const wingMat = new THREE.MeshStandardMaterial({
  color: 0xdcecff,
  transparent: true,
  opacity: 0.48,
  roughness: 0.15,
  metalness: 0,
  side: THREE.DoubleSide,
  depthWrite: false,
});

function createFlyVisual(id: string): FlyVisual {
  const group = new THREE.Group();
  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), bodyMat);
  thorax.scale.set(1, 0.82, 1.05);
  thorax.userData.flyId = id;
  group.add(thorax);

  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), abdomenMat);
  abdomen.scale.set(0.9, 0.78, 1.35);
  abdomen.position.z = 0.52;
  abdomen.userData.flyId = id;
  group.add(abdomen);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), bodyMat);
  head.position.z = -0.48;
  head.userData.flyId = id;
  group.add(head);

  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 9, 7), eyeMat);
    eye.position.set(sx * 0.22, 0.05, -0.7);
    eye.userData.flyId = id;
    group.add(eye);

    const wing = new THREE.Mesh(new THREE.CircleGeometry(0.58, 14), wingMat);
    wing.scale.set(1.35, 0.55, 1);
    wing.rotation.set(Math.PI / 2.7, 0, sx * 0.72);
    wing.position.set(sx * 0.42, 0.26, 0.06);
    wing.userData.flyId = id;
    group.add(wing);
  }

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.82, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe48a, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -0.58;
  group.add(halo);

  const status = makeCanvasSprite("", 54, 1.4);
  status.position.set(0, 1.45, 0);
  group.add(status);

  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh && obj !== halo) flyPickables.push(obj);
  });
  scene.add(group);
  return { group, target: new THREE.Vector3(), current: new THREE.Vector3(), halo, status };
}

function syncFlyMeshes(flies: FlyState[]) {
  const active = new Set<string>();
  for (const fly of flies) {
    if (!fly.alive) continue;
    active.add(fly.id);
    let visual = flyVisuals.get(fly.id);
    if (!visual) {
      visual = createFlyVisual(fly.id);
      visual.current.set(fly.x, fly.y, fly.z);
      visual.group.position.copy(visual.current);
      flyVisuals.set(fly.id, visual);
    }
    visual.target.set(fly.x, fly.y, fly.z);
    const ageScale = fly.ageYears < 18 ? 0.62 + fly.ageYears / 45 : fly.ageYears > 80 ? 0.9 : 1;
    visual.group.scale.setScalar(ageScale);
    (visual.halo.material as THREE.MeshBasicMaterial).opacity = selectedFlyId === fly.id ? 0.85 : 0;
    const emoji = flyStatusEmoji(fly);
    updateSpriteText(visual.status, emoji);
    visual.status.visible = Boolean(emoji);
    if (Math.abs(fly.vx) + Math.abs(fly.vz) > 0.001) {
      visual.group.rotation.y = Math.atan2(fly.vx, fly.vz);
    }
  }

  for (const [id, visual] of flyVisuals) {
    if (!active.has(id)) {
      scene.remove(visual.group);
      flyVisuals.delete(id);
    }
  }
}


type HomeVisual = { group: THREE.Group; tier: number };
const homeVisuals = new Map<string, HomeVisual>();

function createHomeVisual(fly: FlyState) {
  const tier = fly.ownsHome ? Math.max(1, fly.homeTier || 1) : 0;
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(tier ? 3.2 + tier * 0.8 : 2.2, tier ? 2.2 + tier * 0.7 : 1.7, tier ? 3 + tier * 0.7 : 2.1),
    new THREE.MeshStandardMaterial({ color: tier >= 3 ? 0xd8c7a5 : tier >= 2 ? 0xb8c7c1 : 0xaaa69e, roughness: 0.9 }),
  );
  body.position.y = (tier ? 2.2 + tier * 0.7 : 1.7) / 2;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(tier ? 2.9 + tier * 0.65 : 2.0, 1.35, 4),
    new THREE.MeshStandardMaterial({ color: tier >= 3 ? 0x6f4f3c : 0x594b43, roughness: 0.95 }),
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.y = (tier ? 2.2 + tier * 0.7 : 1.7) + 0.65;
  group.add(roof);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 1.2, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x4b342b, roughness: 0.8 }),
  );
  door.position.set(0, 0.62, (tier ? 3 + tier * 0.7 : 2.1) / 2 + 0.05);
  group.add(door);

  const label = makeCanvasSprite(tier ? `🏠 ${fly.id.slice(-2)}` : `▣ ${fly.id.slice(-2)}`, 30, 1.1);
  label.position.y = tier ? 4.8 + tier * 0.5 : 3.1;
  group.add(label);

  group.position.set(fly.homeX || 0, 0, fly.homeZ || 0);
  scene.add(group);
  return { group, tier };
}

function syncHomes(flies: FlyState[]) {
  const active = new Set<string>();
  for (const fly of flies) {
    if (!fly.alive || !Number.isFinite(fly.homeX) || !Number.isFinite(fly.homeZ)) continue;
    active.add(fly.id);
    const tier = fly.ownsHome ? Math.max(1, fly.homeTier || 1) : 0;
    const existing = homeVisuals.get(fly.id);
    if (!existing || existing.tier !== tier) {
      if (existing) scene.remove(existing.group);
      homeVisuals.set(fly.id, createHomeVisual(fly));
    } else {
      existing.group.position.set(fly.homeX!, 0, fly.homeZ!);
    }
  }
  for (const [id, hv] of homeVisuals) {
    if (!active.has(id)) {
      scene.remove(hv.group);
      homeVisuals.delete(id);
    }
  }
}

function updateDayNight(hour: number, minute: number) {
  const t = hour + minute / 60;
  const sunHeight = Math.sin(((t - 6) / 24) * Math.PI * 2);
  const daylight = THREE.MathUtils.clamp((sunHeight + 0.18) * 1.2, 0.04, 1);
  const night = 1 - daylight;

  const dayColor = new THREE.Color(0x91b6cf);
  const duskColor = new THREE.Color(t > 17 && t < 20 ? 0xd28c6a : 0x11182d);
  const sky = dayColor.clone().lerp(duskColor, night);
  scene.background = sky;
  (scene.fog as THREE.Fog).color.copy(sky);

  hemi.intensity = 0.22 + daylight * 1.45;
  sun.intensity = daylight * 2.8;
  moon.intensity = night * 0.55;
  sun.position.set(Math.cos((t / 24) * Math.PI * 2) * 80, Math.max(-12, sunHeight * 95), Math.sin((t / 24) * Math.PI * 2) * 80);

  windowMaterials.forEach((m, i) => {
    const occupied = seeded(i * 1.73 + Math.floor(t * 2)) > 0.4;
    m.emissiveIntensity = night * (occupied ? 1.5 : 0.08);
    m.color.setHex(night > 0.5 && occupied ? 0x6e5b43 : 0x294351);
  });
  streetLights.forEach((l) => { l.intensity = night * 5.2; });
}

let targetYaw = -0.72;
let targetPitch = 0.46;
let distance = 112;
let dragging = false;
let moved = false;
let lastX = 0;
let lastY = 0;
const orbitTarget = new THREE.Vector3(0, 4, 0);

renderer.domElement.addEventListener("pointerdown", (e) => {
  dragging = true;
  moved = false;
  lastX = e.clientX;
  lastY = e.clientY;
  renderer.domElement.style.cursor = "grabbing";
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
  targetYaw -= dx * 0.003;
  targetPitch = Math.max(0.12, Math.min(1.18, targetPitch + dy * 0.0025));
  lastX = e.clientX;
  lastY = e.clientY;
});
renderer.domElement.addEventListener("pointerup", () => {
  dragging = false;
  renderer.domElement.style.cursor = "grab";
});
renderer.domElement.addEventListener("wheel", (e) => {
  distance = Math.max(26, Math.min(180, distance + e.deltaY * 0.06));
}, { passive: true });

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
renderer.domElement.addEventListener("click", (e) => {
  if (moved) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(flyPickables, false)[0];
  const id = hit?.object?.userData?.flyId as string | undefined;
  if (!id) return;
  selectedFlyId = id;
  const fly = latestFlyStates.get(id) || null;
  renderInspector(fly);
  for (const [fid, visual] of flyVisuals) (visual.halo.material as THREE.MeshBasicMaterial).opacity = fid === id ? 0.85 : 0;
  if (fly) orbitTarget.set(fly.x, Math.max(2, fly.y), fly.z);
});

function animate() {
  requestAnimationFrame(animate);

  for (const visual of flyVisuals.values()) {
    visual.current.lerp(visual.target, 0.09);
    visual.group.position.copy(visual.current);
    const wingBeat = Math.sin(performance.now() * 0.035) * 0.08;
    visual.group.rotation.z = wingBeat;
  }

  const cp = Math.cos(targetPitch);
  camera.position.set(
    orbitTarget.x + Math.sin(targetYaw) * cp * distance,
    orbitTarget.y + Math.sin(targetPitch) * distance,
    orbitTarget.z + Math.cos(targetYaw) * cp * distance,
  );
  camera.lookAt(orbitTarget);
  renderer.render(scene, camera);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
