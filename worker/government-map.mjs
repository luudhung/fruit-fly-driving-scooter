// Append-only public premises, independent of city-map to avoid import cycles.
export const GOVERNMENT_BUILDINGS=[
 {id:'white-house',name:'Hansdrex White House',x:-390,z:-310,w:42,d:22,h:18,kind:'government'},
 {id:'police-hq',name:'Riverside Police Headquarters',x:710,z:-300,w:42,d:32,h:25,kind:'government'},
 {id:'military-base',name:'Riverside Army Barracks',x:710,z:-560,w:98,d:34,h:17,kind:'government'},
 {id:'military-hangar-west',name:'Army Aviation Hangar West',x:625,z:-665,w:42,d:30,h:13,kind:'government'},
 {id:'military-hangar-east',name:'Army Aviation Hangar East',x:795,z:-665,w:42,d:30,h:13,kind:'government'},
 {id:'naval-command',name:'Riverside Naval Watch',x:502,z:-605,w:12,d:18,h:14,kind:'government'},
];
export const GOVERNMENT_RESERVED=[
 {id:'white-house-gardens',x:-390,z:-306,w:58,d:50},
 {id:'police-courtyard',x:710,z:-300,w:56,d:48},
 {id:'army-grounds',x:710,z:-610,w:260,d:190},
 {id:'army-airfield',x:710,z:-735,w:260,d:26},
 {id:'naval-quay',x:496,z:-595,w:32,d:104},
];
export const GOVERNMENT_LOCATIONS=[
 ...GOVERNMENT_BUILDINGS.filter(b=>!b.id.startsWith('military-hangar')).map(b=>({id:b.id,name:b.name,x:b.x,z:b.z,type:'government'})),
 {id:'military-drill',name:'Riverside Army Drill Ground',x:710,z:-625,type:'public-duty'},
 {id:'military-airfield',name:'Army Aviation Apron',x:710,z:-690,type:'public-duty'},
 {id:'military-naval-dock',name:'Riverside Naval Jetty',x:490,z:-560,type:'public-duty'},
];
export const GOVERNMENT_ROADS=[
 {id:'GOVERNMENT-AVENUE',x:680,z:-372.5,w:9.5,d:265},
 {id:'BARRACKS-APPROACH',x:695,z:-505,w:30,d:9},
 {id:'WHITE-HOUSE-ARRIVAL',x:-410,z:-280,w:40,d:8},
 {id:'NAVAL-ACCESS',x:585,z:-505,w:190,d:8},
 {id:'NAVAL-SHORE',x:490,z:-567.5,w:8,d:125},
];
export const MILITARY_AIRFIELD={runway:{x:710,z:-735,w:240,d:18},taxiwayZ:-709,stands:[{id:'ARMY-STAND-1',x:660,z:-690},{id:'ARMY-STAND-2',x:750,z:-690}]};
// The airfield and garrison share one perimeter. Gates remain permanently open
// for the authoritative walking/vehicle graph; no decorative invisible barrier.
export const MILITARY_COMPOUND={x:710,z:-637.5,w:260,d:245,height:3.2};
export const MILITARY_GATES=[
 {id:'ARMY-MAIN-GATE',x:695,z:-515,w:46,d:1,axis:'x'},
 {id:'ARMY-NAVAL-GATE',x:580,z:-590,w:1,d:16,axis:'z'},
 {id:'ARMY-NAVAL-SOUTH-GATE',x:580,z:-630,w:1,d:16,axis:'z'},
];
export const MILITARY_PERIMETER_WALLS=[];
for(const edge of [{axis:'x',fixed:-760,lo:580,hi:840},{axis:'x',fixed:-515,lo:580,hi:840},{axis:'z',fixed:580,lo:-760,hi:-515},{axis:'z',fixed:840,lo:-760,hi:-515}]){
 const gaps=MILITARY_GATES.filter(g=>g.axis===edge.axis&&(edge.axis==='x'?g.z:g.x)===edge.fixed).map(g=>({lo:(edge.axis==='x'?g.x-g.w/2:g.z-g.d/2),hi:(edge.axis==='x'?g.x+g.w/2:g.z+g.d/2)})).sort((a,b)=>a.lo-b.lo);
 let cursor=edge.lo;
 for(const gap of [...gaps,{lo:edge.hi,hi:edge.hi}]){
  if(gap.lo>cursor)MILITARY_PERIMETER_WALLS.push({id:`ARMY-WALL-${MILITARY_PERIMETER_WALLS.length+1}`,x:edge.axis==='x'?(cursor+gap.lo)/2:edge.fixed,z:edge.axis==='z'?(cursor+gap.lo)/2:edge.fixed,w:edge.axis==='x'?gap.lo-cursor:1,d:edge.axis==='z'?gap.lo-cursor:1,h:MILITARY_COMPOUND.height});
  cursor=gap.hi;
 }
}
export function militaryPerimeterBlocked(p,margin=.45){
 if(Math.abs(p.x-MILITARY_COMPOUND.x)>MILITARY_COMPOUND.w/2+margin+.5||Math.abs(p.z-MILITARY_COMPOUND.z)>MILITARY_COMPOUND.d/2+margin+.5||Number(p.y??1.1)>MILITARY_COMPOUND.height+.8)return false;
 return MILITARY_PERIMETER_WALLS.some(r=>Math.abs(p.x-r.x)<=r.w/2+margin&&Math.abs(p.z-r.z)<=r.d/2+margin);
}
/** Fixed river berths leave the navigable western channel open. Access stays on
 * the European bank; the jetty and short gangways cross the water to each hull. */
export const MILITARY_NAVAL_BASE={
 dock:{x:490,z:-595,w:12,d:84},
 berths:[{id:'ARMY-PATROL-1',x:458,z:-560,heading:0},{id:'ARMY-PATROL-2',x:458,z:-630,heading:0}],
 access:{x:490,z:-505},
 range:{x:800,z:-590,w:32,d:26},
};
export const PUBLIC_SERVICE_TARGETS={army:50,police:28};
const mix=(a,b,t)=>a+(b-a)*t;
/** A private, noncombat training circuit uses its own runway and timing. */
export function militaryAircraftPose(now,aircraft){
 const stand=MILITARY_AIRFIELD.stands.find(p=>p.id===aircraft.standId)||MILITARY_AIRFIELD.stands[0];
 const flight=aircraft.flight;
 if(!flight||now<flight.departure||now>=flight.arrival)return{x:stand.x,y:2.4,z:stand.z,heading:Math.PI,phase:'parked'};
 const duration=flight.arrival-flight.departure,elapsed=Math.max(0,Math.min(duration,now-flight.departure));
 const nodes=[
  [0,stand.x,2.4,stand.z],[.08,stand.x,2.4,-709],[.17,600,2.4,-709],
  [.22,600,2.4,-735],[.31,820,4,-735],[.42,985,105,-850],
  [.55,975,170,-1005],[.67,675,175,-1030],[.78,535,105,-860],
  [.89,600,2.4,-735],[.94,stand.x,2.4,-735],[.97,stand.x,2.4,-709],[1,stand.x,2.4,stand.z],
 ];
 const u=elapsed/Math.max(1,duration),index=Math.max(0,nodes.findIndex(p=>p[0]>u)-1),a=nodes[index],b=nodes[index+1]||nodes[index],t=(u-a[0])/Math.max(.0001,b[0]-a[0]);
 return{x:mix(a[1],b[1],t),y:mix(a[2],b[2],t),z:mix(a[3],b[3],t),heading:Math.atan2(b[1]-a[1],b[3]-a[3]),phase:index<3?'taxi-out':index===3?'takeoff':index<8?'training-flight':index===8?'landing':'taxi-in'};
}
