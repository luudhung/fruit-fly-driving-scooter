import {LOCATIONS,BUILDINGS,entrance,pedestrianRoute,parkingPoint,clearSegment,PARKING_SPACES} from './city-map.mjs';
import {createVehicleIndex} from './traffic.mjs';
import {motorwaySpeedMultiplier} from './motorway.mjs';
export const EMERGENCY_RULES={engines:3,ambulances:2,firefighters:9,paramedics:6,speed:22,crewPerEngine:3,crewPerAmbulance:2};
const DAY=86400,dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),loc=id=>LOCATIONS.find(l=>l.id===id);
const essential=new Set(['doctor','school','police','power','power-evening','power-night','grid-dispatch','hospital-central','hospital-east']);
const cap=(n,min=0,max=100)=>Math.max(min,Math.min(max,Number(n)||0));
const busy=f=>f.fireEngineDuty||f.ambulanceDuty||f.urbanTask||f.civicDuty||f.cityService||f.taxiJobId||f.taxiPassenger||f.privateFlight||f.onPrivateHelicopter||f.sportsSession||f.airTrip||f.onPlane||f.onTrain||f.heliPassenger||f.arrested;
/** Bounded public fleets. The server persists routes/tasks; the browser alone animates vehicles/lights. */
export function createFireService({world,emit=()=>{},remember=()=>{},startJourney,moveFly,needsAndActivities=()=>{},payAndFinance=()=>{}}){
 const raw=()=>world(),now=()=>Number(raw().simulationAgeSeconds||0),enabled=()=>Boolean(raw().emergencyServicesEnabled&&loc('firestation'));
 const people=()=>[...(raw().flies||[]),...(raw().cityVisitors?.visitors||[]).filter(f=>f.alive&&!f.departed)];
 const actor=id=>(raw().flies||[]).find(f=>f.id===id)||(raw().cityVisitors?.visitors||[]).find(f=>f.id===id),alive=id=>{const f=actor(id);return f?.alive?f:null;};
 const fires=()=>raw().urbanWorld?.fires||[];
 function data(){raw().urbanWorld||={};return raw().urbanWorld.fireService||={version:1,engines:[],ambulances:[],roster:[],nextRecruitAt:0,nextMedicalCheckAt:0,nextCall:1,dispatches:0,medicalDispatches:0,hospitalDeliveries:0,returns:0,operatingCosts:0,history:[]};}
 const fleet=()=>[...data().engines,...data().ambulances];
 function stationExit(engine){if(engine.kind==='fire')return{x:850,z:-208+engine.bay*8};const home=loc(engine.homeLocationId)||loc('hospital-central');return parkingPoint(home)||entrance(home);}
 function garage(engine){return engine.kind==='fire'?{x:830,z:-208+engine.bay*8}:engine.home;}
 function pickupLocation(engine,p){const id=`EMERGENCY-PICKUP-${engine.id}`;let l=loc(id);if(!l){l={id,type:'emergency-access',name:engine.kind==='fire'?'Fire engine pickup':'Ambulance pickup',x:p.x,z:p.z};LOCATIONS.push(l);}else Object.assign(l,{x:p.x,z:p.z});return l;}
 function init(){
  const d=data();d.roster||=[];d.history||=[];d.engines||=[];d.ambulances||=[];
  if(!enabled())return d;
  raw().businesses||={};raw().businesses['emergency-operations']||={cash:0,inventory:0,sector:'emergency-services'};
  if(!d.engines.length)for(let i=0;i<EMERGENCY_RULES.engines;i++)d.engines.push({id:`FIRE-ENGINE-${i+1}`,kind:'fire',phase:'idle',homeLocationId:'firestation',bay:i,x:830,y:1.1,z:-208+i*8,heading:Math.PI/2,crewIds:[],route:[],routeIndex:0,completedTrips:0,fuel:100});
  if(!d.ambulances.length){const occupied=new Set();for(let i=0;i<EMERGENCY_RULES.ambulances;i++){const id=i?'riverside-clinic':'hospital-central',home=parkingPoint(loc(id)||loc('hospital-central'),occupied)||entrance(loc(id)||loc('hospital-central'));if(home.spaceId)occupied.add(home.spaceId);d.ambulances.push({id:`AMBULANCE-${i+1}`,kind:'ambulance',phase:'idle',homeLocationId:id,bay:i,home:{x:home.x,z:home.z},x:home.x,y:1.1,z:home.z,heading:home.heading||0,crewIds:[],route:[],routeIndex:0,completedTrips:0,fuel:100});}}
  for(const vehicle of fleet()){
   vehicle.crewIds||=[];vehicle.route||=[];if(vehicle.pickup)pickupLocation(vehicle,vehicle.pickup);
   for(const id of vehicle.crewIds){const f=alive(id);if(!f)continue;if(!f.fireEngineDuty){f.fireEngineDuty={vehicleId:vehicle.id,kind:vehicle.kind,phase:vehicle.phase};if(['pullout','enroute','returning','pullin','hospital'].includes(vehicle.phase))f.onFireEngine=vehicle.kind==='fire',f.onAmbulance=vehicle.kind==='ambulance';}}
  }
  recruit(!d.rosterInitialized);d.rosterInitialized=true;return d;
 }
 function recruit(force=false){
  const d=data();if(!force&&now()<d.nextRecruitAt)return;d.nextRecruitAt=now()+3600;
  d.roster=d.roster.filter(id=>{const f=alive(id);return f&&f.ageYears>=18&&f.ageYears<76&&['firefighter','paramedic'].includes(f.jobId);});
  for(const [role,target]of [['firefighter',EMERGENCY_RULES.firefighters],['paramedic',EMERGENCY_RULES.paramedics]]){
   for(const f of raw().flies||[])if(f.alive&&f.jobId===role&&f.ageYears>=18&&f.ageYears<76&&!d.roster.includes(f.id))d.roster.push(f.id);
   const current=()=>d.roster.filter(id=>alive(id)?.jobId===role).length;
   const candidates=(raw().flies||[]).filter(f=>f.alive&&f.ageYears>=21&&f.ageYears<66&&f.health>60&&!busy(f)&&!d.roster.includes(f.id)&&!essential.has(f.jobId)&&!f.businessId&&!f.businessEmployeeOf).sort((a,b)=>Number(Boolean(a.jobId))-Number(Boolean(b.jobId))||Number(b.professionSkills?.emergencyCare||b.professionSkills?.fireSafety||0)-Number(a.professionSkills?.emergencyCare||a.professionSkills?.fireSafety||0)||a.id.localeCompare(b.id));
   for(const f of candidates){if(current()>=target)break;const index=current();f.jobId=role;f.jobTitle=role==='firefighter'?'firefighter':'paramedic';f.wage=4.8;f.preferredWorkStart=(index%3)*8;f.preferredWorkHours=8;f.emergencyStationId=role==='firefighter'?'firestation':index%2?'riverside-clinic':'hospital-central';f.professionSkills||={};f.professionSkills[role==='firefighter'?'fireSafety':'emergencyCare']=Math.max(.7,Number(f.professionSkills[role==='firefighter'?'fireSafety':'emergencyCare']||0));d.roster.push(f.id);remember(f,'emergency_service_job',{role,stationId:f.emergencyStationId});emit('emergency_hire',`${f.id} joined the public ${role==='firefighter'?'fire brigade':'ambulance service'}.`,{flyId:f.id,role});}
  }
 }
 function onShift(f,hour){return ((hour-Number(f.preferredWorkStart||0)+24)%24)<8;}
 function atGarage(f,e){const home=loc(e.homeLocationId);return f&&!f.traveling&&home&&dist(f,home)<32;}
 function staff(engine,clock){
  const role=engine.kind==='fire'?'firefighter':'paramedic',home=loc(engine.homeLocationId);
  return data().roster.map(alive).filter(f=>f&&f.jobId===role&&!busy(f)&&f.health>40&&f.energy>12&&f.hunger<88)
   .sort((a,b)=>Number(atGarage(b,engine))-Number(atGarage(a,engine))||dist(a,home)-dist(b,home)||Number(onShift(b,clock.hour))-Number(onShift(a,clock.hour)));
 }
 function driveAccess(from,target){
  const first=parkingPoint(target);if(!first)return null;
  const best=[first];
  for(const curb of PARKING_SPACES){
   const distance=dist(curb,target);if(curb.id===first.id||distance>Math.max(50,dist(first,target)+28))continue;
   let i=best.length;while(i>1&&distance<dist(best[i-1],target))i--;
   if(i<8){best.splice(i,0,curb);if(best.length>8)best.pop();}
  }
  for(const curb of best){
   const route=pedestrianRoute(from,curb,'car');
   if(route.length&&route.every((p,i)=>clearSegment(i?route[i-1]:from,p))&&pedestrianRoute(curb,target).length)return {curb,route};
  }
  return null;
 }
 function duty(f,e,phase){f.fireEngineDuty={vehicleId:e.id,kind:e.kind,phase};f.roadDuty=false;f.mobilityShopping=false;f.sleeping=false;f.actionUntil=0;}
 function releaseCrew(f,e){if(!f||f.fireEngineDuty?.vehicleId!==e.id)return;f.fireEngineDuty=null;f.onFireEngine=false;f.onAmbulance=false;if(f.urbanTask?.engineId===e.id)f.urbanTask=null;f.traveling=false;f.routeWaypoints=[];f.vx=f.vz=0;f.actionUntil=now()+600;f.action='returned from an emergency response';}
 function requestJourney(f,id,action,mode){
  if(startJourney){startJourney(f,{id,action,mode});return;}
  const p=loc(id);if(!p)return;f.routeWaypoints=pedestrianRoute(f,p);f.routeIndex=0;f.targetLocationId=id;f.traveling=Boolean(f.routeWaypoints.length);f.action=action;
 }
 function startLoading(e,crew){
  e.crewIds=crew.map(f=>f.id);e.phase='loading';e.loadStartedAt=now();e.loadDeadlineAt=now()+(e.kind==='fire'?3600:6*3600);e.lastAt=now();e.retryRouteAt=0;e.blocked=false;
  for(const f of crew){
   duty(f,e,'gathering');if(e.kind==='fire')f.urbanTask={type:'fire',id:e.incidentId,targetId:`CIVIC-FIRE-${e.incidentId}`,engineId:e.id};
   if(!atGarage(f,e)&&!(f.traveling&&f.targetLocationId===e.homeLocationId))requestJourney(f,e.homeLocationId,e.kind==='fire'?'reporting to the fire engine garage':'reporting to the ambulance station');
  }
 }
 function dispatchFire(fire,clock){
  if(!enabled()||!fire?.detected||fire.containedAt||fire.engineId||now()<Number(fire.nextDispatchAt||0))return null;
  const engines=data().engines.filter(v=>v.phase==='idle');if(!engines.length)return null;
  const target=loc(`CIVIC-FIRE-${fire.id}`)||BUILDINGS.find(b=>b.id===fire.buildingId);if(!target)return null;
  fire.nextDispatchAt=now()+600;
  for(const e of engines){
   const candidates=staff(e,clock).slice(0,EMERGENCY_RULES.crewPerEngine);if(!candidates.length)return null;
   const ready=candidates.filter(f=>atGarage(f,e)),crew=ready.length>=2?ready:candidates;
   const access=driveAccess(stationExit(e),target);if(!access)continue;
   const {curb,route}=access;
   Object.assign(e,{incidentId:fire.id,patientId:null,destination:{x:curb.x,z:curb.z},pickup:{x:curb.x,z:curb.z},outboundRoute:route,paidForCall:false,callId:`FIRE-CALL-${fire.id}`});pickupLocation(e,curb);
   fire.engineId=e.id;fire.teamIds=crew.map(f=>f.id);startLoading(e,crew);data().dispatches++;emit('fire_engine_dispatch',`${e.id} was assigned to ${fire.buildingId}; its crew is gathering at the garage.`,{engineId:e.id,fireId:fire.id,crewIds:e.crewIds});return e;
  }
  return null;
 }
 function medicalCandidates(){return people().filter(f=>f.alive&&f.health>0&&f.health<38&&!f.ambulanceDuty&&!f.fireEngineDuty&&!f.onPlane&&!f.onTrain&&!f.privateFlight&&!f.heliPassenger&&!f.cityService&&!f.taxiPassenger&&!f.arrested&&Number(f.nextAmbulanceCallAt||0)<=now()&&!['hospital-central','hospital-east','riverside-clinic'].includes(f.currentLocationId)).sort((a,b)=>a.health-b.health||a.id.localeCompare(b.id));}
 function dispatchAmbulance(patient,clock){
  if(!enabled()||!patient?.alive||patient.health<=0||patient.ambulanceDuty||patient.onPlane||patient.onTrain||patient.cityService)return null;
  const e=data().ambulances.filter(v=>v.phase==='idle').sort((a,b)=>dist(a,patient)-dist(b,patient))[0];if(!e)return null;
  const crew=staff(e,clock).slice(0,EMERGENCY_RULES.crewPerAmbulance);if(!crew.length)return null;const curb=parkingPoint(patient);if(!curb)return null;
  const route=pedestrianRoute(stationExit(e),curb,'car');if(!route.length)return null;
  const callId=`MEDICAL-${data().nextCall++}`;Object.assign(e,{incidentId:null,patientId:patient.id,pickup:{x:curb.x,z:curb.z},destination:{x:curb.x,z:curb.z},outboundRoute:route,callId,paidForCall:false});pickupLocation(e,curb);
  patient.ambulanceDuty={vehicleId:e.id,phase:'waiting',calledAt:now()};patient.onAmbulance=false;patient.traveling=false;patient.routeWaypoints=[];patient.onTrain=false;patient.sleeping=false;patient.action='waiting for the ambulance';patient.actionUntil=0;patient.nextAmbulanceCallAt=now()+DAY;
  startLoading(e,crew,clock);data().medicalDispatches++;emit('ambulance_dispatch',`${e.id} was dispatched for ${patient.id}.`,{ambulanceId:e.id,patientId:patient.id,crewIds:e.crewIds});return e;
 }
 function payOperatingCost(e){
  if(e.paidForCall)return true;const account=raw().businesses['emergency-operations'],refill=Number(e.fuel||0)<5,cost=(e.kind==='fire'?6:4)+Number(e.operatingDebt||0)+(refill?20:0);
  const available=Math.max(0,Number(raw().treasury?.cash||0));if(refill&&available<cost){e.delayReason='awaiting public fuel funding';return false;}
  const paid=Math.min(cost,available);if(paid>0){raw().treasury.cash-=paid;account.cash+=paid;raw().totalTransactions=Number(raw().totalTransactions||0)+1;data().operatingCosts+=paid;}
  e.operatingDebt=Math.max(0,cost-paid);e.paidForCall=true;e.fuel=Math.max(0,(refill?100:Number(e.fuel||100))-5);e.delayReason=null;return true;
 }
 function setRoute(e,route,phase){e.alive=true;e.emergency=true;e.signalPermit=true;e.speed=EMERGENCY_RULES.speed;e.transitMode='car';e.route=route;e.routeIndex=0;e.phase=phase;e.traveling=Boolean(route.length);e.targetX=route[0]?.x??e.x;e.targetZ=route[0]?.z??e.z;e.blocked=false;e.lastRouteAt=now();e.lastProgressAt=now();e.retryRouteAt=0;}
 function moveVehicle(e,dt,index){
  if(!e.route?.length)return true;let time=Math.max(0,dt)/Math.max(1,Number(raw().timeScale||120));e.blocked=false;
  for(let hop=0;hop<64&&time>1e-6;hop++){
   const p=e.route[e.routeIndex];if(!p){e.traveling=false;return true;}const dx=p.x-e.x,dz=p.z-e.z,len=Math.hypot(dx,dz);e.targetX=p.x;e.targetZ=p.z;
   if(len<.05){e.x=p.x;e.z=p.z;e.y=p.y??1.1;e.routeIndex++;continue;}
   const speed=EMERGENCY_RULES.speed*motorwaySpeedMultiplier(e);e.speed=speed;
   let step=Math.min(len,time*speed);const ux=dx/len,uz=dz/len;
   if(index){const limit=index({...e,alive:true,traveling:true,transitMode:'car'},{x:e.x+ux*step,z:e.z+uz*step});if(limit<step){step=limit;e.blocked=true;}}
   const target={x:e.x+ux*step,z:e.z+uz*step};if(!clearSegment(e,target)){e.blocked=true;break;}
   e.heading=Math.atan2(dx,dz);e.x=target.x;e.z=target.z;e.y+=(Number(p.y??1.1)-Number(e.y||1.1))*Math.min(1,step/len);time-=step/speed;if(e.blocked)break;if(step>=len-.001)e.routeIndex++;
  }
  e.traveling=e.routeIndex<e.route.length;return !e.traveling;
 }
 function placeRiders(e){for(const id of e.crewIds){const f=alive(id);if(!f)continue;Object.assign(f,{x:e.x,y:e.y,z:e.z,vx:0,vz:0,traveling:false,indoors:false,onFireEngine:e.kind==='fire',onAmbulance:e.kind==='ambulance',transitMode:e.kind==='fire'?'fire-engine':'ambulance'});duty(f,e,'riding');}const p=alive(e.patientId);if(p?.onAmbulance)Object.assign(p,{x:e.x,y:e.y,z:e.z,vx:0,vz:0,traveling:false,indoors:false,transitMode:'ambulance'});}
 function board(e,ids){for(const id of ids){const f=alive(id);if(!f)continue;f.onFireEngine=e.kind==='fire';f.onAmbulance=e.kind==='ambulance';f.traveling=false;f.routeWaypoints=[];duty(f,e,'riding');}placeRiders(e);}
 function gatherForReturn(e){
  const point=e.pickup||{x:e.x,z:e.z};pickupLocation(e,point);e.phase='gathering-return';e.gatherStartedAt=now();
  for(const id of e.crewIds){const f=alive(id);if(!f)continue;f.onFireEngine=false;f.onAmbulance=false;f.urbanTask=null;duty(f,e,'gathering-return');requestJourney(f,`EMERGENCY-PICKUP-${e.id}`,'returning to the emergency vehicle','walk');}
 }
 function returnRoute(e){if(e.retryRouteAt>now())return false;const home=stationExit(e);if(dist(e,home)<.6){if(e.kind==='fire'){e.phase='pullin';e.phaseStartedAt=now();}else finishReturn(e);return true;}const route=pedestrianRoute(e,home,'car');if(!route.length){e.blocked=true;e.phase='awaiting-route';e.traveling=false;e.retryRouteAt=now()+600;return false;}setRoute(e,route,'returning');return true;}
 function clearPatient(e,reason='cancelled'){const p=actor(e.patientId);if(p?.ambulanceDuty?.vehicleId===e.id){p.ambulanceDuty=null;p.onAmbulance=false;p.actionUntil=now()+600;p.nextAmbulanceCallAt=Math.max(Number(p.nextAmbulanceCallAt||0),now()+3600);p.action=reason;}e.patientId=null;}
 function finishReturn(e){
  const home=garage(e);Object.assign(e,{x:home.x,z:home.z,y:1.1,phase:'idle',traveling:false,route:[],routeIndex:0,heading:e.kind==='fire'?Math.PI/2:0,emergency:false,completedTrips:Number(e.completedTrips||0)+1});
  for(const id of e.crewIds){const f=alive(id);if(!f)continue;Object.assign(f,{x:loc(e.homeLocationId)?.x??home.x,z:loc(e.homeLocationId)?.z??home.z,y:1.1,currentLocationId:e.homeLocationId,targetLocationId:e.homeLocationId,indoors:true});releaseCrew(f,e);remember(f,'emergency_response_return',{vehicleId:e.id,callId:e.callId});}
  data().returns++;data().history.push({id:e.callId,kind:e.kind,vehicleId:e.id,returnedAt:now()});data().history=data().history.slice(-24);clearPatient(e,'arrived at hospital');e.crewIds=[];e.incidentId=null;e.callId=null;e.destination=null;e.pickup=null;e.paidForCall=false;
 }
 function nearestHospital(p){return ['hospital-central','hospital-east','riverside-clinic'].map(loc).filter(l=>l&&!raw().urbanWorld?.fires?.some(f=>f.buildingId===l.id&&!f.containedAt)&&(!raw().urbanWorld?.buildings?.[l.id]||raw().urbanWorld.buildings[l.id].stage==='operational')).sort((a,b)=>dist(a,p)-dist(b,p))[0];}
 function beginHospital(e){if(e.retryRouteAt>now())return;const p=alive(e.patientId),hospital=p&&nearestHospital(p);if(!p||!hospital){clearPatient(e,'medical transport unavailable');returnRoute(e);return;}
  const curb=parkingPoint(hospital),route=curb&&pedestrianRoute(e,curb,'car');if(!route?.length){e.blocked=true;e.retryRouteAt=now()+600;return;}
  p.onAmbulance=true;p.ambulanceDuty.phase='riding';p.traveling=false;p.routeWaypoints=[];p.indoors=false;e.hospitalId=hospital.id;e.hospitalCurb=curb;setRoute(e,route,'hospital');placeRiders(e);
 }
 function releaseFireDispatch(e){
  const fire=fires().find(f=>f.id===e.incidentId);
  if(fire?.engineId===e.id){fire.engineId=null;fire.teamIds=[];fire.nextDispatchAt=now()+300;}
 }
 function resetLoading(e,reason){
  for(const id of e.crewIds)releaseCrew(alive(id),e);
  if(e.kind==='fire')releaseFireDispatch(e);else clearPatient(e,reason);
  Object.assign(e,{phase:'idle',crewIds:[],incidentId:null,callId:null,destination:null,pickup:null,outboundRoute:[],blocked:false,traveling:false});
 }
 function recoverVehicleRoute(e,phase){
  if(now()<Number(e.retryRouteAt||0))return;
  e.retryRouteAt=now()+600;
  const remaining=e.route.slice(e.routeIndex),blocked=remaining.some((p,i)=>!clearSegment(i?remaining[i-1]:e,p));
  // Leave short queues to the traffic simulation. Replan when the road actually
  // closes or a queue hasn't moved for an extended time.
  if(!blocked&&now()-e.lastProgressAt<3600)return;
  if(phase==='returning'){
   const route=pedestrianRoute(e,stationExit(e),'car');if(route.length&&route.every((p,i)=>clearSegment(i?route[i-1]:e,p)))setRoute(e,route,phase);
   return;
  }
  const target=phase==='hospital'?loc(e.hospitalId):e.kind==='fire'?loc(`CIVIC-FIRE-${e.incidentId}`):alive(e.patientId);
  if(!target)return;
  const access=driveAccess(e,target);if(!access)return;
  const {curb,route}=access;
  if(phase==='hospital')e.hospitalCurb=curb;
  else{e.pickup=e.destination={x:curb.x,z:curb.z};pickupLocation(e,curb);}
  setRoute(e,route,phase);
 }
 function tickVehicle(e,dt,clock,index){
  e.crewIds=e.crewIds.filter(id=>alive(id));
  if(e.phase==='idle')return;
  if(!e.crewIds.length){if(e.phase==='loading'){resetLoading(e,'ambulance crew unavailable');return;}if(e.phase!=='awaiting-relief'){e.phase='awaiting-relief';e.traveling=false;e.route=[];if(e.kind==='fire')releaseFireDispatch(e);else clearPatient(e,'ambulance crew unavailable');}const relief=staff(e,clock)[0];if(relief){e.crewIds=[relief.id];pickupLocation(e,e);e.pickup={x:e.x,z:e.z};duty(relief,e,'gathering-return');requestJourney(relief,`EMERGENCY-PICKUP-${e.id}`,'relieving an emergency vehicle');e.phase='gathering-return';e.gatherStartedAt=now();}return;}
  if(e.kind==='ambulance'&&e.patientId&&!alive(e.patientId)){clearPatient(e,'patient unavailable');if(e.phase==='loading'){for(const id of e.crewIds)releaseCrew(alive(id),e);e.crewIds=[];e.phase='idle';return;}if(!['returning','pullin','gathering-return'].includes(e.phase))returnRoute(e);}
  if(e.phase==='loading'){
   const fire=e.kind==='fire'?fires().find(f=>f.id===e.incidentId):null;
   if(e.kind==='fire'&&(!fire||fire.containedAt)){resetLoading(e);return;}
   const arrived=e.crewIds.filter(id=>atGarage(alive(id),e));
   const waited=now()-Number(e.loadStartedAt||0),expired=now()>=e.loadDeadlineAt||(e.kind==='fire'&&waited>=3600);
   if(arrived.length&&(arrived.length===e.crewIds.length||expired||(e.kind==='fire'&&waited>=360))){
    if(!payOperatingCost(e))return;
    for(const id of e.crewIds)if(!arrived.includes(id))releaseCrew(alive(id),e);
    e.crewIds=arrived;if(fire)fire.teamIds=[...arrived];board(e,arrived);e.phase=e.kind==='fire'?'pullout':'enroute';e.phaseStartedAt=now();
    if(e.kind==='ambulance')setRoute(e,e.outboundRoute,'enroute');
   }else if(expired)resetLoading(e,'ambulance crew was delayed');
   else if(waited>=600)for(const id of e.crewIds){
    const f=alive(id);if(f&&!atGarage(f,e)&&!f.traveling&&now()>=Number(f.fireEngineDuty?.retryAt||0)){
     f.fireEngineDuty.retryAt=now()+600;requestJourney(f,e.homeLocationId,'reporting to the emergency garage',dist(f,loc(e.homeLocationId))<85?'walk':undefined);
    }
   }
   return;
  }
  if(e.phase==='pullout'){
   const a=garage(e),b=stationExit(e),u=cap((now()-e.phaseStartedAt)/300,0,1);e.x=a.x+(b.x-a.x)*u;e.z=a.z+(b.z-a.z)*u;e.y=1.1;e.heading=Math.PI/2;placeRiders(e);if(u>=1)setRoute(e,e.outboundRoute,'enroute');return;
  }
  if(['enroute','returning','hospital'].includes(e.phase)){
   const phase=e.phase,x=e.x,z=e.z,arrived=moveVehicle(e,dt,index);placeRiders(e);
   if(!Number.isFinite(e.lastProgressAt)||Math.hypot(e.x-x,e.z-z)>.03)e.lastProgressAt=now();
   if(!arrived){if(now()-e.lastProgressAt>=900)recoverVehicleRoute(e,phase);return;}
   if(phase==='enroute'){
    if(e.kind==='fire'){
     const fire=fires().find(f=>f.id===e.incidentId);if(!fire||fire.containedAt){returnRoute(e);return;}
     e.phase='on-scene';for(const id of e.crewIds){const f=alive(id);f.onFireEngine=false;duty(f,e,'on-scene');f.urbanTask={type:'fire',id:e.incidentId,targetId:`CIVIC-FIRE-${e.incidentId}`,engineId:e.id};requestJourney(f,f.urbanTask.targetId,'deploying hoses at the fire','walk');}emit('fire_engine_arrival',`${e.id} arrived; firefighters are deploying their hoses.`,{engineId:e.id,fireId:e.incidentId});
    }else{e.phase='patient-boarding';const p=alive(e.patientId);if(p){p.onAmbulance=false;p.ambulanceDuty.phase='boarding';requestJourney(p,`EMERGENCY-PICKUP-${e.id}`,'being escorted to the ambulance');}e.boardingStartedAt=now();}
   }else if(phase==='returning'){if(e.kind==='fire'){e.phase='pullin';e.phaseStartedAt=now();}else finishReturn(e);}
   else{e.phase='hospital-dropoff';const p=alive(e.patientId);if(p){p.onAmbulance=false;p.ambulanceDuty.phase='hospital-walk';requestJourney(p,e.hospitalId,'being admitted to hospital');}}
   return;
  }
  if(e.phase==='on-scene'){const fire=fires().find(f=>f.id===e.incidentId);if(!fire||fire.containedAt)gatherForReturn(e);return;}
  if(e.phase==='patient-boarding'){const p=alive(e.patientId);if(p&&!p.traveling&&dist(p,e)<5)beginHospital(e);else if(now()-e.boardingStartedAt>6*3600){clearPatient(e,'ambulance pickup could not be completed');returnRoute(e);}return;}
  if(e.phase==='hospital-dropoff'){
   const p=alive(e.patientId);if(!p){clearPatient(e);returnRoute(e);return;}if(!p.traveling&&p.currentLocationId===e.hospitalId){p.health=Math.min(65,p.health+8);p.stress=cap(p.stress-8);remember(p,'ambulance_hospital_arrival',{vehicleId:e.id,hospitalId:e.hospitalId});data().hospitalDeliveries++;clearPatient(e,'admitted for emergency treatment');returnRoute(e);}return;
  }
  if(e.phase==='gathering-return'){
   const atPickup=e.crewIds.filter(id=>{const f=alive(id);return f&&!f.traveling&&(f.currentLocationId===`EMERGENCY-PICKUP-${e.id}`||dist(f,e.pickup||e)<6);});
   if(atPickup.length===e.crewIds.length||(atPickup.length&&now()-Number(e.gatherStartedAt||0)>=3600)){
    for(const id of e.crewIds)if(!atPickup.includes(id))releaseCrew(alive(id),e);
    e.crewIds=atPickup;board(e,e.crewIds);returnRoute(e);
   }else for(const id of e.crewIds){
    const f=alive(id);if(f&&!atPickup.includes(id)&&!f.traveling&&now()>=Number(f.fireEngineDuty?.retryAt||0)){f.fireEngineDuty.retryAt=now()+600;requestJourney(f,`EMERGENCY-PICKUP-${e.id}`,'returning to the emergency vehicle','walk');}
   }
   return;
  }
  if(e.phase==='awaiting-route'){if(now()>=Number(e.retryRouteAt||0))returnRoute(e);return;}
  if(e.phase==='pullin'){const a=stationExit(e),b=garage(e),u=cap((now()-e.phaseStartedAt)/300,0,1);e.x=a.x+(b.x-a.x)*u;e.z=a.z+(b.z-a.z)*u;placeRiders(e);if(u>=1)finishReturn(e);}
 }
 function tick(dt,clock){
  if(!enabled())return;init();recruit();const d=data();
  for(const fire of fires()){
   if(!fire.detected||fire.containedAt)continue;
   if(fire.engineId&&!d.engines.some(e=>e.id===fire.engineId&&e.incidentId===fire.id&&!['idle','awaiting-relief','gathering-return','returning','pullin'].includes(e.phase))){
    fire.engineId=null;fire.teamIds=[];fire.nextDispatchAt=0;
   }
   if(!fire.engineId)dispatchFire(fire,clock);
  }
  if(now()>=d.nextMedicalCheckAt){d.nextMedicalCheckAt=now()+300;for(const p of medicalCandidates().slice(0,EMERGENCY_RULES.ambulances))dispatchAmbulance(p,clock);}
  const index=createVehicleIndex([...(raw().flies||[]),...fleet().map(e=>({...e,alive:true,transitMode:'car',traveling:['enroute','returning','hospital'].includes(e.phase)}))]);
  for(const e of fleet())tickVehicle(e,dt,clock,index);
 }
 function fallbackWalk(f,dt){if(!f.traveling)return;const p=f.routeWaypoints?.[f.routeIndex||0];if(!p){f.traveling=false;return;}const length=dist(f,p),step=Math.min(length,dt/120*2.5);if(length>.01){f.x+=(p.x-f.x)/length*step;f.z+=(p.z-f.z)/length*step;}if(length<=step+.05){f.routeIndex=(f.routeIndex||0)+1;if(f.routeIndex>=f.routeWaypoints.length){f.traveling=false;f.currentLocationId=f.targetLocationId;}}}
 function care(f,clock){needsAndActivities(f,clock);payAndFinance(f,clock);}
 function handleResident(f,clock){
  if(!enabled()||!f.alive)return false;
  if(f.ambulanceDuty){const e=fleet().find(e=>e.id===f.ambulanceDuty.vehicleId);if(!e){f.ambulanceDuty=null;f.onAmbulance=false;return false;}if(!f.onAmbulance&&f.traveling){if(moveFly)moveFly(f);else fallbackWalk(f,120);}care(f,clock);if(f.onAmbulance){f.action='being transported by ambulance';f.sleeping=false;}return true;}
  if(!f.fireEngineDuty)return false;const e=fleet().find(e=>e.id===f.fireEngineDuty.vehicleId);if(!e){f.fireEngineDuty=null;f.onFireEngine=f.onAmbulance=false;return false;}
  if(e.phase==='on-scene'&&e.kind==='fire')return false;
  if(!f.onFireEngine&&!f.onAmbulance&&f.traveling){if(moveFly)moveFly(f);else fallbackWalk(f,120);}care(f,clock);f.action=f.onFireEngine||f.onAmbulance?'riding an emergency vehicle':e.phase==='loading'?'reporting to the emergency garage':'returning to the emergency vehicle';return true;
 }
 function snapshot(){
  const d=data(),project=e=>({id:e.id,kind:e.kind,phase:e.phase,homeLocationId:e.homeLocationId,x:e.x,y:e.y,z:e.z,heading:e.heading,crewIds:e.crewIds,incidentId:e.incidentId||null,patientId:e.patientId||null,completedTrips:e.completedTrips,emergency:e.phase!=='idle',signalPermit:true,traveling:['enroute','hospital','returning'].includes(e.phase),transitMode:'car',targetX:e.targetX,targetZ:e.targetZ,motion:{at:now(),speed:EMERGENCY_RULES.speed*motorwaySpeedMultiplier(e),mode:'car',signalPermit:true,blocked:Boolean(e.blocked),points:(e.route||[]).slice(e.routeIndex||0,(e.routeIndex||0)+12).map(p=>({x:p.x,y:p.y??1.1,z:p.z}))}});
  return {enabled:enabled(),stationId:'firestation',speed:EMERGENCY_RULES.speed,roster:d.roster.map(id=>{const f=alive(id);return f?{id:f.id,role:f.jobId,stationId:f.emergencyStationId,onDuty:Boolean(f.fireEngineDuty),shiftStart:f.preferredWorkStart}:null;}).filter(Boolean),engines:d.engines.map(project),ambulances:d.ambulances.map(project),dispatches:d.dispatches,medicalDispatches:d.medicalDispatches,hospitalDeliveries:d.hospitalDeliveries,returns:d.returns,operatingCosts:d.operatingCosts,history:d.history.slice(-12)};
 }
 return {enabled,init,tick,handleResident,snapshot,dispatchFire,dispatchAmbulance};
}
