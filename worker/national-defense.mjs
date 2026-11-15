import {COUNTRY_IDS,countryAt} from './country-map.mjs';
import {BUILDINGS,LOCATIONS,entrance} from './city-map.mjs';
const NORTH=COUNTRY_IDS.north,HANS=COUNTRY_IDS.hansdrex,MAX_ACTIVE=8,MAX_EVENTS=32;
export const NATIONAL_DEFENSE_BATTERIES=Object.freeze([
 {id:'NORTH-DEFENSE-1',countryId:NORTH,facilityId:'north-army',x:270,y:.7,z:-995},
 {id:'HANSDREX-DEFENSE-1',countryId:HANS,facilityId:'military-base',x:710,y:.7,z:-625},
]);
const live=f=>f?.alive&&!f.departed,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),distance3=(a,b)=>Math.hypot(a.x-b.x,(a.y??1.1)-(b.y??1.1),a.z-b.z);

/** Fictional, bounded projectiles and real world consequences. Diplomacy owns
 * request identity, queueing and peace; this module never creates another counter. */
export function createNationalDefense(hooks){
 const {world,international,getAircraft=()=>[],crashAircraft=()=>false,damageBuilding=()=>{},startJourney=()=>{},moveFly=()=>{},homeLocation=()=>null,needsAndActivities=()=>{},payAndFinance=()=>{},remember=()=>{},emit=()=>{},random=()=>.5,neuralDrive=()=>.5,injureActor}=hooks;
 const now=()=>Number(world().simulationAgeSeconds||0),scale=()=>Math.max(1,Number(world().timeScale||120));
 const data=()=>world().nationalDefense||={version:1,nextProjectileId:1,projectiles:[],events:[],weapons:{},nextScanAt:0,activeConflictId:null,strikes:{},destroyedAircraft:[],casualties:0,injuries:0,buildingImpacts:0,intercepts:0,cancelled:0,history:[]};
 const actors=()=>[...world().flies,...(world().cityVisitors?.visitors||[])].filter(live);
 let baseCount=-1,baseIds=new Set();
 const buildings=()=>{if(baseCount!==BUILDINGS.length){baseCount=BUILDINGS.length;baseIds=new Set(BUILDINGS.map(b=>b.id));}const current=world().urbanWorld?.buildings||{};return [...BUILDINGS.map(b=>current[b.id]||b),...Object.values(current).filter(b=>!baseIds.has(b.id))].filter(b=>b.stage!=='cleared'&&b.w>0&&b.d>0);};
 const activeConflict=()=>international.getActiveConflict?.()||international.snapshot().conflicts.active;
 const countryOf=f=>f.publicServiceCountryId||f.citizenshipCountryId||HANS;
 function event(type,payload){const e={id:payload?.id||`DEFENSE-EVENT-${data().nextProjectileId++}`,type,at:now(),...payload};data().events.push(e);data().events=data().events.slice(-MAX_EVENTS);emit('national_defense',type,e);return e;}
 function weapon(country){return data().weapons[country]||={missiles:0,procurementPaid:0,nextPurchaseAt:0,nextFireAt:0};}
 function procure(country){const w=weapon(country),account=international.countryAccount(country);if(w.missiles>0||now()<w.nextPurchaseAt||Number(account?.cash||0)<620)return;world().businesses||={};const supplier=world().businesses['national-defense-supplies']||={cash:0,inventory:0,sector:'defense-equipment'};account.cash-=320;supplier.cash+=320;w.missiles+=4;w.procurementPaid+=320;w.nextPurchaseAt=now()+86400;world().totalTransactions=Number(world().totalTransactions||0)+1;}
 function crew(battery){return actors().filter(f=>f.publicServiceRole==='army'&&countryOf(f)===battery.countryId&&!f.onTrain&&!f.onPlane&&!f.onPrivateHelicopter&&!f.traveling&&!f.indoors&&f.health>35&&f.energy>20&&distance(f,battery)<85);}
 function batteries(){const all=buildings();return NATIONAL_DEFENSE_BATTERIES.filter(b=>all.some(p=>p.id===b.facilityId));}
 function freshAircraft(){return getAircraft().filter(a=>a&&a.id&&a.flightId&&a.airborne===true&&!a.destroyed&&Number.isFinite(a.x)&&Number.isFinite(a.z)&&Number.isFinite(a.y));}
 function authorize(a){return international.airspaceStatus(a.flightId,a,{operatorCountryId:a.ownerCountryId||a.operatorCountryId});}
 function hurt(f,amount,cause,projectile){if(!live(f)||amount<=0)return;const before=Number(f.health||0);if(injureActor){if(injureActor(f,amount,{cause,projectileId:projectile.id,countryId:countryAt(f)})===false)return;}else{f.health=Math.max(0,before-amount);if(f.health<=0&&f.alive){f.alive=false;f.causeOfDeath=cause;f.diedAtSimulationSeconds=now();world().deaths=Number(world().deaths||0)+1;}}
  f.stress=clamp(Number(f.stress||0)+25,0,100);remember(f,'projectile_injury',{projectileId:projectile.id,cause,damage:Math.min(before,amount),countryId:countryAt(f)});data().injuries++;if(!f.alive)data().casualties++;
 }
 function nearestImpactBuilding(point){let selected=null,best=Infinity;for(const b of buildings()){const dx=Math.max(0,Math.abs(point.x-b.x)-b.w/2),dz=Math.max(0,Math.abs(point.z-b.z)-b.d/2),d=Math.hypot(dx,dz);if(d<=8&&(point.y??1.1)<=Number(b.h||1)+3&&d<best){selected=b;best=d;}}return selected;}
 function groundImpact(p,point){const building=nearestImpactBuilding(point),destination=countryAt(building||point),victims=actors().filter(f=>distance3(f,point)<=11);
  // Apply blast injuries at impact positions before civic evacuation moves people.
  for(const f of victims){const damage=160*Math.max(.15,1-distance3(f,point)/14);hurt(f,damage,'missile impact',p);}
  if(building){const damaged=damageBuilding({buildingId:building.id,damage:48,fire:true,cause:p.conflictId?'war':'air-defense',countryId:destination,fundingAccountId:destination===HANS?'treasury':`treasury:${destination}`,conflictId:p.conflictId||null,projectileId:p.id});if(damaged!==false)data().buildingImpacts++;}
  react(point,p.conflictId,150);event('impact',{id:`${p.id}-impact`,projectileId:p.id,conflictId:p.conflictId||null,countryId:destination,x:point.x,y:point.y??1.1,z:point.z,buildingId:building?.id||null,victimIds:victims.map(f=>f.id)});
 }
 const aboard=f=>f.onTrain||f.onPlane||f.onPrivateHelicopter||f.heliPassenger||f.taxiPassenger;
 const rescueCommitted=f=>f.fireEngineDuty||f.onFireEngine||f.ambulanceDuty||f.onAmbulance||f.emergencyTask||f.urbanFloodEscape;
 const respondingSecurity=f=>f.publicServiceRole==='army'||f.publicServiceRole==='police';
 // A city-wide warning can involve hundreds of people. Route planning is shared
 // across alarms and resident handling, so one warning never plans the whole city
 // synchronously. Waiting residents retain their position and paid transit.
 let routePlanningAt=-1,routesPlanned=0;
 function seekShelter(f,response){if(aboard(f)||rescueCommitted(f))return false;if(routePlanningAt!==now()){routePlanningAt=now();routesPlanned=0;}if(routesPlanned>=24||now()<Number(response.nextRouteAt||0))return false;routesPlanned++;response.nextRouteAt=now()+300;startJourney(f,{id:response.targetId,action:'seeking shelter from fighting',mode:'walk'});return true;}
 function shelterFor(f,threat,{nationalWarning=false}={}){
  const wanted=countryAt(f),home=homeLocation(f),records=world().urbanWorld?.buildings||{};
  const homeSafe=home?.id&&countryAt(home)===wanted&&!['collapsed','unsafe','construction','cleared'].includes(records[f.housingUnitId||home.id]?.stage);
  if(homeSafe&&(nationalWarning||distance(home,threat)>80))return home;
  const candidates=buildings().filter(b=>countryAt(b)===wanted&&distance(b,threat)>100&&!['collapsed','unsafe','construction'].includes(b.stage)&&(['health','service','government'].includes(b.type)||['north-hospital','north-school','military-base','school','hospital-central'].includes(b.id)));
  const b=candidates.sort((a,b)=>distance(f,a)-distance(f,b))[0];return b?{id:b.id,...entrance(b)}:homeSafe?home:null;
 }
 function warnResident(f,point,conflictId,{nationalWarning=false}={}){
  if(respondingSecurity(f)||rescueCommitted(f)||nationalWarning&&f.indoors&&!aboard(f))return;
  if(f.warResponse?.active&&f.warResponse.conflictId===conflictId)return;
  const target=shelterFor(f,point,{nationalWarning});if(!target?.id)return;
  f.stress=clamp(Number(f.stress||0)+12+neuralDrive(f,'avoidDrive')*8,0,100);f.warExperiences=Number(f.warExperiences||0)+1;
  f.warResponse={active:true,conflictId:conflictId||null,startedAt:now(),expiresAt:conflictId?null:now()+30*scale(),targetId:target.id,targetPoint:{x:target.x,z:target.z},threat:{x:point.x,z:point.z},sheltered:false};
  remember(f,'war_alarm',{conflictId:conflictId||null,threat:{x:point.x,z:point.z},shelterId:target.id,nationalWarning});
  if(!f.traveling||f.targetLocationId!==target.id)seekShelter(f,f.warResponse);
 }
 function react(point,conflictId,radius=150){for(const f of actors()){if(distance(f,point)>radius||f.indoors&&distance(f,point)>80)continue;warnResident(f,point,conflictId);}}
 function nationalWarning(conflict){
  const participating=new Set([conflict.fromCountryId,conflict.toCountryId]),bases=batteries();
  for(const f of actors()){
   // Physical presence, rather than passport or home, determines the warning.
   // Hawaii stays neutral; visitors on either mainland receive the same alarm.
   const physical=countryAt(f);if(physical===COUNTRY_IDS.hawaii||!participating.has(physical))continue;
   const point=bases.find(b=>b.countryId===physical)||f;warnResident(f,point,conflict.id,{nationalWarning:true});
  }
 }
 function launch(battery,to,options={}){const d=data(),w=weapon(battery.countryId),members=crew(battery);if(!members.length||w.missiles<=0||now()<w.nextFireAt||d.projectiles.filter(p=>!p.resolvedAt&&!p.cancelledAt).length>=MAX_ACTIVE)return null;
  const f=members[0],skill=Number(f.professionSkills?.armyTraining||0),hit=clamp(random(f))<.6+Math.min(.25,skill*.25),target={x:to.x,y:to.y??1.1,z:to.z};
  if(!hit){const angle=clamp(random(f))*Math.PI*2,offset=28+clamp(random(f))*28;target.x+=Math.cos(angle)*offset;target.z+=Math.sin(angle)*offset;target.y=1.1;}
  w.missiles--;w.nextFireAt=now()+6*scale();const p={id:`NATIONAL-MISSILE-${d.nextProjectileId++}`,countryId:battery.countryId,from:{x:battery.x,y:battery.y,z:battery.z},to:target,launchedAt:now(),impactAt:now()+Math.max(1,Math.min(5,distance(battery,target)/220))*scale(),plannedHit:hit,crewIds:members.slice(0,3).map(f=>f.id),...options};d.projectiles.push(p);d.projectiles=d.projectiles.slice(-64);event('missile_launch',{...p});return p;
 }
 function resolve(p){p.resolvedAt=now()||.0001;
  if(p.targetAircraftId){const a=freshAircraft().find(a=>a.id===p.targetAircraftId&&a.flightId===p.flightId),authorized=a?authorize(a):null;if(!a||authorized?.authorized){event('interception_cancelled',{id:`${p.id}-cancelled`,projectileId:p.id,reason:!a?'actual aircraft unavailable':'flight now authorized'});return;}
   if(p.plannedHit&&distance3(a,p.to)<=55){const occupants=actors().filter(f=>(a.occupantIds||[]).includes(f.id)&&distance3(f,a)<20),crashed=crashAircraft(a.id,{flightId:a.flightId,cause:'air-defense interception',projectileId:p.id,countryId:p.countryId,point:{x:a.x,y:a.y,z:a.z}});if(crashed!==false){data().intercepts++;data().destroyedAircraft=[...data().destroyedAircraft,`${a.id}:${a.flightId}`].slice(-64);for(const f of occupants){if(!f.alive)data().casualties++;else hurt(f,160,'helicopter interception',p);}event('aircraft_intercepted',{id:`${p.id}-intercept`,aircraftId:a.id,projectileId:p.id,x:a.x,y:a.y,z:a.z,occupantIds:a.occupantIds||[]});return;}}
  }
  groundImpact(p,p.to);
 }
 function onConflictStarted(conflict){if(!conflict?.id||data().activeConflictId===conflict.id)return;data().activeConflictId=conflict.id;data().strikes[conflict.id]||={nextAt:now(),count:0};const keys=Object.keys(data().strikes);for(const id of keys.slice(0,-24))delete data().strikes[id];nationalWarning(conflict);event('conflict_alarm',{conflictId:conflict.id});}
 function onPeace(conflict){const id=typeof conflict==='string'?conflict:conflict?.id||data().activeConflictId;for(const p of data().projectiles)if(!p.resolvedAt&&!p.cancelledAt&&(!id||p.conflictId===id)){p.cancelledAt=now()||.0001;data().cancelled++;}for(const f of actors())if(f.warResponse?.active&&(!id||f.warResponse.conflictId===id)){f.warResponse.active=false;f.warResponse.peaceAt=now();f.warSafetyLearning=Number(f.warSafetyLearning||0)+.02;remember(f,'ceasefire',{conflictId:id,sheltered:f.warResponse.sheltered});}if(data().activeConflictId===id)data().activeConflictId=null;event('ceasefire',{conflictId:id});}
 function init(){data();return snapshot();}
 function tick(){const d=data(),conflict=activeConflict();if(d.activeConflictId&&d.activeConflictId!==conflict?.id)onPeace(d.activeConflictId);if(conflict&&conflict.id!==d.activeConflictId)onConflictStarted(conflict);
  for(const f of actors())if(f.warResponse?.active&&!f.warResponse.conflictId&&now()>=Number(f.warResponse.expiresAt||0)){f.warResponse.active=false;f.warResponse.peaceAt=now();}
  for(const p of d.projectiles)if(!p.resolvedAt&&!p.cancelledAt&&now()>=p.impactAt){if(p.conflictId&&p.conflictId!==conflict?.id){p.cancelledAt=now()||.0001;d.cancelled++;}else resolve(p);}
  if(now()<d.nextScanAt)return;d.nextScanAt=now()+2*scale();const bases=batteries();
  for(const a of freshAircraft()){const owner=a.ownerCountryId||a.operatorCountryId;if(a.kind!=='helicopter'||!owner||d.destroyedAircraft.includes(`${a.id}:${a.flightId}`))continue;const status=authorize(a);if(status.authorized||!status.countryId||status.countryId===owner)continue;const b=bases.find(b=>b.countryId===status.countryId&&distance(b,a)<=1400);if(!b||!crew(b).length||d.projectiles.some(p=>p.targetAircraftId===a.id&&!p.resolvedAt&&!p.cancelledAt))continue;procure(b.countryId);if(launch(b,a,{targetAircraftId:a.id,flightId:a.flightId,conflictId:null}))international.recordIncident(owner,b.countryId,{kind:'unauthorized military overflight',severity:4});}
  if(conflict){const stats=d.strikes[conflict.id];if(!stats||now()<stats.nextAt||stats.count>=6)return;stats.nextAt=now()+7*scale();for(const b of bases.filter(b=>[conflict.fromCountryId,conflict.toCountryId].includes(b.countryId))){const enemy=b.countryId===conflict.fromCountryId?conflict.toCountryId:conflict.fromCountryId,target=buildings().filter(v=>countryAt(v)===enemy&&distance(b,v)<1400&&!['collapsed','construction'].includes(v.stage)).sort((a,c)=>(a.id.includes('army')||a.id==='military-base'?-1000:0)+distance(b,a)-(c.id.includes('army')||c.id==='military-base'?-1000:0)-distance(b,c))[0];if(!target)continue;procure(b.countryId);if(launch(b,{x:target.x,y:1.1,z:target.z},{conflictId:conflict.id,targetBuildingId:target.id}))stats.count++;}}
 }
 function handleResident(f,clock){
  const response=f.warResponse;if(!live(f)||!response?.active||aboard(f)||rescueCommitted(f))return false;
  if(f.traveling&&f.targetLocationId!==response.targetId)seekShelter(f,response);
  if(f.traveling&&f.targetLocationId===response.targetId)moveFly(f);
  else if(!f.traveling&&f.currentLocationId===response.targetId){response.sheltered=true;response.arrivedAt||=now();f.action='sheltering during fighting';f.actionUntil=now()+300;}
  else if(!f.traveling)seekShelter(f,response);
  needsAndActivities(f,clock);payAndFinance(f,clock);return true;
 }
 function addChoices(f,clock,add){if(f.warResponse?.active&&!aboard(f)&&!rescueCommitted(f))add(f.warResponse.targetId,'seeking shelter from fighting',250);}
 function snapshot(){const d=data();return {version:1,conflicts:international.snapshot().conflicts,projectiles:d.projectiles.filter(p=>!p.cancelledAt&&(!p.resolvedAt||now()-p.resolvedAt<3*scale())).map(p=>({...p,from:{...p.from},to:{...p.to}})).slice(-MAX_EVENTS),events:d.events.slice(-MAX_EVENTS).map(e=>({...e})),batteries:batteries().map(b=>({...b,missiles:weapon(b.countryId).missiles,crewIds:crew(b).map(f=>f.id)})),casualties:d.casualties,injuries:d.injuries,buildingImpacts:d.buildingImpacts,intercepts:d.intercepts,cancelled:d.cancelled,civiliansSheltering:actors().filter(f=>f.warResponse?.active).length};}
 return {init,tick,handleResident,addChoices,snapshot,onConflictStarted,onPeace,requestConflict:request=>international.requestConflict(request),requestPeace:reason=>international.endConflict(reason)};
}

export function nationalProjectilePose(now,p){const u=clamp((now-p.launchedAt)/Math.max(1,p.impactAt-p.launchedAt));return{x:p.from.x+(p.to.x-p.from.x)*u,y:p.from.y+(p.to.y-p.from.y)*u+Math.sin(u*Math.PI)*Math.min(120,distance(p.from,p.to)*.18),z:p.from.z+(p.to.z-p.from.z)*u};}
