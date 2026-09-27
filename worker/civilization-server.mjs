import http from "node:http";
import { pathToFileURL } from "node:url";
import { MAP_VERSION, FERRIS_WHEEL, wheelCabin, LOCATIONS, METRO_LINES, BUILDINGS, APARTMENTS, HOUSE_LOTS, entrance, blocked, clearSegment, pedestrianRoute, vehicleRoute, parkingPoint, trainState } from "./city-map.mjs";
const IS_MAIN = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
import process from "node:process";
import pg from "pg";
const { Pool } = pg;

const PORT = Number(process.env.PORT || 3000);
const WORLD_ID = process.env.CIV_WORLD_ID || "WORLD-A";
const EXPERIMENT_ID = process.env.CIV_EXPERIMENT_ID || "EXP-0001";
const WORLD_SEED = Number(process.env.CIV_WORLD_SEED || 948291);
const GAME_SECONDS_PER_REAL_SECOND = Number(process.env.CIV_TIME_SCALE || 120);
const TARGET_POPULATION = 130;
const RECOVERY_POPULATION = 100;
const WELFARE_VERSION = 1;
const INITIAL_POPULATION = Math.min(TARGET_POPULATION, Math.max(12, Number(process.env.CIV_INITIAL_POPULATION || RECOVERY_POPULATION)));
const MAX_POPULATION = Math.min(132, Math.max(TARGET_POPULATION, Number(process.env.CIV_MAX_POPULATION || 132)));
const DATABASE_URL = process.env.DATABASE_URL;
const FLYWIRE_BRAIN_URL = (process.env.FLYWIRE_BRAIN_URL || "https://flybrain-worker-production.up.railway.app").replace(/\/$/, "");
const NEURAL_SYNC_INTERVAL_MS = Math.max(500, Number(process.env.NEURAL_SYNC_INTERVAL_MS || 1000));
const CHECKPOINT_EVERY_MS = 5000;
const DAYS_PER_YEAR = 12; // compressed life calendar; one simulated year = 12 simulated days

const CURRENCY_CODE = "H$";
const CURRENCY_NAME = "Hansdrex Dollar";
const CITY_NAME = "Hansdrex City of Fruit Fly";
const WEATHER_UPDATE_GAME_SECONDS = 45 * 60;

if (IS_MAIN && !DATABASE_URL) {
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
  economicVersion: "adaptive-hansdrex-dollar-education-economy-0.7.0",
};

const METRO_ROUTE_LINES = METRO_LINES;


function nearestPointIndex(points, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const [px,pz] = points[i];
    const d = Math.hypot(px - x, pz - z);
    if (d < bestD) { bestD = d; best = i; }
  }
  return { index: best, distance: bestD };
}

function linePathDistance(points, a, b) {
  const lo = Math.min(a,b);
  const hi = Math.max(a,b);
  let total = 0;
  for (let i = lo; i < hi; i += 1) {
    total += Math.hypot(points[i+1][0]-points[i][0], points[i+1][1]-points[i][1]);
  }
  return total;
}

function planMetroRoute(fly, dest) {
  let best=null;
  for(const line of METRO_ROUTE_LINES){
    const entry=nearestPointIndex(line.points,fly.x,fly.z),exit=nearestPointIndex(line.points,dest.x,dest.z);
    const score=entry.distance+exit.distance+linePathDistance(line.points,entry.index,exit.index)*0.18;
    if(!best||score<best.score)best={line,entry,exit,score};
  }
  if(!best||best.entry.index===best.exit.index)return null;
  const waypoints=[];
  const [ex,ez]=best.line.points[best.entry.index], [xx,xz]=best.line.points[best.exit.index];
  waypoints.push(...buildPedestrianRoute({x:fly.x,z:fly.z},{x:ex,z:ez}));
  const dir=best.exit.index>best.entry.index?1:-1;
  waypoints.push({x:ex,z:ez,mode:"walk",lineId:best.line.id,stage:"station-entry",stationIndex:best.entry.index,exitIndex:best.exit.index,direction:dir});
  for(let i=best.entry.index;i!==best.exit.index+dir;i+=dir){const [x,z]=best.line.points[i];waypoints.push({x,z,mode:"metro",lineId:best.line.id,stage:"on-train"});}
  waypoints.push({x:xx,z:xz,mode:"walk",lineId:best.line.id,stage:"station-exit"});
  waypoints.push(...buildPedestrianRoute({x:xx,z:xz},dest));
  return{lineId:best.line.id,waypoints,score:best.score};
}


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
  { id: "vehicle-showroom", locationId: "vehicle-showroom", title: "vehicle sales associate", wage: 5.3, shiftStart: 9, shiftEnd: 18 },
  { id: "police", locationId: "police", title: "police officer", wage: 6.3, shiftStart: 7, shiftEnd: 19 },
  { id: "doctor", locationId: "hospital-central", title: "doctor", wage: 7.4, shiftStart: 7, shiftEnd: 19 },
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
  { id: "power", locationId: "power", title: "power plant operator", wage: 6.2, shiftStart: 6, shiftEnd: 14 },
  { id: "power-evening", locationId: "power", title: "power plant evening operator", wage: 6.4, shiftStart: 14, shiftEnd: 22 },
  { id: "power-night", locationId: "power", title: "power plant night operator", wage: 6.8, shiftStart: 22, shiftEnd: 6 },
  { id: "grid-dispatch", locationId: "power", title: "grid dispatcher", wage: 6.9, shiftStart: 8, shiftEnd: 17 },
  { id: "recycling", locationId: "recycling", title: "recycling worker", wage: 4.8, shiftStart: 7, shiftEnd: 16 },
  { id: "night-market", locationId: "night-market", title: "night market vendor", wage: 4.9, shiftStart: 18, shiftEnd: 2 },
  { id: "arcade", locationId: "arcade", title: "arcade attendant", wage: 4.7, shiftStart: 16, shiftEnd: 1 },
  { id: "music-hall", locationId: "music-hall", title: "music hall crew", wage: 5.1, shiftStart: 17, shiftEnd: 2 },
  { id: "nightclub", locationId: "nightclub", title: "nightclub staff", wage: 5.2, shiftStart: 19, shiftEnd: 3 },
  { id: "rooftop", locationId: "rooftop", title: "rooftop host", wage: 5.3, shiftStart: 17, shiftEnd: 1 },
  { id: "heli-pilot-day", locationId: "heliport", title: "helicopter sightseeing pilot", wage: 9.6, shiftStart: 8, shiftEnd: 16 },
  { id: "heli-pilot-evening", locationId: "heliport", title: "helicopter sightseeing pilot", wage: 10.2, shiftStart: 16, shiftEnd: 22 },
  { id: "heli-ground", locationId: "heliport", title: "heliport ground crew", wage: 6.8, shiftStart: 8, shiftEnd: 18 },
  { id: "heli-ground-evening", locationId: "heliport", title: "heliport ground crew", wage: 7.1, shiftStart: 14, shiftEnd: 22 },
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
  "heli-tour": { inventory: 999, cash: 12000, price: 185, sector: "luxury-tourism" },
  "vehicle-showroom": { inventory: 80, cash: 60000, price: 650, sector: "automotive" },
};
const VEHICLE_CATALOG = [
  { id:"scooter", price:420 },
  { id:"compact car", price:760 },
  { id:"premium car", price:1650 },
];

const STARTUP_TYPES = [
  { sector: "cafe", baseCapital: 900, locationId: "cafe", margin: 0.18 },
  { sector: "retail", baseCapital: 1100, locationId: "corner-shop", margin: 0.16 },
  { sector: "food", baseCapital: 1300, locationId: "restaurant", margin: 0.20 },
  { sector: "nightlife", baseCapital: 1700, locationId: "nightclub", margin: 0.24 },
  { sector: "logistics", baseCapital: 1500, locationId: "warehouse", margin: 0.14 },
  { sector: "manufacturing", baseCapital: 2300, locationId: "factory-east", margin: 0.17 },
  { sector: "health", baseCapital: 1800, locationId: "hospital-central", margin: 0.16 },
  { sector: "education", baseCapital: 1200, locationId: "school", margin: 0.13 },
  { sector: "mobility", baseCapital: 1600, locationId: "transit", margin: 0.16 },
  { sector: "maintenance", baseCapital: 1400, locationId: "power", margin: 0.15 },
  { sector: "construction", baseCapital: 2200, locationId: "construction", margin: 0.18 },
  { sector: "media", baseCapital: 950, locationId: "music-hall", margin: 0.21 },
  { sector: "automotive", baseCapital: 1800, locationId: "vehicle-showroom", margin: 0.17 },
];

const EMERGENT_ROLES = {
  cafe:["barista","coffee roaster","customer host","delivery runner"],
  retail:["sales associate","inventory planner","customer support","visual merchandiser"],
  food:["cook","kitchen specialist","food buyer","delivery runner"],
  nightlife:["event host","sound technician","security officer","venue manager"],
  logistics:["dispatcher","warehouse coordinator","delivery runner","route planner"],
  manufacturing:["machine operator","quality inspector","maintenance technician","production planner"],
  health:["care assistant","medical coordinator","clinic technician","patient services"],
  education:["teaching assistant","learning coach","school coordinator","library tutor"],
  mobility:["metro operator","station attendant","dispatcher","fleet technician"],
  maintenance:["utility technician","repair specialist","facilities engineer","safety inspector"],
  construction:["builder","site coordinator","electrician","materials planner"],
  media:["event producer","stage technician","content coordinator","ticketing specialist"],
  automotive:["vehicle sales specialist","mechanic","detailer","parts coordinator"],
};

function cityNeedScores() {
  const living=state.flies.filter((f)=>f.alive);
  const n=Math.max(1,living.length);
  return {
    food: living.reduce((a,f)=>a+f.hunger,0)/n/100,
    health: living.filter((f)=>f.illness||f.health<72).length/n,
    mobility: living.filter((f)=>!f.vehicle).length/n,
    education: living.filter((f)=>f.ageYears>=5&&f.ageYears<18).length/n,
    maintenance: weatherDanger()*0.6 + Object.values(state.enterprises||{}).filter((b)=>b.status==="operating").length/30,
    commerce: Number(state.economy?.index||1)/1.65,
    leisure: living.reduce((a,f)=>a+f.stress,0)/n/100,
  };
}
function emergentRoleForBusiness(business, owner) {
  const roles=EMERGENT_ROLES[business.sector] || ["operations coordinator","customer support","bookkeeper","facilities worker"];
  const needs=cityNeedScores();
  const sectorNeed =
    business.sector==="food"||business.sector==="cafe" ? needs.food :
    business.sector==="health" ? needs.health :
    business.sector==="education" ? needs.education :
    business.sector==="mobility"||business.sector==="automotive"||business.sector==="logistics" ? needs.mobility :
    business.sector==="maintenance"||business.sector==="manufacturing"||business.sector==="construction" ? needs.maintenance :
    business.sector==="nightlife"||business.sector==="media" ? needs.leisure : needs.commerce;
  const idx=Math.min(roles.length-1,Math.floor(brainRand(owner)*roles.length));
  const title=roles[idx];
  const wage=clamp(4.2 + sectorNeed*2.2 + business.reputation*1.5 + owner.traits.empathy*0.5,3.8,10.5);
  return {title,wage:Number(wage.toFixed(2)),need:sectorNeed};
}


const APARTMENT_CAPACITY = 10;
const POPULATION_BOOTSTRAP_VERSION = 3;

function buildApartmentBlocks() { return APARTMENTS.map(b=>({...b,occupants:[]})); }
function buildGroundHouseLots() { return HOUSE_LOTS.map(b=>({...b,ownerHouseholdId:null})); }

function ensureHousingState() {
  state.housing = state.housing || {
    apartmentBlocks: buildApartmentBlocks(),
    houseLots: buildGroundHouseLots(),
    households: {},
    nextHouseholdId: 1,
  };
  state.housing.apartmentBlocks = state.housing.apartmentBlocks || buildApartmentBlocks();
  state.housing.houseLots = state.housing.houseLots || buildGroundHouseLots();
  state.housing.households = state.housing.households || {};
  state.housing.nextHouseholdId = Number(state.housing.nextHouseholdId || 1);
}

function migrateGroundHousesToSafeLots(previousMapVersion) {
  if(previousMapVersion>=MAP_VERSION)return;
  state.housing.houseLots=buildGroundHouseLots();
  state.housing.apartmentBlocks=buildApartmentBlocks();
  for(const hh of Object.values(state.housing.households)) {
    const members=(hh.members||[]).map(id=>state.flies.find(f=>f.id===id&&f.alive)).filter(Boolean);
    if(!members.length)continue;
    const owner=members[0],wasHouse=hh.housingType==="house",wasOwned=members.some(f=>f.ownsHome);
    if(!wasHouse||!assignGroundHouse(owner,Math.max(1,owner.homeTier||1),hh))assignApartment(owner,hh);
    if(!wasHouse&&wasOwned)owner.ownsHome=true;
    for(const f of members){f.housingType=hh.housingType;f.housingUnitId=hh.unitId;f.homeX=hh.homeX;f.homeZ=hh.homeZ;}
  }
}

function migrateResidentNavigation(previousMapVersion, residents=state.flies) {
  if(previousMapVersion>=MAP_VERSION) return;
  for(const fly of residents){
    if(!fly.alive) continue;
    const base=fly.currentLocationId===fly.homeId
      ? {x:Number(fly.homeX??location(fly.homeId).x),z:Number(fly.homeZ??location(fly.homeId).z)}
      : location(fly.currentLocationId);
    const inside=fly.currentLocationId===fly.homeId||BUILDINGS.some(b=>b.id===fly.currentLocationId)||["rooftop","heliport"].includes(fly.currentLocationId);
    const p=inside?base:legalDestinationPoint(base);
    fly.x=p.x;fly.z=p.z;fly.targetX=p.x;fly.targetZ=p.z;fly.finalTargetX=p.x;fly.finalTargetZ=p.z;
    fly.indoors=inside;fly.actionUntil=0;fly.sleeping=false;fly.pendingAction=null;fly.parkedCar=parkingPoint(p);fly.traveling=false;fly.routeWaypoints=[];fly.routeIndex=0;fly.metroLineId=null;fly.transitStage=null;fly.transitMode="walk";fly.travelStuckTicks=0;
  }
}

function rebalancePopulationToTarget() {
  const living=state.flies.filter((f)=>f.alive);
  if(living.length<=TARGET_POPULATION) return;
  const extras=living.slice(TARGET_POPULATION);
  for(const fly of extras){fly.alive=false;fly.migratedOut=true;fly.causeOfDeath=null;fly.traveling=false;fly.action="migrated out of Hansdrex";fly.x=9999;fly.z=9999;}
  const livingIds=new Set(state.flies.filter((f)=>f.alive).map((f)=>f.id));
  for(const fly of state.flies) if(fly.alive && fly.partnerId && !livingIds.has(fly.partnerId)){fly.partnerId=null;fly.relationshipSince=null;fly.familyWaitYears=null;}
  emit("population_rebalance", `${extras.length} residents migrated out to keep Hansdrex near ${TARGET_POPULATION} active residents.`, { target:TARGET_POPULATION, migrated:extras.length });
}

function createHousehold(fly, inherited = null) {
  ensureHousingState();
  if (inherited && state.housing.households[inherited]) {
    const hh = state.housing.households[inherited];
    if (!hh.members.includes(fly.id)) hh.members.push(fly.id);
    fly.householdId = inherited;
    return hh;
  }
  const id = `HH-${String(state.housing.nextHouseholdId++).padStart(5, "0")}`;
  const hh = {
    id,
    members: [fly.id],
    housingType: null,
    unitId: null,
    homeX: fly.homeX,
    homeZ: fly.homeZ,
    monthlyHousingCost: 0,
    propertyValue: 0,
  };
  state.housing.households[id] = hh;
  fly.householdId = id;
  return hh;
}

function availableApartmentBlock() {
  ensureHousingState();
  const available = state.housing.apartmentBlocks
    .filter((b) => (b.occupants?.length || 0) < b.capacity)
    .sort((a, b) => (a.occupants?.length || 0) - (b.occupants?.length || 0));
  return available.length ? available[Math.floor(rand() * Math.min(8, available.length))] : null;
}

function assignApartment(fly, household = null) {
  ensureHousingState();
  const hh = household || state.housing.households[fly.householdId] || createHousehold(fly);
  const block = availableApartmentBlock();
  if (!block) return false;
  block.occupants = block.occupants || [];
  releaseHousingUnit(hh);
  if (!block.occupants.includes(hh.id)) block.occupants.push(hh.id);
  hh.housingType = "apartment";
  hh.unitId = block.id;
  hh.homeX = block.x;
  hh.homeZ = block.z;
  hh.monthlyHousingCost = block.rent;
  hh.propertyValue = 0;
  fly.housingType = "apartment";
  fly.housingUnitId = block.id;
  fly.homeX = block.x;
  fly.homeZ = block.z;
  fly.ownsHome = false;
  fly.homeTier = 0;
  fly.homeEquity = 0;
  return true;
}

function assignGroundHouse(fly, tier = 1, household = null) {
  ensureHousingState();
  const hh = household || state.housing.households[fly.householdId] || createHousehold(fly);
  const free = state.housing.houseLots.filter((lot) => !lot.ownerHouseholdId);
  if (!free.length) return false;
  const lot = free[Math.floor(rand() * free.length)];
  releaseHousingUnit(hh);
  lot.ownerHouseholdId = hh.id;
  const value = lot.baseValue * (1 + (tier - 1) * 0.58);
  hh.housingType = "house";
  hh.unitId = lot.id;
  hh.homeX = lot.x;
  hh.homeZ = lot.z;
  hh.monthlyHousingCost = Math.round(value * 0.003);
  hh.propertyValue = value;
  fly.housingType = "house";
  fly.housingUnitId = lot.id;
  fly.homeX = lot.x;
  fly.homeZ = lot.z;
  fly.ownsHome = true;
  fly.homeTier = tier;
  fly.homeEquity = value;
  return true;
}

function seedSocioeconomicProfile(fly) {
  const roll = rand();
  let cls =
    roll < 0.18 ? "low income" :
    roll < 0.55 ? "working" :
    roll < 0.80 ? "middle" :
    roll < 0.92 ? "affluent" :
    roll < 0.99 ? "wealthy" : "elite";

  if (fly.ageYears < 18) cls = rand() < 0.55 ? "working" : "middle";
  fly.socialClass = cls;

  const profiles = {
    "low income": { cash:[20,180], save:[0,180], debt:[120,850], credit:[430,610], home:0, vehicle:0.05 },
    "working": { cash:[100,650], save:[100,1600], debt:[0,520], credit:[540,700], home:0.05, vehicle:0.28 },
    "middle": { cash:[280,1400], save:[1000,6500], debt:[0,900], credit:[620,770], home:0.22, vehicle:0.62 },
    "affluent": { cash:[900,4200], save:[5500,19000], debt:[0,1500], credit:[690,810], home:0.66, vehicle:0.88 },
    "wealthy": { cash:[2500,10000], save:[16000,65000], debt:[0,2500], credit:[730,835], home:0.92, vehicle:0.96 },
    "elite": { cash:[8000,28000], save:[65000,180000], debt:[0,4000], credit:[780,850], home:1, vehicle:1 },
  };
  const p = profiles[cls];
  fly.money = randRange(...p.cash);
  fly.savings = randRange(...p.save);
  fly.debt = rand() < 0.42 ? randRange(...p.debt) : 0;
  fly.creditScore = Math.round(randRange(...p.credit));

  const hh = createHousehold(fly);
  if (rand() < p.home && fly.ageYears >= 24) {
    const tier = cls === "elite" ? 3 : cls === "wealthy" ? (rand() < 0.55 ? 3 : 2) : cls === "affluent" ? 2 : 1;
    if (!assignGroundHouse(fly, tier, hh)) assignApartment(fly, hh);
  } else {
    assignApartment(fly, hh);
  }

  if (rand() < p.vehicle && fly.ageYears >= 18) {
    fly.vehicle = cls === "wealthy" || cls === "elite"
      ? "compact car"
      : (rand() < 0.48 ? "compact car" : "scooter");
  }
  fly.transitPass = rand() < (fly.vehicle ? 0.28 : 0.72);

  if (fly.ageYears >= 18 && fly.ageYears <= 75) {
    const jobs = [...JOBS].sort((a,b) => a.wage - b.wage);
    const percentile =
      cls === "elite" ? 0.9 :
      cls === "wealthy" ? 0.82 :
      cls === "affluent" ? 0.72 :
      cls === "middle" ? 0.56 :
      cls === "working" ? 0.38 : 0.2;
    const center = Math.floor(percentile * (jobs.length - 1));
    const idx = Math.max(0, Math.min(jobs.length - 1, center + Math.floor(randRange(-4, 5))));
    const job = jobs[idx];
    if (job && rand() < (cls === "low income" ? 0.68 : 0.9)) {
      fly.jobId = job.id;
      fly.jobTitle = job.title;
      fly.wage = job.wage;
    } else {
      fly.jobId = null;
      fly.jobTitle = null;
      fly.wage = 0;
    }
  }
}

function inheritHousehold(child,mother) {
  const hh=state.housing?.households?.[mother?.householdId];
  if(!hh){createHousehold(child);assignApartment(child);return;}
  if(!hh.members.includes(child.id))hh.members.push(child.id);
  Object.assign(child,{householdId:hh.id,housingType:hh.housingType,housingUnitId:hh.unitId,homeX:hh.homeX,homeZ:hh.homeZ,ownsHome:false,homeTier:mother.homeTier||0,homeEquity:0});
}
function releaseHousingUnit(hh) {
  for(const b of state.housing.apartmentBlocks)b.occupants=(b.occupants||[]).filter(id=>id!==hh.id);
  for(const lot of state.housing.houseLots)if(lot.ownerHouseholdId===hh.id)lot.ownerHouseholdId=null;
}



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

// Navigation follows the geometry used by the renderer.
const CITY_ROAD_X=[-154,-102,-76,-50,-24,2,28,54,80,106,159,260];
const CITY_ROAD_Z=[-234,-184,-150,-145,-116,-100,-87,-58,-50,-29,0,29,50,58,87,100,116,145,150];
const nearestValue=(arr,value)=>arr.reduce((best,v)=>Math.abs(v-value)<Math.abs(best-value)?v:best,arr[0]);
const buildPedestrianRoute=pedestrianRoute;
const buildRoadRoute=vehicleRoute;
const legalDestinationPoint=entrance;
function trafficPhase(){return Math.floor(state.simulationAgeSeconds/Math.max(1,GAME_SECONDS_PER_REAL_SECOND))%60;}
function shouldStopAtRed(fly){
  if(!["car","scooter"].includes(fly.transitMode)) return false;
  const nearestX=nearestValue(CITY_ROAD_X,fly.targetX), nearestZ=nearestValue(CITY_ROAD_Z,fly.targetZ);
  if(Math.hypot(fly.targetX-nearestX,fly.targetZ-nearestZ)>1.2) return false;
  const dx=fly.targetX-fly.x,dz=fly.targetZ-fly.z,ns=Math.abs(dz)>=Math.abs(dx),phase=trafficPhase();
  return ns ? phase>=30 : phase<30;
}
function trainedSkillsForJob(jobId,title=""){
  if(jobId==="police") return {law:1,patrol:0.92,deescalation:0.88,arrestProcedure:0.95};
  if(jobId==="doctor"||title==="doctor") return {medicine:0.96,diagnosis:0.93,emergencyCare:0.91};
  if(String(title).includes("nurse")||String(jobId).includes("hospital")) return {medicine:0.76,emergencyCare:0.74};
  if(jobId==="vehicle-showroom") return {sales:0.85,vehicleKnowledge:0.84};
  if(String(jobId||"").startsWith("power")||jobId==="grid-dispatch") return {electrical:0.94,gridOperations:0.92,safety:0.91,maintenance:0.86};
  if(String(jobId||"").startsWith("heli-pilot")) return {aviation:0.98,flightSafety:0.96,navigation:0.94,sightseeing:0.88};
  if(String(jobId||"").startsWith("heli-ground")) return {groundOps:0.94,flightSafety:0.90,customerService:0.84};
  return {};
}
function ensureProfessionalTraining(fly){
 const baseline=trainedSkillsForJob(fly.jobId,fly.jobTitle);fly.professionSkills=fly.professionSkills||{};
 for(const [key,value]of Object.entries(baseline))fly.professionSkills[key]=Math.max(Number(fly.professionSkills[key]||0),value);
 if(fly.jobId==="police")fly.lawAwareness=Math.max(fly.lawAwareness||0,.98);
}
function recordLawViolation(fly,type,severity=1){
  fly.lawViolations=Number(fly.lawViolations||0)+1;fly.wantedUntil=state.simulationAgeSeconds+1800*severity;fly.lastViolationAt=state.simulationAgeSeconds;fly.stress=clamp(fly.stress+4*severity);fly.happiness=clamp(fly.happiness-1.5*severity);fly.criminalRecord=Array.isArray(fly.criminalRecord)?fly.criminalRecord:[];const evidence=clamp(0.46+severity*0.08+brainRange(fly,-0.08,0.12),0.25,0.98);fly.criminalRecord.push({type,severity,evidence,day:gameClock().day,time:state.simulationAgeSeconds});if(type==="murder"||severity>=5)fly.capitalCharge=true;brainRemember(fly,"law_violation",{type,severity,evidence});emit("law_violation",fly.id+" violated Hansdrex law: "+type+".",{flyId:fly.id,type,severity,evidence});
}
function lawEnforcement(fly){
  if(!fly.alive||fly.jobId==="police") return;
  if(processCriminalJustice(fly))return true;
  if(fly.arrestedUntil&&state.simulationAgeSeconds<fly.arrestedUntil){
    const station=location("police");fly.x=station.x;fly.z=station.z;fly.indoors=true;fly.onTrain=false;fly.sleeping=false;fly.currentLocationId="police";fly.targetLocationId="police";fly.routeWaypoints=[];fly.vx=fly.vz=0;fly.traveling=false;fly.action="detained at Hansdrex Police";fly.stress=clamp(fly.stress+0.03);fly.happiness=clamp(fly.happiness-0.02);return true;
  }
  if(fly.arrestedUntil&&state.simulationAgeSeconds>=fly.arrestedUntil){fly.arrestedUntil=0;fly.wantedUntil=0;fly.actionUntil=0;fly.action="released from police custody";}
  if(Number(fly.wantedUntil||0)>state.simulationAgeSeconds){
    const officers=state.flies.filter((x)=>x.alive&&x.jobId==="police");
    const officer=officers.sort((a,b)=>Math.hypot(a.x-fly.x,a.z-fly.z)-Math.hypot(b.x-fly.x,b.z-fly.z))[0];
    if(officer&&(!officer.traveling&&!officer.sleeping&&Math.hypot(officer.x-fly.x,officer.z-fly.z)<10)){
      const skill=Number(officer.professionSkills?.arrestProcedure||0.7),fine=Math.min(fly.money,20+fly.lawViolations*8);
      fly.money-=fine;state.treasury.cash+=fine;fly.arrestedUntil=state.simulationAgeSeconds+600+skill*600;fly.wantedUntil=0;fly.stress=clamp(fly.stress+18);fly.happiness=clamp(fly.happiness-8);if(fly.capitalCharge&&!fly.trialAt){fly.trialAt=state.simulationAgeSeconds+86400;fly.trialResolved=false;fly.arrestedUntil=Math.max(fly.arrestedUntil,fly.trialAt+3600);}
      officer.brainDecision=`arrested ${fly.id}`; officer.brainConfidence=skill;
      emit("arrest",`${officer.id} arrested ${fly.id}; fine ${fine.toFixed(0)} H$.`,{officerId:officer.id,flyId:fly.id,fine});
      return true;
    }
  }
  return false;
}
function professionalService(fly){
  if(fly.traveling||fly.sleeping||!fly.indoors)return;
  ensureProfessionalTraining(fly);
  if(fly.jobId==="doctor"&&fly.currentLocationId==="hospital-central"){
    const skill=Number(fly.professionSkills?.medicine||0.8);
    const patient=state.flies.find((p)=>p.alive&&!p.traveling&&p.indoors&&p.id!==fly.id&&p.currentLocationId==="hospital-central"&&(p.health<82||p.illness));
    if(patient){patient.health=clamp(patient.health+0.12*skill);patient.stress=clamp(patient.stress-0.08*skill);if(patient.health>88&&brainRand(fly)<0.02*skill)patient.illness=null;fly.brainDecision=`treating ${patient.id}`;}
  }
}

function ensureUtilityState(){
  state.utilities=state.utilities||{powerPlant:{cash:65000,fuelReserve:18000,maintenance:0.94,generation:0,capacity:0,demand:0,gridOnline:true,lastHourKey:-1,outages:0,totalRevenue:0},householdAccounts:{},lastBillingDay:0,disconnectedHouseholds:0};
  state.utilities.powerPlant=state.utilities.powerPlant||{cash:65000,fuelReserve:18000,maintenance:0.94,generation:0,capacity:0,demand:0,gridOnline:true,lastHourKey:-1,outages:0,totalRevenue:0};
  state.utilities.householdAccounts=state.utilities.householdAccounts||{};ensureHousingState();
  for(const hh of Object.values(state.housing?.households||{})) state.utilities.householdAccounts[hh.id]=state.utilities.householdAccounts[hh.id]||{balance:0,powerOn:true,overdueDays:0,lastBilledDay:0,lastPaymentDay:0,illegalConnectionUntil:0,usage:0};
}
function ensurePowerPlantStaff(){
  const ids=new Set(["power","power-evening","power-night","grid-dispatch"]),staff=state.flies.filter((f)=>f.alive&&ids.has(f.jobId));if(staff.length>=5)return staff;
  const slots=["power","power-evening","power-night","grid-dispatch","power-evening"],candidates=state.flies.filter((f)=>f.alive&&f.ageYears>=20&&f.ageYears<=68&&!f.businessId&&!f.businessEmployeeOf&&!ids.has(f.jobId)).sort((a,b)=>(b.intelligence+b.traits.resilience+b.traits.ambition)-(a.intelligence+a.traits.resilience+a.traits.ambition));
  while(staff.length<5&&candidates.length){const fly=candidates.shift(),job=JOBS.find((j)=>j.id===slots[staff.length]);if(!fly||!job)break;fly.jobId=job.id;fly.jobTitle=job.title;fly.wage=job.wage;fly.preferredWorkStart=job.shiftStart;fly.preferredWorkHours=(job.shiftEnd-job.shiftStart+24)%24||8;fly.professionSkills=trainedSkillsForJob(job.id,job.title);fly.brainDecision="accepted critical grid job";brainRemember(fly,"critical_infrastructure_job",{jobId:job.id});staff.push(fly);}
  return staff;
}
function householdMembers(hhId){const hh=state.housing?.households?.[hhId];if(!hh)return[];return(hh.members||[]).map((id)=>state.flies.find((f)=>f.id===id&&f.alive)).filter(Boolean);}
function collectElectricBill(hhId,amount){let remaining=Math.max(0,amount),paid=0;const members=householdMembers(hhId).sort((a,b)=>(b.money+b.savings)-(a.money+a.savings));for(const fly of members){if(remaining<=0)break;const p=Math.min(Math.max(0,fly.money),remaining);fly.money-=p;remaining-=p;paid+=p;}if(remaining>0)for(const fly of members){if(remaining<=0)break;const acc=state.utilities.householdAccounts[hhId];if(!(acc.overdueDays>0||fly.traits.thrift<0.62||neuralDrive(fly,"avoidDrive")>0.58))continue;const p=Math.min(Math.max(0,fly.savings),remaining);fly.savings-=p;remaining-=p;paid+=p;}if(paid>0){state.utilities.powerPlant.cash+=paid;state.utilities.powerPlant.totalRevenue+=paid;state.totalTransactions+=1;}return paid;}
function householdHasPower(fly){ensureUtilityState();const acc=state.utilities.householdAccounts?.[fly.householdId],illegal=Number(acc?.illegalConnectionUntil||0)>state.simulationAgeSeconds;return Boolean(state.utilities.powerPlant.gridOnline&&(acc?.powerOn!==false||illegal));}
function billElectricity(clock){
  ensureUtilityState();if(state.utilities.lastBillingDay===clock.day)return;state.utilities.lastBillingDay=clock.day;const level=Number(state.centralBank?.priceLevel||1);
  for(const hh of Object.values(state.housing?.households||{})){const acc=state.utilities.householdAccounts[hh.id],members=householdMembers(hh.id);if(!members.length)continue;const tier=Math.max(...members.map((f)=>Number(f.homeTier||0)),0),usage=(hh.housingType==="house"?7.5+tier*2.6:5.5)+Math.max(0,members.length-1)*1.25,bill=usage*0.34*level;acc.usage=usage;acc.balance+=bill;acc.lastBilledDay=clock.day;const paid=collectElectricBill(hh.id,acc.balance);acc.balance=Math.max(0,acc.balance-paid);if(acc.balance>0.5)acc.overdueDays+=1;else{acc.overdueDays=0;acc.lastPaymentDay=clock.day;}const wasOn=acc.powerOn!==false;if(acc.overdueDays>=2||acc.balance>18+members.length*4)acc.powerOn=false;if(!acc.powerOn&&acc.balance<1.5){acc.powerOn=true;acc.overdueDays=0;acc.illegalConnectionUntil=0;emit("power_reconnected","Electricity restored to household "+hh.id+".",{householdId:hh.id});}if(wasOn&&!acc.powerOn)emit("power_cut","Hansdrex Power disconnected household "+hh.id+" for unpaid debt "+acc.balance.toFixed(1)+" "+CURRENCY_CODE+".",{householdId:hh.id,debt:acc.balance});}
  state.utilities.disconnectedHouseholds=Object.values(state.utilities.householdAccounts).filter((a)=>a.powerOn===false).length;
}
function simulatePowerGrid(clock){
  ensureUtilityState();ensurePowerPlantStaff();const plant=state.utilities.powerPlant,hourKey=clock.day*24+clock.hour;if(plant.lastHourKey===hourKey)return;plant.lastHourKey=hourKey;const ids=new Set(["power","power-evening","power-night","grid-dispatch"]),staff=state.flies.filter((f)=>f.alive&&ids.has(f.jobId)),onDuty=staff.filter((f)=>!f.traveling&&f.currentLocationId==="power"&&(String(f.action||"").startsWith("working")||personalWorkWindow(f,JOBS.find((j)=>j.id===f.jobId),clock.hour))),connected=Object.values(state.utilities.householdAccounts).filter((a)=>a.powerOn!==false).length;
  plant.maintenance=clamp(Number(plant.maintenance||0.9)-weatherDanger()*0.004+onDuty.length*0.0015,0.38,1);plant.capacity=90+onDuty.length*62+plant.maintenance*95;plant.demand=45+connected*1.35+Object.keys(state.businesses||{}).length*4.2;
  if(plant.fuelReserve<1200&&plant.cash>900){plant.cash-=650;state.externalTrade=state.externalTrade||{exports:0,imports:0};state.externalTrade.imports+=650;plant.fuelReserve+=6500;emit("power_fuel","Hansdrex Power purchased fuel reserves.",{fuelReserve:plant.fuelReserve});}
  plant.fuelReserve=Math.max(0,plant.fuelReserve-Math.max(12,plant.demand*0.055));const fuelFactor=plant.fuelReserve>0?1:0.25;plant.generation=Math.min(plant.capacity*plant.maintenance*fuelFactor,plant.demand*1.08);const online=plant.generation>=plant.demand*0.72;if(online!==plant.gridOnline){plant.gridOnline=online;if(online)emit("grid_restored","Hansdrex electrical grid returned to stable operation.",{generation:plant.generation,demand:plant.demand,onDuty:onDuty.length});else{plant.outages=Number(plant.outages||0)+1;emit("grid_outage","Hansdrex grid entered a blackout.",{generation:plant.generation,demand:plant.demand,onDuty:onDuty.length});}}billElectricity(clock);
}
function applyPowerEffects(fly,clock){if(!fly.alive||fly.traveling||!fly.indoors||fly.currentLocationId!==fly.homeId)return;const powered=householdHasPower(fly);fly.powerOn=powered;if(powered)return;const night=clock.hour>=19||clock.hour<6;fly.stress=clamp(fly.stress+(night?0.08:0.035));fly.happiness=clamp(fly.happiness-(night?0.035:0.012));if(fly.sleeping){fly.energy=clamp(fly.energy-0.04);fly.sleepDebt=clamp(fly.sleepDebt+0.025);}}
function simulateCrime(fly){
  if(!fly.alive||fly.traveling||fly.sleeping||fly.ageYears<18||fly.arrestedUntil)return;ensureUtilityState();const acc=state.utilities.householdAccounts?.[fly.householdId];
  if(acc?.powerOn===false&&Number(acc.illegalConnectionUntil||0)<=state.simulationAgeSeconds){const desperation=clamp((20-fly.money)/20,0,1)+fly.stress/100*0.45+fly.traits.risk*0.42+(1-fly.lawAwareness)*0.35;if(brainRand(fly)<0.00025*desperation){acc.illegalConnectionUntil=state.simulationAgeSeconds+21600;fly.brainDecision="illegally reconnecting electricity";recordLawViolation(fly,"electricity theft",1.8);emit("power_theft",fly.id+" illegally bypassed a disconnected meter.",{flyId:fly.id,householdId:fly.householdId});}}
  if(fly.money<2&&fly.hunger>72&&state.businesses?.[fly.currentLocationId]&&brainRand(fly)<0.00018*(0.5+fly.traits.risk)){const b=state.businesses[fly.currentLocationId],stolen=Math.min(Number(b.cash||0),brainRange(fly,3,18));if(stolen>0){b.cash-=stolen;fly.money+=stolen;recordLawViolation(fly,"theft",1.5);emit("crime",fly.id+" stole "+stolen.toFixed(1)+" "+CURRENCY_CODE+".",{flyId:fly.id,type:"theft",amount:stolen});}}
  const aggression=fly.stress/100*0.40+fly.traits.risk*0.32+(1-fly.traits.empathy)*0.36;if(aggression>0.83&&brainRand(fly)<0.000035){const victim=state.flies.find((v)=>v.alive&&v.id!==fly.id&&v.currentLocationId===fly.currentLocationId&&Math.hypot(v.x-fly.x,v.z-fly.z)<5);if(victim){const damage=brainRange(fly,12,42)*(0.72+fly.traits.risk*0.55);victim.health=clamp(victim.health-damage);victim.stress=clamp(victim.stress+24);if(victim.health<=1&&brainRand(fly)<0.22){victim.alive=false;victim.causeOfDeath="homicide";state.deaths+=1;recordLawViolation(fly,"murder",6);emit("homicide",fly.id+" killed "+victim.id+".",{flyId:fly.id,victimId:victim.id});}else{recordLawViolation(fly,"assault",3);emit("assault",fly.id+" assaulted "+victim.id+".",{flyId:fly.id,victimId:victim.id,damage});}}}
}
function processCriminalJustice(fly){
  if(!fly.alive)return true;const now=state.simulationAgeSeconds;if(fly.executionAt&&now>=fly.executionAt){fly.alive=false;fly.causeOfDeath="capital punishment";state.deaths+=1;state.justice.executions=Number(state.justice.executions||0)+1;emit("execution",fly.id+" was executed after a capital murder conviction.",{flyId:fly.id,sentence:fly.sentence});return true;}
  if(fly.trialAt&&now>=fly.trialAt&&!fly.trialResolved){const records=Array.isArray(fly.criminalRecord)?fly.criminalRecord:[],capital=records.filter((r)=>r.type==="murder").sort((a,b)=>b.evidence-a.evidence)[0],strongest=records.slice().sort((a,b)=>b.severity-a.severity)[0],evidence=Number((capital||strongest)?.evidence||0),convicted=evidence>=0.62;fly.trialResolved=true;if(!convicted){state.justice.acquittals=Number(state.justice.acquittals||0)+1;fly.arrestedUntil=0;fly.wantedUntil=0;fly.capitalCharge=false;fly.sentence="acquitted";emit("trial",fly.id+" was acquitted.",{flyId:fly.id,evidence});return false;}state.justice.convictions=Number(state.justice.convictions||0)+1;if(capital&&state.justice.deathPenaltyEnabled&&capital.severity>=5){fly.sentence="death sentence";fly.executionAt=now+2*86400;fly.arrestedUntil=fly.executionAt+3600;emit("capital_sentence",fly.id+" received a capital sentence after conviction for murder; a two-day appeal window applies.",{flyId:fly.id,evidence,executionAt:fly.executionAt});}else{const days=Math.max(1,Math.ceil(Number(strongest?.severity||1)*1.5));fly.sentence=days+"-day imprisonment";fly.arrestedUntil=now+days*86400;emit("conviction",fly.id+" was convicted and sentenced to "+days+" game-days.",{flyId:fly.id,evidence,sentenceDays:days});}}return false;
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
  const inheritedIntelligence = parents
    ? clamp(((Number(mother?.intelligence||0.55)+Number(father?.intelligence||0.55))/2)+randRange(-0.08,0.08),0.15,0.98)
    : clamp(0.34 + traits.ambition*0.18 + traits.resilience*0.10 + brain.plasticity.learningRate*0.25 + randRange(-0.10,0.10),0.15,0.95);
  const chronotypeRoll=brain.seed%4;
  const chronotype=chronotypeRoll===0?"early":chronotypeRoll===1?"day":chronotypeRoll===2?"late":"night";
  const preferredWorkStart=(chronotype==="early"?6:chronotype==="day"?9:chronotype==="late"?13:18)+Math.round(randRange(-1,1));
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
    relationshipTrust: randRange(58, 88),
    jealousy: 0,
    infidelityCount: 0,
    lastAffairAt: -1e12,
    lastAffairWith: null,
    affairDiscovered: true,
    lastJealousyAt: -1e12,
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
    householdId: null,
    housingType: null,
    housingUnitId: null,
    ownsHome: false,
    homeTier: 0,
    homeEquity: 0,
    homeX: home.x + randRange(-8, 8),
    homeZ: home.z + randRange(-8, 8),
    lawAwareness: clamp(0.62 + traits.empathy * 0.20 + (1 - traits.risk) * 0.18 + randRange(-0.08,0.08),0.25,1),
    lawViolations: 0,
    wantedUntil: 0,
    arrestedUntil: 0,
    lastViolationAt: 0,
    professionSkills: trainedSkillsForJob(job?.id,job?.title),
    intelligence: inheritedIntelligence,
    learningRate: clamp(0.35 + inheritedIntelligence*0.42 + brain.plasticity.learningRate*0.25,0.2,1),
    educationLevel: parents ? 0 : clamp(Math.max(0,(initialAge-5)*5.2)*inheritedIntelligence,0,100),
    knowledge: {general:parents?0:clamp(Math.max(0,(initialAge-5)*0.052)*inheritedIntelligence,0,1),science:0,commerce:0,civic:0},
    schoolDays: 0,
    teacherId: null,
    chronotype,
    preferredWorkStart: (preferredWorkStart+24)%24,
    preferredWorkHours: clamp(6.5 + traits.ambition*2.2 - traits.risk*0.5,5,10),
    workMinutesToday: 0,
    lastEducationDay: -1,
    brainDecision: "resting",
    brainConfidence: 0.5,
    traveling: false,
    travelStartedAt: 0,
    travelLastDistance: null,
    travelStuckTicks: 0,
    travelGoalId: null,
    finalTargetX: pos.x,
    finalTargetZ: pos.z,
    routeWaypoints: [],
    routeIndex: 0,
    metroLineId: null,
    transitStage: null,
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
    cityName: CITY_NAME,
    currency: { code: CURRENCY_CODE, name: CURRENCY_NAME },
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
    treasury: { cash: 90000, taxRevenue: 0, spending: 0 },
    centralBank: { inflationTarget: 2, inflationRate: 0, priceLevel: 1, lastPolicyDay: 0, lastPrintAmount: 0, moneyPrintedLifetime: 0, boardIds: [], lastDecision: null },
    politics: { parties: [], presidentId: null, presidentPartyId: null, termStartDay: 0, nextElectionDay: 48, electionNumber: 0, campaignActive: false, candidates: [], lastElection: null, nextPartyId: 5 },
    economy: { index: 1, unemployment: 0, averageNetWorth: 0, businessCount: 0, gdpToday: 0, bankruptcies: 0, lastEnterpriseHour: -1, employed:0, lastLaborPulseHour:-1, inflationRate:0, priceLevel:1 },
    education: { teacherId:null, teacherGeneration:0, lessons:0 },
    utilities: { powerPlant:{cash:65000,fuelReserve:18000,maintenance:0.94,generation:0,capacity:0,demand:0,gridOnline:true,lastHourKey:-1,outages:0,totalRevenue:0}, householdAccounts:{}, lastBillingDay:0, disconnectedHouseholds:0 },
    justice: { deathPenaltyEnabled:true, executions:0, convictions:0, acquittals:0 },
    mapVersion: MAP_VERSION,
    populationBootstrapVersion: POPULATION_BOOTSTRAP_VERSION,
    housing: null,
    currency: { code: CURRENCY_CODE, name: CURRENCY_NAME },
    weather: null,
  };
  state = s;
  state.weather = makeWeather();
  ensureHousingState();
  for (let i = 0; i < INITIAL_POPULATION; i += 1) {
    const fly = createFly(i);
    seedSocioeconomicProfile(fly);
    state.flies.push(fly);
  }
  ensureAcademyTeacher(true);
  ensurePoliticalSystem();
  ensureCentralBankBoard();
  migrateResidentNavigation(0);
  s.generation=1;
  ensureWelfare();
  state.welfare.recoveryVersion=WELFARE_VERSION;
  return s;
}

function ensureWelfare() {
  state.welfare ||= { birthGrants: {}, birthGrantTotal: 0, foodSubsidies: 0, leisureSubsidies: 0, emergencyFunding: 0 };
  state.welfare.birthGrants ||= {};
  return state.welfare;
}
function fundPublicPayment(amount) {
  const welfare=ensureWelfare();
  const shortage=Math.max(0,amount-Number(state.treasury.cash||0));
  if(shortage){
    // Explicit, auditable public issuance; never silently reset the money supply.
    state.treasury.cash+=shortage;
    state.centralBank.moneyPrintedLifetime=Number(state.centralBank.moneyPrintedLifetime||0)+shortage;
    welfare.emergencyFunding=Number(welfare.emergencyFunding||0)+shortage;
  }
  state.treasury.cash-=amount;
  state.treasury.spending=Number(state.treasury.spending||0)+amount;
}
function payBirthGrant(child, parent) {
  const welfare=ensureWelfare();
  if(welfare.birthGrants[child.id])return false;
  fundPublicPayment(1000);
  parent.money+=1000;
  welfare.birthGrants[child.id]={amount:1000,parentId:parent.id,paidAt:state.simulationAgeSeconds};
  welfare.birthGrantTotal=Number(welfare.birthGrantTotal||0)+1000;
  state.totalTransactions++;
  emit("birth_grant",`${parent.id}'s family received 1,000 H$ for newborn ${child.id}.`,{childId:child.id,parentId:parent.id,amount:1000});
  return true;
}
function replenishResidents(target,reason) {
  maintainHouseholds();
  const before=state.flies.filter(f=>f.alive).length;
  const arrivals=[];
  for(let count=before;count<Math.min(target,MAX_POPULATION);count++){
    const fly=createFly(state.flies.length);seedSocioeconomicProfile(fly);state.flies.push(fly);arrivals.push(fly);
  }
  const added=state.flies.filter(f=>f.alive).length-before;
  if(added){
    migrateResidentNavigation(0,arrivals);
    emit("migration",`${added} new residents arrived; ${before+added} now alive.`,{before,added,after:before+added,reason});
  }
  return added;
}
function applyWelfareRecovery() {
  const welfare=ensureWelfare();
  if(Number(welfare.recoveryVersion||0)>=WELFARE_VERSION)return 0;
  const added=replenishResidents(RECOVERY_POPULATION,"population recovery requested by city administrator");
  welfare.recoveryVersion=WELFARE_VERSION;
  welfare.recoveredAt=state.simulationAgeSeconds;
  welfare.recoveryAdded=added;
  restockEssentials();
  return added;
}
function restockEssentials() {
  state.foodReserve=Math.max(Number(state.foodReserve||0),state.flies.filter(f=>f.alive).length*30,4000);
  for(const id of ["market","grocery","bakery","restaurant","night-market"]){
    const business=state.businesses[id];if(business)business.inventory=Math.max(Number(business.inventory||0),200);
  }
}
function mortalityReport() {
  const dead=state.flies.filter(f=>!f.alive&&!f.migratedOut),byCause={},riskAtDeath={dehydrated:0,hungry:0,severeStress:0,lowHealth:0};
  for(const f of dead){
    const cause=f.causeOfDeath||"unrecorded";byCause[cause]=(byCause[cause]||0)+1;
    if(f.thirst>85)riskAtDeath.dehydrated++;
    if(f.hunger>85)riskAtDeath.hungry++;
    if(f.stress>92)riskAtDeath.severeStress++;
    if(f.health<25)riskAtDeath.lowHealth++;
  }
  return {recordedDeaths:dead.length,byCause,riskAtDeath,note:"Risk indicators may overlap; they are not proven causes of historical deaths."};
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
  if(IS_MAIN)void persistEvent(e);
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
    const previousMapVersion=Number(state.mapVersion||0);
    state.timeScale = GAME_SECONDS_PER_REAL_SECOND;
    state.locations = LOCATIONS;
    state.businesses = { ...JSON.parse(JSON.stringify(BUSINESSES)), ...(state.businesses || {}) };
    state.enterprises = state.enterprises || {};
    state.nextEnterpriseId = Number(state.nextEnterpriseId || 1);
    state.bank = state.bank || { reserves: 250000, loansOutstanding: 0, defaults: 0 };
    state.treasury = state.treasury || { cash: 90000, taxRevenue: 0, spending: 0 };
    state.centralBank = state.centralBank || { inflationTarget:2, inflationRate:0, priceLevel:1, lastPolicyDay:0, lastPrintAmount:0, moneyPrintedLifetime:0, boardIds:[], lastDecision:null };
    state.politics = state.politics || { parties:[], presidentId:null, presidentPartyId:null, termStartDay:0, nextElectionDay:48, electionNumber:0, campaignActive:false, candidates:[], lastElection:null, nextPartyId:5 };
    state.economy = state.economy || { index: 1, unemployment: 0, averageNetWorth: 0, businessCount: 0, gdpToday: 0, bankruptcies: 0, lastEnterpriseHour: -1 };
    state.economy.gdpToday = Number(state.economy.gdpToday || 0);
    state.economy.bankruptcies = Number(state.economy.bankruptcies || 0);
    state.economy.lastEnterpriseHour = Number.isFinite(state.economy.lastEnterpriseHour) ? state.economy.lastEnterpriseHour : -1;
    state.economy.inflationRate=Number(state.economy.inflationRate||state.centralBank.inflationRate||0);
    state.economy.priceLevel=Number(state.economy.priceLevel||state.centralBank.priceLevel||1);
    state.economy.employed=Number(state.economy.employed||0);
    state.economy.lastLaborPulseHour=Number.isFinite(state.economy.lastLaborPulseHour)?state.economy.lastLaborPulseHour:-1;
    state.education=state.education||{teacherId:null,teacherGeneration:0,lessons:0};
    state.utilities=state.utilities||{powerPlant:{cash:65000,fuelReserve:18000,maintenance:0.94,generation:0,capacity:0,demand:0,gridOnline:true,lastHourKey:-1,outages:0,totalRevenue:0},householdAccounts:{},lastBillingDay:0,disconnectedHouseholds:0};
    state.utilities.powerPlant=state.utilities.powerPlant||{cash:65000,fuelReserve:18000,maintenance:0.94,generation:0,capacity:0,demand:0,gridOnline:true,lastHourKey:-1,outages:0,totalRevenue:0};
    state.utilities.householdAccounts=state.utilities.householdAccounts||{};
    state.justice=state.justice||{deathPenaltyEnabled:true,executions:0,convictions:0,acquittals:0};
    state.populationBootstrapVersion = Number(state.populationBootstrapVersion || 0);
    state.currency = { code: CURRENCY_CODE, name: CURRENCY_NAME };
    ensureHousingState();

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
      fly.finalTargetX = Number.isFinite(fly.finalTargetX) ? fly.finalTargetX : fly.targetX;
      fly.finalTargetZ = Number.isFinite(fly.finalTargetZ) ? fly.finalTargetZ : fly.targetZ;
      fly.routeWaypoints = Array.isArray(fly.routeWaypoints) ? fly.routeWaypoints : [];
      fly.routeIndex = Number(fly.routeIndex || 0);
      fly.metroLineId = fly.metroLineId || null;
      fly.transitStage = fly.transitStage || null;
      fly.smoking = Boolean(fly.smoking);
      fly.exercising = Boolean(fly.exercising);
      fly.sleeping = Boolean(fly.sleeping);
      fly.familyWaitYears = Number.isFinite(fly.familyWaitYears) ? fly.familyWaitYears : null;
      fly.familyReadiness = Number(fly.familyReadiness || 0);
      fly.relationshipTrust = Number.isFinite(fly.relationshipTrust) ? clamp(fly.relationshipTrust,0,100) : (fly.partnerId ? 68 : 75);
      fly.jealousy = Number.isFinite(fly.jealousy) ? clamp(fly.jealousy,0,100) : 0;
      fly.infidelityCount = Number(fly.infidelityCount || 0);
      fly.lastAffairAt = Number.isFinite(fly.lastAffairAt) ? fly.lastAffairAt : -1e12;
      fly.lastAffairWith = fly.lastAffairWith || null;
      fly.affairDiscovered = fly.affairDiscovered !== false;
      fly.lastJealousyAt = Number.isFinite(fly.lastJealousyAt) ? fly.lastJealousyAt : -1e12;
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
      fly.lawAwareness = Number.isFinite(fly.lawAwareness) ? fly.lawAwareness : clamp(0.62 + (fly.traits?.empathy||0.5)*0.20 + (1-(fly.traits?.risk||0.5))*0.18,0.25,1);
      fly.lawViolations = Number(fly.lawViolations||0);fly.criminalRecord=Array.isArray(fly.criminalRecord)?fly.criminalRecord:[];fly.capitalCharge=Boolean(fly.capitalCharge);fly.trialAt=Number(fly.trialAt||0);fly.trialResolved=Boolean(fly.trialResolved);fly.executionAt=Number(fly.executionAt||0);fly.sentence=fly.sentence||null;
      fly.wantedUntil = Number(fly.wantedUntil||0);
      fly.arrestedUntil = Number(fly.arrestedUntil||0);
      fly.lastViolationAt = Number(fly.lastViolationAt||0);
      fly.professionSkills = fly.professionSkills || trainedSkillsForJob(fly.jobId,fly.jobTitle);
      ensureCognitiveProfile(fly);
      ensurePoliticalProfile(fly);
      fly.enterpriseLocationId=fly.enterpriseLocationId||null;
      fly.wageArrears=Number(fly.wageArrears||0);
      fly.lastWorkEventDay=Number.isFinite(fly.lastWorkEventDay)?fly.lastWorkEventDay:-1;
      fly.householdId = fly.householdId || null;
      fly.housingType = fly.housingType || null;
      fly.housingUnitId = fly.housingUnitId || null;
      if (!fly.householdId) {
        const hh = createHousehold(fly);
        if (fly.ownsHome) {
          if (!assignGroundHouse(fly, Math.max(1, fly.homeTier || 1), hh)) assignApartment(fly, hh);
        } else {
          assignApartment(fly, hh);
        }
      }
    }

    migrateGroundHousesToSafeLots(previousMapVersion);
    migrateResidentNavigation(previousMapVersion);
    state.mapVersion=MAP_VERSION;
    ensureAcademyTeacher();
    ensurePoliticalSystem();
    ensureCentralBankBoard();
    applyWelfareRecovery();
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
    if (!other.alive || other.id === fly.id || other.traveling || other.sleeping || other.currentLocationId!==fly.currentLocationId || related(fly,other)) continue;
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
          weather_danger: weatherDanger(),
          precipitation: Number(state.weather?.precipitation || 0),
          wind: Number(state.weather?.wind || 0),
          sunset_quality: sunsetQuality(),
          sleeping: Boolean(fly.sleeping),
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

function circularHourInWindow(hour,start,duration){
  const h=((hour-start)%24+24)%24;
  return h>=0 && h<duration;
}
function ensureCognitiveProfile(fly){
  if(!Number.isFinite(fly.intelligence)){
    fly.intelligence=clamp(
      0.30 + (fly.traits?.ambition||0.5)*0.16 + (fly.traits?.resilience||0.5)*0.10 +
      Number(fly.brain?.plasticity?.learningRate||0.36)*0.24 + brainRange(fly,-0.10,0.10),
      0.12,0.98
    );
  }
  fly.learningRate=Number.isFinite(fly.learningRate)
    ? fly.learningRate
    : clamp(0.35 + fly.intelligence*0.42 + Number(fly.brain?.plasticity?.learningRate||0.36)*0.25,0.2,1);
  fly.educationLevel=Number.isFinite(fly.educationLevel)
    ? fly.educationLevel
    : clamp(Math.max(0,Math.min(100,(fly.ageYears-5)*5.2))*fly.intelligence,0,100);
  fly.knowledge=fly.knowledge||{general:fly.educationLevel/100,science:0,commerce:0,civic:0};
  fly.schoolDays=Number(fly.schoolDays||0);
  fly.teacherId=fly.teacherId||null;
  fly.chronotype=fly.chronotype||(
    fly.brain?.seed%4===0?"early":
    fly.brain?.seed%4===1?"day":
    fly.brain?.seed%4===2?"late":"night"
  );
  if(!Number.isFinite(fly.preferredWorkStart)){
    const start=fly.chronotype==="early"?6:fly.chronotype==="day"?9:fly.chronotype==="late"?13:18;
    fly.preferredWorkStart=(start+Math.round(brainRange(fly,-1.5,1.5))+24)%24;
  }
  fly.preferredWorkHours=Number.isFinite(fly.preferredWorkHours)
    ? fly.preferredWorkHours
    : clamp(6.5 + fly.traits.ambition*2.2 - fly.traits.risk*0.5,5,10);
  fly.workMinutesToday=Number(fly.workMinutesToday||0);
  fly.lastEducationDay=Number.isFinite(fly.lastEducationDay)?fly.lastEducationDay:-1;
}
function personalWorkWindow(fly,baseJob,hour){
  ensureCognitiveProfile(fly);
  const essential=["police","doctor","hospital-central","hospital-east","transit","power"].includes(fly.jobId);
  const baseStart=Number(baseJob?.shiftStart ?? fly.preferredWorkStart);
  const brainStart=Number(fly.preferredWorkStart);
  const start=essential ? Math.round(baseStart*0.72+brainStart*0.28)%24 : brainStart;
  const hours=essential ? Math.max(7,Number(fly.preferredWorkHours||8)) : Number(fly.preferredWorkHours||8);
  return circularHourInWindow(hour,start,hours);
}
function academyTeacher(){
  const id=state.education?.teacherId;
  return id?state.flies.find((f)=>f.id===id&&f.alive):null;
}
function ensureAcademyTeacher(force=false){
  state.education=state.education||{teacherId:null,teacherGeneration:0,lessons:0};
  let current=academyTeacher();
  if(current && !force){ensureCognitiveProfile(current);return current;}
  const adults=state.flies.filter((f)=>f.alive&&f.ageYears>=22&&f.ageYears<=72);
  if(!adults.length)return null;
  for(const f of adults)ensureCognitiveProfile(f);
  const ranked=adults.slice().sort((a,b)=>
    (b.intelligence*0.55+b.educationLevel/100*0.22+b.traits.empathy*0.13+b.traits.sociability*0.10)-
    (a.intelligence*0.55+a.educationLevel/100*0.22+a.traits.empathy*0.13+a.traits.sociability*0.10)
  );
  const top=ranked.slice(0,Math.max(1,Math.min(8,Math.ceil(ranked.length*0.12))));
  current=top[Math.floor(rand()*top.length)]||ranked[0];
  current.intelligence=Math.max(current.intelligence,0.86);
  current.educationLevel=Math.max(current.educationLevel,82);
  current.professionSkills={...(current.professionSkills||{}),teaching:0.94,mentoring:0.88};
  current.jobId="school";
  current.jobTitle="academy teacher";
  current.wage=Math.max(Number(current.wage||0),6.4);
  current.preferredWorkStart=current.chronotype==="early"?7:8;
  current.preferredWorkHours=7.5;
  state.education.teacherId=current.id;
  state.education.teacherGeneration=Number(state.education.teacherGeneration||0)+1;
  brainRemember(current,"appointed_teacher",{generation:state.education.teacherGeneration});
  emit("education",`${current.id} was appointed Hansdrex Academy teacher for generation ${state.education.teacherGeneration}.`,{
    teacherId:current.id,intelligence:current.intelligence,educationLevel:current.educationLevel,
  });
  return current;
}
function educationTick(fly,clock){
  ensureCognitiveProfile(fly);
  if(fly.ageYears<5||fly.ageYears>=18)return;
  if(fly.currentLocationId!=="school"||!String(fly.action||"").includes("studying"))return;
  const teacher=ensureAcademyTeacher();
  const teacherPresent=teacher&&!teacher.traveling&&teacher.currentLocationId==="school"&&String(teacher.action||"").includes("teaching");
  const teacherSkill=teacher?Number(teacher.professionSkills?.teaching||0.65):0.35;
  const boost=(teacherPresent?1.35:0.72)*(0.65+teacherSkill*0.45)*(0.55+fly.learningRate*0.55);
  fly.educationLevel=clamp(fly.educationLevel+0.0018*boost,0,100);
  fly.knowledge.general=clamp(Number(fly.knowledge.general||0)+0.000045*boost,0,1);
  fly.knowledge.civic=clamp(Number(fly.knowledge.civic||0)+0.000025*boost,0,1);
  fly.intelligence=clamp(fly.intelligence+0.0000045*boost,0.12,0.995);
  fly.energy=clamp(fly.energy-0.012);
  fly.stress=clamp(fly.stress+(fly.traits.resilience<0.4?0.006:-0.002));
  if(fly.lastEducationDay!==clock.day){
    fly.lastEducationDay=clock.day;fly.schoolDays+=1;fly.teacherId=teacher?.id||null;
    brainRemember(fly,"school_day",{teacherId:fly.teacherId,educationLevel:fly.educationLevel});
    if(brainRand(fly)<0.16)emit("school",`${fly.id} attended Hansdrex Academy with teacher ${fly.teacherId||"independent study"}.`,{flyId:fly.id,teacherId:fly.teacherId});
  }
  if(teacherPresent){
    teacher.professionSkills.teaching=clamp(Number(teacher.professionSkills.teaching||0)+0.000002,0,1);
    state.education.lessons=Number(state.education.lessons||0)+1;
  }
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

function chooseTravelMode(fly,dest){
  const distance=Math.hypot(dest.x-fly.x,dest.z-fly.z),danger=weatherDanger();
  const metro=planMetroRoute(fly,dest);
  if(fly.vehicle==="premium car"||fly.vehicle==="compact car"){
    if(distance>45&&fly.money>1.2&&neuralDrive(fly,"avoidDrive")<0.88&&danger<0.80) return{mode:"car",metro:null,route:buildRoadRoute({x:fly.x,z:fly.z},dest,"car",fly.parkedCar)};
  }
  if(distance>35&&fly.vehicle==="scooter"&&fly.money>0.6&&distance<170&&danger<0.42) return{mode:"scooter",metro:null,route:buildRoadRoute({x:fly.x,z:fly.z},dest,"scooter",fly.parkedCar)};
  if(metro&&(distance>60||danger>=0.48)&&fly.money>=1.5){

    return{mode:"metro",metro,route:metro.waypoints};
  }
  return{mode:"walk",metro:null,route:buildPedestrianRoute({x:fly.x,z:fly.z},dest)};
}

function nightlifeOpen(clock) {
  return clock.hour >= 18 || clock.hour < 3;
}

function liquidMoneySupply() {
  const residents=state.flies.filter((f)=>f.alive).reduce((sum,f)=>sum+Math.max(0,Number(f.money||0))+Math.max(0,Number(f.savings||0)),0);
  const fixedBusinesses=Object.values(state.businesses||{}).reduce((sum,b)=>sum+Math.max(0,Number(b.cash||0)),0);
  const enterprises=Object.values(state.enterprises||{}).filter((b)=>b.status==="operating").reduce((sum,b)=>sum+Math.max(0,Number(b.cash||0)),0);
  return residents+fixedBusinesses+enterprises+Math.max(0,Number(state.treasury?.cash||0))+Math.max(0,Number(state.utilities?.powerPlant?.cash||0))+Math.max(0,Number(state.bank?.reserves||0));
}

function ensurePoliticalProfile(fly) {
  if (!fly.ideology) {
    fly.ideology = {
      growth: clamp((fly.traits?.ambition||0.5)*0.58+(fly.traits?.risk||0.5)*0.16+brainRange(fly,0,0.22),0,1),
      welfare: clamp((fly.traits?.empathy||0.5)*0.66+(1-(fly.traits?.risk||0.5))*0.14+brainRange(fly,0,0.18),0,1),
      liberty: clamp((fly.traits?.risk||0.5)*0.24+(fly.traits?.sociability||0.5)*0.20+Number(fly.brain?.plasticity?.noveltyBias||0.48)*0.38+brainRange(fly,0,0.16),0,1),
      environment: clamp((fly.traits?.empathy||0.5)*0.34+Number(fly.brain?.plasticity?.noveltyBias||0.48)*0.28+brainRange(fly,0.12,0.34),0,1),
    };
  }
  fly.politicalInterest=Number.isFinite(fly.politicalInterest)?fly.politicalInterest:clamp((fly.traits?.sociability||0.5)*0.25+(fly.traits?.ambition||0.5)*0.28+(fly.intelligence||0.5)*0.18+brainRange(fly,0,0.18),0,1);
  fly.politicalRivalries=fly.politicalRivalries||{};
  fly.partyId=fly.partyId||null;
  return fly;
}
function ideologyDistance(a,b) {
  return Math.sqrt(["growth","welfare","liberty","environment"].reduce((sum,k)=>sum+Math.pow(Number(a?.[k]||0.5)-Number(b?.[k]||0.5),2),0)/4);
}
function ensurePoliticalSystem() {
  const p=state.politics||(state.politics={parties:[],presidentId:null,presidentPartyId:null,termStartDay:0,nextElectionDay:48,electionNumber:0,campaignActive:false,candidates:[],lastElection:null,nextPartyId:5});
  if (!p.parties.length) {
    p.parties=[
      {id:"PARTY-1",name:"Hansdrex Growth Party",growth:0.84,welfare:0.34,liberty:0.62,environment:0.36,founderId:null,members:0},
      {id:"PARTY-2",name:"Civic Social Party",growth:0.48,welfare:0.86,liberty:0.56,environment:0.62,founderId:null,members:0},
      {id:"PARTY-3",name:"Free Wings Party",growth:0.68,welfare:0.30,liberty:0.90,environment:0.46,founderId:null,members:0},
      {id:"PARTY-4",name:"Green City Party",growth:0.42,welfare:0.64,liberty:0.60,environment:0.92,founderId:null,members:0},
    ];
  }
  const adults=state.flies.filter((f)=>f.alive&&f.ageYears>=16);
  for(const fly of adults){
    ensurePoliticalProfile(fly);
    const nearest=p.parties.map((party)=>({party,d:ideologyDistance(fly.ideology,party)})).sort((a,b)=>a.d-b.d)[0];
    if(!fly.partyId||!p.parties.some((party)=>party.id===fly.partyId))fly.partyId=nearest?.party.id||null;
    if(fly.ageYears>=22&&fly.politicalInterest>0.72&&fly.traits.ambition>0.72&&nearest?.d>0.30&&p.parties.length<7&&brainRand(fly)<0.0009){
      const id=`PARTY-${p.nextPartyId++}`;
      const theme=fly.ideology.liberty>0.72?"Liberty":fly.ideology.environment>0.72?"Future":fly.ideology.welfare>0.72?"Community":"Prosperity";
      const party={id,name:`Hansdrex ${theme} Movement ${id.slice(-1)}`,...fly.ideology,founderId:fly.id,members:0};
      p.parties.push(party);fly.partyId=id;brainRemember(fly,"party_founded",{partyId:id});emit("party_founded",`${fly.id} founded ${party.name} after deciding the existing parties did not fit their views.`,{flyId:fly.id,party});
    }
  }
  for(const party of p.parties)party.members=adults.filter((f)=>f.partyId===party.id).length;
}
function candidateScore(fly,party) {
  ensurePoliticalProfile(fly);
  return fly.traits.ambition*0.24+fly.traits.sociability*0.19+fly.traits.empathy*0.10+(fly.intelligence||0.5)*0.17+(fly.politicalInterest||0)*0.14+neuralDrive(fly,"socialDrive")*0.10-ideologyDistance(fly.ideology,party)*0.16+brainRange(fly,-0.05,0.05);
}
function startElection(clock) {
  ensurePoliticalSystem();
  const candidates=[];
  for(const party of state.politics.parties){
    const pool=state.flies.filter((f)=>f.alive&&f.ageYears>=24&&f.ageYears<=75&&f.partyId===party.id).sort((a,b)=>candidateScore(b,party)-candidateScore(a,party));
    const c=pool[0];if(c){c.brainDecision="campaigning for president";c.stress=clamp(c.stress+3);brainRemember(c,"presidential_campaign",{partyId:party.id});candidates.push({flyId:c.id,partyId:party.id,votes:0});}
  }
  state.politics.candidates=candidates;state.politics.campaignActive=true;
  emit("election_campaign",`Hansdrex presidential campaign began: ${candidates.length} parties nominated candidates.`,{candidates});
}
function resolveElection(clock) {
  const candidates=state.politics.candidates||[];if(!candidates.length)return;
  for(const voter of state.flies.filter((f)=>f.alive&&f.ageYears>=18)){
    ensurePoliticalProfile(voter);let best=null;
    for(const c of candidates){
      const candidate=state.flies.find((f)=>f.id===c.flyId),party=state.politics.parties.find((p)=>p.id===c.partyId);if(!candidate||!party)continue;
      const affinity=1-ideologyDistance(voter.ideology,party), social=Number(voter.brain?.memory?.socialAffinity?.[candidate.id]||0);
      const score=affinity*0.67+candidate.traits.sociability*0.10+(candidate.intelligence||0.5)*0.08+social*0.07+(100-voter.stress)/100*0.03+brainRange(voter,-0.07,0.07);
      if(!best||score>best.score)best={c,score};
    }
    if(best)best.c.votes+=1;
  }
  candidates.sort((a,b)=>b.votes-a.votes);const winner=candidates[0];if(!winner)return;
  state.politics.presidentId=winner.flyId;state.politics.presidentPartyId=winner.partyId;state.politics.termStartDay=clock.day;state.politics.electionNumber=Number(state.politics.electionNumber||0)+1;state.politics.nextElectionDay=clock.day+48;state.politics.campaignActive=false;state.politics.lastElection={day:clock.day,candidates:candidates.map((c)=>({...c}))};
  const president=state.flies.find((f)=>f.id===winner.flyId);if(president){president.happiness=clamp(president.happiness+12);brainRemember(president,"elected_president",{votes:winner.votes,partyId:winner.partyId});}
  emit("election_result",`${winner.flyId} won the Hansdrex presidential election with ${winner.votes} votes.`,{winner,candidates});
}
function simulatePoliticalLife(clock) {
  ensurePoliticalSystem();
  if(!state.politics.campaignActive&&clock.day>=state.politics.nextElectionDay-3)startElection(clock);
  if(state.politics.campaignActive&&clock.day>=state.politics.nextElectionDay)resolveElection(clock);
  if(clock.minute<2&&clock.hour%6===0){
    const pool=state.flies.filter((f)=>f.alive&&f.ageYears>=18&&(f.politicalInterest||0)>0.45);
    if(pool.length>1){
      const a=pool[Math.floor(rand()*pool.length)],b=pool[Math.floor(rand()*pool.length)];
      if(a&&b&&a.id!==b.id){ensurePoliticalProfile(a);ensurePoliticalProfile(b);const disagreement=ideologyDistance(a.ideology,b.ideology),emotion=(a.stress+b.stress)/200+(2-a.traits.empathy-b.traits.empathy)*0.22;
        if(disagreement>0.35&&brainRand(a)<0.012+emotion*0.02){a.stress=clamp(a.stress+3*disagreement);b.stress=clamp(b.stress+2*disagreement);a.politicalRivalries[b.id]=Number(a.politicalRivalries[b.id]||0)+disagreement;b.politicalRivalries[a.id]=Number(b.politicalRivalries[a.id]||0)+disagreement;brainRemember(a,"political_argument",{with:b.id,disagreement});brainRemember(b,"political_argument",{with:a.id,disagreement});emit("political_argument",`${a.id} and ${b.id} had a political argument driven by personal emotion and ideological disagreement.`,{a:a.id,b:b.id,disagreement});}
      }
    }
  }
}
function ensureCentralBankBoard() {
  const cb=state.centralBank||(state.centralBank={inflationTarget:2,inflationRate:0,priceLevel:1,lastPolicyDay:0,lastPrintAmount:0,moneyPrintedLifetime:0,boardIds:[],lastDecision:null});
  const valid=(cb.boardIds||[]).map((id)=>state.flies.find((f)=>f.id===id&&f.alive&&f.ageYears>=24&&f.ageYears<=78)).filter(Boolean);
  if(valid.length>=3)return valid;
  const pool=state.flies.filter((f)=>f.alive&&f.ageYears>=24&&f.ageYears<=72).sort((a,b)=>((b.intelligence||0.5)+b.traits.thrift*0.25+b.creditScore/850*0.15)-((a.intelligence||0.5)+a.traits.thrift*0.25+a.creditScore/850*0.15));
  cb.boardIds=pool.slice(0,5).map((f)=>f.id);return cb.boardIds.map((id)=>state.flies.find((f)=>f.id===id)).filter(Boolean);
}
function updateMonetaryPolicy(clock) {
  const cb=state.centralBank;if(cb.lastPolicyDay===clock.day)return;
  cb.lastPolicyDay=clock.day;const board=ensureCentralBankBoard(),supply=Math.max(1,liquidMoneySupply()),unemployment=Number(state.economy?.unemployment||0),inflation=Number(cb.inflationRate||0),target=Number(cb.inflationTarget||2);
  const votes=board.map((f)=>{const support=unemployment*0.42+Math.max(0,target-inflation)/10*0.25+(1-f.traits.thrift)*0.18+f.traits.empathy*0.10+neuralDrive(f,"approachDrive")*0.08;const restraint=Math.max(0,inflation-target)/10*(0.30+f.traits.thrift*0.25);return {id:f.id,desiredRate:clamp(0.00015+support*0.004-restraint*0.004,0.0001,0.009)};});
  const rate=votes.length?votes.reduce((a,v)=>a+v.desiredRate,0)/votes.length:0.0005,amount=supply*rate;
  state.bank.reserves+=amount*0.60;state.treasury.cash+=amount*0.40;cb.lastPrintAmount=amount;cb.moneyPrintedLifetime=Number(cb.moneyPrintedLifetime||0)+amount;
  const outputGap=Number(state.economy?.index||1)-1,annualMoneyGrowth=rate*DAYS_PER_YEAR*100,rawInflation=annualMoneyGrowth-outputGap*7+unemployment*2.2;
  cb.inflationRate=clamp(cb.inflationRate*0.72+rawInflation*0.28,-4,28);cb.priceLevel=clamp(cb.priceLevel*(1+cb.inflationRate/100/DAYS_PER_YEAR),0.65,4.5);state.economy.inflationRate=cb.inflationRate;state.economy.priceLevel=cb.priceLevel;cb.lastDecision={day:clock.day,rate,amount,votes};
  for(const member of board)brainRemember(member,"central_bank_vote",{rate,amount,inflation:cb.inflationRate});
  emit("monetary_policy",`Hansdrex Central Bank issued ${amount.toFixed(0)} ${CURRENCY_CODE}; board decision implies ${cb.inflationRate.toFixed(1)}% inflation.`,{amount,rate,inflation:cb.inflationRate,boardIds:cb.boardIds});
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
        fly.traits.ambition * 0.22 +
        enterpriseSectorDemand(type.sector,gameClock()) * 0.18 +
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
  if (readiness < 0.50) return;

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

function enterpriseSectorDemand(sector, clock) {
  const living = state.flies.filter((f) => f.alive).length;
  const base = clamp(living / Math.max(40, INITIAL_POPULATION), 0.45, 1.6);
  const weather = weatherDanger();
  const night = nightlifeOpen(clock);
  const modifier =
    sector === "food" ? (1.08 + living / 900) :
    sector === "cafe" ? (0.88 + state.flies.reduce((s,f) => s + (100 - f.energy), 0) / Math.max(1,living) / 180) :
    sector === "nightlife" ? (night ? 1.42 : 0.28) :
    sector === "retail" ? 0.92 :
    sector === "logistics" ? 0.95 + state.economy.index * 0.12 :
    sector === "manufacturing" ? 0.90 + state.economy.index * 0.20 : 0.85;
  const weatherEffect =
    sector === "nightlife" ? 1 - weather * 0.46 :
    sector === "cafe" ? 1 + weather * 0.16 :
    1 - weather * 0.08;
  return clamp(base * modifier * weatherEffect, 0.18, 2.2);
}

function hireEnterpriseEmployee(business, owner) {
  const candidates = state.flies.filter((f) =>
    f.alive && f.ageYears >= 18 && f.ageYears <= 72 && f.id !== owner.id &&
    !f.businessId && !f.businessEmployeeOf && (!f.jobId || f.socialClass === "low income")
  );
  if (!candidates.length) return null;
  for(const f of candidates)ensureCognitiveProfile(f);
  candidates.sort((a,b) => {
    const scoreA = a.intelligence*0.18+a.educationLevel/100*0.16+a.traits.ambition*0.26+a.traits.resilience*0.18+a.health/100*0.14+brainRand(a)*0.08;
    const scoreB = b.intelligence*0.18+b.educationLevel/100*0.16+b.traits.ambition*0.26+b.traits.resilience*0.18+b.health/100*0.14+brainRand(b)*0.08;
    return scoreB-scoreA;
  });
  const worker=candidates[0];
  const role=emergentRoleForBusiness(business,owner);
  worker.businessEmployeeOf=business.id;
  worker.jobId=null;
  worker.jobTitle=role.title;
  worker.wage=Math.max(role.wage,Number(worker.wage||0)*1.04);
  worker.preferredWorkStart=(worker.preferredWorkStart+Math.round(brainRange(worker,-1,1))+24)%24;
  worker.preferredWorkHours=clamp(worker.preferredWorkHours+brainRange(worker,-0.7,0.7),5,10);
  worker.enterpriseLocationId=business.locationId;
  worker.professionSkills={...(worker.professionSkills||{}),[business.sector]:Math.max(Number(worker.professionSkills?.[business.sector]||0),0.35+worker.intelligence*0.25)};
  if(!business.employees.includes(worker.id))business.employees.push(worker.id);
  brainRemember(owner,"job_created",{businessId:business.id,title:role.title,wage:worker.wage,need:role.need});
  brainRemember(worker,"hired",{businessId:business.id,title:role.title,wage:worker.wage});
  emit("hire",`${owner.id}'s brain created a ${role.title} role at ${business.name}; ${worker.id} accepted at ${worker.wage.toFixed(1)} ${CURRENCY_CODE}/h.`,{
    businessId:business.id,ownerId:owner.id,flyId:worker.id,title:role.title,wage:worker.wage,
  });
  return worker;
}

function closeEnterprise(business, owner, reason) {
  business.status = "bankrupt";
  const defaultLoss = Math.max(0, Number(business.loanBalance || 0));
  if (defaultLoss > 0) {
    state.bank.defaults += defaultLoss;
    state.bank.loansOutstanding = Math.max(0, state.bank.loansOutstanding - defaultLoss);
  }
  for (const employeeId of business.employees || []) {
    const employee = state.flies.find((f) => f.id === employeeId);
    if (employee) {
      employee.businessEmployeeOf = null;
      employee.jobTitle = null;
      employee.wage = 0;
      employee.stress = clamp(employee.stress + 9);
    }
  }
  if (owner) {
    owner.businessId = null;
    owner.businessEquity = 0;
    owner.businessFailures += 1;
    owner.creditScore = Math.max(300, owner.creditScore - 70);
    owner.bankLoan = Math.max(0, owner.bankLoan - defaultLoss);
    owner.stress = clamp(owner.stress + 24);
    owner.happiness = clamp(owner.happiness - 18);
    brainRemember(owner, "business_failure", { businessId: business.id, reason });
  }
  state.economy.bankruptcies += 1;
  emit("bankruptcy", `${business.name} failed: ${reason}.`, {
    businessId: business.id,
    ownerId: owner?.id,
    reason,
  });
}

function simulateEnterprises(clock) {
  const hourKey = clock.day * 24 + clock.hour;
  if (state.economy.lastEnterpriseHour === hourKey) return;
  state.economy.lastEnterpriseHour = hourKey;

  const operating = Object.values(state.enterprises || {}).filter((b) => b.status === "operating");
  let hourlyGdp = 0;

  for (const business of operating) {
    const owner = state.flies.find((f) => f.id === business.ownerId && f.alive);
    if (!owner) {
      closeEnterprise(business, owner, "owner unavailable");
      continue;
    }

    const demand = enterpriseSectorDemand(business.sector, clock);
    const neuralManagement =
      neuralDrive(owner, "approachDrive") * 0.22 +
      neuralDrive(owner, "exploreDrive") * 0.18 +
      neuralDrive(owner, "socialDrive") * 0.08 -
      neuralDrive(owner, "avoidDrive") * 0.12;
    const management = clamp(
      0.42 +
      owner.traits.ambition * 0.20 +
      owner.traits.thrift * 0.11 +
      owner.traits.resilience * 0.10 +
      owner.brain.plasticity.persistence * 0.10 +
      neuralManagement -
      owner.stress / 100 * 0.14 +
      brainRange(owner, -0.08, 0.08),
      0.12,
      1.45,
    );

    const targetEmployees =
      business.sector === "manufacturing" ? 8 :
      business.sector === "logistics" ? 6 :
      business.sector === "nightlife" ? 5 : 4;

    if ((business.employees?.length || 0) < targetEmployees &&
        business.cash > 420 &&
        management > 0.48 &&
        brainRand(owner) < 0.10 + management * 0.05) {
      hireEnterpriseEmployee(business, owner);
    }

    const employees = (business.employees || [])
      .map((id) => state.flies.find((f) => f.id === id && f.alive))
      .filter(Boolean);
    const workingEmployees=employees.filter((e)=>!e.traveling&&e.currentLocationId===business.locationId&&String(e.action||"").startsWith("working as")&&personalWorkWindow(e,null,clock.hour));
    const employeeProductivity = workingEmployees.length
      ? workingEmployees.reduce((sum,e)=>sum+e.energy/100*e.health/100*(0.72+e.intelligence*0.22),0)/workingEmployees.length
      : 0.38;

    const revenue =
      ((!owner.traveling&&owner.currentLocationId===business.locationId)||workingEmployees.length?1:0) * demand *
      (8 + workingEmployees.length * 13) *
      management *
      (0.58 + employeeProductivity * 0.62) *
      brainRange(owner, 0.76, 1.28);

    const rentUtility =
      business.sector === "manufacturing" ? 18 :
      business.sector === "nightlife" ? 13 :
      business.sector === "logistics" ? 14 : 8;
    const interest = Math.max(0, Number(business.loanBalance || 0)) * 0.00032;
    const nonPayrollCost = rentUtility + interest + revenue * (1 - business.margin) * 0.23;
    const paidCost=Math.min(nonPayrollCost,Math.max(0,business.cash+revenue));
    business.cash += revenue-paidCost;
    state.externalTrade=state.externalTrade||{exports:0,imports:0};state.externalTrade.exports+=revenue;
    state.treasury.cash+=paidCost; // domestic rent, supplies and utilities


    let payrollPaid=0;
    for (const employee of workingEmployees) {
      ensureCognitiveProfile(employee);
      const pay=Math.min(Math.max(3.8,Number(employee.wage||4.5)),Math.max(0,business.cash));
      if(pay<=0){employee.wageArrears=Number(employee.wageArrears||0)+Math.max(3.8,Number(employee.wage||4.5));continue;}
      const tax=pay*0.05,net=pay-tax;business.cash-=pay;employee.money+=net;employee.salaryLifetime+=net;employee.salaryEarnedToday+=net;payrollPaid+=pay;state.treasury.cash+=tax;state.treasury.taxRevenue=Number(state.treasury.taxRevenue||0)+tax;state.totalTransactions+=1;
      if(brainRand(employee)<0.035)emit("salary",`${business.name} paid ${employee.id} ${pay.toFixed(1)} ${CURRENCY_CODE} for this hour.`,{businessId:business.id,flyId:employee.id,amount:pay});
    }
    const operatingCost=nonPayrollCost+payrollPaid;
    const profit=revenue-operatingCost;

    business.revenueLifetime += revenue;
    business.expensesLifetime += operatingCost;
    business.profitToday = Number(business.profitToday || 0) + profit;
    business.reputation = clamp(business.reputation + (profit >= 0 ? 0.003 : -0.006) + (management - 0.5) * 0.002, 0.05, 1);
    hourlyGdp += Math.max(0, revenue);

    if (business.loanBalance > 0 && business.cash > 950) {
      const payment = Math.min(business.loanBalance, Math.max(8, business.cash * 0.018));
      business.loanBalance -= payment;
      owner.bankLoan = Math.max(0, owner.bankLoan - payment);
      business.cash -= payment;
      state.bank.reserves += payment;
      state.bank.loansOutstanding = Math.max(0, state.bank.loansOutstanding - payment);
      owner.creditScore = Math.min(850, owner.creditScore + 0.15);
    }

    if (profit < 0) business.badDays += 0.08;
    else business.badDays = Math.max(0, business.badDays - 0.12);

    if (business.cash > business.assetValue * 1.8 && profit > 0 && brainRand(owner) < 0.12) {
      const dividend = Math.min(profit * 0.28, business.cash * 0.035);
      business.cash -= dividend;
      owner.money += dividend;
      owner.businessEquity = netWorth(owner);
    }

    const successThreshold = 3500 * (owner.businessSuccesses + 1);
    if (business.revenueLifetime > successThreshold && profit > 0 && brainRand(owner) < 0.05) {
      owner.businessSuccesses += 1;
      owner.creditScore = Math.min(850, owner.creditScore + 12);
      owner.happiness = clamp(owner.happiness + 8);
      emit("business_success", `${business.name} reached a new growth milestone under ${owner.id}.`, {
        businessId: business.id,
        ownerId: owner.id,
        revenueLifetime: business.revenueLifetime,
      });
    }

    if (business.cash < -250 || business.badDays > 4.5) {
      closeEnterprise(business, owner, business.cash < -250 ? "insolvency" : "persistent losses");
      continue;
    }

    owner.businessEquity = Math.max(0, business.cash + business.assetValue - business.loanBalance);
    owner.stress = clamp(owner.stress + (profit < 0 ? 0.16 : -0.035));
  }

  state.economy.gdpToday += hourlyGdp;
  state.economy.businessCount = Object.values(state.enterprises || {}).filter((b) => b.status === "operating").length;
  const enterpriseWorkers=state.flies.filter((f)=>f.alive&&f.businessEmployeeOf).length;
  const staticWorkers=state.flies.filter((f)=>f.alive&&f.jobId).length;
  state.economy.employed=state.flies.filter(f=>f.alive&&(f.jobId||f.businessEmployeeOf)).length;
  if(hourKey%4===0&&state.economy.lastLaborPulseHour!==hourKey){
    state.economy.lastLaborPulseHour=hourKey;
    emit("labor",`Hansdrex labor pulse: ${state.economy.employed} employed, ${enterpriseWorkers} in brain-created roles, ${state.economy.businessCount} resident-run businesses.`,{employed:state.economy.employed,enterpriseWorkers,businesses:state.economy.businessCount});
  }

  const adults = state.flies.filter((f) => f.alive && f.ageYears >= 18 && f.ageYears <= 75);
  const unemployed = adults.filter((f) => !f.jobId && !f.businessId && !f.businessEmployeeOf).length;
  state.economy.unemployment = adults.length ? unemployed / adults.length : 0;
  const netWorths = state.flies.filter((f) => f.alive).map(netWorth);
  state.economy.averageNetWorth = netWorths.length ? netWorths.reduce((a,b) => a+b, 0) / netWorths.length : 0;

  // Economy expands/contracts from business health and unemployment.
  const profitable = operating.filter((b) => Number(b.profitToday || 0) > 0).length;
  const health = operating.length ? profitable / operating.length : 0.5;
  state.economy.index = clamp(
    state.economy.index * 0.994 + (0.78 + health * 0.42 - state.economy.unemployment * 0.28) * 0.006,
    0.55,
    1.65,
  );
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
  add("market", "buying food", fly.hunger * 0.9 + 18);
  add("cafe", "drinking Hansdrex coffee", (100 - fly.energy) * 0.58 + fly.sleepDebt * 0.46 + fly.thirst * 0.18 + (fly.money > 5 ? 8 : -30));
  add("tea-house", "drinking tea", fly.thirst * 0.48 + fly.stress * 0.28 + fly.loneliness * 0.12);
  add("restaurant", "eating dinner", fly.hunger * 0.66 + fly.happiness * 0.08 + (fly.money > 12 ? 8 : -28));
  add("grocery", "shopping groceries", fly.hunger * 0.68 + fly.traits.thrift * 13);
  add("bakery", "getting a meal", fly.hunger * 0.55 + fly.excitement * 0.12);
  add("cafe", "socializing", fly.loneliness * 0.62 + fly.traits.sociability * 28 + fly.excitement * 0.18 + brain.plasticity.socialBias * 12);
  add("park", "taking a walk", fly.stress * 0.9 + fly.traits.resilience * 15 + 15);
  if(weatherDanger()<.3)add("ferris-wheel","riding the free Central Park wheel",fly.stress*.95+fly.loneliness*.2+fly.traits.sociability*18+12);
  add("gym", "exercising", fly.stress * 0.34 + (100 - fly.health) * 0.25 + fly.traits.ambition * 18);
  add("clinic", "seeking care", (100 - fly.health) * 1.05 + (fly.illness ? 55 : 0));
  add("hospital-central", "going to Hansdrex hospital", (100 - fly.health) * 1.28 + (fly.illness ? 72 : 0));
  add("corner-shop", "shopping", fly.excitement * 0.28 + Math.min(25, fly.money / 30));
  if(!fly.vehicle&&fly.ageYears>=18&&fly.savings>450){
    const mobilityNeed=fly.traits.ambition*26+fly.excitement*0.18+neuralDrive(fly,"exploreDrive")*20+Math.min(20,fly.savings/100);
    add("vehicle-showroom","shopping for a vehicle",mobilityNeed);
  }

  const heliPrice=heliTourTicketPrice();
  const luxuryEligible=fly.stress>=55||["affluent","wealthy","elite"].includes(fly.socialClass)||(fly.money+fly.savings)>heliPrice*8;
  if(age>=18&&luxuryEligible&&heliTourAvailable(clock)&&fly.energy>28&&(fly.stress>=55||fly.money+fly.savings>heliPrice*1.2)){
    const classBonus=fly.socialClass==="elite"?34:fly.socialClass==="wealthy"?27:fly.socialClass==="affluent"?19:8;
    const visualCuriosity=brain.dynamic.curiosity*32+neuralDrive(fly,"exploreDrive")*24+fly.excitement*0.22+fly.traits.ambition*12;
    const affordability=Math.min(24,(fly.money+fly.savings)/Math.max(1,heliPrice*3));
    add("heliport","taking a Hansdrex helicopter sightseeing tour",visualCuriosity+classBonus+affordability+(fly.stress>=55?fly.stress*0.6:0)-fly.sleepDebt*0.22-weatherDanger()*90);
  }

  ensureCognitiveProfile(fly);
  const teacher=academyTeacher();
  if (teacher?.id===fly.id && personalWorkWindow(fly,JOBS.find((j)=>j.id==="school"),clock.hour)) {
    add("school","teaching at Hansdrex Academy",106+fly.intelligence*18+fly.traits.empathy*12-fly.stress*0.16);
  } else if (fly.jobId && age >= 18 && age <= 75) {
    const job = JOBS.find((j) => j.id === fly.jobId);
    if (job && personalWorkWindow(fly,job,clock.hour)) {
      add(job.locationId,`working as ${fly.jobTitle||job.title}`,92+fly.traits.ambition*25+fly.intelligence*8-fly.stress*0.24-fly.sleepDebt*0.17);
    }
  }
  if(fly.businessEmployeeOf && age>=18 && age<=75){
    const employer=state.enterprises?.[fly.businessEmployeeOf];
    if(employer?.status==="operating" && personalWorkWindow(fly,null,clock.hour)){
      add(employer.locationId,`working as ${fly.jobTitle||"employee"} at ${employer.name}`,100+fly.traits.ambition*24+fly.intelligence*6-fly.stress*0.20-fly.sleepDebt*0.14);
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

  if(age>=5&&age<18){
    const teacherQuality=teacher?Number(teacher.professionSkills?.teaching||0.7):0.4;
    const schoolWindow=circularHourInWindow(clock.hour,fly.chronotype==="early"?7:fly.chronotype==="late"?10:8,8);
    const familyEducation=fly.parents?.length
      ? fly.parents.map((id)=>state.flies.find((p)=>p.id===id)).filter(Boolean).reduce((a,p)=>a+Number(p.educationLevel||40),0)/Math.max(1,fly.parents.length)/100
      : 0.5;
    if(schoolWindow){
      add("school","studying at Hansdrex Academy",
        82+teacherQuality*18+fly.learningRate*14+familyEducation*10+brain.dynamic.curiosity*12-fly.stress*0.14-fly.sleepDebt*0.12);
    }
    if(!schoolWindow && fly.energy>35 && (brain.dynamic.curiosity+fly.intelligence)>1.0){
      add("library","self-studying after hours",32+fly.intelligence*16+brain.dynamic.curiosity*20);
    }
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
      !(loc.type === "health" && !fly.illness && fly.health > 72) &&
      !(loc.type === "luxury" && fly.stress<55 && !["affluent","wealthy","elite"].includes(fly.socialClass) && fly.money+fly.savings<heliTourTicketPrice()*6)
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
  if (fly.traveling) return;
  if (!fly.traveling && fly.actionUntil > state.simulationAgeSeconds && fly.hunger<85 && fly.thirst<85) return;

  const food=LOCATIONS.filter(l=>["market","grocery","bakery"].includes(l.id)).sort((a,b)=>Math.hypot(a.x-fly.x,a.z-fly.z)-Math.hypot(b.x-fly.x,b.z-fly.z))[0];
  const chosen = fly.hunger>72 ? {id:food.id,action:"getting a subsidized meal"}
    : fly.thirst>72 ? {id:fly.homeId,action:"drinking free water"}
    : brainChooseAction(fly, clock);
  startJourney(fly,chosen);
}

function startJourney(fly,chosen) {
  if(fly.indoors){const door=entrance(fly);fly.x=door.x;fly.z=door.z;fly.y=1.1;fly.movementTrace=[];}
  fly.onTrain=false;
  fly.targetLocationId = chosen.id;
  fly.action = chosen.action;
  fly.pendingAction=chosen.action;fly.indoors=false;
  fly.smoking = chosen.action === "smoke break";
  fly.exercising = chosen.action === "exercising";
  fly.sleeping = false;

  const dest = chosen.id === fly.homeId
    ? { ...location(fly.homeId), x: fly.homeX ?? location(fly.homeId).x, z: fly.homeZ ?? location(fly.homeId).z }
    : location(chosen.id);
  const p = legalDestinationPoint(dest);
  fly.finalTargetX = p.x;
  fly.finalTargetZ = p.z;
  const travelPlan = chooseTravelMode(fly, p);
  fly.transitMode = travelPlan.mode;
  fly.routeWaypoints = travelPlan.route || travelPlan.metro?.waypoints || [];
  fly.routeIndex = 0;
  fly.metroLineId = travelPlan.metro?.lineId || null;
  fly.transitStage = travelPlan.metro ? "station-entry" : travelPlan.mode;
  if (fly.routeWaypoints.length) {
    fly.targetX = fly.routeWaypoints[0].x;
    fly.targetZ = fly.routeWaypoints[0].z;
    fly.transitMode = fly.routeWaypoints[0].mode;
  } else {
    fly.targetX = p.x;
    fly.targetZ = p.z;
  }
  if(!fly.routeWaypoints.length){fly.traveling=false;fly.pendingAction=null;fly.action="waiting for a reachable route";fly.actionUntil=state.simulationAgeSeconds+600;fly.targetX=fly.x;fly.targetZ=fly.z;return;}
  fly.transitStage=fly.routeWaypoints[0].stage;
  fly.traveling = true;
  fly.travelStartedAt = state.simulationAgeSeconds;
  fly.travelLastDistance = Math.hypot(fly.targetX - fly.x, fly.targetZ - fly.z);
  fly.travelStuckTicks = 0;
  fly.travelGoalId = chosen.id;
  fly.actionUntil = 0;
}

function moveFly(fly) {
  if(!fly.traveling){fly.vx=fly.vz=0;return;}
  // A passenger occupies an actual scheduled train, including its station dwell.
  if(fly.onTrain){
    const line=METRO_LINES.find(l=>l.id===fly.metroLineId),t=trainState(line,state.simulationAgeSeconds/GAME_SECONDS_PER_REAL_SECOND);
    const oldX=fly.x,oldZ=fly.z;fly.x=t.x;fly.z=t.z;fly.y=t.y;fly.vx=fly.x-oldX;fly.vz=fly.z-oldZ;
    if(t.dwelling&&t.from===fly.metroExitIndex){
      fly.onTrain=false;fly.routeIndex=fly.metroExitWaypoint;fly.transitMode="walk";fly.y=1.1;
      const next=fly.routeWaypoints[fly.routeIndex];fly.targetX=next.x;fly.targetZ=next.z;
      state.transit=state.transit||{boardings:0,completedTrips:0};state.transit.completedTrips++;
    }
    return;
  }
  const dx = fly.targetX - fly.x;
  const dz = fly.targetZ - fly.z;
  const dist = Math.hypot(dx, dz);

  if (dist <= 0.85) {
    fly.vx = 0;
    fly.vz = 0;
    fly.x = fly.targetX;
    fly.z = fly.targetZ;

    if (fly.routeWaypoints?.length && fly.routeIndex < fly.routeWaypoints.length - 1) {
      const currentWp=fly.routeWaypoints[fly.routeIndex];
      if(currentWp?.stage==="station-entry"){
        const line=METRO_LINES.find(l=>l.id===fly.metroLineId),t=trainState(line,state.simulationAgeSeconds/GAME_SECONDS_PER_REAL_SECOND);
        if(!t.dwelling||t.from!==currentWp.stationIndex||t.direction!==currentWp.direction){fly.action=`waiting at ${fly.metroLineId} station`;return;}
        if(!fly.transitPass&&!spend(fly,1.5,state.businesses.transit||state.treasury)){fly.traveling=false;fly.actionUntil=0;fly.pendingAction=null;return;}
        fly.onTrain=true;fly.action=`riding metro ${fly.metroLineId}`;
        state.transit=state.transit||{boardings:0,completedTrips:0};state.transit.boardings++;
        fly.metroExitIndex=currentWp.exitIndex;
        fly.metroExitWaypoint=fly.routeWaypoints.findIndex((p,i)=>i>fly.routeIndex&&p.stage==="station-exit");
        return;
      }
      if(currentWp?.stage==="parking")fly.parkedCar={x:fly.x,z:fly.z};
      fly.routeIndex += 1;
      const next = fly.routeWaypoints[fly.routeIndex];
      fly.targetX = next.x;
      fly.targetZ = next.z;
      fly.transitMode = next.mode;
      if(next.mode!=="metro"&&!fly.onTrain)fly.action=`traveling to ${location(fly.targetLocationId).name}`;
      fly.transitStage = next.stage;
      fly.metroLineId = next.lineId || fly.metroLineId;
      fly.travelLastDistance = Math.hypot(fly.targetX - fly.x, fly.targetZ - fly.z);
      fly.travelStuckTicks = 0;
      return;
    }

    fly.currentLocationId = fly.targetLocationId;
    if (fly.traveling) {
      const completedMode = fly.metroLineId ? `metro ${fly.metroLineId}` : fly.transitMode;
      fly.traveling = false;
      fly.action=fly.pendingAction||fly.action;
      fly.pendingAction=null;
      fly.indoors=fly.currentLocationId===fly.homeId||BUILDINGS.some(b=>b.id===fly.currentLocationId)||["rooftop","heliport"].includes(fly.currentLocationId);
      fly.sleeping=fly.action==="sleeping"&&fly.currentLocationId===fly.homeId&&fly.indoors;
      if(fly.indoors){
        const room=fly.currentLocationId===fly.homeId?{x:fly.homeX,z:fly.homeZ}:location(fly.currentLocationId);
        fly.x=room.x;fly.z=room.z;fly.targetX=room.x;fly.targetZ=room.z;
      }
      fly.y=fly.currentLocationId==="rooftop"?99:1.1;
      if(fly.vehicle&&!fly.parkedCar)fly.parkedCar=parkingPoint(fly);
      if(brainRand(fly)<.18)emit("arrival",`${fly.id} arrived: ${fly.action}.`,{flyId:fly.id,locationId:fly.currentLocationId});
      fly.travelGoalId = null;
      fly.travelLastDistance = null;
      fly.travelStuckTicks = 0;
      fly.routeWaypoints = [];
      fly.routeIndex = 0;
      fly.transitStage = null;
      fly.actionUntil = state.simulationAgeSeconds + brainRange(fly, 1200, 4200);
      brainRemember(fly, "arrived", {
        locationId: fly.currentLocationId,
        action: fly.action,
        transitMode: completedMode,
      });
      fly.metroLineId = null;
    }
    return;
  }

  const vehicleBoost =
    fly.transitMode === "metro" ? 8.8 :
    fly.transitMode === "car" ? 4.6 :
    fly.transitMode === "scooter" ? 3.2 : 1;

  const fc = fly.brain?.fullConnectome;
  const neuralMotor = fc?.connected ? clamp(Number(fc.motorDrive || 0), 0, 1) : 0.5;
  const baseSpeed = (1.8 + fly.energy / 150 + neuralMotor * 0.65) * vehicleBoost;
  const danger = weatherDanger();
  const weatherFactor =
    fly.transitMode === "metro" ? 1 :
    fly.transitMode === "car" ? (1 - danger * 0.18) :
    fly.transitMode === "scooter" ? (1 - danger * 0.42) :
    (1 - danger * 0.58);

  // Law-aware traffic behavior: vehicles stop at red unless a high-risk, low-awareness
  // brain chooses to violate the signal. Violations are recorded and enforceable.
  const controlledCrossing=["car","scooter"].includes(fly.transitMode)||(fly.transitMode==="walk"&&fly.transitStage==="crosswalk");
  if(controlledCrossing&&shouldStopAtRed({...fly,transitMode:fly.transitMode==="walk"?"scooter":fly.transitMode})){
    const violationUrge=(fly.traits.risk||0)*0.65+(1-(fly.lawAwareness||0.7))*0.55+neuralDrive(fly,"approachDrive")*0.12;
    if(violationUrge>0.78&&brainRand(fly)<0.02){recordLawViolation(fly,fly.transitMode==="walk"?"crossing against the signal":"running a red light",fly.transitMode==="walk"?0.6:1.1);}
    else{fly.vx=fly.vz=0;fly.trafficStatus=fly.transitMode==="walk"?"waiting at pedestrian signal":"waiting at red light";fly.stress=clamp(fly.stress+(1-(fly.lawAwareness||0.7))*0.02);return;}
  } else fly.trafficStatus=null;

  const ux = dx / dist;
  const uz = dz / dist;
  const step = Math.min(Math.max(0.08, baseSpeed * weatherFactor), dist);
  fly.vx = ux * step;
  fly.vz = uz * step;
  const nextPosition={x:fly.x+fly.vx,z:fly.z+fly.vz};
  if(!clearSegment(fly,nextPosition)){fly.vx=fly.vz=0;fly.traveling=false;fly.actionUntil=0;fly.action="replanning a blocked route";return;}
  fly.x=nextPosition.x;fly.z=nextPosition.z;
  if(["car","scooter"].includes(fly.transitMode))fly.parkedCar={x:fly.x,z:fly.z};
  fly.y = 1.1;

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
    const p=legalDestinationPoint(dest);
    const plan=chooseTravelMode(fly,p);
    fly.routeWaypoints=plan.route||plan.metro?.waypoints||[];
    fly.routeIndex=0;fly.metroLineId=plan.metro?.lineId||null;fly.transitMode=plan.mode;fly.transitStage=plan.metro?"station-entry":plan.mode;
    if(fly.routeWaypoints.length){fly.targetX=fly.routeWaypoints[0].x;fly.targetZ=fly.routeWaypoints[0].z;}else{fly.targetX=p.x;fly.targetZ=p.z;}
    fly.travelLastDistance=Math.hypot(fly.targetX-fly.x,fly.targetZ-fly.z);
    fly.travelStuckTicks=0;
  }
}

function productionAndRetail(fly, clock) {
  if (!fly.alive || fly.traveling) return;
  const business = state.businesses?.[fly.currentLocationId];

  if(String(fly.action||"").startsWith("working as") || String(fly.action||"").includes("teaching at Hansdrex Academy")){
    const workLoc=fly.businessEmployeeOf?state.enterprises?.[fly.businessEmployeeOf]?.locationId:(fly.jobId?JOBS.find((j)=>j.id===fly.jobId)?.locationId:null);
    if(workLoc && fly.currentLocationId===workLoc){
      fly.workMinutesToday=Number(fly.workMinutesToday||0)+GAME_SECONDS_PER_REAL_SECOND/60;
      if(fly.lastWorkEventDay!==clock.day){fly.lastWorkEventDay=clock.day;brainRemember(fly,"shift_started",{job:fly.jobTitle,locationId:workLoc});if(brainRand(fly)<0.25)emit("work",`${fly.id} started work as ${fly.jobTitle||"worker"} on a self-chosen schedule.`,{flyId:fly.id,jobTitle:fly.jobTitle,start:fly.preferredWorkStart});}
    }
  }
  educationTick(fly,clock);

  if (fly.jobId === "farm" && fly.currentLocationId === "farm" && String(fly.action).startsWith("working")) {
    state.businesses.farm.inventory += 0.08 * (0.5 + fly.traits.ambition);
    if (state.businesses.farm.inventory > 80 && rand() < 0.025) {
      const moved = Math.min(35, state.businesses.farm.inventory);
      state.businesses.farm.inventory -= moved;
      state.businesses.market.inventory += moved * 0.45;
      state.businesses.grocery.inventory += moved * 0.35;
      state.businesses.bakery.inventory += moved * 0.20;
    }
  }

}

function payAndFinance(fly, clock) {
  const day = clock.day;
  const salaryJob = fly.jobId ? JOBS.find((j) => j.id === fly.jobId) : null;
  if (salaryJob && !fly.businessEmployeeOf) {
    ensureCognitiveProfile(fly);
    const payHour=Math.floor((fly.preferredWorkStart+fly.preferredWorkHours)%24);
    if(clock.hour===payHour&&clock.minute<2&&fly.lastPaidDay!==day&&fly.ageYears>=18&&fly.ageYears<=75){
      const workedHours=Math.min(12,Number(fly.workMinutesToday||0)/60);
      if(workedHours>=1){
        const base=fly.wage*workedHours;
        const bonus=base*fly.traits.ambition*randRange(0,0.14);
        const gross=base+bonus,tax=gross*0.07,available=Math.max(0,Number(state.treasury?.cash||0)),paid=Math.min(gross,available),net=Math.max(0,paid-tax);
        state.treasury.cash-=paid;state.treasury.spending=Number(state.treasury.spending||0)+paid;state.treasury.taxRevenue=Number(state.treasury.taxRevenue||0)+Math.min(tax,paid);state.treasury.cash+=Math.min(tax,paid);
        fly.money+=net;fly.salaryEarnedToday+=net;fly.salaryLifetime+=net;fly.happiness=clamp(fly.happiness+(paid>=gross?2.5:-2));state.totalTransactions+=1;
        emit("salary",`${fly.id} earned ${net.toFixed(1)} ${CURRENCY_CODE} after tax for ${workedHours.toFixed(1)}h worked.`,{flyId:fly.id,amount:net,hours:workedHours,tax:Math.min(tax,paid)});
      }
      fly.lastPaidDay=day;fly.workMinutesToday=0;
    }
  }

  if (clock.hour === 0 && clock.minute < 2 && fly.lastRentDay !== day) {
    const hh = state.housing?.households?.[fly.householdId];
    if(hh&&hh.lastRentDay!==day){
      const expense=Math.max(0,Number(hh.monthlyHousingCost||18))/30;
      const adults=householdMembers(hh.id).filter(f=>f.ageYears>=18),payers=adults.length?adults:[fly];
      let remaining=expense;
      for(const payer of payers){const payment=Math.min(Math.max(0,payer.money),remaining);payer.money-=payment;payer.expensesLifetime+=payment;state.treasury.cash+=payment;remaining-=payment;}
      hh.rentArrears=Number(hh.rentArrears||0)+remaining;hh.lastRentDay=day;
      if(remaining>0)for(const member of payers)member.stress=clamp(member.stress+2);
    }
    fly.lastRentDay=day;

    const saveTarget = Math.max(0, fly.money * fly.traits.thrift * 0.22);
    fly.money -= saveTarget;
    fly.savings += saveTarget;

    if (fly.debt > 0 && fly.savings > 60) {
      const payment = Math.min(fly.debt, fly.savings * 0.15);
      fly.debt -= payment;
      fly.savings -= payment;
      state.bank.reserves+=payment;
    }

    if (!fly.ownsHome && fly.ageYears >= 21 && fly.creditScore >= 610 &&
        fly.money + fly.savings > 2500 &&
        brainRand(fly) < 0.012 + fly.traits.ambition * 0.012 + neuralDrive(fly, "approachDrive") * 0.008) {
      const freeLots = state.housing?.houseLots?.filter((lot) => !lot.ownerHouseholdId) || [];
      if (freeLots.length) {
        freeLots.sort((a,b) => a.baseValue - b.baseValue);
        const affordable = freeLots.filter((lot) => {
          const deposit = lot.baseValue * 0.35;
          return fly.money + fly.savings >= deposit;
        });
        const lot = affordable[Math.floor(brainRand(fly) * Math.max(1, affordable.length))];
        if (lot) {
          const deposit = lot.baseValue * 0.35;
          const loan = lot.baseValue - deposit;
          const approval =
            fly.creditScore / 850 * 0.48 +
            fly.traits.thrift * 0.14 +
            fly.traits.ambition * 0.10 +
            neuralDrive(fly, "approachDrive") * 0.12 -
            neuralDrive(fly, "avoidDrive") * 0.12 -
            fly.debt / 6000 * 0.08;
          if (approval > 0.48 && state.bank.reserves > loan) {
            const fromCash = Math.min(fly.money, deposit);
            fly.money -= fromCash;
            fly.savings -= Math.max(0, deposit - fromCash);
            const hh = state.housing.households[fly.householdId] || createHousehold(fly);
            releaseHousingUnit(hh);
  lot.ownerHouseholdId = hh.id;
            hh.housingType = "house";
            hh.unitId = lot.id;
            hh.homeX = lot.x;
            hh.homeZ = lot.z;
            hh.monthlyHousingCost = Math.round(lot.baseValue * 0.003);
            hh.propertyValue = lot.baseValue;
            fly.housingType = "house";
            fly.housingUnitId = lot.id;
            fly.homeX = lot.x;
            fly.homeZ = lot.z;
            fly.ownsHome = true;
            fly.homeTier = 1;
            fly.homeEquity = lot.baseValue;
            fly.bankLoan += loan;
            state.bank.reserves -= loan;
            state.treasury.cash+=lot.baseValue;
            for(const member of householdMembers(hh.id)){member.homeX=lot.x;member.homeZ=lot.z;member.housingType="house";member.housingUnitId=lot.id;member.actionUntil=0;if(member.indoors){member.indoors=false;const door=entrance(member);member.x=door.x;member.z=door.z;}if(member.targetLocationId===member.homeId)member.traveling=false;}
            state.bank.loansOutstanding += loan;
            emit("home_purchase", `${fly.id} bought a ground house for ${lot.baseValue.toFixed(0)} H$ with Hansdrex Bank financing.`, {
              flyId: fly.id, lotId: lot.id, value: lot.baseValue, loan,
            });
          }
        }
      }
    }

    if (fly.ownsHome && fly.homeTier < 3 && fly.savings >= 3200 + fly.homeTier * 3600 && rand() < 0.08) {
      const upgradeCost = 3200 + fly.homeTier * 3600;
      fly.savings -= upgradeCost;
      state.treasury.cash+=upgradeCost;
      fly.homeEquity += upgradeCost;
      fly.homeTier += 1;
      emit("home_upgrade", `${fly.id} expanded their home to tier ${fly.homeTier}.`, { flyId: fly.id, tier: fly.homeTier });
    }

  }
}

function ensureHeliTourStaff(){
  const ids=new Set(["heli-pilot-day","heli-pilot-evening","heli-ground","heli-ground-evening"]);
  const staff=state.flies.filter((f)=>f.alive&&ids.has(f.jobId));
  if(staff.length>=4)return staff;
  const slots=["heli-pilot-day","heli-pilot-evening","heli-ground","heli-ground-evening"];
  const candidates=state.flies
    .filter((f)=>f.alive&&f.ageYears>=23&&f.ageYears<=66&&!f.businessId&&!f.businessEmployeeOf&&!ids.has(f.jobId)&&!["doctor","police","power","power-evening","power-night","grid-dispatch","school"].includes(f.jobId))
    .sort((a,b)=>(b.intelligence+b.traits.resilience+b.traits.ambition)-(a.intelligence+a.traits.resilience+a.traits.ambition));
  while(staff.length<4&&candidates.length){
    const fly=candidates.shift(),job=JOBS.find((j)=>j.id===slots[staff.length]);
    if(!fly||!job)break;
    fly.jobId=job.id;fly.jobTitle=job.title;fly.wage=job.wage;
    fly.preferredWorkStart=job.shiftStart;fly.preferredWorkHours=(job.shiftEnd-job.shiftStart+24)%24||8;
    fly.professionSkills=trainedSkillsForJob(job.id,job.title);
    fly.brainDecision="accepted Hansdrex Heli Tours aviation job";
    brainRemember(fly,"aviation_job",{jobId:job.id});
    staff.push(fly);
  }
  return staff;
}

function simulateParkWheel(fly){
 const now=state.simulationAgeSeconds;
 if(fly.wheelRideUntil){
  if(now>=fly.wheelRideUntil){
   fly.wheelRideUntil=0;fly.wheelSeat=null;fly.x=15;fly.y=1.1;fly.z=-80;fly.targetX=fly.x;fly.targetZ=fly.z;
   fly.action="relaxing after the free park wheel";fly.actionUntil=now+1800;
   fly.stress=clamp(fly.stress-24);fly.happiness=clamp(fly.happiness+12);fly.loneliness=clamp(fly.loneliness-8);
   state.parkLeisure.completedRides++;
   emit("park_ride",`${fly.id} finished a free Central Park wheel ride.`,{flyId:fly.id,ticket:0});
   return true;
  }
  Object.assign(fly,wheelCabin(now,fly.wheelSeat));fly.vx=fly.vz=0;fly.sleeping=false;fly.indoors=false;
  fly.action="riding the free Central Park wheel";fly.stress=clamp(fly.stress-.18);return true;
 }
 if(fly.traveling||fly.currentLocationId!=="ferris-wheel"||fly.action!=="riding the free Central Park wheel")return false;
 if(weatherDanger()>=.3){fly.action="park wheel closed for weather";fly.actionUntil=now+1200;return false;}
 const occupied=new Set(state.flies.filter(f=>f.alive&&f.wheelRideUntil>now).map(f=>f.wheelSeat));
 const seat=Array.from({length:FERRIS_WHEEL.seats},(_,i)=>i).sort((a,b)=>wheelCabin(now,a).y-wheelCabin(now,b).y)[0];
 if(occupied.has(seat))return false;
 fly.wheelSeat=seat;fly.wheelRideUntil=now+FERRIS_WHEEL.period;fly.traveling=false;fly.indoors=false;fly.sleeping=false;
 state.parkLeisure||={boardings:0,completedRides:0};state.parkLeisure.boardings++;
 return true;
}

function heliTourTicketPrice(){
  return 185*Number(state.centralBank?.priceLevel||1);
}

function heliTourAvailable(clock){
  if(weatherDanger()>0.22)return false;
  if(clock.hour<8||clock.hour>=22)return false;
  const staff=ensureHeliTourStaff();
  const pilots=staff.filter((f)=>String(f.jobId||"").startsWith("heli-pilot"));
  return pilots.some(p=>!p.traveling&&p.currentLocationId==="heliport"&&personalWorkWindow(p,JOBS.find(j=>j.id===p.jobId),clock.hour));
}

function simulateHeliTour(fly,clock){
  const now=state.simulationAgeSeconds;
  if(fly.heliTourUntil&&now<fly.heliTourUntil){
    const start=Number(fly.heliTourStartedAt||now),duration=Math.max(1,fly.heliTourUntil-start),progress=clamp((now-start)/duration,0,1);
    if(now<start){fly.x=23;fly.y=103;fly.z=43.5;fly.indoors=false;fly.heliPassenger=true;fly.action="boarding Hansdrex helicopter";return true;}
    const angle=progress*Math.PI*2-Math.PI/2;
    const radius=105+Math.sin(progress*Math.PI*4)*16;
    fly.heliPassenger=true;
    fly.traveling=false;
    fly.transitMode="helicopter";
    fly.transitStage="sightseeing-flight";
    fly.action="helicopter sightseeing over Hansdrex";
    fly.x=15+Math.cos(angle)*radius;
    fly.z=34+Math.sin(angle)*radius*0.72;
    fly.y=158+Math.sin(progress*Math.PI*2)*8;
    fly.indoors=false;
    fly.vx=fly.vz=0;
    fly.excitement=clamp(fly.excitement+0.12);
    fly.stress=clamp(fly.stress-0.10);
    return true;
  }
  if(fly.heliTourUntil&&now>=fly.heliTourUntil){
    fly.heliTourUntil=0;fly.heliTourStartedAt=0;fly.heliPassenger=false;
    fly.transitMode="walk";fly.transitStage=null;fly.currentLocationId="heliport";fly.targetLocationId="heliport";
    fly.x=15;fly.z=43.5;fly.y=1.4;fly.indoors=true;fly.targetX=fly.x;fly.targetZ=fly.z;fly.action="finished Hansdrex helicopter tour";fly.actionUntil=now+900;
    fly.happiness=clamp(fly.happiness+10);fly.excitement=clamp(fly.excitement+16);fly.stress=clamp(fly.stress-12);
    brainRemember(fly,"heli_tour_completed",{weather:weatherLabel(),ticket:fly.lastHeliTicket||0});
    emit("heli_landing",`${fly.id} landed after a Hansdrex skyline helicopter tour.`,{flyId:fly.id,ticket:fly.lastHeliTicket||0});
    return true;
  }
  if(fly.currentLocationId!=="heliport"||fly.traveling||fly.action!=="taking a Hansdrex helicopter sightseeing tour")return false;
  const active=state.flies.filter((f)=>f.alive&&f.heliPassenger&&Number(f.heliTourUntil||0)>now).length;
  const fare=heliTourTicketPrice();
  const subsidized=fly.stress>=55;
  const price=subsidized?0:fare;
  if(active>=4||(state.helicopterFlight&&now>=state.helicopterFlight.startsAt&&now<state.helicopterFlight.endsAt)){fly.action="waiting for the next Hansdrex helicopter";fly.actionUntil=now+600;return true;}
  if(!heliTourAvailable(clock)){fly.action="heli tour cancelled by weather or operating hours";fly.actionUntil=now+1200;fly.stress=clamp(fly.stress-1);return true;}
  if(fly.money+fly.savings<price){fly.action="could not afford the helicopter tour";fly.actionUntil=now+1800;return true;}
  const cash=Math.min(fly.money,price);fly.money-=cash;fly.savings-=Math.max(0,price-cash);
  if(subsidized){fundPublicPayment(fare);ensureWelfare().leisureSubsidies+=fare;}
  state.businesses["heli-tour"].cash+=fare;fly.expensesLifetime+=price;state.totalTransactions+=1;
  if(!state.helicopterFlight||now>=state.helicopterFlight.endsAt)state.helicopterFlight={startsAt:now+600,endsAt:now+2400};
  fly.lastHeliTicket=price;fly.heliTourStartedAt=state.helicopterFlight.startsAt;fly.heliTourUntil=state.helicopterFlight.endsAt;fly.heliPassenger=true;
  fly.transitMode="helicopter";fly.transitStage="boarding";fly.action="boarding Hansdrex helicopter";
  fly.excitement=clamp(fly.excitement+12);
  brainRemember(fly,"heli_tour_purchase",{price,socialClass:fly.socialClass,weather:weatherLabel()});
  emit("heli_boarding",`${fly.id} paid ${price.toFixed(0)} ${CURRENCY_CODE} and boarded Hansdrex Heli Tours.`,{flyId:fly.id,price,socialClass:fly.socialClass});
  return true;
}

function vehicleShopping(fly) {
  if(fly.traveling||fly.vehicle||fly.currentLocationId!=="vehicle-showroom"||!String(fly.action||"").includes("vehicle"))return;
  const level=Number(state.centralBank?.priceLevel||1),affordable=VEHICLE_CATALOG.map((v)=>({...v,price:v.price*level})).filter((v)=>v.price<=fly.savings*0.88);
  if(!affordable.length||state.businesses["vehicle-showroom"].inventory<1)return;
  const desire=fly.traits.ambition*0.28+neuralDrive(fly,"approachDrive")*0.24+neuralDrive(fly,"exploreDrive")*0.18+fly.excitement/100*0.14+(fly.savings>1000?0.12:0);
  if(brainRand(fly)<0.035+desire*0.08){
    const choice=desire>0.72?affordable[affordable.length-1]:affordable[Math.floor(brainRand(fly)*affordable.length)];
    fly.savings-=choice.price;fly.vehicle=choice.id;fly.parkedCar=parkingPoint(fly);state.businesses["vehicle-showroom"].cash+=choice.price;state.businesses["vehicle-showroom"].inventory=Math.max(0,state.businesses["vehicle-showroom"].inventory-1);state.totalTransactions+=1;fly.happiness=clamp(fly.happiness+8);fly.excitement=clamp(fly.excitement+12);brainRemember(fly,"vehicle_purchase",{vehicle:choice.id,price:choice.price});
    emit("vehicle_purchase",`${fly.id} independently decided to buy a ${choice.id} at Hansdrex Motors for ${choice.price.toFixed(0)} ${CURRENCY_CODE}.`,{flyId:fly.id,vehicle:choice.id,price:choice.price});
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

function endRelationship(a,b,reason="relationship ended") {
  if(!a||!b)return false;
  const linked=a.partnerId===b.id||b.partnerId===a.id;
  if(!linked)return false;
  for(const person of [a,b]){
    person.partnerId=null;
    person.relationshipSince=null;
    person.familyWaitYears=null;
    person.familyReadiness=0;
    person.flirtingWith=null;
    person.affection=0;
    person.relationshipTrust=clamp(Number(person.relationshipTrust||50)-8,0,100);
    person.jealousy=clamp(Number(person.jealousy||0)-12,0,100);
    person.happiness=clamp(person.happiness-12);
    person.loneliness=clamp(person.loneliness+16);
  }
  emit("breakup",`${a.id} and ${b.id} ended their relationship: ${reason}.`,{flyId:a.id,partnerId:b.id,reason});
  return true;
}

function revealInfidelity(actor,betrayed) {
  if(!actor||!betrayed||!actor.alive||!betrayed.alive)return false;
  actor.affairDiscovered=true;
  betrayed.jealousy=clamp(Number(betrayed.jealousy||0)+38+(betrayed.traits?.risk||0.5)*14,0,100);
  betrayed.relationshipTrust=clamp(Number(betrayed.relationshipTrust||65)-34,0,100);
  actor.relationshipTrust=clamp(Number(actor.relationshipTrust||65)-18,0,100);
  betrayed.affection=clamp(betrayed.affection-16);
  actor.affection=clamp(actor.affection-10);
  betrayed.stress=clamp(betrayed.stress+22);
  actor.stress=clamp(actor.stress+10);
  betrayed.happiness=clamp(betrayed.happiness-14);
  brainRemember(betrayed,"infidelity_discovered",{partnerId:actor.id,with:actor.lastAffairWith});
  brainRemember(actor,"infidelity_discovered",{partnerId:betrayed.id,with:actor.lastAffairWith});
  emit("infidelity_discovered",`${betrayed.id} discovered that partner ${actor.id} had been unfaithful.`,{flyId:actor.id,partnerId:betrayed.id,otherId:actor.lastAffairWith});
  return true;
}

function recordInfidelity(actor,other,betrayed,discovered=false) {
  if(!actor?.alive||!other?.alive||!betrayed?.alive||actor.partnerId!==betrayed.id||related(actor,other))return false;
  actor.infidelityCount=Number(actor.infidelityCount||0)+1;
  actor.lastAffairAt=state.simulationAgeSeconds;
  actor.lastAffairWith=other.id;
  actor.affairDiscovered=false;
  actor.excitement=clamp(actor.excitement+12);
  other.excitement=clamp(other.excitement+9);
  actor.stress=clamp(actor.stress+(actor.traits?.empathy||0.5)*6);
  actor.affection=clamp(actor.affection-5);
  brainRemember(actor,"infidelity",{with:other.id,partnerId:betrayed.id});
  brainRemember(other,"affair",{with:actor.id,partnerId:betrayed.id});
  if(discovered) return revealInfidelity(actor,betrayed);
  emit("infidelity",`${actor.id} secretly crossed a relationship boundary with ${other.id} while partnered with ${betrayed.id}.`,{flyId:actor.id,partnerId:betrayed.id,otherId:other.id});
  return true;
}

function nearestAffairCandidate(fly,partner) {
  let best=null,bestScore=-Infinity;
  for(const other of state.flies){
    if(!other.alive||other.id===fly.id||other.id===partner?.id||other.partnerId||other.traveling||other.sleeping||other.currentLocationId!==fly.currentLocationId||related(fly,other))continue;
    if(other.ageYears<18||other.ageYears>85||fly.ageYears<18||fly.ageYears>85)continue;
    const d=Math.hypot(other.x-fly.x,other.z-fly.z);if(d>9.5)continue;
    const score=romanceUtility(fly,other)*0.52+romanceUtility(other,fly)*0.28+(other.traits?.risk||0.5)*0.12+brainRand(fly)*0.08;
    if(score>bestScore){best=other;bestScore=score;}
  }
  return bestScore>0.53?best:null;
}

function maybeJealousyConflict(fly,partner) {
  if(!fly?.alive||!partner?.alive||fly.partnerId!==partner.id)return false;
  const jealousy=Number(fly.jealousy||0);
  if(jealousy<12||state.simulationAgeSeconds-Number(fly.lastJealousyAt||-1e12)<1800)return false;
  fly.lastJealousyAt=state.simulationAgeSeconds;
  const intensity=clamp(jealousy/100*0.48+fly.stress/100*0.24+(1-Number(fly.relationshipTrust||60)/100)*0.28,0,1);
  fly.stress=clamp(fly.stress+4+intensity*8);
  partner.stress=clamp(partner.stress+3+intensity*6);
  fly.affection=clamp(fly.affection-(2+intensity*7));
  partner.affection=clamp(partner.affection-(1+intensity*5));
  fly.jealousy=clamp(jealousy-(5+fly.traits.empathy*5));
  emit("relationship_conflict",`${fly.id} confronted partner ${partner.id} over jealousy and trust.`,{flyId:fly.id,partnerId:partner.id,intensity});
  const aggression=intensity*0.46+fly.traits.risk*0.22+(1-fly.traits.empathy)*0.22+fly.stress/100*0.18;
  if(aggression>0.76&&brainRand(fly)<0.045+intensity*0.045){
    const damage=brainRange(fly,2,10)*(0.7+fly.traits.risk*0.5);
    partner.health=clamp(partner.health-damage);
    partner.stress=clamp(partner.stress+12);
    recordLawViolation(fly,"assault",2.4);
    emit("assault",`${fly.id} assaulted partner ${partner.id} during a jealousy conflict.`,{flyId:fly.id,victimId:partner.id,damage,relationshipConflict:true});
  }
  if((Number(fly.relationshipTrust||50)<18||fly.affection<12)&&brainRand(fly)<0.12+intensity*0.20){
    return endRelationship(fly,partner,"trust collapsed after repeated conflict");
  }
  return false;
}

function socialLife(fly, clock) {
  if (!fly.alive||fly.traveling||fly.sleeping) return;
  if (!["social", "food", "nightlife"].includes(location(fly.currentLocationId).type)) return;
  if (state.simulationAgeSeconds - fly.lastSocialTick < 600) return;
  fly.lastSocialTick = state.simulationAgeSeconds;

  const partner = fly.partnerId ? state.flies.find((f) => f.id === fly.partnerId && f.alive) : null;

  if (partner) {
    const partnerPresent=!partner.traveling&&!partner.sleeping&&partner.currentLocationId===fly.currentLocationId&&Math.hypot(partner.x-fly.x,partner.z-fly.z)<=10;
    if(partnerPresent){
      if(fly.lastAffairWith&&!fly.affairDiscovered&&state.simulationAgeSeconds-fly.lastAffairAt>600){
        const discoveryChance=0.035+partner.traits.sociability*0.045+Math.min(0.06,Number(fly.infidelityCount||0)*0.012);
        if(brainRand(partner)<discoveryChance)revealInfidelity(fly,partner);
      }
      const closeness = 4 + fly.traits.empathy * 5 - Number(fly.jealousy||0)*0.025;
      fly.affection = clamp(fly.affection + randRange(-2, closeness), 0, 100);
      fly.relationshipTrust=clamp(Number(fly.relationshipTrust||65)+0.15*fly.traits.empathy-(fly.jealousy||0)*0.001,0,100);
      fly.loneliness = clamp(fly.loneliness - 8);
      fly.happiness = clamp(fly.happiness + 2.5);
      fly.excitement = clamp(fly.excitement + randRange(-3, 5));
      if(maybeJealousyConflict(fly,partner))return;
      if ((fly.affection < 12 || Number(fly.relationshipTrust||50)<10) && fly.stress > 70 && rand() < 0.08) {
        endRelationship(fly,partner,"affection and trust fell too low");
      }
      return;
    }

    if(fly.ageYears>=18&&fly.ageYears<=85&&state.simulationAgeSeconds-Number(fly.lastAffairAt||-1e12)>7200){
      const candidate=nearestAffairCandidate(fly,partner);
      if(candidate){
        const desireA=romanceUtility(fly,candidate),desireB=romanceUtility(candidate,fly);
        const commitment=fly.affection/100*0.24+Number(fly.relationshipTrust||65)/100*0.24+fly.traits.empathy*0.18+(1-fly.traits.risk)*0.12;
        const nightlife=location(fly.currentLocationId).type==="nightlife"?0.10:0;
        const temptation=clamp(fly.traits.risk*0.24+fly.loneliness/100*0.18+fly.excitement/100*0.12+neuralDrive(fly,"approachDrive")*0.18+nightlife-commitment,0,1);
        const mutual=clamp(desireB*0.56+candidate.traits.risk*0.14+candidate.loneliness/100*0.12+neuralDrive(candidate,"approachDrive")*0.18,0,1);
        const chance=Math.max(0,0.001+temptation*0.012+(desireA-0.55)*0.008);
        if(desireA>0.58&&mutual>0.50&&brainRand(fly)<chance){
          const witnessed=brainRand(fly)<0.10+candidate.traits.sociability*0.08;
          recordInfidelity(fly,candidate,partner,witnessed);
        }
      }
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
    fly.relationshipTrust=candidate.relationshipTrust=randRange(58,82);
    fly.jealousy=candidate.jealousy=0;
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
  if (!fly.alive || fly.traveling || fly.sleeping || fly.sex !== "F" || fly.pregnancyDueAt) return;
  if (!fly.partnerId || fly.ageYears < 18 || fly.ageYears > 52) return;
  const partner = state.flies.find((f) => f.id === fly.partnerId && f.alive);
  if (!partner || partner.traveling || partner.sleeping || partner.householdId!==fly.householdId || !fly.indoors || !partner.indoors || fly.currentLocationId!==fly.homeId || partner.currentLocationId!==partner.homeId || related(fly,partner) || partner.sex !== "M" || partner.ageYears < 18 || partner.ageYears > 75) return;
  if (state.flies.filter((f) => f.alive).length >= MAX_POPULATION) return;

  const relationshipYears = Math.max(0, gameYears() - Number(fly.relationshipSince ?? gameYears()));
  const waitA = Number(fly.familyWaitYears ?? 0.25);
  const waitB = Number(partner.familyWaitYears ?? 0.25);
  const mutualWait = Math.max(waitA, waitB);

  const financialSecurity = clamp(
    ((fly.money + fly.savings - fly.debt) + (partner.money + partner.savings - partner.debt) + 1000) / 6500,
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
  if (!father || state.flies.filter((f) => f.alive).length >= MAX_POPULATION) return;

  const litter = rand() < 0.14 ? 2 : 1;
  for (let i = 0; i < litter && state.flies.filter((f) => f.alive).length < MAX_POPULATION; i += 1) {
    const child = createFly(state.flies.length, [fly, father]);
    inheritHousehold(child, fly);
    state.flies.push(child);
    fly.children.push(child.id);
    father.children.push(child.id);
    state.births += 1;
    payBirthGrant(child, fly);
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
      startJourney(fly,{id:"hospital-central",action:"seeking emergency care"});
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
      startJourney(fly,{id:"clinic",action:"seeking emergency care"});
      fly.action = "injured";
      emit("accident", `${fly.id} was injured in a traffic accident.`, { flyId: fly.id });
    }
  }

  if (oldStress < 90 && fly.stress >= 90 && rand() < 0.1) {
    emit("crisis", `${fly.id} entered a severe stress crisis.`, { flyId: fly.id, stress: fly.stress });
  }
}

function regulateEmotions(fly, clock) {
  // Happiness is slow-moving life satisfaction; stress is acute pressure.
  // They may coexist, but sustained 100/100 states are intentionally unstable.
  const atHome = fly.currentLocationId === fly.homeId && !fly.traveling;
  const partnered = fly.partnerId ? 1 : 0;
  const debtPressure = Math.min(24, Math.max(0, Number(fly.debt || 0)) / Math.max(120, Number(fly.money || 0) + Number(fly.savings || 0) + 120) * 28);
  const healthPressure = Math.max(0, 72 - Number(fly.health || 0)) * 0.24;
  const deprivation =
    Number(fly.hunger || 0) * 0.11 +
    Number(fly.thirst || 0) * 0.07 +
    Number(fly.sleepDebt || 0) * 0.20 +
    Number(fly.loneliness || 0) * 0.09;

  let stressTarget =
    9 +
    deprivation +
    healthPressure +
    debtPressure +
    weatherDanger() * 13 -
    Number(fly.traits?.resilience || 0.5) * 12 -
    (atHome ? 4 : 0) -
    (fly.sleeping ? 9 : 0) -
    Math.max(0, Number(fly.happiness || 0) - 65) * 0.075;
  stressTarget = clamp(stressTarget, 0, 94);

  let happinessTarget =
    38 +
    Number(fly.traits?.resilience || 0.5) * 17 +
    Number(fly.traits?.empathy || 0.5) * 4 +
    partnered * 5 +
    Number(fly.health || 0) * 0.10 -
    Number(fly.loneliness || 0) * 0.15 -
    Number(fly.hunger || 0) * 0.10 -
    Number(fly.sleepDebt || 0) * 0.11 -
    Number(fly.stress || 0) * 0.25;
  happinessTarget = clamp(happinessTarget, 4, 92);

  // Mean-revert gently so events still matter, but saturated values do not stay forever.
  fly.stress = clamp(Number(fly.stress || 0) + (stressTarget - Number(fly.stress || 0)) * 0.006);
  fly.happiness = clamp(Number(fly.happiness || 0) + (happinessTarget - Number(fly.happiness || 0)) * 0.0045);

  // Severe stress and maximum happiness can happen briefly, but not remain locked together.
  // Excess positive arousal is represented as excitement instead of 100/100 stress+happiness.
  if (fly.stress > 80) {
    const happinessCeiling = 100 - (fly.stress - 80) * 0.75;
    if (fly.happiness > happinessCeiling) {
      const excess = fly.happiness - happinessCeiling;
      const transfer = Math.min(excess, 0.32 + excess * 0.08);
      fly.happiness = clamp(fly.happiness - transfer);
      fly.excitement = clamp(Number(fly.excitement || 0) + transfer * 0.42);
    }
  }

  if (fly.happiness > 82 && fly.stress > 55 && !fly.mentalHealthCrisis) {
    fly.stress = clamp(fly.stress - (fly.happiness - 82) * 0.0025 * (0.6 + Number(fly.traits?.resilience || 0.5)));
  }

  fly.emotionalValence = clamp((fly.happiness - fly.stress) / 100, -1, 1);
  fly.emotionalArousal = clamp((Number(fly.excitement || 0) * 0.55 + fly.stress * 0.45) / 100, 0, 1);
}

function needsAndActivities(fly, clock) {
  fly.hunger = clamp(fly.hunger + 0.055);
  fly.thirst = clamp(fly.thirst + 0.082);
  fly.caffeine = clamp(fly.caffeine - 0.075);
  const atHome = fly.currentLocationId === fly.homeId && !fly.traveling;
  const sleeping = Boolean(fly.action==="sleeping" && atHome && !fly.traveling && fly.indoors);
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

  if(fly.traveling)return;
  // Tap water is free in homes, indoor public places and park fountains.
  if(fly.thirst>35&&(fly.indoors||atHome||fly.currentLocationId==="park")){
    fly.thirst=clamp(fly.thirst-55);fly.stress=clamp(fly.stress-2);
    if(fly.currentLocationId==="tea-house")fly.action="drinking tea and water";
  }
  const foodPlaces = ["market","grocery","bakery","restaurant","night-market"];
  // Deliver essentials to homes/shelters as well: children, poor and rain-bound residents can eat.
  if ((foodPlaces.includes(fly.currentLocationId)||atHome||fly.action==="sheltering from bad weather") && fly.hunger > 45) {
    restockEssentials();
    const business=state.businesses[foodPlaces.includes(fly.currentLocationId)?fly.currentLocationId:"market"];
    const price=0.1,paid=Math.min(price,Math.max(0,fly.money)),subsidy=4-paid;
    if(paid>0)spend(fly,paid,business);
    fundPublicPayment(subsidy);business.cash+=subsidy;ensureWelfare().foodSubsidies+=subsidy;
    fly.hunger=clamp(fly.hunger-60);fly.thirst=clamp(fly.thirst-30);fly.happiness=clamp(fly.happiness+2);
    business.inventory=Math.max(0,business.inventory-1);state.foodReserve--;
  }
  if(fly.indoors&&fly.hunger<55&&fly.thirst<55&&fly.stress<80){
    fly.health=clamp(fly.health+(sleeping?0.025:0.008));
  }

  if (fly.currentLocationId === "cafe" && fly.action === "drinking Hansdrex coffee" &&
      state.simulationAgeSeconds - fly.lastCoffeeAt > 2700 && fly.money >= 5) {
    const cost = state.businesses.cafe?.price || 5;
    if(!spend(fly,cost,state.businesses.cafe))return;
    fly.caffeine = clamp(fly.caffeine + 58);
    fly.energy = clamp(fly.energy + 16);
    fly.excitement = clamp(fly.excitement + 8);
    fly.thirst = clamp(fly.thirst - 24);
    fly.stress = clamp(fly.stress - 2);
    fly.lastCoffeeAt = state.simulationAgeSeconds;


    if (clock.hour >= 18 || clock.hour < 4) {
      fly.sleepDebt = clamp(fly.sleepDebt + 9);
      fly.stress = clamp(fly.stress + 1.5);
    }
    brainRemember(fly, "coffee", { hour: clock.hour, caffeine: fly.caffeine, cost });
  }

  if (["hospital-central","hospital-east","clinic"].includes(fly.currentLocationId) &&
      (fly.health < 78 || fly.illness) && fly.money >= 12 && brainRand(fly) < 0.055) {
    const clinician=state.flies.some(f=>f.alive&&!f.traveling&&!f.sleeping&&f.currentLocationId===fly.currentLocationId&&Number(f.professionSkills?.medicine||0)>.5);
    if(!clinician)return;
    const cost = fly.currentLocationId.startsWith("hospital") ? 26 : 12;
    if(!spend(fly,cost,state.businesses[fly.currentLocationId]||state.treasury))return;
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

  if (location(fly.currentLocationId).type === "nightlife" && nightlifeOpen(clock) && !fly.action.startsWith("working")) {
    if(fly.currentLocationId==="rooftop"&&!state.flies.some(f=>f.alive&&!f.traveling&&f.currentLocationId==="rooftop"&&f.jobId==="rooftop"))return;
    if (state.simulationAgeSeconds - fly.lastLeisureAt > 1800 && fly.money >= 4) {
      const place = state.businesses?.[fly.currentLocationId];
      const spend = place?.price || brainRange(fly, 4, 10);
      if(fly.money<spend)return;
      fly.money-=spend;fly.expensesLifetime+=spend;
      fly.stress = clamp(fly.stress - brainRange(fly, 5, 12));
      fly.happiness = clamp(fly.happiness + brainRange(fly, 4, 10));
      fly.excitement = clamp(fly.excitement + brainRange(fly, 7, 16));
      fly.loneliness = clamp(fly.loneliness - brainRange(fly, 4, 12));
      fly.energy = clamp(fly.energy - brainRange(fly, 3, 8));
      fly.sleepDebt = clamp(fly.sleepDebt + brainRange(fly, 2, 7));
      fly.lastLeisureAt = state.simulationAgeSeconds;
      (place||state.treasury).cash+=spend;
      state.totalTransactions += 1;
    }
  }

  if (fly.currentLocationId === "park") {
    const sunset = sunsetQuality();
    fly.stress = clamp(fly.stress - (sunset > 0.48 ? 0.24 : 0.18));
    fly.excitement = clamp(fly.excitement + (sunset > 0.48 ? 0.09 : 0.015));
    fly.happiness = clamp(fly.happiness + 0.055);
    fly.loneliness=clamp(fly.loneliness-0.035);
  }
  if (fly.currentLocationId === "cafe") {
    fly.loneliness = clamp(fly.loneliness - 0.04);
    fly.happiness = clamp(fly.happiness + 0.025);
  }
  if (fly.smoking && fly.action === "smoke break") {
    fly.stress = clamp(fly.stress - 0.16);
    fly.health = clamp(fly.health - 0.018);
  }
}

function spend(fly,amount,recipient) {
 if(!Number.isFinite(amount)||amount<0||fly.money<amount||!recipient)return false;
 fly.money-=amount;recipient.cash=Number(recipient.cash||0)+amount;fly.expensesLifetime+=amount;state.totalTransactions++;return true;
}
function related(a,b){
 const ap=a.parents||[],bp=b.parents||[];
 return ap.includes(b.id)||bp.includes(a.id)||ap.some(id=>bp.includes(id));
}
function maintainHouseholds(){
 for(const hh of Object.values(state.housing.households)){
   hh.members=hh.members.filter(id=>state.flies.some(f=>f.id===id&&f.alive));
   if(!hh.members.length){releaseHousingUnit(hh);delete state.housing.households[hh.id];}
 }
 for(const f of state.flies){
  if(!f.alive&&!f.estateSettled){
    const heir=state.flies.find(h=>h.alive&&(h.id===f.partnerId||f.children.includes(h.id)));
    const estate=Math.max(0,f.money)+Math.max(0,f.savings);
    if(heir)heir.savings+=estate;else state.treasury.cash+=estate;
    f.money=f.savings=0;f.estateSettled=true;
  }
  if(f.alive&&f.partnerId&&!state.flies.some(p=>p.id===f.partnerId&&p.alive)){f.partnerId=null;f.relationshipSince=null;f.affection=0;}
  if(!f.alive||!f.partnerId||f.id>f.partnerId||f.affection<55||f.traveling)continue;
  const partner=state.flies.find(p=>p.id===f.partnerId&&p.alive);
  if(!partner||partner.traveling||partner.householdId===f.householdId||gameYears()-Number(f.relationshipSince??gameYears())<.03)continue;
  const home=state.housing.households[f.householdId],old=state.housing.households[partner.householdId];
  if(!home||!old||old.members.length>1||partner.ownsHome)continue;
  old.members=old.members.filter(id=>id!==partner.id);releaseHousingUnit(old);delete state.housing.households[old.id];
  home.members.push(partner.id);partner.householdId=home.id;partner.housingUnitId=home.unitId;partner.housingType=home.housingType;partner.homeX=home.homeX;partner.homeZ=home.homeZ;partner.actionUntil=0;
  emit("household",`${f.id} and ${partner.id} chose to share a home.`,{householdId:home.id});
 }
}

function tickFly(fly, clock) {
  if (!fly.alive) return;
  if(fly.health<=0){fly.alive=false;fly.causeOfDeath="fatal injuries or illness";state.deaths++;emit("death",`${fly.id} died after health reached zero.`,{flyId:fly.id});return;}
  if(lawEnforcement(fly)) return;
  if(simulateParkWheel(fly))return;
  if(simulateHeliTour(fly,clock)) return;
  ensureCognitiveProfile(fly);
  ensureProfessionalTraining(fly);
  const before = {
    happiness: fly.happiness,
    stress: fly.stress,
    hunger: fly.hunger,
    health: fly.health,
  };
  fly.ageYears = ageOf(fly);
  if (fly.ageYears < 18) {
    if(fly.businessEmployeeOf)fly.businessEmployeeOf=null;
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

  if(!fly.onTrain&&!fly.heliPassenger&&!fly.indoors&&Number(state.weather?.precipitation||0)>.32&&fly.pendingAction!=="sheltering from bad weather"&&fly.action!=="sheltering from bad weather"){
    const shelter=LOCATIONS.filter(l=>BUILDINGS.some(b=>b.id===l.id)).sort((a,b)=>Math.hypot(a.x-fly.x,a.z-fly.z)-Math.hypot(b.x-fly.x,b.z-fly.z))[0];
    const route=buildPedestrianRoute(fly,shelter);
    if(route.length){fly.targetLocationId=shelter.id;fly.pendingAction="sheltering from bad weather";fly.action="walking to shelter";fly.routeWaypoints=route;fly.routeIndex=0;fly.targetX=route[0].x;fly.targetZ=route[0].z;fly.traveling=true;fly.transitMode="walk";fly.metroLineId=null;}
  }
  if(fly.indoors&&Number(state.weather?.precipitation||0)>.32&&fly.action==="sheltering from bad weather")fly.actionUntil=state.simulationAgeSeconds+600;
  chooseDestination(fly, clock);
  moveFly(fly);
  if(simulateParkWheel(fly))return;
  if(simulateHeliTour(fly,clock)) return;
  needsAndActivities(fly, clock);
  applyPowerEffects(fly,clock);
  productionAndRetail(fly,clock);
  payAndFinance(fly,clock);
  simulateCrime(fly);
  vehicleShopping(fly);
  if (!fly.traveling && fly.currentLocationId === "bank" && fly.action.includes("business")) {
    attemptStartup(fly);
  }
  updateSocialClass(fly);
  socialLife(fly, clock);
  reproduction(fly);
  completePregnancy(fly);
  professionalService(fly);
  mentalHealthAndMortality(fly);
  if (fly.alive) regulateEmotions(fly, clock);
  brainLearnFromOutcome(fly, before);
  fly.movementTrace=[...(fly.movementTrace||[]),{x:fly.x,y:fly.y,z:fly.z,t:state.simulationAgeSeconds}].slice(-8);
}

async function checkpoint(force = false) {
  if (!force && Date.now() - checkpointAt < CHECKPOINT_EVERY_MS) return;
  checkpointAt = Date.now();
  state.updatedAt = new Date().toISOString();
  const living = state.flies.filter((f) => f.alive);
  const moneySupply = liquidMoneySupply();
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
    traveling:Boolean(f.traveling),indoors:Boolean(f.indoors),onTrain:Boolean(f.onTrain),
    parkedCar:f.parkedCar||null,
    movementTrace:f.movementTrace||[],
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
    emotionalValence: Number((f.emotionalValence ?? ((f.happiness-f.stress)/100)).toFixed(3)),
    emotionalArousal: Number((f.emotionalArousal ?? ((f.excitement*0.55+f.stress*0.45)/100)).toFixed(3)),
    loneliness: Number(f.loneliness.toFixed(1)),
    health: Number(f.health.toFixed(1)),
    money: Number(f.money.toFixed(1)),
    savings: Number(f.savings.toFixed(1)),
    debt: Number(f.debt.toFixed(1)),
    utilityDebt:Number((state.utilities?.householdAccounts?.[f.householdId]?.balance||0).toFixed(1)),
    powerOn:householdHasPower(f),
    criminalRecordCount:Array.isArray(f.criminalRecord)?f.criminalRecord.length:0,
    sentence:f.sentence||null,
    capitalCharge:Boolean(f.capitalCharge),
    jobTitle: f.jobTitle,
    partnerId: f.partnerId,
    affection: Number(f.affection.toFixed(1)),
    relationshipTrust: Number((f.relationshipTrust || 0).toFixed(1)),
    jealousy: Number((f.jealousy || 0).toFixed(1)),
    infidelityCount: Number(f.infidelityCount || 0),
    lastAffairWith: f.lastAffairWith || null,
    affairDiscovered: f.affairDiscovered !== false,
    relationshipYears: f.relationshipSince == null ? null : Number(Math.max(0, gameYears() - f.relationshipSince).toFixed(3)),
    familyWaitYears: f.familyWaitYears == null ? null : Number(f.familyWaitYears.toFixed(3)),
    familyReadiness: Number((f.familyReadiness || 0).toFixed(3)),
    flirtingWith: f.flirtingWith,
    pregnant: Boolean(f.pregnancyDueAt),
    children: f.children,
    parents: f.parents,
    vehicle: f.vehicle,
    transitMode: f.transitMode || "walk",
    transitStage: f.transitStage || null,
    metroLineId: f.metroLineId || null,
    heliPassenger:Boolean(f.heliPassenger),
    heliTourUntil:Number(f.heliTourUntil||0),
    wheelRideUntil:Number(f.wheelRideUntil||0),wheelSeat:f.wheelSeat??null,
    illness: f.illness || null,
    socialClass: f.socialClass || "working",
    householdId: f.householdId || null,
    housingType: f.housingType || null,
    housingUnitId: f.housingUnitId || null,
    businessId: f.businessId || null,
    businessEmployeeOf: f.businessEmployeeOf || null,
    businessEquity: Number(f.businessEquity || 0),
    creditScore: Number(f.creditScore || 0),
    bankLoan: Number(f.bankLoan || 0),
    businessFailures: Number(f.businessFailures || 0),
    businessSuccesses: Number(f.businessSuccesses || 0),
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
    lawAwareness: Number(f.lawAwareness||0),
    lawViolations: Number(f.lawViolations||0),
    wanted: Number(f.wantedUntil||0)>state.simulationAgeSeconds,
    arrested: Number(f.arrestedUntil||0)>state.simulationAgeSeconds,
    professionSkills: f.professionSkills||{},
    intelligence: Number((f.intelligence||0).toFixed(3)),
    learningRate: Number((f.learningRate||0).toFixed(3)),
    educationLevel: Number((f.educationLevel||0).toFixed(2)),
    knowledge: f.knowledge||{},
    teacherId: f.teacherId||null,
    schoolDays: Number(f.schoolDays||0),
    chronotype: f.chronotype||"day",
    preferredWorkStart: Number(f.preferredWorkStart||0),
    preferredWorkHours: Number(f.preferredWorkHours||0),
    workMinutesToday:Number(f.workMinutesToday||0),
    partyId:f.partyId||null,
    ideology:f.ideology||null,
    politicalInterest:Number(f.politicalInterest||0),
  };
}

function getState() {
  const living = state.flies.filter((f) => f.alive);
  const moneySupply = liquidMoneySupply();
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
    mortality: mortalityReport(),
    welfare: {...ensureWelfare(),birthGrants:undefined,birthGrantPerChild:1000,essentialMealPrice:0.1,freeWater:true,freeStressRelief:true},
    foodReserve: state.foodReserve,
    moneySupply,
    currency: state.currency,
    totalTransactions: state.totalTransactions,
    economy: {
      ...(state.economy || {}),
      bankReserves: Number(state.bank?.reserves || 0),
      loansOutstanding: Number(state.bank?.loansOutstanding || 0),
      defaults: Number(state.bank?.defaults || 0),
      operatingBusinesses: Object.values(state.enterprises || {}).filter((b) => b.status === "operating").length,
      employed: Number(state.economy?.employed||0),
    },
    education:{
      teacherId:state.education?.teacherId||null,
      teacherGeneration:Number(state.education?.teacherGeneration||0),
      lessons:Number(state.education?.lessons||0),
      students:living.filter((f)=>f.ageYears>=5&&f.ageYears<18).length,
    },
    centralBank:{
      inflationTarget:Number(state.centralBank?.inflationTarget||2),
      inflationRate:Number(state.centralBank?.inflationRate||0),
      priceLevel:Number(state.centralBank?.priceLevel||1),
      lastPrintAmount:Number(state.centralBank?.lastPrintAmount||0),
      moneyPrintedLifetime:Number(state.centralBank?.moneyPrintedLifetime||0),
      boardIds:state.centralBank?.boardIds||[],
      lastDecision:state.centralBank?.lastDecision||null,
    },
    treasury:state.treasury,
    politics:state.politics,
    utilities:{powerPlant:state.utilities?.powerPlant||null,disconnectedHouseholds:Number(state.utilities?.disconnectedHouseholds||0),householdAccounts:Object.keys(state.utilities?.householdAccounts||{}).length},
    justice:state.justice,
    mapVersion:MAP_VERSION,
    transit:{...(state.transit||{boardings:0,completedTrips:0}),passengers:living.filter(f=>f.onTrain).length,waiting:living.filter(f=>f.action?.startsWith("waiting at M")).length},
    parkLeisure:{...(state.parkLeisure||{boardings:0,completedRides:0}),passengers:living.filter(f=>f.wheelRideUntil>state.simulationAgeSeconds).length,ticket:0},
    activity:{working:living.filter(f=>!f.traveling&&f.action?.startsWith("working")).length,sleeping:living.filter(f=>f.sleeping).length,indoors:living.filter(f=>f.indoors).length,traveling:living.filter(f=>f.traveling).length},
    housing: {
      apartmentBlocks: state.housing?.apartmentBlocks?.map((b) => ({
        id: b.id,
        x: b.x,
        z: b.z,
        capacity: b.capacity,
        occupants: (b.occupants || []).length,
        rent: b.rent,
        purchaseValue: b.purchaseValue,
      })) || [],
      occupiedGroundHouses: state.housing?.houseLots?.filter((x) => x.ownerHouseholdId).length || 0,
      totalGroundHouseLots: state.housing?.houseLots?.length || 0,
    },
    weather: {
      ...(state.weather || {}),
      danger: weatherDanger(),
      label: weatherLabel(),
      sunset: state.weather?.sunset || { active: false, quality: 0 },
    },
    neuralBridge: state.neuralBridge || { connected: false },
    daysPerYear: DAYS_PER_YEAR,
    locations: LOCATIONS,
    flies: living.map(compactFly),
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
      ensureAcademyTeacher();
      ensureHeliTourStaff();
      if(!state.flies.some(f=>f.alive&&f.jobId==="rooftop")){
       const host=state.flies.find(f=>f.alive&&f.ageYears>=21&&f.ageYears<65&&!f.jobId&&!f.businessEmployeeOf);
       if(host){host.jobId="rooftop";host.jobTitle="sky bar host";host.wage=5.3;host.preferredWorkStart=17;host.preferredWorkHours=8;}
      }
      for(const fly of state.flies)tickFly(fly,clock);
      simulateEnterprises(clock);
      simulatePowerGrid(clock);
      updateMonetaryPolicy(clock);
      simulatePoliticalLife(clock);
      if(clock.minute<2)maintainHouseholds();
      void syncFullConnectomeBrains();

      // periodic city-wide events
      if (clock.hour === 6 && clock.minute < 2 && rand() < 0.12) {
        emit("weather", "A new simulated day begins across Hansdrex City of Fruit Fly.", { day: clock.day });
      }

      if(state.foodReserve<2000)restockEssentials();
      // Archived deaths must never disable the emergency population floor.
      if(state.flies.filter(f=>f.alive).length<8)replenishResidents(24,"emergency immigration");
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

  if(url.pathname === "/api/civilization/mortality"){
    // Read the append-only event archive, which survives checkpoint replacement.
    const since=url.searchParams.get("since")||new Date(Date.now()-7*86400000).toISOString();
    if(!Number.isFinite(Date.parse(since))){json(res,400,{error:"invalid_since"});return;}
    try{
      const result=await pool.query(`
        SELECT COALESCE(NULLIF(payload->>'cause',''),
          CASE event_type WHEN 'homicide' THEN 'homicide' WHEN 'execution' THEN 'capital punishment' ELSE 'unrecorded' END) AS cause,
          COUNT(*)::int AS count, MIN(created_at) AS first_at, MAX(created_at) AS last_at
        FROM civilization_events
        WHERE world_id=$1 AND created_at >= $2::timestamptz
          AND (event_type IN ('death','weather_death','homicide','execution')
               OR (event_type='accident' AND message LIKE '% died %'))
        GROUP BY cause ORDER BY count DESC`,[WORLD_ID,new Date(since).toISOString()]);
      json(res,200,{worldId:WORLD_ID,since,source:"append-only event archive",causes:result.rows,
        note:"Event counts may include former competing WORLD-A workers; these are not necessarily the deaths in the current checkpoint."});
    }catch(error){console.error("[civilization] mortality archive unavailable",error);json(res,503,{error:"mortality_archive_unavailable"});}
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

if(IS_MAIN){
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

}
// Side-effect-free test entry points; importing never starts a server or touches persistence.
export {simulateParkWheel,applyWelfareRecovery,replenishResidents,payBirthGrant,completePregnancy,mortalityReport,simulateHeliTour,spend,related,maintainHouseholds,startJourney,needsAndActivities,payAndFinance,professionalService,reproduction,socialLife,recordInfidelity,revealInfidelity,endRelationship,freshState,getState,tickFly,gameClock,chooseDestination,moveFly,assignApartment,assignGroundHouse,inheritHousehold,liquidMoneySupply,migrateGroundHousesToSafeLots,migrateResidentNavigation};
