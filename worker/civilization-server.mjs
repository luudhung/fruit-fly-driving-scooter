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
  worldEngineVersion: "synthetic-civilization-0.3.0",
  brainVersion: "synthetic cognitive drives + inherited traits",
  physicsVersion: "city-kinematics-0.3.0",
  geneticsVersion: "heritable-traits-0.2.0",
  economicVersion: "household-economy-0.2.0",
};

const LOCATIONS = [
  { id: "apt-north", type: "home", name: "North Apartments", x: -58, z: -52 },
  { id: "apt-east", type: "home", name: "East Apartments", x: 58, z: -48 },
  { id: "apt-south", type: "home", name: "South Apartments", x: 52, z: 58 },
  { id: "apt-west", type: "home", name: "West Apartments", x: -56, z: 52 },
  { id: "market", type: "food", name: "Central Market", x: -10, z: 6 },
  { id: "cafe", type: "social", name: "Nectar Cafe", x: 16, z: 12 },
  { id: "park", type: "social", name: "Wing Park", x: 0, z: -24 },
  { id: "office", type: "job", name: "Archive Office", x: 34, z: 6 },
  { id: "factory", type: "job", name: "Sugar Works", x: -34, z: 9 },
  { id: "lab", type: "job", name: "City Lab", x: 8, z: 37 },
  { id: "clinic", type: "service", name: "Clinic", x: -15, z: 37 },
  { id: "garage", type: "service", name: "Garage", x: 38, z: -8 },
  { id: "farm", type: "production", name: "Honeydew Farm", x: -68, z: -4 },
  { id: "bakery", type: "food", name: "Crumb & Fruit Bakery", x: 5, z: 20 },
  { id: "grocery", type: "food", name: "Daily Drop Grocery", x: -22, z: -15 },
  { id: "corner-shop", type: "shop", name: "Tiny Things Store", x: 24, z: -17 },
  { id: "gym", type: "wellness", name: "Flight Gym", x: 43, z: 25 },
  { id: "bank", type: "service", name: "Seed Bank", x: -43, z: 23 },
  { id: "warehouse", type: "job", name: "City Warehouse", x: -5, z: -42 },
  { id: "school", type: "service", name: "Larva School", x: 22, z: 43 },
];

const JOBS = [
  { id: "office", locationId: "office", title: "clerk", wage: 5.2 },
  { id: "factory", locationId: "factory", title: "processor", wage: 4.4 },
  { id: "lab", locationId: "lab", title: "researcher", wage: 6.4 },
  { id: "market", locationId: "market", title: "market vendor", wage: 4.8 },
  { id: "farm", locationId: "farm", title: "farmer", wage: 4.6 },
  { id: "bakery", locationId: "bakery", title: "baker", wage: 4.9 },
  { id: "grocery", locationId: "grocery", title: "shop clerk", wage: 4.5 },
  { id: "corner-shop", locationId: "corner-shop", title: "retail clerk", wage: 4.7 },
  { id: "garage", locationId: "garage", title: "mechanic", wage: 5.4 },
  { id: "clinic", locationId: "clinic", title: "care worker", wage: 5.8 },
  { id: "gym", locationId: "gym", title: "trainer", wage: 4.9 },
  { id: "warehouse", locationId: "warehouse", title: "warehouse worker", wage: 4.6 },
];

const BUSINESSES = {
  farm: { inventory: 900, cash: 3200, price: 1.4, outputPerShift: 6 },
  market: { inventory: 450, cash: 2600, price: 5.2 },
  bakery: { inventory: 220, cash: 1800, price: 6.2 },
  grocery: { inventory: 360, cash: 2200, price: 4.8 },
  "corner-shop": { inventory: 160, cash: 1500, price: 7.5 },
};

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
    flirtingWith: null,
    pregnancyBy: null,
    pregnancyDueAt: null,
    children: [],
    parents: parents ? [mother.id, father.id] : [],
    friends: [],
    vehicle: null,
    ownsHome: false,
    homeTier: 0,
    homeEquity: 0,
    homeX: home.x + randRange(-8, 8),
    homeZ: home.z + randRange(-8, 8),
    brainDecision: "resting",
    brainConfidence: 0.5,
    traveling: false,
    smoking: false,
    exercising: false,
    lastPaidDay: -1,
    lastRentDay: -1,
    lastSocialTick: 0,
    lastEventTick: 0,
    mentalHealthCrisis: false,
    brain,
    traits,
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
  };
  state = s;
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
      fly.smoking = Boolean(fly.smoking);
      fly.exercising = Boolean(fly.exercising);
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

  add(fly.homeId, "resting at home", (100 - fly.energy) * 0.58 + (clock.hour >= 22 || clock.hour < 6 ? 65 : 0));
  add("market", "buying food", fly.hunger * 0.8 + (fly.money > 5 ? 8 : -35));
  add("grocery", "shopping groceries", fly.hunger * 0.68 + fly.traits.thrift * 13);
  add("bakery", "getting a meal", fly.hunger * 0.55 + fly.excitement * 0.12);
  add("cafe", "socializing", fly.loneliness * 0.62 + fly.traits.sociability * 28 + fly.excitement * 0.18 + brain.plasticity.socialBias * 12);
  add("park", "taking a walk", fly.stress * 0.55 + fly.traits.resilience * 15);
  add("gym", "exercising", fly.stress * 0.34 + (100 - fly.health) * 0.25 + fly.traits.ambition * 18);
  add("clinic", "seeking care", (100 - fly.health) * 1.3);
  add("corner-shop", "shopping", fly.excitement * 0.28 + Math.min(25, fly.money / 30));

  if (fly.jobId && age >= 18 && age <= 75 && clock.hour >= 8 && clock.hour < 17) {
    const job = JOBS.find((j) => j.id === fly.jobId);
    if (job) add(job.locationId, "working", 88 + fly.traits.ambition * 25 - fly.stress * 0.25);
  }

  if (fly.stress > 76 && fly.traits.resilience < 0.45) {
    add("park", "smoke break", 42 + fly.stress * 0.5 + brain.plasticity.riskBias * 8);
  }

  if (age < 18 && clock.hour >= 8 && clock.hour < 15) {
    add("school", "at school", 92);
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

  const dest = chosen.id === fly.homeId
    ? { ...location(fly.homeId), x: fly.homeX ?? location(fly.homeId).x, z: fly.homeZ ?? location(fly.homeId).z }
    : location(chosen.id);
  const p = jittered(dest, chosen.id === fly.homeId ? 1.4 : 3.8);
  fly.targetX = p.x;
  fly.targetZ = p.z;
  fly.traveling = true;
  fly.actionUntil = 0;
}

function moveFly(fly) {
  const dx = fly.targetX - fly.x;
  const dz = fly.targetZ - fly.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.8) {
    fly.vx = 0;
    fly.vz = 0;
    fly.x = fly.targetX;
    fly.z = fly.targetZ;
    fly.currentLocationId = fly.targetLocationId;
    if (fly.traveling) {
      fly.traveling = false;
      fly.actionUntil = state.simulationAgeSeconds + randRange(1200, 4200);
    }
    return;
  }
  const vehicleBoost = fly.vehicle === "compact car" ? 2.5 : fly.vehicle === "scooter" ? 2.0 : 1;
  const fc = fly.brain?.fullConnectome;
  const neuralMotor = fc?.connected ? clamp(Number(fc.motorDrive || 0), 0, 1) : 0.5;
  const neuralTurn = fc?.connected ? clamp(Number(fc.locomotionX || 0), -1, 1) : 0;
  const speed = (0.42 + fly.energy / 320 + neuralMotor * 0.42) * vehicleBoost;
  const baseX = dx / dist;
  const baseZ = dz / dist;
  const steer = neuralTurn * 0.22;
  const norm = Math.hypot(baseX + steer * baseZ, baseZ - steer * baseX) || 1;
  fly.vx = ((baseX + steer * baseZ) / norm) * speed;
  fly.vz = ((baseZ - steer * baseX) / norm) * speed;
  fly.x += fly.vx;
  fly.z += fly.vz;
  fly.y = 1.4 + Math.sin(state.simulationAgeSeconds * 0.018 + Number(fly.id.slice(-3))) * 0.3;
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
      fly.affection = 0;
      const other = state.flies.find((f) => f.id === old);
      if (other?.partnerId === fly.id) {
        other.partnerId = null;
        other.relationshipSince = null;
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
  if (fly.affection < 45 || fly.health < 45 || fly.stress > 85) return;

  const p = 0.00035 * (0.35 + fly.traits.fertility) * (0.35 + partner.traits.fertility);
  if (rand() < p) {
    fly.pregnancyBy = partner.id;
    fly.pregnancyDueAt = gameYears() + 0.72;
    emit("pregnancy", `${fly.id} became pregnant with ${partner.id}.`, { flyId: fly.id, partnerId: partner.id });
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
  const sleeping = (clock.hour >= 22 || clock.hour < 6) && fly.currentLocationId === fly.homeId;
  fly.energy = clamp(fly.energy + (sleeping ? 0.16 : -0.038));

  if (fly.currentLocationId === "market" && fly.hunger > 35 && fly.money >= 3.5) {
    if (rand() < 0.14) {
      const cost = randRange(3.5, 8.5);
      fly.money -= cost;
      fly.expensesLifetime += cost;
      fly.hunger = clamp(fly.hunger - randRange(28, 52));
      fly.happiness = clamp(fly.happiness + 2);
      state.foodReserve = Math.max(0, state.foodReserve - 1);
      state.totalTransactions += 1;
    }
  }

  if (fly.currentLocationId === "clinic" && fly.health < 75 && fly.money >= 12 && rand() < 0.04) {
    const cost = 12;
    fly.money -= cost;
    fly.health = clamp(fly.health + randRange(8, 20));
    fly.stress = clamp(fly.stress - 8);
    fly.expensesLifetime += cost;
    state.totalTransactions += 1;
  }

  if (fly.currentLocationId === "park") {
    fly.stress = clamp(fly.stress - 0.06);
    fly.excitement = clamp(fly.excitement + 0.015);
  }
  if (fly.currentLocationId === "cafe") {
    fly.loneliness = clamp(fly.loneliness - 0.04);
    fly.happiness = clamp(fly.happiness + 0.025);
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
