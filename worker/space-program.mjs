import {countryAt} from './country-map.mjs';

const DAY=86400;
const employer='spaceworks';
const control='spaceworks-control';
const application='applying to Hansdrex Spaceworks';
const roles=new Map([
 ['spaceworks-engineer',{site:'spaceworks-assembly',title:'Spaceworks assembly engineer',wage:8.2,limit:3}],
 ['spaceworks-operations',{site:control,title:'Spaceworks mission controller',wage:8.6,limit:3}],
]);

export function createSpaceProgram({world,emit,remember,isUnavailable,isWorkCommitted}){
 const raw=()=>world();
 const now=()=>raw().simulationAgeSeconds;
 const data=()=>raw().spaceProgram||={nextReviewAt:0,nextMissionAt:0,missions:0,totalSpending:0,active:null};
 let rosterTime=-1,rosterWorld=null,roster=[];
 function employees(){
  const s=raw();
  if(rosterWorld!==s||rosterTime!==now()){
   rosterTime=now();rosterWorld=s;
   roster=s.flies.filter(f=>f.alive&&roles.has(f.jobId));
  }
  return roster;
 }
 function moveFunds(from,to,amount){
  if(!from||Number(from.cash||0)<amount)return false;
  from.cash-=amount;
  to.cash=Number(to.cash||0)+amount;
  raw().totalTransactions++;
  return true;
 }
 function available(f){
  return f.alive&&!f.traveling&&!f.onPlane&&!f.onTrain&&f.ageYears>=21&&f.ageYears<=65
   &&f.health>55&&f.energy>35&&f.hunger<75&&!f.jobId&&!f.businessId&&!f.businessEmployeeOf
   &&!f.publicServiceRole&&!f.facilityEmployment&&!f.urbanTask&&!f.civicDuty
   &&!f.countryFlightPlan&&!f.countryAirTrip&&!f.fireEngineDuty&&!f.ambulanceDuty
   &&!f.socialTask&&!f.cityService&&!f.taxiJobId&&!f.taxiPassenger&&!f.sportsSession&&!f.privateFlight
   &&countryAt(f)==='hansdrex'&&!isWorkCommitted(f);
 }
 function addChoices(f,clock,add){
  if(!raw().businesses[employer]||clock.hour<7||clock.hour>=16||!available(f)||f.x>-450||employees().length>=6)return;
  if(Number(f.spaceworksApplicationAt??-DAY)+DAY>now())return;
  add(control,application,65+Number(f.traits?.ambition||0)*36+Number(f.intelligence||0)*16);
 }
 function finishApplication(f){
  if(f.traveling||f.currentLocationId!==control||f.action!==application)return;
  f.spaceworksApplicationAt=now();
  const entry=[...roles].find(([id,r])=>employees().filter(p=>p.jobId===id).length<r.limit);
  if(entry&&available(f)&&!isUnavailable(control,f)&&Math.hypot(f.x+670,f.z+459)<28){
   const [id,role]=entry;
   Object.assign(f,{jobId:id,jobTitle:role.title,wage:role.wage,preferredWorkStart:8,preferredWorkHours:8,workMinutesToday:0});
   employees().push(f);
   remember(f,'spaceworks_job',{jobId:id,workplaceId:role.site});
   emit('spaceworks_hire',`${f.id} joined ${role.title} at West City.`,{flyId:f.id,jobId:id});
  }
  f.action='finished a Spaceworks application';f.actionUntil=now()+600;
 }
 function authorizeMission(d){
  if(now()<d.nextMissionAt)return;
  const crew=employees().filter(f=>!f.traveling&&f.indoors&&!f.onPlane&&f.currentLocationId===roles.get(f.jobId).site
    &&String(f.action||'').startsWith('working'));
  if(!crew.some(f=>f.jobId==='spaceworks-engineer')||!crew.some(f=>f.jobId==='spaceworks-operations'))return;
  if([control,'spaceworks-assembly','spaceworks-tower'].some(id=>isUnavailable(id)))return;
  const weather=raw().weather;
  if(Number(weather?.precipitation||0)>.4||Number(weather?.wind||0)>.65)return;
  const company=raw().businesses[employer],cost=900;
  if(company.cash<cost+300)return;
  const supplier=raw().businesses['spaceworks-supply']||={cash:0,inventory:0,sector:'aerospace-supplies'};
  if(!moveFunds(company,supplier,cost))return;
  const departure=now()+720,arrival=departure+2400;
  const labels=['Weather observation satellite','Coastal mapping satellite','Climate research payload'];
  d.active={id:`SPACE-${d.missions+1}`,label:labels[d.missions%labels.length],departure,arrival};
  d.totalSpending+=cost;
  emit('spaceworks_countdown',`West City began the countdown for ${d.active.label}.`,{missionId:d.active.id,departure});
 }
 function tick(){
  const d=data();
  if(d.active){
   if(now()<d.active.arrival)return;
   d.missions++;
   const s=raw(),researchPayment=Number(s.treasury.cash||0)>15000&&moveFunds(s.treasury,s.businesses[employer],1400)?1400:0;
   d.lastMission={...d.active,completedAt:now(),researchPayment};
   d.active=null;d.nextMissionAt=now()+DAY;
   emit('spaceworks_mission',`Hansdrex Spaceworks deployed ${d.lastMission.label.toLowerCase()}.`,{missionId:d.lastMission.id});
  }
  if(now()<d.nextReviewAt)return;
  d.nextReviewAt=now()+900;
  const s=raw();
  if(!s.businesses[employer]){
   if(Number(s.treasury.cash||0)<16000)return;
   const company={cash:0,inventory:0,sector:'civilian-aerospace',countryId:'hansdrex'};
   if(!moveFunds(s.treasury,company,10000))return;
   s.businesses[employer]=company;
   d.fundedAt=now();
  }
  authorizeMission(d);
 }
 function snapshot(){
  if(!raw().spaceProgram)return null;
  const d=data();
  return {employees:employees().length,missions:d.missions,active:d.active,lastMission:d.lastMission||null,cash:Number(raw().businesses[employer]?.cash||0)};
 }
 return {tick,snapshot,addChoices,finishApplication};
}
