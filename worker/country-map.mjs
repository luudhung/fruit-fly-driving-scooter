import {HANSDREX_AIRPORT} from './hansdrex-airport-map.mjs';
// Pure geography shared by the world, immigration and viewer; never imports city-map.
export const COUNTRY_IDS={hansdrex:'hansdrex',north:'north-city',hawaii:'hawaii'};
export const HAWAII_ISLAND={x:100,z:790,rx:260,rz:2*205*135/260};
export const COUNTRIES=[
 {id:COUNTRY_IDS.hansdrex,name:'Hansdrex',initialResidents:750},
 {id:COUNTRY_IDS.north,name:'North City',initialResidents:250},
 {id:COUNTRY_IDS.hawaii,name:'Hawaii',initialResidents:50,seasonal:false},
];
export function countryAt(p){
 if(!Number.isFinite(p?.x)||!Number.isFinite(p?.z))return null;
 if(((p.x-HAWAII_ISLAND.x)/HAWAII_ISLAND.rx)**2+((p.z-HAWAII_ISLAND.z)/HAWAII_ISLAND.rz)**2<1)return COUNTRY_IDS.hawaii;
 return p.z< -570&&p.x<430?COUNTRY_IDS.north:COUNTRY_IDS.hansdrex;
}
export function countryForHome(unitId,homePoint){
 if(typeof unitId==='string'&&(unitId.startsWith('AIRPORT-APT-')||unitId.startsWith('NORTH-')||unitId.startsWith('north-')))return COUNTRY_IDS.north;
 if(typeof unitId==='string'&&(unitId.startsWith('HAWAII-')||unitId.startsWith('hawaii-')||unitId.startsWith('island-')))return COUNTRY_IDS.hawaii;
 return homePoint&&Number.isFinite(homePoint.x)&&Number.isFinite(homePoint.z)?countryAt(homePoint):COUNTRY_IDS.hansdrex;
}
export const homeCountry=countryForHome;
const airport=(id,countryId,terminal,gate,runway,apron,stands)=>({id,countryId,locationId:id==='city'?'airport':id==='island'?'island-airport':'north-airport',terminal,gate,runway,apron,stands});
export const COUNTRY_AIRPORTS=[
 {id:'city',countryId:COUNTRY_IDS.hansdrex,locationId:'airport',...HANSDREX_AIRPORT},
 airport('north',COUNTRY_IDS.north,{x:-908,z:-820,w:36,d:64},{x:-886,z:-820},{x:-1000,z:-820,w:22,d:340},{x:-950,z:-820,w:44,d:150},[-780,-820,-860].map((z,i)=>({id:`NORTH-STAND-${i+1}`,x:-950,z}))),
 airport('island',COUNTRY_IDS.hawaii,{x:65,z:785,w:30,d:16},{x:65,z:795},{x:145,z:742,w:240,d:16},{x:145,z:765,w:180,d:30},[120,170].map((x,i)=>({id:`HAWAII-STAND-${i+1}`,x,z:765}))),
];
export const COUNTRY_AIRPORT_ALIASES={airport:'city','north-airport':'north','island-airport':'island',hawaii:'island'};
export const NORTH_AIRPORT=COUNTRY_AIRPORTS[1];
export const NORTH_FARM={id:'north-farm',locationId:'north-farm',name:'North City Rice and Vegetable Cooperative',ownerCountryId:COUNTRY_IDS.north,kind:'farm',x:260,z:-790,w:230,d:280,capacity:40,gate:{x:138,z:-790},crops:['rice','vegetables'],fields:[{id:'north-rice-west',crop:'rice',x:202,z:-860,w:98,d:116},{id:'north-rice-east',crop:'rice',x:318,z:-860,w:98,d:116},{id:'north-vegetables-west',crop:'vegetables',x:202,z:-720,w:98,d:116},{id:'north-vegetables-east',crop:'vegetables',x:318,z:-720,w:98,d:116}]};
export const NORTH_LANDMARK={id:'north-aurora-tower',name:'North City Aurora Tower',x:-198,z:-970,w:18,d:18,h:196,kind:'landmark',countryId:COUNTRY_IDS.north,capacity:16,rent:40,purchaseValue:240000,officeCapacity:24};
export const NORTH_MILITARY={id:'north-army-compound',x:270,z:-1020,w:180,d:100,drill:{x:270,z:-995,w:80,d:36},gate:{x:270,z:-961}};
/** One physical perimeter for AI, the player and static presentation. */
export const NORTH_MILITARY_WALLS=[
 {id:'NORTH-ARMY-WALL-N',x:270,z:-1070,w:180,d:1,h:2.8},
 ...[-1,1].map(side=>({id:`NORTH-ARMY-WALL-S-${side}`,x:270+side*49.5,z:-970,w:81,d:1,h:2.8})),
 ...[-1,1].map(side=>({id:`NORTH-ARMY-WALL-EW-${side}`,x:270+side*90,z:-1020,w:1,d:100,h:2.8})),
];
export const NORTH_GUARD_POSTS=[{id:'NORTH-GATE-W',x:264,z:-974},{id:'NORTH-GATE-E',x:276,z:-974}];
export function northMilitaryPerimeterBlocked(p,margin=0){return NORTH_MILITARY_WALLS.some(b=>Math.abs(p.x-b.x)<b.w/2+margin&&Math.abs(p.z-b.z)<b.d/2+margin);}
const facility=(id,name,x,z,w,d,h,type)=>({id,name,x,z,w,d,h,type,kind:'country-service',countryId:COUNTRY_IDS.north});
export const NORTH_WHITE_HOUSE=facility('north-white-house','North City White House',-487,-745,42,30,13,'government');
export const NORTH_MATERIALS_YARD=facility('north-materials-yard','North City Construction Depot',197,-963,20,10,8,'job');
export const NORTH_SPORTS_PARK={
 id:'north-sports-park',name:'North City Airport Sports Park',x:-696,z:-745,w:300,d:250,
 gate:{x:-550,z:-609},clubhouse:facility('north-sports-club','Airport Sports Club and Lodge',-563,-631,24,16,9,'hotel'),
 golf:{x:-728,z:-745,w:226,d:208},
 tennis:Array.from({length:4},(_,i)=>({x:-586+(i%2)*20,z:-796+Math.floor(i/2)*39,w:17,d:34})),
 football:{x:-588,z:-701,w:48,d:76},
 activities:[
  {id:'north-golf',name:'North Airport Golf',type:'social',x:-713,z:-648},
  {id:'north-tennis',name:'North Airport Tennis',type:'social',x:-550,z:-765},
  {id:'north-football',name:'North Airport Football',type:'social',x:-552,z:-687},
 ],
};
export const NORTH_BUILDINGS=[
 NORTH_WHITE_HOUSE,NORTH_MATERIALS_YARD,NORTH_SPORTS_PARK.clubhouse,
 facility('north-airport','North City International Airport',-908,-820,36,64,10,'transit'),
 facility('north-police','North City Police',110,-1042,24,20,12,'law'),
 facility('north-hospital','North City General Hospital',110,-978,24,24,15,'health'),
 facility('north-school','North City Community School',110,-910,24,22,10,'service'),
 facility('north-restaurant','North City Kitchen',110,-850,22,20,8,'food'),
 facility('north-cafe','North City Coffee',110,-790,18,18,7,'social'),
 facility('north-market','North City Market',110,-730,20,22,8,'food'),
 facility('north-bank','North City Bank',110,-685,18,18,10,'service'),
 facility('north-hotel','North City Guest House',110,-630,24,18,18,'hotel'),
 facility('north-firestation','North City Fire and Ambulance Station',180,-620,34,24,10,'job'),
 facility('north-army','North City Army Barracks',270,-1035,66,24,12,'government'),
 {id:'north-farm-barn',name:'North City Farm Store and Packing House',x:260,z:-938,w:54,d:8,h:8,kind:'farm-service',countryId:COUNTRY_IDS.north},
 NORTH_LANDMARK,
];
export const NORTH_LOCATIONS=[...NORTH_SPORTS_PARK.activities,...NORTH_BUILDINGS.map(b=>({id:b.id,name:b.name,type:b.type||'job',x:b.x,z:b.z})),{id:NORTH_FARM.id,name:NORTH_FARM.name,type:'production',...NORTH_FARM.gate},{id:NORTH_SPORTS_PARK.id,name:NORTH_SPORTS_PARK.name,type:'social',...NORTH_SPORTS_PARK.gate},{id:'north-drill',name:'North City Formation Ground',type:'public-duty',x:270,z:-995}];
export const NORTH_ROADS=[
 {id:'NORTH-AIRPORT-AVENUE',x:-880,z:-870,w:9.5,d:160},
 {id:'NORTH-AIRPORT-BOULEVARD',x:-655,z:-950,w:450,d:9},
 ...[-950,-600].map(z=>({id:`NORTH-EAST-CROSS-STREET-${z}`,x:215,z,w:330,d:9})),
 ...[130,374].map(x=>({id:`NORTH-FARM-AVENUE-${x}`,x,z:-835,w:9.5,d:470})),
 {id:'NORTH-CIVIC-NORTH-STREET',x:90,z:-1070,w:80,d:9},
 {id:'NORTH-PRESIDENTIAL-WAY',x:-461,z:-721,w:62,d:8},
 {id:'NORTH-SPORTS-LINK',x:-537,z:-600,w:34,d:8},
 {id:'NORTH-FIRE-ACCESS',x:155,z:-640,w:50,d:9},
];
// Cottages host existing seasonal workers and guests; they do not seed new citizens.
export const HAWAII_COTTAGES=[[-70,835],[-20,835],[30,835],[-70,885],[-20,885],[30,885],[-70,935],[-20,935],[30,935],[250,865],[300,865],[250,915],[294,915]].map(([x,z],i)=>({id:`HAWAII-COTTAGE-${i+1}`,name:'Hawaii Seasonal Cottage',x,z,w:10,d:12,h:6,kind:'resort-cottage',countryId:COUNTRY_IDS.hawaii,capacity:4,seasonal:true,primaryResidence:false}));
export const HAWAII_APARTMENTS=[
 {id:'HAWAII-APT-PALMS',name:'Palms Court Apartments',x:89,z:880,w:18,d:17,h:14,capacity:10},
 {id:'HAWAII-APT-COVE',name:'Cove View Apartments',x:160,z:896,w:24,d:18,h:17,capacity:14},
 {id:'HAWAII-APT-HARBOR',name:'Harbor View Apartments',x:200,z:908,w:25,d:18,h:20,capacity:18},
].map(b=>({...b,kind:'resort-apartment',countryId:COUNTRY_IDS.hawaii,seasonal:true,primaryResidence:false}));
// Permanent households have their own buildings; visitor hotel inventory is separate.
HAWAII_APARTMENTS.push(...[[220,820],[250,820],[50,830],[80,830],[220,840]].map(([x,z],i)=>({id:`HAWAII-HOME-${i+1}`,name:`Hawaii Resident Court ${i+1}`,x,z,w:16,d:16,h:24,capacity:10,rent:8,purchaseValue:4200,kind:'resort-apartment',countryId:COUNTRY_IDS.hawaii,seasonal:false,primaryResidence:true})));
export const HAWAII_ROADS=[
 {id:'HAWAII-SOUTH-AVENUE',x:65,z:877.5,w:7,d:165},
 ...[810,910].map(z=>({id:`HAWAII-COTTAGE-STREET-${z}`,x:10,z,w:180,d:6})),
 {id:'HAWAII-COTTAGE-STREET-860',x:77.5,z:860,w:315,d:6},
 {id:'HAWAII-COTTAGE-STREET-960',x:25,z:960,w:130,d:6},
 {id:'HAWAII-EAST-RESORT-STREET',x:235,z:862.5,w:7,d:135},
 {id:'HAWAII-RESORT-PROMENADE',x:150,z:800,w:170,d:5},
 {id:'HAWAII-SOUTH-LOOP',x:150,z:930,w:170,d:7},
 {id:'HAWAII-RESIDENCE-AVENUE',x:132,z:895,w:6,d:70},
 {id:'HAWAII-COVE-ACCESS',x:210,z:884,w:50,d:6},
];

const bridge=(id,x,z,axis,width,motorway=false)=>{
 const direction=(to,offset)=>axis==='z'?{queuePoint:{x:x+to*offset,z:z+to*10},admissionPoint:{x:x+to*offset,z:z-to*10}}:{queuePoint:{x:x+to*10,z:z-to*offset},admissionPoint:{x:x-to*10,z:z-to*offset}};
 const north=direction(1,2.6),hans=direction(-1,2.6);
 return{id,fromCountryId:COUNTRY_IDS.hansdrex,toCountryId:COUNTRY_IDS.north,axis,crossingValue:axis==='z'?z:x,bounds:{x,z,w:axis==='z'?width:24,d:axis==='x'?width:24},queuePoint:north.queuePoint,admissionPoint:north.admissionPoint,modes:motorway?['car','scooter','freight','emergency']:['walk','car','scooter','freight','emergency'],motorway,visaFee:50,directions:{[COUNTRY_IDS.north]:north,[COUNTRY_IDS.hansdrex]:hans},walkDirections:{[COUNTRY_IDS.north]:direction(1,6.2),[COUNTRY_IDS.hansdrex]:direction(-1,6.2)}};
};
export const BORDER_CHECKPOINTS=[bridge('NORTH-CITY-BRIDGE-1',-520,-570,'z',16),bridge('NORTH-CITY-BRIDGE-2',-380,-570,'z',16),bridge('NORTH-CITY-BRIDGE-3',50,-570,'z',16),bridge('NORTH-RIVER-MOTORWAY',-1080,-570,'z',38,true),bridge('RING-NORTH-RIVER',430,-1100,'x',38,true)];
export const COUNTRY_BORDER_PORTS=BORDER_CHECKPOINTS;
export function borderDirection(port,toCountryId,mode='car'){return (mode==='walk'?port.walkDirections:port.directions)?.[toCountryId]||null;}
export const BORDER_CUSTOMS_DECKS=BORDER_CHECKPOINTS.map(p=>({id:`${p.id}-CUSTOMS-DECK`,x:p.bounds.x,z:p.bounds.z,w:p.axis==='z'?(p.motorway?46:24):24,d:p.axis==='x'?(p.motorway?46:24):24}));
// Stable building IDs. West-side booths belong to North, east-side booths to
// Hansdrex, and each footprint sits entirely inside its own country.
export const BORDER_CUSTOMS_BUILDINGS=BORDER_CHECKPOINTS.flatMap(port=>[-1,1].map(side=>{
 const north=side<0,countryId=north?COUNTRY_IDS.north:COUNTRY_IDS.hansdrex;
 const offset=port.motorway?20:10;
 return {
  id:`${port.id}-CUSTOMS-${north?'W':'E'}`,
  name:north?'North City Customs':'Hansdrex Customs',
  x:port.bounds.x+(port.axis==='z'?side*offset:side*8),
  z:port.bounds.z+(port.axis==='x'?side*offset:side*8),
  w:2.4,d:4,h:3,kind:'customs',countryId
 };
}));
