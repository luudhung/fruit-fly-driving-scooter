import {LOCATIONS,BUILDINGS,entrance} from './city-map.mjs';
import {PUBLIC_SERVICE_TARGETS,MILITARY_AIRFIELD,militaryAircraftPose} from './government-map.mjs';

const DAY=86400,clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
const essential=new Set(['doctor','hospital-central','hospital-east','school','power','power-evening','power-night','grid-dispatch','firefighter','paramedic','transit','police','military']);
const roleJob={army:'military',police:'police'},station={army:'military-base',police:'police-hq'},wages={army:6.6,police:6.3};
const application={army:'applying to the army',police:'applying to the police academy'};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Existing residents volunteer for bounded public jobs; no people or brains are generated. */
export function createPublicServices({world,random=()=>.5,neuralDrive=()=>.5,emit=()=>{},remember=()=>{},startJourney,moveFly,needsAndActivities=()=>{},payAndFinance=()=>{},isWorkCommitted=()=>false,urbanWorld}){
 const raw=()=>world(),now=()=>Number(raw().simulationAgeSeconds||0),loc=id=>LOCATIONS.find(l=>l.id===id);
 let actorState=null,actorAge=-1,actorLength=-1,actors=new Map();
 const actor=id=>{const state=raw();if(actorState!==state||actorAge!==now()||actorLength!==state.flies.length){actorState=state;actorAge=now();actorLength=state.flies.length;actors=new Map(state.flies.map(f=>[f.id,f]));}return actors.get(id);};
 const alive=id=>{const f=actor(id);return f?.alive?f:null;};
 const rand=f=>clamp(random(f));
 const enabled=()=>Boolean(loc('military-base')&&loc('police-hq'));
 const outsideCommitment=f=>f.industrialFreightDuty||f.socialTask||f.civicDuty||f.urbanTask||f.cityService||f.taxiJobId||f.taxiPassenger||f.privateFlight||f.onPrivateHelicopter||f.fireEngineDuty||f.ambulanceDuty||f.onFireEngine||f.onAmbulance||f.airTrip||f.heliPassenger||f.arrested||Number(f.arrestedUntil||0)>now()||f.emergencyTask||f.sportsSession||f.urbanFloodEscape;
 function account(){raw().businesses||={};return raw().businesses['public-service-supplies']||={cash:0,inventory:0,sector:'public-service-supplies'};}
 function data(){return raw().publicServices||={version:1,army:[],police:[],nextRecruitAt:0,nextFlightAt:now()+3600,nextFlightId:1,applications:0,recruits:0,retirements:0,trainingHours:0,wagesPaid:0,wageArrears:0,procurementPaid:0,flightCosts:0,trainingFlights:0,aircraft:[],history:[]};}
 function note(type,text,payload={}){const d=data();d.history.push({type,text,at:now(),...payload});d.history=d.history.slice(-24);emit(type,text,payload);}
 function memory(f,type,payload){remember(f,type,payload);}
 function supply(amount){const paid=Math.min(Math.max(0,Number(raw().treasury?.cash||0)),Math.max(0,amount));if(!paid)return 0;raw().treasury.cash-=paid;account().cash+=paid;raw().totalTransactions=Number(raw().totalTransactions||0)+1;return paid;}
 function roster(branch){return data()[branch].map(alive).filter(f=>f?.jobId===roleJob[branch]);}
 function onShift(f,clock){return ((Number(clock?.hour||0)+Number(clock?.minute||0)/60-Number(f.preferredWorkStart||0)+24)%24)<Number(f.preferredWorkHours||8);}
 function target(id,point,name){let l=loc(id);if(!l){l={id,name,type:'public-duty',x:point.x,z:point.z};LOCATIONS.push(l);}else Object.assign(l,{x:point.x,z:point.z});return l;}
 function bind(f,branch,existing=false){
  const d=data();if(!d[branch].includes(f.id))d[branch].push(f.id);
  if(f.publicServiceRole===branch){f.publicServicePayrollManaged=true;return;}
  f.publicServicePreviousJob={id:f.jobId||null,title:f.jobTitle||null,wage:Number(f.wage||0)};
  Object.assign(f,{jobId:roleJob[branch],jobTitle:branch==='army'?'army service member':'police officer',wage:wages[branch],publicServiceRole:branch,publicServicePayrollManaged:true,
   publicServiceJoinedAt:now(),publicServiceTrainingHours:Number(f.publicServiceTrainingHours||0),publicServiceWorkSampleAt:now(),preferredWorkStart:((d[branch].length-1)%3)*8,preferredWorkHours:8});
  f.professionSkills||={};
  if(branch==='police'){f.lawAwareness=Math.max(.98,Number(f.lawAwareness||0));f.professionSkills.law=Math.max(.7,Number(f.professionSkills.law||0));}
  if(!existing){d.recruits++;memory(f,'public_service_enlistment',{branch,stationId:station[branch],wage:f.wage});note('public_service_hire',`${f.id} voluntarily joined the ${branch==='army'?'army':'police academy'}.`,{flyId:f.id,branch,stationId:station[branch]});}
 }
 function init(){
  const d=data();account();d.army||=[];d.police||=[];d.aircraft||=[];d.history||=[];
  if(!enabled())return d;
  // Preserve the old police career and law-system identity while adding the headquarters.
  for(const f of raw().flies)if(f.alive&&f.jobId==='police'&&!f.businessId&&!f.businessEmployeeOf)bind(f,'police',true);
  for(const f of raw().flies)if(f.alive&&f.jobId==='military'&&f.publicServiceRole==='army')bind(f,'army',true);
  for(const branch of ['army','police'])d[branch]=[...new Set(d[branch])].filter(id=>alive(id)?.jobId===roleJob[branch]);
  for(const f of roster('army'))trainingTarget(f);
  for(let i=0;i<2;i++)if(!d.aircraft.some(p=>p.id===`ARMY-TRAINER-${i+1}`))d.aircraft.push({id:`ARMY-TRAINER-${i+1}`,standId:MILITARY_AIRFIELD.stands[i].id,owned:false,pilotId:null,flight:null,nextFlightAt:now()+3600+i*3000,trips:0});
  for(const plane of d.aircraft){
   if(!plane.owned&&Number(raw().treasury?.cash||0)>=2800){const paid=supply(2800);plane.owned=true;plane.purchasedAt=now();d.procurementPaid+=paid;note('military_procurement',`${plane.id} entered the public training-aircraft fleet.`,{aircraftId:plane.id,cost:paid});}
   if(plane.boardingPilotId){const stand=MILITARY_AIRFIELD.stands.find(p=>p.id===plane.standId);if(stand)target(`MILITARY-BOARD-${plane.id}`,{x:stand.x,z:stand.z+6},'Military aircraft boarding');}
  }
  for(const f of raw().flies)if(f.publicServiceDuty?.formation)target(f.publicServiceDuty.targetId,f.publicServiceDuty.formation,'Army training position');
  return d;
 }
 function suitability(f,branch){
  const t=f.traits||{},security=clamp(neuralDrive(f,'approachDrive')*.25+neuralDrive(f,'socialDrive')*.15+Number(t.resilience??.5)*.25+Number(t.ambition??.5)*.2+Number(t.empathy??.5)*.15);
  const publicInterest=Number(f.politicalInterest||0)*.15+Number(f.ideology?.welfare||0)*.1;
  return clamp(security+publicInterest+(branch==='army'?Number(t.risk??.5)*.08:Number(f.lawAwareness??.6)*.12));
 }
 function eligibleApplicant(f,branch){
  return Boolean(f?.alive&&f.ageYears>=21&&f.ageYears<=(branch==='army'?55:62)&&f.health>=65&&f.energy>35&&f.hunger<80&&!f.businessId&&!f.businessEmployeeOf&&!f.publicServiceRole&&!essential.has(f.jobId)&&!outsideCommitment(f)&&!f.onPlane&&!f.onTrain&&!f.sleeping&&!isWorkCommitted(f)&&now()>=Number(f.nextPublicServiceApplicationAt||0)&&!urbanWorld?.isUnavailable?.(station[branch],f));
 }
 function apply(f,branch){
  if(!enabled()||!eligibleApplicant(f,branch)||roster(branch).length>=PUBLIC_SERVICE_TARGETS[branch]||f.traveling)return false;
  const place=loc(station[branch]);if(!place||f.currentLocationId!==place.id&&dist(f,entrance(place))>16)return false;
  const d=data();d.applications++;f.nextPublicServiceApplicationAt=now()+DAY/2;
  const score=suitability(f,branch);
  if(score<.5){memory(f,'public_service_application',{branch,accepted:false,score});return false;}
  bind(f,branch);f.action=branch==='army'?'completed army enlistment':'accepted into the police academy';f.actionUntil=now()+600;return true;
 }
 function releaseDuty(f,preserve=false){
  const duty=f.publicServiceDuty;if(!duty)return;
  f.publicServiceDuty=null;f.publicServiceWorkSampleAt=now();f.publicServiceAttending=false;
  if(preserve||outsideCommitment(f)||f.onTrain||f.onPlane)return;
  if(f.targetLocationId===duty.targetId){f.traveling=false;f.routeWaypoints=[];f.vx=f.vz=0;}f.actionUntil=now()+600;
 }
 function assignDuty(f,kind,targetId,duration=3600){
  const place=loc(targetId);if(!place||f.publicServiceDuty||f.traveling||outsideCommitment(f))return false;
  f.publicServiceDuty={kind,targetId,assignedAt:now(),arrivedAt:null,until:null,duration,...(kind==='training'?{formation:{x:place.x,z:place.z}}:{})};f.publicServiceWorkSampleAt=now();f.publicServiceAttending=false;f.roadDuty=false;f.mobilityShopping=false;
  if(f.currentLocationId!==targetId||dist(f,place)>16)startJourney?.(f,{id:targetId,action:kind==='training'?'reporting for army training':kind==='patrol'?'beginning a public police patrol':'reporting for public service'});
  if(!f.traveling&&f.currentLocationId!==targetId&&dist(f,place)>16){releaseDuty(f);return false;}
  return true;
 }
 function trainingTarget(f){
  const index=data().army.indexOf(f.id),point={x:683+(Math.max(0,index)%10)*6,z:-639+Math.floor(Math.max(0,index)/10)*6};
  return target(`ARMY-DRILL-${f.id}`,point,'Army training position');
 }
 function addChoices(f,clock,add){
  if(!enabled()||!f?.alive||f.publicServiceDuty||f.militaryFlightId||outsideCommitment(f)||f.traveling||f.onPlane||f.onTrain)return;
  const branch=f.publicServiceRole;
  if(branch){
   if(!onShift(f,clock)||f.energy<25||f.hunger>80||f.health<45)return;
   const kind=branch==='army'?'training':Number(clock.hour||0)%3===0?'headquarters':'patrol';
   const patrols=['riverside-market','bridge-view','park','airport-park','airport'].filter(id=>loc(id));
   const destination=branch==='army'?trainingTarget(f).id:kind==='headquarters'||!patrols.length?station.police:patrols[(data().police.indexOf(f.id)+Math.floor(now()/3600))%patrols.length];
   add(destination,kind==='training'?'army training duty':kind==='patrol'?'public police patrol':'public headquarters duty',175+Number(f.traits?.ambition||0)*15-f.stress*.15);return;
  }
  if(Number(clock.hour)<6||Number(clock.hour)>20)return;
  for(const option of ['army','police'])if(roster(option).length<PUBLIC_SERVICE_TARGETS[option]&&eligibleApplicant(f,option)){
   const score=suitability(f,option),improvement=Math.max(-15,Math.min(20,(wages[option]-Number(f.wage||0))*4));
   add(station[option],application[option],28+score*45+improvement+(f.jobId?0:20));
  }
 }
 function care(f,clock){
  if(f.publicServiceCareAt===now())return;f.publicServiceCareAt=now();needsAndActivities(f,clock);payAndFinance(f,clock);
 }
 function pay(f,elapsed){
  if(!(elapsed>0))return;
  const d=data(),gross=wages[f.publicServiceRole]*elapsed/3600,available=Math.max(0,Number(raw().treasury?.cash||0)),paid=Math.min(gross,available),tax=paid*.05,net=paid-tax;
  if(paid>0){raw().treasury.cash-=net;raw().treasury.taxRevenue=Number(raw().treasury.taxRevenue||0)+tax;f.money=Number(f.money||0)+net;f.salaryLifetime=Number(f.salaryLifetime||0)+net;f.salaryEarnedToday=Number(f.salaryEarnedToday||0)+net;d.wagesPaid+=net;raw().totalTransactions=Number(raw().totalTransactions||0)+1;}
  if(paid<gross){f.wageArrears=Number(f.wageArrears||0)+gross-paid;d.wageArrears+=gross-paid;}
  // These minutes have already been paid by this service. Keep them out of the
  // ordinary end-of-shift payroll ledger if the resident later changes career.
  const day=Math.floor(now()/DAY);if(f.publicServiceWorkDay!==day){f.publicServiceWorkDay=day;f.publicServiceWorkMinutesToday=0;}
  f.publicServiceWorkMinutesToday=Number(f.publicServiceWorkMinutesToday||0)+elapsed/60;
 }
 function handleResident(f,clock){
  if(f.militaryFlightId){
   const plane=data().aircraft.find(p=>p.flight?.id===f.militaryFlightId);if(!plane)return false;
   const pose=militaryAircraftPose(now(),plane);Object.assign(f,{x:pose.x,y:pose.y,z:pose.z,onPlane:true,indoors:true,traveling:false,action:'flying an army training circuit'});
   const elapsed=Math.max(0,Math.min(1800,now()-Number(f.publicServiceWorkSampleAt??now())));pay(f,elapsed);f.publicServiceWorkSampleAt=now();care(f,clock);return true;
  }
  if(!f.publicServiceRole){
   const branch=Object.keys(application).find(branch=>f.action===application[branch]||f.pendingAction===application[branch]);
   if(branch&&!f.traveling)apply(f,branch);return false;
  }
  if(outsideCommitment(f)||f.onPlane||f.health<35||f.energy<12||f.hunger>92){releaseDuty(f,true);return false;}
  let duty=f.publicServiceDuty;
  if(!duty){
   const kind=f.action==='army training duty'?'training':f.action==='public police patrol'?'patrol':f.action==='public headquarters duty'?'headquarters':null;
   if(kind&&onShift(f,clock))assignDuty(f,kind,kind==='training'?trainingTarget(f).id:kind==='headquarters'?station.police:f.currentLocationId);
   duty=f.publicServiceDuty;if(!duty)return false;
  }
  if(!onShift(f,clock)&&!f.traveling&&!f.onTrain){releaseDuty(f);return false;}
  const goal=loc(duty.targetId);
  if(!goal){releaseDuty(f,true);return false;}
  if(f.traveling&&f.targetLocationId!==duty.targetId){releaseDuty(f,true);return false;}
  if(!f.traveling&&!f.onTrain&&dist(f,goal)>16&&now()>=Number(duty.nextRouteAt||0)){
   if(Number(duty.routeFailures||0)>=3){releaseDuty(f);f.actionUntil=now()+1800;return false;}
   duty.routeFailures=Number(duty.routeFailures||0)+1;duty.nextRouteAt=now()+600;
   startJourney?.(f,{id:duty.targetId,action:'returning to a public service assignment'});
  }
  moveFly?.(f);care(f,clock);
  const place=loc(duty.targetId),present=Boolean(place&&!f.traveling&&!f.onTrain&&dist(f,place)<16);
  const elapsed=Math.max(0,Math.min(1800,now()-Number(f.publicServiceWorkSampleAt??now())));
  if(present&&onShift(f,clock)){
   duty.routeFailures=0;
   if(duty.arrivedAt===null){duty.arrivedAt=now();duty.until=now()+duty.duration;}
   if(f.publicServiceAttending)pay(f,elapsed);
   f.publicServiceAttending=true;f.indoors=duty.kind==='headquarters';f.sleeping=false;f.actionUntil=now()+600;
   f.action=duty.kind==='training'?'training with the army':duty.kind==='patrol'?'patrolling a public district':duty.kind==='pilot-transfer'?'boarding a military training aircraft':'working at police headquarters';
   if(duty.kind==='training'&&elapsed>0&&now()>duty.arrivedAt){
    const hours=elapsed/3600;f.publicServiceTrainingHours=Number(f.publicServiceTrainingHours||0)+hours;data().trainingHours+=hours;
    f.professionSkills||={};f.professionSkills.armyTraining=clamp(Number(f.professionSkills.armyTraining||0)+hours*.018);f.professionSkills.aviation=clamp(Number(f.professionSkills.aviation||0)+hours*.025);
   }
   if(duty.kind!=='pilot-transfer'&&now()>=duty.until){memory(f,'public_service_shift',{branch:f.publicServiceRole,kind:duty.kind,locationId:duty.targetId});releaseDuty(f);}
  }else f.publicServiceAttending=false;
  f.publicServiceWorkSampleAt=now();return true;
 }
 function retireAndClean(){
  const d=data();for(const branch of ['army','police'])d[branch]=d[branch].filter(id=>{
   const f=actor(id);if(f?.alive&&f.jobId===roleJob[branch]&&(f.ageYears<(branch==='army'?65:76)||f.militaryFlightId))return true;
   if(f?.publicServiceRole===branch){releaseDuty(f,true);f.publicServiceRole=null;f.publicServicePayrollManaged=false;if(f.jobId===roleJob[branch]){f.jobId=null;f.jobTitle=f.alive?'retired public servant':f.jobTitle;f.wage=0;}if(f.alive){d.retirements++;memory(f,'public_service_retirement',{branch});}}
   return false;
  });
 }
 function tick(gameSeconds,clock){
  const d=data();if(!enabled())return;
  if(now()>=d.nextRecruitAt){d.nextRecruitAt=now()+3600;retireAndClean();}
  for(const plane of d.aircraft){
   if(plane.flight&&now()>=plane.flight.arrival){
    const f=alive(plane.flight.pilotId),stand=MILITARY_AIRFIELD.stands.find(p=>p.id===plane.standId);
    if(f?.militaryFlightId===plane.flight.id){Object.assign(f,{militaryFlightId:null,onPlane:false,indoors:false,x:stand.x,y:1.1,z:stand.z,currentLocationId:'military-airfield',traveling:false,action:'completed an army training flight',actionUntil:now()+600,publicServiceWorkSampleAt:now()});memory(f,'military_training_flight',{flightId:plane.flight.id,aircraftId:plane.id});}
    plane.flight=null;plane.pilotId=null;plane.trips++;d.trainingFlights++;plane.nextFlightAt=now()+7200;
   }
   if(plane.boardingPilotId){
    const f=alive(plane.boardingPilotId),point=loc(`MILITARY-BOARD-${plane.id}`);
    const weather=raw().weather||{},closed=Number(clock.hour)<8||Number(clock.hour)>=18||Number(weather.precipitation||0)>.65||Number(weather.wind||0)>.72||weather.condition==='thunderstorm';
    if(!f||f.publicServiceRole!=='army'||outsideCommitment(f)||!onShift(f,clock)||closed||now()-plane.boardingStartedAt>14400){if(f?.publicServiceDuty?.aircraftId===plane.id)releaseDuty(f);plane.boardingPilotId=null;plane.nextFlightAt=now()+1800;continue;}
    if(!f.traveling&&point&&dist(f,point)<12&&!d.aircraft.some(p=>p.flight)){
     if(Number(raw().treasury?.cash||0)<14)continue;
     d.flightCosts+=supply(14);const flight={id:`ARMY-FLIGHT-${d.nextFlightId++}`,pilotId:f.id,departure:now()+120,arrival:now()+2520,paid:true};plane.flight=flight;plane.pilotId=f.id;plane.boardingPilotId=null;releaseDuty(f,true);
     Object.assign(f,{militaryFlightId:flight.id,onPlane:true,indoors:true,traveling:false,publicServiceWorkSampleAt:now()});note('military_training_departure',`${f.id} boarded ${plane.id} for a local training circuit.`,{flyId:f.id,aircraftId:plane.id,flightId:flight.id});
    }
   }
  }
  if(Number(clock.hour)<8||Number(clock.hour)>=18||now()<d.nextFlightAt||d.aircraft.some(p=>p.flight||p.boardingPilotId))return;
  const weather=raw().weather||{};if(Number(weather.precipitation||0)>.65||Number(weather.wind||0)>.72||weather.condition==='thunderstorm')return;
  const plane=d.aircraft.find(p=>p.owned&&!p.flight&&now()>=Number(p.nextFlightAt||0));if(!plane)return;
  const pilot=roster('army').filter(f=>onShift(f,clock)&&!f.traveling&&!f.onPlane&&!outsideCommitment(f)&&f.health>65&&f.energy>45&&f.publicServiceTrainingHours>=8&&Number(f.professionSkills?.aviation||0)>=.2&&dist(f,loc('military-base'))<140).sort((a,b)=>Number(b.professionSkills.aviation)-Number(a.professionSkills.aviation)||a.id.localeCompare(b.id))[0];
  if(!pilot)return;
  releaseDuty(pilot);const stand=MILITARY_AIRFIELD.stands.find(p=>p.id===plane.standId),point=target(`MILITARY-BOARD-${plane.id}`,{x:stand.x,z:stand.z+6},'Military aircraft boarding');
  if(assignDuty(pilot,'pilot-transfer',point.id,7200)){pilot.publicServiceDuty.aircraftId=plane.id;plane.boardingPilotId=pilot.id;plane.boardingStartedAt=now();d.nextFlightAt=now()+3000;}
 }
 function snapshot(){
  const d=data(),project=f=>({id:f.id,branch:f.publicServiceRole,jobId:f.jobId,stationId:station[f.publicServiceRole],onDuty:Boolean(f.publicServiceDuty||f.militaryFlightId),trainingHours:Number(f.publicServiceTrainingHours||0),duty:f.publicServiceDuty?.kind||null,targetId:f.publicServiceDuty?.targetId||null});
  return{version:1,enabled:enabled(),targets:{...PUBLIC_SERVICE_TARGETS},army:{target:50,count:roster('army').length,members:roster('army').map(project)},police:{target:28,count:roster('police').length,members:roster('police').map(project)},wagesPaid:d.wagesPaid,wageArrears:d.wageArrears,recruits:d.recruits,retirements:d.retirements,trainingHours:d.trainingHours,trainingFlights:d.trainingFlights,procurementPaid:d.procurementPaid,flightCosts:d.flightCosts,aircraft:d.aircraft.map(p=>({...p,flight:p.flight?{...p.flight}:null})),history:d.history.slice(-12),algorithmOnly:true};
 }
 return{init,tick,addChoices,handleResident,snapshot,apply,onShift,suitability};
}
