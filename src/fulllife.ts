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
  thirst?: number;
  caffeine?: number;
  sleepDebt?: number;
  sleeping?: boolean;
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
  relationshipYears?: number | null;
  familyWaitYears?: number | null;
  familyReadiness?: number;
  flirtingWith?: string | null;
  pregnant?: boolean;
  children: string[];
  parents: string[];
  vehicle?: string | null;
  transitMode?: string;
  illness?: string | null;
  socialClass?: string;
  businessId?: string | null;
  businessEquity?: number;
  creditScore?: number;
  bankLoan?: number;
  ownsHome: boolean;
  brainId?: string;
  brainSeed?: number;
  brainParentIds?: string[];
  brainDecisionCount?: number;
  brainMemoryCount?: number;
  fullConnectome?: {
    connected: boolean;
    fullConnectome: boolean;
    neurons: number;
    edges: number;
    neuralStepsTotal: number;
    activeNeurons: number;
    activity: number;
    confidence: number;
    steppedThisSync: boolean;
    approachDrive: number;
    avoidDrive: number;
    socialDrive: number;
    restDrive: number;
    exploreDrive: number;
    consumeDrive: number;
    motorDrive: number;
    regionActivity?: number[];
  } | null;
  brainDynamic?: {
    fatigue: number;
    arousal: number;
    curiosity: number;
    rewardExpectation: number;
    stressLoad: number;
  } | null;
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

type WeatherState = {
  condition?: string;
  label?: string;
  precipitation?: number;
  wind?: number;
  cloudCover?: number;
  temperatureC?: number;
  scenicPotential?: number;
  lightning?: number;
  danger?: number;
  sunset?: { active?: boolean; quality?: number };
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
  weather?: WeatherState;
  daysPerYear?: number;
  neuralBridge?: {
    connected?: boolean;
    topologyShared?: boolean;
    independentDynamicState?: boolean;
    registeredBrains?: number;
    steppedBrains?: number;
    schedulerCursor?: number;
    lastSyncAt?: number;
    error?: string;
  };
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
const weatherIconEl = $("weather-icon");
const weatherLabelEl = $("weather-label");
const weatherRiskEl = $("weather-risk");
const temperatureEl = $("temperature");

const flyIdEl = $("fly-id");
const flyBrainIdEl = $("fly-brain-id");
const flyBrainHistoryEl = $("fly-brain-history");
const flyConnectomeEl = $("fly-connectome");
const flyNeuralStepsEl = $("fly-neural-steps");
const flyAgeEl = $("fly-age");
const flyActionEl = $("fly-action");
const flyBrainEl = $("fly-brain");
const flyJobEl = $("fly-job");
const flyHomeEl = $("fly-home");
const flyPartnerEl = $("fly-partner");
const flyChildrenEl = $("fly-children");
const flyMoneyEl = $("fly-money");
const flyDebtEl = $("fly-debt");
const flySleepEl = $("fly-sleep");
const flyNeedsEl = $("fly-needs");
const flyRelationshipEl = $("fly-relationship");
const flyFamilyEl = $("fly-family");
const flyClassEl = $("fly-class");
const flyBusinessEl = $("fly-business");
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

const apiBase = (import.meta.env.VITE_CIVILIZATION_API || "https://civilization-core-production.up.railway.app").replace(/\/$/, "");
let snapshot: CivilizationSnapshot | null = null;
let selectedFlyId: string | null = null;
let latestFlyStates = new Map<string, FlyState>();

function renderInspector(fly: FlyState | null) {
  if (!fly) {
    flyIdEl.textContent = "click a fly";
    flyBrainIdEl.textContent = "—";
    flyBrainHistoryEl.textContent = "—";
    flyConnectomeEl.textContent = "—";
    flyNeuralStepsEl.textContent = "—";
    flyAgeEl.textContent = flyActionEl.textContent = flyJobEl.textContent = flyPartnerEl.textContent =
      flyChildrenEl.textContent = flyMoneyEl.textContent = flyDebtEl.textContent = flyBrainEl.textContent = flyHomeEl.textContent =
      flySleepEl.textContent = flyNeedsEl.textContent = flyRelationshipEl.textContent = flyFamilyEl.textContent =
      flyClassEl.textContent = flyBusinessEl.textContent = flyStressEl.textContent = flyHappyEl.textContent = flyExciteEl.textContent = flyHealthEl.textContent = "—";
    for (const el of [stressMeter, happyMeter, exciteMeter, healthMeter]) el.style.width = "0%";
    return;
  }
  flyIdEl.textContent = fly.id + (fly.pregnant ? " · pregnant" : "");
  flyBrainIdEl.textContent = fly.brainId || "legacy brain pending";
  flyBrainHistoryEl.textContent = `${num(fly.brainDecisionCount || 0)} decisions · ${num(fly.brainMemoryCount || 0)} memories`;
  const fc = fly.fullConnectome;
  flyConnectomeEl.textContent = fc?.connected && fc.fullConnectome
    ? `${num(fc.neurons)} neurons · ${num(fc.edges)} edges`
    : "connecting…";
  flyNeuralStepsEl.textContent = fc?.connected
    ? `${num(fc.neuralStepsTotal)} · ${num(fc.activeNeurons)} active${fc.steppedThisSync ? " · stepped" : " · cached"}`
    : "—";
  flyAgeEl.textContent = `${fly.ageYears.toFixed(1)}y · ${fly.sex} · Gen ${fly.generation}`;
  flyActionEl.textContent = fly.action + (fly.mentalHealthCrisis ? " · crisis" : "");
  flyBrainEl.textContent = `${fly.brainDecision || fly.action} · ${Math.round((fly.brainConfidence ?? 0) * 100)}%`;
  flyJobEl.textContent = fly.jobTitle || (fly.ageYears < 18 ? "child" : fly.ageYears > 75 ? "retired" : "unemployed");
  flyHomeEl.textContent = fly.ownsHome ? `owned · tier ${fly.homeTier || 1}` : "rented unit";
  flyPartnerEl.textContent = fly.partnerId || (fly.flirtingWith ? `flirting: ${fly.flirtingWith}` : "single");
  flyChildrenEl.textContent = String(fly.children?.length || 0);
  flyMoneyEl.textContent = `${num(fly.money, 1)} / ${num(fly.savings, 1)} WC`;
  flyDebtEl.textContent = `${num(fly.debt + (fly.bankLoan || 0), 1)} WC · ${fly.vehicle || fly.transitMode || "walk"}`;
  flySleepEl.textContent = `${fly.sleeping ? "sleeping 💤" : "awake"} · caffeine ${num(fly.caffeine || 0)} · sleep debt ${num(fly.sleepDebt || 0)}`;
  flyNeedsEl.textContent = `hunger ${num(fly.hunger)} · thirst ${num(fly.thirst || 0)}`;
  flyRelationshipEl.textContent = fly.partnerId
    ? `${fly.partnerId} · ${num(fly.relationshipYears || 0, 2)}y`
    : (fly.flirtingWith ? `flirting ${fly.flirtingWith}` : "single");
  flyFamilyEl.textContent = fly.partnerId
    ? `${Math.round((fly.familyReadiness || 0) * 100)}% ready · wait ${num(fly.familyWaitYears || 0, 2)}y`
    : "—";
  flyClassEl.textContent = fly.socialClass || "working";
  flyBusinessEl.textContent = fly.businessId
    ? `${fly.businessId} · equity ${num(fly.businessEquity || 0)} WC`
    : `no business · credit ${num(fly.creditScore || 0)}`;
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
    `${fly.brainId || "brain"} / ${fly.id}: brain choice “${fly.brainDecision || fly.action}” (${Math.round((fly.brainConfidence ?? 0) * 100)}%). Stress ${fly.stress.toFixed(0)} · hunger ${fly.hunger.toFixed(0)} · excitement ${fly.excitement.toFixed(0)} · happiness ${fly.happiness.toFixed(0)} · energy ${fly.energy.toFixed(0)}. Full-connectome drives are read from this fly’s independent Rust Sim buffer; the green grid remains a compact visualization, not a neuron-by-neuron anatomical map.`;
}

function renderSnapshot(s: CivilizationSnapshot) {
  snapshot = s;
  const neuralLive = Boolean(s.neuralBridge?.connected && s.neuralBridge?.independentDynamicState);
  setConnection(
    s.authoritative ? "authoritative" : "offline",
    s.authoritative
      ? (neuralLive
          ? `FULL CONNECTOME · ${s.neuralBridge?.registeredBrains || 0} BRAINS`
          : "CIVILIZATION LIVE · CONNECTING BRAINS")
      : "NON-AUTHORITATIVE",
  );
  worldAge.textContent = formatAge(s.simulationAgeSeconds);
  population.textContent = num(s.population);
  generation.textContent = num(s.generation);
  speed.textContent = "1h = 1m";
  births.textContent = num(s.births);
  deaths.textContent = num(s.deaths);
  food.textContent = num(s.foodReserve);
  money.textContent = `${num(s.moneySupply, 0)} WC`;
  gameClockEl.textContent = s.gameClock || "--:--";
  gameDayEl.textContent = `DAY ${s.day || 1}`;
  const weather = s.weather || {};
  const condition = weather.condition || "clear";
  const weatherIcon =
    condition === "thunderstorm" ? "⛈️" :
    condition === "heavy_rain" ? "🌧️" :
    condition === "rain" ? "🌦️" :
    condition === "cloudy" ? "☁️" :
    weather.sunset?.active && (weather.sunset?.quality || 0) > 0.45 ? "🌇" : "☀️";
  weatherIconEl.textContent = weatherIcon;
  weatherLabelEl.textContent = (weather.label || condition).toUpperCase().replaceAll("_", " ");
  weatherRiskEl.textContent = `${Math.round((weather.danger || 0) * 100)}%`;
  temperatureEl.textContent = `${num(weather.temperatureC || 0, 1)}°C`;

  const rows = (s.events || []).slice(-16).reverse();
  events.replaceChildren(...rows.map((e) => {
    const row = document.createElement("div");
    const icon =
      e.type === "birth" ? "🐣 " :
      e.type === "relationship" ? "❤ " :
      e.type === "flirt" ? "✨ " :
      e.type === "breakup" ? "💔 " :
      e.type === "accident" ? "⚠ " :
      e.type === "weather" ? "🌦 " :
      e.type === "weather_injury" ? "🌧 " :
      e.type === "weather_death" ? "⛈ " :
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
  updateDayNight(s.gameHour ?? 12, s.gameMinute ?? 0, s.weather);

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
scene.background = new THREE.Color(0x93b8cf);
scene.fog = new THREE.Fog(0x93b8cf, 210, 720);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 1100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = false;
renderer.domElement.style.cursor = "grab";
host.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xdff2ff, 0x33402d, 1.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe6bd, 2.6);
sun.position.set(-150, 190, 120);
scene.add(sun);
const moon = new THREE.DirectionalLight(0x7e9ddb, 0.1);
moon.position.set(130, 120, -150);
scene.add(moon);

const weatherFlash = new THREE.PointLight(0xdce8ff, 0, 420, 1.4);
weatherFlash.position.set(0, 120, 0);
scene.add(weatherFlash);

const rainCount = 2200;
const rainPositions = new Float32Array(rainCount * 3);
for (let i = 0; i < rainCount; i += 1) {
  rainPositions[i * 3] = (Math.random() - 0.5) * 240;
  rainPositions[i * 3 + 1] = Math.random() * 120;
  rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 240;
}
const rainGeometry = new THREE.BufferGeometry();
rainGeometry.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
const rainMaterial = new THREE.PointsMaterial({
  color: 0xb9d8e8,
  size: 0.18,
  transparent: true,
  opacity: 0,
  depthWrite: false,
});
const rain = new THREE.Points(rainGeometry, rainMaterial);
rain.visible = false;
scene.add(rain);
let activeWeather: WeatherState = {};
let nextLightningAt = 0;

function seeded(n: number) {
  const x = Math.sin(n * 9283.17 + 17.13) * 43758.5453;
  return x - Math.floor(x);
}

const windowMaterials: THREE.MeshStandardMaterial[] = [];
const streetLights: THREE.PointLight[] = [];
const cityRoot = new THREE.Group();
scene.add(cityRoot);

const WORLD_HALF = 285;
const riverX = 122;
const riverWidth = 34;
const harborZ = 205;
const harborDepth = 68;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2),
  new THREE.MeshStandardMaterial({ color: 0x6e8c68, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
cityRoot.add(ground);

const waterMat = new THREE.MeshStandardMaterial({
  color: 0x3f7f9f,
  roughness: 0.35,
  metalness: 0.12,
  transparent: true,
  opacity: 0.92,
});
const river = new THREE.Mesh(new THREE.PlaneGeometry(riverWidth, 470), waterMat);
river.rotation.x = -Math.PI / 2;
river.position.set(riverX, 0.015, -12);
cityRoot.add(river);
const harbor = new THREE.Mesh(new THREE.PlaneGeometry(350, harborDepth), waterMat);
harbor.rotation.x = -Math.PI / 2;
harbor.position.set(65, 0.018, harborZ);
cityRoot.add(harbor);

const roadMat = new THREE.MeshStandardMaterial({ color: 0x242a2e, roughness: 0.97 });
const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb6b5ad, roughness: 1 });
const laneMat = new THREE.MeshBasicMaterial({ color: 0xe9dfb1 });
const parkMat = new THREE.MeshStandardMaterial({ color: 0x4f8459, roughness: 1 });
const plazaMat = new THREE.MeshStandardMaterial({ color: 0xc7c3b8, roughness: 1 });

const avenueXs = [-102, -76, -50, -24, 2, 28, 54, 80, 106];
const streetZs = [-145, -116, -87, -58, -29, 0, 29, 58, 87, 116, 145];

function addRoadStrip(x: number, z: number, w: number, d: number, avenue = false) {
  const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(w + 5, 0.08, d + 5), sidewalkMat);
  sidewalk.position.set(x, 0.02, z);
  cityRoot.add(sidewalk);
  const road = new THREE.Mesh(new THREE.BoxGeometry(w, 0.11, d), roadMat);
  road.position.set(x, 0.08, z);
  cityRoot.add(road);

  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(avenue ? 0.12 : w * 0.92, 0.012, avenue ? d * 0.92 : 0.12),
    laneMat,
  );
  marker.position.set(x, 0.145, z);
  cityRoot.add(marker);
}

for (const x of avenueXs) addRoadStrip(x, -5, 9.5, 332, true);
for (const z of streetZs) addRoadStrip(2, z, 220, 9, false);

// East-side river boulevard and suburban arterials.
addRoadStrip(159, -5, 10, 336, true);
addRoadStrip(-154, -2, 10, 365, true);
for (const z of [-150, -100, -50, 0, 50, 100, 150]) {
  addRoadStrip(-185, z, 135, 8, false);
  addRoadStrip(195, z, 115, 8, false);
}

// Sydney-style bridges over Hansdrex River.
function addBridge(z: number, width = 13) {
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(riverWidth + 34, 0.75, width),
    new THREE.MeshStandardMaterial({ color: 0x4e5357, roughness: 0.82, metalness: 0.18 }),
  );
  deck.position.set(riverX, 2.1, z);
  cityRoot.add(deck);

  for (const sx of [-1, 1]) {
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 15, 3),
      new THREE.MeshStandardMaterial({ color: 0x6f7375, roughness: 0.7, metalness: 0.25 }),
    );
    tower.position.set(riverX + sx * 14, 9.4, z);
    cityRoot.add(tower);
  }
}
[-87, 0, 87].forEach((z) => addBridge(z));

// Central Park and waterfront parks.
const centralPark = new THREE.Mesh(new THREE.BoxGeometry(40, 0.08, 72), parkMat);
centralPark.position.set(15, 0.04, -87);
cityRoot.add(centralPark);
const harborPark = new THREE.Mesh(new THREE.BoxGeometry(110, 0.08, 24), parkMat);
harborPark.position.set(52, 0.04, 165);
cityRoot.add(harborPark);
const waterfrontPromenade = new THREE.Mesh(new THREE.BoxGeometry(12, 0.08, 350), plazaMat);
waterfrontPromenade.position.set(99, 0.04, -5);
cityRoot.add(waterfrontPromenade);

function addTree(x: number, z: number, scale = 1) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12 * scale, 0.2 * scale, 1.8 * scale, 7),
    new THREE.MeshStandardMaterial({ color: 0x624731, roughness: 1 }),
  );
  const crown = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9 * scale, 1),
    new THREE.MeshStandardMaterial({ color: 0x3f7652, roughness: 1 }),
  );
  trunk.position.set(x, 0.9 * scale, z);
  crown.position.set(x, 2.15 * scale, z);
  cityRoot.add(trunk, crown);
}
for (let i = 0; i < 80; i += 1) {
  addTree(-2 + seeded(i + 20) * 34, -120 + seeded(i + 80) * 66, 0.8 + seeded(i + 140) * 0.5);
}
for (let i = 0; i < 36; i += 1) {
  addTree(5 + seeded(i + 500) * 95, 155 + seeded(i + 600) * 20, 0.8 + seeded(i + 700) * 0.4);
}

function addBuilding(
  x: number, z: number, w: number, d: number, h: number, seed: number,
  options: { glass?: boolean; sign?: string; residential?: boolean } = {},
) {
  const group = new THREE.Group();
  const wallPalette = options.glass
    ? [0x536b7b, 0x637f8e, 0x71828e]
    : options.residential
      ? [0xbcae9d, 0xc7b9a5, 0xa9b6ad, 0xbba9a4]
      : [0xa5aaa6, 0xb9b3a7, 0x909b97, 0xb7a59d];
  const wallColor = wallPalette[Math.floor(seeded(seed) * wallPalette.length)];
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      color: wallColor,
      roughness: options.glass ? 0.35 : 0.82,
      metalness: options.glass ? 0.26 : 0.03,
    }),
  );
  body.position.y = h / 2;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.35, 0.35, d + 0.35),
    new THREE.MeshStandardMaterial({ color: 0x4c5558, roughness: 0.9 }),
  );
  roof.position.y = h + 0.18;
  group.add(roof);

  const floorCount = Math.max(2, Math.floor(h / 3.1));
  const colsX = Math.max(2, Math.floor(w / 2.7));
  const colsZ = Math.max(2, Math.floor(d / 2.7));
  const windowGeo = new THREE.BoxGeometry(0.92, 1.12, 0.08);
  const sideWindowGeo = new THREE.BoxGeometry(0.08, 1.12, 0.92);

  for (let floor = 0; floor < floorCount; floor += 1) {
    const wy = 1.8 + floor * 2.9;
    if (wy > h - 0.65) continue;
    for (let col = 0; col < colsX; col += 1) {
      const wx = -w / 2 + 1.25 + col * ((w - 2.5) / Math.max(1, colsX - 1));
      for (const face of [-1, 1]) {
        const mat = new THREE.MeshStandardMaterial({
          color: options.glass ? 0x3b596b : 0x294351,
          emissive: 0xffd77f,
          emissiveIntensity: 0,
          roughness: options.glass ? 0.18 : 0.3,
          metalness: options.glass ? 0.42 : 0.25,
        });
        windowMaterials.push(mat);
        const win = new THREE.Mesh(windowGeo, mat);
        win.position.set(wx, wy, face * (d / 2 + 0.045));
        group.add(win);
      }
    }
    for (let col = 0; col < colsZ; col += 1) {
      const wz = -d / 2 + 1.25 + col * ((d - 2.5) / Math.max(1, colsZ - 1));
      for (const face of [-1, 1]) {
        const mat = new THREE.MeshStandardMaterial({
          color: options.glass ? 0x3b596b : 0x294351,
          emissive: 0xffd77f,
          emissiveIntensity: 0,
          roughness: options.glass ? 0.18 : 0.3,
          metalness: options.glass ? 0.42 : 0.25,
        });
        windowMaterials.push(mat);
        const win = new THREE.Mesh(sideWindowGeo, mat);
        win.position.set(face * (w / 2 + 0.045), wy, wz);
        group.add(win);
      }
    }
  }

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 2.45, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x40362f, roughness: 0.75 }),
  );
  door.position.set(0, 1.23, d / 2 + 0.07);
  group.add(door);

  if (options.sign) {
    const sign = makeCanvasSprite(options.sign, 25, 1.25);
    sign.position.set(0, Math.min(h + 2.8, 15), d / 2 + 0.45);
    group.add(sign);
  }

  group.position.set(x, 0, z);
  cityRoot.add(group);
  return group;
}

// Manhattan-like blocks: buildings are placed inside blocks only, never on roads.
let blockSeed = 1;
for (let xi = 0; xi < avenueXs.length - 1; xi += 1) {
  for (let zi = 0; zi < streetZs.length - 1; zi += 1) {
    const x0 = avenueXs[xi] + 6.5;
    const x1 = avenueXs[xi + 1] - 6.5;
    const z0 = streetZs[zi] + 6.5;
    const z1 = streetZs[zi + 1] - 6.5;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    // Park reservation.
    if (cx > -8 && cx < 38 && cz < -50 && cz > -125) continue;
    // Waterfront setback.
    if (x1 > 101) continue;

    const distCore = Math.hypot(cx - 5, cz - 20);
    const isCore = distCore < 82;
    const isMid = distCore < 135;
    const parcels = isCore ? 2 : 1;

    for (let p = 0; p < parcels; p += 1) {
      const pw = Math.max(7, (x1 - x0) / parcels - 2);
      const px = x0 + pw / 2 + p * ((x1 - x0) / parcels);
      const pd = Math.max(9, z1 - z0 - 2);
      const height =
        isCore ? 26 + seeded(blockSeed++) * 78 :
        isMid ? 14 + seeded(blockSeed++) * 34 :
        8 + seeded(blockSeed++) * 16;
      addBuilding(
        px, cz, pw, pd, height, blockSeed++,
        { glass: isCore && seeded(blockSeed + 20) > 0.42, residential: !isCore },
      );
    }
  }
}

// Outer low-rise suburbs. Houses stay in reserved lots between arterials.
function addSuburbanHouse(x: number, z: number, seed: number, premium = false) {
  const group = new THREE.Group();
  const w = premium ? 8.5 : 6.5;
  const d = premium ? 8 : 6;
  const h = premium ? 5.4 : 4.2;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: premium ? 0xd4c2a2 : 0xb8b0a2, roughness: 0.9 }),
  );
  body.position.y = h / 2;
  group.add(body);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(w, d) * 0.72, premium ? 2.5 : 2, 4),
    new THREE.MeshStandardMaterial({ color: 0x694d40, roughness: 0.95 }),
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + 1;
  group.add(roof);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.9, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x4a352c, roughness: 0.8 }),
  );
  door.position.set(0, 0.95, d / 2 + 0.06);
  group.add(door);
  group.position.set(x, 0, z);
  cityRoot.add(group);
  addTree(x + w * 0.65, z + d * 0.4, 0.9);
  return group;
}
let suburbSeed = 3000;
for (const side of [-1, 1]) {
  const baseX = side < 0 ? -215 : 205;
  for (let row = -4; row <= 4; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const x = baseX + side * col * 18;
      const z = row * 34 + (col % 2) * 9;
      if (side > 0 && Math.abs(x - riverX) < riverWidth + 28) continue;
      addSuburbanHouse(x, z, suburbSeed++, seeded(suburbSeed) > 0.72);
    }
  }
}

// Hansdrex iconic skyline — stylized references, not exact architectural replicas.
function addEmpireStyleTower(x: number, z: number) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9c9b93, roughness: 0.7, metalness: 0.08 });
  const tiers = [
    [18, 18, 52, 26],
    [13, 13, 26, 65],
    [8, 8, 18, 87],
  ];
  for (const [w, d, h, y] of tiers) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.y = y;
    g.add(m);
  }
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.8, 29, 10), mat);
  spire.position.y = 111;
  g.add(spire);
  g.position.set(x, 0, z);
  cityRoot.add(g);
  const label = makeCanvasSprite("HANSDREX EMPIRE", 24, 1.5);
  label.position.set(x, 130, z);
  cityRoot.add(label);
}
addEmpireStyleTower(28, 28);

function addCnStyleTower(x: number, z: number) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xb8b9b8, roughness: 0.55, metalness: 0.16 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 3.8, 96, 12), mat);
  shaft.position.y = 48;
  g.add(shaft);
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(8, 6, 7, 18), mat);
  pod.position.y = 84;
  g.add(pod);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.7, 34, 8), mat);
  antenna.position.y = 104;
  g.add(antenna);
  g.position.set(x, 0, z);
  cityRoot.add(g);
  const label = makeCanvasSprite("HANSDREX SKY TOWER", 22, 1.45);
  label.position.set(x, 124, z);
  cityRoot.add(label);
}
addCnStyleTower(88, 54);

function addNeedleTower(x: number, z: number, height: number, labelText: string) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x75838c, roughness: 0.35, metalness: 0.32 });
  for (let i = 0; i < 5; i += 1) {
    const h = height * (0.24 - i * 0.025);
    const w = 13 - i * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    m.position.y = i * height * 0.15 + h / 2;
    g.add(m);
  }
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.7, height * 0.28, 8), mat);
  needle.position.y = height * 0.88;
  g.add(needle);
  g.position.set(x, 0, z);
  cityRoot.add(g);
  const label = makeCanvasSprite(labelText, 20, 1.35);
  label.position.set(x, height + 8, z);
  cityRoot.add(label);
}
addNeedleTower(-45, 22, 105, "HANSDREX 101");
addNeedleTower(65, -52, 125, "HANSDREX SPIRE");

// Major destination buildings aligned to backend coordinates.
const destinationBuildings = [
  ["HANSDREX COFFEE", 22, 16, 12, 10, 12],
  ["HANSDREX BANK", -52, 26, 15, 12, 31],
  ["HANSDREX HOSPITAL", -82, 58, 20, 16, 27],
  ["EAST HOSPITAL", 126, 48, 18, 15, 24],
  ["HANSDREX NIGHT", 82, -20, 15, 13, 22],
  ["SKY LOUNGE", 40, 44, 14, 12, 38],
  ["HANSDREX HOTEL", 52, 48, 17, 14, 46],
  ["RESEARCH LAB", 88, 62, 18, 14, 32],
  ["HANSDREX SCHOOL", -16, 102, 22, 17, 18],
  ["HANSDREX MARKET", -18, 10, 17, 14, 14],
] as const;
for (let i = 0; i < destinationBuildings.length; i += 1) {
  const [label, x, z, w, d, h] = destinationBuildings[i];
  addBuilding(x, z, w, d, h, 8000 + i, { glass: h > 25, sign: label });
}

// Industrial outer ring.
const industrial = [
  [-132, 88, 25, 18, 20, "SUGAR WORKS"],
  [148, 118, 28, 20, 22, "MATERIALS"],
  [78, 152, 28, 19, 18, "PACKAGING"],
  [-42, -138, 31, 22, 19, "WAREHOUSE"],
  [142, 102, 26, 20, 16, "BUILD YARD"],
  [152, -112, 30, 20, 18, "TRANSIT DEPOT"],
  [-148, -104, 27, 21, 17, "UTILITIES"],
  [102, 148, 27, 20, 17, "RECYCLING"],
] as const;
for (let i = 0; i < industrial.length; i += 1) {
  const [x, z, w, d, h, label] = industrial[i];
  addBuilding(x, z, w, d, h, 9000 + i, { sign: label });
}

// Hansdrex Farm outside the dense grid.
const farmSoil = new THREE.MeshStandardMaterial({ color: 0x6e5738, roughness: 1 });
const cropMat = new THREE.MeshStandardMaterial({ color: 0x6f8f45, roughness: 1 });
for (let row = 0; row < 9; row += 1) {
  const soil = new THREE.Mesh(new THREE.BoxGeometry(36, 0.08, 1.6), farmSoil);
  soil.position.set(-208, 0.08, -55 + row * 4);
  cityRoot.add(soil);
  for (let col = 0; col < 14; col += 1) {
    const crop = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 6), cropMat);
    crop.position.set(-225 + col * 2.55, 0.53, -55 + row * 4);
    cityRoot.add(crop);
  }
}

// Street trees and lights along main avenues.
for (const x of avenueXs) {
  for (let z = -150; z <= 150; z += 24) {
    if (x > 95 && Math.abs(x - riverX) < 25) continue;
    addTree(x + 7.2, z + 4, 0.72);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.11, 4, 7),
      new THREE.MeshStandardMaterial({ color: 0x34383a, metalness: 0.5, roughness: 0.5 }),
    );
    pole.position.set(x - 6.2, 2, z);
    cityRoot.add(pole);
    const bulb = new THREE.PointLight(0xffd59a, 0, 18, 2);
    bulb.position.set(x - 6.2, 3.85, z);
    cityRoot.add(bulb);
    streetLights.push(bulb);
  }
}

// ---------- six elevated metro lines ----------
type MetroTrain = {
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  speed: number;
  offset: number;
};
const metroTrains: MetroTrain[] = [];
const metroTrackMat = new THREE.MeshStandardMaterial({ color: 0x5a6064, roughness: 0.5, metalness: 0.55 });
const metroBeamMat = new THREE.MeshStandardMaterial({ color: 0x70777b, roughness: 0.65, metalness: 0.34 });

const metroLines = [
  { name: "M1", points: [[-150,0],[0,0],[142,0],[190,0]], height: 9.0 },
  { name: "M2", points: [[0,-175],[0,-140],[0,0],[0,142],[0,175]], height: 10.0 },
  { name: "M3", points: [[-170,85],[-128,88],[-60,58],[0,29],[70,48],[126,48],[175,70]], height: 11.0 },
  { name: "M4", points: [[-175,-105],[-98,-82],[-30,-58],[55,-58],[92,-58],[160,-105]], height: 12.0 },
  { name: "M5", points: [[-165,145],[-80,116],[0,116],[78,116],[148,118],[185,150]], height: 10.5 },
  { name: "M6", points: [[-165,-150],[-70,-116],[0,-87],[80,-87],[159,-50],[190,-15]], height: 11.5 },
] as const;

function addElevatedMetroLine(line: typeof metroLines[number], lineIndex: number) {
  const pts = line.points.map(([x,z]) => new THREE.Vector3(x, line.height, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.15);
  const samples = curve.getPoints(100);

  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, len + 0.15), metroTrackMat);
    seg.position.copy(mid);
    seg.lookAt(b);
    cityRoot.add(seg);
    if (i % 8 === 0) {
      const support = new THREE.Mesh(new THREE.BoxGeometry(0.6, line.height, 0.6), metroBeamMat);
      support.position.set(mid.x, line.height / 2, mid.z);
      cityRoot.add(support);
    }
  }

  for (let t = 0.08; t < 1; t += 0.18) {
    const p = curve.getPoint(t);
    const station = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.65, 5.5),
      new THREE.MeshStandardMaterial({ color: 0xb9bec0, roughness: 0.65, metalness: 0.18 }),
    );
    station.position.copy(p).add(new THREE.Vector3(0, -0.8, 0));
    cityRoot.add(station);
  }

  const trainGroup = new THREE.Group();
  for (let car = 0; car < 3; car += 1) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(3.1, 2.3, 7.5),
      new THREE.MeshStandardMaterial({
        color: [0xd0d7db,0xd5cbc1,0xc8d3c3,0xc8c8d8,0xd7cfaa,0xbfd4d6][lineIndex],
        roughness: 0.45,
        metalness: 0.35,
      }),
    );
    body.position.z = car * 8.1;
    trainGroup.add(body);
  }
  cityRoot.add(trainGroup);
  metroTrains.push({
    group: trainGroup,
    curve,
    speed: 0.000012 + lineIndex * 0.0000015,
    offset: lineIndex / metroLines.length,
  });

  const lineLabel = makeCanvasSprite(line.name, 26, 1.0);
  const lp = curve.getPoint(0.5);
  lineLabel.position.set(lp.x, lp.y + 4, lp.z);
  cityRoot.add(lineLabel);
}
metroLines.forEach(addElevatedMetroLine);

function updateMetroTrains(now: number) {
  for (const train of metroTrains) {
    const t = (train.offset + now * train.speed) % 1;
    const p = train.curve.getPointAt(t);
    const ahead = train.curve.getPointAt((t + 0.003) % 1);
    train.group.position.copy(p);
    train.group.lookAt(ahead);
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
  if (fly.sleeping || fly.action === "sleeping") return "💤";
  if (fly.illness) return "🤒";
  if (fly.transitMode === "metro" && fly.action && fly.action !== "resting") return "🚇";
  if (fly.transitMode === "car" && fly.action && fly.action !== "resting") return "🚗";
  if (fly.action?.includes("coffee")) return "☕";
  if (fly.smoking) return "🚬";
  if (fly.exercising) return "🏃";
  if (fly.action === "working") return "💼";
  if (fly.action?.includes("sunset")) return "🌇";
  if (fly.flirtingWith) return "💕";
  if (fly.action?.includes("relationship") || fly.action?.includes("romance")) return "❤️";
  if (fly.action?.includes("food") || fly.action?.includes("meal") || fly.action?.includes("dinner")) return "🍎";
  if (fly.action?.includes("home") || fly.action?.includes("rest")) return "🏠";
  if (fly.action?.includes("storm") || fly.action?.includes("weather")) return "🌧️";
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

  const label = makeCanvasSprite(`🏠 ${fly.id.slice(-2)}`, 30, 1.1);
  label.position.y = tier ? 4.8 + tier * 0.5 : 3.1;
  group.add(label);

  group.position.set(fly.homeX || 0, 0, fly.homeZ || 0);
  scene.add(group);
  return { group, tier };
}

function syncHomes(flies: FlyState[]) {
  const active = new Set<string>();
  for (const fly of flies) {
    if (!fly.alive || !fly.ownsHome || !Number.isFinite(fly.homeX) || !Number.isFinite(fly.homeZ)) continue;
    active.add(fly.id);
    const tier = Math.max(1, fly.homeTier || 1);
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

function updateDayNight(hour: number, minute: number, weather: WeatherState = {}) {
  activeWeather = weather;
  const t = hour + minute / 60;
  const sunHeight = Math.sin(((t - 6) / 24) * Math.PI * 2);
  const daylight = THREE.MathUtils.clamp((sunHeight + 0.18) * 1.2, 0.04, 1);
  const night = 1 - daylight;

  const dayColor = new THREE.Color(0x91b6cf);
  const sunsetQuality = weather.sunset?.active ? (weather.sunset?.quality || 0) : 0;
  const duskColor = new THREE.Color(
    sunsetQuality > 0.45 ? 0xe27f52 :
    t > 17 && t < 20 ? 0xbc836d : 0x11182d
  );
  const cloud = THREE.MathUtils.clamp(weather.cloudCover || 0, 0, 1);
  const storm = weather.condition === "thunderstorm" ? 1 : weather.condition === "heavy_rain" ? 0.7 : 0;
  const overcast = new THREE.Color(storm > 0 ? 0x35424f : 0x6f8290);
  const baseSky = dayColor.clone().lerp(duskColor, Math.max(night, sunsetQuality * 0.68));
  const sky = baseSky.lerp(overcast, cloud * (0.42 + storm * 0.35));
  scene.background = sky;
  (scene.fog as THREE.Fog).color.copy(sky);

  hemi.intensity = 0.22 + daylight * 1.45;
  sun.intensity = daylight * 2.8 * (1 - cloud * 0.62);
  moon.intensity = night * 0.55 * (1 - cloud * 0.4);
  sun.position.set(Math.cos((t / 24) * Math.PI * 2) * 80, Math.max(-12, sunHeight * 95), Math.sin((t / 24) * Math.PI * 2) * 80);

  windowMaterials.forEach((m, i) => {
    const occupied = seeded(i * 1.73 + Math.floor(t * 2)) > 0.4;
    m.emissiveIntensity = night * (occupied ? 1.5 : 0.08);
    m.color.setHex(night > 0.5 && occupied ? 0x6e5b43 : 0x294351);
  });
  streetLights.forEach((l) => { l.intensity = Math.max(night, storm * 0.42) * 5.2; });
  const rainLevel = THREE.MathUtils.clamp(weather.precipitation || 0, 0, 1);
  rain.visible = rainLevel > 0.04;
  rainMaterial.opacity = rainLevel * 0.78;
}

// ---------- free-roam camera ----------
let cameraYaw = -0.7;
let cameraPitch = -0.28;
let dragging = false;
let moved = false;
let lastX = 0;
let lastY = 0;
let followSelected = false;
let lastFrameAt = performance.now();
const pressed = new Set<string>();
const freePosition = new THREE.Vector3(86, 54, 105);
const lookDirection = new THREE.Vector3();
const moveForward = new THREE.Vector3();
const moveRight = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);

function setCameraOverview() {
  followSelected = false;
  freePosition.set(210, 145, 285);
  cameraYaw = -2.48;
  cameraPitch = -0.38;
  camera.fov = 48;
  camera.updateProjectionMatrix();
}

function cameraForward(out = new THREE.Vector3()) {
  const cp = Math.cos(cameraPitch);
  return out.set(
    Math.sin(cameraYaw) * cp,
    Math.sin(cameraPitch),
    Math.cos(cameraYaw) * cp,
  ).normalize();
}

setCameraOverview();
camera.position.copy(freePosition);

renderer.domElement.tabIndex = 0;
renderer.domElement.style.outline = "none";
renderer.domElement.addEventListener("pointerdown", (e) => {
  dragging = true;
  moved = false;
  lastX = e.clientX;
  lastY = e.clientY;
  followSelected = false;
  renderer.domElement.style.cursor = "grabbing";
  renderer.domElement.focus();
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
  cameraYaw -= dx * 0.0032;
  cameraPitch = Math.max(-1.46, Math.min(1.2, cameraPitch - dy * 0.0028));
  lastX = e.clientX;
  lastY = e.clientY;
});
renderer.domElement.addEventListener("pointerup", () => {
  dragging = false;
  renderer.domElement.style.cursor = "grab";
});
renderer.domElement.addEventListener("wheel", (e) => {
  e.preventDefault();
  camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * 0.018, 24, 78);
  camera.updateProjectionMatrix();
}, { passive: false });

const movementKeys = new Set([
  "KeyW","KeyA","KeyS","KeyD",
  "ArrowUp","ArrowDown","ArrowLeft","ArrowRight",
  "KeyQ","KeyE","ShiftLeft","ShiftRight",
]);
addEventListener("keydown", (e) => {
  if (movementKeys.has(e.code)) {
    pressed.add(e.code);
    e.preventDefault();
    followSelected = false;
  }
  if (e.code === "KeyF" && selectedFlyId) {
    followSelected = !followSelected;
    e.preventDefault();
  }
  if (e.code === "KeyC") {
    setCameraOverview();
    e.preventDefault();
  }
});
addEventListener("keyup", (e) => {
  pressed.delete(e.code);
  if (movementKeys.has(e.code)) e.preventDefault();
});

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
  for (const [fid, visual] of flyVisuals) {
    (visual.halo.material as THREE.MeshBasicMaterial).opacity = fid === id ? 0.85 : 0;
  }
});

function updateFreeCamera(dt: number) {
  if (followSelected && selectedFlyId) {
    const visual = flyVisuals.get(selectedFlyId);
    if (visual) {
      const desired = visual.current.clone().add(new THREE.Vector3(-7, 4.8, 8));
      freePosition.lerp(desired, Math.min(1, dt * 3.2));
      const toward = visual.current.clone().sub(freePosition).normalize();
      cameraYaw = Math.atan2(toward.x, toward.z);
      cameraPitch = Math.asin(THREE.MathUtils.clamp(toward.y, -1, 1));
    }
  } else {
    cameraForward(moveForward);
    moveForward.y = 0;
    if (moveForward.lengthSq() < 1e-5) moveForward.set(0, 0, -1);
    moveForward.normalize();
    moveRight.crossVectors(moveForward, worldUp).normalize();

    let forwardAxis = 0;
    let strafeAxis = 0;
    let verticalAxis = 0;
    if (pressed.has("KeyW") || pressed.has("ArrowUp")) forwardAxis += 1;
    if (pressed.has("KeyS") || pressed.has("ArrowDown")) forwardAxis -= 1;
    if (pressed.has("KeyD") || pressed.has("ArrowRight")) strafeAxis += 1;
    if (pressed.has("KeyA") || pressed.has("ArrowLeft")) strafeAxis -= 1;
    if (pressed.has("KeyE")) verticalAxis += 1;
    if (pressed.has("KeyQ")) verticalAxis -= 1;

    const sprint = pressed.has("ShiftLeft") || pressed.has("ShiftRight");
    const speed = (sprint ? 52 : 22) * dt;
    freePosition.addScaledVector(moveForward, forwardAxis * speed);
    freePosition.addScaledVector(moveRight, strafeAxis * speed);
    freePosition.y += verticalAxis * speed * 0.75;

    freePosition.x = THREE.MathUtils.clamp(freePosition.x, -340, 340);
    freePosition.z = THREE.MathUtils.clamp(freePosition.z, -340, 340);
    freePosition.y = THREE.MathUtils.clamp(freePosition.y, 1.4, 260);
  }

  camera.position.copy(freePosition);
  cameraForward(lookDirection);
  camera.lookAt(freePosition.clone().add(lookDirection));
}

function animate(now = performance.now()) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameAt) / 1000));
  lastFrameAt = now;

  for (const visual of flyVisuals.values()) {
    visual.current.lerp(visual.target, 0.09);
    visual.group.position.copy(visual.current);
    const wingBeat = Math.sin(now * 0.035) * 0.08;
    visual.group.rotation.z = wingBeat;
  }

  updateMetroTrains(now);

  if (rain.visible) {
    rain.position.x = camera.position.x;
    rain.position.z = camera.position.z;
    const pos = rainGeometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < rainCount; i += 1) {
      let y = pos.getY(i) - dt * (38 + (activeWeather.precipitation || 0) * 55);
      if (y < 0) y += 95;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }

  if (activeWeather.condition === "thunderstorm") {
    if (now >= nextLightningAt) {
      weatherFlash.intensity = 12 + Math.random() * 18;
      nextLightningAt = now + 900 + Math.random() * 4200;
    } else {
      weatherFlash.intensity *= 0.78;
    }
  } else {
    weatherFlash.intensity = 0;
  }

  updateFreeCamera(dt);
  renderer.render(scene, camera);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
