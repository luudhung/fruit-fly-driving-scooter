// Append-only public premises, independent of city-map to avoid import cycles.
export const GOVERNMENT_BUILDINGS=[
 {id:'white-house',name:'Hansdrex White House',x:-390,z:-310,w:42,d:22,h:18,kind:'government'},
 {id:'police-hq',name:'Riverside Police Headquarters',x:710,z:-300,w:42,d:32,h:25,kind:'government'},
 {id:'military-base',name:'Riverside Army Barracks',x:710,z:-560,w:98,d:34,h:17,kind:'government'},
 {id:'military-hangar-west',name:'Army Aviation Hangar West',x:625,z:-665,w:42,d:30,h:13,kind:'government'},
 {id:'military-hangar-east',name:'Army Aviation Hangar East',x:795,z:-665,w:42,d:30,h:13,kind:'government'},
];
export const GOVERNMENT_RESERVED=[
 {id:'white-house-gardens',x:-390,z:-306,w:58,d:50},
 {id:'police-courtyard',x:710,z:-300,w:56,d:48},
 {id:'army-grounds',x:710,z:-610,w:260,d:190},
 {id:'army-airfield',x:710,z:-735,w:260,d:26},
];
export const GOVERNMENT_LOCATIONS=[
 ...GOVERNMENT_BUILDINGS.filter(b=>!b.id.startsWith('military-hangar')).map(b=>({id:b.id,name:b.name,x:b.x,z:b.z,type:'government'})),
 {id:'military-drill',name:'Riverside Army Drill Ground',x:710,z:-625,type:'public-duty'},
 {id:'military-airfield',name:'Army Aviation Apron',x:710,z:-690,type:'public-duty'},
];
export const GOVERNMENT_ROADS=[
 {id:'GOVERNMENT-AVENUE',x:680,z:-372.5,w:9.5,d:265},
 {id:'BARRACKS-APPROACH',x:695,z:-505,w:30,d:9},
 {id:'WHITE-HOUSE-ARRIVAL',x:-410,z:-280,w:40,d:8},
];
export const MILITARY_AIRFIELD={runway:{x:710,z:-735,w:240,d:18},taxiwayZ:-709,stands:[{id:'ARMY-STAND-1',x:660,z:-690},{id:'ARMY-STAND-2',x:750,z:-690}]};
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
