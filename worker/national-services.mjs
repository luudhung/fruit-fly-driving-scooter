import {COUNTRY_IDS,NORTH_AIRPORT,NORTH_GUARD_POSTS,countryAt} from './country-map.mjs';
import {LOCATIONS,BUILDINGS,entrance,clearSegment} from './city-map.mjs';
const NORTH=COUNTRY_IDS.north,DAY=86400,roles=['army','police','medical','fire','education'];
// A paid trainer uses its own dry apron bay, outside all passenger stands.
export const NORTH_TRAINING_STAND=Object.freeze({x:-933,z:-880});
export const NORTH_SERVICE_TARGETS=Object.freeze({army:20,police:10,medical:4,fire:4,education:2});
export const NORTH_PUBLIC_WORKSITES=Object.freeze({army:'north-army',police:'north-police',medical:'north-hospital',fire:'north-firestation',education:'north-school'});
const stations=NORTH_PUBLIC_WORKSITES;
const jobs={army:'north-military',police:'north-police',medical:'north-medical',fire:'north-fire',education:'north-teacher'};
const wages={army:6.4,police:6.2,medical:7,fire:6.8,education:6.5};
const essential=new Set(['doctor','hospital-central','hospital-east','school','power','power-evening','power-night','grid-dispatch','firefighter','paramedic','transit','pilot','police','military',...Object.values(jobs)]);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),live=f=>f?.alive&&!f.departed;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));

/** A country payroll over existing identities. Equipment is purchased, and work
 * and care require physical attendance; no resident, brain or cash is created. */
export function createNationalServices(hooks){
 const {world,countryAccount,mayWork=()=>true,startJourney=()=>{},moveFly=()=>{},needsAndActivities=()=>{},payAndFinance=()=>{},remember=()=>{},emit=()=>{},neuralDrive=()=>.5,isWorkCommitted=()=>false,managesFireResponse=()=>false,runwayAvailable=()=>false}=hooks;
 const now=()=>Number(world().simulationAgeSeconds||0),data=()=>world().nationalServices||={version:1,countryId:NORTH,rosters:Object.fromEntries(roles.map(r=>[r,[]])),nextRecruitAt:0,wagesPaid:0,wageArrears:0,trainingHours:0,careVisits:0,fireWaterUsed:0,lessons:0,policeCases:0,procurementPaid:0,supplies:{medical:0,water:0},aircraft:[],trainingFlights:0,history:[]};
 let peopleKey=null,peopleTime=-1,peopleCount=-1,people=new Map();
 function actor(id){const w=world();if(peopleKey!==w||peopleTime!==now()||peopleCount!==w.flies.length){peopleKey=w;peopleTime=now();peopleCount=w.flies.length;people=new Map(w.flies.map(f=>[f.id,f]));}return people.get(id);}
 const roster=role=>data().rosters[role].map(actor).filter(f=>live(f)&&f.publicServiceCountryId===NORTH&&f.nationalServiceRole===role&&f.jobId===jobs[role]);
 const outside=f=>f.businessId||f.businessEmployeeOf||f.facilityEmployment||f.internationalWork||f.industrialFreightDuty||f.urbanTask||f.civicDuty||f.fireEngineDuty||f.ambulanceDuty||f.onFireEngine||f.onAmbulance||f.airTrip||f.privateFlight||f.onPrivateHelicopter||f.heliPassenger||f.taxiJobId||f.taxiPassenger||f.cityService||f.socialTask||f.emergencyTask||f.sportsSession||f.warResponse?.active;
 const account=()=>countryAccount(NORTH);
 function supplier(){world().businesses||={};return world().businesses['north-public-supplies']||={cash:0,inventory:0,sector:'national-service-supplies',countryId:NORTH};}
 function spend(amount){const a=account(),paid=Math.min(Math.max(0,Number(a?.cash||0)),Math.max(0,amount));if(paid){a.cash-=paid;supplier().cash+=paid;world().totalTransactions=Number(world().totalTransactions||0)+1;data().procurementPaid+=paid;}return paid;}
 function note(type,payload={}){const row={type,at:now(),countryId:NORTH,...payload};data().history.push(row);data().history=data().history.slice(-24);emit(type,`North City ${type.replaceAll('_',' ')}`,row);}
 function location(id){return LOCATIONS.find(p=>p.id===id);}
 function target(id,p){let l=location(id);if(!l){l={id,name:id,type:'public-duty',x:p.x,z:p.z};LOCATIONS.push(l);}return l;}
 function goal(id){const b=BUILDINGS.find(b=>b.id===id);return b?entrance(b):location(id);}
 const hour=clock=>Number(clock?.hour??(now()%DAY/3600))+Number(clock?.minute||0)/60;
 const onShift=(f,clock)=>((hour(clock)-Number(f.preferredWorkStart||0)+24)%24)<8;
 function guard(f){return data().guardAssignments?.find(g=>g.memberId===f.id);}
 function guardLead(f,clock){const g=guard(f);if(!g)return false;const p=NORTH_GUARD_POSTS.find(p=>p.id===g.postId),until=((g.shiftStart-hour(clock)+24)%24)*3600;return until>0&&until<=Math.min(6*3600,distance(f,p)/2.5*Number(world().timeScale||120)+600);}
 function present(f,id){const p=goal(id);return Boolean(p&&!f.traveling&&!f.onTrain&&!f.onPlane&&(distance(f,p)<8||f.currentLocationId===id&&distance(f,p)<45));}
 function dispatch(f,id,action,allowMetro=false){const p=goal(id);if(!p||f.onTrain||f.onPlane||f.traveling&&f.targetLocationId!==f.nationalServiceDuty?.targetId)return false;startJourney(f,{id,action,...(allowMetro?{}:{mode:'walk'})});
  if(!f.onTrain&&distance(f,p)<600&&clearSegment(f,p)){Object.assign(f,{targetLocationId:id,targetX:p.x,targetZ:p.z,finalTargetX:p.x,finalTargetZ:p.z,routeWaypoints:[{x:p.x,y:1.1,z:p.z,mode:'walk',stage:'public-duty-walk'}],routeIndex:0,transitMode:'walk',transitStage:'public-duty-walk',metroLineId:null,pendingAction:action,action,indoors:false,traveling:distance(f,p)>.85});if(!f.traveling)f.currentLocationId=id;}
  return true;
 }
 function release(f){const duty=f.nationalServiceDuty;f.nationalServiceDuty=null;f.nationalServiceSampleAt=now();if(duty&&f.targetLocationId===duty.targetId&&!f.onTrain&&!f.onPlane&&!outside(f)){f.traveling=false;f.routeWaypoints=[];f.vx=f.vz=0;}}
 function eligible(f,role){return live(f)&&f.citizenshipCountryId===NORTH&&mayWork(f,NORTH,{security:role==='army'||role==='police'})&&f.ageYears>=21&&f.ageYears<(role==='army'?56:65)&&f.health>=60&&f.energy>30&&f.hunger<85&&!f.publicServiceRole&&!essential.has(f.jobId)&&!outside(f)&&!f.onTrain&&!f.onPlane&&!f.traveling&&!f.sleeping&&!isWorkCommitted(f);}
 function willingness(f,role){const t=f.traits||{},skill=f.professionSkills||{};return clamp(neuralDrive(f,role==='medical'?'socialDrive':'approachDrive')*.45+Number(t.resilience??.5)*.2+Number(t.empathy??.5)*.2+Number(t.ambition??.5)*.15+Math.min(.15,Number(skill[role]||0)*.15));}
 function apply(f,role,{remoteOffer=false}={}){if(!roles.includes(role)||!eligible(f,role)||roster(role).length>=NORTH_SERVICE_TARGETS[role]||willingness(f,role)<.5||!remoteOffer&&!present(f,stations[role]))return false;
  const d=data();f.nationalServicePreviousJob={id:f.jobId||null,title:f.jobTitle||null,wage:Number(f.wage||0)};Object.assign(f,{nationalServiceRole:role,publicServiceCountryId:NORTH,publicServiceRole:role,publicServicePayrollManaged:true,jobId:jobs[role],jobTitle:`North City ${role}`,wage:wages[role],nationalServiceSampleAt:now(),nationalServiceJoinedAt:now(),preferredWorkStart:role==='army'?8:((d.rosters[role].length%3)*8),preferredWorkHours:8});f.professionSkills||={};d.rosters[role].push(f.id);remember(f,'national_service_enlistment',{role,countryId:NORTH,wage:f.wage});note('national_service_hire',{memberId:f.id,role});return true;
 }
 function recruit(){const d=data();if(now()<d.nextRecruitAt)return;d.nextRecruitAt=now()+1800;let recruited=0;for(const role of roles){const need=NORTH_SERVICE_TARGETS[role]-roster(role).length;if(need<=0)continue;const candidates=world().flies.filter(f=>eligible(f,role)).sort((a,b)=>willingness(b,role)-willingness(a,role)||a.id.localeCompare(b.id));for(const f of candidates.slice(0,Math.min(need,8-recruited))){if(apply(f,role,{remoteOffer:true}))recruited++;}if(recruited>=8)break;}}
 function guards(){const d=data(),army=roster('army'),valid=new Set(army.filter(f=>Number(f.professionSkills?.aviation||0)<.5).map(f=>f.id));d.guardAssignments=(d.guardAssignments||[]).filter(g=>valid.has(g.memberId));const used=new Set(d.guardAssignments.map(g=>g.memberId));for(const shiftStart of [0,8,16])for(const p of NORTH_GUARD_POSTS)if(!d.guardAssignments.some(g=>g.shiftStart===shiftStart&&g.postId===p.id)){const f=army.find(f=>valid.has(f.id)&&!used.has(f.id));if(!f)continue;d.guardAssignments.push({memberId:f.id,postId:p.id,shiftStart});used.add(f.id);}for(const g of d.guardAssignments){const f=actor(g.memberId);f.preferredWorkStart=g.shiftStart;target(`NORTH-GUARD-${g.postId}`,NORTH_GUARD_POSTS.find(p=>p.id===g.postId));}}
 function procure(){const d=data();if(!d.aircraft.length)d.aircraft.push({id:'NORTH-TRAINER-1',airportId:'north',owned:false,fuel:0,flight:null,pilotId:null,trips:0,nextFlightAt:now()+3600});const plane=d.aircraft[0];if(!plane.owned&&Number(account()?.cash||0)>=3800){spend(2800);plane.owned=true;}if(plane.owned&&plane.fuel<30&&Number(account()?.cash||0)>=600){const bought=spend(120);plane.fuel+=bought/2;}
  for(const [kind,price,units]of [['medical',40,80],['water',40,800]])if(d.supplies[kind]<10&&Number(account()?.cash||0)>=500){const paid=spend(price);d.supplies[kind]+=units*paid/price;}
 }
 function garrison(){return data().garrison||={rations:0,pending:null,mealsServed:0,procurementPaid:0,restHours:0,lostCargo:0};}
 function rationOrder(courier){
  const vendor=world().businesses?.['north-market'],price=Math.max(.1,Number(vendor?.price||6)),quantity=Math.min(Math.max(24,roster('army').length*4),Math.floor(Number(vendor?.inventory||0)),Math.floor(Math.max(0,Number(account()?.cash||0)-500)/price));
  if(quantity<=0)return null;
  const cost=quantity*price;account().cash-=cost;vendor.cash=Number(vendor.cash||0)+cost;vendor.inventory-=quantity;world().totalTransactions=Number(world().totalTransactions||0)+1;garrison().procurementPaid+=cost;
  return {courierId:courier.id,phase:'collecting',quantity,paid:cost,reserved:true};
 }
 function foodTick(){const g=garrison();if(g.pending){const f=actor(g.pending.courierId);if(!live(f)){
   if(g.pending.phase==='delivering')g.lostCargo+=g.pending.quantity;
   else if(g.pending.reserved){const vendor=world().businesses?.['north-market'];if(vendor){vendor.inventory=Number(vendor.inventory||0)+g.pending.quantity;const refund=Math.min(Number(vendor.cash||0),g.pending.paid);vendor.cash-=refund;account().cash+=refund;g.procurementPaid-=refund;}}
   g.pending=null;
  }return;}
  if(g.rations>=Math.max(20,roster('army').length*2)||Number(world().businesses?.['north-market']?.inventory||0)<1||Number(account()?.cash||0)<550)return;
  const courier=roster('army').find(f=>!guard(f)&&!f.nationalTrainingFlightId&&!f.nationalAviationTransferId&&!outside(f)&&!f.onTrain&&!f.onPlane&&!f.traveling&&f.energy>35&&f.health>60);
  if(!courier)return;const order=rationOrder(courier);if(!order)return;g.pending=order;release(courier);courier.nationalSupplyTask=true;dispatch(courier,'north-market','collecting reserved North army rations');
 }
 function supplyDuty(f,clock){const g=garrison();let cargo=g.pending;if(!cargo||cargo.courierId!==f.id){f.nationalSupplyTask=null;return false;}if(f.onTrain||f.onPlane)return false;const targetId=cargo.phase==='collecting'?'north-market':'north-army';if(f.traveling)moveFly(f);if(present(f,targetId)){
   if(cargo.phase==='collecting'){
    // Old saved couriers may predate reservation. Buy once at their actual pickup.
    if(!cargo.reserved){const order=rationOrder(f);if(!order){g.pending=null;f.nationalSupplyTask=null;return false;}g.pending=cargo=order;}
    cargo.phase='delivering';dispatch(f,'north-army','delivering North army rations');
   }else{g.rations+=cargo.quantity;g.pending=null;f.nationalSupplyTask=null;note('north_rations_delivered',{memberId:f.id,quantity:cargo.quantity,paid:cargo.paid});}
  }else if(!f.traveling)dispatch(f,targetId,cargo.phase==='collecting'?'collecting reserved North army rations':'delivering North army rations');needsAndActivities(f,clock);payAndFinance(f,clock);return true;
 }
 function restDuty(f,clock){if(f.nationalServiceRole!=='army'||guard(f)&&onShift(f,clock)&&f.energy>=25&&f.hunger<80||guardLead(f,clock)&&f.energy>=30&&f.hunger<65)return false;if(onShift(f,clock)&&f.energy>=30&&f.hunger<65&&!f.nationalServiceResting)return false;const g=garrison();if(f.nationalServiceDuty)release(f);if(f.onTrain||f.onPlane)return false;if(!present(f,'north-army')){if(!f.traveling)dispatch(f,'north-army','resting at the North army barracks');else moveFly(f);f.nationalServiceResting=true;f.nationalRestSampleAt=now();needsAndActivities(f,clock);payAndFinance(f,clock);return true;}const elapsed=Math.max(0,Math.min(1800,now()-Number(f.nationalRestSampleAt??now())));f.nationalRestSampleAt=now();f.energy=clamp(Number(f.energy||0)+elapsed/3600*10,0,100);g.restHours+=elapsed/3600;if(f.hunger>=45&&g.rations>=1&&now()>=Number(f.nextNationalMealAt||0)){g.rations--;g.mealsServed++;f.hunger=Math.max(0,f.hunger-55);f.nextNationalMealAt=now()+600;}f.nationalServiceResting=Boolean(f.energy<70||f.hunger>60);f.action=f.hunger>60?'waiting for funded North garrison rations':'resting at the North army barracks';f.actionUntil=now()+600;needsAndActivities(f,clock);payAndFinance(f,clock);return !onShift(f,clock)||f.nationalServiceResting;}
 function retire(){for(const role of roles)for(const id of [...data().rosters[role]]){const f=actor(id);if(live(f)&&f.ageYears<66&&f.health>=30&&f.publicServiceCountryId===NORTH)continue;data().rosters[role]=data().rosters[role].filter(v=>v!==id);if(f?.publicServiceCountryId===NORTH){release(f);Object.assign(f,{nationalServiceRole:null,publicServiceRole:null,publicServiceCountryId:null,publicServicePayrollManaged:false,jobId:null,jobTitle:'retired national service',wage:0});}}}
 function init(){const d=data();for(const role of roles)d.rosters[role]||=[];d.aircraft||=[];d.supplies||={medical:0,water:0};for(const f of world().flies)if(f.publicServiceCountryId===NORTH&&roles.includes(f.nationalServiceRole)&&!d.rosters[f.nationalServiceRole].includes(f.id))d.rosters[f.nationalServiceRole].push(f.id);retire();recruit();guards();procure();return snapshot();}
 function chooseDuty(f){const role=f.nationalServiceRole,g=guard(f);if(g)return {kind:'guard',targetId:`NORTH-GUARD-${g.postId}`};if(role==='army')return {kind:'training',targetId:'north-drill'};
  if(role==='fire'&&!managesFireResponse()){const fire=world().urbanWorld?.fires?.find(fire=>!fire.containedAt&&countryAt(world().urbanWorld.buildings[fire.buildingId]||BUILDINGS.find(b=>b.id===fire.buildingId))===NORTH);if(fire){const b=world().urbanWorld.buildings[fire.buildingId]||BUILDINGS.find(b=>b.id===fire.buildingId);const id=`NORTH-FIRE-${fire.id}`;target(id,entrance(b));return {kind:'fire',targetId:id,incidentId:fire.id};}}
  return {kind:role,targetId:stations[role]};
 }
 function service(f,dt){if(dt<=0)return;const d=data(),role=f.nationalServiceRole;f.professionSkills||={};
  if(role==='army'){d.trainingHours+=dt/3600;f.professionSkills.armyTraining=clamp(Number(f.professionSkills.armyTraining||0)+dt/3600*.008);}
  if(role==='medical'&&d.supplies.medical>0){const patient=world().flies.find(p=>live(p)&&p!==f&&!p.onTrain&&!p.onPlane&&!p.onPrivateHelicopter&&!p.traveling&&p.health<98&&Math.abs((p.y??1.1)-(f.y??1.1))<3&&distance(f,p)<18);if(patient){const amount=Math.min(d.supplies.medical,dt/3600);d.supplies.medical-=amount;patient.health=clamp(patient.health+amount*4,0,100);d.careVisits++;f.professionSkills.medicine=clamp(Number(f.professionSkills.medicine||0)+amount*.005);remember(patient,'north_clinic_care',{memberId:f.id,amount});}}
  if(role==='education'){for(const pupil of world().flies.filter(p=>live(p)&&p!==f&&!p.onTrain&&!p.onPlane&&!p.onPrivateHelicopter&&!p.traveling&&Math.abs((p.y??1.1)-(f.y??1.1))<3&&distance(p,f)<20).slice(0,8)){pupil.knowledge||={};pupil.knowledge.general=clamp(Number(pupil.knowledge.general||0)+dt/3600*.005);d.lessons++;}}
  if(role==='police'){const suspect=world().flies.find(p=>live(p)&&p!==f&&Number(p.wantedUntil||0)>now()&&distance(p,f)<18);if(suspect){const fine=Math.min(5,Math.max(0,Number(suspect.money||0)));suspect.money-=fine;account().cash+=fine;suspect.wantedUntil=now();suspect.stress=clamp(Number(suspect.stress||0)+5,0,100);d.policeCases++;remember(suspect,'north_police_case',{officerId:f.id,fine});}}
  if(role==='fire'&&!managesFireResponse()&&f.nationalServiceDuty?.incidentId){const fire=world().urbanWorld?.fires?.find(v=>v.id===f.nationalServiceDuty.incidentId&&!v.containedAt);if(fire){const water=Math.min(d.supplies.water,dt*.1);d.supplies.water-=water;d.fireWaterUsed+=water;fire.intensity=Math.max(0,fire.intensity-water*.1);if(fire.intensity===0){fire.containedAt=now();const b=world().urbanWorld.buildings[fire.buildingId];if(b)b.stage=b.health<18?'collapsed':'damaged';world().urbanWorld.extinguishedFires=Number(world().urbanWorld.extinguishedFires||0)+1;}}}
 }
 function flightClosed(clock){const weather=world().weather||{};return hour(clock)<8||hour(clock)>=18||Number(weather.precipitation||0)>.65||Number(weather.wind||0)>.72||weather.condition==='thunderstorm'||Boolean(world().internationalLife?.activeConflict);}
 function cancelBoarding(plane){const f=actor(plane.boardingPilotId);if(f?.nationalAviationTransferId===plane.id){f.nationalAviationTransferId=null;if(f.nationalServiceDuty?.kind==='pilot-transfer')release(f);}plane.boardingPilotId=null;plane.nextFlightAt=now()+1800;}
 function aviationDuty(f,clock){const plane=data().aircraft.find(p=>p.boardingPilotId===f.id&&f.nationalAviationTransferId===p.id);if(!plane)return false;
  if(f.onTrain||f.onPlane||outside(f))return false;
  const stand=NORTH_TRAINING_STAND,gateId=`NORTH-CHECKIN-${plane.id}`,boardId=`NORTH-BOARD-${plane.id}`;
  if(!f.nationalServiceDuty||f.nationalServiceDuty.kind!=='pilot-transfer'){f.nationalServiceDuty={kind:'pilot-transfer',targetId:gateId};}
  if(f.traveling)moveFly(f);
  if(!f.traveling&&f.nationalServiceDuty.targetId===gateId&&present(f,gateId)){
   // Walk around the terminal onto the reserved apron; boarding is never a jump
   // from a public street to a parked aircraft.
   const points=[{x:NORTH_AIRPORT.gate.x,z:-860},{x:stand.x,z:-860},{x:stand.x,z:stand.z}];
   Object.assign(f,{targetLocationId:boardId,targetX:points[0].x,targetZ:points[0].z,finalTargetX:stand.x,finalTargetZ:stand.z,routeWaypoints:points.map(p=>({...p,y:1.1,mode:'walk',stage:'military-apron-walk'})),routeIndex:0,transitMode:'walk',transitStage:'military-apron-walk',metroLineId:null,traveling:true,indoors:false,pendingAction:'walking to North training aircraft'});f.nationalServiceDuty.targetId=boardId;
  }else if(!f.traveling&&!present(f,f.nationalServiceDuty.targetId))dispatch(f,f.nationalServiceDuty.targetId,'reporting for a North training flight',f.nationalServiceDuty.targetId===gateId);
  if(f.hunger>=45&&Number(f.nationalPackedRations||0)>0&&now()>=Number(f.nextNationalMealAt||0)){f.nationalPackedRations--;f.hunger=Math.max(0,f.hunger-55);f.thirst=Math.max(0,Number(f.thirst||0)-35);f.nextNationalMealAt=now()+600;garrison().mealsServed++;}
  if(!f.traveling&&present(f,boardId)){const elapsed=Math.max(0,Math.min(1800,now()-Number(f.nationalAviationRestAt??now())));f.energy=clamp(Number(f.energy||0)+elapsed/3600*10,0,100);}f.nationalAviationRestAt=now();
  f.action=f.traveling?'walking to North training aircraft':'awaiting North training takeoff';f.actionUntil=now()+600;needsAndActivities(f,clock);payAndFinance(f,clock);return true;
 }
 function flightTick(clock){for(const plane of data().aircraft){if(!plane.owned)continue;if(plane.flight){const f=actor(plane.pilotId),pose=nationalTrainingAircraftPose(now(),plane);if(f?.alive&&f.nationalTrainingFlightId===plane.flight.id){const end=Math.min(now(),plane.flight.arrival),start=Math.max(plane.flight.departure,Number(plane.flight.trainingSampleAt??plane.flight.departure)),elapsed=Math.max(0,end-start);plane.flight.trainingSampleAt=Math.max(start,end);f.professionSkills||={};f.professionSkills.aviation=clamp(Number(f.professionSkills.aviation||0)+elapsed/3600*.02);Object.assign(f,{x:pose.x,y:pose.y,z:pose.z,onPlane:true,traveling:false,indoors:false,action:'North City training flight'});}if(now()>=plane.flight.arrival){if(f?.nationalTrainingFlightId===plane.flight.id){const stand=NORTH_TRAINING_STAND;Object.assign(f,{x:stand.x,y:1.1,z:stand.z,onPlane:false,nationalTrainingFlightId:null,currentLocationId:'north-airport',action:'completed North training flight'});}plane.flight=null;plane.pilotId=null;plane.trips++;data().trainingFlights++;plane.nextFlightAt=now()+14400;}continue;}
   if(plane.boardingPilotId){const f=actor(plane.boardingPilotId);if(!live(f)||outside(f)||f.health<65||f.energy<15||f.hunger>90||now()-Number(plane.boardingStartedAt||0)>3*DAY){cancelBoarding(plane);continue;}}
   if(flightClosed(clock)||plane.nextFlightAt>now()||plane.fuel<15)continue;
   let pilot=actor(plane.boardingPilotId);
   if(!pilot){pilot=roster('army').find(f=>!guard(f)&&!f.nationalTrainingFlightId&&!f.nationalSupplyTask&&!outside(f)&&!f.onTrain&&!f.onPlane&&!f.traveling&&f.energy>50&&f.hunger<65&&f.health>65&&Number(f.professionSkills?.aviation||0)>=.5);if(!pilot)continue;release(pilot);pilot.nationalServiceResting=false;plane.boardingPilotId=pilot.id;plane.boardingStartedAt=now();pilot.nationalAviationTransferId=plane.id;if(present(pilot,'north-army')){const packed=Math.min(4,Math.floor(garrison().rations));garrison().rations-=packed;pilot.nationalPackedRations=Number(pilot.nationalPackedRations||0)+packed;}}
   const id=`NORTH-BOARD-${plane.id}`,gateId=`NORTH-CHECKIN-${plane.id}`,stand=NORTH_TRAINING_STAND;target(id,stand);target(gateId,NORTH_AIRPORT.gate);
   if(!present(pilot,id)){if(!pilot.nationalServiceDuty){pilot.nationalServiceDuty={kind:'pilot-transfer',targetId:gateId};dispatch(pilot,gateId,'reporting to North airport for training',true);}continue;}
   const departure=now()+120,arrival=departure+2400;if(!runwayAvailable({airportId:'north',aircraftId:plane.id,departure,arrival}))continue;plane.fuel-=15;plane.pilotId=pilot.id;plane.flight={id:`NORTH-FLIGHT-${Math.floor(now())}-${plane.trips}`,from:'north',to:'north',departure,arrival,pilotId:pilot.id};plane.boardingPilotId=null;pilot.nationalAviationTransferId=null;release(pilot);pilot.nationalTrainingFlightId=plane.flight.id;pilot.onPlane=true;note('north_training_departure',{planeId:plane.id,pilotId:pilot.id});}}
 function tick(seconds=0,clock){retire();recruit();guards();procure();foodTick();flightTick(clock);}
 function handleResident(f,clock){if(f.publicServiceCountryId!==NORTH||!roles.includes(f.nationalServiceRole)||!live(f))return false;if(f.nationalTrainingFlightId){needsAndActivities(f,clock);return true;}if(f.onTrain||f.onPlane||outside(f))return false;if(f.nationalSupplyTask)return supplyDuty(f,clock);if(aviationDuty(f,clock))return true;if(restDuty(f,clock))return true;
  const duty=f.nationalServiceDuty;if(!onShift(f,clock)&&!guardLead(f,clock)){if(duty)release(f);return false;}
  if(f.traveling&&(!duty||f.targetLocationId!==duty.targetId))return false;
  if(!duty){f.nationalServiceDuty=chooseDuty(f);f.nationalServiceSampleAt=now();dispatch(f,f.nationalServiceDuty.targetId,`North ${f.nationalServiceDuty.kind} duty`);}
  const active=f.nationalServiceDuty,wasPresent=present(f,active.targetId)&&onShift(f,clock);if(f.traveling)moveFly(f);
  const dt=Math.max(0,Math.min(1800,now()-Number(f.nationalServiceSampleAt??now())));f.nationalServiceSampleAt=now();
  if(wasPresent&&present(f,active.targetId)&&onShift(f,clock)){const due=wages[f.nationalServiceRole]*dt/3600,paid=Math.min(Math.max(0,Number(account()?.cash||0)),due);account().cash-=paid;f.money=Number(f.money||0)+paid;data().wagesPaid+=paid;data().wageArrears+=due-paid;if(paid)world().totalTransactions=Number(world().totalTransactions||0)+1;service(f,dt);f.action=`North ${active.kind} duty`;f.actionUntil=now()+600;}
  else if(!f.traveling&&!present(f,active.targetId))dispatch(f,active.targetId,`North ${active.kind} duty`);
  needsAndActivities(f,clock);payAndFinance(f,clock);return true;
 }
 function addChoices(f,clock,add){if(f.publicServiceCountryId===NORTH){if(onShift(f,clock)||guardLead(f,clock))add(guard(f)?`NORTH-GUARD-${guard(f).postId}`:stations[f.nationalServiceRole],'North national service duty',190);return;}for(const role of roles)if(eligible(f,role)&&roster(role).length<NORTH_SERVICE_TARGETS[role])add(stations[role],`applying for North ${role}`,45+willingness(f,role)*35);}
 function snapshot(){const d=data();return {version:1,countryId:NORTH,targets:{...NORTH_SERVICE_TARGETS},roles:Object.fromEntries(roles.map(role=>[role,{target:NORTH_SERVICE_TARGETS[role],count:roster(role).length,members:roster(role).map(f=>({id:f.id,x:f.x,y:f.y??1.1,z:f.z,alive:f.alive,countryId:NORTH,role,onDuty:Boolean(f.nationalServiceDuty),duty:f.nationalServiceDuty?.kind||null,targetId:f.nationalServiceDuty?.targetId||null}))}])),guardAssignments:(d.guardAssignments||[]).map(g=>({...g})),garrison:{...garrison(),pending:garrison().pending?{...garrison().pending}:null},aircraft:d.aircraft.map(p=>({...p,flight:p.flight?{...p.flight}:null,pose:nationalTrainingAircraftPose(now(),p)})),wagesPaid:d.wagesPaid,wageArrears:d.wageArrears,trainingHours:d.trainingHours,trainingFlights:d.trainingFlights,careVisits:d.careVisits,fireWaterUsed:d.fireWaterUsed,lessons:d.lessons,policeCases:d.policeCases,procurementPaid:d.procurementPaid,history:d.history.slice(-12)};}
 return {init,tick,handleResident,addChoices,apply,roster,snapshot};
}

/** A shared NCI-only training circuit; neither crew nor viewer invents another path. */
export function nationalTrainingAircraftPose(now,plane){const stand=NORTH_TRAINING_STAND,e=plane.flight;if(!e||now<e.departure||now>=e.arrival)return{x:stand.x,y:3,z:stand.z,heading:Math.PI,phase:'parked'};const points=[[0,stand.x,3,stand.z],[.1,-974,3,-966],[.2,-1000,3,-966],[.35,-1000,6,-674],[.5,-850,100,-630],[.65,-650,130,-1020],[.8,-1000,80,-1070],[.9,-1000,3,-966],[1,stand.x,3,stand.z]],u=clamp((now-e.departure)/(e.arrival-e.departure));let i=0;while(i<points.length-2&&u>points[i+1][0])i++;const a=points[i],b=points[i+1],t=(u-a[0])/(b[0]-a[0]);return{x:a[1]+(b[1]-a[1])*t,y:a[2]+(b[2]-a[2])*t,z:a[3]+(b[3]-a[3])*t,heading:Math.atan2(b[1]-a[1],b[3]-a[3]),phase:'training-flight'};}
