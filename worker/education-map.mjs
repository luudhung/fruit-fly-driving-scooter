// Fixed public campuses, each within walking distance of an existing station.
const school=(id,name,x,z,w,d,h)=>Object.freeze({
 id,name,x,z,w,d,h,kind:'education',usage:'school',facilityType:'school',
 countryId:'hansdrex',district:'main',capacity:30,
});
export const MAIN_SCHOOL_CAMPUSES=Object.freeze([
 school('north-gateway-school','Gateway International School',185,242,22,16,13),
 school('quayside-school','Quayside Community School',-335,14,22,16,12),
 school('south-science-school','South City Science School',-123,242,24,18,14),
 school('east-arts-school','East City Arts School',101,278,24,18,14),
]);
export const MAIN_SCHOOL_IDS=Object.freeze(['school',...MAIN_SCHOOL_CAMPUSES.map(b=>b.id)]);

/** Move the existing campus without replacing its title, damage or projects.
 * Outdoor students and contractors replan from their actual ground position. */
export function relocateGatewaySchool(state){
 if(Number(state.gatewaySchoolRelocationVersion||0)>=1)return {moved:false};
 const campus=MAIN_SCHOOL_CAMPUSES[0],record=state.urbanWorld?.buildings?.[campus.id];
 const previous={x:record?.x??121,z:record?.z??-415};
 if(record){
  Object.assign(record,{x:campus.x,z:campus.z,w:campus.w,d:campus.d});
  if(record.originalBlueprint)Object.assign(record.originalBlueprint,{x:campus.x,z:campus.z,w:campus.w,d:campus.d});
 }
 const projects=new Set();
 for(const project of state.urbanWorld?.projects||[])if(project.buildingId===campus.id){project.x=campus.x;project.z=campus.z;if(!['complete','cancelled'].includes(project.stage))projects.add(project.id);}
 let interiors=0,journeys=0;
 for(const person of [...(state.flies||[]),...(state.cityVisitors?.visitors||[])]){
  if(person.alive===false||person.departed)continue;
  const aboard=person.onTrain||person.onPlane||person.onPrivateHelicopter||person.heliPassenger||person.taxiPassenger||person.onFireEngine||person.onAmbulance;
  if(person.indoors&&!person.traveling&&!aboard&&person.currentLocationId===campus.id){
   person.x=campus.x+Math.max(-campus.w/2,Math.min(campus.w/2,person.x-previous.x));
   person.z=campus.z+Math.max(-campus.d/2,Math.min(campus.d/2,person.z-previous.z));
   person.targetX=person.finalTargetX=person.x;person.targetZ=person.finalTargetZ=person.z;person.movementTrace=[];interiors++;
  }
  if(person.traveling&&person.targetLocationId===campus.id){
   person.relocatedDestinationId=campus.id;person.relocatedDestinationPoint={x:campus.x,z:campus.z+campus.d/2+1.2};journeys++;
  }
  const task=person.urbanTask;
  if(!aboard&&Number(person.y??1.1)<=2&&projects.has(task?.id)&&task.phase!=='collecting'){
   person.traveling=false;person.routeWaypoints=[];person.routeIndex=0;person.vx=person.vz=0;person.actionUntil=0;task.nextRouteAt=0;task.routeFailures=0;
  }
 }
 state.gatewaySchoolRelocationVersion=1;
 state.gatewaySchoolRelocation={at:Number(state.simulationAgeSeconds||0),from:previous,to:{x:campus.x,z:campus.z}};
 return {moved:previous.x!==campus.x||previous.z!==campus.z,interiors,journeys};
}
