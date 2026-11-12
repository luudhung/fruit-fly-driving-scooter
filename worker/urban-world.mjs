import {createFireService} from './fire-service.mjs';
import {restoreInitialFireDamage} from './urban-restoration.mjs';
import {apartmentHouseholdCapacity} from './housing-capacity.mjs';
import * as cityGeometry from './city-map.mjs';
import {validDevelopmentLot,planAccessRoad,MIN_ALLEY} from './urban-roads.mjs';
import {BUILDINGS,LOCATIONS,ROADS,WATER,PARK,SPORTS_VENUES,RIVER,RIVERSIDE,contains,overlaps,entrance,blocked,applyUrbanGeometry} from './city-map.mjs';
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));
const live=f=>f.alive&&f.ageYears>=18&&f.ageYears<76&&f.health>35;
const MAX_FIRES=3,MAX_PROJECTS=5,DAY=86400;
const available=f=>live(f)&&!f.socialTask&&!f.urbanTask&&!f.civicDuty&&!f.airTrip&&!f.privateHeliTrip&&!f.taxiTrip&&!f.taxiJob&&!f.cityService&&!f.taxiJobId&&!f.taxiPassenger&&!f.privateFlight&&!f.onPrivateHelicopter&&!f.sportsSession&&!f.fireEngineDuty&&!f.ambulanceDuty&&!f.onFireEngine&&!f.onAmbulance&&!f.onPlane&&!f.onTrain&&!f.heliPassenger&&!f.arrested&&!f.sleeping&&f.energy>25&&f.hunger<80&&!['doctor','school','police','power','power-evening','power-night','grid-dispatch','firefighter','paramedic'].includes(f.jobId);

/** Durable civic work: only active incidents and projects cost simulation time. No server animation. */
export function createUrbanWorld({world,random,emit,remember,startJourney,moveFly,needsAndActivities,payAndFinance}){
 let byId=new Map();
 const people=()=>[...world().flies,...(world().cityVisitors?.visitors||[]).filter(v=>v.alive&&!v.departed)];
 const raw=()=>world(),now=()=>Number(raw().simulationAgeSeconds||0),u=()=>raw().urbanWorld;
 const fireService=createFireService({world,random,emit,remember,startJourney,moveFly,needsAndActivities,payAndFinance});
 const roll=()=>{const sample=raw().flies.find(f=>f.alive&&f.brain);return sample?random(sample):.5;};
 const report=(type,text,payload={})=>emit(type,text,payload);
 const ongoing=p=>!['complete','cancelled'].includes(p.stage);
 const activeProject=p=>ongoing(p)&&!p.recoveryPaused;
 function account(id){return raw().businesses[id] ||= {cash:0,inventory:0,price:0,sector:'civic'};}
 function transfer(from,to,amount){amount=Math.max(0,Math.min(Number(amount)||0,Number(from.cash||0)));if(amount<=0)return 0;from.cash-=amount;to.cash=Number(to.cash||0)+amount;raw().totalTransactions=Number(raw().totalTransactions||0)+1;return amount;}
 function geometry(){return {buildings:Object.values(u().buildings),floods:u().floods.filter(f=>f.depth>.35),roads:u().roads.filter(r=>r.stage==='operational')};}
 function apply(){applyUrbanGeometry(geometry());}
 function building(id){return BUILDINGS.find(b=>b.id===id);}
 function stateFor(id){
  const b=building(id);if(!b)return null;
  return u().buildings[id] ||= {id:b.id,x:b.x,z:b.z,w:b.w,d:b.d,h:b.h,kind:b.kind,health:100,stage:'operational',progress:1,ownerId:null,lastDamageAt:0};
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
  const v=s.urbanWorld;v.buildings ||= {};v.fires ||= [];v.projects ||= [];v.floods ||= [];v.history ||= [];v.roads ||= [];v.growthCursor=Number(v.growthCursor||0);v.safety ||= {water:16000,stationCash:0};
  for(const name of ['civic-escrow','civic-materials','civic-recovery'])account(name);
  if(!v.materialStockInitialized){account('civic-materials').inventory=2000;v.materialStockInitialized=true;}
  byId=new Map(people().map(f=>[f.id,f]));
  const activeSites=new Set([...v.fires.map(f=>`CIVIC-FIRE-${f.id}`),...v.projects.filter(p=>p.stage!=='complete').map(p=>`CIVIC-SITE-${p.id}`)]);
  for(let i=LOCATIONS.length-1;i>=0;i--)if((LOCATIONS[i].id.startsWith('CIVIC-FIRE-')||LOCATIONS[i].id.startsWith('CIVIC-SITE-'))&&!activeSites.has(LOCATIONS[i].id))LOCATIONS.splice(i,1);
  for(const fire of v.fires){const b=building(fire.buildingId)||v.buildings[fire.buildingId];if(b)taskSite(`CIVIC-FIRE-${fire.id}`,b);}
  for(const p of v.projects){const b=v.buildings[p.buildingId]||building(p.buildingId);if(b)taskSite(`CIVIC-SITE-${p.id}`,b);}
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
  b.originalHeight=Number(b.originalHeight||b.h);
  const fire={id:`FIRE-${u().nextIncidentId++}`,buildingId,reason,startedAt:now(),lastAt:now(),intensity:18,detected:false,teamIds:[],waterUsed:0,spreadAttemptAt:now()+3600};u().fires.push(fire);
  report('fire_started',`A fire started at ${buildingId}: ${reason}.`,{buildingId,incidentId:fire.id});evacuate(b,'fire');setStage(b,'unsafe');return fire;
 }
 function assignTask(f,task,b){
  const id=task.type==='fire'?`CIVIC-FIRE-${task.id}`:`CIVIC-SITE-${task.id}`;taskSite(id,b);
  f.urbanTask={...task,targetId:id,assignedAt:now()};f.roadDuty=false;f.mobilityShopping=false;f.sleeping=false;f.actionUntil=0;
  startJourney(f,{id,action:task.type==='fire'?'responding to fire':'joining a construction crew'});
  if(!f.traveling&&!present(f,id)){f.urbanTask=null;return false;}return true;
 }
 function releaseTask(f){if(!f?.urbanTask)return;f.urbanTask=null;f.actionUntil=0;f.traveling=false;f.routeWaypoints=[];f.vx=f.vz=0;}
 function present(f,targetId){
  if(!f?.alive||f.traveling)return false;
  // The movement engine confirms arrival at a legal entrance or sidewalk, which
  // can be offset from the civic map pin. Coordinates are only a local fallback.
  const target=LOCATIONS.find(l=>l.id===targetId);
  const distance=target?Math.hypot(f.x-target.x,f.z-target.z):Infinity;
  return distance<9||(distance<55&&f.currentLocationId===targetId);
 }
 function crewFor(fireOrProject,type,b,max){
  if(type==='fire'&&fireService.enabled())return;
  const ref=type==='fire'?fireOrProject.teamIds:fireOrProject.workerIds;
  for(let i=ref.length-1;i>=0;i--){
   const f=byId.get(ref[i]),task=f?.urbanTask;
   if(task?.id!==fireOrProject.id||!f?.alive||f.civicDuty||f.cityService||f.taxiJobId||f.taxiPassenger||f.privateFlight||f.onPrivateHelicopter||f.sportsSession||f.health<25||f.energy<8||f.hunger>95){
    if(task?.id===fireOrProject.id)releaseTask(f);
    ref.splice(i,1);
   }
  }
  if(now()<Number(fireOrProject.crewCheckAt||0)||ref.length>=max)return;
  fireOrProject.crewCheckAt=now()+600;
  const distance=f=>Math.hypot(f.x-b.x,f.z-b.z),skill=f=>Number(f.professionSkills?.[type==='fire'?'fireSafety':'construction']||0)+Number(f.traits?.empathy||0);
  const candidates=raw().flies.filter(f=>available(f)&&Number(f.urbanCrewRetryAt||0)<=now()).sort((a,c)=>(distance(a)-skill(a)*24)-(distance(c)-skill(c)*24));
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
  const water=Math.min(u().safety.water,onsite.length*dt*.12);u().safety.water-=water;fire.waterUsed+=water;
  const suppression=water*.09;fire.intensity=clamp(fire.intensity+dt*.0016-suppression,0,100);
  const loss=dt*(fire.intensity/100)*.0018;b.health=clamp(b.health-loss);b.lastDamageAt=now();
  if(b.health<18&&b.stage!=='collapsed'){setStage(b,'collapsed');report('building_collapsed',`${b.id} collapsed after fire damage. The site remains blocked until cleared.`,{buildingId:b.id,incidentId:fire.id});}
  else if(b.health<60&&b.stage==='operational')setStage(b,'unsafe');
  if(onsite.length){const funding=transfer(raw().treasury,account('civic-escrow'),dt*14/3600);payCrew(onsite.map(f=>f.id),14,dt,funding);}
  if(!fire.spreadAttempted&&now()>=fire.spreadAttemptAt&&fire.intensity>75&&u().fires.length<MAX_FIRES){
   fire.spreadAttempted=true;const nearest=BUILDINGS.filter(other=>other.id!==b.id&&!u().fires.some(f=>f.buildingId===other.id)&&Math.hypot(other.x-b.x,other.z-b.z)<22&&other.kind!=='landmark').sort((a,c)=>Math.hypot(a.x-b.x,a.z-b.z)-Math.hypot(c.x-b.x,c.z-b.z))[0];
   if(nearest&&roll()<.18+Number(raw().weather?.wind||0)*.2)ignite(nearest.id,'spread from a nearby fire');
  }
  // With no fuel/surviving structure the fire burns out; the damage is still permanent.
  if(fire.intensity<=.05||b.health<=0){
   fire.containedAt=now();u().extinguishedFires++;setStage(b,b.health<18?'collapsed':'damaged');for(const id of fire.teamIds){const crew=byId.get(id);if(!crew?.fireEngineDuty)releaseTask(crew);}
   report('fire_extinguished',`The fire at ${b.id} is out. Inspection and repair are still required.`,{buildingId:b.id,waterUsed:fire.waterUsed});
   b.lastFireId=fire.id;u().history.push({type:'fire',buildingId:b.id,t:now(),damage:100-b.health});u().history=u().history.slice(-24);
  }
 }
 function estimate(b){return Math.max(220,Math.round(b.w*b.d*(.4+b.h*.018)));}
 function residential(b){return ['house','apartment'].includes(b.kind)||householdUnits(b).length>0;}
 function householdPayers(b){
  const households=householdUnits(b),ids=new Set(households.flatMap(h=>h.members||[]));
  const payers=raw().flies.filter(f=>f.alive&&f.ageYears>=18&&(ids.has(f.id)||f.housingUnitId===b.id)).sort((a,b)=>a.id.localeCompare(b.id));
  return {householdIds:households.map(h=>h.id),payers};
 }
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
 function recoveryPriority(){
  const hasFire=id=>u().fires.some(f=>f.buildingId===id&&!f.containedAt);
  if(u().projects.some(p=>ongoing(p)&&p.kind!=='new'&&!hasFire(p.buildingId)))return true;
  const activeIds=new Set(u().projects.filter(ongoing).map(p=>p.buildingId));
  return Object.values(u().buildings).some(b=>{
   if(!['damaged','collapsed'].includes(b.stage)||activeIds.has(b.id)||hasFire(b.id)||Number(b.recovery?.nextFundingCheckAt||0)>now())return false;
   const cost=recoveryCost(b),recovery=residential(b)?householdPayers(b):null;
   return recovery&&(recovery.payers.length||recovery.householdIds.length)
    ?recovery.payers.reduce((sum,f)=>sum+wealth(f),0)+1e-8>=cost
    :Number(raw().treasury.cash||0)>=cost;
  });
 }
 function prioritizeRecovery(){
  const priority=recoveryPriority();u().recoveryPriority=priority;
  if(priority){
   for(const p of u().projects){
    if(!ongoing(p)||p.kind!=='new')continue;
    p.recoveryPaused=true;p.priorityPausedAt??=now();p.pauseReason='disaster recovery priority';
    for(const id of p.workerIds||[]){const f=byId.get(id);if(f?.urbanTask?.id===p.id)releaseTask(f);}
    // Paid stock remains assigned to this project. A resumed courier carries the
    // outstanding quantity; neither the invoice nor escrow reservation repeats.
    p.workerIds=[];p.courierId=null;
   }
   return;
  }
  let available=Math.max(0,MAX_PROJECTS-u().projects.filter(activeProject).length);
  for(const p of u().projects.filter(p=>ongoing(p)&&p.recoveryPaused).sort((a,b)=>a.startedAt-b.startedAt)){
   if(available--<=0)break;
   p.recoveryPaused=false;p.crewCheckAt=0;p.resumedAt=now();
   if(p.pauseReason==='disaster recovery priority')p.pauseReason=null;
  }
 }
 function submitProject(buildingId,{ownerId=null,kind='repair',height=null,accessRoads=[]}={}){
  ensure();if(kind==='new'&&recoveryPriority())return null;
  if(kind!=='new')prioritizeRecovery();
  if(u().projects.filter(activeProject).length>=MAX_PROJECTS||u().projects.some(p=>p.buildingId===buildingId&&ongoing(p)))return null;
  const b=stateFor(buildingId);if(!b||u().fires.some(f=>f.buildingId===buildingId&&!f.containedAt))return null;
  if(kind==='repair'&&b.stage==='collapsed')kind='rebuild';
  const recovery=kind!=='new'&&residential(b)?householdPayers(b):null;
  const owner=ownerId?byId.get(ownerId):null,roadArea=accessRoads.reduce((sum,r)=>sum+r.w*r.d,0),cost=Math.ceil(estimate(b)*(kind==='new'?2:kind==='rebuild'?1:Math.max(.25,(100-b.health)/100))+Math.ceil(roadArea*1.3));
  let contributions=null;
  if(recovery?.payers.length||recovery?.householdIds.length){
   contributions=reserveResidents(recovery.payers,cost);
   if(!contributions){b.recovery={status:'awaiting household funds',cost,householdIds:recovery.householdIds,nextFundingCheckAt:now()+3600};return null;}
  }else if(owner){
   if(wealth(owner)<cost+100)return null;
   contributions=reserveResidents([owner],cost);
  }else{
   if(Number(raw().treasury.cash||0)<cost)return null;
   transfer(raw().treasury,account('civic-escrow'),cost);
  }
  const payerId=owner?.id||contributions?.[0]?.residentId||null;
  const project={id:`BUILD-${u().nextProjectId++}`,buildingId,ownerId:payerId,kind,stage:b.stage==='collapsed'?'clearance':'delivery',progress:0,materialsRequired:Math.max(20,Math.ceil(b.w*b.d*(['new','rebuild'].includes(kind)?.45:.18))),materialsOrdered:0,materialsDelivered:0,materialsUsed:0,budget:cost,spent:0,workerIds:[],startedAt:now(),lastAt:now(),targetHeight:kind==='new'?(height||b.h):(b.originalHeight||b.h),roadIds:[],roadProgress:0,roadMaterialsRequired:Math.ceil(roadArea*.18),roadMaterialsUsed:0};
  if(contributions){project.funding={type:recovery?'household':'resident',householdIds:recovery?.householdIds||[],contributions};}
  if(recovery)b.recovery={status:'funded',projectId:project.id,cost,householdIds:recovery.householdIds};  project.materialsRequired+=project.roadMaterialsRequired;
  for(const [index,road]of accessRoads.entries()){const record={...road,id:`ROAD-${project.id}-${index+1}`,projectId:project.id,buildingId,ownerId:owner?.id||null,stage:'planned',progress:0};u().roads.push(record);project.roadIds.push(record.id);}
  u().projects.push(project);if(kind==='new')b.ownerId=owner?.id||b.ownerId;taskSite(`CIVIC-SITE-${project.id}`,b);
  report('construction_contract',`${payerId||'City recovery fund'} commissioned ${kind} at ${buildingId}.`,{buildingId,projectId:project.id,budget:cost});return project;
 }
 function developmentContext(){
  return {bounds:{minX:480,maxX:cityGeometry.WORLD_HALF-20,minZ:-cityGeometry.WORLD_HALF+20,maxZ:450},roads:ROADS,buildings:BUILDINGS,water:WATER,parks:[PARK,...SPORTS_VENUES],reserved:u().roads.filter(r=>r.stage!=='operational'),underpasses:cityGeometry.UNDERPASSES||[]};
 }
 function develop(lot,ownerId){
  ensure();if(recoveryPriority()||u().projects.filter(activeProject).length>=MAX_PROJECTS)return null;
  const owner=byId.get(ownerId);if(!owner||!live(owner))return null;
  lot={...lot,id:lot.id||`CIVIC-${Math.round(lot.x)}-${Math.round(lot.z)}`,kind:'civic'};
  if(!validDevelopmentLot(lot,developmentContext())||u().buildings[lot.id])return null;
  const connection=planAccessRoad(lot,developmentContext());if(!connection)return null;
  u().buildings[lot.id]={...lot,health:100,stage:'cleared',progress:0,ownerId:owner.id};apply();
  const project=submitProject(lot.id,{ownerId:owner.id,kind:'new',accessRoads:connection.roads});
  if(project){project.frontage=connection.frontage;const firstRoad=u().roads.find(r=>r.id===project.roadIds[0]);if(firstRoad){firstRoad.frontage={...connection.frontage};firstRoad.servesLocationId=lot.id;}rememberEvent(owner,'commissioned_building',{buildingId:lot.id,accessRoads:project.roadIds});return project;}
  delete u().buildings[lot.id];apply();return null;
 }
 function grow(){
  ensure();if(recoveryPriority()||u().projects.filter(activeProject).length>=MAX_PROJECTS-1)return;
  const owners=raw().flies.filter(f=>available(f)&&Number(f.money||0)+Number(f.savings||0)>1800).sort((a,b)=>(b.money+b.savings)-(a.money+a.savings));
  const owner=owners[Math.min(owners.length-1,Math.floor(roll()*Math.min(6,owners.length)))];if(!owner)return;
  const frontier=ROADS.filter(r=>r.x+r.w/2>480&&r.z-r.d/2<450);if(!frontier.length)return;
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
  crewFor(p,'build',b,3);
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
   const supplier=account('civic-materials');
   if(supplier.inventory<p.materialsRequired){p.pauseReason='supplier out of materials';return;}
   if(account('civic-escrow').cash<materialCost){p.pauseReason='material invoice not funded';return;}
   const paid=transfer(account('civic-escrow'),account('civic-materials'),materialCost);
   if(paid+1e-6<materialCost){p.pauseReason='material invoice not funded';return;}
   p.spent+=paid;supplier.inventory-=p.materialsRequired;p.materialsOrdered=p.materialsRequired;p.deliveryDueAt=now()+1800;
   // One crew member physically collects the ordered stock before it can reach the worksite.
   const courier=onsite[0];courier.urbanTask.phase='collecting';courier.urbanTask.deliveryFor=p.id;startJourney(courier,{id:'construction',action:'collecting construction materials'});p.courierId=courier.id;
  }
  if(p.materialsDelivered<p.materialsRequired){
   const courier=byId.get(p.courierId);
   if(!courier?.alive||courier.urbanTask?.id!==p.id){const replacement=onsite[0];replacement.urbanTask.phase='collecting';replacement.urbanTask.deliveryFor=p.id;p.courierId=replacement.id;startJourney(replacement,{id:'construction',action:'collecting construction materials'});}
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
 function finishProject(p){
  const b=stateFor(p.buildingId);if(!b||p.stage==='complete')return;p.stage='complete';p.completedAt=now();b.h=p.targetHeight;reopenBuilding(b);u().completedProjects++;
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
  }else p.refunded=transfer(escrow,owner?{get cash(){return owner.money;},set cash(v){owner.money=v;}}:raw().treasury,refund);
  if(b.recovery?.projectId===p.id)b.recovery.status='restored';
  for(const id of p.workerIds)releaseTask(byId.get(id));
  if(p.kind==='new'){
   addLocation(b.id,b,b.usage==='hotel'?'Resident-built hotel':b.usage==='restaurant'?'Resident-built restaurant':`Resident-built ${b.h>25?'tower':'workshop'}`);
   account(b.id).sector='resident-development';account(b.id).inventory=12;
   // Finished homes become actual housing capacity. Existing ownership and household IDs stay intact.
   if(!['hotel','restaurant'].includes(b.usage)&&!raw().housing.apartmentBlocks.some(v=>v.id===b.id))raw().housing.apartmentBlocks.push({...b,capacity:apartmentHouseholdCapacity(b.h),capacityUnit:'households',rent:20,occupants:[],purchaseValue:estimate(b)*3});
  }
  report('construction_complete',`${b.id} passed inspection and reopened.`,{projectId:p.id,buildingId:b.id,ownerId:p.ownerId});
 }
 function reopenBuilding(b){
  b.health=100;b.progress=1;setStage(b,'operational');
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
    if(!f.cityService&&!f.taxiPassenger&&!f.privateFlight&&!f.onPrivateHelicopter&&!f.fireEngineDuty&&!f.ambulanceDuty&&!f.onFireEngine&&!f.onAmbulance)f.traveling=false;
    if(!f.cityService&&!f.taxiPassenger&&!f.privateFlight&&!f.onPrivateHelicopter&&!f.fireEngineDuty&&!f.ambulanceDuty&&!f.onFireEngine&&!f.onAmbulance){
     let escape=null;for(let radius=3;radius<=44&&!escape;radius+=3)for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1]]){const p={x:f.x+dx*radius,z:f.z+dz*radius};if(!blocked(p)){escape=p;break;}}
     if(escape)f.urbanFloodEscape={...escape,lastAt:now()};
    }
   }
  }
  if(v.floods.length&&v.rainAccumulation<.3){v.floods=[];apply();report('flood_receded','Riverbank floodwater receded; the streets reopened after inspection.');}
 }
 function tick(gameSeconds,clock){
  ensure();const dt=Math.max(0,Math.min(Number(gameSeconds)||0,Math.max(0,now()-Number(u().lastTickAt||0))));u().lastTickAt=now();if(!dt)return;
  fireService.tick(dt,clock);
  for(const fire of u().fires.slice())if(!fire.containedAt)detectAndFight(fire,dt);
  restoreRequestedDamage();
  u().fires=u().fires.filter(f=>!f.containedAt||now()-f.containedAt<7200);
  prioritizeRecovery();
  for(const p of u().projects){
   if(p.recoveryPaused)continue;
   if(p.stage==='inspection'){if(now()>=p.inspectionAt)finishProject(p);}
   else advanceProject(p,dt);
  }
  const history=u().projects.filter(p=>!ongoing(p)&&(p.stage!=='complete'||now()-p.completedAt<DAY*3)).slice(-24);
  u().projects=[...u().projects.filter(ongoing),...history];
  const active=new Set(u().projects.filter(activeProject).map(p=>p.buildingId));
  if(active.size<MAX_PROJECTS){
   const occupied=new Set(Object.values(raw().housing?.households||{}).map(h=>h.unitId));
   const isHome=b=>['house','apartment'].includes(b.kind)||occupied.has(b.id);
   const repairs=Object.values(u().buildings).filter(b=>['damaged','collapsed'].includes(b.stage)&&!active.has(b.id)&&Number(b.recovery?.nextFundingCheckAt||0)<=now());
   repairs.sort((a,b)=>Number(isHome(b))-Number(isHome(a))||Number(b.stage==='collapsed')-Number(a.stage==='collapsed'));
   for(const b of repairs){
    if(active.size>=MAX_PROJECTS)break;
    if(!u().fires.some(f=>f.buildingId===b.id&&!f.containedAt)&&submitProject(b.id))active.add(b.id);
   }
  }

  if(now()>=u().nextFireAt){
   u().nextFireAt=now()+DAY*(1.6+roll()*2.8);
   const pool=BUILDINGS.filter(b=>['block','house','destination','civic'].includes(b.kind)&&b.x<900&&!u().projects.some(p=>p.buildingId===b.id&&p.stage!=='complete'));
   const candidate=pool[Math.floor(roll()*pool.length)];if(candidate)ignite(candidate.id,raw().utilities?.powerPlant?.gridOnline===false?'unsafe improvised wiring':'kitchen or electrical fault');
  }
  if(now()>=u().nextGrowthAt){u().nextGrowthAt=now()+DAY*2;grow();}
  floodStep(dt);
  // Finite supplier stocks are replenished through a paid external import, recorded once.
  const supplier=account('civic-materials');
  if(supplier.inventory<300&&supplier.cash>=300){supplier.cash-=300;supplier.inventory+=800;raw().externalTrade ||= {imports:0,exports:0};raw().externalTrade.imports+=300;}
  // Water supply refill is a real bill funded from existing treasury, not free event reset.
  if(u().safety.water<2000&&raw().treasury.cash>=120){transfer(raw().treasury,account('civic-materials'),120);u().safety.water+=14000;}
 }
 function handleResident(f,clock){
  if(fireService.handleResident(f,clock))return true;
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
  if(!job||job.recoveryPaused||!f.alive||f.health<20||f.energy<5||f.hunger>96||f.civicDuty||f.cityService||f.taxiJobId||f.taxiPassenger||f.privateFlight||f.onPrivateHelicopter||f.sportsSession){releaseTask(f);return false;}
  const destination=task.phase==='collecting'?'construction':task.targetId;
  if(!f.traveling&&!present(f,destination)&&now()>=Number(task.nextRouteAt||0)){
   if(Number(task.routeFailures||0)>=3){f.urbanCrewRetryAt=now()+3600;releaseTask(f);return false;}
   task.routeFailures=Number(task.routeFailures||0)+1;task.nextRouteAt=now()+600;
   const site=LOCATIONS.find(l=>l.id===destination);
   startJourney(f,{id:destination,action:task.phase==='collecting'?'collecting construction materials':task.phase==='delivering'?'delivering construction materials':'returning to the civic site',mode:site&&Math.hypot(f.x-site.x,f.z-site.z)<70?'walk':undefined});
  }
  if(task.type==='build'&&task.phase==='collecting'&&!f.traveling&&f.currentLocationId==='construction'){
   task.phase='delivering';task.routeFailures=0;task.nextRouteAt=0;task.materials=job.materialsOrdered-job.materialsDelivered;startJourney(f,{id:task.targetId,action:'delivering construction materials'});
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
  if(f.displacedFrom){add('hotel','seeking temporary disaster shelter',210);return;}
  // Witnesses and unassigned builders can volunteer, but dispatch only reserves a small team.
  if(f.ageYears>=18&&f.energy>35&&f.health>50&&u().fires.some(v=>!v.containedAt&&v.detected))add('police','reporting an emergency',45+(f.traits?.empathy||0)*20);
 }
 function snapshot(){
  ensure();return {version:1,buildings:Object.values(u().buildings).map(b=>({...b})),fires:u().fires.filter(f=>!f.containedAt).map(f=>{const b=stateFor(f.buildingId);return {...f,x:b?.x,z:b?.z,h:b?.h,crew:f.teamIds.map(id=>byId.get(id)).filter(v=>present(v,`CIVIC-FIRE-${f.id}`)).map(v=>({x:v.x,z:v.z}))};}),projects:u().projects.filter(p=>p.stage!=='complete').map(p=>({...p,x:u().buildings[p.buildingId]?.x,z:u().buildings[p.buildingId]?.z})),roads:u().roads.map(r=>({...r})),completedRoads:Number(u().completedRoads||0),fireService:fireService.snapshot(),floods:u().floods.map(f=>({...f})),completedProjects:u().completedProjects,extinguishedFires:u().extinguishedFires,displaced:u().displaced,water:Math.round(u().safety.water),materialsDelivered:u().materialsDelivered,history:u().history.slice(-12)};
 }
 return {init,tick,handleResident,addChoices,snapshot,ignite,submitProject,grow,develop,isUnavailable,fireService};
}
