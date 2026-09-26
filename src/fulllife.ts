import * as THREE from "three";

type CivilizationSnapshot = {
  authoritative: boolean;
  worldId: string;
  experimentId: string;
  worldSeed: number | string;
  serverTime: string;
  simulationTime: number;
  simulationAgeSeconds: number;
  timeScale: number;
  population: number;
  generation: number;
  births: number;
  deaths: number;
  foodReserve: number;
  moneySupply: number;
  selectedFly?: {
    id: string;
    neuralActivity?: number[];
    sensorySummary?: string;
    motorSummary?: string;
  } | null;
  events: Array<{ id?: string; time?: string; text: string; source?: "simulation" | "human" }>;
  versions?: {
    worldEngineVersion?: string;
    brainVersion?: string;
    physicsVersion?: string;
    geneticsVersion?: string;
    economicVersion?: string;
  };
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
const experiment = $("experiment");
const brainGrid = $("brain-grid");
const brainNote = $("brain-note");

for (let i = 0; i < 100; i += 1) {
  const cell = document.createElement("div");
  cell.className = "neuron";
  brainGrid.appendChild(cell);
}

function formatAge(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const days = Math.floor(totalSeconds / 86400);
  if (days >= 365) return `${Math.floor(days / 365)}y ${days % 365}d`;
  if (days > 0) return `${days}d ${Math.floor((totalSeconds % 86400) / 3600)}h`;
  const hours = Math.floor(totalSeconds / 3600);
  if (hours > 0) return `${hours}h ${Math.floor((totalSeconds % 3600) / 60)}m`;
  return `${Math.floor(totalSeconds / 60)}m`;
}

function num(value: number): string {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value) : "—";
}

function setConnection(state: "authoritative" | "offline" | "connecting", label: string) {
  connection.dataset.state = state;
  connectionLabel.textContent = label;
}

function renderSnapshot(s: CivilizationSnapshot) {
  setConnection(s.authoritative ? "authoritative" : "offline", s.authoritative ? "AUTHORITATIVE LIVE" : "NON-AUTHORITATIVE");
  worldAge.textContent = formatAge(s.simulationAgeSeconds);
  population.textContent = num(s.population);
  generation.textContent = num(s.generation);
  speed.textContent = `${num(s.timeScale)}×`;
  births.textContent = num(s.births);
  deaths.textContent = num(s.deaths);
  food.textContent = num(s.foodReserve);
  money.textContent = `${num(s.moneySupply)} FC`;

  const eventRows = (s.events || []).slice(-14).reverse();
  events.replaceChildren(...eventRows.map((e) => {
    const row = document.createElement("div");
    const prefix = e.source === "human" ? "[HUMAN INTERVENTION] " : "";
    row.textContent = `${e.time ? e.time + " · " : ""}${prefix}${e.text}`;
    return row;
  }));
  if (!eventRows.length) events.textContent = "No authoritative events yet.";

  const versions = s.versions || {};
  experiment.replaceChildren(
    ...[
      `World: ${s.worldId || "—"}`,
      `Experiment: ${s.experimentId || "—"}`,
      `World seed: ${String(s.worldSeed ?? "—")}`,
      `World engine: ${versions.worldEngineVersion || "—"}`,
      `Brain: ${versions.brainVersion || "FlyWire / MANC baseline"}`,
      `Physics: ${versions.physicsVersion || "—"}`,
    ].map((text) => {
      const div = document.createElement("div");
      div.textContent = text;
      return div;
    }),
  );

  const cells = [...brainGrid.children] as HTMLElement[];
  const neural = s.selectedFly?.neuralActivity || [];
  cells.forEach((cell, i) => {
    const a = Math.max(0, Math.min(1, neural[i] ?? 0));
    cell.style.background = `rgba(102,227,157,${0.05 + a * 0.9})`;
    cell.style.boxShadow = a > 0.72 ? `0 0 8px rgba(102,227,157,${a * 0.7})` : "none";
  });
  brainNote.textContent = s.selectedFly
    ? `${s.selectedFly.id} · sensory: ${s.selectedFly.sensorySummary || "sampled"} · motor: ${s.selectedFly.motorSummary || "sampled"}`
    : "No fly selected. Neural telemetry is sampled and must come from the real brain pipeline; this UI does not invent explanations.";
}

const apiBase = (import.meta.env.VITE_CIVILIZATION_API || "").replace(/\/$/, "");

async function fetchSnapshot() {
  setConnection("connecting", "CONNECTING");
  try {
    const response = await fetch(`${apiBase}/api/civilization/state`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const snapshot = await response.json() as CivilizationSnapshot;
    renderSnapshot(snapshot);
  } catch {
    setConnection("offline", "WORKER OFFLINE");
    events.textContent = "No persistent civilization worker is connected yet. The UI will not fabricate offline progress.";
  }
}

void fetchSnapshot();
window.setInterval(fetchSnapshot, 3000);

// -----------------------------------------------------------------------------
// Observer-only miniature city visualization.
// This scene contains architecture/lighting only. It deliberately does NOT spawn
// fake moving flies, traffic, births, transactions, or simulated events.
// -----------------------------------------------------------------------------
const host = $("world");
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x07100e, 65, 230);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 500);
camera.position.set(58, 47, 72);
camera.lookAt(0, 3, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = false;
host.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xcce8dd, 0x102018, 1.45));
const sun = new THREE.DirectionalLight(0xffe7bd, 2.15);
sun.position.set(-45, 85, 20);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(260, 260),
  new THREE.MeshStandardMaterial({ color: 0x183229, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const roadMat = new THREE.MeshStandardMaterial({ color: 0x202724, roughness: 1 });
for (let i = -60; i <= 60; i += 30) {
  const roadA = new THREE.Mesh(new THREE.BoxGeometry(10, 0.08, 150), roadMat);
  roadA.position.set(i, 0.05, 0);
  scene.add(roadA);
  const roadB = new THREE.Mesh(new THREE.BoxGeometry(150, 0.08, 10), roadMat);
  roadB.position.set(0, 0.05, i);
  scene.add(roadB);
}

function seeded(n: number) {
  const x = Math.sin(n * 9283.17 + 17.13) * 43758.5453;
  return x - Math.floor(x);
}

const buildingMats = [
  new THREE.MeshStandardMaterial({ color: 0xc8d2c9, roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: 0x9cae9f, roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: 0xb7a98b, roughness: 0.95 }),
  new THREE.MeshStandardMaterial({ color: 0x7e9187, roughness: 0.92 }),
];

let idx = 1;
for (let x = -52; x <= 52; x += 15) {
  for (let z = -52; z <= 52; z += 15) {
    if (Math.abs((x + 60) % 30) < 8 || Math.abs((z + 60) % 30) < 8) continue;
    const h = 7 + seeded(idx++) * 24;
    const w = 7 + seeded(idx++) * 4;
    const d = 7 + seeded(idx++) * 4;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMats[Math.floor(seeded(idx++) * buildingMats.length)]);
    mesh.position.set(x, h / 2, z);
    scene.add(mesh);
  }
}

const park = new THREE.Group();
for (let i = 0; i < 34; i += 1) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 1.7, 6),
    new THREE.MeshStandardMaterial({ color: 0x664f38 }),
  );
  const crown = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9 + seeded(i + 300) * 0.5, 1),
    new THREE.MeshStandardMaterial({ color: 0x3d7652, roughness: 1 }),
  );
  const x = -76 + seeded(i + 100) * 30;
  const z = -35 + seeded(i + 200) * 70;
  trunk.position.set(x, 0.85, z);
  crown.position.set(x, 2.1, z);
  park.add(trunk, crown);
}
scene.add(park);

let targetYaw = -0.55;
let targetPitch = 0.42;
let distance = 98;
let dragging = false;
let lastX = 0;
let lastY = 0;

renderer.domElement.addEventListener("pointerdown", (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  targetYaw -= (e.clientX - lastX) * 0.003;
  targetPitch = Math.max(0.16, Math.min(1.1, targetPitch + (e.clientY - lastY) * 0.0025));
  lastX = e.clientX;
  lastY = e.clientY;
});
renderer.domElement.addEventListener("pointerup", () => { dragging = false; });
renderer.domElement.addEventListener("wheel", (e) => {
  distance = Math.max(45, Math.min(170, distance + e.deltaY * 0.05));
}, { passive: true });

function animate() {
  requestAnimationFrame(animate);
  const cp = Math.cos(targetPitch);
  camera.position.set(
    Math.sin(targetYaw) * cp * distance,
    Math.sin(targetPitch) * distance,
    Math.cos(targetYaw) * cp * distance,
  );
  camera.lookAt(0, 3, 0);
  renderer.render(scene, camera);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
