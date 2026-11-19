import {HANSDREX_FRUIT_FARM} from './fruit-farm-map.mjs';
import {accidentalFireCandidates} from './fire-risk.mjs';
import {MAIN_SCHOOL_CAMPUSES} from './education-map.mjs';
import {SPACEPORT} from './spaceport-map.mjs';
import {NORTH_F1_RESERVED,NORTH_F1_GARAGES,NORTH_F1_GRANDSTANDS} from './north-f1-map.mjs';
import {BORDER_CUSTOMS_BUILDINGS,COUNTRY_IDS,NORTH_AIRPORT,NORTH_FARM,NORTH_MILITARY,NORTH_MATERIALS_YARD,NORTH_SPORTS_PARK,countryAt} from './country-map.mjs';
import {hasCountryCommitment} from './country-commitments.mjs';
import {CIVIC_FACILITY_CATALOG,facilitySpec,isNonResidentialUsage,nationalDevelopmentDemand,civicFacilities,DEVELOPMENT_REVIEW_INTERVAL} from './civic-development.mjs';
import {createCivicFacilityOperations} from './civic-facilities.mjs';
import {INDUSTRIAL_RESERVED} from './industry-map.mjs';
import {GOVERNMENT_RESERVED} from './government-map.mjs';
import {createFireService} from './fire-service.mjs';
import {provisionDutyMeal} from './duty-meals.mjs';
import {createNorthFireDepot} from './north-fire-service.mjs';
import {restoreInitialFireDamage} from './urban-restoration.mjs';
import {apartmentHouseholdCapacity} from './housing-capacity.mjs';
import * as cityGeometry from './city-map.mjs';
import {validDevelopmentLot,planAccessRoad,MIN_ALLEY} from './urban-roads.mjs';
import {BUILDINGS,LOCATIONS,ROADS,WATER,PARK,SPORTS_VENUES,RIVER,RIVERSIDE,contains,overlaps,entrance,blocked,applyUrbanGeometry} from './city-map.mjs';
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));
const live=f=>f.alive&&f.ageYears>=18&&f.ageYears<76&&f.health>35;
const MAX_FIRES=3,MAX_PROJECTS=5,MAX_NORTH_PROJECTS=2,MAX_RECOVERY_PROJECTS=8,MAX_NORTH_RECOVERY_PROJECTS=4,DAY=86400;
export const CONSTRUCTION_WORKFORCE_TARGET=100;
const MAX_SITE_CREW=25;
const BLUEPRINT_FIELDS=['x','z','w','d','h','kind','color','roofColor','facadeColor','style','roofStyle','seed'];
const initialBlueprints=new Map(BUILDINGS.map(b=>[b.id,Object.fromEntries(BLUEPRINT_FIELDS.filter(k=>b[k]!==undefined).map(k=>[k,b[k]]))]));
const NORTH=COUNTRY_IDS.north;
const materialSupplier=country=>country===NORTH?'north-civic-materials':country===COUNTRY_IDS.hawaii?'hawaii-civic-materials':'civic-materials';
const materialDepot=country=>country===NORTH?NORTH_MATERIALS_YARD.id:country===COUNTRY_IDS.hawaii?'island-airport':'construction';
const publicTreasury=country=>country===COUNTRY_IDS.hansdrex?'treasury':`treasury:${country}`;
const available=(f,now,mealIntake=false)=>live(f)&&!hasCountryCommitment(f,now)&&!f.publicServiceRole&&!f.internationalWork&&!f.facilityEmployment&&!f.industrialFreightDuty&&!f.socialTask&&!f.urbanTask&&!f.civicDuty&&!f.airTrip&&!f.privateHeliTrip&&!f.taxiTrip&&!f.taxiJob&&!f.cityService&&!f.taxiJobId&&!f.taxiPassenger&&!f.privateFlight&&!f.onPrivateHelicopter&&!f.sportsSession&&!f.fireEngineDuty&&!f.ambulanceDuty&&!f.onFireEngine&&!f.onAmbulance&&!f.onPlane&&!f.onTrain&&!f.heliPassenger&&!f.arrested&&!f.sleeping&&f.energy>25&&(mealIntake||f.hunger<80)&&!['doctor','school','police','military','power','power-evening','power-night','grid-dispatch','firefighter','paramedic'].includes(f.jobId);

/** Durable civic work: only active incidents and projects cost simulation time. No server animation. */
export function createUrbanWorld({world,random,emit,remember,startJourney,moveFly,needsAndActivities,payAndFinance,isWorkCommitted=()=>false}){
 let byId=new Map();
 const people=()=>[...world().flies,...(world().cityVisitors?.visitors||[]).filter(v=>v.alive&&!v.departed)];
 const raw=()=>world(),now=()=>Number(raw().simulationAgeSeconds||0),u=()=>raw().urbanWorld;
 const fireService=createFireService({world,random,emit,remember,startJourney,moveFly,needsAndActivities,payAndFinance,isWorkCommitted,depots:[createNorthFireDepot({world})]});
 const facilityOperations=createCivicFacilityOperations({world,emit,remember,startJourney,moveFly,needsAndActivities,payAndFinance});
 const roll=()=>{const sample=raw().flies.find(f=>f.alive&&f.brain);return sample?random(sample):.5;};
 const report=(type,text,payload={})=>emit(type,text,payload);
 const ongoing=p=>!['complete','cancelled'].includes(p.stage);
 const activeProject=p=>ongoing(p)&&p.stage!=='queued'&&!p.recoveryPaused;
 const ownership=b=>b?.countryId||b?.warRecovery?.countryId||countryAt(b);
 const projectCountry=p=>p.countryId||ownership(u().buildings[p.buildingId]||building(p.buildingId));
 const projectLimit=country=>country===COUNTRY_IDS.hansdrex?(recoveryPriority(country)?MAX_RECOVERY_PROJECTS:MAX_PROJECTS):(recoveryPriority(country)?MAX_NORTH_RECOVERY_PROJECTS:MAX_NORTH_PROJECTS);
 const territoriesMatch=(a,b)=>a===b;
 const hasSlot=country=>u().projects.filter(p=>activeProject(p)&&territoriesMatch(projectCountry(p),country)).length<projectLimit(country);

 function account(id){return raw().businesses[id] ||= {cash:0,inventory:0,price:0,sector:'civic'};}
 function fundingSource(id){return id==='power-grid'?raw().utilities?.powerPlant:id==='treasury'?raw().treasury:raw().businesses?.[id];}
 function transfer(from,to,amount){amount=Math.max(0,Math.min(Number(amount)||0,Number(from.cash||0)));if(amount<=0)return 0;from.cash-=amount;to.cash=Number(to.cash||0)+amount;raw().totalTransactions=Number(raw().totalTransactions||0)+1;return amount;}
 function geometry(){return {buildings:Object.values(u().buildings),floods:u().floods.filter(f=>f.depth>.35),roads:u().roads.filter(r=>r.stage==='operational')};}
 function apply(){applyUrbanGeometry(geometry());}
 function building(id){return BUILDINGS.find(b=>b.id===id);}
 function stateFor(id){
  const b=building(id);if(!b)return null;
  return u().buildings[id] ||= {id:b.id,x:b.x,z:b.z,w:b.w,d:b.d,h:b.h,kind:b.kind,...(b.countryId?{countryId:b.countryId}:{}),health:100,stage:'operational',progress:1,ownerId:null,lastDamageAt:0};
 }
 function rememberBlueprint(b){
  const original=initialBlueprints.get(b.id);
  if(original)b.originalBlueprint={...original};
  else if(!b.originalBlueprint)b.originalBlueprint=Object.fromEntries(BLUEPRINT_FIELDS.filter(k=>b[k]!==undefined).map(k=>[k,b[k]]));
  if(Number.isFinite(b.originalBlueprint.h))b.originalHeight=b.originalBlueprint.h;
 }
 function restoreBlueprint(b){
  rememberBlueprint(b);
  Object.assign(b,b.originalBlueprint);
 }
 function addLocation(id,p,name){
  let l=LOCATIONS.find(v=>v.id===id);if(!l){l={id,type:'job',name,x:p.x,z:p.z};LOCATIONS.push(l);}else Object.assign(l,{x:p.x,z:p.z});
  return l;
 }
 function taskSite(id,b){
  const candidates=[{x:b.x,z:b.z+b.d/2+3.2},{x:b.x,z:b.z-b.d/2-3.2},{x:b.x+b.w/2+3.2,z:b.z},{x:b.x-b.w/2-3.2,z:b.z}];
  return addLocation(id,candidates.find(p=>!blocked(p))||entrance(b),id.startsWith('CIVIC-FIRE')?'Fire response staging':'Construction staging');
 }
 function ensure(){
  const s=raw();s.urbanWorld ||= {version:1,buildings:{},fires:[],projects:[],floods:[],nextFireAt:now()+DAY*.55,nextGrowthAt:now()+DAY*.7,nextFloodCheckAt:now()+1800,nextProjectId:1,nextIncidentId:1,lastTickAt:now(),completedProjects:0,extinguishedFires:0,displaced:0,materialsDelivered:0,safety:{water:16000,stationCash:0},history:[]};
  const v=s.urbanWorld;v.buildings ||= {};v.fires ||= [];v.projects ||= [];v.floods ||= [];v.history ||= [];v.roads ||= [];v.growthCursor=Number(v.growthCursor||0);v.safety ||= {water:16000,stationCash:0};v.development ||= {version:1,nextReviewAt:now()+DEVELOPMENT_REVIEW_INTERVAL,reviews:0,lastDemand:[],decisions:[]};
  for(const name of ['civic-escrow','civic-materials','civic-recovery'])account(name);
  if(Number(v.northF1VenueVersion||0)<2){
   for(const b of [NORTH_F1_GARAGES,...NORTH_F1_GRANDSTANDS]){
    const stored=v.buildings[b.id];
    if(stored)Object.assign(stored,{x:b.x,z:b.z,w:b.w,d:b.d});
   }
   v.northF1VenueVersion=2;
  }
  if(!v.mainEducationVersion){
   for(const campus of MAIN_SCHOOL_CAMPUSES)Object.assign(stateFor(campus.id),campus,{fundingAccountId:'treasury'});
   v.mainEducationVersion=1;
  }
  if(!v.customsOwnershipVersion){
   for(const base of BORDER_CUSTOMS_BUILDINGS){
    const record=v.buildings[base.id];if(!record)continue;
    Object.assign(record,{x:base.x,z:base.z,countryId:base.countryId});
    if(record.warRecovery?.active)Object.assign(record.warRecovery,{countryId:base.countryId,fundingAccountId:publicTreasury(base.countryId)});
    if(record.recovery?.countryId)record.recovery.countryId=base.countryId;
    for(const project of v.projects.filter(p=>p.buildingId===base.id&&ongoing(p))){
     // An old invoice stays owned by its original payer until refunded.
     // Unstarted recovery can be commissioned afresh by the correct country.
     const priorAccount=project.funding?.accountId||'treasury';
     if(priorAccount!==publicTreasury(base.countryId)){
      refundProject(project);
      project.stage='cancelled';project.pauseReason='customs ownership corrected';
      for(const f of s.flies)if(f.urbanTask?.id===project.id)releaseTask(f);
      if(['cleared','construction'].includes(record.stage))record.stage='collapsed';
     }else project.countryId=base.countryId;
    }
   }
   v.customsOwnershipVersion=1;
  }
  if(!v.materialStockInitialized){account('civic-materials').inventory=2000;v.materialStockInitialized=true;}
  byId=new Map(people().map(f=>[f.id,f]));
  if(!v.publicRepairPolicyVersion){
   for(const b of Object.values(v.buildings))if(b.recovery?.status?.startsWith('awaiting'))b.recovery.nextFundingCheckAt=0;
   v.publicRepairPolicyVersion=1;
  }
  const activeSites=new Set([...v.fires.map(f=>`CIVIC-FIRE-${f.id}`),...v.projects.filter(p=>p.stage!=='complete').map(p=>`CIVIC-SITE-${p.id}`),...v.projects.filter(p=>ongoing(p)&&p.materialCache?.quantity>0).map(p=>`CIVIC-CARGO-${p.id}`)]);
  for(let i=LOCATIONS.length-1;i>=0;i--)if((LOCATIONS[i].id.startsWith('CIVIC-FIRE-')||LOCATIONS[i].id.startsWith('CIVIC-SITE-')||LOCATIONS[i].id.startsWith('CIVIC-CARGO-'))&&!activeSites.has(LOCATIONS[i].id))LOCATIONS.splice(i,1);
  for(const fire of v.fires){const b=building(fire.buildingId)||v.buildings[fire.buildingId];if(b)taskSite(`CIVIC-FIRE-${fire.id}`,b);}
  for(const p of v.projects){const b=v.buildings[p.buildingId]||building(p.buildingId);if(b){if(p.kind!=='new'){rememberBlueprint(b);if(ongoing(p)&&!Number.isFinite(p.acceptedAt))Object.assign(p,recoveryOrder(b),{acceptedAt:Number(p.startedAt??now()),workStartedAt:Number(p.startedAt??now())});}taskSite(`CIVIC-SITE-${p.id}`,b);if(p.materialCache?.quantity>0)addLocation(`CIVIC-CARGO-${p.id}`,p.materialCache,'Reserved construction material pickup');}}
  // Completed location pins are reconstructed from durable buildings on a cold Worker start.
  for(const b of Object.values(v.buildings))if(b.id?.startsWith('CIVIC-')&&b.stage==='operational')addLocation(b.id,b.frontage||b,b.name||'Resident-built premises');
 }
 function restoreRequestedDamage(){restoreInitialFireDamage(raw(),{completeProject:finishProject,reopen:reopenBuilding,report});}
 function init(){ensure();apply();fireService.init();restoreRequestedDamage();apply();return snapshot();}
 function rememberEvent(f,kind,payload){remember(f,kind,payload);f.urbanMemories=(f.urbanMemories||[]).concat({kind,t:now(),...payload}).slice(-8);}
 function householdUnits(b){return Object.values(raw().housing?.households||{}).filter(h=>h.unitId===b.id);}
 function evacuate(b,cause){
  const records=householdUnits(b),householdIds=new Set(records.map(h=>h.id));
  for(const f of people()){
   if(!f.alive)continue;
   const home=householdIds.has(f.householdId)||f.housingUnitId===b.id,inside=f.indoors&&(f.currentLocationId===b.id||home&&Math.hypot(f.x-b.x,f.z-b.z)<Math.max(b.w,b.d));
   if(home&&!f.displacedFrom){f.displacedFrom={buildingId:b.id,homeX:f.homeX,homeZ:f.homeZ,since:now()};u().displaced++;rememberEvent(f,'home_evacuated',{buildingId:b.id,cause});}
   if(inside){
    const exit=entrance(b);Object.assign(f,{x:exit.x,z:exit.z,y:1.1,indoors:false,traveling:false,onTrain:false,sleeping:false,actionUntil:0});
    f.health=clamp(f.health-2);f.stress=clamp(f.stress+15);f.urbanEvacuateUntil=now()+3600;
   }
  }
  for(const business of Object.values(raw().enterprises||{}))if(business.locationId===b.id){business.urbanSuspended=true;business.suspendedReason=cause;}
 }
 function setStage(b,stage){if(b.stage!==stage){b.stage=stage;b.lastStageAt=now();apply();}}
 function ignite(buildingId,reason='electrical fault'){
  ensure();if(u().fires.length>=MAX_FIRES||u().fires.some(f=>f.buildingId===buildingId))return null;
  const b=stateFor(buildingId);if(!b||['collapsed','cleared','construction'].includes(b.stage)||['landmark','mansion','airport'].includes(b.kind))return null;
  rememberBlueprint(b);
  const fire={id:`FIRE-${u().nextIncidentId++}`,buildingId,reason,startedAt:now(),lastAt:now(),intensity:18,detected:false,teamIds:[],waterUsed:0,spreadAttemptAt:now()+3600};u().fires.push(fire);
  report('fire_started',`A fire started at ${buildingId}: ${reason}.`,{buildingId,incidentId:fire.id});evacuate(b,'fire');setStage(b,'unsafe');return fire;
 }
 function assignTask(f,task,b){
  const id=task.type==='fire'?`CIVIC-FIRE-${task.id}`:`CIVIC-SITE-${task.id}`;taskSite(id,b);
  const hungryBuilder=task.type==='build'&&f.hunger>=80,destination=hungryBuilder?materialDepot(ownership(b)):id;
  f.urbanTask={...task,targetId:id,assignedAt:now(),...(hungryBuilder?{phase:'canteen',mealDeadlineAt:now()+DAY}:{})};f.roadDuty=false;f.mobilityShopping=false;f.sleeping=false;f.actionUntil=0;
  startJourney(f,{id:destination,action:hungryBuilder?'reporting to the construction canteen':task.type==='fire'?'responding to fire':'joining a construction crew'});
  if(!f.traveling&&!present(f,destination)){f.urbanTask=null;return false;}return true;
 }
 function releaseTask(f,keepJourney=false){
  if(!f?.urbanTask)return;
  const task=f.urbanTask,p=task.type==='build'&&u().projects.find(p=>p.id===task.id&&ongoing(p));
  if(p&&Number(task.materials||0)>0){
   // Reserved stock is still owned by this contract. Dropping a duty leaves a
   // physical pickup, rather than deleting cargo or creating another invoice.
   p.materialCache={x:f.x,z:f.z,quantity:Number(task.materials)};
   addLocation(`CIVIC-CARGO-${p.id}`,p.materialCache,'Reserved construction material pickup');
   task.materials=0;
  }
  f.urbanTask=null;
  if(keepJourney)return;
  f.actionUntil=0;f.traveling=false;f.routeWaypoints=[];f.vx=f.vz=0;
 }
 function present(f,targetId){
  if(!f?.alive||f.traveling)return false;
  // The movement engine confirms arrival at a legal entrance or sidewalk, which
  // can be offset from the civic map pin. Coordinates are only a local fallback.
  const target=LOCATIONS.find(l=>l.id===targetId);
  const distance=target?Math.hypot(f.x-target.x,f.z-target.z):Infinity;
  return distance<9||(distance<55&&f.currentLocationId===targetId);
 }
 function crewFor(fireOrProject,type,b,max){
  if(type==='fire'&&fireService.enabled()&&ownership(b)!==COUNTRY_IDS.hawaii)return;
  const ref=type==='fire'?fireOrProject.teamIds:fireOrProject.workerIds;
  const country=ownership(b),localOnly=type==='build'||country===COUNTRY_IDS.hawaii;
  for(let i=ref.length-1;i>=0;i--){
   const f=byId.get(ref[i]),task=f?.urbanTask;
   if(type==='build'&&task?.id===fireOrProject.id&&present(f,task.targetId))provisionDutyMeal(raw(),f,country);
   const mealIntake=type==='build'&&task?.phase==='canteen'&&now()<Number(task.mealDeadlineAt||0);
   if(task?.id!==fireOrProject.id||!f?.alive||hasCountryCommitment(f,now())||isWorkCommitted(f)||f.civicDuty||f.cityService||f.taxiJobId||f.taxiPassenger||f.privateFlight||f.onPrivateHelicopter||f.sportsSession||f.health<25||f.energy<18||f.hunger>86&&!mealIntake){
    if(task?.id===fireOrProject.id){releaseTask(f,hasCountryCommitment(f,now())||isWorkCommitted(f));}
    ref.splice(i,1);
   }
  }
  if(now()<Number(fireOrProject.crewCheckAt||0)||ref.length>=max)return;
  if(type==='build'){
   const assigned=raw().flies.filter(f=>f.alive&&f.urbanTask?.type==='build').length;
   max=Math.min(max,ref.length+Math.max(0,CONSTRUCTION_WORKFORCE_TARGET-assigned));
   if(ref.length>=max)return;
  }
  fireOrProject.crewCheckAt=now()+600;
  const distance=f=>Math.hypot(f.x-b.x,f.z-b.z),skill=f=>Number(f.professionSkills?.[type==='fire'?'fireSafety':'construction']||0)+Number(f.traits?.empathy||0);
  const employment=f=>f.jobId==='construction'?2:!f.jobId&&!f.businessId&&!f.businessEmployeeOf?1:0;
  const candidates=raw().flies.filter(f=>available(f,now(),type==='build')&&(!localOnly||countryAt(f)===country)&&!isWorkCommitted(f)&&Number(f.urbanCrewRetryAt||0)<=now()).sort((a,c)=>employment(c)-employment(a)||(distance(a)-skill(a)*24)-(distance(c)-skill(c)*24));
  for(const f of candidates.slice(0,12)){if(assignTask(f,{type,id:fireOrProject.id},b)){ref.push(f.id);if(ref.length>=max)break;}}
 }
 function payCrew(ids,budget,seconds,maxPayment=Infinity){
  const escrow=account('civic-escrow');let paid=0;
  for(const id of ids){const f=byId.get(id);if(!f)continue;const amount=Math.min(Math.max(0,maxPayment-paid),Number(escrow.cash||0),budget/Math.max(1,ids.length)*seconds/3600);if(amount<=0)break;escrow.cash-=amount;f.money=Number(f.money||0)+amount;raw().totalTransactions++;paid+=amount;}
  return paid;
 }
 function detectAndFight(fire,dt){
  const b=stateFor(fire.buildingId);if(!b)return;
  if(!fire.detected){
   const witness=raw().flies.find(f=>f.alive&&!f.indoors&&Math.hypot(f.x-b.x,f.z-b.z)<65);
   if(witness||now()-fire.startedAt>=1800){fire.detected=true;fire.reporterId=witness?.id||'building-alarm';report('fire_reported',`${fire.reporterId} reported the fire at ${b.id}.`,{incidentId:fire.id,buildingId:b.id});if(witness)rememberEvent(witness,'reported_fire',{buildingId:b.id});}
  }
  if(fire.detected)crewFor(fire,'fire',b,4);
  const onsite=fire.teamIds.map(id=>byId.get(id)).filter(f=>!f?.onFireEngine&&(!f?.fireEngineDuty||f.fireEngineDuty.phase==='on-scene')&&present(f,`CIVIC-FIRE-${fire.id}`));
  const supply=fireService.consumeWater(fire,onsite,dt),water=supply?supply.water:Math.min(u().safety.water,onsite.length*dt*.12);if(!supply)u().safety.water-=water;fire.waterUsed+=water;
  const suppression=water*.09;fire.intensity=clamp(fire.intensity+dt*.0016-suppression,0,100);
  const loss=dt*(fire.intensity/100)*.0018;b.health=clamp(b.health-loss);b.lastDamageAt=now();
  if(b.health<18&&b.stage!=='collapsed'){setStage(b,'collapsed');report('building_collapsed',`${b.id} collapsed after fire damage. The site remains blocked until cleared.`,{buildingId:b.id,incidentId:fire.id});}
  else if(b.health<60&&b.stage==='operational')setStage(b,'unsafe');
  if(onsite.length){const source=fireService.fundingAccount(fire),funding=source?transfer(source,account('civic-escrow'),dt*14/3600):0;payCrew(onsite.map(f=>f.id),14,dt,funding);}
  if(!fire.spreadAttempted&&now()>=fire.spreadAttemptAt&&fire.intensity>75&&u().fires.length<MAX_FIRES){
   fire.spreadAttempted=true;const nearest=BUILDINGS.filter(other=>other.id!==b.id&&!u().fires.some(f=>f.buildingId===other.id)&&Math.hypot(other.x-b.x,other.z-b.z)<22&&other.kind!=='landmark').sort((a,c)=>Math.hypot(a.x-b.x,a.z-b.z)-Math.hypot(c.x-b.x,c.z-b.z))[0];
   if(nearest&&roll()<.18+Number(raw().weather?.wind||0)*.2)ignite(nearest.id,'spread from a nearby fire');
  }
  // With no fuel/surviving structure the fire burns out; the damage is still permanent.
  if(fire.intensity<=.05||b.health<=0){
   fire.containedAt=now();u().extinguishedFires++;setStage(b,b.health<18?'collapsed':'damaged');for(const id of fire.teamIds){const crew=byId.get(id);if(!crew?.fireEngineDuty)releaseTask(crew);}
   report('fire_extinguished',`The fire at ${b.id} is out. Inspection and repair are still required.`,{buildingId:b.id,waterUsed:fire.waterUsed});
   b.recoveryReadyAt=now();b.recoveryDeadlineAt=now()+DAY;
   b.lastFireId=fire.id;u().history.push({type:'fire',buildingId:b.id,t:now(),damage:100-b.health});u().history=u().history.slice(-24);
  }
 }
 function estimate(b){return Math.max(220,Math.round(b.w*b.d*(.4+b.h*.018)));}
 function wealth(f){return Math.max(0,Number(f.money||0))+Math.max(0,Number(f.savings||0));}
 function reserveResidents(payers,cost){
  if(payers.reduce((n,f)=>n+wealth(f),0)+1e-8<cost)return null;
  const contributions=[];
  // Share the cost among the adults, reallocating a share if one has less.
  let remaining=cost;
  const richest=[...payers].sort((a,b)=>wealth(a)-wealth(b));
  for(const [i,f] of richest.entries()){
   const amount=Math.min(wealth(f),remaining/(richest.length-i));if(amount<=0)continue;
   const cash=Math.min(Math.max(0,Number(f.money||0)),amount),savings=amount-cash;
   f.money=Number(f.money||0)-cash;f.savings=Number(f.savings||0)-savings;remaining-=amount;
   contributions.push({residentId:f.id,cash,savings,amount});
  }
  account('civic-escrow').cash+=cost-remaining;raw().totalTransactions=Number(raw().totalTransactions||0)+contributions.length;
  return contributions;
 }
 function recoveryCost(b){return Math.ceil(estimate(b)*(b.stage==='collapsed'?1:Math.max(.25,(100-b.health)/100)));}
 function recoveryPriority(country=null){
  const hasFire=id=>u().fires.some(f=>f.buildingId===id&&!f.containedAt);
  if(u().projects.some(p=>ongoing(p)&&p.kind!=='new'&&(!country||territoriesMatch(projectCountry(p),country))&&!hasFire(p.buildingId)))return true;
  const activeIds=new Set(u().projects.filter(ongoing).map(p=>p.buildingId));
  return Object.values(u().buildings).some(b=>{
   if((country&&!territoriesMatch(ownership(b),country))||!['damaged','collapsed'].includes(b.stage)||activeIds.has(b.id)||hasFire(b.id)||Number(b.recovery?.nextFundingCheckAt||0)>now())return false;
   return Number(fundingSource(publicTreasury(ownership(b)))?.cash||0)>=recoveryCost(b);
  });
 }
 function prioritizeRecovery(){
  const recovering=new Set(Object.values(COUNTRY_IDS).filter(country=>recoveryPriority(country)));
  u().recoveryPriority=recovering.size>0;
  for(const p of u().projects){
   if(!ongoing(p)||p.kind!=='new')continue;
   const country=projectCountry(p);
   if(recovering.has(country)){
    if(p.recoveryPaused)continue;
    p.recoveryPaused=true;p.priorityPausedAt??=now();p.pauseReason='disaster recovery priority';
    for(const id of p.workerIds||[]){const f=byId.get(id);if(f?.urbanTask?.id===p.id)releaseTask(f);}
    p.workerIds=[];p.courierId=null;
   }else if(p.recoveryPaused&&hasSlot(country)){
    p.recoveryPaused=false;p.crewCheckAt=0;p.resumedAt=now();
    if(p.pauseReason==='disaster recovery priority')p.pauseReason=null;
   }
  }
 }
 function recoveryOrder(b){
  const requestedAt=Number.isFinite(b.recoveryReadyAt)?b.recoveryReadyAt:Number(b.lastDamageAt||b.lastStageAt||now());
  b.recoveryReadyAt=requestedAt;b.recoveryDeadlineAt??=requestedAt+DAY;
  return {requestedAt,deadlineAt:b.recoveryDeadlineAt,contractorId:`national-reconstruction:${ownership(b)}`};
 }
 function activateRecoveryQueue(){
  const waiting=u().projects.filter(p=>p.stage==='queued'&&p.kind!=='new')
   .sort((a,b)=>Number(a.deadlineAt||a.startedAt)-Number(b.deadlineAt||b.startedAt)||a.startedAt-b.startedAt||a.id.localeCompare(b.id));
  for(const p of waiting){
   if(!hasSlot(projectCountry(p))||u().fires.some(f=>f.buildingId===p.buildingId&&!f.containedAt))continue;
   p.stage=p.queuedStage||'delivery';delete p.queuedStage;p.workStartedAt=now();p.crewCheckAt=0;p.pauseReason=null;
   const b=stateFor(p.buildingId);if(b?.recovery?.projectId===p.id)b.recovery.status='funded';
  }
 }
 function submitProject(buildingId,{ownerId=null,kind='repair',height=null,accessRoads=[],fundingAccountId=null}={}){
  ensure();
  const b=stateFor(buildingId);if(!b||u().fires.some(f=>f.buildingId===buildingId&&!f.containedAt))return null;
  const country=ownership(b);
  if(kind!=='new')rememberBlueprint(b);
  if(kind==='new'&&recoveryPriority(country))return null;
  if(kind!=='new')prioritizeRecovery();
  if((kind==='new'&&!hasSlot(country))||u().projects.some(p=>p.buildingId===buildingId&&ongoing(p)))return null;
  // Acceptance and escrow are independent of the bounded active worksite pool.
  // A disaster backlog must have a paid responsible contractor within one day,
  // rather than remaining invisible behind eight indefinitely occupied slots.
  const queued=kind!=='new'&&!hasSlot(country),order=kind!=='new'?recoveryOrder(b):null;
  const warRecovery=kind!=='new'&&b.warRecovery?.active?b.warRecovery:null;
  if(kind!=='new'){fundingAccountId=publicTreasury(country);ownerId=null;}
  if(kind==='repair'&&b.stage==='collapsed')kind='rebuild';
  const owner=ownerId?byId.get(ownerId):null,roadArea=accessRoads.reduce((sum,r)=>sum+r.w*r.d,0),cost=Math.ceil(estimate(b)*(kind==='new'?2:kind==='rebuild'?1:Math.max(.25,(100-b.health)/100))+Math.ceil(roadArea*1.3));
  let contributions=null;
  if(fundingAccountId){
   const payer=fundingSource(fundingAccountId),reserve=kind!=='new'?0:fundingAccountId==='power-grid'?650:1000;
   if(!payer||Number(payer.cash||0)<cost+reserve){if(kind!=='new')b.recovery={status:'awaiting national funds',cost,countryId:country,nextFundingCheckAt:now()+600};return null;}
   transfer(payer,account('civic-escrow'),cost);
  }else if(owner){
   if(wealth(owner)<cost+100){if(kind!=='new')b.recovery={status:'awaiting owner funds',cost,nextFundingCheckAt:now()+3600};return null;}
   contributions=reserveResidents([owner],cost);
  }else{
   if(Number(raw().treasury.cash||0)<cost)return null;
   transfer(raw().treasury,account('civic-escrow'),cost);
  }
  const payerId=owner?.id||contributions?.[0]?.residentId||null;
  const project={id:`BUILD-${u().nextProjectId++}`,buildingId,countryId:country,ownerId:payerId,kind,stage:b.stage==='collapsed'?'clearance':'delivery',progress:0,materialsRequired:Math.max(20,Math.ceil(b.w*b.d*(['new','rebuild'].includes(kind)?.45:.18))),materialsOrdered:0,materialsDelivered:0,materialsUsed:0,budget:cost,spent:0,workerIds:[],startedAt:now(),lastAt:now(),targetHeight:kind==='new'?(height||b.h):(b.originalHeight||b.h),roadIds:[],roadProgress:0,roadMaterialsRequired:Math.ceil(roadArea*.18),roadMaterialsUsed:0};
  if(order){Object.assign(project,order,{acceptedAt:now()});if(queued){project.queuedStage=project.stage;project.stage='queued';project.pauseReason='national crew scheduling';}else project.workStartedAt=now();}
  if(fundingAccountId)project.funding={type:fundingAccountId==='power-grid'?'utility':'public',accountId:fundingAccountId};
  if(kind!=='new')b.recovery={status:queued?'queued':'funded',projectId:project.id,cost,countryId:country,...order,acceptedAt:now()};
  if(warRecovery){project.warRecovery={countryId:warRecovery.countryId,projectileIds:[...warRecovery.projectileIds]};b.recovery={status:queued?'queued':'funded',projectId:project.id,cost,countryId:warRecovery.countryId,...order,acceptedAt:now()};}
  if(contributions)project.funding={type:'resident',contributions};
  project.materialsRequired+=project.roadMaterialsRequired;
  for(const [index,road]of accessRoads.entries()){const record={...road,id:`ROAD-${project.id}-${index+1}`,projectId:project.id,buildingId,ownerId:owner?.id||null,stage:'planned',progress:0};u().roads.push(record);project.roadIds.push(record.id);}
  u().projects.push(project);if(kind==='new')b.ownerId=owner?.id||b.ownerId;taskSite(`CIVIC-SITE-${project.id}`,b);
  report('construction_contract',`${payerId||'City recovery fund'} commissioned ${kind} at ${buildingId}.`,{buildingId,projectId:project.id,budget:cost});return project;
 }
 function developmentContext(national=false){
  const protectedLand=[cityGeometry.AIRPORT_PARK,cityGeometry.AIRPORT?.runway,cityGeometry.AIRPORT?.apron,cityGeometry.AIRPORT?.terminal,NORTH_AIRPORT.runway,NORTH_AIRPORT.apron,NORTH_FARM,HANSDREX_FRUIT_FARM,NORTH_SPORTS_PARK,NORTH_MILITARY,SPACEPORT,...NORTH_F1_RESERVED].filter(Boolean);
  return {bounds:{minX:national?-cityGeometry.WORLD_HALF+20:480,maxX:cityGeometry.WORLD_HALF-20,minZ:-cityGeometry.WORLD_HALF+20,maxZ:450},roads:ROADS,buildings:BUILDINGS,water:WATER,parks:[PARK,...SPORTS_VENUES,...GOVERNMENT_RESERVED,...INDUSTRIAL_RESERVED,...protectedLand],reserved:u().roads.filter(r=>r.stage!=='operational'),underpasses:cityGeometry.UNDERPASSES||[]};
 }
 function develop(lot,ownerId){
  ensure();const country=countryAt(lot);
  if(!country||recoveryPriority(country)||!hasSlot(country))return null;
  const owner=byId.get(ownerId);if(!owner||!live(owner))return null;
  if(country===NORTH&&countryAt(owner)!==NORTH)return null;
  lot={...lot,id:lot.id||`CIVIC-${Math.round(lot.x)}-${Math.round(lot.z)}`,kind:'civic',countryId:country};
  if(country===NORTH&&(lot.x+lot.w/2>=430||lot.z+lot.d/2>=-588))return null;
  const context=developmentContext(country===NORTH);
  if(country===NORTH)context.roads=context.roads.filter(road=>countryAt(road)===NORTH&&!road.motorway&&!road.motorwayAccess);
  if(!validDevelopmentLot(lot,context)||u().buildings[lot.id])return null;
  const connection=planAccessRoad(lot,context);if(!connection)return null;
  u().buildings[lot.id]={...lot,health:100,stage:'cleared',progress:0,ownerId:owner.id};apply();
  const project=submitProject(lot.id,{ownerId:owner.id,kind:'new',accessRoads:connection.roads});
  if(project){project.frontage=connection.frontage;const firstRoad=u().roads.find(r=>r.id===project.roadIds[0]);if(firstRoad){firstRoad.frontage={...connection.frontage};firstRoad.servesLocationId=lot.id;}rememberEvent(owner,'commissioned_building',{buildingId:lot.id,accessRoads:project.roadIds});return project;}
  delete u().buildings[lot.id];apply();return null;
 }
 function developFacility(typeId,{ownerId=null,lot=null,industrySector=null}={}){
  ensure();const spec=facilitySpec(typeId);if(!spec||recoveryPriority()||u().projects.filter(activeProject).length>=MAX_PROJECTS)return null;
  const owner=spec.funding==='resident'&&ownerId?byId.get(ownerId):null;if(spec.funding==='resident'&&(!owner||!live(owner)))return null;
  if(!lot)return null;
  const record={...lot,id:lot.id||`CIVIC-${typeId}-${Math.round(lot.x)}-${Math.round(lot.z)}`,w:spec.w,d:spec.d,h:spec.h,kind:'civic',facilityType:typeId,usage:spec.usage,name:spec.name,capacity:spec.capacity,
   serviceCapacity:spec.serviceCapacity||spec.capacity,industrySector:spec.industrySector,ownerId:owner?.id||null,fundingAccountId:spec.funding==='resident'?null:spec.funding,district:lot.x>480?'europe':lot.z<-440?'north':'west',createdAt:now()};
  if(industrySector&&['garments','food-production','building-materials','freight-logistics'].includes(industrySector)&&['factory','workshop'].includes(typeId))record.industrySector=industrySector;
  const context=developmentContext(true);if(u().buildings[record.id]||!validDevelopmentLot(record,context))return null;
  const connection=planAccessRoad(record,{...context,roads:context.roads.filter(r=>!r.motorway&&!r.motorwayAccess)});if(!connection)return null;
  const cost=Math.ceil(estimate(record)*2+Math.ceil(connection.roads.reduce((n,r)=>n+r.w*r.d,0)*1.3)),payer=record.fundingAccountId?fundingSource(record.fundingAccountId):null;
  if(owner?wealth(owner)<cost+100:!payer||Number(payer.cash||0)<cost+(record.fundingAccountId==='power-grid'?650:1000))return null;
  record.frontage={...connection.frontage};Object.assign(record,{health:100,stage:'cleared',progress:0});u().buildings[record.id]=record;apply();
  const project=submitProject(record.id,{ownerId:owner?.id||null,kind:'new',accessRoads:connection.roads,fundingAccountId:record.fundingAccountId});
  if(!project){delete u().buildings[record.id];apply();return null;}
  project.facilityType=typeId;project.frontage={...connection.frontage};project.approval={at:now(),reason:'legal land, alley clearance, connected frontage and reserved capital',funding:spec.funding};
  const road=u().roads.find(r=>r.id===project.roadIds[0]);if(road){road.frontage={...connection.frontage};road.servesLocationId=record.id;}
  if(owner)rememberEvent(owner,'commissioned_facility',{buildingId:record.id,facilityType:typeId,projectId:project.id});
  report('facility_approved',`${spec.name} at ${record.id} received a funded construction contract.`,{buildingId:record.id,projectId:project.id,facilityType:typeId,budget:project.budget});return project;
 }
 function planNationalDevelopment(){
  ensure();const d=u().development;d.reviews++;d.lastReviewedAt=now();d.nextReviewAt=now()+DEVELOPMENT_REVIEW_INTERVAL;
  d.lastDemand=nationalDevelopmentDemand(raw());
  if(recoveryPriority()||u().projects.filter(activeProject).length>=MAX_PROJECTS-1){d.lastResult='disaster recovery or crew capacity takes priority';return null;}
  const activeTypes=new Set(u().projects.filter(ongoing).map(p=>p.facilityType).filter(Boolean));
  const needs=d.lastDemand.filter(n=>!activeTypes.has(n.type));if(!needs.length){d.lastResult='existing and planned capacity meets demand';return null;}
  const eligible=raw().flies.filter(f=>live(f)&&!hasCountryCommitment(f,now())&&!isWorkCommitted(f)&&!f.internationalWork&&!f.businessEmployeeOf&&!f.publicServiceRole&&!['doctor','school','police','military','power','power-evening','power-night','grid-dispatch','firefighter','paramedic'].includes(f.jobId));
  let attempts=0;
  for(const need of needs){
   const spec=facilitySpec(need.type),owners=spec.funding==='resident'?eligible.filter(f=>wealth(f)>1800).sort((a,b)=>(Number(b.traits?.ambition??.5)+Number(b.professionSkills?.construction||0)+Math.min(.5,wealth(b)/50000))-(Number(a.traits?.ambition??.5)+Number(a.professionSkills?.construction||0)+Math.min(.5,wealth(a)/50000))||a.id.localeCompare(b.id)).slice(0,4):[null];
   if(!owners.length)continue;
   const payer=spec.funding==='resident'?null:fundingSource(spec.funding);if(payer&&Number(payer.cash||0)<estimate(spec)*2+1000||spec.funding!=='resident'&&!payer)continue;
   const roads=ROADS.filter(r=>!r.motorway&&!r.motorwayAccess&&!r.id?.startsWith('SPACEWORKS-')&&!r.id?.startsWith('NORTH-F1-')&&(Math.abs(r.x)>440||r.z<-440));if(!roads.length)continue;
   for(let i=0;i<48&&attempts<144;i++,attempts++){
    const cursor=++u().growthCursor,hash=n=>{let v=Math.imul(n^0x9e3779b9,0x85ebca6b);v^=v>>>13;return(v>>>0)/4294967296;};
    const anchor=roads[Math.floor(hash(cursor)*roads.length)],horizontal=anchor.w>anchor.d,side=hash(cursor+53)<.5?-1:1,gap=(horizontal?spec.d:spec.w)/2+MIN_ALLEY+7;
    const lot={x:Math.round((anchor.x+(horizontal?(hash(cursor+17)-.5)*anchor.w:side*(anchor.w/2+gap)))/2)*2,z:Math.round((anchor.z+(horizontal?side*(anchor.d/2+gap):(hash(cursor+17)-.5)*anchor.d))/2)*2};
    const owner=owners[i%owners.length],project=developFacility(need.type,{ownerId:owner?.id,lot});
    if(project){project.approval.need={...need};d.lastResult='approved';d.decisions.push({projectId:project.id,buildingId:project.buildingId,type:need.type,at:now(),unmet:need.unmet,ownerId:owner?.id||null});d.decisions=d.decisions.slice(-16);return project;}
   }
  }
  d.lastResult='waiting for suitable land, private investment or funded public budget';return null;
 }
 function grow(country=COUNTRY_IDS.hansdrex){
  ensure();if(recoveryPriority(country)||!hasSlot(country))return;
  const owners=raw().flies.filter(f=>available(f,now())&&(country===NORTH?countryAt(f)===NORTH:countryAt(f)!==NORTH)&&!isWorkCommitted(f)&&wealth(f)>1800).sort((a,b)=>wealth(b)-wealth(a));
  const owner=owners[Math.min(owners.length-1,Math.floor(roll()*Math.min(6,owners.length)))];if(!owner)return;
  const frontier=ROADS.filter(r=>country===NORTH?countryAt(r)===NORTH&&!r.motorway&&!r.motorwayAccess:r.x+r.w/2>480&&r.z-r.d/2<450);if(!frontier.length)return;
  // Explore a bounded batch of grass beside the growing network, not a fixed catalog of lots.
  // Completed developments have no arbitrary count limit: land, alleys, access and capital limit growth.
  for(let attempt=0;attempt<192;attempt++){
   const cursor=++u().growthCursor,hash=(n)=>{let v=Math.imul(n^0x9e3779b9,0x85ebca6b);v^=v>>>13;return (v>>>0)/4294967296;};
   const anchor=frontier[Math.floor(hash(cursor)*frontier.length)],horizontal=anchor.w>anchor.d;
   const along=hash(cursor+17)-.5,side=hash(cursor+53)<.5?-1:1,gap=14+hash(cursor+97)*42;
   const x=Math.round((horizontal?anchor.x+along*anchor.w:anchor.x+side*(anchor.w/2+gap))/2)*2;
   const z=Math.round((horizontal?anchor.z+side*(anchor.d/2+gap):anchor.z+along*anchor.d)/2)*2;
   const lot={x,z,w:10+Math.floor(hash(cursor+131)*3)*2,d:12+Math.floor(hash(cursor+193)*3)*2,h:18+Math.floor(hash(cursor+251)*3)*6};
   if(develop(lot,owner.id))return;
  }
 }
 function advanceProject(p,dt){
  if(!activeProject(p))return;
  const b=stateFor(p.buildingId);if(!b)return;
  if(u().fires.some(f=>f.buildingId===b.id&&!f.containedAt)){p.pauseReason='active fire';return;}
  if(p.kind!=='new'&&!fundExistingRecovery(p)){p.pauseReason='awaiting national repair funds';return;}
  const sites=u().projects.filter(q=>activeProject(q)&&q.stage!=='inspection').length;
  crewFor(p,'build',b,Math.min(MAX_SITE_CREW,Math.max(3,Math.ceil(CONSTRUCTION_WORKFORCE_TARGET/Math.max(1,sites)))));
  const country=projectCountry(p);
  const onsite=p.workerIds.map(id=>byId.get(id)).filter(f=>f?.urbanTask?.phase!=='collecting'&&present(f,`CIVIC-SITE-${p.id}`));
  if(!onsite.length){p.pauseReason='waiting for workers to reach the site';return;}
  if(p.stage==='clearance'){
   const hourlyWages=onsite.length*3,wages=Math.min(Math.max(0,p.budget-p.spent),hourlyWages*dt/3600);p.spent+=payCrew(onsite.map(f=>f.id),hourlyWages,dt,wages);
   p.clearance=clamp(Number(p.clearance||0)+onsite.length*dt/18000,0,1);p.pauseReason=null;
   if(p.clearance>=1){p.stage='delivery';setStage(b,'cleared');report('site_cleared',`Crews cleared the rubble at ${b.id}.`,{projectId:p.id});}
   return;
  }
  if(p.materialsOrdered===0){
   const materialCost=Math.min(p.budget*.45,p.materialsRequired*2);
   const supplier=account(materialSupplier(country));
   if(supplier.inventory<p.materialsRequired){p.pauseReason='supplier out of materials';return;}
   if(account('civic-escrow').cash<materialCost){p.pauseReason='material invoice not funded';return;}
   const paid=transfer(account('civic-escrow'),supplier,materialCost);
   if(paid+1e-6<materialCost){p.pauseReason='material invoice not funded';return;}
   p.spent+=paid;supplier.inventory-=p.materialsRequired;p.materialDepotId=materialDepot(country);p.materialsOrdered=p.materialsRequired;p.deliveryDueAt=now()+1800;
   // One crew member physically collects the ordered stock before it can reach the worksite.
   const courier=onsite[0];courier.urbanTask.phase='collecting';courier.urbanTask.deliveryFor=p.id;startJourney(courier,{id:materialDepot(country),action:'collecting construction materials'});p.courierId=courier.id;
  }
  if(p.materialsDelivered<p.materialsRequired){
   const courier=byId.get(p.courierId);
   if(!courier?.alive||courier.urbanTask?.id!==p.id||!p.workerIds.includes(courier.id)||!['collecting','delivering'].includes(courier.urbanTask.phase)){const replacement=onsite[0];replacement.urbanTask.phase='collecting';replacement.urbanTask.deliveryFor=p.id;p.courierId=replacement.id;startJourney(replacement,{id:p.materialCache?.quantity>0?`CIVIC-CARGO-${p.id}`:p.materialDepotId||materialDepot(country),action:'collecting construction materials'});}
   p.pauseReason='waiting for material delivery';return;
  }
  if(p.roadIds?.length&&Number(p.roadProgress||0)<1){
   const roads=u().roads.filter(r=>p.roadIds.includes(r.id)),length=roads.reduce((sum,r)=>sum+Math.max(r.w,r.d),0),next=Math.min(1,Number(p.roadProgress||0)+onsite.length*dt/Math.max(7200,length*240));
   const hourlyWages=onsite.length*3,wages=Math.min(Math.max(0,p.budget-p.spent),hourlyWages*dt/3600);
   if(wages<=0){p.pauseReason='road labor budget exhausted';return;}
   p.spent+=payCrew(onsite.map(f=>f.id),hourlyWages,dt,wages);
   const used=(next-Number(p.roadProgress||0))*Number(p.roadMaterialsRequired||0);p.materialsUsed+=used;p.roadMaterialsUsed=Number(p.roadMaterialsUsed||0)+used;p.roadProgress=next;p.stage='roadworks';p.pauseReason='building the property access road';
   for(const road of roads){road.stage=next>=1?'operational':'construction';road.progress=next;}
   if(next>=1){apply();u().completedRoads=Number(u().completedRoads||0)+roads.length;report('access_road_opened',`Workers opened ${roads.length} new street segment(s) serving ${b.id}.`,{projectId:p.id,roadIds:p.roadIds});}
   return;
  }
  p.stage='construction';p.pauseReason=null;setStage(b,'construction');
  const increment=onsite.length*dt/(['new','rebuild'].includes(p.kind)?72000:36000);
  const next=Math.min(1,p.progress+increment),needed=(next-p.progress)*(p.materialsRequired-Number(p.roadMaterialsRequired||0));
  if(p.materialsUsed+needed>p.materialsDelivered+1e-6){p.pauseReason='out of materials';return;}
  // Pay for worker time. A lone worker takes longer, but cannot spend a three-person
  // crew's hourly wage and exhaust an otherwise fully funded small repair.
  const hourlyWages=onsite.length*3,wages=Math.min(Math.max(0,p.budget-p.spent),hourlyWages*dt/3600);
  if(wages<=0){p.pauseReason="labor budget exhausted";return;}
  const paid=payCrew(onsite.map(f=>f.id),hourlyWages,dt,wages);p.spent+=paid;
  p.materialsUsed+=needed;p.progress=next;b.progress=next;b.health=clamp(25+75*next);apply();
  if(next>=1){
   p.stage='inspection';p.inspectionAt=now()+600;
  }
 }
 function refundProject(p){
  const refund=Math.max(0,p.budget-p.spent),owner=byId.get(p.ownerId),escrow=account('civic-escrow');
  if(p.funding?.contributions?.length){
   p.refunded=0;
   for(const contribution of p.funding.contributions){
    const payer=byId.get(contribution.residentId),share=refund*contribution.amount/p.budget;
    const payTo=key=>({get cash(){return Number(payer[key]||0);},set cash(value){payer[key]=value;}});
    if(payer){
     const cashShare=share*contribution.cash/contribution.amount;
     p.refunded+=transfer(escrow,payTo('money'),cashShare);
     p.refunded+=transfer(escrow,payTo('savings'),share-cashShare);
    }else p.refunded+=transfer(escrow,raw().treasury,share);
   }
  }else if(p.funding?.accountId)p.refunded=transfer(escrow,fundingSource(p.funding.accountId)||raw().treasury,refund);
  else p.refunded=transfer(escrow,owner?{get cash(){return owner.money;},set cash(v){owner.money=v;}}:raw().treasury,refund);
 }
 function fundExistingRecovery(p){
  const accountId=publicTreasury(projectCountry(p));
  if(p.funding?.accountId===accountId)return true;
  const remaining=Math.max(0,p.budget-p.spent),payer=fundingSource(accountId);
  if(!payer||Number(payer.cash||0)<remaining)return false;
  // Existing paid materials remain on site; refund only the unspent private
  // escrow, then replace it with the same country's public recovery budget.
  refundProject(p);transfer(payer,account('civic-escrow'),remaining);
  p.funding={type:'public',accountId};p.ownerId=null;p.refunded=0;p.publicFundingAt=now();return true;
 }
 function finishProject(p){
  const b=stateFor(p.buildingId);if(!b||p.stage==='complete')return;p.stage='complete';p.completedAt=now();b.h=p.targetHeight;if(p.kind!=='new')restoreBlueprint(b);reopenBuilding(b);u().completedProjects++;
  refundProject(p);
  if(b.recovery?.projectId===p.id)b.recovery.status='restored';
  for(const id of p.workerIds)releaseTask(byId.get(id));
  if(p.kind==='new'){
   const spec=facilitySpec(b.facilityType);if(spec)b.commissionedAt=now();
   addLocation(b.id,b.frontage||b,spec?spec.name:b.usage==='hotel'?'Resident-built hotel':b.usage==='restaurant'?'Resident-built restaurant':`Resident-built ${b.h>25?'tower':'workshop'}`);
   account(b.id).sector=spec?b.facilityType:'resident-development';if(!spec)account(b.id).inventory=12;
   // Finished homes become actual housing capacity. Existing ownership and household IDs stay intact.
   if(!isNonResidentialUsage(b.usage)&&!raw().housing.apartmentBlocks.some(v=>v.id===b.id))raw().housing.apartmentBlocks.push({...b,capacity:apartmentHouseholdCapacity(b.h),capacityUnit:'households',rent:20,occupants:[],purchaseValue:estimate(b)*3});
  }
  report('construction_complete',`${b.id} passed inspection and reopened.`,{projectId:p.id,buildingId:b.id,ownerId:p.ownerId});
 }
 function reopenBuilding(b){
  restoreBlueprint(b);
  b.health=100;b.progress=1;setStage(b,'operational');
  if(b.warRecovery?.active){b.warRecovery.active=false;b.warRecovery.restoredAt=now();}
  for(const f of raw().flies)if(f.displacedFrom?.buildingId===b.id){f.displacedFrom=null;f.actionUntil=0;u().displaced=Math.max(0,u().displaced-1);rememberEvent(f,'home_restored',{buildingId:b.id});}
  for(const business of Object.values(raw().enterprises||{}))if(business.locationId===b.id){business.urbanSuspended=false;delete business.suspendedReason;}
 }
 function floodStep(dt){
  const rain=Number(raw().weather?.precipitation||0),v=u();v.rainAccumulation=clamp(Number(v.rainAccumulation||0)+(rain>.68?dt/7200:-dt/4200),0,2);
  if(now()<v.nextFloodCheckAt)return;v.nextFloodCheckAt=now()+1800;
  if(v.rainAccumulation>1.2&&!v.floods.length){
   v.floods=[{id:'river-west-bank',x:368,z:100,w:22,d:68,depth:.55,startedAt:now()},{id:'river-east-bank',x:490,z:-120,w:20,d:74,depth:.45,startedAt:now()}];apply();report('river_flood','Prolonged rain flooded low riverbank streets; routes are closed until the water recedes.',{zones:v.floods.map(f=>f.id)});
   for(const f of people())if(f.alive&&Number(f.y||1.1)<4&&v.floods.some(z=>contains(z,f))){
    f.health=clamp(f.health-1);f.stress=clamp(f.stress+9);f.actionUntil=0;
    // Preserve committed vehicle routes so a taxi can resume after water recedes.
    if(!hasCountryCommitment(f,now())&&!isWorkCommitted(f)&&!f.cityService&&!f.taxiPassenger&&!f.privateFlight&&!f.onPrivateHelicopter&&!f.fireEngineDuty&&!f.ambulanceDuty&&!f.onFireEngine&&!f.onAmbulance)f.traveling=false;
    if(!hasCountryCommitment(f,now())&&!isWorkCommitted(f)&&!f.cityService&&!f.taxiPassenger&&!f.privateFlight&&!f.onPrivateHelicopter&&!f.fireEngineDuty&&!f.ambulanceDuty&&!f.onFireEngine&&!f.onAmbulance){
     let escape=null;for(let radius=3;radius<=44&&!escape;radius+=3)for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1]]){const p={x:f.x+dx*radius,z:f.z+dz*radius};if(!blocked(p)){escape=p;break;}}
     if(escape)f.urbanFloodEscape={...escape,lastAt:now()};
    }
   }
  }
  if(v.floods.length&&v.rainAccumulation<.3){v.floods=[];apply();report('flood_receded','Riverbank floodwater receded; the streets reopened after inspection.');}
 }
 function tick(gameSeconds,clock){
  ensure();const dt=Math.max(0,Math.min(Number(gameSeconds)||0,Math.max(0,now()-Number(u().lastTickAt||0))));u().lastTickAt=now();if(!dt)return;
  fireService.tick(dt,clock);facilityOperations.tick(dt,clock);
  for(const fire of u().fires.slice())if(!fire.containedAt)detectAndFight(fire,dt);
  restoreRequestedDamage();
  u().fires=u().fires.filter(f=>!f.containedAt||now()-f.containedAt<7200);
  prioritizeRecovery();
  activateRecoveryQueue();
  for(const p of u().projects){
   if(p.recoveryPaused)continue;
   if(p.stage==='inspection'){if(now()>=p.inspectionAt)finishProject(p);}
   else advanceProject(p,dt);
  }
  const history=u().projects.filter(p=>!ongoing(p)&&(p.stage!=='complete'||now()-p.completedAt<DAY*3)).slice(-24);
  u().projects=[...u().projects.filter(ongoing),...history];
  const active=new Set(u().projects.filter(ongoing).map(p=>p.buildingId));
  const occupied=new Set(Object.values(raw().housing?.households||{}).map(h=>h.unitId));
  const priority=b=>b.kind==='customs'?0:b.id==='north-army'?1:['house','apartment'].includes(b.kind)||occupied.has(b.id)?3:2;
  const repairs=Object.values(u().buildings).filter(b=>['damaged','collapsed','cleared'].includes(b.stage)&&!active.has(b.id)&&Number(b.recovery?.nextFundingCheckAt||0)<=now());
  repairs.sort((a,b)=>recoveryOrder(a).deadlineAt-recoveryOrder(b).deadlineAt||priority(a)-priority(b)||Number(b.stage==='collapsed')-Number(a.stage==='collapsed'));
  for(const b of repairs)if(!u().fires.some(f=>f.buildingId===b.id&&!f.containedAt)){
   const project=submitProject(b.id,{kind:b.stage==='cleared'?'rebuild':'repair'});
   if(project)project.crewCheckAt=0;
  }

  if(now()>=u().nextFireAt){
   u().nextFireAt=now()+DAY*(1.6+roll()*2.8);
   const pool=accidentalFireCandidates(BUILDINGS,u());
   const candidate=pool[Math.floor(roll()*pool.length)];if(candidate)ignite(candidate.id,raw().utilities?.powerPlant?.gridOnline===false?'unsafe improvised wiring':'kitchen or electrical fault');
  }
  if(now()>=u().development.nextReviewAt)planNationalDevelopment();
  if(now()>=u().nextGrowthAt){u().nextGrowthAt=now()+DAY*2;grow();grow(NORTH);}
  floodStep(dt);
  // Import stock in response to outstanding orders, including jobs larger
  // than the historic 800-unit refill. Each treasury pays its own depot bills.
  for(const country of [COUNTRY_IDS.hansdrex,NORTH,COUNTRY_IDS.hawaii]){
   const supplier=account(materialSupplier(country));
   const demand=u().projects.filter(p=>activeProject(p)&&!p.materialsOrdered&&territoriesMatch(projectCountry(p),country))
    .reduce((max,p)=>Math.max(max,p.materialsRequired),0);
   const quantity=Math.max(0,Math.ceil(demand-supplier.inventory));
   if(!quantity){
    // Preserve normal domestic stock replenishment when there is no large order.
    if(country===COUNTRY_IDS.hansdrex&&supplier.inventory<300&&supplier.cash>=300){supplier.cash-=300;supplier.inventory+=800;raw().externalTrade||={imports:0,exports:0};raw().externalTrade.imports+=300;}
    continue;
   }
   const cost=Math.ceil(quantity*.375),payer=fundingSource(publicTreasury(country));
   if(supplier.cash+(Math.max(0,Number(payer?.cash||0)-1000))<cost)continue;
   const publicShare=Math.max(0,cost-supplier.cash);
   if(publicShare)transfer(payer,supplier,publicShare);
   supplier.cash-=cost;supplier.inventory+=quantity;
   raw().externalTrade||={imports:0,exports:0};raw().externalTrade.imports+=cost;
  }
  // Water supply refill is a real bill funded from existing treasury, not free event reset.
  if(u().safety.water<2000&&raw().treasury.cash>=120){transfer(raw().treasury,account('civic-materials'),120);u().safety.water+=14000;}
 }
 function handleResident(f,clock){
  if(fireService.handleResident(f,clock))return true;
  if(facilityOperations.handleResident(f,clock))return true;
  if(hasCountryCommitment(f,now())||isWorkCommitted(f)){if(f.urbanTask)releaseTask(f,true);return false;}
  if(f.urbanFloodEscape){
   const e=f.urbanFloodEscape,dx=e.x-f.x,dz=e.z-f.z,dist=Math.hypot(dx,dz),elapsed=Math.max(0,now()-e.lastAt);e.lastAt=now();
   const step=Math.min(dist,elapsed/120*1.4);if(dist>.1){f.x+=dx/dist*step;f.z+=dz/dist*step;}
   f.action='wading out of flooded streets';f.indoors=false;f.sleeping=false;f.traveling=false;f.vx=f.vz=0;
   needsAndActivities(f,clock);payAndFinance(f,clock);
   if(dist<=step+.15){f.urbanFloodEscape=null;f.actionUntil=0;f.y=1.1;rememberEvent(f,'escaped_flood',{});}return true;
  }
  if(f.displacedFrom&&!f.urbanTask){
   const b=stateFor(f.displacedFrom.buildingId),unavailable=b&&b.stage!=='operational';
   if(unavailable&&(f.currentLocationId===f.homeId&&!f.traveling||f.traveling&&f.targetLocationId===f.homeId)){
    f.traveling=false;f.routeWaypoints=[];f.indoors=false;f.sleeping=false;f.actionUntil=0;startJourney(f,{id:'hotel',action:'seeking temporary disaster shelter'});}
   if(unavailable&&f.currentLocationId==='hotel'&&!f.traveling){
    const day=Math.floor(now()/DAY);if(f.displacedFrom.lastShelterDay!==day){const bill=Math.min(2,raw().treasury.cash);transfer(raw().treasury,account('civic-recovery'),bill);f.displacedFrom.lastShelterDay=day;}
    f.action='temporary disaster shelter';f.indoors=true;f.energy=clamp(f.energy+.12);needsAndActivities(f,clock);payAndFinance(f,clock);return true;}
  }
  if(!f.urbanTask)return false;
  const task=f.urbanTask,job=task.type==='fire'?u().fires.find(v=>v.id===task.id&&!v.containedAt):u().projects.find(v=>v.id===task.id&&!['complete','cancelled'].includes(v.stage));
  if(task.type==='build'&&job&&present(f,task.targetId))provisionDutyMeal(raw(),f,projectCountry(job));
  const mealIntake=task.type==='build'&&task.phase==='canteen'&&now()<Number(task.mealDeadlineAt||0);
  if(!job||job.recoveryPaused||!f.alive||f.health<20||f.energy<5||f.hunger>96&&!mealIntake||f.civicDuty||f.cityService||f.taxiJobId||f.taxiPassenger||f.privateFlight||f.onPrivateHelicopter||f.sportsSession){releaseTask(f);return false;}
  const depot=job.materialCache?.quantity>0?`CIVIC-CARGO-${job.id}`:job.materialDepotId||materialDepot(projectCountry(job));
  const canteen=materialDepot(projectCountry(job));
  const destination=task.phase==='canteen'?canteen:task.phase==='collecting'?depot:task.targetId;
  if(!present(f,destination)){
   const progress=task.travelProgress;
   if(!progress||progress.destination!==destination||Math.hypot(f.x-progress.x,f.z-progress.z)>.5){task.travelProgress={x:f.x,z:f.z,at:now(),destination};}
   else if(!f.onTrain&&!f.onPlane&&now()-progress.at>6*3600){f.urbanCrewRetryAt=now()+3600;releaseTask(f);return false;}
   // Restore an owned site/supply itinerary that a lower-priority outing
   // replaced, while allowing a committed passenger to finish the current ride.
   if(f.traveling&&f.targetLocationId!==destination&&!f.onTrain&&!f.onPlane){f.traveling=false;f.routeWaypoints=[];f.vx=f.vz=0;task.nextRouteAt=0;}
  }else task.travelProgress=null;
  if(!f.traveling&&!present(f,destination)&&now()>=Number(task.nextRouteAt||0)){
   if(Number(task.routeFailures||0)>=3){f.urbanCrewRetryAt=now()+3600;releaseTask(f);return false;}
   task.routeFailures=Number(task.routeFailures||0)+1;task.nextRouteAt=now()+600;
   const site=LOCATIONS.find(l=>l.id===destination);
   startJourney(f,{id:destination,action:task.phase==='canteen'?'reporting to the construction canteen':task.phase==='collecting'?'collecting construction materials':task.phase==='delivering'?'delivering construction materials':'returning to the civic site',mode:site&&Math.hypot(f.x-site.x,f.z-site.z)<70?'walk':undefined});
  }
  if(task.type==='build'&&task.phase==='canteen'&&present(f,canteen)){
   provisionDutyMeal(raw(),f,projectCountry(job));
   if(f.hunger<80){task.phase='onsite';task.routeFailures=0;task.nextRouteAt=0;startJourney(f,{id:task.targetId,action:'joining a construction crew'});}
   else f.action='waiting for funded construction canteen stock';
  }
  if(task.type==='build'&&task.phase==='collecting'&&!f.traveling&&f.currentLocationId===depot){
   task.phase='delivering';task.routeFailures=0;task.nextRouteAt=0;task.materials=job.materialCache?.quantity>0?job.materialCache.quantity:job.materialsOrdered-job.materialsDelivered;job.materialCache=null;startJourney(f,{id:task.targetId,action:'delivering construction materials'});
  }else if(task.type==='build'&&task.phase==='delivering'&&present(f,task.targetId)&&now()>=Number(job.deliveryDueAt||0)){
   job.materialsDelivered=Math.min(job.materialsOrdered,job.materialsDelivered+Number(task.materials||0));u().materialsDelivered+=Number(task.materials||0);task.materials=0;task.phase='onsite';report('materials_delivered',`${f.id} delivered materials to ${job.buildingId}.`,{projectId:job.id,materials:job.materialsDelivered});
  }
  moveFly(f);needsAndActivities(f,clock);payAndFinance(f,clock);
  if(present(f,task.targetId)){f.action=task.type==='fire'?'fighting a building fire':job.stage==='clearance'?'clearing rubble':job.stage==='roadworks'?'building a property access road':'working at a construction site';f.actionUntil=now()+600;f.indoors=false;}
  return true;
 }
 function isUnavailable(locationId,f=null){
  const id=f&&locationId===f.homeId?f.housingUnitId:locationId;
  const record=u()?.buildings?.[id];
  if(record&&record.stage!=='operational')return true;
  const point=LOCATIONS.find(l=>l.id===locationId)||building(id);
  return Boolean(point&&u()?.floods?.some(zone=>zone.depth>.35&&contains(zone,point)));
 }
 function addChoices(f,clock,add){
  facilityOperations.addChoices(f,clock,add);
  if(f.displacedFrom){add('hotel','seeking temporary disaster shelter',210);return;}
  // Witnesses and unassigned builders can volunteer, but dispatch only reserves a small team.
  if(f.ageYears>=18&&f.energy>35&&f.health>50&&u().fires.some(v=>!v.containedAt&&v.detected))add('police','reporting an emergency',45+(f.traits?.empathy||0)*20);
 }
 function snapshot(){
  ensure();const assigned=raw().flies.filter(f=>f.alive&&f.urbanTask?.type==='build'),workforce={target:CONSTRUCTION_WORKFORCE_TARGET,assigned:assigned.length,onsite:assigned.filter(f=>present(f,f.urbanTask.targetId)).length,activeSites:u().projects.filter(activeProject).length};return {version:2,workforce,development:{...u().development,lastDemand:u().development.lastDemand.map(n=>({...n})),decisions:u().development.decisions.map(d=>({...d}))},facilityCatalog:Object.values(CIVIC_FACILITY_CATALOG).map(s=>({...s})),facilities:civicFacilities(raw()).map(b=>({id:b.id,facilityType:b.facilityType,capacity:b.capacity,district:b.district,ownerId:b.ownerId,frontage:b.frontage,wagesPaid:Number(b.wagesPaid||0),serviceVisits:Number(b.serviceVisits||0)})),buildings:Object.values(u().buildings).map(b=>({...b})),fires:u().fires.filter(f=>!f.containedAt).map(f=>{const b=stateFor(f.buildingId);return {...f,x:b?.x,z:b?.z,h:b?.h,crew:f.teamIds.map(id=>byId.get(id)).filter(v=>present(v,`CIVIC-FIRE-${f.id}`)).map(v=>({x:v.x,z:v.z}))};}),projects:u().projects.filter(p=>p.stage!=='complete').map(p=>({...p,x:u().buildings[p.buildingId]?.x,z:u().buildings[p.buildingId]?.z})),roads:u().roads.map(r=>({...r})),completedRoads:Number(u().completedRoads||0),fireService:fireService.snapshot(),floods:u().floods.map(f=>({...f})),completedProjects:u().completedProjects,extinguishedFires:u().extinguishedFires,displaced:u().displaced,water:Math.round(u().safety.water),materialsDelivered:u().materialsDelivered,history:u().history.slice(-12)};
 }
 function applyWarDamage({buildingId,projectileId,damage=48,fire=true,countryId,fundingAccountId,conflictId=null}){
  ensure();const b=stateFor(buildingId);if(!b||!projectileId||!countryId||!fundingAccountId)return false;
  u().warDamageReceipts||={};if(u().warDamageReceipts[projectileId])return false;
  u().warDamageReceipts[projectileId]={buildingId,countryId,at:now(),damage};const keys=Object.keys(u().warDamageReceipts);for(const key of keys.slice(0,-256))delete u().warDamageReceipts[key];
  for(const p of u().projects.filter(p=>p.buildingId===buildingId&&ongoing(p))){p.stage='cancelled';p.cancelledAt=now();p.cancelReason='new war damage';refundProject(p);for(const id of p.workerIds){const f=byId.get(id);if(f?.urbanTask?.id!==p.id)continue;if(f.onTrain||f.onPlane)f.urbanTask=null;else releaseTask(f);}}
  rememberBlueprint(b);b.health=clamp(b.health-Math.max(0,Number(damage)||0));b.lastDamageAt=now();b.recoveryReadyAt=now();b.recoveryDeadlineAt=now()+DAY;b.warRecovery={active:true,countryId,fundingAccountId,conflictId,at:now(),projectileIds:[...(b.warRecovery?.projectileIds||[]),projectileId].slice(-24)};
  evacuate(b,'war impact');setStage(b,b.health<18?'collapsed':'damaged');
  if(fire&&b.health>=18){const incident=ignite(buildingId,'war projectile impact');if(incident){incident.countryId=countryId;incident.fundingAccountId=fundingAccountId;incident.projectileId=projectileId;}}
  apply();report('war_building_damage',`A projectile damaged ${buildingId}; ${countryId} is responsible for its recovery budget.`,{buildingId,projectileId,countryId,conflictId});return true;
 }
 function fundWarRepair(buildingId){ensure();const b=stateFor(buildingId);return b?.warRecovery?.active?submitProject(buildingId,{fundingAccountId:b.warRecovery.fundingAccountId}):null;}
 return {init,tick,handleResident,addChoices,snapshot,ignite,submitProject,applyWarDamage,fundWarRepair,grow,develop,developFacility,planNationalDevelopment,completedFacilities:()=>civicFacilities(raw()),serviceCapacity:clock=>facilityOperations.capacity(clock),isUnavailable,fireService};
}
