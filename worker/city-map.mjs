import {createVehicleRouter} from './vehicle-network.mjs';
// Shared authoritative geometry. The observer and simulation import this same map.
export const MAP_VERSION = 20;
export const WORLD_HALF = 1150;
export const AIRPORT = {
 terminal:{x:-180,z:-390,w:60,d:20}, gate:{x:-180,z:-378},
 runway:{x:-180,z:-520,w:320,d:22}, apron:{x:-180,z:-443,w:140,d:65},
 helipad:{x:-85,z:-436,y:1}, heliAccess:{x:-85,z:-373},
};
export const ISLAND = {
 x:160,z:790,rx:205,rz:135,
 runway:{x:145,z:742,w:240,d:16}, terminal:{x:65,z:785,w:30,d:16},
 gate:{x:65,z:795}, resort:{x:185,z:820,w:44,d:24}, beach:{x:255,z:834},
};
export const MANSION={x:110,z:864,w:80,d:48,h:10.5};
export const SEA={x:0,z:900,w:2300,d:860};
export function onIsland(p,margin=0){return ((p.x-ISLAND.x)/(ISLAND.rx-margin))**2+((p.z-ISLAND.z)/(ISLAND.rz-margin))**2<1;}
export function atSea(p){return p.z>470&&!onIsland(p);}
export const PARK = { x:15, z:-170, w:150, d:260 };
export const PARK_PONDS = [
 {id:"reservoir",x:15,z:-112,w:58,d:88},
 {id:"north-lake",x:8,z:-255,w:42,d:30},
];
export const PARK_PATHS = [
 {x:15,z:-290,w:132,d:3},
 {x:15,z:-50,w:132,d:3},
 {x:-48,z:-170,w:3,d:236},
 {x:78,z:-170,w:3,d:236},
 {x:-28,z:-170,w:3,d:214},
 {x:56,z:-170,w:3,d:214},
 {x:15,z:-188,w:126,d:3},
];
export const FERRIS_WHEEL={x:18,z:-218,y:33,radius:30,seats:20,period:7200};
export function wheelCabin(seconds,seat){const a=seconds/FERRIS_WHEEL.period*Math.PI*2+seat/FERRIS_WHEEL.seats*Math.PI*2;return {x:FERRIS_WHEEL.x+Math.cos(a)*FERRIS_WHEEL.radius,y:FERRIS_WHEEL.y+Math.sin(a)*FERRIS_WHEEL.radius,z:FERRIS_WHEEL.z};}
export const RIVER={id:"hansdrex-river",x:430,z:0,w:96,d:WORLD_HALF*2+4};
// Administrative footprint: 360×480 is exactly one third of the 720×720 original urban core.
export const RIVERSIDE={id:'riverside',name:'Hansdrex Riverside',x:680,z:0,w:360,d:480};
export const SPORTS_VENUES=[
 {id:'stadium',name:'Hansdrex Riverside Stadium',x:770,z:200,w:44,d:62},
 {id:'tennis',name:'Riverside Tennis Club',x:830,z:120,w:42,d:56},
 {id:'riverside-park',name:'Riverside Gardens',x:530,z:120,w:42,d:58},
];
export const HARBOR={id:"hansdrex-harbor",x:120,z:420,w:560,d:90};
export const WATER = [...PARK_PONDS,RIVER,HARBOR];
export const AVENUES = [-310,-260,-210,-154,-102,-92,-50,-24,2,28,54,80,122,159,210,260,310];
export const STREETS = [-340,-300,-260,-220,-180,-145,-116,-87,-58,-29,0,29,58,87,116,145,180,220,260,300,340];
export const contains = (r,p,m=0) => Math.abs(r.x-p.x)<r.w/2+m && Math.abs(r.z-p.z)<r.d/2+m;
export const overlaps = (a,b,m=0) => Math.abs(a.x-b.x)<(a.w+b.w)/2+m && Math.abs(a.z-b.z)<(a.d+b.d)/2+m;
export const ROADS = [];
function road(x,z,w,d) { ROADS.push({x,z,w,d}); }
const GRID_HALF=360;
// Manhattan-style avenues and cross streets wrap the full Central Park superblock.
for(const x of AVENUES) {
 if(Math.abs(x-PARK.x)<PARK.w/2+6){
  const north=PARK.z-PARK.d/2-6,south=PARK.z+PARK.d/2+6;
  road(x,(-GRID_HALF+north)/2,9.5,north+GRID_HALF);
  road(x,(south+GRID_HALF)/2,9.5,GRID_HALF-south);
 }else road(x,0,9.5,GRID_HALF*2);
}
for(const z of STREETS){
 if(Math.abs(z-PARK.z)<PARK.d/2+6){
  const west=PARK.x-PARK.w/2-6,east=PARK.x+PARK.w/2+6;
  road((-GRID_HALF+west)/2,z,west+GRID_HALF,9);
  road((east+GRID_HALF)/2,z,GRID_HALF-east,9);
 }else road(0,z,GRID_HALF*2,9);
}
// Outer ring and bridge approaches keep the expanded city connected.
for(const x of [-430,372])road(x,0,8,820);
for(const z of [-400,400])road(-30,z,800,10);
for(const x of [500,560,620,680,740,800,860])road(x,0,9.5,480);
for(const z of [-240,-160,-80,0,80,160,240])road(Math.abs(z)===160?710:680,z,Math.abs(z)===160?300:360,9);
for(const z of [-180,0,180])road(430,z,160,10);
// The bridge axis continues straight across the east bank, with no park in its approach.
for(const z of [-180,180])road(685,z,350,6);
export const BRIDGES=[-180,0,180].map(z=>({x:430,z,w:160,d:16,landmark:z===0}));
export const UNDERPASSES=BRIDGES.flatMap(b=>[372,500].map(x=>({id:`UNDERPASS-${x}-${b.z}`,x,z:b.z,axis:'z',w:x===372?8:9.5,halfLength:42,coveredHalf:10,depth:6.2})));
export function underpassAt(p){return UNDERPASSES.find(t=>Math.abs(p.x-t.x)<=t.w/2+.2&&Math.abs(p.z-t.z)<t.halfLength);}
export function roadTravelY(p,axis='z'){
 if(axis!=='z')return 1.1;const t=underpassAt(p);if(!t)return 1.1;
 const distance=Math.abs(p.z-t.z),fraction=distance<=t.coveredHalf?1:(t.halfLength-distance)/(t.halfLength-t.coveredHalf);
 return 1.1-t.depth*Math.max(0,Math.min(1,fraction));
}
export function isGradeSeparated(p){return UNDERPASSES.some(t=>Math.abs(p.x-t.x)<.5&&Math.abs(p.z-t.z)<=t.coveredHalf);}


export const LOCATIONS = [
 {id:'firestation',type:'fire-service',name:'Riverside Fire and Rescue',x:830,z:-200},
 {id:'riverside-homes',type:'home',name:'Riverside Residences',x:650,z:120},
 {id:'riverside-market',type:'food',name:'Riverside Market',x:590,z:40},
 {id:'riverside-cafe',type:'food',name:'Riverbank Cafe',x:590,z:-40},
 {id:'riverside-hotel',type:'service',name:'Riverside Grand Hotel',x:530,z:-40},
 {id:'riverside-office',type:'job',name:'Riverside Exchange Tower',x:530,z:40},
 {id:'riverside-clinic',type:'health',name:'Riverside Clinic',x:710,z:40},
 {id:'riverside-school',type:'service',name:'Riverside Community Academy',x:710,z:-40},
 ...SPORTS_VENUES.map(v=>({id:v.id,type:'social',name:v.name,x:v.x,z:v.z})),
 {id:'bridge-view',type:'social',name:'Harbour Arch Promenade',x:488,z:-25},
  { id: "apt-north", type: "home", name: "Hansdrex North Garden Homes", x: 15, z: -330 },
  { id: "apt-east", type: "home", name: "Hansdrex East River Homes", x: 245, z: 12 },
  { id: "apt-south", type: "home", name: "Hansdrex South Meadow Homes", x: 12, z: 190 },
  { id: "apt-west", type: "home", name: "Hansdrex West Orchard Homes", x: -245, z: 8 },

  { id: "market", type: "food", name: "Hansdrex Central Market", x: -37, z: 14.5 },
  { id: "cafe", type: "social", name: "Hansdrex Coffee", x: 15, z: -14.5 },
  { id: "tea-house", type: "social", name: "Hansdrex Tea House", x: -37, z: -14.5 },
  { id: "restaurant", type: "food", name: "Hansdrex Kitchen", x: 41, z: -14.5 },
  { id: "park", type: "social", name: "Hansdrex Central Park", x: 15, z: -48 },
  { id: "ferris-wheel", type: "social", name: "Central Park Great Wheel · FREE", x: 18, z: -188 },
  { id: "office", type: "job", name: "Hansdrex Commerce Tower", x: 67, z: 14.5 },
  { id: "bank", type: "service", name: "Hansdrex Bank", x: -63, z: 14.5 },
  { id: "hotel", type: "service", name: "Hansdrex Grand Hotel", x: 67, z: 43.5 },
  { id: "cinema", type: "social", name: "Hansdrex Cinema", x: -63, z: 43.5 },
  { id: "library", type: "service", name: "Hansdrex Library", x: 15, z: 72.5 },

  { id: "hospital-central", type: "health", name: "Hansdrex Central Hospital", x: -89, z: 72.5 },
  { id: "hospital-east", type: "health", name: "Hansdrex East Hospital", x: 236, z: 116 },
  { id: "clinic", type: "health", name: "Hansdrex Community Clinic", x: -63, z: 101.5 },
  { id: "pharmacy", type: "health", name: "Hansdrex Pharmacy", x: -89, z: 14.5 },
  { id: "school", type: "service", name: "Hansdrex Academy", x: -11, z: 101.5 },
  { id: "post-office", type: "service", name: "Hansdrex Post", x: -89, z: -14.5 },
  { id: "lab", type: "job", name: "Hansdrex Research Lab", x: 93, z: 72.5 },
  { id: "garage", type: "service", name: "Hansdrex Garage", x: 140, z: -130.5 },
  { id: "vehicle-showroom", type: "shop", name: "Hansdrex Motors Showroom", x: -130, z: -74 },
  { id: "police", type: "law", name: "Hansdrex Police Department", x: -130, z: -25 },
  { id: "gym", type: "wellness", name: "Hansdrex Fitness", x: 93, z: 14.5 },

  { id: "bakery", type: "food", name: "Hansdrex Bakery", x: 41, z: 72.5 },
  { id: "grocery", type: "food", name: "Hansdrex Grocery", x: -89, z: -43.5 },
  { id: "corner-shop", type: "shop", name: "Hansdrex Store", x: 140, z: -72.5 },
  { id: "night-market", type: "nightlife", name: "Hansdrex Night Market", x: 140, z: -101.5 },
  { id: "arcade", type: "nightlife", name: "Hansdrex Arcade", x: -89, z: -72.5 },
  { id: "music-hall", type: "nightlife", name: "Hansdrex Music Hall", x: 67, z: 72.5 },
  { id: "nightclub", type: "nightlife", name: "Hansdrex Afterdark", x: 93, z: -14.5 },
  { id: "rooftop", type: "nightlife", name: "Hansdrex Sky Lounge", x: 15, z: 43.5 },
  { id: "heliport", type: "luxury", name: "Hansdrex Airport · Heli Tours", ...AIRPORT.heliAccess },
  { id: "airport", type: "transit", name: "Hansdrex City Airport · HCA", x:AIRPORT.terminal.x,z:AIRPORT.terminal.z },
  { id: "island-airport", type: "transit", name: "Hansdrex Island Airport · HIA", x:ISLAND.terminal.x,z:ISLAND.terminal.z },
  { id: "island-resort", type: "resort", name: "Hansdrex Island Resort", x:ISLAND.resort.x,z:ISLAND.resort.z },
  { id: "island-beach", type: "social", name: "Hansdrex Island · Palm Beach", ...ISLAND.beach },

  { id: "factory", type: "job", name: "Hansdrex Sugar Works", x: -285, z: 75 },
  { id: "factory-east", type: "job", name: "Hansdrex Materials Plant", x: 285, z: 125 },
  { id: "factory-south", type: "job", name: "Hansdrex Packaging", x: 285, z: -75 },
  { id: "warehouse", type: "job", name: "Hansdrex Warehouse", x: -285, z: -125 },
  { id: "farm", type: "production", name: "Hansdrex Farm", x: -285, z: 125 },
  { id: "construction", type: "job", name: "Hansdrex Build Yard", x: 285, z: 25 },
  { id: "transit", type: "job", name: "Hansdrex Transit Depot", x: 285, z: -125 },
  { id: "power", type: "infrastructure", name: "Hansdrex Power Plant", x: -285, z: -75 },
  { id: "recycling", type: "job", name: "Hansdrex Recycling", x: 340, z: 125 },

  { id: "metro-central", type: "transit", name: "Hansdrex Central Station", x: 2, z: 0 },
  { id: "metro-north", type: "transit", name: "Hansdrex North Station", x: 2, z: -340 },
  { id: "metro-east", type: "transit", name: "Hansdrex East Station", x: 310, z: 0 },
  { id: "metro-south", type: "transit", name: "Hansdrex South Station", x: 2, z: 300 },
  { id: "metro-west", type: "transit", name: "Hansdrex West Station", x: -310, z: 0 },
  { id: "metro-industrial", type: "transit", name: "Hansdrex Industrial Station", x: -210, z: 87 },
];

export const METRO_LINES = [
 {id:"M1",height:9,points:[[-310,0],[-210,0],[-102,0],[2,0],[122,0],[210,0],[310,0],[500,0],[620,0],[740,0],[860,0]]},
 {id:"M2",height:11,points:[[-102,-340],[-102,-220],[-102,-116],[-102,0],[-102,87],[-102,145],[-102,260],[-102,340]]},
 {id:"M3",height:13,points:[[-310,87],[-210,87],[-102,87],[2,87],[122,87],[210,87],[310,87]]},
 {id:"M4",height:15,points:[[122,-340],[122,-220],[122,-116],[122,0],[122,87],[122,145],[122,260],[122,340]]},
 {id:"M5",height:17,points:[[-210,-340],[-102,-340],[2,-340],[122,-340],[210,-340]]},
 {id:"M6",height:19,points:[[310,-340],[310,-220],[310,0],[310,87],[310,180],[310,340]]},
 {id:"M7",height:23,points:[[122,-340],[210,-340],[310,-340],[310,-180],[500,-180],[620,-180],[620,0],[740,0],[740,160],[860,160]]}
];

export const BUILDINGS=[];
function place(b) {
 if(SPORTS_VENUES.some(r=>overlaps(b,r,2)) || ROADS.some(r=>overlaps(b,r,2.6)) || WATER.some(r=>overlaps(b,r,1)) || overlaps(b,PARK,1) || BUILDINGS.some(r=>overlaps(b,r,1))) return false;
 BUILDINGS.push(b);return true;
}
place({id:'airport',...AIRPORT.terminal,h:10,kind:'airport'});
place({id:'island-airport',...ISLAND.terminal,h:6,kind:'airport'});
place({id:'island-resort',...ISLAND.resort,h:13,kind:'resort'});
place({id:'hansdrex-mansion',...MANSION,kind:'mansion'});
for(const loc of LOCATIONS) {
 if(['airport','island-airport','island-resort'].includes(loc.id))continue;
 if(['home','transit','social'].includes(loc.type)&&!['cafe','tea-house','cinema'].includes(loc.id))continue;
 if(['park','rooftop','heliport','farm'].includes(loc.id))continue;
 const outer=Math.abs(loc.x)>180;
 const w=outer?24:Math.abs(loc.x)>=125?18:10;
 const d=outer?20:14;
 place({...loc,w:loc.id==='firestation'?34:w,d:loc.id==='firestation'?24:d,h:loc.id==='firestation'?11:loc.id==='riverside-office'?96:loc.id==='riverside-hotel'?72:loc.type==='job'?36:loc.type==='health'?24:loc.type==='nightlife'?20:12,kind:'destination'});
}
// Existing signature skyline is preserved, then expanded with two new world landmarks.
for(const [id,x,z,w,d,h] of [
 ['toronto',-11,43.5,11,12,250],
 ['empire',15,43.5,11,12,196],
 ['petronas',41,43.5,11,12,115],
 ['burj-khalifa',236,72.5,14,14,190],
 ['marina-bay',340,320,44,18,88],
]) place({id,x,z,w,d,h,kind:'landmark'});

LOCATIONS.push({id:'marina-bay',name:'Marina Bay Sands Hotel',type:'hotel',x:340,z:320});
export const APARTMENTS=[];
function addApartment(x,z,h=38,w=11,d=16){
 const b={id:`APT-${APARTMENTS.length+1}`,x,z,w,d,h,kind:'apartment',capacity:10,rent:24,purchaseValue:5040};
 if(place(b))APARTMENTS.push(b);
}
// High-rise residential wall hugs Central Park, like Manhattan's park-edge skyline.
// Use mid-block Z positions rather than street-center coordinates. The previous list sat directly
// on cross streets, so place() rejected almost every tower and left only two apartment blocks.
const PARK_EDGE_RESIDENTIAL_Z=[-280,-240,-200,-162.5,-130.5,-101.5,-72.5];
for(const z of PARK_EDGE_RESIDENTIAL_Z){
 addApartment(-76,z,72+((Math.abs(Math.round(z))/20)%5)*8,13,12);
 addApartment(106,z,78+((Math.abs(Math.round(z))/20)%5)*9,13,12);
}
for(const x of [-63,-37,-11,15,41,67])addApartment(x,-320,82+((x+70)%5)*8,13,18);
for(const x of [-63,-37,-11,15,41,67])addApartment(x,-20,68+((x+70)%5)*7,12,16);

// Dense downtown fabric: fill buildable street blocks, tallest directly around the park,
// then taper through mid-rise / low-rise districts toward detached-house neighborhoods.
const URBAN_X=[-310,-260,-210,-154,-102,-92,-50,-24,2,28,54,80,122,159,210,260,310];
const URBAN_Z=[-340,-300,-260,-220,-180,-145,-116,-87,-58,-29,0,29,58,87,116,145,180,220,260,300,340];
function distanceFromPark(x,z){
 const dx=Math.max(Math.abs(x-PARK.x)-PARK.w/2,0);
 const dz=Math.max(Math.abs(z-PARK.z)-PARK.d/2,0);
 return Math.hypot(dx,dz);
}
function skylineHeight(x,z,seed=0){
 const d=distanceFromPark(x,z);
 const jitter=((Math.abs(Math.round(x*13+z*7+seed*17))%17)-8);
 if(d<34)return 92+jitter*2.2;
 if(d<80)return 68+jitter*1.7;
 if(d<145)return 43+jitter*1.2;
 if(d<220)return 24+jitter*.8;
 return 10+Math.max(0,jitter*.45);
}
for(let xi=0;xi<URBAN_X.length-1;xi++)for(let zi=0;zi<URBAN_Z.length-1;zi++){
 const x0=URBAN_X[xi],x1=URBAN_X[xi+1],z0=URBAN_Z[zi],z1=URBAN_Z[zi+1];
 const cellW=x1-x0,cellD=z1-z0,cx=(x0+x1)/2,cz=(z0+z1)/2;
 if(distanceFromPark(cx,cz)>285)continue;
 const inset=8.0,buildW=cellW-inset*2,buildD=cellD-inset*2;
 if(buildW<7||buildD<7)continue;
 // Large blocks get four towers/buildings, medium blocks two, narrow blocks one.
 const cols=buildW>30?2:1,rows=buildD>30?2:1;
 const lotW=(buildW-(cols-1)*4)/cols,lotD=(buildD-(rows-1)*4)/rows;
 for(let a=0;a<cols;a++)for(let b=0;b<rows;b++){
  const x=x0+inset+lotW/2+a*(lotW+4),z=z0+inset+lotD/2+b*(lotD+4);
  const h=skylineHeight(x,z,a*3+b+xi*11+zi*5);
  place({id:`DOWNTOWN-${xi}-${zi}-${a}-${b}`,x,z,w:Math.max(6,lotW),d:Math.max(6,lotD),h,kind:'block'});
 }
}

// Additional apartment clusters bridge the high-rise core into the mid-rise neighborhoods.
for(const x of [-260,-210,210,260])for(const z of [-300,-240,180,240,300])addApartment(x,z,28+Math.max(0,62-distanceFromPark(x,z)*.16),12,16);

// Reuse existing downtown footprints as residential towers for 500 residents and new families.
for(const b of BUILDINGS.filter(b=>b.kind==='block'&&b.h>50).slice(0,44)){
 b.id=`APT-${APARTMENTS.length+1}`;b.kind='apartment';b.capacity=10;b.rent=24;b.purchaseValue=5040;
 APARTMENTS.push(b);
}

// Detached ground-house lots form the outer residential ring after the skyline has tapered down.
export const HOUSE_LOTS=[];
const outerHouseXs=[-350,-330,-310,-290,290,310,330,350];
const outerHouseZs=[-320,-280,-240,-200,-160,-120,-80,-40,0,40,80,120,160,200,240,280,320];
for(const x of outerHouseXs)for(const z of outerHouseZs){
 const b={id:`HOUSE-${HOUSE_LOTS.length+1}`,x,z,w:9,d:9,h:6,kind:'house',baseValue:8200+HOUSE_LOTS.length*32};
 if(place(b))HOUSE_LOTS.push(b);
}
for(const z of [-350,-330,330,350])for(const x of [-260,-220,-180,-140,-100,-60,-20,20,60,100,140,180,220,260]){
 const b={id:`HOUSE-${HOUSE_LOTS.length+1}`,x,z,w:9,d:9,h:6,kind:'house',baseValue:8200+HOUSE_LOTS.length*32};
 if(place(b))HOUSE_LOTS.push(b);
}

// A compact mixed skyline rather than another full downtown. Append IDs to preserve old titles.
for(const [x,z,h]of [[650,-200,84],[590,-120,62],[650,40,78],[710,120,58],[770,40,48],[830,-120,54]])addApartment(x,z,h,24,28);
for(const x of [530,590,650,710,770,830])for(const z of [-200,-120,-40,40,120,200]){
 const seed=Math.abs(x*7+z*13),height=19+(seed%4)*3,depth=Math.abs(z)===200?28:42;
 const b={id:`RIVERSIDE-${x}-${z}`,x,z,w:42,d:depth,h:height,kind:'block'};
 if(place(b)&&[590,710].includes(x)&&Math.abs(z)===200){b.kind='apartment';b.capacity=30;b.rent=24;b.purchaseValue=5040;APARTMENTS.push(b);}
}

export function entrance(p) {
 const b=BUILDINGS.find(b=>contains(b,p,0.2));
 if(b)return {x:b.x,z:b.z+b.d/2+1.2};
 return {x:p.x,z:p.z};
}
// Static geometry indices are rebuilt with this map module/version, shared by all route queries.
const SPATIAL_CELL=24;
function indexRectangles(rects,margin=0){
 const bins=new Map();
 for(const r of rects)for(let x=Math.floor((r.x-r.w/2-margin)/SPATIAL_CELL);x<=Math.floor((r.x+r.w/2+margin)/SPATIAL_CELL);x++)for(let z=Math.floor((r.z-r.d/2-margin)/SPATIAL_CELL);z<=Math.floor((r.z+r.d/2+margin)/SPATIAL_CELL);z++){
  const key=`${x},${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(r);
 }
 return bins;
}
const emptyGeometry=[];
const nearbyGeometry=(bins,p)=>bins.get(`${Math.floor(p.x/SPATIAL_CELL)},${Math.floor(p.z/SPATIAL_CELL)}`)||emptyGeometry;
let buildingBins=indexRectangles(BUILDINGS,.45);
let roadBins=indexRectangles(ROADS);
const BASE_ROADS=ROADS.map(r=>({...r}));
export let URBAN_ROADS=[];
const BASE_URBAN_BUILDINGS=BUILDINGS.map(b=>({...b}));
let urbanGeometryKey='',urbanNavigationKey='';
export let urbanGeometryRevision=0;
export let URBAN_FLOODS=[];
export function effectiveBuildingHeight(b){
 if(b.urbanStage==='cleared')return 0;
 if(b.urbanStage==='collapsed')return 2.2;
 if(b.urbanStage==='construction')return Math.max(.3,b.h*Math.max(.02,Number(b.urbanProgress||0)));
 return b.h;
}
/** Apply durable world changes on both server and viewer; invalidate navigation only on geometry changes. */
export function applyUrbanGeometry({buildings=[],floods=[],roads=[]}={}){
 const key=JSON.stringify([buildings.map(b=>[b.id,b.x,b.z,b.w,b.d,b.h,b.stage,Math.floor(Number(b.progress||0)*10)]),floods.map(f=>[f.id,f.x,f.z,f.w,f.d,Math.round(Number(f.depth||0)*10)]),roads.map(r=>[r.id,r.x,r.z,r.w,r.d,r.stage])]);
 if(key===urbanGeometryKey)return false;
 urbanGeometryKey=key;urbanGeometryRevision++;
 URBAN_ROADS=roads.filter(r=>r.stage==='operational'&&[r.x,r.z,r.w,r.d].every(Number.isFinite)&&r.w>0&&r.d>0).map(r=>({...r}));
 ROADS.splice(0,ROADS.length,...BASE_ROADS,...URBAN_ROADS);roadBins=indexRectangles(ROADS);
 rebuildWalkways();
 const existing=new Map(BUILDINGS.map(b=>[b.id,b]));
 BUILDINGS.length=0;
 for(const base of BASE_URBAN_BUILDINGS){const target=existing.get(base.id)||{};for(const k of Object.keys(target))delete target[k];Object.assign(target,base);BUILDINGS.push(target);}
 for(const record of buildings){
  let b=BUILDINGS.find(v=>v.id===record.id);
  if(!b){
   if(!record.id?.startsWith('CIVIC-')||![record.x,record.z,record.w,record.d,record.h].every(Number.isFinite)||record.w<=0||record.d<=0||record.h<=0||record.h>160)continue;
   b={id:record.id,x:record.x,z:record.z,w:record.w,d:record.d,h:record.h,kind:'civic'};BUILDINGS.push(b);
  }
  if(Number.isFinite(record.h)&&record.h>0&&record.h<=160)b.h=record.h;
  b.urbanStage=record.stage;b.urbanProgress=record.progress||0;
 }
 URBAN_FLOODS=floods.filter(f=>[f.x,f.z,f.w,f.d,f.depth].every(Number.isFinite)&&f.depth>.35).slice(0,4).map(f=>({...f}));
 buildingBins=indexRectangles(BUILDINGS.filter(b=>effectiveBuildingHeight(b)>0),.45);
 rebuildParkingSpaces();
 const navKey=JSON.stringify([buildings.map(b=>[b.id,b.x,b.z,b.w,b.d,b.stage==='cleared']),URBAN_FLOODS.map(f=>[f.id,f.x,f.z,f.w,f.d]),URBAN_ROADS.map(r=>[r.id,r.x,r.z,r.w,r.d])]);
 if(navKey!==urbanNavigationKey){urbanNavigationKey=navKey;costCache.clear();segmentCache.clear();routeCache.clear();}
 return true;
}
export function blocked(p) {
 if(Math.abs(p.x)>WORLD_HALF-4||Math.abs(p.z)>WORLD_HALF-4)return true;
 if(atSea(p))return true;
 if(URBAN_FLOODS.some(f=>contains(f,p))&&!BRIDGES.some(b=>contains(b,p)))return true;
 if(WATER.some(w=>contains(w,p,.25))&&!BRIDGES.some(b=>contains(b,p)))return true;
 return nearbyGeometry(buildingBins,p).some(b=>effectiveBuildingHeight(b)>0&&contains(b,p,.45));
}
export function clearSegment(a,b) {
 const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.6));
 for(let i=0;i<=n;i++)if(blocked({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n}))return false;
 return true;
}
// Only for an encoded station deck/stair route. Ground navigation remains 2D;
// an upper concourse can pass over a low roof without passing through a building.
export function clearMetroAccessSegment(a,b) {
 const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z,(b.y??1.1)-(a.y??1.1))/.6));
 for(let i=0;i<=n;i++){
  const t=i/n,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:(a.y??1.1)+((b.y??1.1)-(a.y??1.1))*t};
  if(p.y<=2){if(blocked(p))return false;continue;}
  if(Math.abs(p.x)>WORLD_HALF-4||Math.abs(p.z)>WORLD_HALF-4)return false;
  if(nearbyGeometry(buildingBins,p).some(building=>effectiveBuildingHeight(building)>p.y-1.25&&contains(building,p,.45)))return false;
 }
 return true;
}
// A graph of actual sidewalks, park paths and bridge walks, never imaginary infinite streets.
const walks=[];
export const WALKWAYS=walks;
let walkBins=new Map();
function rebuildWalkways(){
 walks.length=0;
 for(const r of ROADS){
  if(r.w>r.d)for(const side of [-1,1])walks.push({a:{x:r.x-r.w/2,z:r.z+side*(r.d/2+1.4)},b:{x:r.x+r.w/2,z:r.z+side*(r.d/2+1.4)}});
  else for(const side of [-1,1]){const offset=r.x===372?8:r.x===500?10.5:r.w/2+1.4;walks.push({a:{x:r.x+side*offset,z:r.z-r.d/2},b:{x:r.x+side*offset,z:r.z+r.d/2}});}
 }
 for(const bridge of BRIDGES)for(const side of [-1,1])walks.push({a:{x:bridge.x-bridge.w/2,z:bridge.z+side*6},b:{x:bridge.x+bridge.w/2,z:bridge.z+side*6}});
 for(const r of PARK_PATHS)walks.push(r.w>r.d?{a:{x:r.x-r.w/2,z:r.z},b:{x:r.x+r.w/2,z:r.z}}:{a:{x:r.x,z:r.z-r.d/2},b:{x:r.x,z:r.z+r.d/2}});
 walkBins=indexRectangles(walks.map(w=>({x:(w.a.x+w.b.x)/2,z:(w.a.z+w.b.z)/2,w:Math.abs(w.a.x-w.b.x),d:Math.abs(w.a.z-w.b.z),a:w.a,b:w.b})),1.8);
}
rebuildWalkways();
// Small A* lattice: cached blocked cells, weighted sidewalks and exact segment validation.
const STEP=2;
const NAV_REGIONS=[
 {id:'city',minX:-440,maxX:380,minZ:-440,maxZ:410},
 {id:'riverside',minX:480,maxX:WORLD_HALF-20,minZ:-WORLD_HALF+20,maxZ:450},
].map(r=>({...r,nx:(r.maxX-r.minX)/STEP+1,nz:(r.maxZ-r.minZ)/STEP+1}));
const regionFor=p=>NAV_REGIONS[p.x>430?1:0];
const costCache=new Map();
const segmentCache=new Map();
function costs(mode="walk",region=NAV_REGIONS[0]) {
 const key=`${region.id}:${mode}`;
 if(costCache.has(key))return costCache.get(key);
 const walkCosts=new Float32Array(region.nx*region.nz);
 for(let iz=0;iz<region.nz;iz++)for(let ix=0;ix<region.nx;ix++) {
  const p={x:region.minX+ix*STEP,z:region.minZ+iz*STEP};
  if(blocked(p)||mode==="walk"&&openUnderpass(p))continue;
  // Walking is sidewalk-biased in the city, but Central Park is a genuine free-roam
  // pedestrian district. Grass/meadows are legal to cross; paths are only cheaper, not mandatory.
  let c=contains(PARK,p,0)?1.55:8;
  if(mode!=="walk"){walkCosts[iz*region.nx+ix]=nearbyGeometry(roadBins,p).some(r=>contains(r,p))?1:0;continue;}
  for(const w of nearbyGeometry(walkBins,p)) {
   const x=Math.max(Math.min(w.a.x,w.b.x),Math.min(Math.max(w.a.x,w.b.x),p.x));
   const z=Math.max(Math.min(w.a.z,w.b.z),Math.min(Math.max(w.a.z,w.b.z),p.z));
   if(Math.hypot(p.x-x,p.z-z)<1.8){c=contains(PARK,p,0)?0.72:1;break;}
  }
  if(c>1.6&&nearbyGeometry(roadBins,p).some(r=>contains(r,p)))c=18;
  walkCosts[iz*region.nx+ix]=c;
 }
 costCache.set(key,walkCosts);return walkCosts;
}
class Heap {
 a=[];
 push(v){let i=this.a.length;this.a.push(v);while(i){const p=(i-1)>>1;if(this.a[p][0]<=v[0])break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}
 pop(){const top=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let j=i*2+1;if(j+1<this.a.length&&this.a[j+1][0]<this.a[j][0])j++;if(this.a[j][0]>=last[0])break;this.a[i]=this.a[j];i=j;}this.a[i]=last;}return top;}
}
const point = (i,region)=>({x:region.minX+(i%region.nx)*STEP,z:region.minZ+Math.floor(i/region.nx)*STEP});
function openUnderpass(p){return UNDERPASSES.some(t=>Math.abs(p.x-t.x)<t.w/2+2.75&&Math.abs(p.z-t.z)<t.halfLength)&&!BRIDGES.some(b=>contains(b,p));}
function walkingClearSegment(a,b){const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.6));for(let i=0;i<=steps;i++){const p={x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps};if(blocked(p)||openUnderpass(p))return false;}return true;}
function nearestCell(p,c,region) {
 const ix=Math.round((p.x-region.minX)/STEP),iz=Math.round((p.z-region.minZ)/STEP);
 for(let radius=0;radius<10;radius++) {
  let best=-1,d=Infinity;
  for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){
   const x=ix+dx,z=iz+dz;if(x<0||z<0||x>=region.nx||z>=region.nz)continue;
   const i=z*region.nx+x,q=point(i,region),dist=Math.hypot(p.x-q.x,p.z-q.z);
   if(c[i]&&dist<d&&walkingClearSegment(p,q)){best=i;d=dist;}
  }
  if(best>=0)return best;
 }
 return -1;
}
const routeCache=new Map();
const vehicleRouter=createVehicleRouter({roads:()=>ROADS,clearSegment,underpasses:()=>UNDERPASSES,roadTravelY});
export function pedestrianRoute(start,dest,mode="walk") {
 if(mode==='car'||mode==='scooter')return vehicleRouter.route(start,dest,mode);
 // The island is a separate pedestrian district. Never join it to the city lattice over water.
 if(onIsland(start)||onIsland(dest)){
  if(!onIsland(start)||!onIsland(dest)||mode!=="walk")return [];
  const a=entrance(start),b=entrance(dest),hub={x:155,z:838};
  const path=clearSegment(a,b)?[a,b]:[a,hub,b];
  if(path.some((p,i)=>i&&!clearSegment(path[i-1],p)))return [];
  return path.map(p=>({...p,mode:'walk',stage:'island-promenade'}));
 }
 const from=regionFor(start),to=regionFor(dest);
 // A route restarted on a bridge first reaches a bank before entering its local region lattice.
 if(start.x>380&&start.x<480){
  const bridge=BRIDGES.find(b=>contains(b,start));if(!bridge)return [];
  const side=Math.sign(start.z-bridge.z)||1,bank={x:to.id==='city'?350:510,z:bridge.z+side*6};
  const tail=pedestrianRoute(bank,dest,mode);return clearSegment(start,bank)&&tail.length?[{...start,mode,stage:'bridge'},...tail]:[];
 }
 if(from!==to){
  const bridge=BRIDGES.reduce((best,b)=>Math.abs(start.z-b.z)+Math.abs(dest.z-b.z)<Math.abs(start.z-best.z)+Math.abs(dest.z-best.z)?b:best,BRIDGES[1]);
  const side=Math.sign(start.z+dest.z-bridge.z*2)||1,walkOffset=mode==='walk'?side*6:0;
  const west={x:350,z:bridge.z+walkOffset},east={x:510,z:bridge.z+walkOffset},entry=from.id==='city'?west:east,exit=from.id==='city'?east:west;
  const a=localRoute(start,entry,mode,from),b=localRoute(exit,dest,mode,to);
  if(!a.length||!b.length||!clearSegment(entry,exit))return [];
  return [...a,{...exit,mode,stage:'bridge'},...b];
 }
 return localRoute(start,dest,mode,from);
}
function localRoute(start,dest,mode,region){
 const a=mode==="walk"?entrance(start):start,b=mode==="walk"?entrance(dest):dest,c=costs(mode,region);
 const from=nearestCell(a,c,region),to=nearestCell(b,c,region);
 if(from<0||to<0)return [];
 const key=`${region.id}:${mode}:${from}:${to}`;
 let path=routeCache.get(key);
 if(!path){
  const dist=new Map([[from,0]]),parent=new Map(),heap=new Heap();
  heap.push([0,from]);let found=false;
  while(heap.a.length){
   const [,i]=heap.pop();if(i===to){found=true;break;}
   const p=point(i,region),g=dist.get(i);
   for(const j of [i-1,i+1,i-region.nx,i+region.nx]) {
    if(j<0||j>=c.length||!c[j]||Math.abs(j%region.nx-i%region.nx)>1)continue;
    const q=point(j,region),ng=g+(c[i]+c[j])/2;
    if(ng>=(dist.get(j)??Infinity))continue;
    const edge=i<j?`${region.id}:${i}:${j}`:`${region.id}:${j}:${i}`;
    if(!segmentCache.has(edge))segmentCache.set(edge,clearSegment(p,q));
    if(!segmentCache.get(edge))continue;
    dist.set(j,ng);parent.set(j,i);
    heap.push([ng+Math.abs(q.x-b.x)/STEP+Math.abs(q.z-b.z)/STEP,j]);
   }
  }
  if(!found)return [];
  path=[];for(let i=to;i!==undefined;i=parent.get(i))path.push(point(i,region));path.reverse();
  // Only remove collinear vertices, never cut across a corner or building.
  path=path.filter((p,i,all)=>i===0||i===all.length-1||(p.x-all[i-1].x)*(all[i+1].z-p.z)!==(p.z-all[i-1].z)*(all[i+1].x-p.x));
  if(routeCache.size>1200)routeCache.clear();routeCache.set(key,path);
 }
 return [a,...path,b].filter((p,i,all)=>!i||Math.hypot(p.x-all[i-1].x,p.z-all[i-1].z)>.05).map(p=>({...p,mode,stage:ROADS.some(r=>contains(r,p))?'crosswalk':'sidewalk'}));
}
// Both travel directions use the same deterministic offset polylines, in physics and rendering.
const metroTracks=new WeakMap(),metroStations=new WeakMap(),metroSchedules=new WeakMap();
// Ground switchbacks at different heights cannot occupy the same footprint: the
// player would climb the higher line's ramp while its resident route uses the lower.
const metroStairReservations=[];
function metroStairFootprint(stairs){const xs=stairs.map(p=>p.x),zs=stairs.map(p=>p.z),minX=Math.min(...xs)-.77,maxX=Math.max(...xs)+.77,minZ=Math.min(...zs)-.77,maxZ=Math.max(...zs)+.77;return {minX,maxX,minZ,maxZ};}
function metroStairOverlap(a,b){return a.minX<b.maxX&&a.maxX>b.minX&&a.minZ<b.maxZ&&a.maxZ>b.minZ;}
export function metroTrackPoints(line,direction=1){
 const sign=direction<0?-1:1;let cache=metroTracks.get(line);if(!cache){cache={};metroTracks.set(line,cache);}if(cache[sign])return cache[sign];
 const points=line.points,offset=2.2*sign;
 return cache[sign]=points.map((p,i)=>{
  const before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)];
  const segment=(a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz)||1;return{x:-dz/length,z:dx/length};};
  const n1=i?segment(before,p):segment(p,after),n2=i<points.length-1?segment(p,after):n1;
  let nx=n1.x+n2.x,nz=n1.z+n2.z,length=Math.hypot(nx,nz);if(length<.01){nx=n1.x;nz=n1.z;length=1;}nx/=length;nz/=length;
  const scale=offset/Math.max(.35,nx*n1.x+nz*n1.z);
  return{x:p[0]+nx*scale,z:p[1]+nz*scale,y:line.height};
 });
}
export function metroStationGeometry(line,index,direction=1) {
 const sign=direction<0?-1:1;let cache=metroStations.get(line);if(!cache){cache={};metroStations.set(line,cache);}const key=`${index}:${sign}`;if(cache[key])return cache[key];
 const p=line.points[index],prev=line.points[Math.max(0,index-1)],next=line.points[Math.min(line.points.length-1,index+1)];
 const dx=next[0]-prev[0],dz=next[1]-prev[1],axis=Math.abs(dx)>=Math.abs(dz)?'x':'z';
 const along=axis==='x'?{x:1,z:0}:{x:0,z:1},perp=axis==='x'?{x:0,z:1}:{x:1,z:0};
 const width=Math.max(6,...ROADS.filter(r=>(r.w>r.d)===(axis==='x')&&contains(r,{x:p[0],z:p[1]},.2)).map(r=>Math.min(r.w,r.d)));
 const offset=width/2+1.22,candidates=[];
 for(const side of [index%2===0?1:-1,index%2===0?-1:1])for(const approach of [-1,1]){
  const point=(u,v,y)=>({x:p[0]+along.x*u+perp.x*v,z:p[1]+along.z*u+perp.z*v,y});
  const stairs=[point(approach*21,side*offset-.5,1.1),point(approach*7,side*offset-.5,line.height/2+1.125),point(approach*7,side*offset+.5,line.height/2+1.125),point(approach*21,side*offset+.5,line.height+1.15)];
  let violations=0;for(let u=7;u<=21;u+=1)for(const v of [-.98,0,.98]){
   const q=point(approach*u,side*offset+v,1.1);if(ROADS.some(r=>contains(r,q,.04))||blocked(q)||contains(PARK,q))violations++;
  }
  const footprint=metroStairFootprint(stairs),conflicts=metroStairReservations.filter(r=>r.line!==line&&metroStairOverlap(footprint,r.footprint)).length;
  candidates.push({side,stairs,violations,footprint,conflicts});
 }
 const corner=index>0&&index<line.points.length-1&&Math.abs((p[0]-prev[0])*(next[1]-p[1])-(p[1]-prev[1])*(next[0]-p[0]))>.01;
 const platformFor=dir=>{
  const track=metroTrackPoints(line,dir)[index];
  if(corner){
   // Put a corner platform beside a straight part of its service's outgoing
   // track, rather than laying its deck across the intersecting incoming rail.
   const toward=dir>0?next:prev,tx=toward[0]-p[0],tz=toward[1]-p[1],length=Math.hypot(tx,tz),ux=tx/length,uz=tz/length,nx=-uz,nz=ux;
   const side=((track.x-p[0])*nx+(track.z-p[1])*nz)>=0?1:-1,axis=Math.abs(ux)>=Math.abs(uz)?'x':'z';
   for(const [distance,platformLength]of [[12,16],[10,12],[8,8],[6,4]]){
    const point={x:track.x+ux*distance+nx*3.4*side,z:track.z+uz*distance+nz*3.4*side,y:line.height+1.15},w=axis==='x'?platformLength:3.2,d=axis==='x'?3.2:platformLength;
    if(BUILDINGS.some(b=>point.y-.9<b.h&&Math.abs(point.x-b.x)<(w+b.w)/2+.1&&Math.abs(point.z-b.z)<(d+b.d)/2+.1))continue;
    let obstructsRail=false;
    for(const serviceDirection of [1,-1]){
     const points=metroTrackPoints(line,serviceDirection);
     for(let k=1;k<points.length&&!obstructsRail;k++){
      const a=points[k-1],b=points[k],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.5));
      for(let j=0;j<=steps;j++){const t=j/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;if(Math.hypot(Math.max(0,Math.abs(x-point.x)-w/2),Math.max(0,Math.abs(z-point.z)-d/2))<1.63){obstructsRail=true;break;}}
     }
    }
    if(!obstructsRail)return{point,platformLength,axis};
   }
   throw new Error(`No clear corner metro platform for ${line.id}/${index}/${dir}`);
  }
  const projection=(track.x-p[0])*perp.x+(track.z-p[1])*perp.z,side=projection>=0?1:-1;
  return{point:{x:track.x+perp.x*3.4*side,z:track.z+perp.z*3.4*side,y:line.height+1.15},platformLength:16,axis};
 };
 const accessKey=`access:${index}`;
 let best=cache[accessKey];
 if(!best){
  // Preserve road/building clearance first, then choose another clear sidewalk
  // approach when an earlier line already reserved this staircase footprint.
  if(corner){
   const platformFootprints=[1,-1].map(dir=>{const g=platformFor(dir),w=g.axis==='x'?g.platformLength:3.2,d=g.axis==='x'?3.2:g.platformLength;return{minX:g.point.x-w/2,maxX:g.point.x+w/2,minZ:g.point.z-d/2,maxZ:g.point.z+d/2};});
   for(const candidate of candidates)candidate.conflicts+=platformFootprints.filter(r=>metroStairOverlap(candidate.footprint,r)).length;
  }
  candidates.sort((a,b)=>a.violations-b.violations||a.conflicts-b.conflicts);best=cache[accessKey]=candidates[0];
  if(METRO_LINES.includes(line))metroStairReservations.push({line,index,footprint:best.footprint});
 }
 const forward=metroTrackPoints(line,1)[index],forwardSide=((forward.x-p[0])*perp.x+(forward.z-p[1])*perp.z)>=0?1:-1;
 const baseDirection=best.side===forwardSide?1:-1,basePlatform=platformFor(baseDirection).point,platformData=platformFor(sign),platform=platformData.point;
 // Keep the upper approach on the track-facing side of the two stair flights. A diagonal directly
 // back over them forms a ceiling/floor that traps a descending player on top.
 const stairTop=best.stairs.at(-1),topAlong=(stairTop.x-p[0])*along.x+(stairTop.z-p[1])*along.z;
 const corridor=best.side*(offset-1.35),outerTop={x:p[0]+along.x*topAlong+perp.x*corridor,z:p[1]+along.z*topAlong+perp.z*corridor,y:stairTop.y};
 const outerLanding={x:p[0]+perp.x*corridor,z:p[1]+perp.z*corridor,y:stairTop.y};
 const height=line.height+4.5;
 const sharedStairs=corner?[...best.stairs,{...stairTop,y:height},{x:basePlatform.x,z:stairTop.z,y:height},{...basePlatform,y:height},basePlatform]:[...best.stairs,outerTop,outerLanding,basePlatform];
 const crossover=sign===baseDirection?[]:[basePlatform,{...basePlatform,y:height},{x:platform.x,z:basePlatform.z,y:height},{...platform,y:height},platform].filter((q,i,list)=>!i||Math.hypot(q.x-list[i-1].x,q.z-list[i-1].z,q.y-list[i-1].y)>.01);
 return cache[key]={track:metroTrackPoints(line,sign)[index],platform,platformLength:platformData.platformLength,access:sharedStairs[0],axis:platformData.axis,side:sign===baseDirection?best.side:-best.side,direction:sign,baseDirection,sharedStairs,crossover,stairs:[...sharedStairs,...crossover.slice(1)],accessViolations:best.violations};
}
function metroSchedule(line){
 let schedule=metroSchedules.get(line);if(schedule)return schedule;
 // A and B are independent directional services. Neither crosses onto the other track.
 // An arriving service unloads at its terminus, leaves service, then a new departure is dispatched.
 const services=[1,-1].map(direction=>{const legs=[];let at=0;
  for(let i=direction===1?0:line.points.length-1;direction===1?i<line.points.length:i>=0;i+=direction){
   const terminal=i===(direction===1?line.points.length-1:0),to=terminal?i:i+direction,dwell=terminal?10:i===0||i===line.points.length-1?10:8;
   const travel=terminal?0:Math.hypot(line.points[to][0]-line.points[i][0],line.points[to][1]-line.points[i][1])/16;
   legs.push({from:i,to,direction,terminal,dwell,travel,start:at,duration:dwell+travel});at+=dwell+travel;
  }
  return{legs,cycle:at+4,offset:Number(line.id.slice(1))*3};
 });
 schedule={services};metroSchedules.set(line,schedule);return schedule;
}
function physicalTrain(line,seconds,slot){
 const service=metroSchedule(line).services[slot],phase=((seconds+service.offset)%service.cycle+service.cycle)%service.cycle;
 const leg=service.legs.find(l=>phase<l.start+l.duration)||service.legs.at(-1),t=phase-leg.start,points=metroTrackPoints(line,leg.direction),a=points[leg.from],b=points[leg.to];
 const active=phase<service.cycle-4,u=leg.travel?Math.max(0,Math.min(1,(t-leg.dwell)/leg.travel)):0;
 return{id:`${line.id}-${slot===0?'A':'B'}`,active,runDirection:leg.direction,platformDirection:leg.direction,x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,y:line.height,from:leg.from,to:leg.to,direction:leg.direction,dwelling:active&&!leg.terminal&&t<leg.dwell,alighting:active&&t<leg.dwell,cycleSeconds:service.cycle};
}
export function trainStates(line,seconds){return[physicalTrain(line,seconds,0),physicalTrain(line,seconds,1)];}
export function trainById(line,seconds,id){const slot=id===`${line.id}-A`?0:id===`${line.id}-B`?1:-1;return slot<0?null:physicalTrain(line,seconds,slot);}
export function trainState(line,seconds,direction=1){return trainStates(line,seconds).find(t=>t.direction===(direction<0?-1:1));}
/** Analytic periodic-window query: catches a station visit skipped by a coarse background tick. */
export function metroServiceBetween(line,fromSeconds,toSeconds,query){
 if(!Number.isFinite(fromSeconds)||!Number.isFinite(toSeconds)||toSeconds<fromSeconds)return null;
 let best=null;
 for(const slot of [0,1]){const id=`${line.id}-${slot===0?'A':'B'}`;if(query.trainId&&query.trainId!==id)continue;const s=metroSchedule(line).services[slot],offset=s.offset;
  for(const leg of s.legs){if(leg.from!==query.stationIndex||query.direction&&leg.direction!==query.direction||leg.terminal&&!query.alighting)continue;
   const windows=[[0,leg.dwell,leg.direction]];
   for(const [lo,hi,platformDirection]of windows){let cycle=Math.floor((fromSeconds+offset-leg.start-lo)/s.cycle),start=cycle*s.cycle+leg.start+lo-offset,end=cycle*s.cycle+leg.start+hi-offset;if(end<=fromSeconds){start+=s.cycle;end+=s.cycle;}
    const at=Math.max(start,fromSeconds+1e-7);if(at>=end||at>toSeconds)continue;if(!best||at<best.at)best={...physicalTrain(line,at,slot),at,platformDirection};
   }
  }
 }return best;
}
// Freeze access choices against the immutable initial city, independent of snapshot/load order.
for(const line of METRO_LINES)for(let i=0;i<line.points.length;i++)for(const direction of [1,-1])metroStationGeometry(line,i,direction);

// Marked parallel bays stay inside the curb, clear of intersections, bridges and stations.
export const PARKING_SPACES=[];
export function rebuildParkingSpaces(){
 PARKING_SPACES.length=0;const parkingKeys=new Set();
for(const r of ROADS){
 if(Math.min(r.w,r.d)<8.5)continue;
 const horizontal=r.w>r.d,half=(horizontal?r.w:r.d)/2,center=horizontal?r.x:r.z;
 for(let along=Math.ceil((center-half+12)/6)*6;along<center+half-12;along+=6)for(const side of [-1,1]){
  const p=horizontal?{x:along,z:r.z+side*(r.d/2-1.05)}:{x:r.x+side*(r.w/2-1.05),z:along};
  if(UNDERPASSES.some(t=>Math.abs(p.x-t.x)<t.w/2+3&&Math.abs(p.z-t.z)<t.halfLength+8))continue;
  if((!contains(RIVERSIDE,p,-8)&&(Math.abs(p.x)>335||Math.abs(p.z)>335))||blocked(p)||BRIDGES.some(b=>contains(b,p,4)))continue;
  if(ROADS.some(o=>o!==r&&(o.w>o.d)!==horizontal&&contains(o,p,8)))continue;
  if(METRO_LINES.some(l=>l.points.some(([x,z])=>Math.hypot(p.x-x,p.z-z)<12)))continue;
  const key=`${p.x.toFixed(2)},${p.z.toFixed(2)}`;if(parkingKeys.has(key))continue;parkingKeys.add(key);
  PARKING_SPACES.push({...p,id:`CURB-${key}`,spaceId:`CURB-${key}`,heading:horizontal?side*Math.PI/2:side<0?0:Math.PI,axis:horizontal?'x':'z',w:horizontal?5:2,d:horizontal?2:5});
 }
}
 for(const r of URBAN_ROADS){
  if(!r.frontage||!r.servesLocationId)continue;
  const lot=BUILDINGS.find(b=>b.id===r.servesLocationId);if(!lot)continue;
  const horizontal=r.w>r.d,side=Math.sign(horizontal?lot.z-r.frontage.z:lot.x-r.frontage.x)||1;
  const p={x:r.frontage.x+(horizontal?0:side*3.8),z:r.frontage.z+(horizontal?side*3.8:0)};
  if(blocked(p))continue;
  const id=`CURB-ACCESS-${r.servesLocationId}`;
  PARKING_SPACES.push({...p,id,spaceId:id,heading:horizontal?side*Math.PI/2:side<0?0:Math.PI,axis:horizontal?'x':'z',w:horizontal?5.5:2.2,d:horizontal?2.2:5.5,loading:true,servesLocationId:r.servesLocationId});
 }
}
rebuildParkingSpaces();
export function parkingPoint(p,occupied=new Set()) {
 let best=null,distance=Infinity;
 for(const q of PARKING_SPACES){if(occupied.has(q.id))continue;const d=Math.hypot(q.x-p.x,q.z-p.z);if(d<distance){best=q;distance=d;}}
 return best?{...best}:null;
}
export function vehicleRoute(start,dest,mode='car',parked=null,destinationParking=null) {
 const a=parked||parkingPoint(start),b=destinationParking||parkingPoint(dest);
 if(!a||!b)return pedestrianRoute(start,dest);
 const access=pedestrianRoute(start,a),drive=pedestrianRoute(a,b,mode),exit=pedestrianRoute(b,dest);
 if(!access.length||!drive.length||!exit.length)return pedestrianRoute(start,dest);
 return [...access,...drive.map(p=>({...p,stage:'road'})),{...b,mode,stage:'parking'},...exit];
}
