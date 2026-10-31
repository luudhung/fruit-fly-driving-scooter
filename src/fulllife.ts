import {CityMotion,type MotionPlan} from "./city-motion.ts";
import {CitySky,skyLight} from "./city-sky.ts";
import {INTERSECTIONS,signalState} from "../worker/traffic.mjs";
import {PersonalCars,type RoadIncident} from "./personal-cars.ts";
import {readCitySnapshot} from "./read-city-snapshot.ts";
import {CityClock} from "./city-clock.ts";
import * as THREE from "three";
import {InstancedResidents} from "./instanced-residents";
import {bindTouchControls,touchButtonSize,blockBrowserGestures} from "./touch-controls.ts";
import { CameraSprint } from "./camera-sprint";
import {buildMansion} from "./mansion-renderer.ts";
import {PlayerController} from "./player-controller.ts";
import {mansionSpawn} from "./mansion-layout.ts";
import {buildHansdrexTower,buildHansdrexEmpire,buildAirportAndIsland,updateLandmarkLighting} from "./city-landmarks";
import {scheduledAircraft,helicopterPose} from "../worker/aviation.mjs";
import { createResidentDirectory } from "./resident-directory";
import { MAP_VERSION, WORLD_HALF, AIRPORT, ISLAND, PARK, PARK_PATHS, PARK_PONDS, FERRIS_WHEEL, wheelCabin, RIVER, HARBOR, WATER, ROADS, BRIDGES, AVENUES, STREETS, BUILDINGS, METRO_LINES, WALKWAYS, contains, clearSegment, metroStationGeometry, trainState, type Building } from "../worker/city-map.mjs";

type FlyState = {
  motion?:MotionPlan|null;
  id: string;
  name: string;
  sex: "F" | "M";
  ageYears: number;
  generation: number;
  alive: boolean;
  traveling?:boolean; indoors?:boolean; onTrain?:boolean; metroLineId?:string; transitStage?:string|null; householdId?:string; housingUnitId?:string; housingType?:string;
  wheelRideUntil?:number;
  wheelSeat?:number|null;
  parkedCar?:{x:number;z:number;heading?:number}|null;
  vehicleLoan?:{balance:number;dailyPayment:number;annualRate:number};
  drivingStyle?:string;drivingExperiences?:number;drivingFines?:number;metroTransfers?:number;
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
  onPlane?:boolean;
  airTrip?:{phase:string;cost:number};
  heliTourStartedAt?:number;
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
    engine?:string;stepsPerCycle?:number;spikesThisBatch?:number;lastSyncAt?:number;
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
  roadTraffic?:{drivingCars:number;targetDrivingCars:number;carOwners:number;parkedCars:number;recklessDrivers:number;chaosActive:boolean;incidents:RoadIncident[]};
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
  welfare?:{birthGrantPerChild:number;essentialMealPrice:number;populationTarget?:number;immigrationThreshold?:number};
  parkLeisure?:{passengers:number;completedRides:number};
  aviation?:{fares:{roundTrip:number;oneWay:number;resortNight:number;helicopter:number;beachActivity:number};seats:number;heliSeats:number;nextCityFlight:{departure:number};nextIslandFlight:{departure:number};weatherClosed:boolean;passengers:number;holidaymakers:number;completedHolidays:number;helicopterGuests:number};
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
    allBrainsReady?:boolean;livingBrains?:number;intervalMs?:number;stepsPerCycle?:number;minNeuralSteps?:number;lastCompleteCycleAt?:number;
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
  low:    { pixelRatio: 0.82, fps: 24, maxFlies: 132, maxHomes: 24,  rain: 260,  treeScale: 0.30, streetTreeStep: 78, windowStride: 4, metroDetail: 0, trafficStride: 4 },
  medium: { pixelRatio: 1.00, fps: 30, maxFlies: 132, maxHomes: 48,  rain: 520,  treeScale: 0.52, streetTreeStep: 52, windowStride: 3, metroDetail: 1, trafficStride: 3 },
  high:   { pixelRatio: 1.18, fps: 40, maxFlies: 132, maxHomes: 72,  rain: 900,  treeScale: 0.76, streetTreeStep: 38, windowStride: 2, metroDetail: 2, trafficStride: 2 },
  ultra:  { pixelRatio: 1.50, fps: 50, maxFlies: 132, maxHomes: 100, rain: 1500, treeScale: 1.00, streetTreeStep: 28, windowStride: 1, metroDetail: 3, trafficStride: 1 },
} as const;
const MOBILE_GRAPHICS_PROFILES = {
  low:    { ...GRAPHICS_PROFILES.low,    pixelRatio:0.66, fps:22, rain:180, treeScale:0.24 },
  medium: { ...GRAPHICS_PROFILES.medium, pixelRatio:0.78, fps:26, rain:300, treeScale:0.40 },
  high:   { ...GRAPHICS_PROFILES.high,   pixelRatio:0.90, fps:30, rain:480, treeScale:0.56 },
  ultra:  { ...GRAPHICS_PROFILES.ultra,  pixelRatio:1.00, fps:34, rain:650, treeScale:0.68 },
} as const;
const savedGraphics = localStorage.getItem("fulllife_graphics");
const coarseDevice = matchMedia("(pointer:coarse)").matches || /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
const graphicsPreset: GraphicsPreset =
  savedGraphics === "medium" || savedGraphics === "high" || savedGraphics === "ultra" ? savedGraphics : "low";
// Mobile keeps the user's chosen quality, but uses Safari-safe budgets instead of silently forcing Low.
const graphics = coarseDevice ? MOBILE_GRAPHICS_PROFILES[graphicsPreset] : GRAPHICS_PROFILES[graphicsPreset];

const graphicsSelect = document.getElementById("graphics-preset") as HTMLSelectElement | null;
if (graphicsSelect) {
  graphicsSelect.value = graphicsPreset;
  graphicsSelect.addEventListener("change", () => {
    localStorage.setItem("fulllife_graphics", graphicsSelect.value);
    location.reload();
  });
}
const touchSizeInput=document.getElementById("touch-button-size") as HTMLInputElement|null;
const touchSizeValue=document.getElementById("touch-button-size-value");
let preferredTouchSize=72;
try{const saved=localStorage.getItem("fulllife_touch_button_size");if(saved!==null)preferredTouchSize=Number(saved);}catch{}
function applyTouchSize(){
 const {size,maximum}=touchButtonSize(preferredTouchSize,innerWidth);
 document.documentElement.style.setProperty("--touch-size",`${size}px`);
 document.body.classList.toggle("touch-controls-stacked",size*4+66>innerWidth);
 if(touchSizeInput){touchSizeInput.max=String(maximum);touchSizeInput.value=String(size);}
 if(touchSizeValue)touchSizeValue.textContent=`${size} px`;
}
touchSizeInput?.addEventListener("input",()=>{
 preferredTouchSize=Number(touchSizeInput.value);applyTouchSize();
 try{localStorage.setItem("fulllife_touch_button_size",String(preferredTouchSize));}catch{}
});
addEventListener("resize",applyTouchSize);applyTouchSize();
const settingsWrap = document.getElementById("settings-wrap");
const cityToolbar=document.querySelector<HTMLElement>(".topbar");
if(cityToolbar){
  const fitToolbar=()=>document.documentElement.style.setProperty("--toolbar-bottom",`${Math.ceil(cityToolbar.getBoundingClientRect().bottom)}px`);
  new ResizeObserver(fitToolbar).observe(cityToolbar);fitToolbar();
}
document.getElementById("settings-button")?.addEventListener("click", (event) => {
  event.stopPropagation();
  const open=settingsWrap?.classList.toggle("open");
  (event.currentTarget as HTMLElement).setAttribute("aria-expanded",String(Boolean(open)));
});
document.addEventListener("click", (event) => {
  if (settingsWrap && !settingsWrap.contains(event.target as Node)){settingsWrap.classList.remove("open");document.getElementById("settings-button")?.setAttribute("aria-expanded","false");}
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

window.addEventListener("error",(event)=>{
  console.error("[fulllife] runtime error",event.error||event.message);
  if(connection.dataset.state==="connecting")setConnection("connecting","GRAPHICS ERROR · CENSUS RETRYING ▾");
});
window.addEventListener("unhandledrejection",(event)=>{
  console.error("[fulllife] unhandled rejection",event.reason);
  if(connection.dataset.state==="connecting")setConnection("connecting","APP ERROR · CENSUS RETRYING ▾");
});

const apiBase = (import.meta.env.VITE_CIVILIZATION_API || "https://fruit-fly-civilization-free.luuhungdocs.workers.dev").replace(/\/$/, "");
const SNAPSHOT_CACHE_KEY = "fulllife:last-good-civilization-snapshot:v1";
const presentationClock=new CityClock();
let snapshot: CivilizationSnapshot | null = null;
let selectedFlyId: string | null = null;
let latestFlyStates = new Map<string, FlyState>();

function usableSnapshot(candidate: CivilizationSnapshot | null | undefined) {
  return Boolean(
    candidate &&
    Array.isArray(candidate.flies) &&
    candidate.flies.some((fly) => fly.alive) &&
    Number.isFinite(Number(candidate.simulationAgeSeconds)) &&
    Number(candidate.simulationAgeSeconds) >= 0
  );
}

function loadCachedSnapshot(): CivilizationSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CivilizationSnapshot;
    return usableSnapshot(cached) ? cached : null;
  } catch {
    return null;
  }
}

function saveCachedSnapshot(value: CivilizationSnapshot) {
  if (!usableSnapshot(value)) return;
  try { localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(value)); } catch {}
}

const residentDirectory=createResidentDirectory((id)=>{
 const fly=latestFlyStates.get(id);if(!fly?.alive)return;
 selectedFlyId=id;followSelected=false;renderInspector(fly);void fetchSnapshot();
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
  flyDebtEl.textContent = `${num(fly.debt + (fly.bankLoan || 0),1)} H$ + power ${num(fly.utilityDebt||0,1)} · ${fly.powerOn===false?"POWER CUT":"powered"} · ${fly.vehicle||fly.transitMode||"walk"}${fly.vehicleLoan?` · trả góp ${num(fly.vehicleLoan.balance,1)} H$ còn lại (${fly.vehicleLoan.dailyPayment}/ngày, 0%)`:""}${fly.vehicle?.includes("car")&&fly.drivingStyle?` · ${fly.drivingStyle==="reckless"?"lái liều":"lái cẩn thận"} · ${fly.drivingExperiences||0} kinh nghiệm · ${fly.drivingFines||0} lần phạt`:""}${fly.metroTransfers?` · ${fly.metroTransfers} lần đổi tuyến`:""}`;
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

  const modeledActivity = [
    fly.stress / 100,
    fly.hunger / 100,
    fly.excitement / 100,
    fly.happiness / 100,
    fly.energy / 100,
  ];
  const measured=Boolean(fc?.connected&&fc.fullConnectome);
  const activity=measured?(fc?.regionActivity||[]).map(v=>1-Math.exp(-v*95)):modeledActivity;
  const title=document.getElementById("brain-card-title");if(title)title.textContent=measured?'Measured FlyWire activity':'Modeled activity · brain pending';
  ([...brainGrid.children] as HTMLElement[]).forEach((cell, i) => {
    const a = activity[i % activity.length] ?? 0;
    cell.style.background = `rgba(102,227,157,${0.05 + a * 0.9})`;
    cell.style.boxShadow = a > 0.72 ? `0 0 8px rgba(102,227,157,${a * 0.65})` : "none";
  });
  brainNote.textContent = measured
    ? `${fly.brainId}: ${num(fc!.neurons)} neurons · ${num(fc!.edges)} connections · ${num(fc!.neuralStepsTotal)} LIF steps measured. The grid shows regional spike rates. Each step is 1 biological millisecond; budgeted batches run slower than biological real time.`
    : `${fly.brainId||'Brain'}: awaiting a full-connectome checkpoint. These bands show city-state inputs, not measured neuronal spikes.`;
}

function renderSnapshot(s: CivilizationSnapshot) {
  if(!presentationClock.accept(s.simulationAgeSeconds,performance.now(),s.timeScale||120))return;
  snapshot = s;
  snapshotReceivedAt=performance.now();
  const neuralLive = Boolean(s.neuralBridge?.allBrainsReady && s.neuralBridge?.independentDynamicState);
  const living=(s.flies||[]).filter(f=>f.alive);
  residentDirectory.update(living,s.deaths,s.births,s.mortality?.byCause);
  setConnection(s.authoritative?"authoritative":"offline",`${living.length} ALIVE · ${s.authoritative?(neuralLive?"FULL CONNECTOME":"CITY LIVE"):"LAST KNOWN"} ▾`);
  if(s.mapVersion!==MAP_VERSION)setConnection("connecting",`${living.length} ALIVE · WORKER UPDATE NEEDED ▾`);
  connection.title=`Open ${living.length} living residents. ${s.neuralBridge?.registeredBrains||0}/${living.length} independent full-connectome brains have fresh measured checkpoints.`;
  const neuralCensus=document.getElementById("neural-census"),neuralCadence=document.getElementById("neural-cadence");
  if(neuralCensus)neuralCensus.textContent=`${s.neuralBridge?.registeredBrains||0} / ${living.length} · ${neuralLive?'FULL GRAPH':'WARMING'}`;
  if(neuralCadence)neuralCadence.textContent=s.neuralBridge?.intervalMs?`${s.neuralBridge.stepsPerCycle||0} steps / ${Math.round(s.neuralBridge.intervalMs/60000)} min · ${s.neuralBridge.error?'retrying':'CPU budgeted'}`:'Preparing full FlyWire…';
  if(!s.authoritative)residentDirectory.offline();
  const policy=document.getElementById("welfare-policy");
  if(policy)policy.textContent=s.welfare?`Birth grant ${s.welfare.birthGrantPerChild.toLocaleString()} H$ / child · meals ${s.welfare.essentialMealPrice} H$ · water & park rides free · population target ${s.welfare.populationTarget||500} (immigration below ${s.welfare.immigrationThreshold||450}) · wheel ${s.parkLeisure?.passengers||0} riding / ${s.parkLeisure?.completedRides||0} completed`:'Awaiting public-support policy update';
  const air=s.aviation;
  const airBoard=document.getElementById("aviation-board");
  const fareBoard=document.getElementById("aviation-fares");
  const flightTime=(t:number)=>new Date(t*1000).toISOString().slice(11,16);
  if(airBoard&&air)airBoard.textContent=`${air.weatherClosed?'WEATHER HOLD':'FLIGHTS OPERATING'} · HCA → HIA ${flightTime(air.nextCityFlight.departure)} · HIA → HCA ${flightTime(air.nextIslandFlight.departure)} · ${air.passengers}/${air.seats} airborne · ${air.holidaymakers} on holiday · ${air.completedHolidays} returned`;
  if(fareBoard&&air)fareBoard.textContent=`Island return ${air.fares.roundTrip.toFixed(0)} H$ · full-board night ${air.fares.resortNight.toFixed(0)} H$ · kayak ${air.fares.beachActivity.toFixed(0)} H$ · skyline helicopter ${air.fares.helicopter.toFixed(0)} H$ / ${air.heliSeats} guests. Check in 30 game-min early. Return seat reserved; weather cancellations refunded.`;
  worldAge.textContent = formatAge(s.simulationAgeSeconds);
  population.textContent = `${num(living.length)} flies`;
  generation.textContent = num(s.generation);
  speed.textContent = "1s = 2m";
  const activity=document.getElementById("city-activity");if(activity)activity.textContent=s.activity?`${s.activity.working} working · ${s.activity.traveling} traveling · ${s.activity.indoors} indoors`:"Awaiting activity telemetry";
  const transit=document.getElementById("transit-activity");if(transit)transit.textContent=s.transit?`${s.transit.passengers} aboard · ${s.transit.waiting} waiting · ${s.transit.completedTrips} completed trips${s.roadTraffic?` · ${s.roadTraffic.drivingCars} ô tô đang chạy · ${s.roadTraffic.parkedCars} đỗ sát lề`:""}`:"Awaiting transit telemetry";
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
      e.type === "metro_boarding" ? "🚇 " :
      e.type === "heli_boarding" || e.type === "heli_trial_ticket" || e.type === "heli_trial_batch" ? "🚁 " :
      e.type === "heli_landing" || e.type === "heli_trial_complete" ? "🚁 " :
      e.type === "vehicle_purchase" ? "◆ " : "";
    row.textContent = `D${e.day ?? s.day} ${e.time || ""} · ${icon}${e.text}`;
    return row;
  }));
  if (!rows.length) events.textContent = "Civilization is running; no recent events.";

  latestFlyStates = new Map((s.flies || []).map((fly) => [fly.id, fly]));
  syncFlyMeshes(s.flies || []);
  updateHeliTourState(s.flies || []);
  updateMetroStationOccupancy(s.flies || []);
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
    heliTarget.set(lead.x,Math.max(lead.y,3),lead.z);
    heliOccupancy.visible=true;
  }else{
    heliTarget.copy(heliPadCenter).add(new THREE.Vector3(0,2.2,0));
    heliOccupancy.visible=graphics.metroDetail>=1;
  }
}

async function fetchSnapshotOnce() {
  // The civilization keeps running on Railway; hidden tabs do not need to poll/render it.
  if (document.hidden) return;
  let payload: CivilizationSnapshot;
  const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),12000);
  try {
    const response = await fetch(`${apiBase}/api/civilization/state?view=observer${selectedFlyId?`&selected=${encodeURIComponent(selectedFlyId)}`:""}`, {
      signal:controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await readCitySnapshot(response) as CivilizationSnapshot;
    if (!usableSnapshot(payload)) throw new Error("invalid or empty civilization snapshot");
    window.clearTimeout(timeout);
    if(snapshot&&payload.simulationAgeSeconds<snapshot.simulationAgeSeconds)return;
    saveCachedSnapshot(payload);
  } catch (error) {
    window.clearTimeout(timeout);
    console.error("[fulllife] civilization fetch failed", error);
    const cached = snapshot && usableSnapshot(snapshot) ? snapshot : loadCachedSnapshot();
    if (cached && (!snapshot || !usableSnapshot(snapshot))) {
      try {
        renderSnapshot({ ...cached, authoritative: false });
      } catch (renderError) {
        console.error("[fulllife] cached snapshot render failed", renderError);
      }
    }
    residentDirectory.offline();
    const lastSeen = snapshot?.flies?.filter((f) => f.alive).length || residentDirectory.count || 0;
    setConnection("offline", `OFFLINE · LAST GOOD ${lastSeen} ALIVE · RETRYING ▾`);
    if (!snapshot) events.textContent = "Civilization worker is unavailable; retrying automatically.";
    return;
  }
  try {
    renderSnapshot(payload);
  } catch (error) {
    // A WebGL/UI problem must never be reported as a dead civilization server.
    console.error("[fulllife] snapshot visual render failed", error);
    const living = (payload.flies || []).filter((f) => f.alive).length;
    setConnection(payload.authoritative ? "authoritative" : "connecting", `${living} ALIVE · CITY LIVE · VISUAL DEGRADED ▾`);
  }
}

// ---------- Three.js city ----------
const host = $("world");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x93b8cf);
scene.fog = new THREE.Fog(0x93b8cf, 520, 2400);

let snapshotFetchPending=false;
async function fetchSnapshot(){
 if(snapshotFetchPending||document.hidden)return;
 snapshotFetchPending=true;try{await fetchSnapshotOnce();}finally{snapshotFetchPending=false;}
}
addEventListener("visibilitychange",()=>{if(!document.hidden)void fetchSnapshot();});

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.08, 3000);
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  logarithmicDepthBuffer: true,
  powerPreference: coarseDevice || graphicsPreset === "low" ? "low-power" : "high-performance",
  precision: "highp",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, graphics.pixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = graphicsPreset === "ultra" ? 1.18 : graphicsPreset === "high" ? 1.14 : graphicsPreset === "medium" ? 1.10 : 1.06;
renderer.domElement.style.cursor = "grab";
host.appendChild(renderer.domElement);
renderer.domElement.dataset.depthMode="logarithmic-highp";
renderer.domElement.addEventListener("webglcontextlost",(event)=>{
  event.preventDefault();
  console.error("[fulllife] WebGL context lost");
  setConnection("connecting","GRAPHICS RECOVERING · CITY STILL RUNNING ▾");
  if(!sessionStorage.getItem("fulllife_gpu_retry")){
    sessionStorage.setItem("fulllife_gpu_retry","1");
    localStorage.setItem("fulllife_graphics","low");
    window.setTimeout(()=>location.reload(),250);
  }
});

const hemi = new THREE.HemisphereLight(0xeaf7ff, 0x465a43, 1.85);
scene.add(hemi);
// Cheap "fake sun": one fixed warm key light + hemisphere fill, no shadows and no astronomical tracking.
const sun = new THREE.DirectionalLight(0xffe0aa, 2.6);
sun.position.set(-170, 230, 140);
sun.castShadow = false;
scene.add(sun);
const sunFill = new THREE.DirectionalLight(0xffc98f, 0.42);
sunFill.position.set(190, 120, -160);
sunFill.castShadow = false;
scene.add(sunFill);
const moon = new THREE.DirectionalLight(0xa9c3ff, 0.35);
moon.position.set(130, 120, -150);
scene.add(moon);
const citySky=new CitySky(scene,coarseDevice?500:900);

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

const windowMaterials: THREE.MeshBasicMaterial[] = [];
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
const laneMat = new THREE.MeshBasicMaterial({
  color: 0xe9dfb1,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -4,
  polygonOffsetUnits: -4,
});
const parkMat = new THREE.MeshStandardMaterial({ color: 0x4f8459, roughness: 1 });
const plazaMat = new THREE.MeshStandardMaterial({ color: 0xc7c3b8, roughness: 1 });

const avenueXs = AVENUES;
const streetZs = STREETS;

function addRoadStrip(x: number, z: number, w: number, d: number, avenue = false) {
  // Keep each road layer physically separated in Y. This prevents distant-camera z-fighting.
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 6, 0.06, d + 6), sidewalkMat);
  base.position.set(x, 0.03, z);
  cityRoot.add(base);

  const road = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), roadMat);
  road.position.set(x, 0.10, z);
  cityRoot.add(road);

  const sidewalkOffset = (avenue ? w : d) / 2 + 1.55;
  for (const side of [-1, 1]) {
    const walk = new THREE.Mesh(
      avenue ? new THREE.BoxGeometry(2.6, 0.18, d + 5) : new THREE.BoxGeometry(w + 5, 0.18, 2.6),
      sidewalkMat,
    );
    walk.position.set(avenue ? x + side * sidewalkOffset : x, 0.15, avenue ? z : z + side * sidewalkOffset);
    cityRoot.add(walk);
  }

  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(avenue ? 0.16 : w * 0.92, 0.008, avenue ? d * 0.92 : 0.16),
    laneMat,
  );
  marker.position.set(x, 0.151, z);
  cityRoot.add(marker);
}

for(const road of ROADS)addRoadStrip(road.x,road.z,road.w,road.d,road.d>road.w);

// Traffic signals and marked pedestrian crossings. Low quality renders fewer junctions.
type TrafficSignalVisual = { axis:"ns"|"ew"; offset:number; red:THREE.MeshBasicMaterial; yellow:THREE.MeshBasicMaterial; green:THREE.MeshBasicMaterial };
const trafficSignals: TrafficSignalVisual[] = [];
const trafficPoleMat = new THREE.MeshStandardMaterial({ color:0x303638, roughness:0.72, metalness:0.42 });
const trafficBoxMat = new THREE.MeshStandardMaterial({ color:0x111615, roughness:0.82 });
const trafficBulbGeo = new THREE.SphereGeometry(0.16, 7, 5);
const crossingMat = new THREE.MeshBasicMaterial({
  color:0xf1f2ed,
  toneMapped:false,
  polygonOffset:true,
  polygonOffsetFactor:-7,
  polygonOffsetUnits:-7,
});

function addTrafficHead(x:number,z:number,axis:"ns"|"ew",offset:number) {
  const g=new THREE.Group();
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,3.2,6),trafficPoleMat); pole.position.y=1.6; g.add(pole);
  const box=new THREE.Mesh(new THREE.BoxGeometry(0.56,1.28,0.34),trafficBoxMat); box.position.y=3.1; if(axis==="ew") box.rotation.y=Math.PI/2; g.add(box);
  const red=new THREE.MeshBasicMaterial({color:0x3a0808}), yellow=new THREE.MeshBasicMaterial({color:0x302707}), green=new THREE.MeshBasicMaterial({color:0x07351c});
  [red,yellow,green].forEach((mat,i)=>{ const bulb=new THREE.Mesh(trafficBulbGeo,mat); bulb.position.set(axis==="ew"?0.19:0,3.48-i*0.39,axis==="ns"?0.19:0); g.add(bulb); });
  g.position.set(x,0,z); cityRoot.add(g); trafficSignals.push({axis,offset,red,yellow,green});
}
function addCrossing(x:number,z:number) {
  for(const dx of [-2.4,-0.8,0.8,2.4]){const m=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.008,3.2),crossingMat);m.position.set(x+dx,0.165,z-6.1);cityRoot.add(m);}
  for(const dz of [-2.4,-0.8,0.8,2.4]){const m=new THREE.Mesh(new THREE.BoxGeometry(3.2,0.008,0.8),crossingMat);m.position.set(x-6.2,0.166,z+dz);cityRoot.add(m);}
}
for(const [index,{x,z}]of INTERSECTIONS.entries()){
 if(index%graphics.trafficStride)continue;
 addTrafficHead(x+6.4,z+6.2,"ns",0);addTrafficHead(x-6.4,z-6.2,"ew",0);addCrossing(x,z);
}
function updateTrafficSignals(seconds:number){
  for(const s of trafficSignals){
    const state=signalState(seconds+s.offset,s.axis),green=state==="green",yellow=state==="yellow",red=state==="red";
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
 const seconds=presentationClock.read(now);
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
  if(h>55){
    const cap=new THREE.Mesh(new THREE.BoxGeometry(w*.65,3.2,d*.65),new THREE.MeshStandardMaterial({color:0x718993,roughness:.4,metalness:.4}));cap.position.y=h+1.6;group.add(cap);
    const trim=new THREE.Mesh(new THREE.BoxGeometry(w+.12,.16,d+.12),new THREE.MeshBasicMaterial({color:options.residential?0xe0be88:0x86b9c4}));trim.position.y=h-.5;group.add(trim);
  }


  // Windows are fixed façade pixels: unlit/basic material means camera/light direction cannot make
  // them "slide" over the wall. A small physical offset also removes z-fighting shimmer.
  const windowMat = new THREE.MeshBasicMaterial({
    color: 0xe7b85f,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  windowMaterials.push(windowMat);
  const floors=Math.max(2,Math.floor(h/3.1)), colsX=Math.max(2,Math.floor(w/2.7)), colsZ=Math.max(2,Math.floor(d/2.7));
  const matrices:THREE.Matrix4[]=[]; const dummy=new THREE.Object3D();
  for(let floor=0;floor<floors;floor+=graphics.windowStride){
    const wy=1.8+floor*2.9; if(wy>h-0.65) continue;
    for(let col=0;col<colsX;col+=graphics.windowStride){const wx=-w/2+1.25+col*((w-2.5)/Math.max(1,colsX-1));for(const face of [-1,1]){dummy.position.set(wx,wy,face*(d/2+0.09));dummy.scale.set(0.92,1.12,0.025);dummy.updateMatrix();matrices.push(dummy.matrix.clone());}}
    for(let col=0;col<colsZ;col+=graphics.windowStride){const wz=-d/2+1.25+col*((d-2.5)/Math.max(1,colsZ-1));for(const face of [-1,1]){dummy.position.set(face*(w/2+0.09),wy,wz);dummy.scale.set(0.025,1.12,0.92);dummy.updateMatrix();matrices.push(dummy.matrix.clone());}}
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

// Building topology is authoritative city data and MUST NOT change with graphics quality.
const renderableCityBuildings=BUILDINGS.filter(b=>b.kind==="block"||b.kind==="apartment");
for(const b of renderableCityBuildings)addBuilding(b.x,b.z,b.w,b.d,b.h,Math.abs(b.x*17+b.z),{glass:b.h>40,residential:b.kind==="apartment"});

// Hansdrex iconic skyline — stylized landmark references on reserved central plots.
const landmarkWarm=new THREE.MeshStandardMaterial({color:0xe6c98d,emissive:0xffc85a,emissiveIntensity:1.15,roughness:0.35});
const landmarkCool=new THREE.MeshStandardMaterial({color:0x8db9d0,emissive:0x3c9fd4,emissiveIntensity:0.95,roughness:0.28});
const landmarkMetal=new THREE.MeshStandardMaterial({color:0xaeb6b9,roughness:0.38,metalness:0.58});
buildHansdrexEmpire(cityRoot,makeCanvasSprite);
buildHansdrexTower(cityRoot,makeCanvasSprite);
const aviationVisual=buildAirportAndIsland(cityRoot,makeCanvasSprite);
buildMansion(cityRoot,makeCanvasSprite);

const heliPadCenter=new THREE.Vector3(AIRPORT.helipad.x,AIRPORT.helipad.y,AIRPORT.helipad.z);
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

function addPetronasTwinTowers(x:number,z:number){const g=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:0xb8c1c4,roughness:0.30,metalness:0.68});for(const sx of [-3.1,3.1]){const tg=new THREE.Group();for(let i=0;i<6;i++){const r=2.35-i*.18,h=12.2-i*.35,seg=new THREE.Mesh(new THREE.CylinderGeometry(r*.86,r,h,10),m);seg.position.y=7+i*13;tg.add(seg);}const crown=new THREE.Mesh(new THREE.CylinderGeometry(.7,1.8,10,9),m);crown.position.y=87;tg.add(crown);const spire=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.5,22,7),landmarkMetal);spire.position.y=104;tg.add(spire);tg.position.x=sx;g.add(tg);}const bridge=new THREE.Mesh(new THREE.BoxGeometry(6.2,1.5,2),landmarkWarm);bridge.position.y=52;g.add(bridge);g.position.set(x,0,z);cityRoot.add(g);}
addPetronasTwinTowers(41,43.5);
const petronasLabel=makeCanvasSprite("HANSDREX PETRONAS",22,1.15);petronasLabel.position.set(41,119,43.5);cityRoot.add(petronasLabel);

function addBurjKhalifaStyle(x:number,z:number){
 const g=new THREE.Group(),
   glass=new THREE.MeshStandardMaterial({color:0x89aebf,roughness:.2,metalness:.52}),
   silver=new THREE.MeshStandardMaterial({color:0xcbd2d4,roughness:.28,metalness:.74}),
   coolGlow=new THREE.MeshBasicMaterial({color:0xd7f5ff,toneMapped:false}),
   warmGlow=new THREE.MeshBasicMaterial({color:0xffd89a,toneMapped:false});
 let y=0;
 const tiers=[[13,40],[11.2,34],[9.4,30],[7.7,25],[6.1,21],[4.6,17]] as const;
 tiers.forEach(([r,h],i)=>{
   const tierBase=y;
   const seg=new THREE.Mesh(new THREE.CylinderGeometry(r*.72/2,r/2,h,10),i%2?silver:glass);
   seg.position.y=tierBase+h/2;seg.rotation.y=i*.17;g.add(seg);
   // Thin fake-light bands and vertical accents give the tower a night identity without PointLights.
   const ring=new THREE.Mesh(new THREE.TorusGeometry(r*.44,.075,5,22),i%2?warmGlow:coolGlow);
   ring.rotation.x=Math.PI/2;ring.position.y=tierBase+h*.80;g.add(ring);
   for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
     const rr=r*.37;
     const strip=new THREE.Mesh(new THREE.BoxGeometry(.11,h*.72,.11),coolGlow);
     strip.position.set(Math.cos(a)*rr,tierBase+h*.46,Math.sin(a)*rr);g.add(strip);
   }
   y+=h-2;
 });
 const crown=new THREE.Mesh(new THREE.CylinderGeometry(.65,2.0,18,9),silver);crown.position.y=y+9;g.add(crown);
 const crownGlow=new THREE.Mesh(new THREE.CylinderGeometry(.20,.62,14,8),warmGlow);crownGlow.position.y=y+12;g.add(crownGlow);
 const spire=new THREE.Mesh(new THREE.CylinderGeometry(.12,.42,42,7),silver);spire.position.y=y+37;g.add(spire);
 const spireGlow=new THREE.Mesh(new THREE.CylinderGeometry(.055,.13,39,6),coolGlow);spireGlow.position.y=y+37.5;g.add(spireGlow);
 const baseHalo=new THREE.Mesh(new THREE.TorusGeometry(6.2,.11,6,28),warmGlow);baseHalo.rotation.x=Math.PI/2;baseHalo.position.y=.18;g.add(baseHalo);
 const sign=makeCanvasSprite("BURJ KHALIFA · HANSDREX",26,1.35);sign.position.set(0,194,0);g.add(sign);
 g.position.set(x,0,z);cityRoot.add(g);
}
addBurjKhalifaStyle(236,72.5);

function addMarinaBaySandsStyle(x:number,z:number){
 const g=new THREE.Group(),
   glass=new THREE.MeshStandardMaterial({color:0x7597a7,roughness:.22,metalness:.38}),
   stone=new THREE.MeshStandardMaterial({color:0xc7c3b8,roughness:.55,metalness:.12}),
   warmGlow=new THREE.MeshBasicMaterial({color:0xffdf9c,toneMapped:false}),
   coolGlow=new THREE.MeshBasicMaterial({color:0xbcecff,toneMapped:false}),
   poolGlow=new THREE.MeshBasicMaterial({color:0x64e8ff,toneMapped:false});
 for(const sx of [-14,0,14]){
  const tg=new THREE.Group();
  const tower=new THREE.Mesh(new THREE.BoxGeometry(10,68,13),glass);tower.position.y=34;tg.add(tower);
  const base=new THREE.Mesh(new THREE.BoxGeometry(12,5,15),stone);base.position.y=2.5;tg.add(base);
  // Stable facade windows: unlit rectangles sit clearly in front of glass, so they do not shimmer.
  const windowMatrices:THREE.Matrix4[]=[];const dummy=new THREE.Object3D();
  for(let floor=0;floor<15;floor++){
    const wy=7+floor*3.8;
    for(const wx of [-2.7,0,2.7])for(const face of [-1,1]){
      dummy.position.set(wx,wy,face*6.57);dummy.scale.set(1.45,.72,.025);dummy.updateMatrix();windowMatrices.push(dummy.matrix.clone());
    }
  }
  const windows=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),warmGlow,windowMatrices.length);
  windowMatrices.forEach((m,i)=>windows.setMatrixAt(i,m));windows.instanceMatrix.needsUpdate=true;tg.add(windows);
  const edgeL=new THREE.Mesh(new THREE.BoxGeometry(.11,63,.11),coolGlow);edgeL.position.set(-4.96,35,6.58);tg.add(edgeL);
  const edgeR=edgeL.clone();edgeR.position.x=4.96;tg.add(edgeR);
  tg.position.x=sx;tg.rotation.z=-sx*.0022;g.add(tg);
 }
 const deck=new THREE.Mesh(new THREE.BoxGeometry(44,4.2,8),stone);deck.position.y=71;g.add(deck);
 const deckTop=new THREE.Mesh(new THREE.BoxGeometry(44.4,.16,8.4),warmGlow);deckTop.position.y=73.18;g.add(deckTop);
 const underDeck=new THREE.Mesh(new THREE.BoxGeometry(42,.12,1.2),warmGlow);underDeck.position.set(0,68.86,3.95);g.add(underDeck);
 const bow=new THREE.Mesh(new THREE.CylinderGeometry(4,4,4.2,20),stone);bow.rotation.z=Math.PI/2;bow.position.set(22,71,0);g.add(bow);
 const pool=new THREE.Mesh(new THREE.BoxGeometry(29,.38,4.2),poolGlow);pool.position.set(2,73.45,0);g.add(pool);
 const poolEdge=new THREE.Mesh(new THREE.BoxGeometry(30,.10,4.65),coolGlow);poolEdge.position.set(2,73.66,0);g.add(poolEdge);
 const sign=makeCanvasSprite("MARINA BAY SANDS · HANSDREX",31,1.5);sign.position.set(0,82,0);g.add(sign);
 g.position.set(x,0,z);cityRoot.add(g);
}
addMarinaBaySandsStyle(340,320);
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
const powerBuilding=BUILDINGS.find(b=>b.id==="power") || {x:-285,z:-75};
addPowerPlant(powerBuilding.x,powerBuilding.z);

// Hansdrex Farm in a reserved agricultural district.
const farmSoil=new THREE.MeshStandardMaterial({color:0x6e5738,roughness:1}),cropMat=new THREE.MeshStandardMaterial({color:0x6f8f45,roughness:1});
for(let row=0;row<7;row+=1){const z=108+row*5.3,soil=new THREE.Mesh(new THREE.BoxGeometry(42,0.08,2.2),farmSoil);soil.position.set(-285,0.08,z);cityRoot.add(soil);const crops=new THREE.Mesh(new THREE.BoxGeometry(40,0.42,0.9),cropMat);crops.position.set(-285,0.31,z);cityRoot.add(crops);}
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
const metroStationDisplays:Array<{lineId:string;index:number;x:number;z:number;label:THREE.Sprite}>=[];
const metroTrackMat=new THREE.MeshStandardMaterial({color:0x555b60,roughness:0.42,metalness:0.72});
const metroSleeperMat=new THREE.MeshStandardMaterial({color:0x4a4038,roughness:0.88,metalness:0.10});
const metroBeamMat=new THREE.MeshStandardMaterial({color:0x6e7478,roughness:0.66,metalness:0.38});
const metroPlatformMat=new THREE.MeshStandardMaterial({color:0xb9bec0,roughness:0.72,metalness:0.12});
const metroStepMat=new THREE.MeshStandardMaterial({color:0x8e9497,roughness:0.82,metalness:0.16});
const lineColors=[0xe34a45,0x2f74c0,0x4aa75f,0xf0b541,0x9b5db5,0x46a7ae];
const metroLines=METRO_LINES.map(l=>({...l,name:l.id}));

function addMetroStaircase(from:{x:number;z:number;y:number},to:{x:number;z:number;y:number}){
 const steps=9;
 for(let i=0;i<steps;i++){
   const u0=i/steps,u1=(i+1)/steps;
   const x=from.x+(to.x-from.x)*(u0+u1)/2;
   const z=from.z+(to.z-from.z)*(u0+u1)/2;
   const y=from.y+(to.y-from.y)*u1*.5+(from.y+(to.y-from.y)*u0)*.5;
   const dx=(to.x-from.x)/steps,dz=(to.z-from.z)/steps,len=Math.hypot(dx,dz);
   const step=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.95,len+.35),.22,2.0),metroStepMat);
   step.position.set(x,y,z);
   step.rotation.y=Math.atan2(dx,dz)-Math.PI/2;
   cityRoot.add(step);
 }
}

function addMetroStation(line:typeof metroLines[number],index:number,lineIndex:number){
  const geo=metroStationGeometry(line,index);
  const horizontal=geo.axis==="x";
  const platform=new THREE.Mesh(new THREE.BoxGeometry(horizontal?16:4.8,.55,horizontal?4.8:16),metroPlatformMat);
  platform.position.set(geo.platform.x,geo.platform.y-.30,geo.platform.z);cityRoot.add(platform);
  const edgeMat=new THREE.MeshBasicMaterial({color:lineColors[lineIndex],toneMapped:false});
  const edge=new THREE.Mesh(new THREE.BoxGeometry(horizontal?15.4:.16,.08,horizontal ? .16 : 15.4),edgeMat);
  const towardTrack=new THREE.Vector3(geo.track.x-geo.platform.x,0,geo.track.z-geo.platform.z).normalize();
  edge.position.set(geo.platform.x+towardTrack.x*2.15,geo.platform.y+.03,geo.platform.z+towardTrack.z*2.15);cityRoot.add(edge);
  addMetroStaircase(geo.access,geo.platform);
  const interchangeLines=METRO_LINES.filter(other=>other.id!==line.id&&other.points.some(([x,z])=>x===line.points[index][0]&&z===line.points[index][1])).map(other=>other.id);
  const accessSign=makeCanvasSprite(`${line.id} METRO ↑${interchangeLines.length?` · ↔ ${interchangeLines.join(" / ")}`:""}`,18,.85);accessSign.position.set(geo.access.x,3.1,geo.access.z);cityRoot.add(accessSign);
  if(graphics.metroDetail>=1){
    const canopy=new THREE.Mesh(new THREE.BoxGeometry(horizontal?12:4.4,.28,horizontal?4.4:12),new THREE.MeshStandardMaterial({color:0x535b60,roughness:0.55,metalness:0.45}));
    canopy.position.set(geo.platform.x,geo.platform.y+2.55,geo.platform.z);cityRoot.add(canopy);
    for(const s of [-1,1]){
      const post=new THREE.Mesh(new THREE.BoxGeometry(.16,2.7,.16),metroBeamMat);
      post.position.set(geo.platform.x+(horizontal?s*5:0),geo.platform.y+1.25,geo.platform.z+(horizontal?0:s*5));cityRoot.add(post);
    }
  }
  const sign=makeCanvasSprite(`${line.id} · HANSDREX METRO`,20,1.0);sign.position.set(geo.platform.x,geo.platform.y+3.45,geo.platform.z);cityRoot.add(sign);
  const waitingLabel=makeCanvasSprite(`${line.id} · 0 WAITING`,17,.82);waitingLabel.position.set(geo.platform.x,geo.platform.y+2.25,geo.platform.z);cityRoot.add(waitingLabel);
  metroStationDisplays.push({lineId:line.id,index,x:geo.platform.x,z:geo.platform.z,label:waitingLabel});
}

function addRailSegment(a:THREE.Vector3,b:THREE.Vector3,lineIndex:number){
 const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),horizontal=Math.abs(dx)>=Math.abs(dz);
 const cx=(a.x+b.x)/2,cz=(a.z+b.z)/2,y=a.y;
 const bed=new THREE.Mesh(new THREE.BoxGeometry(horizontal?len:3.4,.24,horizontal?3.4:len),metroBeamMat);
 bed.position.set(cx,y-.48,cz);cityRoot.add(bed);
 for(const side of [-1,1]){
   const rail=new THREE.Mesh(new THREE.BoxGeometry(horizontal?len:.20,.22,horizontal ? .20 : len),metroTrackMat);
   rail.position.set(cx+(horizontal?0:side*1.05),y-.20,cz+(horizontal?side*1.05:0));cityRoot.add(rail);
 }
 const sleeperCount=Math.max(2,Math.floor(len/4.5));
 for(let i=0;i<=sleeperCount;i++){
   const u=i/sleeperCount,x=a.x+dx*u,z=a.z+dz*u;
   const sleeper=new THREE.Mesh(new THREE.BoxGeometry(horizontal ? .30 : 3.05,.12,horizontal?3.05:.30),metroSleeperMat);
   sleeper.position.set(x,y-.34,z);cityRoot.add(sleeper);
 }
 const supportEvery=26;
 for(let d=supportEvery/2;d<len;d+=supportEvery){
   const u=d/len,x=a.x+dx*u,z=a.z+dz*u;
   const support=new THREE.Mesh(new THREE.BoxGeometry(.72,y-.55,.72),metroBeamMat);
   support.position.set(x,(y-.55)/2,z);cityRoot.add(support);
 }
}

function addElevatedMetroLine(line:typeof metroLines[number],lineIndex:number){
 const pts=line.points.map(([x,z])=>new THREE.Vector3(x,line.height,z)),curve=new THREE.CurvePath<THREE.Vector3>();let total=0;const lens:number[]=[];
 for(let i=0;i<pts.length-1;i++){
   const seg=new THREE.LineCurve3(pts[i],pts[i+1]);curve.add(seg);
   const len=pts[i].distanceTo(pts[i+1]);lens.push(len);total+=len;
   addRailSegment(pts[i],pts[i+1],lineIndex);
 }
 const stationTs=[0];let acc=0;for(const len of lens){acc+=len;stationTs.push(acc/Math.max(1,total));}
 line.points.forEach((_,i)=>addMetroStation(line,i,lineIndex));

 const train=new THREE.Group(),cars=graphics.metroDetail>=2?3:2;
 for(let car=0;car<cars;car++){
   const cg=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(3.2,2.5,7.6),new THREE.MeshStandardMaterial({color:0xc6cbce,roughness:.28,metalness:.78}));cg.add(body);
   const stripe=new THREE.Mesh(new THREE.BoxGeometry(3.24,.22,7.66),new THREE.MeshBasicMaterial({color:lineColors[lineIndex]}));stripe.position.y=-.52;cg.add(stripe);cg.position.z=(car-(cars-1)/2)*8.05;
   if(graphics.metroDetail>=1){for(const side of [-1,1])for(let w=-2;w<=2;w++){const window=new THREE.Mesh(new THREE.BoxGeometry(.06,.8,.75),landmarkCool);window.position.set(side*1.63,.4,w*1.25);cg.add(window);}}
   train.add(cg);
 }
 cityRoot.add(train);metroTrains.push({group:train,curve,stationTs,offset:lineIndex*2300,lineIndex});
}
metroLines.forEach(addElevatedMetroLine);
for(const t of metroTrains){t.label=makeCanvasSprite(METRO_LINES[t.lineIndex].id,20,1.1);t.label.position.y=4;t.group.add(t.label);}
buildTrees();

cityRoot.traverse(obj=>{obj.updateMatrix();obj.matrixAutoUpdate=false;});
for(const train of metroTrains) train.group.matrixAutoUpdate=true;
// These parts move every frame and must not inherit the static-city matrix freeze.
wheelRotor.matrixAutoUpdate=true;
for(const cabin of wheelCabins)cabin.matrixAutoUpdate=true;
aviationVisual.plane.matrixAutoUpdate=true;
for(const prop of aviationVisual.propellers)prop.matrixAutoUpdate=true;
heliTourGroup.matrixAutoUpdate=true;
heliRotor.matrixAutoUpdate=true;
heliRotorCross.matrixAutoUpdate=true;
heliTailRotor.matrixAutoUpdate=true;

let snapshotReceivedAt=0;
function updateMetroStationOccupancy(flies:FlyState[]){
  for(const station of metroStationDisplays){
    const waiting=flies.filter((f)=>f.alive&&f.metroLineId===station.lineId&&f.transitStage==="platform-wait"&&Math.hypot(f.x-station.x,f.z-station.z)<9).length;
    updateSpriteText(station.label,`${station.lineId} · ${waiting} WAITING`);
    station.label.visible=waiting>0||graphics.metroDetail>=1;
  }
}

function updateMetroTrains(now:number){
 const seconds=presentationClock.read(now)/Math.max(1,snapshot?.timeScale||120);
 for(const train of metroTrains){
  const line=METRO_LINES[train.lineIndex],t=trainState(line,seconds);
  train.group.position.set(t.x,t.y,t.z);
  const a=line.points[t.from],b=line.points[t.to];train.group.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1]);
 }
}

// ---------- fly rendering ----------
type FlyVisual = {
  motion:CityMotion;hasMotion:boolean;
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
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
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

const MAX_RENDERED_FLIES = 600;
const flyVisuals = new Map<string, FlyVisual>();
const residentBodies=new InstancedResidents(scene,640);
const flyPickables=residentBodies.pickables;

function createFlyVisual(id: string): FlyVisual {
  const group = new THREE.Group();
  group.scale.setScalar(graphicsPreset === "low" ? 1.55 : graphicsPreset === "medium" ? 1.35 : 1.18);

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.82, 10),
    new THREE.MeshBasicMaterial({ color: 0xffe48a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite:false }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -0.58;
  group.add(halo);

  // No canvas texture is allocated until this fly actually needs a visible status icon.
  const status = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
  status.scale.set(2.8, 1.4, 1);
  status.userData.text = "";
  status.position.set(0, 1.45, 0);
  status.visible = false;
  group.add(status);


  // Child geometry is static relative to the fly; only the parent group moves.
  group.children.forEach((child) => {
    child.updateMatrix();
    child.matrixAutoUpdate = false;
  });
  scene.add(group);
  return { motion:new CityMotion(),hasMotion:false,group, target: new THREE.Vector3(), current: new THREE.Vector3(), halo, status, route:[],lastTraceTime:-1,stationary:false };
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
    visual.hasMotion=Boolean(fly.motion&&!visual.stationary);
    if(fly.motion)visual.motion.accept(fly,fly.motion);
    const trace=(fly.movementTrace||[]).filter(p=>p.t>visual!.lastTraceTime);
    for(const p of visual.hasMotion?[]:trace){
      const last=visual.route.at(-1)||visual.current;
      if(!clearSegment({x:last.x,z:last.z},p)){visual.route=[];visual.current.set(p.x,p.y,p.z);}
      else visual.route.push(new THREE.Vector3(p.x,p.y,p.z));
    }
    visual.lastTraceTime=trace.at(-1)?.t??visual.lastTraceTime;
    if(visual.route.length>12)visual.route=visual.route.slice(-8);
    if(visual.stationary){visual.route=[];visual.current.copy(visual.target);}
    visual.group.visible=!fly.onPlane&&!fly.heliPassenger&&!fly.onTrain&&!fly.indoors&&!(fly.traveling&&fly.transitMode==="car");
    if(fly.currentLocationId==="rooftop"&&!fly.traveling)visual.group.visible=true;
    const ageScale = fly.ageYears < 18 ? 0.62 + fly.ageYears / 45 : fly.ageYears > 80 ? 0.9 : 1;
    const visibilityScale = graphicsPreset === "low" ? 1.55 : graphicsPreset === "medium" ? 1.35 : 1.18;
    visual.group.scale.setScalar(ageScale * visibilityScale);
    (visual.halo.material as THREE.MeshBasicMaterial).opacity = .85;visual.halo.visible=selectedFlyId===fly.id;
    const emoji = flyStatusEmoji(fly);
    const showStatus = Boolean(emoji) && selectedFlyId===fly.id;
    visual.status.visible = showStatus;
    if (showStatus) updateSpriteText(visual.status, emoji);

  }

  for (const [id, visual] of flyVisuals) {
    if (!active.has(id)) {
      scene.remove(visual.group);

      visual.status.material.map?.dispose();visual.status.material.dispose();
      flyVisuals.delete(id);
    }
  }
}


const homeVisuals=new Map<string,THREE.Group>();
const personalCars=new PersonalCars(scene);
function syncHomes(flies:FlyState[]){
 const occupied=new Set(flies.filter(f=>f.alive&&f.housingType==="house").map(f=>f.housingUnitId));
 for(const b of BUILDINGS.filter(b=>b.kind==="house")){
  if(!occupied.has(b.id)||homeVisuals.has(b.id))continue;
  const g=addBuilding(b.x,b.z,b.w-1,b.d-1,4.2,Math.abs(b.x+b.z),{residential:true});
  const roof=new THREE.Mesh(new THREE.ConeGeometry(5.2,2.6,4),new THREE.MeshStandardMaterial({color:0x775545,roughness:.9}));roof.rotation.y=Math.PI/4;roof.position.y=5.5;g.add(roof);homeVisuals.set(b.id,g);
 }
 for(const [id,g]of homeVisuals)g.visible=occupied.has(id);
 personalCars.sync(flies,snapshot?.roadTraffic?.incidents);
}

function updateDayNight(hour: number, minute: number, weather: WeatherState = {}) {
  activeWeather = weather;
  const t = hour + minute / 60;
  const {daylight,dusk}=skyLight(t);
  const night = 1 - daylight;

  const dayColor = new THREE.Color(0x91b6cf);
  const sunsetQuality = Math.max(dusk,weather.sunset?.active ? (weather.sunset?.quality || 0) : 0);
  const duskColor = new THREE.Color(
    sunsetQuality > 0.45 ? 0xe27f52 :
    t >= 16 && t < 20 ? 0xd86144 : 0x263852
  );
  const cloud = THREE.MathUtils.clamp(weather.cloudCover || 0, 0, 1);
  const storm = weather.condition === "thunderstorm" ? 1 : weather.condition === "heavy_rain" ? 0.7 : 0;
  const overcast = new THREE.Color(storm > 0 ? 0x52606e : 0x7f93a1);
  const baseSky = dayColor.clone().lerp(duskColor, Math.max(night, sunsetQuality * 0.68));
  const sky = baseSky.lerp(overcast, cloud * (0.42 + storm * 0.35));
  scene.background = sky;
  (scene.fog as THREE.Fog).color.copy(sky);

  // Keep the expanded overview readable at night: the city is simulated, not a black-screen test.
  hemi.intensity = 0.68 + daylight * 1.30;
  sun.intensity = (0.18 + daylight * 2.42) * (1 - cloud * 0.48);
  sun.color.setHex(t>=16&&t<20?0xff8758:0xffe0aa);
  updateLandmarkLighting(night);
  sunFill.intensity = (0.10 + daylight * 0.46) * (1 - cloud * 0.36);
  moon.intensity = 0.28 + night * 0.78 * (1 - cloud * 0.28);
  // Fake sun direction stays fixed for a stable, inexpensive city-lighting look.

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
const cameraSprint=new CameraSprint();
const pressed=cameraSprint.pressed;
const player=new PlayerController();
const freePosition = new THREE.Vector3(player.x,player.y,player.z);
const lookDirection = new THREE.Vector3();
const moveForward = new THREE.Vector3();
const moveRight = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);

function setCameraOverview() {
  document.body.classList.remove("mansion-visit");
  followSelected = false;
  player.teleport(420,290,510,true);
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
 document.body.classList.remove("mansion-visit");
 followSelected=false;player.teleport(205,235,105,true);freePosition.set(205,235,105);
 const direction=new THREE.Vector3(PARK.x,12,PARK.z).sub(freePosition).normalize();cameraYaw=Math.atan2(direction.x,direction.z);cameraPitch=Math.asin(direction.y);
 camera.fov=50;camera.updateProjectionMatrix();
});
function frameDestination(position:THREE.Vector3,target:THREE.Vector3){
 document.body.classList.remove("mansion-visit");
 followSelected=false;cameraSprint.reset();player.teleport(position.x,position.y,position.z,true);freePosition.copy(position);
 const direction=target.sub(position).normalize();cameraYaw=Math.atan2(direction.x,direction.z);cameraPitch=Math.asin(direction.y);
 camera.fov=52;camera.updateProjectionMatrix();
}
document.getElementById("skyline-view")?.addEventListener("click",()=>frameDestination(new THREE.Vector3(160,180,270),new THREE.Vector3(5,122,43.5)));
document.getElementById("airport-view")?.addEventListener("click",()=>frameDestination(new THREE.Vector3(90,185,-230),new THREE.Vector3(-180,0,-465)));
document.getElementById("island-view")?.addEventListener("click",()=>frameDestination(new THREE.Vector3(440,245,1055),new THREE.Vector3(ISLAND.x,0,ISLAND.z)));
function visitMansion(){
 document.body.classList.add("mansion-visit");
 followSelected=false;cameraSprint.reset();player.teleport(mansionSpawn.x,mansionSpawn.y,mansionSpawn.z);freePosition.set(player.x,player.y,player.z);cameraYaw=0;cameraPitch=0;camera.fov=68;camera.updateProjectionMatrix();
}
document.getElementById("mansion-view")?.addEventListener("click",visitMansion);
document.body.classList.add("mansion-visit");
player.teleport(8,1.9,-35.4);freePosition.set(player.x,player.y,player.z);cameraYaw=-.07;cameraPitch=0;camera.fov=68;camera.updateProjectionMatrix();
camera.position.copy(freePosition);

renderer.domElement.tabIndex = 0;
renderer.domElement.style.outline = "none";
blockBrowserGestures();
for(const type of ["touchstart","touchend","dblclick"])renderer.domElement.addEventListener(type,event=>{if(event.cancelable)event.preventDefault();},{passive:false});
renderer.domElement.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  dragging = true;
  moved = false;
  lastX = e.clientX;
  lastY = e.clientY;
  followSelected = false;
  renderer.domElement.style.cursor = "grabbing";
  renderer.domElement.focus({preventScroll:true});
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
renderer.domElement.addEventListener("contextmenu",e=>e.preventDefault());
renderer.domElement.addEventListener("wheel", (e) => {
  e.preventDefault();
  camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * 0.018, 24, 78);
  camera.updateProjectionMatrix();
}, { passive: false });

const movementKeys = new Set([
  "KeyW","KeyA","KeyS","KeyD",
  "ArrowUp","ArrowDown","ArrowLeft","ArrowRight",
  "KeyQ","KeyE","Space","ShiftLeft","ShiftRight","ControlLeft","ControlRight",
]);
addEventListener("keydown", (e) => {
  if(document.querySelector<HTMLDialogElement>("#resident-directory")?.open||((e.target as HTMLElement)?.matches?.("input,textarea,select,[contenteditable=true]")))return;
  if (movementKeys.has(e.code)) {
    cameraSprint.down(e.code,performance.now(),e.repeat);
    if(e.code==="Space")player.jumpDown(performance.now(),e.repeat);
    e.preventDefault();
    followSelected = false;
  }
  if (e.code === "KeyF" && selectedFlyId) {
    followSelected = !followSelected;
    if(!followSelected)player.teleport(freePosition.x,freePosition.y,freePosition.z,true);
    e.preventDefault();
  }
  if (e.code === "KeyC") {
    setCameraOverview();
    e.preventDefault();
  }
});
addEventListener("blur",()=>{cameraSprint.reset();player.resetInput();dragging=false;document.querySelectorAll(".mobile-control.active").forEach(b=>b.classList.remove("active"));});
renderer.domElement.addEventListener("pointercancel",()=>{dragging=false;});
addEventListener("keyup", (e) => {cameraSprint.up(e.code);if(e.code==="Space")player.jumpUp();if (movementKeys.has(e.code)) e.preventDefault();});
bindTouchControls(document.querySelectorAll<HTMLButtonElement>(".mobile-control"),{
 down(key,now){followSelected=false;cameraSprint.down(key,now);if(key==="Space")player.jumpDown(now);},
 up(key){cameraSprint.up(key);if(key==="Space")player.jumpUp();},
});

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
  const id = residentBodies.flyId(hit?.instanceId);
  if (!id) return;
  selectedFlyId = id;
  void fetchSnapshot();
  const fly = latestFlyStates.get(id) || null;
  renderInspector(fly);
  if (matchMedia("(max-width:980px), (pointer:coarse)").matches) {
    document.body.classList.add("mobile-inspector-open");
    mobileInspectorToggle?.setAttribute("aria-expanded","true");
    if (mobileInspectorToggle) mobileInspectorToggle.textContent="CLOSE INFO";
  }
  for (const [fid, visual] of flyVisuals) {
    visual.halo.visible=fid===id;
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
    let forward=0,strafe=0;
    if(pressed.has("KeyW")||pressed.has("ArrowUp"))forward++;
    if(pressed.has("KeyS")||pressed.has("ArrowDown"))forward--;
    if(pressed.has("KeyD")||pressed.has("ArrowRight"))strafe++;
    if(pressed.has("KeyA")||pressed.has("ArrowLeft"))strafe--;
    const descending=pressed.has("KeyQ")||pressed.has("ShiftLeft")||pressed.has("ShiftRight");
    const sprint=pressed.has("ControlLeft")||pressed.has("ControlRight")?2:cameraSprint.multiplier;
    player.update(dt,{forward,strafe,yaw:cameraYaw,sprint,ascend:pressed.has("Space")||pressed.has("KeyE"),descend:descending});
    freePosition.set(player.x,player.y,player.z);
  }

  const mode=followSelected?"FOLLOWING":player.flying?"FLYING":player.swimming?"SWIMMING":"WALKING";
  renderer.domElement.dataset.playerMode=mode;
  renderer.domElement.dataset.playerPosition=`${freePosition.x.toFixed(2)},${freePosition.y.toFixed(2)},${freePosition.z.toFixed(2)}`;
  document.body.classList.toggle("player-flying",player.flying);
  camera.position.copy(freePosition);
  cameraForward(lookDirection);
  camera.lookAt(freePosition.clone().add(lookDirection));
}

let lastSkyMinute=-1;
function animate(now = performance.now()) {
  requestAnimationFrame(animate);
  if (document.hidden || now - lastRenderedAt < TARGET_FRAME_MS) return;
  lastRenderedAt = now;
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameAt) / 1000));
  lastFrameAt = now;

  const gameNow=presentationClock.read(now);
  residentBodies.begin();
  for (const [id,visual] of flyVisuals) {
    if(visual.hasMotion){visual.motion.advance(dt,gameNow,snapshot?.timeScale||120);visual.target.set(visual.motion.x,visual.motion.y,visual.motion.z);visual.route=[];}
    const next=visual.route[0]||visual.target;
    visual.current.lerp(next,Math.min(1,dt*(visual.route.length>3?10:6)));
    if(visual.route.length&&visual.current.distanceTo(next)<.35)visual.route.shift();
    visual.group.position.copy(visual.current);
    residentBodies.add(id,visual.current.x,visual.current.y,visual.current.z,visual.group.scale.x,visual.group.visible);
  }

  residentBodies.finish();
  personalCars.update(dt,gameNow,Math.max(1,snapshot?.timeScale||120));
  updateMetroTrains(now);
  updateParkWheel(now);
  const visualHour=(gameNow%86400)/3600;
  if(Math.floor(gameNow/60)!==lastSkyMinute){lastSkyMinute=Math.floor(gameNow/60);updateDayNight(Math.floor(visualHour),Math.floor((visualHour%1)*60),activeWeather);}
  if(snapshot){
    const hour=Math.floor(gameNow%86400/3600),minute=Math.floor(gameNow%3600/60),text=`${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
    if(gameClockEl.textContent!==text){gameClockEl.textContent=text;gameDayEl.textContent=`DAY ${Math.floor(gameNow/86400)+1}`;}
  }
  const pose=scheduledAircraft(gameNow);
  const activePlane=(snapshot?.flies||[]).some(f=>f.onPlane);
  if(snapshot?.aviation?.weatherClosed&&!activePlane){aviationVisual.plane.position.set(AIRPORT.terminal.x,3,-420);}
  else{aviationVisual.plane.position.set(pose.x,pose.y,pose.z);aviationVisual.plane.rotation.y=pose.heading;}
  for(const prop of aviationVisual.propellers)prop.rotation.z+=dt*(pose.phase==='flying'?40:8);
  const heliLead=(snapshot?.flies||[]).find(f=>f.heliPassenger);
  if(heliLead&&heliLead.heliTourStartedAt&&heliLead.heliTourUntil&&gameNow>=heliLead.heliTourStartedAt){
    const h=helicopterPose(gameNow,heliLead.heliTourStartedAt,heliLead.heliTourUntil);heliTarget.set(h.x,h.y,h.z);heliTourGroup.rotation.y=h.heading;
  }
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
  citySky.update(visualHour,camera.position,activeWeather.cloudCover||0);
  renderer.render(scene, camera);
}
// Start census polling before the first animation frame. All Three.js globals are initialized by
// this point, but a render-frame failure must never prevent the city census from connecting.
void fetchSnapshot();
window.setInterval(fetchSnapshot,5000);
try {
  animate();
} catch(error) {
  console.error("[fulllife] initial graphics frame failed",error);
  setConnection("connecting","CITY API CONNECTING · GRAPHICS DEGRADED ▾");
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
