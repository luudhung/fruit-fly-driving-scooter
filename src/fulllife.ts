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
  lawAwareness?: number;
  lawViolations?: number;
  wanted?: boolean;
  arrested?: boolean;
  professionSkills?: Record<string, number>;
  intelligence?: number; learningRate?: number; educationLevel?: number; knowledge?: Record<string,number>; teacherId?: string|null; schoolDays?: number;
  chronotype?: string; preferredWorkStart?: number; preferredWorkHours?: number; workMinutesToday?: number;
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
  currency?: { code?: string; name?: string };
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
const flyLawEl = $("fly-law");
const flyLearningEl = $("fly-learning");
const flyScheduleEl = $("fly-schedule");
const flyStressEl = $("fly-stress");
const flyHappyEl = $("fly-happy");
const flyExciteEl = $("fly-excite");
const flyHealthEl = $("fly-health");
const stressMeter = $("stress-meter");
const happyMeter = $("happy-meter");
const exciteMeter = $("excite-meter");
const healthMeter = $("health-meter");

type GraphicsPreset = "low" | "medium" | "high" | "ultra";
const GRAPHICS_PROFILES = {
  low:    { pixelRatio: 0.85, fps: 24, maxFlies: 80,  maxHomes: 24,  rain: 320,  treeScale: 0.34, streetTreeStep: 72, windowStride: 3, metroDetail: 0, trafficStride: 3 },
  medium: { pixelRatio: 1.0,  fps: 30, maxFlies: 110, maxHomes: 48,  rain: 700,  treeScale: 0.58, streetTreeStep: 48, windowStride: 2, metroDetail: 1, trafficStride: 2 },
  high:   { pixelRatio: 1.25, fps: 45, maxFlies: 132, maxHomes: 72,  rain: 1200, treeScale: 0.82, streetTreeStep: 36, windowStride: 1, metroDetail: 2, trafficStride: 1 },
  ultra:  { pixelRatio: 2.0,  fps: 60, maxFlies: 132, maxHomes: 110, rain: 2200, treeScale: 1.0,  streetTreeStep: 24, windowStride: 1, metroDetail: 3, trafficStride: 1 },
} as const;
const savedGraphics = localStorage.getItem("fulllife_graphics");
const graphicsPreset: GraphicsPreset =
  savedGraphics === "medium" || savedGraphics === "high" || savedGraphics === "ultra" ? savedGraphics : "low";
const graphics = GRAPHICS_PROFILES[graphicsPreset];

const graphicsSelect = document.getElementById("graphics-preset") as HTMLSelectElement | null;
if (graphicsSelect) {
  graphicsSelect.value = graphicsPreset;
  graphicsSelect.addEventListener("change", () => {
    localStorage.setItem("fulllife_graphics", graphicsSelect.value);
    location.reload();
  });
}
const settingsWrap = document.getElementById("settings-wrap");
document.getElementById("settings-button")?.addEventListener("click", (event) => {
  event.stopPropagation();
  settingsWrap?.classList.toggle("open");
});
document.addEventListener("click", (event) => {
  if (settingsWrap && !settingsWrap.contains(event.target as Node)) settingsWrap.classList.remove("open");
});
document.querySelectorAll<HTMLButtonElement>(".panel-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const card = document.getElementById(button.dataset.panel || "");
    if (!card) return;
    const collapsed = card.classList.toggle("collapsed");
    button.textContent = collapsed ? "+" : "−";
  });
});

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
      flyClassEl.textContent = flyBusinessEl.textContent = flyLawEl.textContent = flyLearningEl.textContent = flyScheduleEl.textContent = flyStressEl.textContent = flyHappyEl.textContent = flyExciteEl.textContent = flyHealthEl.textContent = "—";
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
  flyMoneyEl.textContent = `${num(fly.money, 1)} / ${num(fly.savings, 1)} H$`;
  flyDebtEl.textContent = `${num(fly.debt + (fly.bankLoan || 0), 1)} H$ · ${fly.vehicle || fly.transitMode || "walk"}`;
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
    ? `${fly.businessId} · equity ${num(fly.businessEquity || 0)} H$`
    : `no business · credit ${num(fly.creditScore || 0)}`;
  const skillNames = Object.entries(fly.professionSkills || {}).filter(([,v]) => Number(v) > 0.45).map(([k]) => k).slice(0,2);
  flyLawEl.textContent = `${Math.round((fly.lawAwareness || 0) * 100)}% aware · ${fly.lawViolations || 0} violations${fly.arrested ? " · DETAINED" : fly.wanted ? " · WANTED" : ""}${skillNames.length ? " · " + skillNames.join("/") : ""}`;
  flyLearningEl.textContent = `IQ-like ${Math.round((fly.intelligence || 0) * 100)} · edu ${num(fly.educationLevel || 0,1)} · ${fly.schoolDays || 0} school days${fly.teacherId ? " · teacher " + fly.teacherId : ""}`;
  flyScheduleEl.textContent = `${fly.chronotype || "day"} · start ${String(Math.round(fly.preferredWorkStart || 0)).padStart(2,"0")}:00 · ${num(fly.preferredWorkHours || 0,1)}h preferred`;
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
  money.textContent = `${num(s.moneySupply, 0)} ${s.currency?.code || "H$"}`;
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
      e.type === "job" || e.type === "work" || e.type === "hire" || e.type === "labor" ? "▣ " :
      e.type === "school" || e.type === "education" ? "🎓 " :
      e.type === "salary" ? "$ " :
      e.type === "vehicle_purchase" ? "◆ " : "";
    row.textContent = `D${e.day ?? s.day} ${e.time || ""} · ${icon}${e.text}`;
    return row;
  }));
  if (!rows.length) events.textContent = "Civilization is running; no recent events.";

  latestFlyStates = new Map((s.flies || []).map((fly) => [fly.id, fly]));
  syncFlyMeshes(s.flies || []);
  syncHomes(s.flies || []);
  updateDayNight(s.gameHour ?? 12, s.gameMinute ?? 0, s.weather);
  updateTrafficSignals((s.simulationTime || 0) / Math.max(1, s.timeScale || 60));

  if (selectedFlyId && latestFlyStates.has(selectedFlyId)) {
    renderInspector(latestFlyStates.get(selectedFlyId) || null);
  } else {
    const firstLiving = (s.flies || []).find((f) => f.alive) || null;
    if (firstLiving && !selectedFlyId) selectedFlyId = firstLiving.id;
    renderInspector(firstLiving);
  }
}

async function fetchSnapshot() {
  // The civilization keeps running on Railway; hidden tabs do not need to poll/render it.
  if (document.hidden) return;
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
window.setInterval(fetchSnapshot, 2500);

// ---------- Three.js city ----------
const host = $("world");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x93b8cf);
scene.fog = new THREE.Fog(0x93b8cf, 210, 720);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.2, 720);
const renderer = new THREE.WebGLRenderer({
  antialias: graphics.metroDetail >= 2,
  powerPreference: graphicsPreset === "low" ? "low-power" : "high-performance",
  precision: graphicsPreset === "ultra" ? "highp" : "mediump",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, graphics.pixelRatio));
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

const rainCount = graphics.rain;
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
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 6, 0.10, d + 6), sidewalkMat);
  base.position.set(x, 0.04, z);
  cityRoot.add(base);

  const road = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), roadMat);
  road.position.set(x, 0.11, z);
  cityRoot.add(road);

  const sidewalkOffset = (avenue ? w : d) / 2 + 1.55;
  for (const side of [-1, 1]) {
    const walk = new THREE.Mesh(
      avenue ? new THREE.BoxGeometry(2.6, 0.18, d + 5) : new THREE.BoxGeometry(w + 5, 0.18, 2.6),
      sidewalkMat,
    );
    walk.position.set(avenue ? x + side * sidewalkOffset : x, 0.18, avenue ? z : z + side * sidewalkOffset);
    cityRoot.add(walk);
  }

  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(avenue ? 0.12 : w * 0.92, 0.014, avenue ? d * 0.92 : 0.12),
    laneMat,
  );
  marker.position.set(x, 0.18, z);
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

// Traffic signals and marked pedestrian crossings. Low quality renders fewer junctions.
type TrafficSignalVisual = { axis:"ns"|"ew"; offset:number; red:THREE.MeshBasicMaterial; yellow:THREE.MeshBasicMaterial; green:THREE.MeshBasicMaterial };
const trafficSignals: TrafficSignalVisual[] = [];
const trafficPoleMat = new THREE.MeshStandardMaterial({ color:0x303638, roughness:0.72, metalness:0.42 });
const trafficBoxMat = new THREE.MeshStandardMaterial({ color:0x111615, roughness:0.82 });
const trafficBulbGeo = new THREE.SphereGeometry(0.16, 7, 5);
const crossingMat = new THREE.MeshBasicMaterial({ color:0xf1f2ed, transparent:true, opacity:0.72 });

function addTrafficHead(x:number,z:number,axis:"ns"|"ew",offset:number) {
  const g=new THREE.Group();
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,3.2,6),trafficPoleMat); pole.position.y=1.6; g.add(pole);
  const box=new THREE.Mesh(new THREE.BoxGeometry(0.56,1.28,0.34),trafficBoxMat); box.position.y=3.1; if(axis==="ew") box.rotation.y=Math.PI/2; g.add(box);
  const red=new THREE.MeshBasicMaterial({color:0x3a0808}), yellow=new THREE.MeshBasicMaterial({color:0x302707}), green=new THREE.MeshBasicMaterial({color:0x07351c});
  [red,yellow,green].forEach((mat,i)=>{ const bulb=new THREE.Mesh(trafficBulbGeo,mat); bulb.position.set(axis==="ew"?0.19:0,3.48-i*0.39,axis==="ns"?0.19:0); g.add(bulb); });
  g.position.set(x,0,z); cityRoot.add(g); trafficSignals.push({axis,offset,red,yellow,green});
}
function addCrossing(x:number,z:number) {
  for(const dx of [-2.4,-0.8,0.8,2.4]){const m=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.018,3.2),crossingMat);m.position.set(x+dx,0.195,z-6.1);cityRoot.add(m);}
  for(const dz of [-2.4,-0.8,0.8,2.4]){const m=new THREE.Mesh(new THREE.BoxGeometry(3.2,0.018,0.8),crossingMat);m.position.set(x-6.2,0.196,z+dz);cityRoot.add(m);}
}
const signalAvenues=avenueXs.filter((_,i)=>i%graphics.trafficStride===0);
const signalStreets=streetZs.filter((_,i)=>i%graphics.trafficStride===0);
for(let xi=0;xi<signalAvenues.length;xi+=1) for(let zi=0;zi<signalStreets.length;zi+=1){
  const x=signalAvenues[xi],z=signalStreets[zi],offset=(xi*7+zi*11)%60;
  addTrafficHead(x+6.4,z+6.2,"ns",offset); addTrafficHead(x-6.4,z-6.2,"ew",offset); addCrossing(x,z);
}
function updateTrafficSignals(seconds:number){
  for(const s of trafficSignals){
    const phase=(seconds+s.offset)%60;
    const nsGreen=phase<25, nsYellow=phase>=25&&phase<30, ewGreen=phase>=30&&phase<55, ewYellow=phase>=55;
    const green=s.axis==="ns"?nsGreen:ewGreen, yellow=s.axis==="ns"?nsYellow:ewYellow, red=!green&&!yellow;
    s.red.color.setHex(red?0xff2b2b:0x3a0808); s.yellow.color.setHex(yellow?0xffc928:0x302707); s.green.color.setHex(green?0x35ef87:0x07351c);
  }
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
for (let i = 0; i < Math.round(80 * graphics.treeScale); i += 1) addTree(-2 + seeded(i + 20) * 34, -120 + seeded(i + 80) * 66, 0.8 + seeded(i + 140) * 0.5);
for (let i = 0; i < Math.round(36 * graphics.treeScale); i += 1) addTree(5 + seeded(i + 500) * 95, 155 + seeded(i + 600) * 20, 0.8 + seeded(i + 700) * 0.4);

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

  // Warm windows are fixed emissive surfaces, not dynamic point lights.
  const windowMat = new THREE.MeshStandardMaterial({ color:0x6c5735, emissive:0xffcf67, emissiveIntensity:1.05, roughness:0.34, metalness:options.glass?0.22:0.04 });
  windowMaterials.push(windowMat);
  const floors=Math.max(2,Math.floor(h/3.1)), colsX=Math.max(2,Math.floor(w/2.7)), colsZ=Math.max(2,Math.floor(d/2.7));
  const matrices:THREE.Matrix4[]=[]; const dummy=new THREE.Object3D();
  for(let floor=0;floor<floors;floor+=graphics.windowStride){
    const wy=1.8+floor*2.9; if(wy>h-0.65) continue;
    for(let col=0;col<colsX;col+=graphics.windowStride){const wx=-w/2+1.25+col*((w-2.5)/Math.max(1,colsX-1));for(const face of [-1,1]){dummy.position.set(wx,wy,face*(d/2+0.045));dummy.scale.set(0.92,1.12,0.08);dummy.updateMatrix();matrices.push(dummy.matrix.clone());}}
    for(let col=0;col<colsZ;col+=graphics.windowStride){const wz=-d/2+1.25+col*((d-2.5)/Math.max(1,colsZ-1));for(const face of [-1,1]){dummy.position.set(face*(w/2+0.045),wy,wz);dummy.scale.set(0.08,1.12,0.92);dummy.updateMatrix();matrices.push(dummy.matrix.clone());}}
  }
  const windows=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),windowMat,matrices.length);
  matrices.forEach((m,i)=>windows.setMatrixAt(i,m)); windows.instanceMatrix.needsUpdate=true; group.add(windows);

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

// Manhattan-like blocks: strict zoning keeps roads, metro corridors, landmarks and waterfront clear.
const skylineCenter = new THREE.Vector2(15,43.5);
const reservedBuildingPlots=[{x:-11,z:43.5,r:14},{x:15,z:43.5,r:14},{x:41,z:43.5,r:14},{x:-63,z:14.5,r:11},{x:-89,z:72.5,r:12},{x:93,z:-14.5,r:11},{x:67,z:43.5,r:11},{x:93,z:72.5,r:11},{x:-11,z:101.5,r:12},{x:-37,z:14.5,r:11}];
const isReservedPlot=(x:number,z:number)=>reservedBuildingPlots.some((p)=>Math.hypot(x-p.x,z-p.z)<p.r);
let blockSeed=1;
for(let xi=0;xi<avenueXs.length-1;xi+=1)for(let zi=0;zi<streetZs.length-1;zi+=1){
  const x0=avenueXs[xi]+6.5,x1=avenueXs[xi+1]-6.5,z0=streetZs[zi]+6.5,z1=streetZs[zi+1]-6.5,cx=(x0+x1)/2,cz=(z0+z1)/2;
  if(cx>-8&&cx<38&&cz<-50&&cz>-125)continue;
  if(x1>riverX-riverWidth/2-4)continue;
  const distCore=Math.hypot(cx-skylineCenter.x,cz-skylineCenter.y),core=THREE.MathUtils.clamp(1-distCore/175,0,1),parcels=core>0.55?2:1;
  for(let p=0;p<parcels;p+=1){const span=(x1-x0)/parcels,pw=Math.max(7,span-2),px=x0+span*(p+0.5),pd=Math.max(9,z1-z0-2);if(isReservedPlot(px,cz))continue;
    const height=8+Math.pow(core,1.75)*78+seeded(blockSeed++)*(7+core*15);
    addBuilding(px,cz,pw,pd,height,blockSeed++,{glass:core>0.52&&seeded(blockSeed+20)>0.38,residential:core<0.52});
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
const safeSuburbZ = graphicsPreset === "low" ? [-125,-25,75] : [-125,-75,-25,25,75,125];
const safeSuburbOffsets = graphicsPreset === "low" ? [-18,18] : [-32,-16,0,16,32];
for(const side of [-1,1]) for(const z of safeSuburbZ) for(const offset of safeSuburbOffsets){
  if(side<0&&z>100)continue;
  const x=(side<0?-220:220)+offset;addSuburbanHouse(x,z,suburbSeed++,seeded(suburbSeed)>0.72);
}

// Hansdrex iconic skyline — stylized landmark references on reserved central plots.
const landmarkWarm=new THREE.MeshStandardMaterial({color:0xe6c98d,emissive:0xffc85a,emissiveIntensity:1.15,roughness:0.35});
const landmarkCool=new THREE.MeshStandardMaterial({color:0x8db9d0,emissive:0x3c9fd4,emissiveIntensity:0.95,roughness:0.28});
const landmarkMetal=new THREE.MeshStandardMaterial({color:0xaeb6b9,roughness:0.38,metalness:0.58});
function addEmpireStyleTower(x:number,z:number){const g=new THREE.Group(),stone=new THREE.MeshStandardMaterial({color:0xa4a19a,roughness:0.68,metalness:0.08});const tiers=[[20,20,38,19],[16,16,28,52],[12,12,22,77],[8,8,14,95]] as const;
  for(const [w,d,h,y] of tiers){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),stone);m.position.y=y;g.add(m);}for(let i=0;i<3;i++){const c=new THREE.Mesh(new THREE.BoxGeometry(7-i*1.5,4,7-i*1.5),landmarkWarm);c.position.y=104+i*4;g.add(c);}
  const spire=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.72,25,8),landmarkMetal);spire.position.y=123;g.add(spire);const beacon=new THREE.Mesh(new THREE.SphereGeometry(0.72,8,6),landmarkWarm);beacon.position.y=136;g.add(beacon);g.position.set(x,0,z);cityRoot.add(g);}
addEmpireStyleTower(15,43.5);
function addTorontoStyleTower(x:number,z:number){const g=new THREE.Group(),shaftMat=new THREE.MeshStandardMaterial({color:0xb6b8b7,roughness:0.55,metalness:0.16});const shaft=new THREE.Mesh(new THREE.CylinderGeometry(1.25,3.6,104,12),shaftMat);shaft.position.y=52;g.add(shaft);
  const pod=new THREE.Mesh(new THREE.CylinderGeometry(8.2,6.4,8,20),landmarkCool);pod.position.y=86;g.add(pod);const ring=new THREE.Mesh(new THREE.TorusGeometry(7.2,0.35,6,20),landmarkWarm);ring.rotation.x=Math.PI/2;ring.position.y=89;g.add(ring);const antenna=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.68,42,8),landmarkMetal);antenna.position.y=111;g.add(antenna);const b=new THREE.Mesh(new THREE.SphereGeometry(0.62,8,6),landmarkCool);b.position.y=133;g.add(b);g.position.set(x,0,z);cityRoot.add(g);}
addTorontoStyleTower(-11,43.5);
function addPetronasTwinTowers(x:number,z:number){const g=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:0xb8c1c4,roughness:0.30,metalness:0.68});for(const sx of [-6.2,6.2]){const tg=new THREE.Group();for(let i=0;i<6;i++){const r=5.4-i*0.48,h=13-i*0.45,seg=new THREE.Mesh(new THREE.CylinderGeometry(r*0.88,r,h,12),m);seg.position.y=7+i*13;tg.add(seg);}const crown=new THREE.Mesh(new THREE.CylinderGeometry(1.3,3,12,10),m);crown.position.y=87;tg.add(crown);const spire=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.5,22,7),landmarkMetal);spire.position.y=104;tg.add(spire);tg.position.x=sx;g.add(tg);}const bridge=new THREE.Mesh(new THREE.BoxGeometry(12.5,2.4,3.1),landmarkWarm);bridge.position.y=52;g.add(bridge);g.position.set(x,0,z);cityRoot.add(g);}
addPetronasTwinTowers(41,43.5);
// Major destination buildings aligned to backend coordinates.
const destinationBuildings=[
["HANSDREX COFFEE",15,-14.5,12,10,12],["HANSDREX BANK",-63,14.5,15,12,31],["HANSDREX HOSPITAL",-89,72.5,20,16,27],["EAST HOSPITAL",176,68,18,15,24],
["HANSDREX NIGHT",93,-14.5,15,13,22],["SKY LOUNGE",41,101.5,14,12,38],["HANSDREX HOTEL",67,43.5,17,14,46],["RESEARCH LAB",93,72.5,18,14,32],
["HANSDREX SCHOOL",-11,101.5,22,17,18],["HANSDREX MARKET",-37,14.5,17,14,14],["HANSDREX MOTORS",-130,-74,22,15,14],["HANSDREX POLICE",-130,-25,18,14,17],
] as const;
for (let i = 0; i < destinationBuildings.length; i += 1) {
  const [label, x, z, w, d, h] = destinationBuildings[i];
  addBuilding(x, z, w, d, h, 8000 + i, { glass: h > 25, sign: label });
}
function addShowroomCar(x:number,z:number,color:number){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.65,4.2),new THREE.MeshStandardMaterial({color,roughness:0.42,metalness:0.28}));body.position.y=0.62;g.add(body);
  const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.75,0.62,2.0),new THREE.MeshStandardMaterial({color:0x5d7582,roughness:0.2,metalness:0.18}));cabin.position.set(0,1.15,-0.15);g.add(cabin);
  g.position.set(x,0,z);cityRoot.add(g);
}
if(graphics.metroDetail>=1){addShowroomCar(-137,-63.5,0xc94d4d);addShowroomCar(-130,-63.5,0xd5d8d2);addShowroomCar(-123,-63.5,0x3d668c);}

// Industrial outer ring.
const industrial=[[-220,75,25,18,20,"SUGAR WORKS"],[220,125,28,20,22,"MATERIALS"],[220,-75,28,19,18,"PACKAGING"],[-220,-125,31,22,19,"WAREHOUSE"],[220,25,26,20,16,"BUILD YARD"],[220,-125,30,20,18,"TRANSIT DEPOT"],[-220,-75,27,21,17,"UTILITIES"],[245,125,27,20,17,"RECYCLING"]] as const;
for (let i = 0; i < industrial.length; i += 1) {
  const [x, z, w, d, h, label] = industrial[i];
  addBuilding(x, z, w, d, h, 9000 + i, { sign: label });
}

// Hansdrex Farm in a reserved agricultural district.
const farmSoil=new THREE.MeshStandardMaterial({color:0x6e5738,roughness:1}),cropMat=new THREE.MeshStandardMaterial({color:0x6f8f45,roughness:1});
for(let row=0;row<7;row+=1){const z=108+row*5.3,soil=new THREE.Mesh(new THREE.BoxGeometry(42,0.08,2.2),farmSoil);soil.position.set(-220,0.08,z);cityRoot.add(soil);const crops=new THREE.Mesh(new THREE.BoxGeometry(40,0.42,0.9),cropMat);crops.position.set(-220,0.31,z);cityRoot.add(crops);}
// Street trees and lights along main avenues.
for (const x of avenueXs) {
  for (let z = -150; z <= 150; z += graphics.streetTreeStep) {
    if (x > 95 && Math.abs(x - riverX) < 25) continue;
    addTree(x + 7.2, z + 4, 0.72);
  }
}

// ---------- elevated metro network ----------
type MetroTrain = { group:THREE.Group; curve:THREE.Curve<THREE.Vector3>; stationTs:number[]; offset:number; lineIndex:number };
const metroTrains:MetroTrain[]=[];
const metroTrackMat=new THREE.MeshStandardMaterial({color:0x555b60,roughness:0.48,metalness:0.62});
const metroBeamMat=new THREE.MeshStandardMaterial({color:0x6e7478,roughness:0.66,metalness:0.38});
const lineColors=[0xe34a45,0x2f74c0,0x4aa75f,0xf0b541,0x9b5db5,0x46a7ae];
const metroLines=[{name:"M1",points:[[-154,0],[-102,0],[-50,0],[2,0],[54,0],[106,0],[159,0],[195,0]],height:9},{name:"M2",points:[[2,-150],[2,-116],[2,-58],[2,0],[2,58],[2,116],[2,150]],height:10},{name:"M3",points:[[-154,87],[-102,87],[-50,87],[2,87],[54,87],[106,87]],height:11},{name:"M4",points:[[-102,-150],[-102,-100],[-102,-50],[-102,0],[-102,50],[-102,100],[-102,150]],height:12},{name:"M5",points:[[-154,-87],[-102,-87],[-50,-87],[2,-87],[54,-87],[106,-87]],height:10.5},{name:"M6",points:[[159,-150],[159,-100],[159,-50],[159,0],[159,50],[159,100],[159,150]],height:11.5}] as const;

function addMetroStation(p:THREE.Vector3,lineName:string,lineIndex:number){
  const platform=new THREE.Mesh(new THREE.BoxGeometry(graphics.metroDetail>=2?16:12,0.65,5.8),new THREE.MeshStandardMaterial({color:0xb9bec0,roughness:0.65,metalness:0.18}));
  platform.position.copy(p).add(new THREE.Vector3(0,-0.8,0));cityRoot.add(platform);
  if(graphics.metroDetail>=2){
    const canopy=new THREE.Mesh(new THREE.BoxGeometry(11,0.3,5.2),new THREE.MeshStandardMaterial({color:0x535b60,roughness:0.55,metalness:0.45}));canopy.position.copy(p).add(new THREE.Vector3(0,2.2,0));cityRoot.add(canopy);
    for(const sx of [-4,4]){const post=new THREE.Mesh(new THREE.BoxGeometry(0.18,3,0.18),metroBeamMat);post.position.copy(p).add(new THREE.Vector3(sx,0.6,0));cityRoot.add(post);}
    const sign=makeCanvasSprite(`${lineName} · HANSDREX SUBWAY`,20,1.0);sign.position.copy(p).add(new THREE.Vector3(0,3.2,0));cityRoot.add(sign);
  }
}
function addElevatedMetroLine(line:typeof metroLines[number],lineIndex:number){const pts=line.points.map(([x,z])=>new THREE.Vector3(x,line.height,z)),curve=new THREE.CurvePath<THREE.Vector3>();let total=0;const lens:number[]=[];
for(let i=0;i<pts.length-1;i++){const seg=new THREE.LineCurve3(pts[i],pts[i+1]);curve.add(seg);const len=pts[i].distanceTo(pts[i+1]);lens.push(len);total+=len;}const track=new THREE.Mesh(new THREE.TubeGeometry(curve,graphics.metroDetail>=2?64:36,0.82,graphics.metroDetail>=2?6:4,false),metroTrackMat);cityRoot.add(track);
for(let t=.06;t<1;t+=graphics.metroDetail>=2?.10:.17){const p=curve.getPointAt(t),support=new THREE.Mesh(new THREE.BoxGeometry(.6,line.height,.6),metroBeamMat);support.position.set(p.x,line.height/2,p.z);cityRoot.add(support);}const stationTs=[0];let acc=0;for(const len of lens){acc+=len;stationTs.push(acc/Math.max(1,total));}stationTs.forEach(t=>addMetroStation(curve.getPointAt(t),line.name,lineIndex));
const train=new THREE.Group(),cars=graphics.metroDetail>=2?4:3;for(let car=0;car<cars;car++){const cg=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(3.2,2.5,7.6),new THREE.MeshStandardMaterial({color:0xc6cbce,roughness:.28,metalness:.78}));cg.add(body);const stripe=new THREE.Mesh(new THREE.BoxGeometry(3.24,.22,7.66),new THREE.MeshBasicMaterial({color:lineColors[lineIndex]}));stripe.position.y=-.52;cg.add(stripe);cg.position.z=car*8.05;train.add(cg);}cityRoot.add(train);metroTrains.push({group:train,curve,stationTs,offset:lineIndex*2300,lineIndex});}
metroLines.forEach(addElevatedMetroLine);

cityRoot.traverse(obj=>{obj.updateMatrix();obj.matrixAutoUpdate=false;});
for(const train of metroTrains) train.group.matrixAutoUpdate=true;

function updateMetroTrains(now:number){
  const travelMs=graphics.metroDetail>=2?4800:3900, dwellMs=graphics.metroDetail>=2?1500:800;
  for(const train of metroTrains){
    const sequence=[...train.stationTs,...train.stationTs.slice(1,-1).reverse()];
    const segCount=sequence.length;
    const cycle=segCount*(travelMs+dwellMs);
    const phase=(now+train.offset)%cycle;
    const seg=Math.floor(phase/(travelMs+dwellMs))%segCount;
    const local=phase%(travelMs+dwellMs);
    const a=sequence[seg], b=sequence[(seg+1)%segCount];
    const u=local<dwellMs?0:Math.min(1,(local-dwellMs)/travelMs);
    const t=THREE.MathUtils.lerp(a,b,u);
    const p=train.curve.getPointAt(THREE.MathUtils.clamp(t,0,1));
    const ahead=train.curve.getPointAt(THREE.MathUtils.clamp(t+(b>=a?0.003:-0.003),0,1));
    train.group.position.copy(p);train.group.lookAt(ahead);
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

const MAX_RENDERED_FLIES = graphics.maxFlies;
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
  group.scale.setScalar(graphicsPreset === "low" ? 1.55 : graphicsPreset === "medium" ? 1.35 : 1.18);

  // Ultra-light fly: two body meshes + two wings. The server still simulates every fly
  // independently; this only cuts browser draw calls.
  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.45, 7, 5), bodyMat);
  thorax.scale.set(1, 0.82, 1.12);
  thorax.userData.flyId = id;
  group.add(thorax);

  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.38, 7, 5), abdomenMat);
  abdomen.scale.set(0.88, 0.74, 1.45);
  abdomen.position.z = 0.55;
  abdomen.userData.flyId = id;
  group.add(abdomen);

  for (const sx of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.CircleGeometry(0.58, 7), wingMat);
    wing.scale.set(1.35, 0.55, 1);
    wing.rotation.set(Math.PI / 2.7, 0, sx * 0.72);
    wing.position.set(sx * 0.42, 0.26, 0.06);
    group.add(wing);
  }

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.82, 10),
    new THREE.MeshBasicMaterial({ color: 0xffe48a, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -0.58;
  group.add(halo);

  // No canvas texture is allocated until this fly actually needs a visible status icon.
  const status = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
  status.scale.set(2.8, 1.4, 1);
  status.userData.text = "";
  status.position.set(0, 1.45, 0);
  status.visible = false;
  group.add(status);

  flyPickables.push(thorax, abdomen);
  // Child geometry is static relative to the fly; only the parent group moves.
  group.children.forEach((child) => {
    child.updateMatrix();
    child.matrixAutoUpdate = false;
  });
  scene.add(group);
  return { group, target: new THREE.Vector3(), current: new THREE.Vector3(), halo, status };
}

function syncFlyMeshes(flies: FlyState[]) {
  const active = new Set<string>();
  let rendered = 0;
  for (const fly of flies) {
    if (!fly.alive) continue;
    if (rendered >= MAX_RENDERED_FLIES && fly.id !== selectedFlyId) continue;
    rendered += 1;
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
    const showStatus = Boolean(emoji) && (
      selectedFlyId === fly.id || fly.mentalHealthCrisis || Boolean(fly.illness)
    );
    visual.status.visible = showStatus;
    if (showStatus) updateSpriteText(visual.status, emoji);
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
const MAX_RENDERED_HOMES = graphics.maxHomes;
const homeVisuals = new Map<string, HomeVisual>();

function isHomeNoBuildZone(x:number,z:number,margin=5.5){
  if(avenueXs.some(ax=>Math.abs(x-ax)<9.5/2+margin&&z>-176&&z<166)) return true;
  if(streetZs.some(sz=>Math.abs(z-sz)<9/2+margin&&x>-113&&x<117)) return true;
  if(Math.abs(x-159)<5+margin&&z>-178&&z<168) return true;
  if(Math.abs(x+154)<5+margin&&z>-190&&z<183) return true;
  for(const rz of [-150,-100,-50,0,50,100,150]) if(Math.abs(z-rz)<4+margin&&((x>-258&&x<-112)||(x>132&&x<258))) return true;
  if(Math.abs(x-riverX)<riverWidth/2+margin&&z>-248&&z<220) return true;
  return false;
}
function safeHomeVisualPosition(fly:FlyState){
  const x=Number(fly.homeX||0),z=Number(fly.homeZ||0); if(!isHomeNoBuildZone(x,z)) return{x,z};
  const n=Number(fly.id.replace(/\D/g,""))||1, zs=[-125,-75,-25,25,75,125], side=n%2?-1:1;
  return{x:(side<0?-220:220)+((n%5)-2)*16,z:zs[n%zs.length]};
}

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

  const hp=safeHomeVisualPosition(fly); group.position.set(hp.x,0,hp.z);
  scene.add(group);
  return { group, tier };
}

function syncHomes(flies: FlyState[]) {
  const active = new Set<string>();
  let rendered = 0;
  for (const fly of flies) {
    if (!fly.alive || !fly.ownsHome || !Number.isFinite(fly.homeX) || !Number.isFinite(fly.homeZ)) continue;
    if (rendered >= MAX_RENDERED_HOMES && fly.id !== selectedFlyId) continue;
    rendered += 1;
    active.add(fly.id);
    const tier = Math.max(1, fly.homeTier || 1);
    const existing = homeVisuals.get(fly.id);
    if (!existing || existing.tier !== tier) {
      if (existing) scene.remove(existing.group);
      homeVisuals.set(fly.id, createHomeVisual(fly));
    } else {
      const hp=safeHomeVisualPosition(fly); existing.group.position.set(hp.x,0,hp.z);
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

  // Fixed warm windows stay emissive at all hours and never become dynamic lights.
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
let lastRenderedAt = 0;
const TARGET_FRAME_MS = 1000 / graphics.fps;
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
addEventListener("keyup", (e) => {pressed.delete(e.code);if (movementKeys.has(e.code)) e.preventDefault();});
document.querySelectorAll<HTMLButtonElement>(".mobile-control").forEach((button)=>{const key=button.dataset.key;if(!key)return;const down=(e:PointerEvent)=>{e.preventDefault();e.stopPropagation();followSelected=false;pressed.add(key);button.classList.add("active");try{button.setPointerCapture(e.pointerId);}catch{}};const up=(e:PointerEvent)=>{e.preventDefault();e.stopPropagation();pressed.delete(key);button.classList.remove("active");};button.addEventListener("pointerdown",down);button.addEventListener("pointerup",up);button.addEventListener("pointercancel",up);button.addEventListener("lostpointercapture",()=>{pressed.delete(key);button.classList.remove("active");});});

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
    if (moveForward.lengthSq() < 1e-5) moveForward.set(0,0,-1);
    moveForward.normalize();
    moveRight.set(moveForward.x,0,moveForward.z);
    if(moveRight.lengthSq()<1e-5) moveRight.set(0,0,-1);
    moveRight.normalize();
    moveRight.crossVectors(moveRight,worldUp).normalize();

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
  if (document.hidden || now - lastRenderedAt < TARGET_FRAME_MS) return;
  lastRenderedAt = now;
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
