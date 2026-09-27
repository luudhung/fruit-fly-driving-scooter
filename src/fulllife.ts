import * as THREE from "three";
import { createResidentDirectory } from "./resident-directory";
import { MAP_VERSION, WORLD_HALF, PARK, PARK_PONDS, FERRIS_WHEEL, wheelCabin, RIVER, HARBOR, WATER, ROADS, BRIDGES, AVENUES, STREETS, BUILDINGS, METRO_LINES, WALKWAYS, contains, clearSegment, trainState, type Building } from "../worker/city-map.mjs";

type FlyState = {
  id: string;
  name: string;
  sex: "F" | "M";
  ageYears: number;
  generation: number;
  alive: boolean;
  traveling?:boolean; indoors?:boolean; onTrain?:boolean; metroLineId?:string; householdId?:string; housingUnitId?:string; housingType?:string;
  wheelRideUntil?:number;
  wheelSeat?:number|null;
  parkedCar?:{x:number;z:number}|null;
  movementTrace?:Array<{x:number;y:number;z:number;t:number}>;
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
  utilityDebt?: number; powerOn?: boolean; criminalRecordCount?: number; sentence?: string|null; capitalCharge?: boolean;
  jobTitle?: string | null;
  partnerId?: string | null;
  affection: number;
  relationshipTrust?: number;
  jealousy?: number;
  infidelityCount?: number;
  lastAffairWith?: string | null;
  affairDiscovered?: boolean;
  relationshipYears?: number | null;
  familyWaitYears?: number | null;
  familyReadiness?: number;
  flirtingWith?: string | null;
  pregnant?: boolean;
  children: string[];
  parents: string[];
  vehicle?: string | null;
  transitMode?: string;
  heliPassenger?: boolean;
  heliTourUntil?: number;
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
  partyId?: string | null; ideology?: Record<string,number> | null; politicalInterest?: number;
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
  mapVersion?:number;
  transit?:{boardings:number;completedTrips:number;passengers:number;waiting:number};
  activity?:{working:number;sleeping:number;indoors:number;traveling:number};
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
  mortality?:{byCause:Record<string,number>};
  welfare?:{birthGrantPerChild:number;essentialMealPrice:number};
  parkLeisure?:{passengers:number;completedRides:number};
  foodReserve: number;
  moneySupply: number;
  currency?: { code?: string; name?: string };
  economy?: { employed?: number; inflationRate?: number; priceLevel?: number; [key:string]: unknown };
  centralBank?: { inflationRate?: number; priceLevel?: number; lastPrintAmount?: number; boardIds?: string[] };
  politics?: { presidentId?: string | null; presidentPartyId?: string | null; campaignActive?: boolean; nextElectionDay?: number; parties?: Array<{id:string;name:string}> };
  education?: { teacherId?: string | null; teacherGeneration?: number; lessons?: number; students?: number };
  utilities?: { powerPlant?: { gridOnline?: boolean; generation?: number; demand?: number; capacity?: number; fuelReserve?: number; maintenance?: number }; disconnectedHouseholds?: number; householdAccounts?: number };
  justice?: { deathPenaltyEnabled?: boolean; executions?: number; convictions?: number; acquittals?: number };
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
const inflationEl = $("inflation");
const employedEl = $("employed");
const presidentEl = $("president");
const academyTeacherEl = $("academy-teacher");
const powerGridEl = $("power-grid");
const powerCutsEl = $("power-cuts");
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
  low:    { pixelRatio: 0.85, fps: 24, maxFlies: 132,  maxHomes: 24,  rain: 320,  treeScale: 0.34, streetTreeStep: 72, windowStride: 3, metroDetail: 0, trafficStride: 3 },
  medium: { pixelRatio: 1.0,  fps: 30, maxFlies: 132, maxHomes: 48,  rain: 700,  treeScale: 0.58, streetTreeStep: 48, windowStride: 2, metroDetail: 1, trafficStride: 2 },
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

const residentDirectory=createResidentDirectory((id)=>{
 const fly=latestFlyStates.get(id);if(!fly?.alive)return;
 selectedFlyId=id;followSelected=false;renderInspector(fly);
 const target=new THREE.Vector3(fly.x,Math.max(1,fly.y),fly.z);
 freePosition.copy(target).add(new THREE.Vector3(-20,24,26));
 const direction=target.clone().sub(freePosition).normalize();cameraYaw=Math.atan2(direction.x,direction.z);cameraPitch=Math.asin(direction.y);
 document.getElementById("fly-card")?.classList.remove("collapsed");
 if(matchMedia("(max-width:980px), (pointer:coarse)").matches){document.body.classList.add("mobile-inspector-open");mobileInspectorToggle?.setAttribute("aria-expanded","true");if(mobileInspectorToggle)mobileInspectorToggle.textContent="CLOSE INFO";}
});

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
  flyDebtEl.textContent = `${num(fly.debt + (fly.bankLoan || 0),1)} H$ + power ${num(fly.utilityDebt||0,1)} · ${fly.powerOn===false?"POWER CUT":"powered"} · ${fly.vehicle||fly.transitMode||"walk"}`;
  flySleepEl.textContent = `${fly.sleeping ? "sleeping 💤" : "awake"} · caffeine ${num(fly.caffeine || 0)} · sleep debt ${num(fly.sleepDebt || 0)}`;
  flyNeedsEl.textContent = `hunger ${num(fly.hunger)} · thirst ${num(fly.thirst || 0)}`;
  flyRelationshipEl.textContent = fly.partnerId
    ? `${fly.partnerId} · ${num(fly.relationshipYears || 0, 2)}y · trust ${num(fly.relationshipTrust || 0)}% · jealousy ${num(fly.jealousy || 0)}% · affairs ${fly.infidelityCount || 0}${fly.lastAffairWith && fly.affairDiscovered===false ? " · secret" : ""}`
    : (fly.flirtingWith ? `flirting ${fly.flirtingWith}` : "single");
  flyFamilyEl.textContent = fly.partnerId
    ? `${Math.round((fly.familyReadiness || 0) * 100)}% ready · wait ${num(fly.familyWaitYears || 0, 2)}y`
    : "—";
  flyClassEl.textContent = fly.socialClass || "working";
  flyBusinessEl.textContent = fly.businessId
    ? `${fly.businessId} · equity ${num(fly.businessEquity || 0)} H$`
    : `no business · credit ${num(fly.creditScore || 0)}`;
  const skillNames = Object.entries(fly.professionSkills || {}).filter(([,v]) => Number(v) > 0.45).map(([k]) => k).slice(0,2);
  flyLawEl.textContent = `${Math.round((fly.lawAwareness||0)*100)}% aware · ${fly.lawViolations||0} violations · ${fly.criminalRecordCount||0} charges${fly.sentence?" · "+fly.sentence:fly.arrested?" · DETAINED":fly.wanted?" · WANTED":""}${skillNames.length?" · "+skillNames.join("/"):""}`;
  flyLearningEl.textContent = `IQ-like ${Math.round((fly.intelligence || 0) * 100)} · edu ${num(fly.educationLevel || 0,1)} · ${fly.schoolDays || 0} school days${fly.teacherId ? " · teacher " + fly.teacherId : ""}`;
  flyScheduleEl.textContent = `${fly.chronotype || "day"} · start ${String(Math.round(fly.preferredWorkStart || 0)).padStart(2,"0")}:00 · ${num(fly.preferredWorkHours || 0,1)}h · ${fly.partyId || "no party"}`;
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
  snapshotReceivedAt=performance.now();
  const neuralLive = Boolean(s.neuralBridge?.connected && s.neuralBridge?.independentDynamicState);
  const living=(s.flies||[]).filter(f=>f.alive);
  residentDirectory.update(living,s.deaths,s.births,s.mortality?.byCause);
  setConnection(s.authoritative?"authoritative":"offline",`${living.length} ALIVE · ${s.authoritative?(neuralLive?"FULL CONNECTOME":"CITY LIVE"):"LAST KNOWN"} ▾`);
  if(s.mapVersion!==MAP_VERSION)setConnection("connecting",`${living.length} ALIVE · WORKER UPDATE NEEDED ▾`);
  connection.title=`Open ${living.length} living residents. Brain registry: ${s.neuralBridge?.registeredBrains||0} historical registrations; this is not the living population.`;
  if(!s.authoritative)residentDirectory.offline();
  const policy=document.getElementById("welfare-policy");
  if(policy)policy.textContent=s.welfare?`Birth grant ${s.welfare.birthGrantPerChild.toLocaleString()} H$ / child · meals ${s.welfare.essentialMealPrice} H$ · water & park rides free · ${s.parkLeisure?.passengers||0} on wheel / ${s.parkLeisure?.completedRides||0} completed`:'Awaiting public-support policy update';
  worldAge.textContent = formatAge(s.simulationAgeSeconds);
  population.textContent = `${num(living.length)} flies`;
  generation.textContent = num(s.generation);
  speed.textContent = "1s = 2m";
  const activity=document.getElementById("city-activity");if(activity)activity.textContent=s.activity?`${s.activity.working} working · ${s.activity.traveling} traveling · ${s.activity.indoors} indoors`:"Awaiting activity telemetry";
  const transit=document.getElementById("transit-activity");if(transit)transit.textContent=s.transit?`${s.transit.passengers} aboard · ${s.transit.waiting} waiting · ${s.transit.completedTrips} completed trips`:"Awaiting transit telemetry";
  for(const t of metroTrains){if(t.label)updateSpriteText(t.label,`${METRO_LINES[t.lineIndex].id} · ${(s.flies||[]).filter(f=>f.onTrain&&f.metroLineId===METRO_LINES[t.lineIndex].id).length} RIDERS`);}
  births.textContent = num(s.births);
  deaths.textContent = num(s.deaths);
  food.textContent = num(s.foodReserve);
  money.textContent = `${num(s.moneySupply, 0)} ${s.currency?.code || "H$"}`;
  inflationEl.textContent = `${num(s.centralBank?.inflationRate ?? s.economy?.inflationRate ?? 0, 1)}%`;
  employedEl.textContent = num(Number(s.economy?.employed || 0));
  presidentEl.textContent = s.politics?.presidentId || (s.politics?.campaignActive ? "campaigning…" : "—");
  academyTeacherEl.textContent = s.education?.teacherId || "—";
  const grid=s.utilities?.powerPlant;
  powerGridEl.textContent=grid ? `${grid.gridOnline===false?"BLACKOUT":"ONLINE"} · ${num(grid.generation||0)} / ${num(grid.demand||0)}` : "—";
  powerCutsEl.textContent=num(Number(s.utilities?.disconnectedHouseholds||0));
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
      e.type === "monetary_policy" ? "🏦 " :
      e.type === "grid_outage" || e.type === "power_cut" ? "⚡ " :
      e.type === "grid_restored" || e.type === "power_reconnected" ? "💡 " :
      e.type === "crime" || e.type === "assault" || e.type === "homicide" || e.type === "power_theft" ? "🚨 " :
      e.type === "capital_sentence" || e.type === "execution" ? "⚖ " :
      e.type === "election_campaign" || e.type === "election_result" || e.type === "party_founded" ? "🗳 " :
      e.type === "political_argument" ? "💬 " :
      e.type === "infidelity" || e.type === "infidelity_discovered" ? "💔 " :
      e.type === "relationship_conflict" || e.type === "breakup" ? "⚠ " :
      e.type === "heli_boarding" ? "🚁 " :
      e.type === "heli_landing" ? "🚁 " :
      e.type === "vehicle_purchase" ? "◆ " : "";
    row.textContent = `D${e.day ?? s.day} ${e.time || ""} · ${icon}${e.text}`;
    return row;
  }));
  if (!rows.length) events.textContent = "Civilization is running; no recent events.";

  latestFlyStates = new Map((s.flies || []).map((fly) => [fly.id, fly]));
  syncFlyMeshes(s.flies || []);
  updateHeliTourState(s.flies || []);
  syncHomes(s.flies || []);
  updateDayNight(s.gameHour ?? 12, s.gameMinute ?? 0, s.weather);
  updateTrafficSignals((s.simulationAgeSeconds || 0) / Math.max(1, s.timeScale || 60));

  if (selectedFlyId && latestFlyStates.has(selectedFlyId)) {
    renderInspector(latestFlyStates.get(selectedFlyId) || null);
  } else {
    const firstLiving = (s.flies || []).find((f) => f.alive) || null;
    if (firstLiving && !selectedFlyId) selectedFlyId = firstLiving.id;
    renderInspector(firstLiving);
  }
}

function updateHeliTourState(flies:FlyState[]){
  const riders=flies.filter((f)=>f.alive&&f.heliPassenger);
  heliGuestCount=riders.length;
  updateSpriteText(heliOccupancy,`HELI TOUR · ${heliGuestCount} GUEST${heliGuestCount===1?"":"S"}`);
  if(riders.length){
    const lead=riders[0];
    heliTarget.set(lead.x,Math.max(lead.y,28),lead.z);
    heliOccupancy.visible=true;
  }else{
    heliTarget.copy(heliPadCenter).add(new THREE.Vector3(0,2.2,0));
    heliOccupancy.visible=graphics.metroDetail>=1;
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
    residentDirectory.offline();
    setConnection("offline", `OFFLINE · LAST SEEN ${residentDirectory.count} ALIVE ▾`);
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


const riverX = RIVER.x;
const riverWidth = RIVER.w;
const harborZ = HARBOR.z;
const harborDepth = HARBOR.d;

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
const river = new THREE.Mesh(new THREE.PlaneGeometry(RIVER.w, RIVER.d), waterMat);
river.rotation.x = -Math.PI / 2;
river.position.set(RIVER.x, 0.015, RIVER.z);
cityRoot.add(river);
const harbor = new THREE.Mesh(new THREE.PlaneGeometry(HARBOR.w, HARBOR.d), waterMat);
harbor.rotation.x = -Math.PI / 2;
harbor.position.set(HARBOR.x, 0.018, HARBOR.z);
cityRoot.add(harbor);

const roadMat = new THREE.MeshStandardMaterial({ color: 0x242a2e, roughness: 0.97 });
const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb6b5ad, roughness: 1 });
const laneMat = new THREE.MeshBasicMaterial({ color: 0xe9dfb1 });
const parkMat = new THREE.MeshStandardMaterial({ color: 0x4f8459, roughness: 1 });
const plazaMat = new THREE.MeshStandardMaterial({ color: 0xc7c3b8, roughness: 1 });

const avenueXs = AVENUES;
const streetZs = STREETS;

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

for(const road of ROADS)addRoadStrip(road.x,road.z,road.w,road.d,road.d>road.w);

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
  const x=signalAvenues[xi],z=signalStreets[zi],offset=0;
  if(contains(PARK,{x,z},5))continue;
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
  deck.position.set(riverX, 0.2, z);
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
BRIDGES.forEach((b) => addBridge(b.z, Math.max(12,b.d-3)));

// Central Park is a long protected Manhattan-style district with reservoirs, meadows and a highly visible wheel.
const centralPark=new THREE.Mesh(new THREE.BoxGeometry(PARK.w,.10,PARK.d),parkMat);
centralPark.position.set(PARK.x,.09,PARK.z);cityRoot.add(centralPark);
const pathMat=new THREE.MeshStandardMaterial({color:0xd9c6a3,roughness:1});
const parkPaths=PARK_PATHS;
for(const r of parkPaths){const m=new THREE.Mesh(new THREE.BoxGeometry(r.w,.12,r.d),pathMat);m.position.set(r.x,.17,r.z);cityRoot.add(m);}
for(const p of PARK_PONDS){
 const pond=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.12,32),waterMat);
 pond.scale.set(p.w/2,1,p.d/2);pond.position.set(p.x,.19,p.z);cityRoot.add(pond);
}
const meadowMat=new THREE.MeshStandardMaterial({color:0x69a665,roughness:1});
for(const [x,z,w,d] of [[-16,-215,30,26],[50,-145,34,34],[-10,-55,42,24]] as const){
 const meadow=new THREE.Mesh(new THREE.BoxGeometry(w,.06,d),meadowMat);meadow.position.set(x,.15,z);cityRoot.add(meadow);
}
const benchMat=new THREE.MeshStandardMaterial({color:0x9b7045,roughness:.8});
const lampMat=new THREE.MeshStandardMaterial({color:0xffe4a0,emissive:0xffd173,emissiveIntensity:1.4});
for(const z of [-282,-242,-202,-162,-122,-82,-52])for(const x of [-43,73]){
 const bench=new THREE.Mesh(new THREE.BoxGeometry(2.8,.35,.75),benchMat);bench.position.set(x,.65,z);cityRoot.add(bench);
 const back=new THREE.Mesh(new THREE.BoxGeometry(2.8,.75,.18),benchMat);back.position.set(x,1.1,z+.32);cityRoot.add(back);
 const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.09,3,6),trafficPoleMat);pole.position.set(x,1.5,z-2);cityRoot.add(pole);
 const bulb=new THREE.Mesh(new THREE.SphereGeometry(.24,8,6),lampMat);bulb.position.set(x,3,z-2);cityRoot.add(bulb);
}
const parkSign=makeCanvasSprite("HANSDREX CENTRAL PARK",34,2.0);parkSign.position.set(PARK.x,5,PARK.z+PARK.d/2-5);cityRoot.add(parkSign);

// Giant Great Wheel: large enough to remain obvious from the city overview.
const wheelRoot=new THREE.Group();wheelRoot.position.set(FERRIS_WHEEL.x,FERRIS_WHEEL.y,FERRIS_WHEEL.z);cityRoot.add(wheelRoot);
const wheelRotor=new THREE.Group();wheelRoot.add(wheelRotor);
const wheelMetal=new THREE.MeshStandardMaterial({color:0xe1ebe4,metalness:.58,roughness:.30});
const wheelGlow=new THREE.MeshStandardMaterial({color:0xb8fff0,emissive:0x4fcfb2,emissiveIntensity:1.35,roughness:.22});
for(const z of [-1.7,1.7]){
 const ring=new THREE.Mesh(new THREE.TorusGeometry(FERRIS_WHEEL.radius,.34,8,graphics.metroDetail>=2?96:56),wheelGlow);ring.position.z=z;wheelRotor.add(ring);
}
const hub=new THREE.Mesh(new THREE.CylinderGeometry(1.25,1.25,4.2,14),wheelMetal);hub.rotation.x=Math.PI/2;wheelRotor.add(hub);
for(const side of [-1,1])for(const z of [-2.6,2.6]){
 const end=new THREE.Vector3(side*FERRIS_WHEEL.radius*.58,-(FERRIS_WHEEL.y-1),z),mid=end.clone().multiplyScalar(.5);
 const beam=new THREE.Mesh(new THREE.CylinderGeometry(.55,.82,end.length(),7),wheelMetal);beam.position.copy(mid);beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.normalize());wheelRoot.add(beam);
}
const wheelCabins:THREE.Group[]=[];
const cabinGeometry=new THREE.BoxGeometry(2.8,2.5,3.4);
for(let i=0;i<FERRIS_WHEEL.seats;i++){
 const a=i/FERRIS_WHEEL.seats*Math.PI*2;
 const spoke=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,FERRIS_WHEEL.radius,6),wheelMetal);spoke.position.set(Math.cos(a)*FERRIS_WHEEL.radius/2,Math.sin(a)*FERRIS_WHEEL.radius/2,0);spoke.rotation.z=a-Math.PI/2;wheelRotor.add(spoke);
 const cabin=new THREE.Group(),body=new THREE.Mesh(cabinGeometry,new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(i/FERRIS_WHEEL.seats,.62,.55),metalness:.28,roughness:.34}));body.position.y=-.9;cabin.add(body);
 const window=new THREE.Mesh(new THREE.BoxGeometry(2.35,1.0,3.45),wheelGlow);window.position.y=-.5;cabin.add(window);wheelRoot.add(cabin);wheelCabins.push(cabin);
}
const wheelSign=makeCanvasSprite("HANSDREX GREAT WHEEL · FREE",34,2.1);wheelSign.position.set(FERRIS_WHEEL.x,8,FERRIS_WHEEL.z+FERRIS_WHEEL.radius+9);cityRoot.add(wheelSign);
function updateParkWheel(now:number){
 const seconds=Number(snapshot?.simulationAgeSeconds||0)+(Math.min(2,(now-snapshotReceivedAt)/1000)*Number(snapshot?.timeScale||120));
 wheelRotor.rotation.z=seconds/FERRIS_WHEEL.period*Math.PI*2;
 wheelCabins.forEach((cab,i)=>{const p=wheelCabin(seconds,i);cab.position.set(p.x-FERRIS_WHEEL.x,p.y-FERRIS_WHEEL.y,0);});
 for(const f of latestFlyStates.values()){if(!f.wheelRideUntil||f.wheelSeat==null)continue;const v=flyVisuals.get(f.id);if(v){const p=wheelCabin(seconds,f.wheelSeat);v.group.position.set(p.x,p.y-.5,p.z);}}
}

const treeTransforms:Array<{x:number;z:number;scale:number}>=[];
function addTree(x:number,z:number,scale=1){
 const p={x,z};
 const wheelZone={x:FERRIS_WHEEL.x,z:FERRIS_WHEEL.z,w:FERRIS_WHEEL.radius*2+18,d:22};
 if(ROADS.some(r=>contains(r,p,2.8))||WATER.some(r=>contains(r,p,1))||BUILDINGS.some(r=>contains(r,p,1))||parkPaths.some(r=>contains(r,p,1.3))||contains(wheelZone,p,2))return;
 treeTransforms.push({x,z,scale});
}
for(let i=0;i<Math.round(820*graphics.treeScale);i++){
 const x=PARK.x-PARK.w/2+6+seeded(i+20)*(PARK.w-12);
 const z=PARK.z-PARK.d/2+6+seeded(i+820)*(PARK.d-12);
 addTree(x,z,1.35+seeded(i+140)*1.25);
}
for(let i=0;i<Math.round(95*graphics.treeScale);i++)addTree(-150+seeded(i+1500)*300,190+seeded(i+1600)*24,1.0+seeded(i+1700)*.45);
function buildTrees(){
 const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.13,.22,1.8,6),new THREE.MeshStandardMaterial({color:0x674a34}),treeTransforms.length);
 const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.05,graphics.metroDetail>=2?1:0),new THREE.MeshStandardMaterial({color:0x3b7250,roughness:1}),treeTransforms.length);
 const d=new THREE.Object3D();treeTransforms.forEach((t,i)=>{d.scale.setScalar(t.scale);d.position.set(t.x,.9*t.scale,t.z);d.updateMatrix();trunks.setMatrixAt(i,d.matrix);d.position.y=2.3*t.scale;d.updateMatrix();crowns.setMatrixAt(i,d.matrix);});cityRoot.add(trunks,crowns);
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

// Every visible footprint is also used by the server for collisions and zoning.
for(const b of BUILDINGS.filter(b=>b.kind==="block"||b.kind==="apartment"))addBuilding(b.x,b.z,b.w,b.d,b.h,Math.abs(b.x*17+b.z),{glass:b.h>40,residential:b.kind==="apartment"});

// Hansdrex iconic skyline — stylized landmark references on reserved central plots.
const landmarkWarm=new THREE.MeshStandardMaterial({color:0xe6c98d,emissive:0xffc85a,emissiveIntensity:1.15,roughness:0.35});
const landmarkCool=new THREE.MeshStandardMaterial({color:0x8db9d0,emissive:0x3c9fd4,emissiveIntensity:0.95,roughness:0.28});
const landmarkMetal=new THREE.MeshStandardMaterial({color:0xaeb6b9,roughness:0.38,metalness:0.58});
function addEmpireStyleTower(x:number,z:number){const g=new THREE.Group(),stone=new THREE.MeshStandardMaterial({color:0xa4a19a,roughness:0.68,metalness:0.08});const tiers=[[11.5,11.5,38,19],[9.2,9.2,28,52],[6.8,6.8,22,77],[4.5,4.5,14,95]] as const;
  for(const [w,d,h,y] of tiers){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),stone);m.position.y=y;g.add(m);}for(let i=0;i<3;i++){const c=new THREE.Mesh(new THREE.BoxGeometry(4.2-i*.7,3.4,4.2-i*.7),landmarkWarm);c.position.y=104+i*4;g.add(c);}
  const spire=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.72,25,8),landmarkMetal);spire.position.y=123;g.add(spire);const beacon=new THREE.Mesh(new THREE.SphereGeometry(0.72,8,6),landmarkWarm);beacon.position.y=136;g.add(beacon);g.position.set(x,0,z);cityRoot.add(g);}
addEmpireStyleTower(15,43.5);
const empireLandmarkLabel=makeCanvasSprite("HANSDREX EMPIRE",24,1.25);empireLandmarkLabel.position.set(15,142,43.5);cityRoot.add(empireLandmarkLabel);

const heliPadCenter=new THREE.Vector3(23,101,43.5);
const heliPadMat=new THREE.MeshStandardMaterial({color:0x343a3d,roughness:.56,metalness:.38});
const heliMarkMat=new THREE.MeshBasicMaterial({color:0xf7e48f});
const heliPad=new THREE.Mesh(new THREE.CylinderGeometry(5.2,5.2,.55,24),heliPadMat);heliPad.position.copy(heliPadCenter);cityRoot.add(heliPad);
const heliH1=new THREE.Mesh(new THREE.BoxGeometry(5.3,.08,.62),heliMarkMat);heliH1.position.copy(heliPadCenter).add(new THREE.Vector3(0,.32,0));cityRoot.add(heliH1);
const heliH2=new THREE.Mesh(new THREE.BoxGeometry(.62,.08,5.3),heliMarkMat);heliH2.position.copy(heliPadCenter).add(new THREE.Vector3(0,.33,0));cityRoot.add(heliH2);
const heliBridge=new THREE.Mesh(new THREE.BoxGeometry(6.5,.45,2.1),landmarkMetal);heliBridge.position.set(19.2,100.6,43.5);cityRoot.add(heliBridge);
const heliPadLabel=makeCanvasSprite("HANSDREX HELI TOURS",18,1.0);heliPadLabel.position.set(23,108,43.5);cityRoot.add(heliPadLabel);

const heliTourGroup=new THREE.Group();
const heliBodyMat=new THREE.MeshStandardMaterial({color:0x1f292f,roughness:.28,metalness:.54});
const heliAccentMat=new THREE.MeshStandardMaterial({color:0xd8aa48,roughness:.32,metalness:.45});
const heliGlassMat=new THREE.MeshStandardMaterial({color:0x6d9db0,roughness:.12,metalness:.22,transparent:true,opacity:.78});
const heliBody=new THREE.Mesh(new THREE.SphereGeometry(2.2,12,8),heliBodyMat);heliBody.scale.set(1.35,.82,1.85);heliTourGroup.add(heliBody);
const heliCabin=new THREE.Mesh(new THREE.SphereGeometry(1.45,10,7),heliGlassMat);heliCabin.scale.set(1.15,.72,1.2);heliCabin.position.set(0,.35,-1.45);heliTourGroup.add(heliCabin);
const heliTail=new THREE.Mesh(new THREE.BoxGeometry(.55,.55,6.4),heliBodyMat);heliTail.position.set(0,.25,4.5);heliTourGroup.add(heliTail);
const heliTailFin=new THREE.Mesh(new THREE.BoxGeometry(.16,2.2,1.2),heliAccentMat);heliTailFin.position.set(0,1.25,7.2);heliTourGroup.add(heliTailFin);
const heliSkidMat=new THREE.MeshStandardMaterial({color:0x15191b,metalness:.72,roughness:.35});
for(const sx of [-1,1]){const skid=new THREE.Mesh(new THREE.BoxGeometry(.18,.18,5.2),heliSkidMat);skid.position.set(sx*1.55,-1.45,.2);heliTourGroup.add(skid);}
const heliRotor=new THREE.Mesh(new THREE.BoxGeometry(10.5,.08,.22),heliAccentMat);heliRotor.position.y=2.05;heliTourGroup.add(heliRotor);
const heliRotorCross=new THREE.Mesh(new THREE.BoxGeometry(.22,.08,10.5),heliAccentMat);heliRotorCross.position.y=2.05;heliTourGroup.add(heliRotorCross);
const heliTailRotor=new THREE.Mesh(new THREE.BoxGeometry(.10,3.1,.18),heliAccentMat);heliTailRotor.position.set(0,1.1,7.25);heliTourGroup.add(heliTailRotor);
const heliOccupancy=makeCanvasSprite("HELI TOUR · 0 GUESTS",17,.9);heliOccupancy.position.set(0,4.4,0);heliTourGroup.add(heliOccupancy);
heliTourGroup.position.copy(heliPadCenter).add(new THREE.Vector3(0,2.2,0));cityRoot.add(heliTourGroup);
const heliTarget=heliTourGroup.position.clone();
let heliGuestCount=0;

function addTorontoStyleTower(x:number,z:number){const g=new THREE.Group(),shaftMat=new THREE.MeshStandardMaterial({color:0xb6b8b7,roughness:0.55,metalness:0.16});const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.9,2.4,104,12),shaftMat);shaft.position.y=52;g.add(shaft);
  const pod=new THREE.Mesh(new THREE.CylinderGeometry(4.7,3.8,7,18),landmarkCool);pod.position.y=86;g.add(pod);const ring=new THREE.Mesh(new THREE.TorusGeometry(4.2,.24,6,18),landmarkWarm);ring.rotation.x=Math.PI/2;ring.position.y=89;g.add(ring);const antenna=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.68,42,8),landmarkMetal);antenna.position.y=111;g.add(antenna);const b=new THREE.Mesh(new THREE.SphereGeometry(0.62,8,6),landmarkCool);b.position.y=133;g.add(b);g.position.set(x,0,z);cityRoot.add(g);}
addTorontoStyleTower(-11,43.5);
const hansdrexTowerLabel=makeCanvasSprite("HANSDREX TOWER",23,1.2);hansdrexTowerLabel.position.set(-11,140,43.5);cityRoot.add(hansdrexTowerLabel);
function addPetronasTwinTowers(x:number,z:number){const g=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:0xb8c1c4,roughness:0.30,metalness:0.68});for(const sx of [-3.1,3.1]){const tg=new THREE.Group();for(let i=0;i<6;i++){const r=2.35-i*.18,h=12.2-i*.35,seg=new THREE.Mesh(new THREE.CylinderGeometry(r*.86,r,h,10),m);seg.position.y=7+i*13;tg.add(seg);}const crown=new THREE.Mesh(new THREE.CylinderGeometry(.7,1.8,10,9),m);crown.position.y=87;tg.add(crown);const spire=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.5,22,7),landmarkMetal);spire.position.y=104;tg.add(spire);tg.position.x=sx;g.add(tg);}const bridge=new THREE.Mesh(new THREE.BoxGeometry(6.2,1.5,2),landmarkWarm);bridge.position.y=52;g.add(bridge);g.position.set(x,0,z);cityRoot.add(g);}
addPetronasTwinTowers(41,43.5);
const petronasLabel=makeCanvasSprite("HANSDREX PETRONAS",22,1.15);petronasLabel.position.set(41,119,43.5);cityRoot.add(petronasLabel);

function addBurjKhalifaStyle(x:number,z:number){
 const g=new THREE.Group(),glass=new THREE.MeshStandardMaterial({color:0x89aebf,roughness:.2,metalness:.52}),silver=new THREE.MeshStandardMaterial({color:0xcbd2d4,roughness:.28,metalness:.74});
 let y=0;
 const tiers=[[13,40],[11.2,34],[9.4,30],[7.7,25],[6.1,21],[4.6,17]] as const;
 tiers.forEach(([r,h],i)=>{const seg=new THREE.Mesh(new THREE.CylinderGeometry(r*.72/2,r/2,h,10),i%2?silver:glass);seg.position.y=y+h/2;seg.rotation.y=i*.17;g.add(seg);y+=h-2;});
 const crown=new THREE.Mesh(new THREE.CylinderGeometry(.65,2.0,18,9),silver);crown.position.y=y+9;g.add(crown);
 const spire=new THREE.Mesh(new THREE.CylinderGeometry(.12,.42,42,7),silver);spire.position.y=y+37;g.add(spire);
 const sign=makeCanvasSprite("BURJ KHALIFA · HANSDREX",26,1.35);sign.position.set(0,194,0);g.add(sign);
 g.position.set(x,0,z);cityRoot.add(g);
}
addBurjKhalifaStyle(236,72.5);

function addMarinaBaySandsStyle(x:number,z:number){
 const g=new THREE.Group(),glass=new THREE.MeshStandardMaterial({color:0x7597a7,roughness:.22,metalness:.38}),stone=new THREE.MeshStandardMaterial({color:0xc7c3b8,roughness:.55,metalness:.12});
 for(const sx of [-14,0,14]){
  const tower=new THREE.Mesh(new THREE.BoxGeometry(10,68,13),glass);tower.position.set(sx,34,0);tower.rotation.z=-sx*.0022;g.add(tower);
  const base=new THREE.Mesh(new THREE.BoxGeometry(12,5,15),stone);base.position.set(sx,2.5,0);g.add(base);
 }
 const deck=new THREE.Mesh(new THREE.BoxGeometry(44,4.2,8),stone);deck.position.y=71;g.add(deck);
 const bow=new THREE.Mesh(new THREE.CylinderGeometry(4,4,4.2,20),stone);bow.rotation.z=Math.PI/2;bow.position.set(22,71,0);g.add(bow);
 const pool=new THREE.Mesh(new THREE.BoxGeometry(29,.45,4.2),waterMat);pool.position.set(2,73.4,0);g.add(pool);
 const sign=makeCanvasSprite("MARINA BAY SANDS · HANSDREX",31,1.5);sign.position.set(0,82,0);g.add(sign);
 g.position.set(x,0,z);cityRoot.add(g);
}
addMarinaBaySandsStyle(285,320);
// Distinct shopfronts: glazed windows, colored awnings and readable destination signs.
for(const b of BUILDINGS.filter(b=>b.kind==="destination")){
 if(b.id==="power")continue;
 const g=addBuilding(b.x,b.z,b.w,b.d,b.h,Math.abs(b.x*17+b.z),{glass:b.h>25,sign:b.name?.replace("Hansdrex ","").toUpperCase()});
 if(["food","social","shop","nightlife"].includes(b.type||"")){
  const color=b.type==="food"?0xb84a39:b.type==="shop"?0x467984:0xcca154;
  const awning=new THREE.Mesh(new THREE.BoxGeometry(b.w+.2,.3,1.3),new THREE.MeshStandardMaterial({color}));awning.position.set(0,3.1,b.d/2+.4);g.add(awning);
  const glass=new THREE.Mesh(new THREE.BoxGeometry(b.w*.72,2,.12),new THREE.MeshStandardMaterial({color:0x5c94a3,metalness:.3,roughness:.2}));glass.position.set(0,1.6,b.d/2+.1);g.add(glass);
 }
}
// A real rooftop destination above the Empire-style tower's terrace.
const skyDeck=new THREE.Mesh(new THREE.BoxGeometry(10,.4,10),landmarkMetal);skyDeck.position.set(15,98,43.5);cityRoot.add(skyDeck);
for(const x of [11,19])for(const z of [40,47]){
 const table=new THREE.Mesh(new THREE.CylinderGeometry(.65,.65,.15,10),landmarkWarm);table.position.set(x,99,z);cityRoot.add(table);
}
const bar=new THREE.Mesh(new THREE.BoxGeometry(5,1.1,1.3),landmarkWarm);bar.position.set(15,98.8,40);cityRoot.add(bar);
const skySign=makeCanvasSprite("EMPIRE SKY BAR",22,1.3);skySign.position.set(15,103,48);cityRoot.add(skySign);

function addShowroomCar(x:number,z:number,color:number){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.65,4.2),new THREE.MeshStandardMaterial({color,roughness:0.42,metalness:0.28}));body.position.y=0.62;g.add(body);
  const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.75,0.62,2.0),new THREE.MeshStandardMaterial({color:0x5d7582,roughness:0.2,metalness:0.18}));cabin.position.set(0,1.15,-0.15);g.add(cabin);
  g.position.set(x,0,z);cityRoot.add(g);
}
if(graphics.metroDetail>=1){addShowroomCar(-137,-63.5,0xc94d4d);addShowroomCar(-130,-63.5,0xd5d8d2);addShowroomCar(-123,-63.5,0x3d668c);}

function addPowerPlant(x:number,z:number){
  const g=new THREE.Group();
  const concrete=new THREE.MeshStandardMaterial({color:0x6f7476,roughness:.78,metalness:.18});
  const dark=new THREE.MeshStandardMaterial({color:0x323a3d,roughness:.52,metalness:.52});
  const copper=new THREE.MeshStandardMaterial({color:0xb9854d,roughness:.4,metalness:.55});
  const glow=new THREE.MeshStandardMaterial({color:0xffd36e,emissive:0xffaa33,emissiveIntensity:1.05,roughness:.35});
  const hall=new THREE.Mesh(new THREE.BoxGeometry(24,16,20),concrete);hall.position.y=8;g.add(hall);
  const turbine=new THREE.Mesh(new THREE.BoxGeometry(19,7,11),dark);turbine.position.set(0,18,0);g.add(turbine);
  for(const sx of [-10,10]){const stack=new THREE.Mesh(new THREE.CylinderGeometry(2.1,2.8,34,12),concrete);stack.position.set(sx,25,-6);g.add(stack);const ring=new THREE.Mesh(new THREE.TorusGeometry(2.2,.18,6,14),glow);ring.rotation.x=Math.PI/2;ring.position.set(sx,40,-6);g.add(ring);}
  for(let i=-2;i<=2;i++){const transformer=new THREE.Mesh(new THREE.BoxGeometry(4.2,3.2,4.8),copper);transformer.position.set(i*4.2,2.1,8);g.add(transformer);const pole=new THREE.Mesh(new THREE.CylinderGeometry(.12,.16,8,6),dark);pole.position.set(i*4.2,6,8);g.add(pole);}
  const sign=makeCanvasSprite("HANSDREX POWER PLANT · 24/7",20,1.25);sign.position.set(0,22,13);g.add(sign);
  g.position.set(x,0,z);cityRoot.add(g);
}
const powerBuilding=BUILDINGS.find(b=>b.id==="power")!;
addPowerPlant(powerBuilding.x,powerBuilding.z);

// Hansdrex Farm in a reserved agricultural district.
const farmSoil=new THREE.MeshStandardMaterial({color:0x6e5738,roughness:1}),cropMat=new THREE.MeshStandardMaterial({color:0x6f8f45,roughness:1});
for(let row=0;row<7;row+=1){const z=108+row*5.3,soil=new THREE.Mesh(new THREE.BoxGeometry(42,0.08,2.2),farmSoil);soil.position.set(-300,0.08,z);cityRoot.add(soil);const crops=new THREE.Mesh(new THREE.BoxGeometry(40,0.42,0.9),cropMat);crops.position.set(-300,0.31,z);cityRoot.add(crops);}
// Street trees and lights along main avenues.
for (const x of avenueXs) {
  for (let z = -330; z <= 330; z += graphics.streetTreeStep) {
    if (x > 95 && Math.abs(x - riverX) < 25) continue;
    addTree(x + 7.2, z + 4, 0.72);
  }
}

// ---------- elevated metro network ----------
type MetroTrain = { group:THREE.Group; curve:THREE.Curve<THREE.Vector3>; stationTs:number[]; offset:number; lineIndex:number; label?:THREE.Sprite };
const metroTrains:MetroTrain[]=[];
const metroTrackMat=new THREE.MeshStandardMaterial({color:0x555b60,roughness:0.48,metalness:0.62});
const metroBeamMat=new THREE.MeshStandardMaterial({color:0x6e7478,roughness:0.66,metalness:0.38});
const lineColors=[0xe34a45,0x2f74c0,0x4aa75f,0xf0b541,0x9b5db5,0x46a7ae];
const metroLines=METRO_LINES.map(l=>({...l,name:l.id}));

function addMetroStation(p:THREE.Vector3,lineName:string,lineIndex:number){
  const platform=new THREE.Mesh(new THREE.BoxGeometry(lineIndex===1||lineIndex===3||lineIndex===5?5.8:16,0.65,lineIndex===1||lineIndex===3||lineIndex===5?16:5.8),new THREE.MeshStandardMaterial({color:0xb9bec0,roughness:0.65,metalness:0.18}));
  platform.position.copy(p).add(new THREE.Vector3(0,-0.8,0));cityRoot.add(platform);
  const access=new THREE.Mesh(new THREE.BoxGeometry(1.8,p.y,1.8),metroBeamMat);access.position.set(p.x+3,p.y/2,p.z);cityRoot.add(access);
  if(graphics.metroDetail>=2){
    const canopy=new THREE.Mesh(new THREE.BoxGeometry(11,0.3,5.2),new THREE.MeshStandardMaterial({color:0x535b60,roughness:0.55,metalness:0.45}));canopy.position.copy(p).add(new THREE.Vector3(0,2.2,0));cityRoot.add(canopy);
    for(const sx of [-4,4]){const post=new THREE.Mesh(new THREE.BoxGeometry(0.18,3,0.18),metroBeamMat);post.position.copy(p).add(new THREE.Vector3(sx,0.6,0));cityRoot.add(post);}
    const sign=makeCanvasSprite(`${lineName} · HANSDREX SUBWAY`,20,1.0);sign.position.copy(p).add(new THREE.Vector3(0,3.2,0));cityRoot.add(sign);
  }
}
function addElevatedMetroLine(line:typeof metroLines[number],lineIndex:number){const pts=line.points.map(([x,z])=>new THREE.Vector3(x,line.height,z)),curve=new THREE.CurvePath<THREE.Vector3>();let total=0;const lens:number[]=[];
for(let i=0;i<pts.length-1;i++){const seg=new THREE.LineCurve3(pts[i],pts[i+1]);curve.add(seg);const len=pts[i].distanceTo(pts[i+1]);lens.push(len);total+=len;}const track=new THREE.Mesh(new THREE.TubeGeometry(curve,graphics.metroDetail>=2?64:36,0.82,graphics.metroDetail>=2?6:4,false),metroTrackMat);cityRoot.add(track);
for(let t=.06;t<1;t+=graphics.metroDetail>=2?.10:.17){const p=curve.getPointAt(t),support=new THREE.Mesh(new THREE.BoxGeometry(.6,line.height,.6),metroBeamMat);support.position.set(p.x,line.height/2,p.z);cityRoot.add(support);}const stationTs=[0];let acc=0;for(const len of lens){acc+=len;stationTs.push(acc/Math.max(1,total));}stationTs.forEach(t=>addMetroStation(curve.getPointAt(t),line.name,lineIndex));
const train=new THREE.Group(),cars=graphics.metroDetail>=2?3:2;for(let car=0;car<cars;car++){const cg=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(3.2,2.5,7.6),new THREE.MeshStandardMaterial({color:0xc6cbce,roughness:.28,metalness:.78}));cg.add(body);const stripe=new THREE.Mesh(new THREE.BoxGeometry(3.24,.22,7.66),new THREE.MeshBasicMaterial({color:lineColors[lineIndex]}));stripe.position.y=-.52;cg.add(stripe);cg.position.z=(car-(cars-1)/2)*8.05;
if(graphics.metroDetail>=1){for(const side of [-1,1])for(let w=-2;w<=2;w++){const window=new THREE.Mesh(new THREE.BoxGeometry(.06,.8,.75),landmarkCool);window.position.set(side*1.63,.4,w*1.25);cg.add(window);}}train.add(cg);}cityRoot.add(train);metroTrains.push({group:train,curve,stationTs,offset:lineIndex*2300,lineIndex});}
metroLines.forEach(addElevatedMetroLine);
for(const t of metroTrains){t.label=makeCanvasSprite(METRO_LINES[t.lineIndex].id,20,1.1);t.label.position.y=4;t.group.add(t.label);}
buildTrees();

cityRoot.traverse(obj=>{obj.updateMatrix();obj.matrixAutoUpdate=false;});
for(const train of metroTrains) train.group.matrixAutoUpdate=true;

let snapshotReceivedAt=0;
function updateMetroTrains(now:number){
 const seconds=(snapshot?.simulationAgeSeconds||0)/Math.max(1,snapshot?.timeScale||120)+Math.min(3,(now-snapshotReceivedAt)/1000);
 for(const train of metroTrains){
  const line=METRO_LINES[train.lineIndex],t=trainState(line,seconds);
  train.group.position.set(t.x,t.y,t.z);
  const a=line.points[t.from],b=line.points[t.to];train.group.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1]);
 }
}

// ---------- fly rendering ----------
type FlyVisual = {
  group: THREE.Group;
  target: THREE.Vector3;
  current: THREE.Vector3;
  halo: THREE.Mesh;
  status: THREE.Sprite;
  route:THREE.Vector3[];lastTraceTime:number;stationary:boolean;
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
  return { group, target: new THREE.Vector3(), current: new THREE.Vector3(), halo, status, route:[],lastTraceTime:-1,stationary:false };
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
    if(fly.currentLocationId==="rooftop"&&!fly.traveling){visual.target.set(11+seeded(Number(fly.id.replace(/\D/g,"")))*8,99,47);}
    visual.stationary=Boolean(fly.sleeping||!fly.traveling);
    const trace=(fly.movementTrace||[]).filter(p=>p.t>visual!.lastTraceTime);
    for(const p of trace){
      const last=visual.route.at(-1)||visual.current;
      if(!clearSegment({x:last.x,z:last.z},p)){visual.route=[];visual.current.set(p.x,p.y,p.z);}
      else visual.route.push(new THREE.Vector3(p.x,p.y,p.z));
    }
    visual.lastTraceTime=trace.at(-1)?.t??visual.lastTraceTime;
    if(visual.route.length>12)visual.route=visual.route.slice(-8);
    if(visual.stationary){visual.route=[];visual.current.copy(visual.target);}
    visual.group.visible=!fly.heliPassenger&&!fly.onTrain&&!fly.indoors;
    if(fly.currentLocationId==="rooftop"&&!fly.traveling)visual.group.visible=true;
    const ageScale = fly.ageYears < 18 ? 0.62 + fly.ageYears / 45 : fly.ageYears > 80 ? 0.9 : 1;
    const visibilityScale = graphicsPreset === "low" ? 1.55 : graphicsPreset === "medium" ? 1.35 : 1.18;
    visual.group.scale.setScalar(ageScale * visibilityScale);
    (visual.halo.material as THREE.MeshBasicMaterial).opacity = selectedFlyId === fly.id ? 0.85 : 0;
    const emoji = flyStatusEmoji(fly);
    const showStatus = Boolean(emoji) && (selectedFlyId===fly.id || graphics.metroDetail>=2);
    visual.status.visible = showStatus;
    if (showStatus) updateSpriteText(visual.status, emoji);
    if (Math.abs(fly.vx) + Math.abs(fly.vz) > 0.001) {
      visual.group.rotation.y = Math.atan2(fly.vx, fly.vz);
    }
  }

  for (const [id, visual] of flyVisuals) {
    if (!active.has(id)) {
      scene.remove(visual.group);
      for(let i=flyPickables.length-1;i>=0;i--)if(flyPickables[i].userData.flyId===id)flyPickables.splice(i,1);
      visual.status.material.map?.dispose();visual.status.material.dispose();
      flyVisuals.delete(id);
    }
  }
}


const homeVisuals=new Map<string,THREE.Group>();
const carVisuals=new Map<string,THREE.Group>();
function syncHomes(flies:FlyState[]){
 const occupied=new Set(flies.filter(f=>f.alive&&f.housingType==="house").map(f=>f.housingUnitId));
 for(const b of BUILDINGS.filter(b=>b.kind==="house")){
  if(!occupied.has(b.id)||homeVisuals.has(b.id))continue;
  const g=addBuilding(b.x,b.z,b.w-1,b.d-1,4.2,Math.abs(b.x+b.z),{residential:true});
  const roof=new THREE.Mesh(new THREE.ConeGeometry(5.2,2.6,4),new THREE.MeshStandardMaterial({color:0x775545,roughness:.9}));roof.rotation.y=Math.PI/4;roof.position.y=5.5;g.add(roof);homeVisuals.set(b.id,g);
 }
 for(const [id,g]of homeVisuals)g.visible=occupied.has(id);
 for(const f of flies){
  if(!f.alive||!f.vehicle?.includes("car"))continue;
  let g=carVisuals.get(f.id);
  if(!g){g=new THREE.Group();const paint=new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(seeded(Number(f.id.replace(/\D/g,"")))*1,.48,.43),metalness:.4,roughness:.3});const body=new THREE.Mesh(new THREE.BoxGeometry(1.8,.7,3.4),paint);body.position.y=.65;g.add(body);const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.5,.6,1.7),landmarkCool);cabin.position.y=1.2;g.add(cabin);for(const x of [-.9,.9])for(const z of [-1,1]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.2,8),trafficBoxMat);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.35,z);g.add(wheel);}scene.add(g);carVisuals.set(f.id,g);}
  const driving=f.traveling&&f.transitMode==="car";
  g.visible=Boolean(driving||f.parkedCar);
  if(driving){g.position.set(f.x,0,f.z);if(Math.abs(f.vx)+Math.abs(f.vz)>.01)g.rotation.y=Math.atan2(f.vx,f.vz);}
  else if(f.parkedCar)g.position.set(f.parkedCar.x,0,f.parkedCar.z);
 }
 const live=new Set(flies.filter(f=>f.alive&&f.vehicle?.includes("car")).map(f=>f.id));
 for(const [id,g]of carVisuals)if(!live.has(id)){scene.remove(g);carVisuals.delete(id);}
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
  freePosition.set(420, 290, 510);
  cameraYaw = -2.47;
  cameraPitch = -0.40;
  camera.fov = 52;
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

document.getElementById("park-view")?.addEventListener("click",()=>{
 followSelected=false;freePosition.set(205,235,105);
 const direction=new THREE.Vector3(PARK.x,12,PARK.z).sub(freePosition).normalize();cameraYaw=Math.atan2(direction.x,direction.z);cameraPitch=Math.asin(direction.y);
 camera.fov=50;camera.updateProjectionMatrix();
});
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
  if(document.querySelector<HTMLDialogElement>("#resident-directory")?.open)return;
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
addEventListener("blur",()=>{pressed.clear();dragging=false;document.querySelectorAll(".mobile-control.active").forEach(b=>b.classList.remove("active"));});
renderer.domElement.addEventListener("pointercancel",()=>{dragging=false;});
addEventListener("keyup", (e) => {pressed.delete(e.code);if (movementKeys.has(e.code)) e.preventDefault();});
document.querySelectorAll<HTMLButtonElement>(".mobile-control").forEach((button)=>{const key=button.dataset.key;if(!key)return;const down=(e:PointerEvent)=>{e.preventDefault();e.stopPropagation();followSelected=false;pressed.add(key);button.classList.add("active");try{button.setPointerCapture(e.pointerId);}catch{}};const up=(e:PointerEvent)=>{e.preventDefault();e.stopPropagation();pressed.delete(key);button.classList.remove("active");};button.addEventListener("pointerdown",down);button.addEventListener("pointerup",up);button.addEventListener("pointercancel",up);button.addEventListener("lostpointercapture",()=>{pressed.delete(key);button.classList.remove("active");});});

const mobileInspectorToggle=document.getElementById("mobile-inspector-toggle") as HTMLButtonElement | null;
mobileInspectorToggle?.addEventListener("click",(e)=>{
  e.preventDefault();e.stopPropagation();
  const open=document.body.classList.toggle("mobile-inspector-open");
  mobileInspectorToggle.setAttribute("aria-expanded",String(open));
  mobileInspectorToggle.textContent=open?"CLOSE INFO":"FLY INFO";
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
  if (matchMedia("(max-width:980px), (pointer:coarse)").matches) {
    document.body.classList.add("mobile-inspector-open");
    mobileInspectorToggle?.setAttribute("aria-expanded","true");
    if (mobileInspectorToggle) mobileInspectorToggle.textContent="CLOSE INFO";
  }
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

    freePosition.x = THREE.MathUtils.clamp(freePosition.x, -WORLD_HALF, WORLD_HALF);
    freePosition.z = THREE.MathUtils.clamp(freePosition.z, -WORLD_HALF, WORLD_HALF);
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
    const next=visual.route[0]||visual.target;
    visual.current.lerp(next,Math.min(1,dt*(visual.route.length>3?10:6)));
    if(visual.route.length&&visual.current.distanceTo(next)<.35)visual.route.shift();
    visual.group.position.copy(visual.current);
    const wingBeat = Math.sin(now * 0.035) * 0.08;
    visual.group.rotation.z = visual.stationary?0:wingBeat;
  }

  updateMetroTrains(now);
  updateParkWheel(now);
  heliTourGroup.position.lerp(heliTarget,heliGuestCount>0?.18:.08);
  heliRotor.rotation.y+=dt*18;
  heliRotorCross.rotation.y+=dt*18;
  heliTailRotor.rotation.x+=dt*24;
  if(heliGuestCount>0){
    const dx=heliTarget.x-heliTourGroup.position.x,dz=heliTarget.z-heliTourGroup.position.z;
    if(Math.abs(dx)+Math.abs(dz)>.05)heliTourGroup.rotation.y=Math.atan2(dx,dz);
  }else heliTourGroup.rotation.y*=.94;

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
