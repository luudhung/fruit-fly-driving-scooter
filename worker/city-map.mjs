// Shared authoritative geometry. The observer and simulation import this same map.
export const MAP_VERSION = 8;
export const WORLD_HALF = 405; // approximately twice the previous ground area
export const PARK = { x:-11, z:-87, w:38, d:44 };
export const WATER = [{x:-20,z:-97,w:10,d:12},{x:128,z:-12,w:28,d:470},{x:65,z:205,w:350,d:68}];
export const AVENUES = [-102,-76,-50,-24,2,28,54,80,106];
export const STREETS = [-145,-116,-87,-58,-29,0,29,58,87,116,145];
export const contains = (r,p,m=0) => Math.abs(r.x-p.x)<r.w/2+m && Math.abs(r.z-p.z)<r.d/2+m;
export const overlaps = (a,b,m=0) => Math.abs(a.x-b.x)<(a.w+b.w)/2+m && Math.abs(a.z-b.z)<(a.d+b.d)/2+m;
export const ROADS = [];
function road(x,z,w,d) { ROADS.push({x,z,w,d}); }
for(const x of AVENUES) {
  if(x===-24||x===2) { road(x,-140,9.5,54);road(x,51,9.5,222); }
  else road(x,-5,9.5,332);
}
for(const z of STREETS) {
  if(z===-87) {road(-72,z,80,9);road(61,z,102,9);}
  else road(2,z,220,9);
}
for(const x of [-154,159]) road(x,-5,10,366);
for(const z of [-150,-100,-50,0,50,100,150]) {
 road(-215,z,136,8); road(215,z,126,8);
}
// Continuous arterial links and a residential north ring.
road(-128,0,52,9);road(-128,-145,52,9);road(-128,145,52,9);
road(45,-184,440,9);road(45,-234,440,9);
for(const x of [-154,-102,2,106,159,260]) road(x,-209,9.5,50);
for(const z of [-87,0,87]) road(133,z,54,9);
export const BRIDGES=[-87,0,87].map(z=>({x:128,z,w:42,d:15}));
export const LOCATIONS = [
  { id: "apt-north", type: "home", name: "Hansdrex North Garden Homes", x: 0, z: -165 },
  { id: "apt-east", type: "home", name: "Hansdrex East River Homes", x: 170, z: 12 },
  { id: "apt-south", type: "home", name: "Hansdrex South Meadow Homes", x: 12, z: 170 },
  { id: "apt-west", type: "home", name: "Hansdrex West Orchard Homes", x: -170, z: 8 },

  { id: "market", type: "food", name: "Hansdrex Central Market", x: -37, z: 14.5 },
  { id: "cafe", type: "social", name: "Hansdrex Coffee", x: 15, z: -14.5 },
  { id: "tea-house", type: "social", name: "Hansdrex Tea House", x: -37, z: -14.5 },
  { id: "restaurant", type: "food", name: "Hansdrex Kitchen", x: 41, z: -14.5 },
  { id: "park", type: "social", name: "Hansdrex Central Park", x: -11, z: -87 },
  { id: "office", type: "job", name: "Hansdrex Commerce Tower", x: 67, z: 14.5 },
  { id: "bank", type: "service", name: "Hansdrex Bank", x: -63, z: 14.5 },
  { id: "hotel", type: "service", name: "Hansdrex Grand Hotel", x: 67, z: 43.5 },
  { id: "cinema", type: "social", name: "Hansdrex Cinema", x: -63, z: 43.5 },
  { id: "library", type: "service", name: "Hansdrex Library", x: 15, z: 72.5 },

  { id: "hospital-central", type: "health", name: "Hansdrex Central Hospital", x: -89, z: 72.5 },
  { id: "hospital-east", type: "health", name: "Hansdrex East Hospital", x: 176, z: 68 },
  { id: "clinic", type: "health", name: "Hansdrex Community Clinic", x: -63, z: 101.5 },
  { id: "pharmacy", type: "health", name: "Hansdrex Pharmacy", x: -89, z: 14.5 },
  { id: "school", type: "service", name: "Hansdrex Academy", x: -11, z: 101.5 },
  { id: "post-office", type: "service", name: "Hansdrex Post", x: -89, z: -14.5 },
  { id: "lab", type: "job", name: "Hansdrex Research Lab", x: 93, z: 72.5 },
  { id: "garage", type: "service", name: "Hansdrex Garage", x: 93, z: -72.5 },
  { id: "vehicle-showroom", type: "shop", name: "Hansdrex Motors Showroom", x: -130, z: -74 },
  { id: "police", type: "law", name: "Hansdrex Police Department", x: -130, z: -25 },
  { id: "gym", type: "wellness", name: "Hansdrex Fitness", x: 93, z: 14.5 },

  { id: "bakery", type: "food", name: "Hansdrex Bakery", x: 41, z: 72.5 },
  { id: "grocery", type: "food", name: "Hansdrex Grocery", x: -63, z: -43.5 },
  { id: "corner-shop", type: "shop", name: "Hansdrex Store", x: 67, z: -72.5 },
  { id: "night-market", type: "nightlife", name: "Hansdrex Night Market", x: 41, z: -101.5 },
  { id: "arcade", type: "nightlife", name: "Hansdrex Arcade", x: -63, z: -72.5 },
  { id: "music-hall", type: "nightlife", name: "Hansdrex Music Hall", x: 67, z: 72.5 },
  { id: "nightclub", type: "nightlife", name: "Hansdrex Afterdark", x: 93, z: -14.5 },
  { id: "rooftop", type: "nightlife", name: "Hansdrex Sky Lounge", x: 15, z: 43.5 },
  { id: "heliport", type: "luxury", name: "Hansdrex Heli Tours", x: 15, z: 43.5 },

  { id: "factory", type: "job", name: "Hansdrex Sugar Works", x: -220, z: 75 },
  { id: "factory-east", type: "job", name: "Hansdrex Materials Plant", x: 220, z: 125 },
  { id: "factory-south", type: "job", name: "Hansdrex Packaging", x: 220, z: -75 },
  { id: "warehouse", type: "job", name: "Hansdrex Warehouse", x: -220, z: -125 },
  { id: "farm", type: "production", name: "Hansdrex Farm", x: -220, z: 125 },
  { id: "construction", type: "job", name: "Hansdrex Build Yard", x: 220, z: 25 },
  { id: "transit", type: "job", name: "Hansdrex Transit Depot", x: 220, z: -125 },
  { id: "power", type: "infrastructure", name: "Hansdrex Power Plant", x: -220, z: -75 },
  { id: "recycling", type: "job", name: "Hansdrex Recycling", x: 260, z: 125 },

  { id: "metro-central", type: "transit", name: "Hansdrex Central Station", x: 2, z: 0 },
  { id: "metro-north", type: "transit", name: "Hansdrex North Station", x: 2, z: -145 },
  { id: "metro-east", type: "transit", name: "Hansdrex East Station", x: 159, z: 0 },
  { id: "metro-south", type: "transit", name: "Hansdrex South Station", x: 2, z: 145 },
  { id: "metro-west", type: "transit", name: "Hansdrex West Station", x: -154, z: 0 },
  { id: "metro-industrial", type: "transit", name: "Hansdrex Industrial Station", x: -154, z: 87 },
];

export const METRO_LINES = [
 {id:"M1",height:9,points:[[-154,0],[-76,0],[2,0],[80,0],[159,0],[260,0]]},
 {id:"M2",height:11,points:[[-50,-184],[-50,-116],[-50,-29],[-50,58],[-50,145]]},
 {id:"M3",height:13,points:[[-154,87],[-76,87],[2,87],[80,87],[159,87]]},
 {id:"M4",height:15,points:[[-102,-184],[-102,-116],[-102,-29],[-102,58],[-102,145]]},
 {id:"M5",height:17,points:[[-102,-116],[-24,-116],[54,-116],[106,-116]]},
 {id:"M6",height:19,points:[[159,-184],[159,-100],[159,0],[159,100],[159,150]]}
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
 const landmark=false;
 const w=outer?24:Math.abs(loc.x)===130?18:10;
 const d=outer?20:14;
 place({...loc,w,d,h:loc.type==='job'?36:loc.type==='health'?24:loc.type==='nightlife'?20:12,kind:'destination'});
}
for(const [id,x,h] of [['toronto',-11,133],['empire',15,136],['petronas',41,115]])place({id,x,z:43.5,w:11,d:12,h,kind:'landmark'});
export const APARTMENTS=[];
for(const x of [-128,-76,-50,-24,28,54,80,132,184,210,236])for(const z of [-202,-220]) {
 const b={id:`APT-${APARTMENTS.length+1}`,x,z,w:10,d:12,h:18,kind:'apartment',capacity:10,rent:24,purchaseValue:5040};
 if(place(b))APARTMENTS.push(b);
}
export const HOUSE_LOTS=[];
for(const x of [-270,-250,-230,-210,-190,180,200,220,240,260])for(const z of [-132,-118,-82,-68,-32,-18,18,32,68,82,118,132]) {
 const b={id:`HOUSE-${HOUSE_LOTS.length+1}`,x,z,w:9,d:9,h:6,kind:'house',baseValue:8200+HOUSE_LOTS.length*32};
 if(place(b))HOUSE_LOTS.push(b);
}
for(let xi=0;xi<AVENUES.length-1;xi++)for(let zi=0;zi<STREETS.length-1;zi++) {
 const x=(AVENUES[xi]+AVENUES[xi+1])/2,z=(STREETS[zi]+STREETS[zi+1])/2;
 const core=Math.max(0,1-Math.hypot(x-15,z-43.5)/180);
 place({id:`BLOCK-${xi}-${zi}`,x,z,w:10,d:14,h:8+core**1.8*70+((xi*13+zi*7)%11),kind:'block'});
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
for(const z of [-106,-87,-68])walks.push({a:{x:-30,z},b:{x:10,z}});
for(const x of [-28,-11,6])walks.push({a:{x,z:-122},b:{x,z:-52}});
export const WALKWAYS=walks;
// Small A* lattice: cached blocked cells, weighted sidewalks and exact segment validation.
const STEP=2,MIN=-290,MAX=290,SIZE=(MAX-MIN)/STEP+1;
const costCache=new Map();
const segmentCache=new Map();
function costs(mode="walk") {
 if(costCache.has(mode))return costCache.get(mode);
 const walkCosts=new Float32Array(SIZE*SIZE);
 for(let iz=0;iz<SIZE;iz++)for(let ix=0;ix<SIZE;ix++) {
  const p={x:MIN+ix*STEP,z:MIN+iz*STEP};
  if(blocked(p))continue;
  let c=8;
  if(mode!=="walk"){walkCosts[iz*SIZE+ix]=ROADS.some(r=>contains(r,p))?1:0;continue;}
  for(const w of walks) {
   const x=Math.max(Math.min(w.a.x,w.b.x),Math.min(Math.max(w.a.x,w.b.x),p.x));
   const z=Math.max(Math.min(w.a.z,w.b.z),Math.min(Math.max(w.a.z,w.b.z),p.z));
   if(Math.hypot(p.x-x,p.z-z)<1.8){c=1;break;}
  }
  if(c>1&&ROADS.some(r=>contains(r,p)))c=18;
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
