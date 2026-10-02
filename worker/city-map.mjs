// Shared authoritative geometry. The observer and simulation import this same map.
export const MAP_VERSION = 13;
export const WORLD_HALF = 620;
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
export const RIVER={id:"hansdrex-river",x:390,z:0,w:32,d:760};
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
for(const x of [-430,430])road(x,0,10,820);
for(const z of [-400,400])road(0,z,860,10);
for(const z of [-180,0,180])road(390,z,92,10);
export const BRIDGES=[-180,0,180].map(z=>({x:390,z,w:76,d:16}));

export const LOCATIONS = [
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
  { id: "heliport", type: "luxury", name: "Hansdrex Heli Tours", x: 15, z: 43.5 },

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
 {id:"M1",height:9,points:[[-310,0],[-210,0],[-102,0],[2,0],[122,0],[210,0],[310,0]]},
 {id:"M2",height:11,points:[[-102,-340],[-102,-220],[-102,-116],[-102,0],[-102,145],[-102,260],[-102,340]]},
 {id:"M3",height:13,points:[[-310,87],[-210,87],[-102,87],[2,87],[122,87],[210,87],[310,87]]},
 {id:"M4",height:15,points:[[122,-340],[122,-220],[122,-116],[122,0],[122,145],[122,260],[122,340]]},
 {id:"M5",height:17,points:[[-210,-340],[-102,-340],[2,-340],[122,-340],[210,-340]]},
 {id:"M6",height:19,points:[[310,-340],[310,-220],[310,0],[310,180],[310,340]]}
];

export const BUILDINGS=[];
function place(b) {
 if(ROADS.some(r=>overlaps(b,r,2.6)) || WATER.some(r=>overlaps(b,r,1)) || overlaps(b,PARK,1) || BUILDINGS.some(r=>overlaps(b,r,1))) return false;
 BUILDINGS.push(b);return true;
}
for(const loc of LOCATIONS) {
 if(['home','transit','social'].includes(loc.type)&&!['cafe','tea-house','cinema'].includes(loc.id))continue;
 if(['park','rooftop','heliport','farm'].includes(loc.id))continue;
 const outer=Math.abs(loc.x)>180;
 const w=outer?24:Math.abs(loc.x)>=125?18:10;
 const d=outer?20:14;
 place({...loc,w,d,h:loc.type==='job'?36:loc.type==='health'?24:loc.type==='nightlife'?20:12,kind:'destination'});
}
// Existing signature skyline is preserved, then expanded with two new world landmarks.
for(const [id,x,z,w,d,h] of [
 ['toronto',-11,43.5,11,12,133],
 ['empire',15,43.5,11,12,136],
 ['petronas',41,43.5,11,12,115],
 ['burj-khalifa',236,72.5,14,14,190],
 ['marina-bay',340,320,44,18,88],
]) place({id,x,z,w,d,h,kind:'landmark'});

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

export function entrance(p) {
 const b=BUILDINGS.find(b=>contains(b,p,0.2));
 if(b)return {x:b.x,z:b.z+b.d/2+1.2};
 return {x:p.x,z:p.z};
}
export function blocked(p) {
 if(Math.abs(p.x)>WORLD_HALF-4||Math.abs(p.z)>WORLD_HALF-4)return true;
 if(WATER.some(w=>contains(w,p,.25))&&!BRIDGES.some(b=>contains(b,p)))return true;
 return BUILDINGS.some(b=>contains(b,p,.45));
}
export function clearSegment(a,b) {
 const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.6));
 for(let i=0;i<=n;i++)if(blocked({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n}))return false;
 return true;
}
// A graph of actual sidewalks, park paths and bridge walks, never imaginary infinite streets.
const walks=[];
for(const r of ROADS) {
 if(r.w>r.d)for(const s of [-1,1])walks.push({a:{x:r.x-r.w/2,z:r.z+s*(r.d/2+1.4)},b:{x:r.x+r.w/2,z:r.z+s*(r.d/2+1.4)}});
 else for(const s of [-1,1])walks.push({a:{x:r.x+s*(r.w/2+1.4),z:r.z-r.d/2},b:{x:r.x+s*(r.w/2+1.4),z:r.z+r.d/2}});
}
// Park loop, internal stroll and entrance connections.
for(const r of PARK_PATHS)walks.push(r.w>r.d?{a:{x:r.x-r.w/2,z:r.z},b:{x:r.x+r.w/2,z:r.z}}:{a:{x:r.x,z:r.z-r.d/2},b:{x:r.x,z:r.z+r.d/2}});
export const WALKWAYS=walks;
// Small A* lattice: cached blocked cells, weighted sidewalks and exact segment validation.
const STEP=2,MIN=-380,MAX=380,SIZE=(MAX-MIN)/STEP+1;
const costCache=new Map();
const segmentCache=new Map();
function costs(mode="walk") {
 if(costCache.has(mode))return costCache.get(mode);
 const walkCosts=new Float32Array(SIZE*SIZE);
 for(let iz=0;iz<SIZE;iz++)for(let ix=0;ix<SIZE;ix++) {
  const p={x:MIN+ix*STEP,z:MIN+iz*STEP};
  if(blocked(p))continue;
  // Walking is sidewalk-biased in the city, but Central Park is a genuine free-roam
  // pedestrian district. Grass/meadows are legal to cross; paths are only cheaper, not mandatory.
  let c=contains(PARK,p,0)?1.55:8;
  if(mode!=="walk"){walkCosts[iz*SIZE+ix]=ROADS.some(r=>contains(r,p))?1:0;continue;}
  for(const w of walks) {
   const x=Math.max(Math.min(w.a.x,w.b.x),Math.min(Math.max(w.a.x,w.b.x),p.x));
   const z=Math.max(Math.min(w.a.z,w.b.z),Math.min(Math.max(w.a.z,w.b.z),p.z));
   if(Math.hypot(p.x-x,p.z-z)<1.8){c=contains(PARK,p,0)?0.72:1;break;}
  }
  if(c>1.6&&ROADS.some(r=>contains(r,p)))c=18;
  walkCosts[iz*SIZE+ix]=c;
 }
 costCache.set(mode,walkCosts);return walkCosts;
}
class Heap {
 a=[];
 push(v){let i=this.a.length;this.a.push(v);while(i){const p=(i-1)>>1;if(this.a[p][0]<=v[0])break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}
 pop(){const top=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let j=i*2+1;if(j+1<this.a.length&&this.a[j+1][0]<this.a[j][0])j++;if(this.a[j][0]>=last[0])break;this.a[i]=this.a[j];i=j;}this.a[i]=last;}return top;}
}
const point = i=>({x:MIN+(i%SIZE)*STEP,z:MIN+Math.floor(i/SIZE)*STEP});
function nearestCell(p,c) {
 const ix=Math.round((p.x-MIN)/STEP),iz=Math.round((p.z-MIN)/STEP);
 for(let radius=0;radius<10;radius++) {
  let best=-1,d=Infinity;
  for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){
   const x=ix+dx,z=iz+dz;if(x<0||z<0||x>=SIZE||z>=SIZE)continue;
   const i=z*SIZE+x,q=point(i),dist=Math.hypot(p.x-q.x,p.z-q.z);
   if(c[i]&&dist<d&&clearSegment(p,q)){best=i;d=dist;}
  }
  if(best>=0)return best;
 }
 return -1;
}
const routeCache=new Map();
export function pedestrianRoute(start,dest,mode="walk") {
 const a=mode==="walk"?entrance(start):start,b=mode==="walk"?entrance(dest):dest,c=costs(mode);
 const from=nearestCell(a,c),to=nearestCell(b,c);
 if(from<0||to<0)return [];
 const key=`${mode}:${from}:${to}`;
 let path=routeCache.get(key);
 if(!path){
  const dist=new Map([[from,0]]),parent=new Map(),heap=new Heap();
  heap.push([0,from]);let found=false;
  while(heap.a.length){
   const [,i]=heap.pop();if(i===to){found=true;break;}
   const p=point(i),g=dist.get(i);
   for(const j of [i-1,i+1,i-SIZE,i+SIZE]) {
    if(j<0||j>=c.length||!c[j]||Math.abs(j%SIZE-i%SIZE)>1)continue;
    const q=point(j),ng=g+(c[i]+c[j])/2;
    if(ng>=(dist.get(j)??Infinity))continue;
    const edge=i<j?`${i}:${j}`:`${j}:${i}`;
    if(!segmentCache.has(edge))segmentCache.set(edge,clearSegment(p,q));
    if(!segmentCache.get(edge))continue;
    dist.set(j,ng);parent.set(j,i);
    heap.push([ng+Math.abs(q.x-b.x)/STEP+Math.abs(q.z-b.z)/STEP,j]);
   }
  }
  if(!found)return [];
  path=[];for(let i=to;i!==undefined;i=parent.get(i))path.push(point(i));path.reverse();
  // Only remove collinear vertices, never cut across a corner or building.
  path=path.filter((p,i,all)=>i===0||i===all.length-1||(p.x-all[i-1].x)*(all[i+1].z-p.z)!==(p.z-all[i-1].z)*(all[i+1].x-p.x));
  if(routeCache.size>1200)routeCache.clear();routeCache.set(key,path);
 }
 return [a,...path,b].filter((p,i,all)=>!i||Math.hypot(p.x-all[i-1].x,p.z-all[i-1].z)>.05).map(p=>({...p,mode,stage:ROADS.some(r=>contains(r,p))?'crosswalk':'sidewalk'}));
}
export function metroStationGeometry(line,index) {
 const p=line.points[index],prev=line.points[Math.max(0,index-1)],next=line.points[Math.min(line.points.length-1,index+1)];
 const dx=next[0]-prev[0],dz=next[1]-prev[1],len=Math.hypot(dx,dz)||1;
 const px=-dz/len,pz=dx/len;
 const side=index%2===0?1:-1;
 const platformOffset=3.4,accessOffset=8.2;
 return {
  track:{x:p[0],z:p[1],y:line.height},
  platform:{x:p[0]+px*platformOffset*side,z:p[1]+pz*platformOffset*side,y:line.height+.25},
  access:{x:p[0]+px*accessOffset*side,z:p[1]+pz*accessOffset*side,y:1.1},
  axis:Math.abs(dx)>=Math.abs(dz)?"x":"z",
  side,
 };
}

export function trainState(line,seconds) {
 const stops=line.points,legs=[];
 for(let i=0;i<stops.length-1;i++)legs.push([i,i+1]);
 for(let i=stops.length-1;i>0;i--)legs.push([i,i-1]);
 const dwell=4,speed=16;
 const durations=legs.map(([a,b])=>dwell+Math.hypot(stops[b][0]-stops[a][0],stops[b][1]-stops[a][1])/speed);
 const cycle=durations.reduce((a,b)=>a+b,0);
 let t=((seconds+Number(line.id.slice(1))*3)%cycle+cycle)%cycle;
 let i=0;while(i<durations.length-1&&t>=durations[i])t-=durations[i++];
 const [from,to]=legs[i],u=Math.max(0,(t-dwell)/(durations[i]-dwell));
 return {x:stops[from][0]+(stops[to][0]-stops[from][0])*u,z:stops[from][1]+(stops[to][1]-stops[from][1])*u,y:line.height,from,to,direction:Math.sign(to-from),dwelling:t<dwell};
}

export function parkingPoint(p) {
 const candidates=ROADS.map(r=>r.w>r.d?{x:Math.max(r.x-r.w/2+2,Math.min(r.x+r.w/2-2,p.x)),z:r.z}:{x:r.x,z:Math.max(r.z-r.d/2+2,Math.min(r.z+r.d/2-2,p.z))});
 return candidates.filter(q=>!blocked(q)).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
}
export function vehicleRoute(start,dest,mode='car',parked=null) {
 const a=parked||parkingPoint(start),b=parkingPoint(dest);
 const access=pedestrianRoute(start,a),drive=pedestrianRoute(a,b,mode),exit=pedestrianRoute(b,dest);
 if(!access.length||!drive.length||!exit.length)return pedestrianRoute(start,dest);
 return [...access,...drive.map(p=>({...p,stage:'road'})),{...b,mode,stage:'parking'},...exit];
}
