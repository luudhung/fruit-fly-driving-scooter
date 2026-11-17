// One physical airport layout for country admissions, dispatch and the viewer.
// Both landing strips remain south of the international river; only aircraft
// using the northern strip need the end-around taxi bypass.
const runways=[
 {id:'HCA-09L',x:-180,z:-520,w:320,d:22,taxiwayZ:-470,taxiBypassX:[-355,-5],endAroundTaxi:true},
 {id:'HCA-09R',x:-180,z:-492,w:320,d:22,taxiwayZ:-470,taxiBypassX:[-355,-5],endAroundTaxi:false},
];
const stands=Array.from({length:8},(_,i)=>({id:`INTL-${i+1}`,x:-270+i*30,z:-443}));
export const HANSDREX_AIRPORT={
 terminal:{x:-180,z:-390,w:60,d:20},gate:{x:-180,z:-378},
 runway:runways[0],runways,stands,apron:{x:-165,z:-443,w:250,d:65},
 taxiwayZ:-470,taxiBypassX:[-355,-5],
 taxiways:[
  {id:'HCA-TAXI-APRON',x:-180,z:-470,w:360,d:12},
  {id:'HCA-TAXI-WEST',x:-355,z:-495,w:10,d:50},
  {id:'HCA-TAXI-EAST',x:-5,z:-495,w:10,d:50},
  {id:'HCA-TAXI-SECONDARY-WEST',x:-316,z:-481,w:10,d:22},
  {id:'HCA-TAXI-SECONDARY-EAST',x:-44,z:-481,w:10,d:22},
 ],
 controlTower:{x:-350,z:-431,w:14,d:14,h:30},
 hangar:{x:-310,z:-441,w:46,d:32,h:13},
 helipad:{x:-10,z:-436,y:1},heliAccess:{x:-10,z:-373},
};

/** The control tower moved to free the passenger concourse. Preserve damage,
 * contractors and ownership when an existing city's buildings override the map. */
export function relocateHansdrexAirport(state){
 if(Number(state.hansdrexAirportLayoutVersion||0)>=1)return false;
 for(const [id,base]of [['airport-control-tower',HANSDREX_AIRPORT.controlTower],['airport-hangar',HANSDREX_AIRPORT.hangar]]){
  const record=state.urbanWorld?.buildings?.[id];if(!record)continue;
  Object.assign(record,{x:base.x,z:base.z,w:base.w,d:base.d});
  if(record.originalBlueprint)Object.assign(record.originalBlueprint,{x:base.x,z:base.z,w:base.w,d:base.d});
  for(const project of state.urbanWorld?.projects||[]){
   if(project.buildingId!==id||['complete','cancelled'].includes(project.stage))continue;
   if(project.kind!=='new')project.targetHeight=Number(record.originalHeight||base.h);
   // A ground contractor replans from its real position. A passenger keeps its
   // current rail/air ride and can replan after arrival; nobody is teleported.
   for(const person of state.flies||[]){
    const task=person.urbanTask;if(task?.id!==project.id||task.phase==='collecting'||person.onTrain||person.onPlane)continue;
    person.traveling=false;person.routeWaypoints=[];person.vx=person.vz=0;person.actionUntil=0;task.nextRouteAt=0;task.routeFailures=0;
   }
  }
 }
 state.hansdrexAirportLayoutVersion=1;return true;
}
