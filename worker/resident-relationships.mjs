import {LOCATIONS,BUILDINGS} from './city-map.mjs';
const DAY=86400,INTERVAL=600,MAX_TIES=8,MAX_TASKS=24,MAX_ENCOUNTERS=48;
const cap=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
const VISIT='social visit with a friend',CARE='providing household care';
const alive=f=>Boolean(f?.alive&&!f.departed&&f.kind!=='visitor');
export const RELATIONSHIP_RULES={maxTies:MAX_TIES,maxTasks:MAX_TASKS,maxEncountersPerRound:MAX_ENCOUNTERS,encounterSeconds:INTERVAL,visitSeconds:1200,careSeconds:1800};
/** Small persistent relationship graph. Physical encounters are bucketed; no all-pairs resident scan. */
export function createResidentRelationships({world,random,emit,remember,startJourney,moveFly,needsAndActivities,payAndFinance,urbanWorld,neuralDrive}){
 let actors=new Map(),lastIndexAt=-1,indexedWorld=null,indexedFlies=null,activeTasks=0;
 const raw=()=>world(),now=()=>Number(raw().simulationAgeSeconds||0),data=()=>raw().residentRelationships||init();
 const roll=f=>cap(random?.(f)??.5,0,1),locate=id=>LOCATIONS.find(l=>l.id===id);
 const incompatible=f=>Boolean(f.urbanTask||f.fireEngineDuty||f.ambulanceDuty||f.onFireEngine||f.onAmbulance||f.urbanFloodEscape||f.emergencyTask||f.civicDuty||f.cityService||f.taxiJobId||f.taxiPassenger||f.privateFlight||f.onPrivateHelicopter||f.sportsSession||f.airTrip||f.onPlane||f.onTrain&&!(f.socialTask&&f.traveling&&f.targetLocationId===f.socialTask.locationId)||f.heliPassenger||f.wheelRideUntil>now()||f.arrested||Number(f.arrestedUntil||0)>now());
 const busy=f=>incompatible(f)||f.socialTask||String(f.action||'').startsWith('working')||String(f.action||'').includes('teaching')||String(f.action||'').includes('studying');
 const canAct=f=>alive(f)&&f.ageYears>=16&&f.health>55&&f.energy>40&&f.hunger<75&&!f.sleeping&&!incompatible(f);
 const outdoors=f=>alive(f)&&f.ageYears>=8&&!f.traveling&&!f.indoors&&!f.sleeping&&!busy(f);
 const key=f=>`${f.currentLocationId||''}:${Math.floor(f.x/16)}:${Math.floor(f.z/16)}`;
 const index=()=>{const s=raw();if(lastIndexAt===now()&&indexedWorld===s&&indexedFlies===s.flies)return;actors=new Map(s.flies.map(f=>[f.id,f]));activeTasks=s.flies.filter(f=>f.socialTask).length;indexedWorld=s;indexedFlies=s.flies;lastIndexAt=now();};
 function ensureActor(f,normalize=false){
  if(!normalize&&f.socialTiesMigrated&&f.socialTies&&f.socialProfile&&f.socialMemories&&f.friends)return;
  f.socialTies||={};f.socialProfile={careSkill:0,reliability:.5,completedVisits:0,completedCare:0,receivedCareMinutes:0,careMinutes:0,...(f.socialProfile||{})};f.socialMemories||=[];
  // Preserve named pre-existing friends as legacy ties, with provenance rather than invented encounter history.
  if(!f.socialTiesMigrated){for(const id of (f.friends||[]).slice(0,MAX_TIES))if(id!==f.id&&!f.socialTies[id])f.socialTies[id]={id,kind:'friend',affinity:58,trust:52,contacts:0,lastMetAt:null,lastExperienceAt:null,legacy:true};f.socialTiesMigrated=true;}
  const entries=Object.values(f.socialTies).filter(t=>t&&t.id!==f.id).sort((a,b)=>Number(b.affinity||0)+Number(b.trust||0)*.3-Number(a.affinity||0)-Number(a.trust||0)*.3||String(a.id).localeCompare(String(b.id))).slice(0,MAX_TIES);f.socialTies=Object.fromEntries(entries.map(t=>[t.id,t]));f.socialMemories=f.socialMemories.slice(-8);
  updateFriends(f);
 }
 function updateFriends(f){f.friends=Object.values(f.socialTies||{}).filter(t=>t.kind==='friend'&&t.id!==f.partnerId&&alive(actors.get(t.id))&&t.affinity>=55&&t.trust>=48&&(t.contacts>=3||t.legacy)).map(t=>t.id).slice(0,MAX_TIES);}
 function init(){
  const s=raw();s.residentRelationships||={version:1,nextTaskId:1,encounters:0,positiveEncounters:0,negativeEncounters:0,friendshipsFormed:0,completedVisits:0,completedCare:0,cancelledVisits:0,careMinutes:0,lastEncounterAt:now()-INTERVAL,lastDecayDay:Math.floor(now()/DAY),round:0,history:[]};
  index();const d=s.residentRelationships;d.history||=[];d.history=d.history.slice(-24);
  for(const f of s.flies){ensureActor(f,true);if(f.socialTask){const target=actors.get(f.socialTask.targetId);if(!alive(f)||!alive(target)||f.socialTask.expiresAt<=now())release(f,'appointment no longer available',false);}}
  return d;
 }
 function memory(f,kind,payload){remember?.(f,kind,payload);f.socialMemories=(f.socialMemories||[]).concat({kind,at:now(),...payload}).slice(-8);}
 function history(kind,f,target,payload={}){const d=data();d.history.push({kind,at:now(),residentId:f.id,targetId:target?.id,...payload});d.history=d.history.slice(-24);}
 function family(a,b){return Boolean(a.householdId&&a.householdId===b.householdId||(a.parents||[]).includes(b.id)||(a.children||[]).includes(b.id)||(b.parents||[]).includes(a.id)||(b.children||[]).includes(a.id));}
 function tie(f,other){
  let t=f.socialTies[other.id];if(t)return t;
  const all=Object.values(f.socialTies);if(all.length>=MAX_TIES){const least=all.sort((a,b)=>(a.affinity+a.trust*.3)-(b.affinity+b.trust*.3)||Number(a.lastExperienceAt||0)-Number(b.lastExperienceAt||0))[0];if(least.affinity>65)return null;delete f.socialTies[least.id];}
  return f.socialTies[other.id]={id:other.id,kind:family(f,other)?'family':'friend',affinity:30,trust:40,contacts:0,lastMetAt:null,lastExperienceAt:null,helpCount:0};
 }
 function experience(a,b,positive,kind='encounter'){
  const friendsBefore=a.friends.includes(b.id)||b.friends.includes(a.id);let stored=false;
  for(const [f,other]of [[a,b],[b,a]]){const t=tie(f,other);if(!t)continue;stored=true;
   t.affinity=cap(t.affinity+(positive?4+Number(other.traits?.empathy??.5)*3:-7));t.trust=cap(t.trust+(positive?2.5:-6));t.contacts++;t.lastMetAt=t.lastExperienceAt=now();t.lastOutcome=positive?'positive':'negative';if(kind==='care')t.helpCount=Number(t.helpCount||0)+1;
   f.loneliness=cap(Number(f.loneliness||0)+(positive?-2.5:1));f.stress=cap(Number(f.stress||0)+(positive?-1:2));updateFriends(f);
  }
  if(stored){memory(a,positive?'positive_social_experience':'negative_social_experience',{otherId:b.id,activity:kind});memory(b,positive?'positive_social_experience':'negative_social_experience',{otherId:a.id,activity:kind});}
  if(!friendsBefore&&(a.friends.includes(b.id)||b.friends.includes(a.id))){data().friendshipsFormed++;emit?.('friendship',`${a.id} and ${b.id} built a friendship through repeated meetings.`,{residentId:a.id,friendId:b.id});}
 }
 function compatiblePeers(a,b){if(a.ageYears<18||b.ageYears<18)return a.ageYears<18&&b.ageYears<18&&Math.abs(a.ageYears-b.ageYears)<4;return true;}
 function encounters(){
  const d=data(),buckets=new Map(),eligible=[];for(const f of actors.values())if(outdoors(f)){ensureActor(f);eligible.push(f);const k=key(f);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(f);}
  let examined=0,completed=0,serial=0;for(let resident=0;resident<eligible.length&&completed<MAX_ENCOUNTERS;resident++){
   const a=eligible[(resident+d.round*97)%eligible.length];serial++;if(now()-Number(a.lastSocialEncounterAt??-INTERVAL)<INTERVAL)continue;
   const cx=Math.floor(a.x/16),cz=Math.floor(a.z/16);
   candidates:for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
    const people=buckets.get(`${a.currentLocationId||''}:${cx+dx}:${cz+dz}`);if(!people)continue;
    // At most 36 candidate checks per actor; nearby cell borders do not create invisible barriers.
    for(let offset=0;offset<Math.min(4,people.length);offset++){
     examined++;const b=people[(serial+offset+d.round)%people.length];if(b===a||now()-Number(b.lastSocialEncounterAt??-INTERVAL)<INTERVAL||!compatiblePeers(a,b)||Math.hypot(a.x-b.x,a.z-b.z)>8)continue;
     a.lastSocialEncounterAt=b.lastSocialEncounterAt=now();const stress=(Number(a.stress||0)+Number(b.stress||0))/200,empathy=(Number(a.traits?.empathy??.5)+Number(b.traits?.empathy??.5))/2,positive=roll(a)>=stress*(1-empathy)*.3;
     experience(a,b,positive);d.encounters++;completed++;d[positive?'positiveEncounters':'negativeEncounters']++;break candidates;
    }
   }
  }d.lastCandidateChecks=examined;d.lastEncounters=completed;d.round=(d.round+1)%1000000;
 }
 function decay(day){
  const d=data(),days=Math.min(30,Math.max(0,day-d.lastDecayDay));if(!days)return;d.lastDecayDay=day;
  for(const f of actors.values())if(alive(f)){
   ensureActor(f);for(const t of Object.values(f.socialTies)){
    const other=actors.get(t.id);if(!alive(other)){if(!t.lossRecorded&&t.affinity>=60){memory(f,'lost_social_contact',{otherId:t.id});f.stress=cap(Number(f.stress||0)+4);}delete f.socialTies[t.id];continue;}
    if(t.lastMetAt!==null&&now()-t.lastMetAt>DAY*3)t.affinity=cap(t.affinity-.15*days);
   }updateFriends(f);
  }
 }
 function tick(_gameSeconds,clock){
  index();const d=data();decay(Number(clock?.day??Math.floor(now()/DAY)+1)-1);
  if(now()-d.lastEncounterAt>=INTERVAL){d.lastEncounterAt=now();encounters();}
  for(const f of actors.values()){
   if(alive(f)){if(!f.socialTies)ensureActor(f);else updateFriends(f);}
   if(f.socialIntent&&f.socialIntent.expiresAt<now())f.socialIntent=null;
   if(f.socialTask&&(!alive(f)||!alive(actors.get(f.socialTask.targetId))||f.socialTask.expiresAt<now()))release(f,'appointment expired',false);
  }
 }
 function householdPatient(f){
  const ids=raw().housing?.households?.[f.householdId]?.members||[];
  return ids.map(id=>actors.get(id)).find(p=>p?.id!==f.id&&alive(p)&&p.householdId===f.householdId&&(!p.housingUnitId||!f.housingUnitId||p.housingUnitId===f.housingUnitId)&&!p.traveling&&!incompatible(p)&&p.currentLocationId===p.homeId&&(p.illness||p.health<65)&&Math.hypot(Number(p.homeX??p.x)-Number(f.homeX??f.x),Number(p.homeZ??p.z)-Number(f.homeZ??f.z))<4);
 }
 function addChoices(f,clock,add){
  index();ensureActor(f);if(!canAct(f)||busy(f)||clock.hour<6||clock.hour>=22)return;
  if(activeTasks>=MAX_TASKS)return;
  const patient=now()-Number(f.lastHouseholdCareAt??-DAY)>10800?householdPatient(f):null;
  if(patient&&!urbanWorld?.isUnavailable?.(f.homeId,f)){
   f.socialIntent={kind:'care',targetId:patient.id,locationId:f.homeId,offeredAt:now(),expiresAt:now()+3600};add(f.homeId,CARE,35+Number(f.traits?.empathy??.5)*35+(100-patient.health)*.4+cap(neuralDrive?.(f,'socialDrive'),0,1)*12+cap(neuralDrive?.(f,'approachDrive'),0,1)*8);return;
  }
  if(now()-Number(f.lastFriendVisitAt??-DAY)<7200)return;
  const choices=Object.values(f.socialTies).map(t=>({t,p:actors.get(t.id)})).filter(({t,p})=>t.kind==='friend'&&f.friends.includes(t.id)&&outdoors(p)&&locate(p.currentLocationId)?.type==='social'&&!BUILDINGS.some(b=>b.id===p.currentLocationId)&&Math.hypot(p.x-locate(p.currentLocationId).x,p.z-locate(p.currentLocationId).z)<18&&!urbanWorld?.isUnavailable?.(p.currentLocationId,p));
  const choice=choices.sort((a,b)=>(b.t.affinity+b.t.trust*.2)-(a.t.affinity+a.t.trust*.2))[0];if(!choice)return;
  f.socialIntent={kind:'visit',targetId:choice.p.id,locationId:choice.p.currentLocationId,offeredAt:now(),expiresAt:now()+3600};add(choice.p.currentLocationId,VISIT,20+Number(f.loneliness||0)*.55+Number(f.traits?.sociability??.5)*18+choice.t.affinity*.12+cap(neuralDrive?.(f,'socialDrive'),0,1)*14+(f.socialProfile.reliability-.5)*8);
 }
 function begin(f){
  const intent=f.socialIntent;if(!intent||intent.expiresAt<now()||f.socialTask||!canAct(f)||busy(f)||f.action!==(intent.kind==='care'?CARE:VISIT))return false;
  const target=actors.get(intent.targetId);if(!alive(target)||activeTasks>=MAX_TASKS)return false;
  if(f.traveling&&f.targetLocationId!==intent.locationId)return false;
  const task={id:`SOCIAL-${data().nextTaskId++}`,kind:intent.kind,targetId:intent.targetId,locationId:intent.locationId,createdAt:now(),expiresAt:now()+10800,requiredSeconds:intent.kind==='care'?RELATIONSHIP_RULES.careSeconds:RELATIONSHIP_RULES.visitSeconds,onsiteSeconds:0,lastAt:now(),arrivedAt:null};f.socialTask=task;activeTasks++;f.socialIntent=null;f.roadDuty=false;f.mobilityShopping=false;
  if(!f.traveling&&f.currentLocationId!==task.locationId)startJourney?.(f,{id:task.locationId,action:task.kind==='care'?CARE:VISIT});
  return true;
 }
 function onsite(f,p,task){
  if(f.traveling||p.traveling||Math.hypot(f.x-p.x,f.z-p.z)>12)return false;
  if(task.kind==='care')return f.householdId===p.householdId&&f.currentLocationId===f.homeId&&p.currentLocationId===p.homeId;
  return !f.indoors&&!p.indoors&&f.currentLocationId===task.locationId&&p.currentLocationId===task.locationId&&!incompatible(p)&&!p.sleeping;
 }
 function release(f,reason,success=false){
  const task=f.socialTask;if(!task)return false;const d=data(),p=actors.get(task.targetId);f.socialTask=null;activeTasks=Math.max(0,activeTasks-1);f.actionUntil=0;
  // An emergency or another service may own the new route. Never erase that commitment.
  if(!incompatible(f)){f.traveling=false;f.routeWaypoints=[];f.vx=f.vz=0;f.action=success?'finished a social commitment':'social appointment ended';}
  ensureActor(f);
  if(success&&alive(p)){
   ensureActor(p);experience(f,p,true,task.kind);f.socialProfile.reliability=cap(f.socialProfile.reliability+.025,0,1);
   if(task.kind==='care'){d.completedCare++;f.socialProfile.completedCare++;f.socialProfile.careSkill=cap(f.socialProfile.careSkill+.008,0,1);f.lastHouseholdCareAt=now();p.lastReceivedCareAt=now();}
   else{d.completedVisits++;f.socialProfile.completedVisits++;f.lastFriendVisitAt=now();}
   memory(f,'completed_social_commitment',{targetId:task.targetId,activity:task.kind,minutes:task.onsiteSeconds/60});history('completed',f,p,{activity:task.kind,minutes:task.onsiteSeconds/60});
  }else{
   d.cancelledVisits++;f.socialProfile.reliability=cap(f.socialProfile.reliability-.005,0,1);f.lastFriendVisitAt=now();if(task.kind==='care')f.lastHouseholdCareAt=now()-9000;
   memory(f,'uncompleted_social_commitment',{targetId:task.targetId,activity:task.kind,reason});history('cancelled',f,p,{activity:task.kind,reason});
  }
  return true;
 }
 function handleResident(f,clock){
  if(!f.socialTask&&!f.socialIntent)return false;
  index();ensureActor(f);if(!f.socialTask)begin(f);const task=f.socialTask;if(!task)return false;
  const p=actors.get(task.targetId);if(!canAct(f)||!alive(p)||task.expiresAt<now()||urbanWorld?.isUnavailable?.(task.locationId,f)){release(f,'resident or destination unavailable');return false;}
  if(incompatible(p)||p.traveling||task.kind==='care'&&p.currentLocationId!==p.homeId){release(f,'recipient unavailable');return false;}
  const elapsed=Math.max(0,Math.min(1800,now()-task.lastAt));task.lastAt=now();moveFly?.(f);needsAndActivities?.(f,clock);payAndFinance?.(f,clock);
  if(onsite(f,p,task)){
   if(task.arrivedAt===null){task.arrivedAt=now();memory(f,'arrived_for_social_commitment',{targetId:p.id,activity:task.kind});}
   else{
    const used=Math.min(elapsed,task.requiredSeconds-task.onsiteSeconds);task.onsiteSeconds+=used;
    if(task.kind==='care'){
     const minutes=used/60,skill=.8+cap(f.socialProfile.careSkill,0,1)*.4;ensureActor(p);p.stress=cap(Number(p.stress||0)-minutes*.08*skill);p.loneliness=cap(Number(p.loneliness||0)-minutes*.05*skill);f.energy=cap(Number(f.energy||0)-minutes*.025);f.socialProfile.careMinutes+=minutes;p.socialProfile.receivedCareMinutes+=minutes;data().careMinutes+=minutes;
    }
   }
   f.action=task.kind==='care'?CARE:VISIT;f.actionUntil=now()+600;
   if(task.onsiteSeconds>=task.requiredSeconds)release(f,'commitment fulfilled',true);
  }else if(task.arrivedAt!==null||!f.traveling&&now()-task.createdAt>1800){release(f,'recipient left before the meeting');}
  return true;
 }
 function profile(f){index();ensureActor(f);return {friends:[...f.friends],ties:Object.values(f.socialTies).map(t=>({...t})),profile:{...f.socialProfile},task:f.socialTask?{...f.socialTask}:null,memories:f.socialMemories.slice(-6)};}
 function supportSignal(f){index();const recent=Object.values(f.socialTies||{}).filter(t=>alive(actors.get(t.id))&&t.lastMetAt!==null&&now()-t.lastMetAt<DAY*3&&t.affinity>=48&&t.trust>=45).reduce((sum,t)=>sum+t.affinity/100*t.trust/100,0);return cap(recent/3+(now()-Number(f.lastReceivedCareAt??-DAY*3)<DAY?.25:0),0,1);}
 function snapshot(){index();const d=data(),active=[...actors.values()].filter(f=>alive(f)&&f.socialTask).map(f=>({id:f.socialTask.id,residentId:f.id,targetId:f.socialTask.targetId,kind:f.socialTask.kind,locationId:f.socialTask.locationId,x:f.x,z:f.z,traveling:Boolean(f.traveling),onsiteMinutes:f.socialTask.onsiteSeconds/60})),pairs=new Set();for(const f of actors.values())if(alive(f))for(const id of f.friends||[])if(alive(actors.get(id)))pairs.add([f.id,id].sort().join('|'));return {version:1,encounters:d.encounters,positiveEncounters:d.positiveEncounters,negativeEncounters:d.negativeEncounters,friendships:pairs.size,friendshipsFormed:d.friendshipsFormed,completedVisits:d.completedVisits,completedCare:d.completedCare,careMinutes:Math.round(d.careMinutes),cancelledVisits:d.cancelledVisits,active,history:d.history.slice(-12),algorithmOnly:true};}
 return {init,tick,addChoices,handleResident,snapshot,profile,supportSignal};
}
