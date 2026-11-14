/** Compact canals occupy existing undeveloped corridors; no home parcel moves. */
export function districtRiverTopology(worldHalf=1150){
 const west={id:'west-city-river',name:'Sông thành phố phía Tây',x:-430,z:(worldHalf+2-570)/2,w:20,d:worldHalf+2+570};
 const north={id:'north-city-river',name:'Sông thành phố phía Bắc',x:(430-worldHalf-2)/2,z:-570,w:worldHalf+2+430,d:36};
 const westStreets=[-400,-340,-260,-180,-116,0,116,180,260,340,400];
 const bridges=[
  ...westStreets.map((z,i)=>({id:`WEST-CITY-BRIDGE-${i+1}`,riverId:west.id,x:west.x,z,w:64,d:16,axis:'x',roadWidth:z===400||z===-400?12:9,walkOffset:6.2,from:'west',to:'main'})),
  ...[-520,-380,50].map((x,i)=>({id:`NORTH-CITY-BRIDGE-${i+1}`,riverId:north.id,x,z:north.z,w:16,d:72,axis:'z',roadWidth:9.5,walkOffset:6.2,from:'north',to:x===-520?'west':'main'})),
  {id:'WEST-RIVER-MOTORWAY',riverId:west.id,x:west.x,z:440,w:64,d:38,axis:'x',roadWidth:34,motorway:true,from:'west',to:'main'},
  {id:'NORTH-RIVER-MOTORWAY',riverId:north.id,x:-1080,z:north.z,w:38,d:72,axis:'z',roadWidth:34,motorway:true,from:'north',to:'west'},
 ];
 const promenades=[
  ...[-443,-417].map((x,i)=>({id:`WEST-RIVER-PROMENADE-${i+1}`,riverId:west.id,x,z:(460-549)/2,w:2.4,d:1009})),
  {id:'NORTH-RIVER-NORTH-PROMENADE',riverId:north.id,x:(370-worldHalf+10)/2,z:-591,w:worldHalf+370-10,d:2.4},
  {id:'NORTH-RIVER-SOUTH-WEST-PROMENADE',riverId:north.id,x:(-446-worldHalf+10)/2,z:-549,w:worldHalf-446-10,d:2.4},
  {id:'NORTH-RIVER-SOUTH-MAIN-PROMENADE',riverId:north.id,x:(370-414)/2,z:-549,w:784,d:2.4},
 ];
 const approachRoads=[
  {id:'NORTH-WEST-BRIDGE-AVENUE',x:-520,z:-470,w:9.5,d:260},
  {id:'NORTH-WEST-BRIDGE-CONNECTOR',x:-475,z:-600,w:90,d:9},
  {id:'NORTH-MAIN-WEST-BRIDGE-AVENUE',x:-380,z:-500,w:9.5,d:200},
 ];
 return{rivers:[west,north],bridges,promenades,approachRoads};
}

/** Replace the former canal-axis road with water, leaving only named crossings. */
export function districtRiverRoads(roads,topology){
 const west=topology.rivers[0],result=[];
 const left=west.x-west.w/2-2,right=west.x+west.w/2+2;
 for(const road of roads){
  if(road.d>road.w&&Math.abs(road.x-west.x)<.01){
   const lo=road.z-road.d/2,hi=Math.min(road.z+road.d/2,-594);
   if(hi>lo)result.push({...road,z:(lo+hi)/2,d:hi-lo});
   continue;
  }
  const crosses=road.w>=road.d&&road.z+road.d/2>west.z-west.d/2&&road.x-road.w/2<right&&road.x+road.w/2>left;
  const bridge=topology.bridges.some(b=>b.riverId===west.id&&b.axis==='x'&&Math.abs(b.z-road.z)<.1);
  if(crosses&&!bridge){
   const lo=road.x-road.w/2,hi=road.x+road.w/2;
   if(lo<left)result.push({...road,x:(lo+Math.min(hi,left))/2,w:Math.min(hi,left)-lo});
   if(hi>right)result.push({...road,x:(Math.max(lo,right)+hi)/2,w:hi-Math.max(lo,right)});
  }else result.push(road);
 }
 return[...result,...topology.approachRoads];
}
