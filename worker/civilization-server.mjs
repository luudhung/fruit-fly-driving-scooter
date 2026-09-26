import http from "node:http";
import process from "node:process";
import pg from "pg";
const { Pool } = pg;

const PORT = Number(process.env.PORT || 3000);
const WORLD_ID = process.env.CIV_WORLD_ID || "WORLD-A";
const EXPERIMENT_ID = process.env.CIV_EXPERIMENT_ID || "EXP-0001";
const WORLD_SEED = Number(process.env.CIV_WORLD_SEED || 948291);
const GAME_SECONDS_PER_REAL_SECOND = Number(process.env.CIV_TIME_SCALE || 60);
const INITIAL_POPULATION = Math.max(12, Number(process.env.CIV_INITIAL_POPULATION || 40));
const MAX_POPULATION = Math.max(INITIAL_POPULATION, Number(process.env.CIV_MAX_POPULATION || 180));
const DATABASE_URL = process.env.DATABASE_URL;
const FLYWIRE_BRAIN_URL = (process.env.FLYWIRE_BRAIN_URL || "https://flybrain-worker-production.up.railway.app").replace(/\/$/, "");
const NEURAL_SYNC_INTERVAL_MS = Math.max(500, Number(process.env.NEURAL_SYNC_INTERVAL_MS || 1000));
const CHECKPOINT_EVERY_MS = 5000;
const DAYS_PER_YEAR = 12; // compressed life calendar; one simulated year = 12 simulated days
const MAP_VERSION = 2;
const CURRENCY_CODE = "WC";
const CURRENCY_NAME = "Hansdrex WingCoin";
const CITY_NAME = "Hansdrex City of Fruit Fly";
const WEATHER_UPDATE_GAME_SECONDS = 45 * 60;

if (!DATABASE_URL) {
  console.error("[civilization] DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : undefined,
  max: 4,
});

const VERSION = {
  worldEngineVersion: "synthetic-civilization-0.5.0",
  brainVersion: "per-fly independent full-connectome bridge + persistent cognition",
  physicsVersion: "district-city-transit-0.5.0",
  geneticsVersion: "heritable-traits-0.2.0",
  economicVersion: "multi-sector-wingcoin-economy-0.5.0",
};

const LOCATIONS = [
  { id: "apt-north", type: "home", name: "Hansdrex North Garden Homes", x: 0, z: -165 },
  { id: "apt-east", type: "home", name: "Hansdrex East River Homes", x: 170, z: 12 },
  { id: "apt-south", type: "home", name: "Hansdrex South Meadow Homes", x: 12, z: 170 },
  { id: "apt-west", type: "home", name: "Hansdrex West Orchard Homes", x: -170, z: 8 },

  { id: "market", type: "food", name: "Hansdrex Central Market", x: -18, z: 10 },
  { id: "cafe", type: "social", name: "Hansdrex Coffee", x: 22, z: 16 },
  { id: "tea-house", type: "social", name: "Hansdrex Tea House", x: -32, z: -20 },
  { id: "restaurant", type: "food", name: "Hansdrex Kitchen", x: 36, z: -18 },
  { id: "park", type: "social", name: "Hansdrex Central Park", x: 0, z: -52 },
  { id: "office", type: "job", name: "Hansdrex Commerce Tower", x: 52, z: 14 },
  { id: "bank", type: "service", name: "Hansdrex Bank", x: -52, z: 26 },
  { id: "hotel", type: "service", name: "Hansdrex Grand Hotel", x: 52, z: 48 },
  { id: "cinema", type: "social", name: "Hansdrex Cinema", x: -52, z: 50 },
  { id: "library", type: "service", name: "Hansdrex Library", x: 14, z: 60 },

  { id: "hospital-central", type: "health", name: "Hansdrex Central Hospital", x: -82, z: 58 },
  { id: "hospital-east", type: "health", name: "Hansdrex East Hospital", x: 126, z: 48 },
  { id: "clinic", type: "health", name: "Hansdrex Community Clinic", x: -72, z: 90 },
  { id: "pharmacy", type: "health", name: "Hansdrex Pharmacy", x: -92, z: 24 },
  { id: "school", type: "service", name: "Hansdrex Academy", x: -16, z: 102 },
  { id: "post-office", type: "service", name: "Hansdrex Post", x: -98, z: -16 },
  { id: "lab", type: "job", name: "Hansdrex Research Lab", x: 88, z: 62 },
  { id: "garage", type: "service", name: "Hansdrex Garage", x: 92, z: -58 },
  { id: "gym", type: "wellness", name: "Hansdrex Fitness", x: 88, z: 24 },

  { id: "bakery", type: "food", name: "Hansdrex Bakery", x: 20, z: 84 },
  { id: "grocery", type: "food", name: "Hansdrex Grocery", x: -72, z: -46 },
  { id: "corner-shop", type: "shop", name: "Hansdrex Store", x: 72, z: -82 },
  { id: "night-market", type: "nightlife", name: "Hansdrex Night Market", x: 8, z: -98 },
  { id: "arcade", type: "nightlife", name: "Hansdrex Arcade", x: -64, z: -82 },
  { id: "music-hall", type: "nightlife", name: "Hansdrex Music Hall", x: 68, z: 82 },
  { id: "nightclub", type: "nightlife", name: "Hansdrex Afterdark", x: 82, z: -20 },
  { id: "rooftop", type: "nightlife", name: "Hansdrex Sky Lounge", x: 40, z: 44 },

  { id: "factory", type: "job", name: "Hansdrex Sugar Works", x: -132, z: 88 },
  { id: "factory-east", type: "job", name: "Hansdrex Materials Plant", x: 148, z: 118 },
  { id: "factory-south", type: "job", name: "Hansdrex Packaging", x: 78, z: 152 },
  { id: "warehouse", type: "job", name: "Hansdrex Warehouse", x: -42, z: -138 },
  { id: "farm", type: "production", name: "Hansdrex Farm", x: -208, z: -42 },
  { id: "construction", type: "job", name: "Hansdrex Build Yard", x: 142, z: 102 },
  { id: "transit", type: "job", name: "Hansdrex Transit Depot", x: 152, z: -112 },
  { id: "power", type: "job", name: "Hansdrex Utilities", x: -148, z: -104 },
  { id: "recycling", type: "job", name: "Hansdrex Recycling", x: 102, z: 148 },

  { id: "metro-central", type: "transit", name: "Hansdrex Central Station", x: 0, z: 0 },
  { id: "metro-north", type: "transit", name: "Hansdrex North Station", x: 0, z: -140 },
  { id: "metro-east", type: "transit", name: "Hansdrex East Station", x: 142, z: 0 },
  { id: "metro-south", type: "transit", name: "Hansdrex South Station", x: 0, z: 142 },
  { id: "metro-west", type: "transit", name: "Hansdrex West Station", x: -142, z: 0 },
  { id: "metro-industrial", type: "transit", name: "Hansdrex Industrial Station", x: -128, z: 88 },
];

const JOBS = [
  { id: "office", locationId: "office", title: "clerk", wage: 5.2, shiftStart: 8, shiftEnd: 17 },
  { id: "factory", locationId: "factory", title: "processor", wage: 4.4, shiftStart: 7, shiftEnd: 16 },
  { id: "factory-east", locationId: "factory-east", title: "materials operator", wage: 5.0, shiftStart: 7, shiftEnd: 16 },
  { id: "factory-south", locationId: "factory-south", title: "packaging worker", wage: 4.7, shiftStart: 8, shiftEnd: 17 },
  { id: "lab", locationId: "lab", title: "researcher", wage: 6.4, shiftStart: 9, shiftEnd: 18 },
  { id: "market", locationId: "market", title: "market vendor", wage: 4.8, shiftStart: 7, shiftEnd: 16 },
  { id: "farm", locationId: "farm", title: "farmer", wage: 4.6, shiftStart: 6, shiftEnd: 15 },
  { id: "bakery", locationId: "bakery", title: "baker", wage: 4.9, shiftStart: 5, shiftEnd: 14 },
  { id: "grocery", locationId: "grocery", title: "shop clerk", wage: 4.5, shiftStart: 9, shiftEnd: 18 },
  { id: "corner-shop", locationId: "corner-shop", title: "retail clerk", wage: 4.7, shiftStart: 10, shiftEnd: 19 },
  { id: "garage", locationId: "garage", title: "mechanic", wage: 5.4, shiftStart: 8, shiftEnd: 17 },
  { id: "hospital-central", locationId: "hospital-central", title: "hospital worker", wage: 6.2, shiftStart: 7, shiftEnd: 16 },
  { id: "hospital-east", locationId: "hospital-east", title: "nurse", wage: 6.1, shiftStart: 8, shiftEnd: 17 },
  { id: "clinic", locationId: "clinic", title: "care worker", wage: 5.8, shiftStart: 7, shiftEnd: 16 },
  { id: "pharmacy", locationId: "pharmacy", title: "pharmacy clerk", wage: 5.1, shiftStart: 8, shiftEnd: 17 },
  { id: "gym", locationId: "gym", title: "trainer", wage: 4.9, shiftStart: 10, shiftEnd: 19 },
  { id: "warehouse", locationId: "warehouse", title: "warehouse worker", wage: 4.6, shiftStart: 7, shiftEnd: 16 },
  { id: "restaurant", locationId: "restaurant", title: "cook", wage: 5.0, shiftStart: 11, shiftEnd: 21 },
  { id: "cafe", locationId: "cafe", title: "barista", wage: 4.7, shiftStart: 8, shiftEnd: 17 },
  { id: "tea-house", locationId: "tea-house", title: "tea server", wage: 4.6, shiftStart: 10, shiftEnd: 19 },
  { id: "hotel", locationId: "hotel", title: "hotel worker", wage: 5.0, shiftStart: 9, shiftEnd: 18 },
  { id: "cinema", locationId: "cinema", title: "cinema attendant", wage: 4.4, shiftStart: 14, shiftEnd: 23 },
  { id: "library", locationId: "library", title: "librarian", wage: 5.0, shiftStart: 9, shiftEnd: 18 },
  { id: "school", locationId: "school", title: "teacher", wage: 5.7, shiftStart: 7, shiftEnd: 15 },
  { id: "post-office", locationId: "post-office", title: "postal worker", wage: 4.9, shiftStart: 8, shiftEnd: 17 },
  { id: "construction", locationId: "construction", title: "builder", wage: 5.6, shiftStart: 7, shiftEnd: 16 },
  { id: "transit", locationId: "transit", title: "metro operator", wage: 5.6, shiftStart: 6, shiftEnd: 15 },
  { id: "power", locationId: "power", title: "utility technician", wage: 5.9, shiftStart: 7, shiftEnd: 16 },
  { id: "recycling", locationId: "recycling", title: "recycling worker", wage: 4.8, shiftStart: 7, shiftEnd: 16 },
  { id: "night-market", locationId: "night-market", title: "night market vendor", wage: 4.9, shiftStart: 18, shiftEnd: 2 },
  { id: "arcade", locationId: "arcade", title: "arcade attendant", wage: 4.7, shiftStart: 16, shiftEnd: 1 },
  { id: "music-hall", locationId: "music-hall", title: "music hall crew", wage: 5.1, shiftStart: 17, shiftEnd: 2 },
  { id: "nightclub", locationId: "nightclub", title: "nightclub staff", wage: 5.2, shiftStart: 19, shiftEnd: 3 },
  { id: "rooftop", locationId: "rooftop", title: "rooftop host", wage: 5.3, shiftStart: 17, shiftEnd: 1 },
];

const BUSINESSES = {
  farm: { inventory: 900, cash: 3200, price: 1.4, sector: "food" },
  market: { inventory: 450, cash: 2600, price: 5.2, sector: "food" },
  bakery: { inventory: 220, cash: 1800, price: 6.2, sector: "food" },
  grocery: { inventory: 360, cash: 2200, price: 4.8, sector: "food" },
  restaurant: { inventory: 180, cash: 2400, price: 9.5, sector: "food" },
  cafe: { inventory: 220, cash: 2000, price: 5.0, sector: "leisure" },
  "tea-house": { inventory: 180, cash: 1600, price: 4.2, sector: "leisure" },
  "corner-shop": { inventory: 160, cash: 1500, price: 7.5, sector: "retail" },
  "night-market": { inventory: 240, cash: 2100, price: 6.0, sector: "nightlife" },
  arcade: { inventory: 999, cash: 1800, price: 4.0, sector: "nightlife" },
  "music-hall": { inventory: 999, cash: 2300, price: 8.0, sector: "nightlife" },
  nightclub: { inventory: 999, cash: 2600, price: 10.0, sector: "nightlife" },
  rooftop: { inventory: 999, cash: 2500, price: 9.0, sector: "nightlife" },
};

const STARTUP_TYPES = [
  { sector: "cafe", baseCapital: 900, locationId: "cafe", margin: 0.18 },
  { sector: "retail", baseCapital: 1100, locationId: "corner-shop", margin: 0.16 },
  { sector: "food", baseCapital: 1300, locationId: "restaurant", margin: 0.20 },
  { sector: "nightlife", baseCapital: 1700, locationId: "nightclub", margin: 0.24 },
  { sector: "logistics", baseCapital: 1500, locationId: "warehouse", margin: 0.14 },
  { sector: "manufacturing", baseCapital: 2300, locationId: "factory-east", margin: 0.17 },
];

const clients = new Set();
let state = null;
let tickBusy = false;
let checkpointAt = 0;
let neuralSyncBusy = false;
let lastNeuralSyncAt = 0;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(payload);
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function location(id) {
  return LOCATIONS.find((l) => l.id === id) || LOCATIONS[0];
}

function homeLocations() {
  return LOCATIONS.filter((l) => l.type === "home");
}

function rand() {
  state.rngState = (Math.imul(state.rngState >>> 0, 1664525) + 1013904223) >>> 0;
  return state.rngState / 4294967296;
}

function randRange(a, b) {
  return a + (b - a) * rand();
}

function hashText(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function createBrainInstance(flyId, mother = null, father = null) {
  const serial = state.nextBrainId++;
  const id = `BRAIN-${String(serial).padStart(6, "0")}`;
  const seed = (hashText(`${WORLD_SEED}:${flyId}:${id}`) ^ (serial * 2654435761)) >>> 0;
  const parentBrains = [mother?.brain?.id, father?.brain?.id].filter(Boolean);

  const inherited = (key, fallback) => {
    const vals = [mother?.brain?.plasticity?.[key], father?.brain?.plasticity?.[key]].filter(Number.isFinite);
    const base = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : fallback;
    const mutation = (((seed >>> (serial % 16)) & 255) / 255 - 0.5) * 0.08;
    return Math.max(0.05, Math.min(0.95, base + mutation));
  };

  return {
    id,
    seed,
    rngState: seed || 1,
    lineage: {
      parentBrainIds: parentBrains,
      generation: parentBrains.length ? Math.max(mother?.generation || 1, father?.generation || 1) + 1 : 1,
    },
    bornAtSimulationSeconds: state.simulationAgeSeconds,
    plasticity: {
      learningRate: inherited("learningRate", 0.36),
      noveltyBias: inherited("noveltyBias", 0.48),
      socialBias: inherited("socialBias", 0.5),
      riskBias: inherited("riskBias", 0.42),
      persistence: inherited("persistence", 0.58),
    },
    dynamic: {
      fatigue: 0.2,
      arousal: 0.35,
      curiosity: 0.5,
      rewardExpectation: 0,
      stressLoad: 0.2,
    },
    memory: {
      episodes: [],
      locationReward: {},
      socialAffinity: {},
    },
    decisionCount: 0,
    lastDecision: "resting",
    lastConfidence: 0.5,
    fullConnectome: {
      connected: false,
      lastSyncAt: 0,
      neuralStepsTotal: 0,
      activeNeurons: 0,
      activity: 0,
      locomotionX: 0,
      locomotionZ: 0,
      approachDrive: 0,
      avoidDrive: 0,
      socialDrive: 0,
      restDrive: 0,
      exploreDrive: 0,
      consumeDrive: 0,
      motorDrive: 0,
      confidence: 0,
      fullConnectome: false,
      neurons: 0,
      edges: 0,
      steppedThisSync: false,
    },
  };
}

function brainRand(fly) {
  if (!fly.brain) fly.brain = createBrainInstance(fly.id);
  fly.brain.rngState = (Math.imul(fly.brain.rngState >>> 0, 1664525) + 1013904223) >>> 0;
  return fly.brain.rngState / 4294967296;
}

function brainRange(fly, a, b) {
  return a + (b - a) * brainRand(fly);
}

function brainRemember(fly, kind, payload = {}) {
  const episodes = fly.brain?.memory?.episodes;
  if (!episodes) return;
  episodes.push({
    t: state.simulationAgeSeconds,
    day: gameClock().day,
    kind,
    ...payload,
  });
  if (episodes.length > 32) episodes.splice(0, episodes.length - 32);
}

function updateBrainDynamics(fly) {
  if (!fly.brain) return;
  const d = fly.brain.dynamic;
  d.fatigue = clamp((100 - fly.energy) / 100 * 0.72 + fly.stress / 100 * 0.28, 0, 1);
  d.arousal = clamp(fly.excitement / 100 * 0.58 + fly.stress / 100 * 0.42, 0, 1);
  d.stressLoad = clamp(d.stressLoad * 0.94 + fly.stress / 100 * 0.06, 0, 1);
  d.curiosity = clamp(d.curiosity * 0.992 + brainRange(fly, -0.015, 0.018), 0.05, 0.95);
}

function brainLearnFromOutcome(fly, before) {
  if (!fly.brain) return;
  const reward =
    (fly.happiness - before.happiness) * 0.08 +
    (before.stress - fly.stress) * 0.06 +
    (before.hunger - fly.hunger) * 0.04 +
    (fly.health - before.health) * 0.05;
  const key = fly.currentLocationId || "unknown";
  const lr = fly.brain.plasticity.learningRate;
  const old = Number(fly.brain.memory.locationReward[key] || 0);
  fly.brain.memory.locationReward[key] = old * (1 - lr * 0.08) + reward * lr * 0.08;
  fly.brain.dynamic.rewardExpectation =
    fly.brain.dynamic.rewardExpectation * 0.96 + reward * 0.04;
}

function pick(items) {
  return items[Math.floor(rand() * items.length)] ?? items[0];
}

function jittered(loc, radius = 3) {
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(rand()) * radius;
  return { x: loc.x + Math.cos(a) * r, z: loc.z + Math.sin(a) * r };
}

function gameClock() {
  const sec = ((state.simulationAgeSeconds % 86400) + 86400) % 86400;
  const hour = Math.floor(sec / 3600);
  const minute = Math.floor((sec % 3600) / 60);
  return {
    day: Math.floor(state.simulationAgeSeconds / 86400) + 1,
    hour,
    minute,
    text: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function gameYears() {
  return state.simulationAgeSeconds / (86400 * DAYS_PER_YEAR);
}

function inheritedTrait(a, b, key, min = 0, max = 1) {
  if (!a || !b) return randRange(0.25, 0.8);
  const mean = ((a.traits[key] ?? 0.5) + (b.traits[key] ?? 0.5)) / 2;
  return clamp(mean + randRange(-0.08, 0.08), min, max);
}

function createFly(index, parents = null) {
  const homes = homeLocations();
  const mother = parents?.[0] || null;
  const father = parents?.[1] || null;
  const home = mother?.homeId ? location(mother.homeId) : pick(homes);
  const pos = jittered(home, 5);
  const generation = parents ? Math.max(mother.generation, father.generation) + 1 : 1;
  const initialAge = parents ? 0 : randRange(16, 72);
  const sex = rand() < 0.5 ? "F" : "M";
  const id = `FLY-${String(state.nextFlyId++).padStart(5, "0")}`;
  const brain = createBrainInstance(id, mother, father);
  const traits = {
    sociability: inheritedTrait(mother, father, "sociability"),
    risk: inheritedTrait(mother, father, "risk"),
    ambition: inheritedTrait(mother, father, "ambition"),
    empathy: inheritedTrait(mother, father, "empathy"),
    resilience: inheritedTrait(mother, father, "resilience"),
    attractiveness: inheritedTrait(mother, father, "attractiveness"),
    fertility: inheritedTrait(mother, father, "fertility", 0.05, 0.95),
    thrift: inheritedTrait(mother, father, "thrift"),
    health: inheritedTrait(mother, father, "health", 0.3, 0.98),
  };
  const job = initialAge >= 18 && initialAge <= 75 && rand() < 0.78 ? pick(JOBS) : null;
  return {
    id,
    name: `Fly ${index + 1}`,
    sex,
    generation,
    bornAtGameYears: gameYears() - initialAge,
    ageYears: initialAge,
    alive: true,
    causeOfDeath: null,
    x: pos.x,
    y: randRange(1.0, 3.8),
    z: pos.z,
    vx: 0,
    vz: 0,
    targetX: pos.x,
    targetZ: pos.z,
    homeId: home.id,
    currentLocationId: home.id,
    targetLocationId: home.id,
    action: "resting",
    actionUntil: 0,
    hunger: randRange(10, 48),
    thirst: randRange(8, 42),
    caffeine: 0,
    sleepDebt: randRange(0, 18),
    energy: randRange(45, 95),
    stress: randRange(5, 34),
    happiness: randRange(42, 82),
    excitement: randRange(10, 50),
    loneliness: randRange(5, 45),
    health: randRange(72, 100),
    money: randRange(80, 650),
    savings: randRange(0, 1000),
    debt: rand() < 0.15 ? randRange(50, 400) : 0,
    salaryEarnedToday: 0,
    salaryLifetime: 0,
    expensesLifetime: 0,
    jobId: job?.id || null,
    jobTitle: job?.title || null,
    wage: job?.wage || 0,
    partnerId: null,
    affection: 0,
    relationshipSince: null,
    familyWaitYears: null,
    familyReadiness: 0,
    flirtingWith: null,
    pregnancyBy: null,
    pregnancyDueAt: null,
    children: [],
    parents: parents ? [mother.id, father.id] : [],
    friends: [],
    vehicle: null,
    transitMode: "walk",
    transitPass: false,
    illness: null,
    sickDays: 0,
    nightlifeLastDay: -1,
    businessId: null,
    businessEquity: 0,
    creditScore: Math.round(randRange(520, 780)),
    bankLoan: 0,
    businessFailures: 0,
    businessSuccesses: 0,
    socialClass: "working",
    ownsHome: false,
    homeTier: 0,
    homeEquity: 0,
    homeX: home.x + randRange(-8, 8),
    homeZ: home.z + randRange(-8, 8),
    brainDecision: "resting",
    brainConfidence: 0.5,
    traveling: false,
    travelStartedAt: 0,
    travelLastDistance: null,
    travelStuckTicks: 0,
    travelGoalId: null,
    smoking: false,
    exercising: false,
    sleeping: false,
    lastPaidDay: -1,
    lastRentDay: -1,
    lastSocialTick: 0,
    lastEventTick: 0,
    mentalHealthCrisis: false,
    brain,
    traits,
  };
}

function makeWeather(previous = null) {
  const roll = rand();
  let condition =
    roll < 0.46 ? "clear" :
    roll < 0.68 ? "cloudy" :
    roll < 0.86 ? "rain" :
    roll < 0.95 ? "heavy_rain" : "thunderstorm";

  if (previous?.condition === "thunderstorm" && rand() < 0.62) condition = "heavy_rain";
  if (previous?.condition === "heavy_rain" && rand() < 0.45) condition = "rain";

  const precipitation =
    condition === "thunderstorm" ? randRange(0.78, 1) :
    condition === "heavy_rain" ? randRange(0.55, 0.85) :
    condition === "rain" ? randRange(0.2, 0.58) : 0;
  const wind =
    condition === "thunderstorm" ? randRange(0.72, 1) :
    condition === "heavy_rain" ? randRange(0.45, 0.8) :
    condition === "rain" ? randRange(0.25, 0.6) :
    randRange(0.05, 0.34);
  const cloudCover =
    condition === "clear" ? randRange(0.02, 0.24) :
    condition === "cloudy" ? randRange(0.45, 0.75) :
    randRange(0.7, 1);
  const temperatureC = randRange(18, 34) - precipitation * 4;
  const scenicPotential = clamp((1 - cloudCover) * 0.75 + (condition === "cloudy" ? 0.22 : 0) + randRange(-0.12, 0.18), 0, 1);

  return {
    condition,
    precipitation,
    wind,
    cloudCover,
    temperatureC,
    scenicPotential,
    startedAt: state?.simulationAgeSeconds || 0,
    nextChangeAt: (state?.simulationAgeSeconds || 0) + WEATHER_UPDATE_GAME_SECONDS * randRange(0.7, 1.5),
    lightning: condition === "thunderstorm" ? randRange(0.45, 1) : 0,
  };
}

function weatherDanger() {
  const w = state?.weather;
  if (!w) return 0;
  return clamp(
    Number(w.precipitation || 0) * 0.52 +
    Number(w.wind || 0) * 0.38 +
    Number(w.lightning || 0) * 0.32,
    0,
    1,
  );
}

function weatherLabel(weather = state?.weather) {
  if (!weather) return "clear";
  return String(weather.condition || "clear").replaceAll("_", " ");
}

function isSunsetWindow(clock = gameClock()) {
  return clock.hour === 17 || clock.hour === 18;
}

function sunsetQuality() {
  if (!isSunsetWindow()) return 0;
  const w = state.weather;
  if (!w) return 0.5;
  if (w.condition === "thunderstorm" || w.condition === "heavy_rain") return 0.05;
  return clamp(Number(w.scenicPotential || 0.5) * (1 - Number(w.precipitation || 0) * 0.7), 0, 1);
}

function updateWeather(clock) {
  if (!state.weather) state.weather = makeWeather();
  if (state.simulationAgeSeconds >= Number(state.weather.nextChangeAt || 0)) {
    const previous = state.weather.condition;
    state.weather = makeWeather(state.weather);
    emit("weather", `Hansdrex weather changed from ${String(previous).replaceAll("_"," ")} to ${weatherLabel()}.`, {
      previous,
      weather: state.weather,
    });
  }

  state.weather.sunset = {
    active: isSunsetWindow(clock),
    quality: sunsetQuality(),
  };
}

function freshState() {
  const s = {
    worldId: WORLD_ID,
    experimentId: EXPERIMENT_ID,
    worldSeed: WORLD_SEED,
    rngState: (WORLD_SEED >>> 0) || 1,
    simulationAgeSeconds: 0,
    timeScale: GAME_SECONDS_PER_REAL_SECOND,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paused: false,
    nextFlyId: 1,
    nextBrainId: 1,
    flies: [],
    births: 0,
    deaths: 0,
    foodReserve: 12000,
    generation: 1,
    totalTransactions: 0,
    events: [],
    eventSeq: 1,
    locations: LOCATIONS,
    businesses: JSON.parse(JSON.stringify(BUSINESSES)),
    enterprises: {},
    nextEnterpriseId: 1,
    bank: { reserves: 250000, loansOutstanding: 0, defaults: 0 },
    economy: { index: 1, unemployment: 0, averageNetWorth: 0, businessCount: 0 },
    mapVersion: MAP_VERSION,
    currency: { code: CURRENCY_CODE, name: CURRENCY_NAME },
    weather: null,
  };
  state = s;
  state.weather = makeWeather();
  for (let i = 0; i < INITIAL_POPULATION; i += 1) state.flies.push(createFly(i));
  s.generation = 1;
  return s;
}

function appendMemoryEvent(type, text, payload = {}) {
  const e = {
    id: String(state.eventSeq++),
    time: gameClock().text,
    day: gameClock().day,
    source: "simulation",
    type,
    text,
    payload,
  };
  state.events.push(e);
  if (state.events.length > 160) state.events.splice(0, state.events.length - 160);
  const packet = `event: world-event\ndata: ${JSON.stringify(e)}\n\n`;
  for (const client of clients) {
    try { client.write(packet); } catch { clients.delete(client); }
  }
}

async function persistEvent(e) {
  try {
    await pool.query(
      `INSERT INTO civilization_events (world_id, source, event_type, message, payload)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [WORLD_ID, e.source || "simulation", e.type || "event", e.text, JSON.stringify(e.payload || {})],
    );
  } catch (error) {
    console.error("[civilization] event persist failed", error);
  }
}

function emit(type, text, payload = {}) {
  appendMemoryEvent(type, text, payload);
  const e = state.events[state.events.length - 1];
  void persistEvent(e);
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS civilization_worlds (
      world_id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      world_seed BIGINT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      simulation_age_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
      time_scale DOUBLE PRECISION NOT NULL DEFAULT 60,
      population INTEGER NOT NULL DEFAULT 0,
      generation INTEGER NOT NULL DEFAULT 1,
      births INTEGER NOT NULL DEFAULT 0,
      deaths INTEGER NOT NULL DEFAULT 0,
      food_reserve DOUBLE PRECISION NOT NULL DEFAULT 0,
      money_supply DOUBLE PRECISION NOT NULL DEFAULT 0,
      simulation_status TEXT NOT NULL DEFAULT 'SYNTHETIC_CIVILIZATION_LIVE',
      paused BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS civilization_events (
      id BIGSERIAL PRIMARY KEY,
      world_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL DEFAULT 'simulation',
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS civilization_state (
      world_id TEXT PRIMARY KEY,
      state_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const snapshot = await pool.query(
    "SELECT state_json FROM civilization_state WHERE world_id = $1",
    [WORLD_ID],
  );

  if (snapshot.rowCount && snapshot.rows[0].state_json?.flies?.length) {
    state = snapshot.rows[0].state_json;
    state.timeScale = GAME_SECONDS_PER_REAL_SECOND;
    state.locations = LOCATIONS;
    state.businesses = state.businesses || JSON.parse(JSON.stringify(BUSINESSES));
    state.enterprises = state.enterprises || {};
    state.nextEnterpriseId = Number(state.nextEnterpriseId || 1);
    state.bank = state.bank || { reserves: 250000, loansOutstanding: 0, defaults: 0 };
    state.economy = state.economy || { index: 1, unemployment: 0, averageNetWorth: 0, businessCount: 0 };
    state.mapVersion = MAP_VERSION;
    state.currency = { code: CURRENCY_CODE, name: CURRENCY_NAME };
    state.weather = state.weather || makeWeather();
    state.rngState = Number(state.rngState || WORLD_SEED) >>> 0;
    state.nextFlyId = Number(state.nextFlyId || (state.flies.length + 1));
    state.nextBrainId = Number(state.nextBrainId || (state.flies.length + 1));
    state.eventSeq = Number(state.eventSeq || 1);
    for (const fly of state.flies) {
      if (!fly.brain?.id) fly.brain = createBrainInstance(fly.id);
      fly.brain.memory = fly.brain.memory || { episodes: [], locationReward: {}, socialAffinity: {} };
      fly.brain.memory.episodes = fly.brain.memory.episodes || [];
      fly.brain.memory.locationReward = fly.brain.memory.locationReward || {};
      fly.brain.memory.socialAffinity = fly.brain.memory.socialAffinity || {};
      fly.brain.dynamic = fly.brain.dynamic || { fatigue: 0.2, arousal: 0.35, curiosity: 0.5, rewardExpectation: 0, stressLoad: 0.2 };
      fly.brain.plasticity = fly.brain.plasticity || { learningRate: 0.36, noveltyBias: 0.48, socialBias: 0.5, riskBias: 0.42, persistence: 0.58 };
      fly.brain.rngState = Number(fly.brain.rngState || fly.brain.seed || hashText(fly.id)) >>> 0;
      fly.brain.fullConnectome = fly.brain.fullConnectome || {
        connected: false,
        lastSyncAt: 0,
        neuralStepsTotal: 0,
        activeNeurons: 0,
        activity: 0,
        locomotionX: 0,
        locomotionZ: 0,
        approachDrive: 0,
        avoidDrive: 0,
        socialDrive: 0,
        restDrive: 0,
        exploreDrive: 0,
        consumeDrive: 0,
        motorDrive: 0,
        confidence: 0,
        fullConnectome: false,
        neurons: 0,
        edges: 0,
        steppedThisSync: false,
      };
      fly.homeTier = Number(fly.homeTier || (fly.ownsHome ? 1 : 0));
      if (!Number.isFinite(fly.homeX) || !Number.isFinite(fly.homeZ)) {
        const base = location(fly.homeId);
        const n = Number(String(fly.id).replace(/\D/g, "")) || 1;
        const ring = 7 + (n % 5) * 3.2;
        const angle = (n * 2.399963229728653) % (Math.PI * 2);
        fly.homeX = base.x + Math.cos(angle) * ring;
        fly.homeZ = base.z + Math.sin(angle) * ring;
      }
      fly.brainDecision = fly.brainDecision || fly.action || "resting";
      fly.brainConfidence = Number.isFinite(fly.brainConfidence) ? fly.brainConfidence : 0.5;
      fly.traveling = Boolean(fly.traveling);
      fly.travelStartedAt = Number(fly.travelStartedAt || 0);
      fly.travelLastDistance = Number.isFinite(fly.travelLastDistance) ? fly.travelLastDistance : null;
      fly.travelStuckTicks = Number(fly.travelStuckTicks || 0);
      fly.travelGoalId = fly.travelGoalId || fly.targetLocationId || null;
      fly.smoking = Boolean(fly.smoking);
      fly.exercising = Boolean(fly.exercising);
      fly.sleeping = Boolean(fly.sleeping);
      fly.familyWaitYears = Number.isFinite(fly.familyWaitYears) ? fly.familyWaitYears : null;
      fly.familyReadiness = Number(fly.familyReadiness || 0);
      fly.thirst = Number.isFinite(fly.thirst) ? fly.thirst : 25;
      fly.caffeine = Number.isFinite(fly.caffeine) ? fly.caffeine : 0;
      fly.sleepDebt = Number.isFinite(fly.sleepDebt) ? fly.sleepDebt : 0;
      fly.transitMode = fly.transitMode || "walk";
      fly.transitPass = Boolean(fly.transitPass);
      fly.illness = fly.illness || null;
      fly.sickDays = Number(fly.sickDays || 0);
      fly.nightlifeLastDay = Number.isFinite(fly.nightlifeLastDay) ? fly.nightlifeLastDay : -1;
      fly.businessId = fly.businessId || null;
      fly.businessEquity = Number(fly.businessEquity || 0);
      fly.creditScore = Number(fly.creditScore || 650);
      fly.bankLoan = Number(fly.bankLoan || 0);
      fly.businessFailures = Number(fly.businessFailures || 0);
      fly.businessSuccesses = Number(fly.businessSuccesses || 0);
      fly.socialClass = fly.socialClass || "working";
    }
    emit("server_resumed", "Synthetic civilization resumed from PostgreSQL checkpoint.", {});
  } else {
    freshState();
    emit("world_created", `Synthetic civilization started with ${state.flies.length} flies.`, { seed: WORLD_SEED });
    await checkpoint(true);
  }
}

function ageOf(fly) {
  return Math.max(0, gameYears() - fly.bornAtGameYears);
}

function nearestCompatiblePartner(fly) {
  let best = null;
  let bestScore = -Infinity;
  for (const other of state.flies) {
    if (!other.alive || other.id === fly.id) continue;
    if (other.ageYears < 18 || other.ageYears > 85 || fly.ageYears < 18 || fly.ageYears > 85) continue;
    const dx = fly.x - other.x;
    const dz = fly.z - other.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 90) continue;
    const compatibility =
      (1 - Math.abs(fly.traits.sociability - other.traits.sociability)) * 0.35 +
      (1 - Math.abs(fly.traits.empathy - other.traits.empathy)) * 0.25 +
      other.traits.attractiveness * 0.25 +
      rand() * 0.15;
    if (compatibility > bestScore) {
      bestScore = compatibility;
      best = other;
    }
  }
  return bestScore > 0.55 ? best : null;
}


function neuralDrive(fly, key) {
  const fc = fly.brain?.fullConnectome;
  if (!fc?.connected) return 0;
  const value = Number(fc[key] || 0);
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0;
}

function applyFullConnectomeBias(fly, action, utility) {
  const fc = fly.brain?.fullConnectome;
  if (!fc?.connected) return utility;

  const approach = neuralDrive(fly, "approachDrive");
  const avoid = neuralDrive(fly, "avoidDrive");
  const social = neuralDrive(fly, "socialDrive");
  const rest = neuralDrive(fly, "restDrive");
  const explore = neuralDrive(fly, "exploreDrive");
  const consume = neuralDrive(fly, "consumeDrive");
  const motor = neuralDrive(fly, "motorDrive");

  let neural = 0;
  if (action.includes("food") || action.includes("meal") || action.includes("grocer")) neural += consume * 38;
  if (action.includes("social") || action.includes("cafe")) neural += social * 38;
  if (action.includes("rest") || action.includes("home") || action.includes("sleep")) neural += rest * 42;
  if (action.includes("walk") || action.includes("explor") || action.includes("exercise")) neural += explore * 30 + motor * 14;
  if (action.includes("work") || action.includes("school")) neural += approach * 28 + motor * 12;
  if (action.includes("care")) neural += avoid * 22 + approach * 10;
  if (action.includes("smoke")) neural += avoid * 15 + rest * 16;
  neural -= avoid * (action.includes("work") || action.includes("exercise") ? 10 : 0);

  return utility * 0.58 + neural;
}

function socialSignalFor(fly) {
  if (fly.partnerId) return 1;
  if (fly.flirtingWith) return 0.82;
  return clamp(1 - fly.loneliness / 130 + fly.traits.sociability * 0.35, 0, 1);
}

async function syncFullConnectomeBrains() {
  if (!state || neuralSyncBusy || Date.now() - lastNeuralSyncAt < NEURAL_SYNC_INTERVAL_MS) return;
  neuralSyncBusy = true;
  lastNeuralSyncAt = Date.now();

  try {
    const agents = state.flies
      .filter((fly) => fly.alive && fly.brain?.id)
      .map((fly) => {
        const target = fly.targetLocationId === fly.homeId
          ? { x: fly.homeX ?? fly.x, z: fly.homeZ ?? fly.z }
          : location(fly.targetLocationId);
        return {
          brain_id: fly.brain.id,
          parent_brain_ids: fly.brain.lineage?.parentBrainIds || [],
          hunger: fly.hunger,
          energy: fly.energy,
          stress: fly.stress,
          happiness: fly.happiness,
          excitement: fly.excitement,
          loneliness: fly.loneliness,
          health: fly.health,
          target_dx: (target?.x ?? fly.x) - fly.x,
          target_dz: (target?.z ?? fly.z) - fly.z,
          social_signal: socialSignalFor(fly),
          reward: clamp(fly.brain.dynamic?.rewardExpectation || 0, -1, 1),
          sleeping: fly.action?.includes("rest") && (gameClock().hour >= 22 || gameClock().hour < 6),
        };
      });

    if (!agents.length) return;

    const response = await fetch(`${FLYWIRE_BRAIN_URL}/civilization/brains/sync`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ agents }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`FlyWire worker HTTP ${response.status}`);
    const payload = await response.json();
    const outputs = Array.isArray(payload.outputs) ? payload.outputs : [];

    const byId = new Map(state.flies.map((fly) => [fly.brain?.id, fly]));
    for (const output of outputs) {
      const fly = byId.get(output.brain_id);
      if (!fly?.brain) continue;
      fly.brain.fullConnectome = {
        connected: true,
        lastSyncAt: Date.now(),
        neuralStepsTotal: Number(output.neural_steps_total || 0),
        activeNeurons: Number(output.active_neurons || 0),
        activity: Number(output.activity || 0),
        locomotionX: Number(output.locomotion_x || 0),
        locomotionZ: Number(output.locomotion_z || 0),
        approachDrive: Number(output.approach_drive || 0),
        avoidDrive: Number(output.avoid_drive || 0),
        socialDrive: Number(output.social_drive || 0),
        restDrive: Number(output.rest_drive || 0),
        exploreDrive: Number(output.explore_drive || 0),
        consumeDrive: Number(output.consume_drive || 0),
        motorDrive: Number(output.motor_drive || 0),
        confidence: Number(output.confidence || 0),
        fullConnectome: Boolean(output.full_connectome),
        neurons: Number(output.neurons || 0),
        edges: Number(output.edges || 0),
        steppedThisSync: Boolean(output.stepped_this_sync),
        regionActivity: output.region_activity || [],
      };
    }

    state.neuralBridge = {
      connected: true,
      topologyShared: Boolean(payload.topology_shared),
      independentDynamicState: Boolean(payload.independent_dynamic_state),
      registeredBrains: Number(payload.registered_brains || 0),
      steppedBrains: Number(payload.stepped_brains || 0),
      schedulerCursor: Number(payload.scheduler_cursor || 0),
      lastSyncAt: Date.now(),
    };
  } catch (error) {
    state.neuralBridge = {
      connected: false,
      error: String(error),
      lastSyncAt: Date.now(),
    };
  } finally {
    neuralSyncBusy = false;
  }
}

function isShiftHour(job, hour) {
  if (!job) return false;
  if (job.shiftStart <= job.shiftEnd) return hour >= job.shiftStart && hour < job.shiftEnd;
  return hour >= job.shiftStart || hour < job.shiftEnd;
}

function nearestTransitStation(x, z) {
  let best = null;
  let distance = Infinity;
  for (const loc of LOCATIONS) {
    if (loc.type !== "transit") continue;
    const d = Math.hypot(loc.x - x, loc.z - z);
    if (d < distance) {
      best = loc;
      distance = d;
    }
  }
  return { station: best, distance };
}

function chooseTravelMode(fly, dest) {
  const distance = Math.hypot(dest.x - fly.x, dest.z - fly.z);
  const danger = weatherDanger();
  if (distance < 38 && danger < 0.48) return "walk";
  if (fly.vehicle === "compact car" && fly.money > 1.2 && neuralDrive(fly, "avoidDrive") < 0.84) return "car";
  if (fly.vehicle === "scooter" && fly.money > 0.6 && distance < 150) return "scooter";
  const from = nearestTransitStation(fly.x, fly.z);
  const to = nearestTransitStation(dest.x, dest.z);
  if ((distance > 68 || danger >= 0.48) && from.station && to.station && fly.money >= 1.5) {
    if (!fly.transitPass) {
      fly.money -= 1.5;
      fly.expensesLifetime += 1.5;
      state.totalTransactions += 1;
    }
    return "metro";
  }
  return "walk";
}

function nightlifeOpen(clock) {
  return clock.hour >= 18 || clock.hour < 3;
}

function netWorth(fly) {
  const business = fly.businessId ? state.enterprises?.[fly.businessId] : null;
  const equity = business?.status === "operating"
    ? Math.max(0, Number(business.cash || 0) + Number(business.assetValue || 0) - Number(business.loanBalance || 0))
    : 0;
  fly.businessEquity = equity;
  return fly.money + fly.savings + fly.homeEquity + equity - fly.debt - fly.bankLoan;
}

function updateSocialClass(fly) {
  const worth = netWorth(fly);
  const prev = fly.socialClass;
  fly.socialClass =
    worth < 0 ? "distressed" :
    worth < 350 ? "low income" :
    worth < 1800 ? "working" :
    worth < 6500 ? "middle" :
    worth < 18000 ? "affluent" :
    worth < 60000 ? "wealthy" : "elite";
  if (prev && prev !== fly.socialClass && brainRand(fly) < 0.08) {
    emit("class_mobility", `${fly.id} moved from ${prev} to ${fly.socialClass} class.`, {
      flyId: fly.id,
      from: prev,
      to: fly.socialClass,
      netWorth: worth,
    });
  }
  return worth;
}

function startupReadiness(fly) {
  if (fly.ageYears < 18 || fly.ageYears > 75 || fly.businessId) return 0;
  const approach = neuralDrive(fly, "approachDrive");
  const avoid = neuralDrive(fly, "avoidDrive");
  const explore = neuralDrive(fly, "exploreDrive");
  const liquidity = clamp((fly.money + fly.savings) / 2200, 0, 1);
  const credit = clamp((fly.creditScore - 450) / 400, 0, 1);
  const failurePenalty = Math.min(0.35, fly.businessFailures * 0.08);
  return clamp(
    fly.traits.ambition * 0.25 +
    fly.traits.risk * 0.20 +
    approach * 0.18 +
    explore * 0.12 +
    liquidity * 0.10 +
    credit * 0.10 +
    fly.brain.plasticity.persistence * 0.08 -
    avoid * 0.16 -
    fly.stress / 100 * 0.08 -
    failurePenalty,
    0,
    1,
  );
}

function chooseStartupType(fly) {
  const scored = STARTUP_TYPES.map((type) => {
    const familiar = Number(fly.brain.memory.locationReward[type.locationId] || 0);
    const sectorRisk = type.sector === "nightlife" || type.sector === "manufacturing" ? 0.12 : 0.04;
    return {
      type,
      score:
        fly.traits.ambition * 0.25 +
        fly.traits.risk * sectorRisk +
        neuralDrive(fly, "exploreDrive") * 0.18 +
        neuralDrive(fly, "approachDrive") * 0.16 +
        familiar * 0.08 +
        brainRange(fly, -0.08, 0.08),
    };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.type || STARTUP_TYPES[0];
}

function attemptStartup(fly) {
  if (fly.businessId || fly.currentLocationId !== "bank") return;
  const readiness = startupReadiness(fly);
  if (readiness < 0.56) return;

  const type = chooseStartupType(fly);
  const ownCapital = Math.min(type.baseCapital * 0.55, fly.money + fly.savings * 0.45);
  const needed = Math.max(0, type.baseCapital - ownCapital);
  const neuralRisk = fly.traits.risk * 0.45 + neuralDrive(fly, "approachDrive") * 0.35 - neuralDrive(fly, "avoidDrive") * 0.25;
  const approvalScore =
    fly.creditScore / 850 * 0.42 +
    fly.traits.ambition * 0.16 +
    fly.traits.thrift * 0.12 +
    Math.max(0, neuralRisk) * 0.14 +
    state.economy.index * 0.10 -
    fly.debt / 5000 * 0.08;

  fly.brainDecision = `requesting Hansdrex Bank funding for ${type.sector}`;
  fly.brainConfidence = readiness;

  if (needed > 0 && (approvalScore < 0.48 || state.bank.reserves < needed)) {
    fly.creditScore = Math.max(300, fly.creditScore - 4);
    brainRemember(fly, "loan_rejected", { sector: type.sector, needed, approvalScore });
    if (brainRand(fly) < 0.18) {
      emit("loan_rejected", `${fly.id} was denied a Hansdrex Bank startup loan.`, {
        flyId: fly.id, sector: type.sector, approvalScore,
      });
    }
    return;
  }

  const takeFromCash = Math.min(fly.money, ownCapital);
  fly.money -= takeFromCash;
  const restCapital = Math.max(0, ownCapital - takeFromCash);
  fly.savings = Math.max(0, fly.savings - restCapital);
  if (needed > 0) {
    fly.bankLoan += needed;
    state.bank.reserves -= needed;
    state.bank.loansOutstanding += needed;
  }

  const id = `BIZ-${String(state.nextEnterpriseId++).padStart(5, "0")}`;
  state.enterprises[id] = {
    id,
    name: `Hansdrex ${type.sector[0].toUpperCase() + type.sector.slice(1)} ${id.slice(-3)}`,
    ownerId: fly.id,
    sector: type.sector,
    locationId: type.locationId,
    foundedDay: gameClock().day,
    cash: type.baseCapital,
    assetValue: type.baseCapital * 0.55,
    loanBalance: needed,
    employees: [],
    revenueLifetime: 0,
    expensesLifetime: 0,
    profitToday: 0,
    margin: type.margin,
    reputation: 0.5,
    status: "operating",
    badDays: 0,
  };
  fly.businessId = id;
  fly.jobId = null;
  fly.jobTitle = "founder / owner";
  fly.wage = 0;
  fly.happiness = clamp(fly.happiness + 14);
  fly.stress = clamp(fly.stress + 8);
  emit("startup", `${fly.id} founded ${state.enterprises[id].name} with ${needed.toFixed(0)} ${CURRENCY_CODE} bank financing.`, {
    flyId: fly.id, businessId: id, sector: type.sector, loan: needed,
  });
}

function brainChooseAction(fly, clock) {
  const age = fly.ageYears;
  updateBrainDynamics(fly);
  const brain = fly.brain;
  const candidates = [];
  const add = (id, action, utility) => {
    const learned = Number(brain.memory.locationReward[id] || 0) * 4;
    const novelty = brain.dynamic.curiosity * brain.plasticity.noveltyBias * brainRange(fly, -1.2, 2.4);
    const noise = brainRange(fly, -2.5, 2.5);
    const combined = applyFullConnectomeBias(fly, action, utility + learned + novelty + noise);
    candidates.push({ id, action, utility: combined });
  };

  const circadianSleep = clock.hour >= 22 || clock.hour < 6;
  add(fly.homeId, "sleeping", (100 - fly.energy) * 0.88 + fly.sleepDebt * 0.72 + (circadianSleep ? 82 : -12) - fly.caffeine * 0.42);
  add(fly.homeId, "resting at home", (100 - fly.energy) * 0.42 + fly.stress * 0.20 + (circadianSleep ? 20 : 0));
  add("market", "buying food", fly.hunger * 0.8 + (fly.money > 5 ? 8 : -35));
  add("cafe", "drinking Hansdrex coffee", (100 - fly.energy) * 0.58 + fly.sleepDebt * 0.46 + fly.thirst * 0.18 + (fly.money > 5 ? 8 : -30));
  add("tea-house", "drinking tea", fly.thirst * 0.48 + fly.stress * 0.28 + fly.loneliness * 0.12);
  add("restaurant", "eating dinner", fly.hunger * 0.66 + fly.happiness * 0.08 + (fly.money > 12 ? 8 : -28));
  add("grocery", "shopping groceries", fly.hunger * 0.68 + fly.traits.thrift * 13);
  add("bakery", "getting a meal", fly.hunger * 0.55 + fly.excitement * 0.12);
  add("cafe", "socializing", fly.loneliness * 0.62 + fly.traits.sociability * 28 + fly.excitement * 0.18 + brain.plasticity.socialBias * 12);
  add("park", "taking a walk", fly.stress * 0.55 + fly.traits.resilience * 15);
  add("gym", "exercising", fly.stress * 0.34 + (100 - fly.health) * 0.25 + fly.traits.ambition * 18);
  add("clinic", "seeking care", (100 - fly.health) * 1.05 + (fly.illness ? 55 : 0));
  add("hospital-central", "going to Hansdrex hospital", (100 - fly.health) * 1.28 + (fly.illness ? 72 : 0));
  add("corner-shop", "shopping", fly.excitement * 0.28 + Math.min(25, fly.money / 30));

  if (fly.jobId && age >= 18 && age <= 75) {
    const job = JOBS.find((j) => j.id === fly.jobId);
    if (job && isShiftHour(job, clock.hour)) {
      add(job.locationId, "working", 88 + fly.traits.ambition * 25 - fly.stress * 0.25 - fly.sleepDebt * 0.18);
    }
  }

  const danger = weatherDanger();
  if (danger > 0.46) {
    add(fly.homeId, "sheltering from bad weather", danger * 110 + fly.traits.risk * -12 + neuralDrive(fly, "avoidDrive") * 36);
    if (fly.currentLocationId !== "metro-central") {
      add("metro-central", "taking sheltered metro", danger * 72 + neuralDrive(fly, "avoidDrive") * 24);
    }
  }

  const sunset = sunsetQuality();
  if (sunset > 0.48 && !fly.illness && fly.energy > 25 && fly.stress > 22) {
    add("park", "watching Hansdrex sunset", sunset * 72 + fly.stress * 0.24 + neuralDrive(fly, "exploreDrive") * 18);
  }

  const startup = startupReadiness(fly);
  if (startup > 0.50 && fly.money + fly.savings > 180) {
    add("bank", "planning a business at Hansdrex Bank", startup * 105 + fly.traits.ambition * 18);
  }

  if (nightlifeOpen(clock) && age >= 18 && fly.money > 8 && fly.energy > 18) {
    const nightDrive = fly.stress * 0.35 + fly.loneliness * 0.32 + fly.excitement * 0.28 +
      fly.traits.sociability * 20 + neuralDrive(fly, "socialDrive") * 24 - fly.sleepDebt * 0.30;
    add("night-market", "exploring Hansdrex Night Market", nightDrive * 0.92);
    add("arcade", "playing at Hansdrex Arcade", nightDrive * 0.78 + brain.plasticity.noveltyBias * 12);
    add("music-hall", "going to a Hansdrex concert", nightDrive * 0.88 + fly.excitement * 0.12);
    add("nightclub", "nightclubbing", nightDrive + fly.traits.risk * 15);
    add("rooftop", "relaxing at Hansdrex Sky Lounge", nightDrive * 0.72 + fly.traits.ambition * 10);
    add("cinema", "watching a movie", fly.stress * 0.31 + fly.excitement * 0.24 + fly.loneliness * 0.15);
  }

  if (fly.stress > 76 && fly.traits.resilience < 0.45) {
    add("park", "smoke break", 42 + fly.stress * 0.5 + brain.plasticity.riskBias * 8);
  }

  if (age < 18 && clock.hour >= 8 && clock.hour < 15) {
    add("school", "at school", 92);
  }

  const explorationDrive =
    brain.dynamic.curiosity * 36 +
    brain.plasticity.noveltyBias * 28 +
    neuralDrive(fly, "exploreDrive") * 34 +
    fly.excitement * 0.16 -
    fly.stress * 0.08 -
    Math.max(0, fly.sleepDebt || 0) * 0.14;

  if (explorationDrive > 24) {
    const eligible = LOCATIONS.filter((loc) =>
      loc.id !== fly.currentLocationId &&
      loc.id !== fly.homeId &&
      loc.type !== "home" &&
      !(loc.type === "health" && !fly.illness && fly.health > 72)
    );
    const sampleCount = Math.min(7, eligible.length);
    const picked = new Set();
    for (let i = 0; i < sampleCount; i += 1) {
      const idx = Math.floor(brainRand(fly) * eligible.length);
      const loc = eligible[idx];
      if (!loc || picked.has(loc.id)) continue;
      picked.add(loc.id);
      const distance = Math.hypot(loc.x - fly.x, loc.z - fly.z);
      const learned = Number(brain.memory.locationReward[loc.id] || 0);
      const typeBonus =
        loc.type === "nightlife" && nightlifeOpen(clock) ? 14 :
        loc.type === "social" ? 8 :
        loc.type === "food" && fly.hunger > 45 ? 12 :
        loc.type === "transit" ? 2 :
        loc.type === "job" ? 1 : 4;
      add(
        loc.id,
        `exploring ${loc.name}`,
        explorationDrive + typeBonus + learned * 8 - Math.min(18, distance / 24),
      );
    }
  }

  candidates.sort((a, b) => b.utility - a.utility);
  const chosen = candidates[0];
  fly.brainDecision = chosen.action;
  fly.brainConfidence = clamp((chosen.utility - (candidates[1]?.utility ?? 0) + 20) / 60, 0, 1);
  brain.decisionCount += 1;
  brain.lastDecision = chosen.action;
  brain.lastConfidence = fly.brainConfidence;
  brainRemember(fly, "decision", {
    action: chosen.action,
    destination: chosen.id,
    confidence: fly.brainConfidence,
  });
  return chosen;
}

function chooseDestination(fly, clock) {
  if (!fly.alive) return;
  const distToTarget = Math.hypot(fly.targetX - fly.x, fly.targetZ - fly.z);

  // Once a fly commits to a destination, keep that decision until arrival.
  if (fly.traveling && distToTarget > 1.0) return;
  if (!fly.traveling && fly.actionUntil > state.simulationAgeSeconds) return;

  const chosen = brainChooseAction(fly, clock);
  fly.targetLocationId = chosen.id;
  fly.action = chosen.action;
  fly.smoking = chosen.action === "smoke break";
  fly.exercising = chosen.action === "exercising";
  fly.sleeping = chosen.action === "sleeping";

  const dest = chosen.id === fly.homeId
    ? { ...location(fly.homeId), x: fly.homeX ?? location(fly.homeId).x, z: fly.homeZ ?? location(fly.homeId).z }
    : location(chosen.id);
  const p = jittered(dest, chosen.id === fly.homeId ? 1.4 : 3.8);
  fly.targetX = p.x;
  fly.targetZ = p.z;
  fly.transitMode = chooseTravelMode(fly, dest);
  fly.traveling = true;
  fly.travelStartedAt = state.simulationAgeSeconds;
  fly.travelLastDistance = Math.hypot(fly.targetX - fly.x, fly.targetZ - fly.z);
  fly.travelStuckTicks = 0;
  fly.travelGoalId = chosen.id;
  fly.actionUntil = 0;
}

function moveFly(fly) {
  const dx = fly.targetX - fly.x;
  const dz = fly.targetZ - fly.z;
  const dist = Math.hypot(dx, dz);

  if (dist <= 0.85) {
    fly.vx = 0;
    fly.vz = 0;
    fly.x = fly.targetX;
    fly.z = fly.targetZ;
    fly.currentLocationId = fly.targetLocationId;
    if (fly.traveling) {
      fly.traveling = false;
      fly.travelGoalId = null;
      fly.travelLastDistance = null;
      fly.travelStuckTicks = 0;
      fly.actionUntil = state.simulationAgeSeconds + brainRange(fly, 1200, 4200);
      brainRemember(fly, "arrived", {
        locationId: fly.currentLocationId,
        action: fly.action,
        transitMode: fly.transitMode,
      });
    }
    return;
  }

  const vehicleBoost =
    fly.transitMode === "metro" ? 5.8 :
    fly.transitMode === "car" ? 2.8 :
    fly.transitMode === "scooter" ? 2.15 : 1;

  const fc = fly.brain?.fullConnectome;
  const neuralMotor = fc?.connected ? clamp(Number(fc.motorDrive || 0), 0, 1) : 0.5;
  const baseSpeed = (0.42 + fly.energy / 320 + neuralMotor * 0.42) * vehicleBoost;
  const danger = weatherDanger();
  const weatherFactor =
    fly.transitMode === "metro" ? 1 :
    fly.transitMode === "car" ? (1 - danger * 0.18) :
    fly.transitMode === "scooter" ? (1 - danger * 0.42) :
    (1 - danger * 0.58);

  // Goal direction is authoritative. Neural motor output may alter effort,
  // but can no longer rotate the fly away from its committed destination.
  const ux = dx / dist;
  const uz = dz / dist;
  const step = Math.min(Math.max(0.08, baseSpeed * weatherFactor), dist);
  fly.vx = ux * step;
  fly.vz = uz * step;
  fly.x += fly.vx;
  fly.z += fly.vz;
  fly.y = 1.4 + Math.sin(state.simulationAgeSeconds * 0.018 + Number(fly.id.slice(-3))) * 0.3;

  const remaining = Math.hypot(fly.targetX - fly.x, fly.targetZ - fly.z);
  if (Number.isFinite(fly.travelLastDistance)) {
    if (remaining >= fly.travelLastDistance - 0.02) fly.travelStuckTicks += 1;
    else fly.travelStuckTicks = 0;
  }
  fly.travelLastDistance = remaining;

  if (fly.travelStuckTicks >= 8) {
    brainRemember(fly, "route_recovery", {
      goal: fly.travelGoalId,
      remaining,
      mode: fly.transitMode,
    });
    const dest = fly.targetLocationId === fly.homeId
      ? { ...location(fly.homeId), x: fly.homeX ?? location(fly.homeId).x, z: fly.homeZ ?? location(fly.homeId).z }
      : location(fly.targetLocationId);
    const p = jittered(dest, fly.targetLocationId === fly.homeId ? 1.0 : 2.2);
    fly.targetX = p.x;
    fly.targetZ = p.z;
    fly.travelLastDistance = Math.hypot(fly.targetX - fly.x, fly.targetZ - fly.z);
    fly.travelStuckTicks = 0;
  }
}

function productionAndRetail(fly, clock) {
  if (!fly.alive) return;
  const business = state.businesses?.[fly.currentLocationId];

  if (fly.jobId === "farm" && fly.currentLocationId === "farm" && fly.action === "working") {
    state.businesses.farm.inventory += 0.08 * (0.5 + fly.traits.ambition);
    if (state.businesses.farm.inventory > 80 && rand() < 0.025) {
      const moved = Math.min(35, state.businesses.farm.inventory);
      state.businesses.farm.inventory -= moved;
      state.businesses.market.inventory += moved * 0.45;
      state.businesses.grocery.inventory += moved * 0.35;
      state.businesses.bakery.inventory += moved * 0.20;
    }
  }

  if (["market","grocery","bakery"].includes(fly.currentLocationId) && fly.hunger > 28 && fly.money > 3 && business?.inventory > 0 && rand() < 0.09) {
    const price = business.price * randRange(0.9, 1.08);
    fly.money -= price;
    fly.expensesLifetime += price;
    fly.hunger = clamp(fly.hunger - randRange(24, 48));
    fly.happiness = clamp(fly.happiness + 2);
    business.cash += price;
    business.inventory = Math.max(0, business.inventory - 1);
    state.totalTransactions += 1;
  }

  if (fly.currentLocationId === "gym" && fly.action === "exercising") {
    fly.stress = clamp(fly.stress - 0.22);
    fly.health = clamp(fly.health + 0.025);
    fly.energy = clamp(fly.energy - 0.06);
  }

  if (fly.smoking) {
    fly.stress = clamp(fly.stress - 0.16);
    fly.health = clamp(fly.health - 0.018);
  }
}

function payAndFinance(fly, clock) {
  const day = clock.day;
  if (clock.hour === 17 && clock.minute < 2 && fly.jobId && fly.lastPaidDay !== day && fly.ageYears >= 18 && fly.ageYears <= 75) {
    const base = fly.wage * 8;
    const bonus = base * fly.traits.ambition * randRange(0, 0.18);
    const gross = base + bonus;
    fly.money += gross;
    fly.salaryEarnedToday += gross;
    fly.salaryLifetime += gross;
    fly.lastPaidDay = day;
    fly.happiness = clamp(fly.happiness + 3);
    state.totalTransactions += 1;
    if (rand() < 0.05) emit("salary", `${fly.id} received salary ${gross.toFixed(1)} FC.`, { flyId: fly.id, amount: gross });
  }

  if (clock.hour === 0 && clock.minute < 2 && fly.lastRentDay !== day) {
    const rent = fly.ownsHome ? 3 : 14;
    const utilities = 4;
    const expense = rent + utilities;
    if (fly.money >= expense) {
      fly.money -= expense;
    } else {
      fly.debt += expense - Math.max(0, fly.money);
      fly.money = 0;
      fly.stress = clamp(fly.stress + 8);
    }
    fly.expensesLifetime += expense;
    fly.lastRentDay = day;

    const saveTarget = Math.max(0, fly.money * fly.traits.thrift * 0.22);
    fly.money -= saveTarget;
    fly.savings += saveTarget;

    if (fly.debt > 0 && fly.savings > 60) {
      const payment = Math.min(fly.debt, fly.savings * 0.15);
      fly.debt -= payment;
      fly.savings -= payment;
    }

    if (!fly.ownsHome && fly.savings > 4500 && fly.traits.ambition > 0.52) {
      fly.savings -= 3200;
      fly.ownsHome = true;
      fly.homeEquity = 3200;
      fly.homeTier = 1;
      emit("home_purchase", `${fly.id} bought a small home.`, { flyId: fly.id, tier: fly.homeTier });
    }

    if (fly.ownsHome && fly.homeTier < 3 && fly.savings > 6500 * fly.homeTier && rand() < 0.08) {
      const upgradeCost = 2600 + fly.homeTier * 2200;
      fly.savings -= upgradeCost;
      fly.homeEquity += upgradeCost;
      fly.homeTier += 1;
      emit("home_upgrade", `${fly.id} expanded their home to tier ${fly.homeTier}.`, { flyId: fly.id, tier: fly.homeTier });
    }

    if (!fly.vehicle && fly.savings > 900 && fly.traits.risk + fly.traits.ambition > 1.0 && rand() < 0.25) {
      fly.savings -= 650;
      fly.vehicle = rand() < 0.65 ? "compact car" : "scooter";
      emit("vehicle_purchase", `${fly.id} bought a ${fly.vehicle}.`, { flyId: fly.id, vehicle: fly.vehicle });
    }
  }
}

function romanceUtility(a, b) {
  const neuralA = neuralDrive(a, "socialDrive") * 0.20 + neuralDrive(a, "approachDrive") * 0.12 - neuralDrive(a, "avoidDrive") * 0.10;
  const compatibility =
    (1 - Math.abs(a.traits.sociability - b.traits.sociability)) * 0.18 +
    (1 - Math.abs(a.traits.empathy - b.traits.empathy)) * 0.22 +
    b.traits.attractiveness * 0.18 +
    a.traits.sociability * 0.10 +
    a.traits.empathy * 0.10 +
    (a.loneliness / 100) * 0.10 +
    (a.excitement / 100) * 0.06 +
    neuralA;
  const stressPenalty = (a.stress / 100) * 0.22;
  return clamp(compatibility - stressPenalty, 0, 1);
}

function socialLife(fly, clock) {
  if (!fly.alive) return;
  if (!["social", "food"].includes(location(fly.currentLocationId).type)) return;
  if (state.simulationAgeSeconds - fly.lastSocialTick < 600) return;
  fly.lastSocialTick = state.simulationAgeSeconds;

  const partner = fly.partnerId ? state.flies.find((f) => f.id === fly.partnerId && f.alive) : null;

  if (partner) {
    const closeness = 4 + fly.traits.empathy * 5;
    fly.affection = clamp(fly.affection + randRange(-2, closeness), 0, 100);
    fly.loneliness = clamp(fly.loneliness - 8);
    fly.happiness = clamp(fly.happiness + 2.5);
    fly.excitement = clamp(fly.excitement + randRange(-3, 5));
    if (fly.affection < 12 && fly.stress > 70 && rand() < 0.08) {
      const old = fly.partnerId;
      fly.partnerId = null;
      fly.relationshipSince = null;
      fly.familyWaitYears = null;
      fly.familyReadiness = 0;
      fly.affection = 0;
      const other = state.flies.find((f) => f.id === old);
      if (other?.partnerId === fly.id) {
        other.partnerId = null;
        other.relationshipSince = null;
        other.familyWaitYears = null;
        other.familyReadiness = 0;
        other.affection = 0;
      }
      fly.happiness = clamp(fly.happiness - 15);
      fly.loneliness = clamp(fly.loneliness + 20);
      emit("breakup", `${fly.id} and ${old} broke up.`, { flyId: fly.id, partnerId: old });
    }
    return;
  }

  if (fly.ageYears < 18 || fly.ageYears > 85) return;
  const candidate = nearestCompatiblePartner(fly);
  if (!candidate || candidate.partnerId) return;
  fly.flirtingWith = candidate.id;
  candidate.flirtingWith = fly.id;
  fly.excitement = clamp(fly.excitement + 9);
  candidate.excitement = clamp(candidate.excitement + 7);

  const desireA = romanceUtility(fly, candidate);
  const desireB = romanceUtility(candidate, fly);
  fly.brainDecision = `evaluating romance with ${candidate.id}`;
  fly.brainConfidence = desireA;
  candidate.brainDecision = `evaluating romance with ${fly.id}`;
  candidate.brainConfidence = desireB;

  if (rand() < 0.08 + Math.max(desireA, desireB) * 0.12) {
    emit("flirt", `${fly.id} and ${candidate.id} are flirting at ${location(fly.currentLocationId).name}.`, { flyId: fly.id, otherId: candidate.id, desireA, desireB });
  }

  if (desireA > 0.54 && desireB > 0.54 && rand() < 0.04 + ((desireA + desireB) / 2) * 0.09) {
    fly.partnerId = candidate.id;
    candidate.partnerId = fly.id;
    fly.affection = candidate.affection = randRange(45, 72);
    fly.relationshipSince = candidate.relationshipSince = gameYears();

    const waitPreference = (person, other) => {
      const approach = neuralDrive(person, "approachDrive");
      const avoid = neuralDrive(person, "avoidDrive");
      const social = neuralDrive(person, "socialDrive");
      const rest = neuralDrive(person, "restDrive");
      const security = clamp((person.money + person.savings - person.debt) / 4000, 0, 1);
      const patience = person.brain.plasticity.persistence;
      const risk = person.traits.risk;
      const familyDrive = clamp(
        person.traits.empathy * 0.18 +
        person.traits.fertility * 0.17 +
        social * 0.16 +
        approach * 0.15 +
        security * 0.12 +
        person.happiness / 100 * 0.10 -
        avoid * 0.15 -
        person.stress / 100 * 0.10,
        0,
        1,
      );
      const baseWait = 0.06 + patience * 0.42 + (1 - risk) * 0.18 + (1 - familyDrive) * 0.42 + rest * 0.08;
      return clamp(baseWait + brainRange(person, -0.06, 0.10), 0.03, 1.15);
    };
    fly.familyWaitYears = waitPreference(fly, candidate);
    candidate.familyWaitYears = waitPreference(candidate, fly);
    fly.familyReadiness = candidate.familyReadiness = 0;
    fly.flirtingWith = candidate.flirtingWith = null;
    fly.happiness = clamp(fly.happiness + 15);
    candidate.happiness = clamp(candidate.happiness + 15);
    fly.loneliness = clamp(fly.loneliness - 30);
    candidate.loneliness = clamp(candidate.loneliness - 30);
    fly.brainDecision = `chose relationship with ${candidate.id}`;
    candidate.brainDecision = `chose relationship with ${fly.id}`;
    emit("relationship", `${fly.id} and ${candidate.id} mutually chose a relationship.`, { flyId: fly.id, partnerId: candidate.id, desireA, desireB });
  } else if ((desireA < 0.38 || desireB < 0.38) && rand() < 0.18) {
    fly.flirtingWith = null;
    candidate.flirtingWith = null;
    fly.brainDecision = `did not choose relationship with ${candidate.id}`;
    candidate.brainDecision = `did not choose relationship with ${fly.id}`;
    emit("romance_rejected", `${fly.id} and ${candidate.id} did not mutually choose a relationship.`, { flyId: fly.id, otherId: candidate.id, desireA, desireB });
  }
}

function reproduction(fly) {
  if (!fly.alive || fly.sex !== "F" || fly.pregnancyDueAt) return;
  if (!fly.partnerId || fly.ageYears < 18 || fly.ageYears > 52) return;
  const partner = state.flies.find((f) => f.id === fly.partnerId && f.alive);
  if (!partner || partner.sex !== "M" || partner.ageYears < 18 || partner.ageYears > 75) return;
  if (state.flies.filter((f) => f.alive).length >= MAX_POPULATION) return;

  const relationshipYears = Math.max(0, gameYears() - Number(fly.relationshipSince || gameYears()));
  const waitA = Number(fly.familyWaitYears ?? 0.25);
  const waitB = Number(partner.familyWaitYears ?? 0.25);
  const mutualWait = Math.max(waitA, waitB);

  const financialSecurity = clamp(
    ((fly.money + fly.savings - fly.debt) + (partner.money + partner.savings - partner.debt)) / 6500,
    0,
    1,
  );
  const housingSecurity = (fly.ownsHome || partner.ownsHome) ? 1 : 0.35;
  const affection = clamp((fly.affection + partner.affection) / 200, 0, 1);
  const health = clamp((fly.health + partner.health) / 200, 0, 1);
  const stressPenalty = clamp((fly.stress + partner.stress) / 200, 0, 1);
  const fertility = clamp((fly.traits.fertility + partner.traits.fertility) / 2, 0, 1);

  const neuralA =
    neuralDrive(fly, "socialDrive") * 0.24 +
    neuralDrive(fly, "approachDrive") * 0.22 -
    neuralDrive(fly, "avoidDrive") * 0.24 +
    neuralDrive(fly, "restDrive") * 0.05;
  const neuralB =
    neuralDrive(partner, "socialDrive") * 0.24 +
    neuralDrive(partner, "approachDrive") * 0.22 -
    neuralDrive(partner, "avoidDrive") * 0.24 +
    neuralDrive(partner, "restDrive") * 0.05;

  const timeMaturity = clamp(relationshipYears / Math.max(0.03, mutualWait), 0, 1.4);
  const readinessA = clamp(
    timeMaturity * 0.24 +
    affection * 0.20 +
    financialSecurity * 0.12 +
    housingSecurity * 0.07 +
    health * 0.10 +
    fertility * 0.08 +
    neuralA -
    stressPenalty * 0.16 -
    fly.children.length * 0.04,
    0,
    1,
  );
  const readinessB = clamp(
    timeMaturity * 0.24 +
    affection * 0.20 +
    financialSecurity * 0.12 +
    housingSecurity * 0.07 +
    health * 0.10 +
    fertility * 0.08 +
    neuralB -
    stressPenalty * 0.16 -
    partner.children.length * 0.04,
    0,
    1,
  );

  fly.familyReadiness = readinessA;
  partner.familyReadiness = readinessB;

  if (relationshipYears < mutualWait || readinessA < 0.58 || readinessB < 0.58) return;
  if (fly.health < 42 || partner.health < 42 || fly.stress > 88 || partner.stress > 88) return;

  fly.brainDecision = `considering a child with ${partner.id}`;
  partner.brainDecision = `considering a child with ${fly.id}`;
  fly.brainConfidence = readinessA;
  partner.brainConfidence = readinessB;

  const conceptionChance =
    0.00016 *
    (0.45 + fertility) *
    (0.50 + (readinessA + readinessB) / 2) *
    (0.65 + Math.min(0.7, relationshipYears));

  if (brainRand(fly) < conceptionChance && brainRand(partner) < 0.55 + readinessB * 0.35) {
    fly.pregnancyBy = partner.id;
    fly.pregnancyDueAt = gameYears() + 0.72;
    brainRemember(fly, "family_decision", {
      partnerId: partner.id,
      relationshipYears,
      waitYears: mutualWait,
      readiness: readinessA,
    });
    brainRemember(partner, "family_decision", {
      partnerId: fly.id,
      relationshipYears,
      waitYears: mutualWait,
      readiness: readinessB,
    });
    emit("pregnancy", `${fly.id} and ${partner.id} mutually chose to start a family after ${relationshipYears.toFixed(2)} relationship years.`, {
      flyId: fly.id,
      partnerId: partner.id,
      relationshipYears,
      mutualWait,
      readinessA,
      readinessB,
    });
  }
}

function completePregnancy(fly) {
  if (!fly.pregnancyDueAt || gameYears() < fly.pregnancyDueAt) return;
  const father = state.flies.find((f) => f.id === fly.pregnancyBy);
  fly.pregnancyDueAt = null;
  const fatherId = fly.pregnancyBy;
  fly.pregnancyBy = null;
  if (!father || !father.alive || state.flies.filter((f) => f.alive).length >= MAX_POPULATION) return;

  const litter = rand() < 0.14 ? 2 : 1;
  for (let i = 0; i < litter && state.flies.filter((f) => f.alive).length < MAX_POPULATION; i += 1) {
    const child = createFly(state.flies.length, [fly, father]);
    state.flies.push(child);
    fly.children.push(child.id);
    father.children.push(child.id);
    state.births += 1;
    state.generation = Math.max(state.generation, child.generation);
    emit("birth", `${child.id} / ${child.brain.id} was born to ${fly.id} and ${fatherId} with a new independent brain instance.`, {
      childId: child.id,
      childBrainId: child.brain.id,
      motherId: fly.id,
      fatherId,
      parentBrainIds: child.brain.lineage.parentBrainIds,
    });
  }
}

function mentalHealthAndMortality(fly) {
  if (!fly.alive) return;
  const oldStress = fly.stress;
  const support = (fly.partnerId ? 22 : 0) + Math.min(25, fly.friends.length * 4);
  const debtPressure = Math.min(25, fly.debt / 80);
  const unemploymentPressure = !fly.jobId && fly.ageYears >= 18 && fly.ageYears <= 70 ? 5 : 0;

  fly.stress = clamp(
    fly.stress +
    fly.hunger * 0.0016 +
    debtPressure * 0.003 +
    unemploymentPressure * 0.002 -
    fly.traits.resilience * 0.07 -
    support * 0.002,
  );
  fly.happiness = clamp(
    fly.happiness +
    (fly.partnerId ? 0.025 : -0.01) +
    fly.excitement * 0.0004 -
    fly.stress * 0.0007 -
    fly.loneliness * 0.0005,
  );
  fly.loneliness = clamp(fly.loneliness + (fly.partnerId ? -0.03 : 0.018) - fly.traits.sociability * 0.008);
  fly.excitement = clamp(fly.excitement - 0.02);

  fly.mentalHealthCrisis = fly.stress > 92 && fly.happiness < 12 && fly.loneliness > 70;

  if (fly.mentalHealthCrisis && rand() < 0.000006 && fly.traits.resilience < 0.55 && support < 18) {
    fly.alive = false;
    fly.causeOfDeath = "suicide";
    state.deaths += 1;
    emit("death", `${fly.id} died after a severe mental-health crisis.`, { flyId: fly.id, cause: "suicide" });
    return;
  }

  const ageRisk = fly.ageYears > 82 ? (fly.ageYears - 82) * 0.000004 : 0;
  const healthRisk = fly.health < 25 ? (25 - fly.health) * 0.000006 : 0;
  if (fly.ageYears >= 100 || rand() < ageRisk + healthRisk) {
    fly.alive = false;
    fly.causeOfDeath = fly.ageYears >= 100 ? "old age" : "natural causes";
    state.deaths += 1;
    emit("death", `${fly.id} died at age ${fly.ageYears.toFixed(1)}.`, { flyId: fly.id, cause: fly.causeOfDeath });
    return;
  }

  const danger = weatherDanger();
  if (fly.traveling && danger > 0.35 && fly.transitMode !== "metro") {
    const exposure =
      fly.transitMode === "car" ? 0.22 :
      fly.transitMode === "scooter" ? 1.0 : 0.72;
    const weatherAccidentRisk = danger * exposure * 0.0000055;
    if (brainRand(fly) < weatherAccidentRisk) {
      const severe = brainRand(fly) < 0.08 + danger * 0.16 + fly.traits.risk * 0.08;
      if (severe) {
        fly.alive = false;
        fly.causeOfDeath = state.weather?.condition === "thunderstorm"
          ? "storm accident"
          : "weather-related accident";
        state.deaths += 1;
        emit("weather_death", `${fly.id} died in a ${weatherLabel()} travel accident.`, {
          flyId: fly.id,
          cause: fly.causeOfDeath,
          weather: state.weather,
        });
        return;
      }
      fly.health = clamp(fly.health - brainRange(fly, 12, 38));
      fly.stress = clamp(fly.stress + 18);
      fly.targetLocationId = "hospital-central";
      const hospital = jittered(location("hospital-central"), 2);
      fly.targetX = hospital.x;
      fly.targetZ = hospital.z;
      fly.traveling = true;
      fly.travelGoalId = "hospital-central";
      fly.action = "injured by weather";
      emit("weather_injury", `${fly.id} was injured while traveling in ${weatherLabel()}.`, {
        flyId: fly.id,
        weather: state.weather,
      });
    }
  }

  if ((Math.abs(fly.vx) + Math.abs(fly.vz)) > 0.02) {
    const trafficRisk = fly.vehicle ? 0.0000035 : 0.0000008;
    const stressRisk = fly.stress > 80 ? 0.0000012 : 0;
    if (rand() < trafficRisk + stressRisk) {
      if (rand() < 0.18 + fly.traits.risk * 0.12) {
        fly.alive = false;
        fly.causeOfDeath = "traffic accident";
        state.deaths += 1;
        emit("accident", `${fly.id} died in a traffic accident.`, { flyId: fly.id, cause: "traffic accident" });
        return;
      }
      fly.health = clamp(fly.health - randRange(18, 48));
      fly.stress = clamp(fly.stress + 20);
      fly.targetLocationId = "clinic";
      const clinic = jittered(location("clinic"), 2);
      fly.targetX = clinic.x;
      fly.targetZ = clinic.z;
      fly.action = "injured";
      emit("accident", `${fly.id} was injured in a traffic accident.`, { flyId: fly.id });
    }
  }

  if (oldStress < 90 && fly.stress >= 90 && rand() < 0.1) {
    emit("crisis", `${fly.id} entered a severe stress crisis.`, { flyId: fly.id, stress: fly.stress });
  }
}

function needsAndActivities(fly, clock) {
  fly.hunger = clamp(fly.hunger + 0.055);
  fly.thirst = clamp(fly.thirst + 0.082);
  fly.caffeine = clamp(fly.caffeine - 0.075);
  const atHome = fly.currentLocationId === fly.homeId;
  const sleeping = Boolean(fly.sleeping && atHome && !fly.traveling);
  fly.sleeping = sleeping;

  if (sleeping) {
    fly.energy = clamp(fly.energy + 0.25);
    fly.sleepDebt = clamp(fly.sleepDebt - 0.22);
    fly.stress = clamp(fly.stress - 0.045);
    fly.excitement = clamp(fly.excitement - 0.055);
  } else {
    const caffeineBoost = Math.min(0.04, fly.caffeine * 0.00055);
    fly.energy = clamp(fly.energy - 0.043 + caffeineBoost);
    const late = clock.hour >= 23 || clock.hour < 5;
    fly.sleepDebt = clamp(fly.sleepDebt + (late ? 0.035 : 0.006));
  }

  if (fly.thirst > 85) {
    fly.energy = clamp(fly.energy - 0.05);
    fly.stress = clamp(fly.stress + 0.045);
    fly.health = clamp(fly.health - 0.012);
  }

  const foodPlaces = ["market","grocery","bakery","restaurant","night-market"];
  if (foodPlaces.includes(fly.currentLocationId) && fly.hunger > 28 && fly.money >= 3.5) {
    const business = state.businesses?.[fly.currentLocationId];
    if (brainRand(fly) < 0.12 && (!business || business.inventory > 0)) {
      const cost = business?.price ? business.price * brainRange(fly, 0.9, 1.08) : brainRange(fly, 3.5, 9.5);
      fly.money -= cost;
      fly.expensesLifetime += cost;
      fly.hunger = clamp(fly.hunger - brainRange(fly, 28, 52));
      fly.thirst = clamp(fly.thirst - brainRange(fly, 8, 20));
      fly.happiness = clamp(fly.happiness + 2);
      if (business) {
        business.cash += cost;
        business.inventory = Math.max(0, business.inventory - 1);
      }
      state.foodReserve = Math.max(0, state.foodReserve - 1);
      state.totalTransactions += 1;
    }
  }

  if (fly.currentLocationId === "cafe" && fly.action === "drinking Hansdrex coffee" &&
      state.simulationAgeSeconds - fly.lastCoffeeAt > 2700 && fly.money >= 5) {
    const cost = state.businesses.cafe?.price || 5;
    fly.money -= cost;
    fly.expensesLifetime += cost;
    fly.caffeine = clamp(fly.caffeine + 58);
    fly.energy = clamp(fly.energy + 16);
    fly.excitement = clamp(fly.excitement + 8);
    fly.thirst = clamp(fly.thirst - 24);
    fly.stress = clamp(fly.stress - 2);
    fly.lastCoffeeAt = state.simulationAgeSeconds;
    state.businesses.cafe.cash += cost;
    state.totalTransactions += 1;

    if (clock.hour >= 18 || clock.hour < 4) {
      fly.sleepDebt = clamp(fly.sleepDebt + 9);
      fly.stress = clamp(fly.stress + 1.5);
    }
    brainRemember(fly, "coffee", { hour: clock.hour, caffeine: fly.caffeine, cost });
  }

  if (["hospital-central","hospital-east","clinic"].includes(fly.currentLocationId) &&
      (fly.health < 78 || fly.illness) && fly.money >= 12 && brainRand(fly) < 0.055) {
    const cost = fly.currentLocationId.startsWith("hospital") ? 26 : 12;
    fly.money -= cost;
    fly.health = clamp(fly.health + brainRange(fly, 10, 26));
    fly.stress = clamp(fly.stress - 10);
    fly.illness = brainRand(fly) < 0.82 ? null : fly.illness;
    fly.expensesLifetime += cost;
    state.totalTransactions += 1;
  }

  if (!fly.illness && fly.health < 82 && brainRand(fly) < 0.00022 + fly.sleepDebt * 0.0000025) {
    fly.illness = brainRand(fly) < 0.55 ? "viral fatigue" : "respiratory illness";
    fly.sickDays += 1;
    fly.stress = clamp(fly.stress + 8);
    fly.energy = clamp(fly.energy - 10);
    emit("illness", `${fly.id} became ill with ${fly.illness}.`, { flyId: fly.id, illness: fly.illness });
  }

  if (fly.currentLocationId === "gym" && fly.action === "exercising") {
    fly.stress = clamp(fly.stress - 0.22);
    fly.health = clamp(fly.health + 0.025);
    fly.energy = clamp(fly.energy - 0.06);
    fly.thirst = clamp(fly.thirst + 0.09);
  }

  if (location(fly.currentLocationId).type === "nightlife" && nightlifeOpen(clock)) {
    if (state.simulationAgeSeconds - fly.lastLeisureAt > 1800 && fly.money >= 4) {
      const place = state.businesses?.[fly.currentLocationId];
      const spend = place?.price || brainRange(fly, 4, 10);
      fly.money -= spend;
      fly.expensesLifetime += spend;
      fly.stress = clamp(fly.stress - brainRange(fly, 5, 12));
      fly.happiness = clamp(fly.happiness + brainRange(fly, 4, 10));
      fly.excitement = clamp(fly.excitement + brainRange(fly, 7, 16));
      fly.loneliness = clamp(fly.loneliness - brainRange(fly, 4, 12));
      fly.energy = clamp(fly.energy - brainRange(fly, 3, 8));
      fly.sleepDebt = clamp(fly.sleepDebt + brainRange(fly, 2, 7));
      fly.lastLeisureAt = state.simulationAgeSeconds;
      if (place) place.cash += spend;
      state.totalTransactions += 1;
    }
  }

  if (fly.currentLocationId === "park") {
    const sunset = sunsetQuality();
    fly.stress = clamp(fly.stress - (sunset > 0.48 ? 0.18 : 0.06));
    fly.excitement = clamp(fly.excitement + (sunset > 0.48 ? 0.09 : 0.015));
    if (sunset > 0.65) fly.happiness = clamp(fly.happiness + 0.055);
  }
  if (fly.currentLocationId === "cafe") {
    fly.loneliness = clamp(fly.loneliness - 0.04);
    fly.happiness = clamp(fly.happiness + 0.025);
  }
  if (fly.smoking) {
    fly.stress = clamp(fly.stress - 0.16);
    fly.health = clamp(fly.health - 0.018);
  }
}

function tickFly(fly, clock) {
  if (!fly.alive) return;
  const before = {
    happiness: fly.happiness,
    stress: fly.stress,
    hunger: fly.hunger,
    health: fly.health,
  };
  fly.ageYears = ageOf(fly);
  if (fly.ageYears < 18) {
    fly.jobId = null;
    fly.jobTitle = null;
    fly.wage = 0;
  } else if (!fly.jobId && fly.ageYears <= 75 && rand() < 0.00025 * (0.4 + fly.traits.ambition)) {
    const job = pick(JOBS);
    fly.jobId = job.id;
    fly.jobTitle = job.title;
    fly.wage = job.wage;
    emit("job", `${fly.id} found work as a ${job.title}.`, { flyId: fly.id, job: job.title });
  }

  if (fly.ageYears > 75 && fly.jobId) {
    fly.jobId = null;
    fly.jobTitle = "retired";
    fly.wage = 0;
    emit("retirement", `${fly.id} retired at age ${fly.ageYears.toFixed(1)}.`, { flyId: fly.id });
  }

  chooseDestination(fly, clock);
  moveFly(fly);
  needsAndActivities(fly, clock);
  productionAndRetail(fly, clock);
  payAndFinance(fly, clock);
  socialLife(fly, clock);
  reproduction(fly);
  completePregnancy(fly);
  mentalHealthAndMortality(fly);
  brainLearnFromOutcome(fly, before);
}

async function checkpoint(force = false) {
  if (!force && Date.now() - checkpointAt < CHECKPOINT_EVERY_MS) return;
  checkpointAt = Date.now();
  state.updatedAt = new Date().toISOString();
  const living = state.flies.filter((f) => f.alive);
  const moneySupply = living.reduce((sum, f) => sum + f.money + f.savings - f.debt, 0);
  await pool.query(
    `INSERT INTO civilization_state (world_id, state_json, updated_at)
     VALUES ($1,$2::jsonb,NOW())
     ON CONFLICT (world_id)
     DO UPDATE SET state_json = EXCLUDED.state_json, updated_at = NOW()`,
    [WORLD_ID, JSON.stringify(state)],
  );
  await pool.query(
    `INSERT INTO civilization_worlds
      (world_id, experiment_id, world_seed, started_at, updated_at, simulation_age_seconds, time_scale, population, generation, births, deaths, food_reserve, money_supply, simulation_status, paused)
     VALUES ($1,$2,$3,NOW(),NOW(),$4,$5,$6,$7,$8,$9,$10,$11,'SYNTHETIC_CIVILIZATION_LIVE',$12)
     ON CONFLICT (world_id) DO UPDATE SET
       updated_at=NOW(),
       simulation_age_seconds=EXCLUDED.simulation_age_seconds,
       time_scale=EXCLUDED.time_scale,
       population=EXCLUDED.population,
       generation=EXCLUDED.generation,
       births=EXCLUDED.births,
       deaths=EXCLUDED.deaths,
       food_reserve=EXCLUDED.food_reserve,
       money_supply=EXCLUDED.money_supply,
       simulation_status='SYNTHETIC_CIVILIZATION_LIVE',
       paused=EXCLUDED.paused`,
    [
      WORLD_ID, EXPERIMENT_ID, WORLD_SEED,
      state.simulationAgeSeconds, state.timeScale, living.length, state.generation,
      state.births, state.deaths, state.foodReserve, moneySupply, state.paused,
    ],
  );
}

function compactFly(f) {
  return {
    id: f.id,
    name: f.name,
    sex: f.sex,
    ageYears: Number(f.ageYears.toFixed(2)),
    generation: f.generation,
    alive: f.alive,
    causeOfDeath: f.causeOfDeath,
    x: Number(f.x.toFixed(2)),
    y: Number(f.y.toFixed(2)),
    z: Number(f.z.toFixed(2)),
    vx: Number(f.vx.toFixed(3)),
    vz: Number(f.vz.toFixed(3)),
    action: f.action,
    currentLocationId: f.currentLocationId,
    targetLocationId: f.targetLocationId,
    hunger: Number(f.hunger.toFixed(1)),
    thirst: Number((f.thirst || 0).toFixed(1)),
    caffeine: Number((f.caffeine || 0).toFixed(1)),
    sleepDebt: Number((f.sleepDebt || 0).toFixed(1)),
    sleeping: Boolean(f.sleeping),
    energy: Number(f.energy.toFixed(1)),
    stress: Number(f.stress.toFixed(1)),
    happiness: Number(f.happiness.toFixed(1)),
    excitement: Number(f.excitement.toFixed(1)),
    loneliness: Number(f.loneliness.toFixed(1)),
    health: Number(f.health.toFixed(1)),
    money: Number(f.money.toFixed(1)),
    savings: Number(f.savings.toFixed(1)),
    debt: Number(f.debt.toFixed(1)),
    jobTitle: f.jobTitle,
    partnerId: f.partnerId,
    affection: Number(f.affection.toFixed(1)),
    relationshipYears: f.relationshipSince == null ? null : Number(Math.max(0, gameYears() - f.relationshipSince).toFixed(3)),
    familyWaitYears: f.familyWaitYears == null ? null : Number(f.familyWaitYears.toFixed(3)),
    familyReadiness: Number((f.familyReadiness || 0).toFixed(3)),
    flirtingWith: f.flirtingWith,
    pregnant: Boolean(f.pregnancyDueAt),
    children: f.children,
    parents: f.parents,
    vehicle: f.vehicle,
    ownsHome: f.ownsHome,
    homeTier: f.homeTier || 0,
    homeX: f.homeX,
    homeZ: f.homeZ,
    brainId: f.brain?.id,
    brainSeed: f.brain?.seed,
    brainParentIds: f.brain?.lineage?.parentBrainIds || [],
    brainDecisionCount: Number(f.brain?.decisionCount || 0),
    brainMemoryCount: Number(f.brain?.memory?.episodes?.length || 0),
    fullConnectome: f.brain?.fullConnectome ? {
      connected: Boolean(f.brain.fullConnectome.connected),
      fullConnectome: Boolean(f.brain.fullConnectome.fullConnectome),
      neurons: Number(f.brain.fullConnectome.neurons || 0),
      edges: Number(f.brain.fullConnectome.edges || 0),
      neuralStepsTotal: Number(f.brain.fullConnectome.neuralStepsTotal || 0),
      activeNeurons: Number(f.brain.fullConnectome.activeNeurons || 0),
      activity: Number(f.brain.fullConnectome.activity || 0),
      confidence: Number(f.brain.fullConnectome.confidence || 0),
      steppedThisSync: Boolean(f.brain.fullConnectome.steppedThisSync),
      approachDrive: Number(f.brain.fullConnectome.approachDrive || 0),
      avoidDrive: Number(f.brain.fullConnectome.avoidDrive || 0),
      socialDrive: Number(f.brain.fullConnectome.socialDrive || 0),
      restDrive: Number(f.brain.fullConnectome.restDrive || 0),
      exploreDrive: Number(f.brain.fullConnectome.exploreDrive || 0),
      consumeDrive: Number(f.brain.fullConnectome.consumeDrive || 0),
      motorDrive: Number(f.brain.fullConnectome.motorDrive || 0),
      regionActivity: f.brain.fullConnectome.regionActivity || [],
    } : null,
    brainDynamic: f.brain ? {
      fatigue: Number((f.brain.dynamic?.fatigue ?? 0).toFixed(3)),
      arousal: Number((f.brain.dynamic?.arousal ?? 0).toFixed(3)),
      curiosity: Number((f.brain.dynamic?.curiosity ?? 0).toFixed(3)),
      rewardExpectation: Number((f.brain.dynamic?.rewardExpectation ?? 0).toFixed(3)),
      stressLoad: Number((f.brain.dynamic?.stressLoad ?? 0).toFixed(3)),
    } : null,
    brainDecision: f.brainDecision,
    brainConfidence: Number((f.brainConfidence ?? 0).toFixed(2)),
    smoking: Boolean(f.smoking),
    exercising: Boolean(f.exercising),
    mentalHealthCrisis: f.mentalHealthCrisis,
    traits: f.traits,
  };
}

function getState() {
  const living = state.flies.filter((f) => f.alive);
  const moneySupply = living.reduce((sum, f) => sum + f.money + f.savings - f.debt, 0);
  const clock = gameClock();
  const selected = living[0] || null;
  return {
    authoritative: true,
    simulationStatus: "SYNTHETIC_CIVILIZATION_LIVE",
    modelDisclosure: "Each fly has a unique brainId and an independent full-connectome neural-state buffer (membrane voltage, refractory state, synaptic state, spikes and sensory input) in the FlyWire Rust worker. The immutable FlyWire topology/weights are shared once. Offspring get a fresh dynamic neural state; no parent neural activity or memory buffer is reused. Full-connectome brains are CPU time-sliced round-robin, so they do not all advance at biological real-time simultaneously.",
    worldId: WORLD_ID,
    experimentId: EXPERIMENT_ID,
    worldSeed: String(WORLD_SEED),
    serverTime: new Date().toISOString(),
    simulationTime: state.simulationAgeSeconds,
    simulationAgeSeconds: state.simulationAgeSeconds,
    timeScale: state.timeScale,
    day: clock.day,
    gameClock: clock.text,
    gameHour: clock.hour,
    gameMinute: clock.minute,
    population: living.length,
    generation: state.generation,
    births: state.births,
    deaths: state.deaths,
    foodReserve: state.foodReserve,
    moneySupply,
    totalTransactions: state.totalTransactions,
    weather: {
      ...(state.weather || {}),
      danger: weatherDanger(),
      label: weatherLabel(),
      sunset: state.weather?.sunset || { active: false, quality: 0 },
    },
    neuralBridge: state.neuralBridge || { connected: false },
    daysPerYear: DAYS_PER_YEAR,
    locations: LOCATIONS,
    flies: state.flies.map(compactFly),
    selectedFly: selected ? {
      id: selected.id,
      brainId: selected.brain?.id,
      sensorySummary: selected.action,
      motorSummary: selected.vehicle ? `moving with ${selected.vehicle}` : "walking/flying",
      neuralActivity: Array.from({ length: 100 }, (_, i) => {
        const band = i % 5;
        if (band === 0) return selected.stress / 100;
        if (band === 1) return selected.hunger / 100;
        if (band === 2) return selected.excitement / 100;
        if (band === 3) return selected.happiness / 100;
        return selected.energy / 100;
      }),
    } : null,
    events: state.events.slice(-40),
    versions: VERSION,
  };
}

async function tick() {
  if (tickBusy || !state) return;
  tickBusy = true;
  try {
    if (!state.paused) {
      state.simulationAgeSeconds += GAME_SECONDS_PER_REAL_SECOND;
      const clock = gameClock();
      updateWeather(clock);
      for (const fly of state.flies) tickFly(fly, clock);
      void syncFullConnectomeBrains();

      // periodic city-wide events
      if (clock.hour === 6 && clock.minute < 2 && rand() < 0.12) {
        emit("weather", "A new synthetic day begins across Fly City.", { day: clock.day });
      }

      if (state.foodReserve < 2000 && rand() < 0.002) {
        state.foodReserve += 4000;
        emit("supply", "Central Market restocked food supplies.", { foodReserve: state.foodReserve });
      }

      if (state.flies.filter((f) => f.alive).length < 8 && state.flies.length < MAX_POPULATION) {
        for (let i = 0; i < 6; i += 1) state.flies.push(createFly(state.flies.length));
        emit("migration", "New migrants arrived to prevent total population collapse.", {});
      }
    }
    await checkpoint(false);
  } catch (error) {
    console.error("[civilization] tick failed", error);
  } finally {
    tickBusy = false;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    try {
      await pool.query("SELECT 1");
      json(res, 200, {
        ok: true,
        service: "fruit-fly-civilization-core",
        worldId: WORLD_ID,
        simulationStatus: state ? "SYNTHETIC_CIVILIZATION_LIVE" : "STARTING",
        population: state?.flies?.filter((f) => f.alive).length || 0,
      });
    } catch (error) {
      json(res, 503, { ok: false, error: String(error) });
    }
    return;
  }

  if (url.pathname === "/api/civilization/state") {
    try {
      json(res, 200, getState());
    } catch (error) {
      json(res, 500, { error: String(error) });
    }
    return;
  }

  if (url.pathname === "/api/civilization/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "access-control-allow-origin": "*",
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ worldId: WORLD_ID })}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  json(res, 404, {
    error: "not_found",
    endpoints: ["/health", "/api/civilization/state", "/api/civilization/events"],
  });
});

await initDb();
setInterval(() => void tick(), 1000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[civilization] synthetic persistent world listening on :${PORT} world=${WORLD_ID} pop=${state.flies.filter((f) => f.alive).length}`);
});

async function shutdown(signal) {
  console.log(`[civilization] ${signal}; checkpointing`);
  try { await checkpoint(true); } catch {}
  server.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
