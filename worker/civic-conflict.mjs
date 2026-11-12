import {LOCATIONS,BUILDINGS,entrance,pedestrianRoute} from './city-map.mjs';
const DAY=86400,MAX_ACTIVE=2,MAX_MEMBERS=12,MAX_HISTORY=20;
const cap=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
const ESSENTIAL=new Set(['firefighter','paramedic','doctor','school','police','military','power','power-evening','power-night','grid-dispatch']);
const actions={member:'joining a civic assembly',mediator:'mediating a civic assembly',police:'responding to civic unrest'};
export const CIVIC_RULES={maxActive:MAX_ACTIVE,maxParticipants:MAX_MEMBERS,equipmentPrice:45,charges:4};
/** Fictional civic unrest: durable decisions and outcomes, no server-side particle simulation. */
export function createCivicConflict({world,random,emit,remember,startJourney,moveFly,needsAndActivities,payAndFinance,urbanWorld}){
 const raw=()=>world(),now=()=>Number(raw().simulationAgeSeconds||0),data=()=>raw().civicConflict||init();
 const rand=f=>cap(random?.(f)??.5,0,1);
 const byId=id=>raw().flies.find(f=>f.id===id);
 const locate=id=>LOCATIONS.find(l=>l.id===id);
 const incompatible=f=>Boolean(f.socialTask||f.emergencyTask||f.urbanFloodEscape||f.fireEngineDuty||f.ambulanceDuty||f.onFireEngine||f.onAmbulance||f.urbanTask||f.cityService||f.taxiJobId||f.taxiPassenger||f.privateFlight||f.onPrivateHelicopter||f.sportsSession||f.airTrip||f.onPlane||f.onTrain&&!(f.civicDuty&&f.traveling&&data().active.some(i=>i.id===f.civicDuty.incidentId&&i.locationId===f.targetLocationId))||f.heliPassenger||f.arrested||Number(f.arrestedUntil||0)>now()||f.displacedFrom);
 const eligible=(f,police=false)=>Boolean(f?.alive&&f.ageYears>=18&&f.ageYears<78&&f.health>45&&f.energy>35&&f.hunger<75&&!f.sleeping&&!incompatible(f)&&(police?f.jobId==='police':!ESSENTIAL.has(f.jobId)));
 function init(){
  const s=raw();s.businesses||={};s.businesses['civic-equipment']||={cash:0,inventory:80,sector:'civic-equipment'};
  s.civicConflict||={version:1,nextId:1,active:[],history:[],nextCheckAt:now()+DAY*.8,confidence:75,assemblies:0,peacefulResolutions:0,unrestIncidents:0,injuries:0,propertyIncidents:0,equipmentRevenue:0};
  const d=s.civicConflict;d.active||=[];d.history||=[];d.active=d.active.slice(0,MAX_ACTIVE);d.history=d.history.slice(-MAX_HISTORY);
  // Older or abandoned tasks can never strand a resident after restore.
  for(const f of s.flies)if(f.civicDuty&&!d.active.some(i=>i.id===f.civicDuty.incidentId))release(f);
  return d;
 }
 function memory(f,kind,payload={}){remember?.(f,kind,payload);f.civicMemories=(f.civicMemories||[]).concat({kind,at:now(),...payload}).slice(-6);}
 function grievance(f){return cap(Number(f.stress||0)*.45+(f.displacedFrom?30:0)+(f.illness?10:0)+Math.max(0,20-Number(f.money||0))*.5+(f.powerOn===false?16:0)+Number(f.politicalInterest||0)*22);}
 function faction(f){return f.partyId||((f.ideology?.welfare||0)>(f.ideology?.growth||0)?'public-welfare':'city-growth');}
 function present(f,i){const l=locate(i.locationId);return Boolean(f?.alive&&f.civicDuty?.incidentId===i.id&&!f.traveling&&l&&Math.hypot(f.x-l.x,f.z-l.z)<18);}
 function release(f){if(!f?.civicDuty)return;const preserve=incompatible(f)||f.onTrain||f.onPlane;f.civicDuty=null;if(preserve)return;f.traveling=false;f.routeWaypoints=[];f.vx=f.vz=0;f.actionUntil=0;f.indoors=false;}
 function join(f,i,role='member'){
  i=i&&data().active.find(active=>active.id===i.id);
  if(!i||i.resolvedAt!==undefined||f.civicDuty||!eligible(f,role==='police')||i.members.length>=MAX_MEMBERS||!Object.keys(actions).includes(role))return false;
  if(role==='police'&&i.members.filter(p=>p.role==='police').length>=2)return false;
  const l=locate(i.locationId);if(!l||urbanWorld?.isUnavailable?.(l.id,f))return false;
  const onsite=!f.traveling&&Math.hypot(f.x-l.x,f.z-l.z)<18;
  const alreadyOnWay=f.traveling&&f.targetLocationId===l.id&&Object.values(actions).includes(f.action);
  if(f.traveling&&!alreadyOnWay)return false;
  if(!onsite&&!alreadyOnWay&&!pedestrianRoute(f,l).length)return false;
  const entry={id:f.id,role,faction:faction(f),joinedAt:now(),arrivedAt:onsite?now():null};i.members.push(entry);
  f.civicDuty={incidentId:i.id,role,assignedAt:now()};f.roadDuty=false;f.mobilityShopping=false;if(onsite||alreadyOnWay)f.indoors=false;f.action=actions[role];f.actionUntil=0;
  if(!onsite&&!alreadyOnWay)startJourney?.(f,{id:l.id,action:actions[role]});
  if(!onsite&&!f.traveling){i.members=i.members.filter(m=>m.id!==f.id);f.civicDuty=null;return false;}
  return true;
 }
 function startAssembly(leader,{locationId=null,issue='living costs and public services'}={}){
  const d=data();if(d.active.length>=MAX_ACTIVE||!eligible(leader)||leader.civicDuty||leader.traveling)return null;
  const place=locate(locationId||(leader.x>480?'riverside-park':'park'));if(!place||urbanWorld?.isUnavailable?.(place.id,leader)||d.active.some(i=>i.locationId===place.id))return null;
  const i={id:`CIVIC-ASSEMBLY-${d.nextId++}`,locationId:place.id,issue,leaderId:leader.id,faction:faction(leader),startedAt:now(),gatherUntil:now()+1800,endsAt:now()+14400,phase:'gathering',tension:Math.max(12,grievance(leader)*.45),mediation:0,lastPulseAt:now(),members:[],propertyAttempted:false};
  d.active.push(i);if(!join(leader,i)){d.active=d.active.filter(x=>x!==i);return null;}d.assemblies++;
  emit?.('civic_assembly',`${leader.id} called a voluntary assembly about ${issue}.`,{incidentId:i.id,locationId:i.locationId});memory(leader,'called_assembly',{incidentId:i.id,issue});return i;
 }
 function buyEquipment(f){
  const d=data(),seller=raw().businesses['civic-equipment'];if(!eligible(f)||f.civicEquipment||seller.inventory<=0||Number(f.money||0)<CIVIC_RULES.equipmentPrice+100)return false;
  f.money-=CIVIC_RULES.equipmentPrice;seller.cash+=CIVIC_RULES.equipmentPrice;seller.inventory--;raw().totalTransactions=Number(raw().totalTransactions||0)+1;d.equipmentRevenue+=CIVIC_RULES.equipmentPrice;
  // Equipment is an abstract game prop. It contains no real weapon mechanics or construction detail.
  f.civicEquipment={kind:'symbolic-blaster',charges:CIVIC_RULES.charges,boughtAt:now(),price:CIVIC_RULES.equipmentPrice};memory(f,'bought_civic_equipment',{kind:f.civicEquipment.kind});return true;
 }
 function resolve(i,outcome='negotiated truce'){
  const d=data();i=i&&d.active.find(active=>active.id===i.id);if(!i||i.resolvedAt!==undefined)return false;i.resolvedAt=now();i.outcome=outcome;const peaceful=i.phase!=='unrest';
  if(peaceful)d.peacefulResolutions++;d.confidence=cap(d.confidence+(peaceful?2:-4));
  for(const m of i.members){const f=byId(m.id);if(!f)continue;const attended=present(f,i);if(attended){f.stress=cap(f.stress-(peaceful?8:2));f.happiness=cap(f.happiness+(peaceful?3:-2));f.lawAwareness=cap(Number(f.lawAwareness||0)+.015,0,1);memory(f,'assembly_outcome',{incidentId:i.id,outcome,phase:i.phase});}if(f.civicDuty?.incidentId===i.id)release(f);}
  d.history.push({id:i.id,locationId:i.locationId,startedAt:i.startedAt,endedAt:now(),phase:i.phase,outcome,participants:i.members.filter(m=>m.arrivedAt!==null).length,issue:i.issue});d.history=d.history.slice(-MAX_HISTORY);d.active=d.active.filter(a=>a.id!==i.id);
  emit?.('civic_resolution',`${i.id} ended with ${outcome}.`,{incidentId:i.id,outcome});return true;
 }
 function pulse(i,seconds){
  const d=data(),people=i.members.map(m=>({m,f:byId(m.id)})).filter(p=>present(p.f,i));
  for(const p of people)if(p.m.arrivedAt===null)p.m.arrivedAt=now();
  if(people.length<2)return;
  const civilians=people.filter(p=>p.m.role==='member'),mediators=people.filter(p=>p.m.role==='mediator'),police=people.filter(p=>p.m.role==='police');
  const factions=new Set(civilians.map(p=>p.m.faction)),anger=civilians.reduce((sum,p)=>sum+grievance(p.f),0)/Math.max(1,civilians.length);
  const aggression=civilians.reduce((sum,p)=>sum+Number(p.f.traits?.risk||0)*(1-Number(p.f.traits?.empathy??.5)),0)/Math.max(1,civilians.length);
  const calming=mediators.reduce((sum,p)=>sum+.7+Number(p.f.traits?.empathy||0),0)+police.length*.8;
  i.mediation=cap(i.mediation+calming*seconds/600);
  i.tension=cap(i.tension+((anger>65?1.6:-.8)+(factions.size>1?1.3:0)+aggression*2-calming*2)*seconds/600);
  if(i.phase==='gathering'&&now()>=i.gatherUntil)i.phase='debate';
  if(i.phase==='debate'&&i.tension>=72&&factions.size>1){i.phase='unrest';d.unrestIncidents++;d.confidence=cap(d.confidence-3);emit?.('civic_unrest',`${i.id} escalated after opposing groups clashed.`,{incidentId:i.id});}
  if(i.phase==='unrest'){
   const attacker=civilians.filter(p=>p.f.civicEquipment?.charges>0&&Number(p.f.traits?.risk||0)>.75&&Number(p.f.stress||0)>65).sort((a,b)=>Number(b.f.traits.risk)-Number(a.f.traits.risk))[0];
   const victim=attacker&&civilians.find(p=>p.m.faction!==attacker.m.faction&&p.f.health>25);
   if(attacker&&victim&&rand(attacker.f)<.12&&!police.length&&now()-Number(i.lastInjuryAt??-3600)>=1800){
    attacker.f.civicEquipment.charges--;victim.f.health=Math.max(8,Number(victim.f.health||0)-5-rand(attacker.f)*7);victim.f.stress=cap(victim.f.stress+8);attacker.f.lawViolations=Number(attacker.f.lawViolations||0)+1;attacker.f.wanted=true;d.injuries++;i.lastInjuryAt=now();memory(victim.f,'injured_in_unrest',{incidentId:i.id,attackerId:attacker.f.id});memory(attacker.f,'civic_violence',{incidentId:i.id,victimId:victim.f.id});
    emit?.('civic_injury',`${victim.f.id} was injured in civic unrest; responders are needed.`,{incidentId:i.id,victimId:victim.f.id,flyId:attacker.f.id});
   }
   if(!i.propertyAttempted&&i.tension>92&&civilians.length>=4&&aggression>.55&&!police.length){i.propertyAttempted=true;const l=locate(i.locationId),target=BUILDINGS.filter(b=>['block','destination'].includes(b.kind)&&Math.hypot(b.x-l.x,b.z-l.z)<90).sort((a,b)=>Math.hypot(a.x-l.x,a.z-l.z)-Math.hypot(b.x-l.x,b.z-l.z))[0];if(target&&rand(civilians[0].f)<.15&&urbanWorld?.ignite?.(target.id,'damage during fictional civic unrest')){d.propertyIncidents++;memory(civilians[0].f,'witnessed_unrest_fire',{incidentId:i.id,buildingId:target.id});}}
  }
  if(i.mediation>=18||i.tension<8&&now()>i.gatherUntil)resolve(i,'negotiated truce');
 }
 function tick(gameSeconds,clock){
  const d=data();for(const i of [...d.active]){
   i.members=i.members.filter(m=>{const f=byId(m.id);if(f?.alive&&f.civicDuty?.incidentId===i.id&&!incompatible(f))return true;if(f?.civicDuty?.incidentId===i.id)release(f);return false;});
   if(now()>=i.endsAt){resolve(i,i.members.some(m=>m.arrivedAt!==null)?'participants returned home':'assembly lapsed without attendance');continue;}
   const elapsed=now()-i.lastPulseAt;if(elapsed>=600){i.lastPulseAt=now();pulse(i,Math.min(elapsed,1800));}
   if(i.phase==='unrest'&&i.members.filter(m=>m.role==='police').length<2){for(const f of raw().flies.filter(f=>eligible(f,true)&&!f.civicDuty&&!f.traveling).slice(0,2))join(f,i,'police');}
  }
  if(now()<d.nextCheckAt)return;d.nextCheckAt=now()+DAY*(2+Math.min(1,Number(clock?.hour||0)/24));
  if(d.active.length>=MAX_ACTIVE||Number(clock?.hour||0)<7||Number(clock?.hour||0)>20)return;
  const candidates=raw().flies.filter(f=>eligible(f)&&!f.civicDuty&&!f.traveling&&grievance(f)>55&&Number(f.politicalInterest||0)>.45).sort((a,b)=>grievance(b)-grievance(a)).slice(0,8);
  const leader=candidates.find(f=>rand(f)<.35);if(leader)startAssembly(leader);
  d.confidence=cap(d.confidence+(d.active.length?0:.35));
 }
 function addChoices(f,clock,add){
  if(!eligible(f)||f.civicDuty||clock.hour<7||clock.hour>21)return;
  for(const i of data().active){if(i.members.length>=MAX_MEMBERS||urbanWorld?.isUnavailable?.(i.locationId,f))continue;
   const concern=grievance(f),interest=Number(f.politicalInterest||0),aligned=faction(f)===i.faction;
   if(interest>.3)add(i.locationId,actions.member,18+concern*.65+interest*24+(aligned?6:0));
   if(Number(f.traits?.empathy||0)>.65)add(i.locationId,actions.mediator,16+interest*25+Number(f.traits.empathy)*28+(i.phase==='unrest'?16:0));
  }
 }
 function handleResident(f,clock){
  if(!f.civicDuty&&Object.values(actions).includes(f.action)&&eligible(f)){
   const i=data().active.find(i=>i.locationId===(f.traveling?f.targetLocationId:f.currentLocationId));if(i)join(f,i,f.action===actions.mediator?'mediator':'member');
  }
  if(!f.civicDuty)return false;const i=data().active.find(i=>i.id===f.civicDuty.incidentId);
  if(!i||urbanWorld?.isUnavailable?.(i.locationId,f)||!eligible(f,f.civicDuty.role==='police')||f.health<40||f.energy<18){release(f);return false;}
  moveFly?.(f);needsAndActivities?.(f,clock);payAndFinance?.(f,clock);
  if(present(f,i)){
   f.indoors=false;f.sleeping=false;f.action=f.civicDuty.role==='police'?'keeping a civic truce':f.civicDuty.role==='mediator'?'mediating a civic assembly':i.phase==='unrest'?'withdrawing from civic unrest':'debating civic priorities';f.actionUntil=now()+600;
   const m=i.members.find(m=>m.id===f.id);if(m&&m.arrivedAt===null){m.arrivedAt=now();memory(f,'attended_assembly',{incidentId:i.id,role:m.role});}
   // Rare high-risk residents buy finite symbolic equipment out of their own savings reserve.
   if(i.phase==='unrest'&&f.civicDuty.role==='member'&&Number(f.traits?.risk||0)>.85&&!f.civicEquipment&&rand(f)<.04)buyEquipment(f);
   if(i.phase==='unrest'&&f.civicDuty.role==='member'&&(Number(f.traits?.risk||0)<.35||f.health<55)){memory(f,'left_unrest',{incidentId:i.id});release(f);f.action='leaving an unsafe assembly';return false;}
  }
  return true;
 }
 function snapshot(){const d=data();return {version:1,confidence:Math.round(d.confidence*10)/10,assemblies:d.assemblies,peacefulResolutions:d.peacefulResolutions,unrestIncidents:d.unrestIncidents,injuries:d.injuries,propertyIncidents:d.propertyIncidents,equipmentRevenue:d.equipmentRevenue,active:d.active.map(i=>({...i,x:locate(i.locationId)?.x,z:locate(i.locationId)?.z,members:i.members.map(m=>{const f=byId(m.id);return {...m,x:f?.x,z:f?.z,present:present(f,i),equipment:f?.civicEquipment?.kind||null};})})),history:d.history.slice(-12),algorithmOnly:true};}
 return {init,tick,addChoices,handleResident,snapshot,startAssembly,join,buyEquipment,resolve};
}
