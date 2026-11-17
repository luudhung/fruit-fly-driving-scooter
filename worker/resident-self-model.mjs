const DAY=86400;
export const SELF_MODEL_LIMITS=Object.freeze({places:12,people:8,milestones:12,bias:24});
const number=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
const cap=(n,a=0,b=1)=>Math.max(a,Math.min(b,number(n)));
const text=v=>typeof v==='string'?v.slice(0,96):null;
const ids=list=>[...new Set((Array.isArray(list)?list:[]).map(text).filter(Boolean))].slice(0,16);
const EVENT=/^(arrived|hired|shift_started|job_change|resident_restaurant_meal|meal|coffee|household_moved|national_residence_assigned|luxury_home_purchase|thousand_settlement|vehicle_purchase|life_skills_lesson|school_day|child_born|birth|partnered|lost_partner|family_decision|positive_social_experience|negative_social_experience|completed_social_commitment|lost_social_contact|projectile_injury|war_alarm|ceasefire|noticed_fire|fire_damage|escaped_fire|driving_outcome|industrial_hire|industrial_startup|business_failure|spaceworks_job|emergency_service_job|national_service_enlistment|north_f1_result)$/;
const DANGER=/fire|injury|war_alarm/;
const ownWork=f=>text(f.enterpriseLocationId||f.workplaceId||f.workLocationId||f.jobLocationId||f.emergencyStationId);

/** Bounded learned world/self representation. Affect is an algorithmic signal,
 * not a claim of subjective experience. Only own assignments, direct sensory
 * observations and completed engine events are evidence; global world facts
 * are deliberately never scanned here. */
export function createResidentSelfModel({world,remember:recordObservation,workplaceFor}={}){
 const now=clock=>Math.max(0,number(clock?.simulationAgeSeconds??clock?.at,number(world?.()?.simulationAgeSeconds)));
 const workAssignment=f=>{
  const assigned=workplaceFor?.(f),id=ownWork(f)||text(assigned?.id);
  return id?{id,...(assigned?.id===id&&Number.isFinite(assigned.x)&&Number.isFinite(assigned.z)?{x:assigned.x,z:assigned.z}:{})}:null;
 };
 function ensure(f,refresh=true){
  const old=f.selfModel;
  if(!old||old.version!==1)f.selfModel={version:1,knownPlaces:[],seenPeople:[],milestones:[],lastObservedAt:null};
  const m=f.selfModel;
  if(!refresh&&m.identity)return m;
  m.knownPlaces=(Array.isArray(m.knownPlaces)?m.knownPlaces:[]).slice(-12);
  m.seenPeople=(Array.isArray(m.seenPeople)?m.seenPeople:[]).slice(-8);
  m.milestones=(Array.isArray(m.milestones)?m.milestones:[]).slice(-12);
  m.identity={id:text(f.id),name:text(f.name),homeId:text(f.homeId),householdId:text(f.householdId),
   familyIds:ids([...(f.parents||[]),...(f.children||[]),f.partnerId].filter(Boolean)),workplaceId:workAssignment(f)?.id||null};
  return m;
 }
 function put(list,entry,max){const i=list.findIndex(p=>p.id===entry.id);if(i>=0)list.splice(i,1);list.push(entry);if(list.length>max)list.splice(0,list.length-max);}
 function milestone(m,kind,at,payload={}){
  const locationId=text(payload.locationId||payload.buildingId||payload.siteId),otherId=text(payload.otherId||payload.targetId||payload.partnerId||payload.with);
  const previous=m.milestones.at(-1);
  if(previous?.kind===kind&&(previous.locationId||null)===locationId&&(previous.otherId||null)===otherId&&at-previous.at<600)return false;
  const value=payload.reward!=null?Number(payload.reward):payload.damage!=null?-Number(payload.damage):NaN;
  const importance=/birth|child|lost_social|lost_partner|partnered|projectile/.test(kind)?5:/home|moved|residence|fire|war_alarm|ceasefire/.test(kind)?4:/job|hired|shift|hire|startup|business_failure/.test(kind)?3:1;
  m.milestones.push({kind,at,importance,...(locationId?{locationId}:{}),...(otherId?{otherId}:{}),...(Number.isFinite(value)?{outcome:cap(value,-100,100)}:{})});
  if(m.milestones.length>12){let least=0;for(let i=1;i<m.milestones.length;i++)if(number(m.milestones[i].importance,1)<number(m.milestones[least].importance,1))least=i;m.milestones.splice(least,1);}return true;
 }
 function assignments(f,m,at){
  const work=workAssignment(f);
  for(const [id,x,z]of [[m.identity.homeId,f.homeX,f.homeZ],[m.identity.workplaceId,work?.x,work?.z]]){
   if(!id||m.knownPlaces.some(p=>p.id===id))continue;
   put(m.knownPlaces,{id,source:'own-assignment',lastSeenAt:at,confidence:.85,...(Number.isFinite(x)&&Number.isFinite(z)?{x,z}:{})},12);
  }
 }
 function observe(f,vision,clock){
  const m=ensure(f),at=now(clock);assignments(f,m,at);
  for(const v of (Array.isArray(vision)?vision:vision?.observations||[]).slice(0,8)){
   if(v?.source!=='seen'||!text(v.id)||!Number.isFinite(v.x)||!Number.isFinite(v.z)||number(v.confidence)<=0||number(v.observedAt,at)>at+1)continue;
   const entry={id:text(v.id),...(text(v.name)?{name:text(v.name)}:{}),x:v.x,z:v.z,source:'seen',lastSeenAt:Math.min(at,number(v.observedAt,at)),confidence:cap(v.confidence)};
   if(v.kind==='resident'){
    const known=m.seenPeople.find(p=>p.id===entry.id);
    put(m.seenPeople,{...(known?.name?{name:known.name}:{}),...entry},8);
   }
   else if(['building','landmark','fire'].includes(v.kind)){
    const before=m.knownPlaces.find(p=>p.id===entry.id);
    put(m.knownPlaces,{...entry,...(v.kind==='fire'?{danger:1,dangerAt:at}:before?.danger?{danger:before.danger,dangerAt:before.dangerAt}:{})},12);
    if(v.kind==='fire'&&milestone(m,'noticed_fire',at,{locationId:entry.id}))recordObservation?.(f,'noticed_fire',{locationId:entry.id});
   }
  }
  m.lastObservedAt=at;return snapshot(f);
 }
 function remember(f,kind,payload={},clock){
  // This entry point is for completed engine events. Rumours/messages and an
  // event about another resident are not personal experience or visual truth.
  if(!EVENT.test(kind)||['rumor','hearsay','claim','message'].includes(payload.source)||payload.residentId&&payload.residentId!==f.id||payload.flyId&&payload.flyId!==f.id)return false;
  const m=ensure(f),at=now(clock);assignments(f,m,at);
  const locationId=text(payload.locationId||payload.buildingId||payload.siteId||f.currentLocationId);
  if(locationId){
   const prior=m.knownPlaces.find(p=>p.id===locationId);
   put(m.knownPlaces,{...prior,id:locationId,source:'experienced',lastSeenAt:at,confidence:.95,
    ...(locationId===f.currentLocationId&&Number.isFinite(f.x)&&Number.isFinite(f.z)?{x:f.x,z:f.z}:{}),
    ...(DANGER.test(kind)&&kind!=='war_alarm'?{danger:1,dangerAt:at}:{})},12);
  }
  return milestone(m,kind,at,{...payload,locationId});
 }
 function grief(m,at){
  return m.milestones.filter(e=>e.kind==='lost_partner').reduce((max,e)=>Math.max(max,Math.exp(-Math.max(0,at-e.at)/(DAY*3))),0);
 }
 function goals(f,m,at){
  const warning=m.milestones.filter(e=>e.kind==='war_alarm').reduce((max,e)=>Math.max(max,Math.exp(-Math.max(0,at-e.at)/21600)),0);
  const threat=m.knownPlaces.reduce((max,p)=>Math.max(max,number(p.danger)*Math.exp(-Math.max(0,at-number(p.dangerAt))/21600)),warning);
  return [
   {kind:'safety',priority:cap(Math.max(threat,number(f.stress)/130,(45-number(f.health,100))/45))},
   {kind:'food',priority:cap(number(f.hunger)/100)},
   {kind:'home',priority:cap(Math.max((100-number(f.energy,100))/100,grief(m,at)*.55))},
   {kind:'family',priority:m.identity.familyIds.length?cap(Math.max(number(f.loneliness)/100,grief(m,at)*.6)):0},
   {kind:'work',priority:m.identity.workplaceId?cap((100-number(f.money)-number(f.savings))/100):0},
  ];
 }
 function bias(f,site,action=''){
  const m=ensure(f,false),at=now(),id=text(typeof site==='string'?site:site?.id);
  const place=m.knownPlaces.find(p=>p.id===id);
  if(!id||!place)return 0;
  const g=Object.fromEntries(goals(f,m,at).map(g=>[g.kind,g.priority])),a=String(action).toLowerCase();
  const danger=m.knownPlaces.reduce((risk,p)=>{
   const nearby=p.id===id||Number.isFinite(place.x)&&Number.isFinite(place.z)&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.hypot(place.x-p.x,place.z-p.z)<=18;
   return nearby?Math.max(risk,number(p.danger)*Math.exp(-Math.max(0,at-number(p.dangerAt))/21600)):risk;
  },0);
  let result=-danger*(12+g.safety*12);
  if(id===m.identity.homeId){result+=g.home*10+g.family*8+grief(m,at)*6+g.safety*12*(1-danger);}
  if(/eat|meal|food|restaurant|coffee/.test(a))result+=g.food*16*(1-danger);
  if(id===m.identity.workplaceId&&/work|shift|job/.test(a))result+=g.work*10*(1-danger);
  const memory=m.milestones.filter(e=>e.locationId===id&&Number.isFinite(e.outcome)).at(-1);
  if(memory)result+=cap(memory.outcome,-5,5)*Math.exp(-Math.max(0,at-memory.at)/(DAY*3));
  const certainty=place.source==='own-assignment'?number(place.confidence,.85):number(place.confidence)*Math.pow(.5,Math.max(0,at-number(place.lastSeenAt))/(DAY*3));
  return cap(result*certainty,-24,24)||0;
 }
 function snapshot(f){
  const m=ensure(f),at=now(),priorities=goals(f,m,at),safety=priorities[0].priority;
  const confidence=p=>cap(number(p.confidence)*Math.pow(.5,Math.max(0,at-number(p.lastSeenAt))/(DAY*3)));
  return {version:1,algorithmOnly:true,identity:{...m.identity,familyIds:[...m.identity.familyIds]},
   knownPlaces:m.knownPlaces.map(p=>({...p,confidence:confidence(p)})),seenPeople:m.seenPeople.map(p=>({...p,confidence:confidence(p)})),
   milestones:m.milestones.map(e=>({...e})),goals:priorities,modeledAffect:{fear:safety,grief:grief(m,at),comfort:cap((1-safety)*(1-grief(m,at)*.5)*(f.currentLocationId===m.identity.homeId?.9:.4)*(number(f.health,100)/100)),source:'needs-and-observed-events'},lastObservedAt:m.lastObservedAt};
 }
 return {observe,remember,bias,snapshot};
}
