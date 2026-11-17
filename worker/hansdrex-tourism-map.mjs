import {COUNTRY_IDS,countryAt} from './country-map.mjs';

const formats=[
 {kind:'food',label:'Neighborhood Kitchen',price:12,color:0x963c2e},
 {kind:'retail',label:'City Market Shop',price:14,color:0x32675b},
 {kind:'entertainment',label:'Street Arcade',price:11,color:0x724875},
 {kind:'experience',label:'Local Gallery',price:9,color:0x414e76},
 {kind:'food',label:'Corner Deli',price:10,color:0xa06f39},
 {kind:'retail',label:'Independent Bookshop',price:14,color:0x356575},
];
const riversideFormats=[
 {kind:'food',label:'Riverside Brasserie',price:17,color:0x683f38},
 {kind:'food',label:'Riverside Pâtisserie',price:13,color:0x53746a},
 {kind:'food',label:'Riverbank Bistro',price:15,color:0x955235},
];
function stableHash(value){
 let hash=2166136261;
 for(const c of value)hash=Math.imul(hash^c.charCodeAt(0),16777619);
 return hash>>>0;
}
const within=(rect,x,z,margin=0)=>Math.abs(x-rect.x)<rect.w/2+margin&&Math.abs(z-rect.z)<rect.d/2+margin;

function frontage(building,roads,obstacles){
 let best=null,fallback=null;
 const {x,z,w,d}=building;
 for(const [axis,side,depth,span] of [['z',1,d,w],['z',-1,d,w],['x',1,w,d],['x',-1,w,d]]){
  const doorway={x:x+(axis==='x'?side*(depth/2+1.15):0),z:z+(axis==='z'?side*(depth/2+1.15):0)};
  if(obstacles.some(r=>r!==building&&within(r,doorway.x,doorway.z,.45)))continue;
  const frontage={...doorway,axis,side,span,depth};
  fallback ||= frontage;
  for(const road of roads){
   const across=axis==='x'?road.x-x:road.z-z;
   const along=axis==='x'?road.z-z:road.x-x;
   const roadWidth=axis==='x'?road.w:road.d,roadLength=axis==='x'?road.d:road.w;
   if(roadLength<roadWidth||Math.abs(along)>roadLength/2||across*side<=0)continue;
   const distance=Math.abs(across)-roadWidth/2-depth/2;
   if(distance<.75||distance>24||best&&distance>=best.distance)continue;
   const blocked=[.25,.5,.75].some(t=>{
    const offset=side*(depth/2+distance*t);
    return obstacles.some(r=>r!==building&&within(r,x+(axis==='x'?offset:0),z+(axis==='z'?offset:0),.2));
   });
   if(!blocked)best={...frontage,distance};
  }
 }
 return best||fallback;
}

/** Existing buildings supply mixed-use frontages without changing lot boundaries. */
export function buildHansdrexTourismMap(buildings,roads,water,tower){
 const localRoads=roads.filter(r=>!r.motorway&&!r.motorwayAccess);
 const obstacles=[...buildings,...water];
 const storefronts=[];
 for(const building of buildings){
  const {id,x,z,h,w,d,kind}=building;
  if(countryAt(building)!==COUNTRY_IDS.hansdrex||!['block','apartment'].includes(kind)||h<10||Math.min(w,d)<7)continue;
  const hash=stableHash(id),europe=x>480&&x<880&&Math.abs(z)<260;
  if(hash%10>=7)continue;
  const front=frontage(building,localRoads,obstacles);
  if(!front)continue;
  const options=europe?riversideFormats:formats,format=options[(hash>>>8)%options.length];
  storefronts.push({...format,...front,buildingId:id,id:`streetfront:${id}`,type:'storefront',name:format.label,europe,buildingX:x,buildingZ:z});
 }
 const towerSite=buildings.find(site=>site.id==='toronto');
 const observation={id:'tower-observation',type:'attraction',name:'Hansdrex Tower Observation Deck',x:tower.x,z:tower.z+(towerSite?.d??12)/2+1.25,deck:{x:tower.x,z:tower.z,y:156}};
 return {storefronts,observation};
}
