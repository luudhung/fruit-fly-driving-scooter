import {civicFacilities,facilitySpec,civicServiceCapacity} from './civic-development.mjs';
const APPLY='applying for a civic facility job',CARE='visiting a community clinic',LEARN='attending a community school';
const money=a=>Math.max(0,Number(a?.cash)||0),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const diverted=f=>f.urbanTask||f.socialTask||f.civicDuty||f.publicServiceDuty||f.cityService||f.taxiPassenger||f.taxiJobId||f.privateFlight||f.onPrivateHelicopter||f.onTrain||f.onPlane||f.fireEngineDuty||f.ambulanceDuty||f.industrialFreightDuty||f.airTrip||f.arrested;
/** Small commissioned civic sites use real applicants and attendance, never generated workers. */
export function createCivicFacilityOperations({world,emit=()=>{},remember=()=>{},startJourney,moveFly,needsAndActivities=()=>{},payAndFinance=()=>{}}){
 const raw=()=>world(),now=()=>Number(raw().simulationAgeSeconds||0),find=id=>raw().urbanWorld?.buildings?.[id];
 let memoState=null,memoAt=-1,memoSites=[],memoRosters=new Map();
 // One resident scan per simulation time, rather than one scan per chooser/site.
 function directory(){if(memoState!==raw()||memoAt!==now()){memoState=raw();memoAt=now();memoSites=civicFacilities(raw());memoRosters=new Map();for(const f of raw().flies||[]){const id=f.facilityEmployment?.buildingId;if(!id)continue;let roster=memoRosters.get(id);if(!roster){roster=[];memoRosters.set(id,roster);}roster.push(f);}}}
 const facilities=()=>{directory();return memoSites;};
 const workersFor=id=>{directory();return (memoRosters.get(id)||[]).filter(f=>f.alive&&f.facilityEmployment?.buildingId===id);};
 const source=b=>b.fundingAccountId==='power-grid'?raw().utilities?.powerPlant:raw().treasury;
 const eligible=(f,spec)=>f?.alive&&f.ageYears>=21&&f.ageYears<70&&!f.jobId&&!f.businessId&&!f.businessEmployeeOf&&!f.facilityEmployment&&!f.publicServiceRole&&!diverted(f)&&!f.sleeping&&f.health>50&&f.energy>25&&Number(f.professionSkills?.[spec.skill]||0)>=spec.minimumSkill;
 const onShift=(job,spec,clock)=>((Number(clock.hour||0)+Number(clock.minute||0)/60-job.shiftStart+24)%24)<Number(spec.hours||8);
 const here=(f,b)=>f.alive&&!f.traveling&&!f.sleeping&&!diverted(f)&&f.health>30&&f.energy>8&&f.currentLocationId===b.id&&distance(f,b.frontage||b)<24;
 function care(f,clock){needsAndActivities(f,clock);payAndFinance(f,clock);}
 function reconcile(f){
  const job=f.facilityEmployment;if(!job)return;
  const b=find(job.buildingId);
  if(!f.alive||f.ageYears>=70||f.jobId||f.businessId||f.businessEmployeeOf||f.publicServiceRole||!b||['collapsed','cleared','cancelled'].includes(b.stage)){
   delete f.facilityEmployment;
   if(f.alive&&!diverted(f)&&f.targetLocationId===job.buildingId){f.traveling=false;f.routeWaypoints=[];f.vx=f.vz=0;f.actionUntil=0;}
   return;
  }
  job.suspended=b.stage!=='operational';
  if(job.suspended){job.wasPresent=false;job.lastPaidAt=-1;}
 }
 function apply(f,id){
  const b=find(id),spec=facilitySpec(b?.facilityType);if(!b||b.stage!=='operational'||!spec?.staff||!eligible(f,spec)||f.traveling||f.currentLocationId!==id||money(source(b))<spec.wage)return false;
  const jobs=workersFor(id).map(f=>f.facilityEmployment);
  const shifts=spec.shifts.map(start=>({start,count:jobs.filter(j=>j.shiftStart===start).length})).sort((a,b)=>a.count-b.count||a.start-b.start),shift=shifts[0];if(!shift||shift.count>=spec.staff)return false;
  f.facilityEmployment={buildingId:id,shiftStart:shift.start,wage:spec.wage,joinedAt:now(),lastAt:now(),wasPresent:false,lastPaidAt:-1};
  let roster=memoRosters.get(id);if(!roster){roster=[];memoRosters.set(id,roster);}roster.push(f);
  remember(f,'civic_facility_job',{buildingId:id,facilityType:b.facilityType,shiftStart:shift.start,wage:spec.wage});emit('civic_facility_hire',`${f.id} accepted a paid job at ${b.name}.`,{flyId:f.id,buildingId:id});return true;
 }
 function addChoices(f,clock,add){
  if(!f?.alive||f.traveling||diverted(f))return;
  if(f.facilityEmployment){const b=find(f.facilityEmployment.buildingId),spec=facilitySpec(b?.facilityType);if(b?.stage==='operational'&&spec&&onShift(f.facilityEmployment,spec,clock))add(b.id,'working at a civic facility',150);return;}
  const candidates=facilities().filter(b=>b.stage==='operational'&&facilitySpec(b.facilityType)?.staff).sort((a,b)=>distance(f,a.frontage||a)-distance(f,b.frontage||b));
  let offered=0;
  for(const b of candidates){const spec=facilitySpec(b.facilityType);if(eligible(f,spec)&&money(source(b))>=spec.wage&&workersFor(b.id).length<spec.staff*spec.shifts.length){add(b.id,APPLY,70+Number(f.traits?.empathy||.5)*30);if(++offered>=2)break;}}
  const staffed=b=>workersFor(b.id).some(p=>p.facilityEmployment.wasPresent&&p.facilityEmployment.lastPaidAt>=0&&p.facilityEmployment.lastPaidAt>=now()-1800&&here(p,b)&&onShift(p.facilityEmployment,facilitySpec(b.facilityType),clock));
  if((f.illness||f.health<80)){const b=candidates.find(b=>b.facilityType==='clinic'&&staffed(b));if(b)add(b.id,CARE,100+(80-Number(f.health||80)));}
  if(f.ageYears>=5&&f.ageYears<18&&Number(clock.hour)>=7&&Number(clock.hour)<15){const b=candidates.find(b=>b.facilityType==='school'&&staffed(b));if(b)add(b.id,LEARN,125);}
 }
 function handleResident(f,clock){
  if(f)reconcile(f);
  if(!f?.alive||diverted(f))return false;
  if(!f.traveling&&(f.action===APPLY||f.pendingAction===APPLY))apply(f,f.currentLocationId);
  const job=f.facilityEmployment;
  if(job){
   if(f.jobId||f.businessId||f.businessEmployeeOf){delete f.facilityEmployment;return false;}
   const b=find(job.buildingId),spec=facilitySpec(b?.facilityType);
   if(!b||b.stage!=='operational'||!spec?.staff||!onShift(job,spec,clock))return false;
   if(!here(f,b)){
    if(!f.traveling&&now()>=Number(job.nextRouteAt||0)){job.nextRouteAt=now()+600;startJourney?.(f,{id:b.id,action:'reporting for a civic facility shift'});}
    if(f.traveling){moveFly?.(f);care(f,clock);return true;}return false;
   }
   f.action=`working at ${b.name}`;f.actionUntil=now()+600;f.indoors=true;care(f,clock);return true;
  }
  if(f.traveling)return false;
  const b=find(f.currentLocationId),action=f.pendingAction||f.action;
  if(b?.stage==='operational'&&[CARE,LEARN].includes(action)&&distance(f,b.frontage||b)<24){
   if(!f.facilityVisit||f.facilityVisit.buildingId!==b.id)f.facilityVisit={buildingId:b.id,startedAt:now(),until:now()+3600};
   if(now()>=f.facilityVisit.until||action===CARE&&!f.illness&&f.health>=90){f.facilityVisit=null;f.actionUntil=0;f.pendingAction=null;return false;}
   f.action=action;f.indoors=true;f.actionUntil=Math.min(f.facilityVisit.until,now()+600);care(f,clock);return true;
  }
  return false;
 }
 function tick(dt,clock){
  const list=facilities();if(!list.some(b=>facilitySpec(b.facilityType)?.staff)&&!(raw().flies||[]).some(f=>f.facilityEmployment))return;
  for(const f of raw().flies||[]){
   reconcile(f);const job=f.facilityEmployment;if(!job)continue;
   const b=find(job.buildingId),spec=facilitySpec(b?.facilityType),attending=Boolean(b?.stage==='operational'&&spec?.staff&&!f.jobId&&!f.businessId&&!f.businessEmployeeOf&&here(f,b)&&onShift(job,spec,clock));
   const seconds=attending&&job.wasPresent?Math.min(dt,1800,Math.max(0,now()-Number(job.lastAt??now()))):0;job.wasPresent=attending;job.lastAt=now();
   if(!seconds)continue;
   const payer=source(b),due=job.wage*seconds/3600,paid=Math.min(money(payer),due);
   if(paid+1e-8<due){job.lastPaidAt=-1;job.wageArrears=Number(job.wageArrears||0)+due-paid;}
   else job.lastPaidAt=now();
   if(paid>0){payer.cash-=paid;f.money=Number(f.money||0)+paid;f.salaryLifetime=Number(f.salaryLifetime||0)+paid;f.salaryEarnedToday=Number(f.salaryEarnedToday||0)+paid;f.workMinutesToday=Number(f.workMinutesToday||0)+seconds/60;raw().totalTransactions=Number(raw().totalTransactions||0)+1;b.wagesPaid=Number(b.wagesPaid||0)+paid;}
  }
  for(const b of list){
   const spec=facilitySpec(b.facilityType);if(!['clinic','school'].includes(b.facilityType))continue;
   const staff=workersFor(b.id).filter(f=>f.facilityEmployment.lastPaidAt===now()&&here(f,b)&&onShift(f.facilityEmployment,spec,clock));if(!staff.length)continue;
   const clients=(raw().flies||[]).filter(f=>here(f,b)&&!f.facilityEmployment&&(b.facilityType==='clinic'?(f.illness||f.health<90):f.ageYears>=5&&f.ageYears<18)).slice(0,Math.floor(b.capacity*staff.length/spec.staff));
   const payer=source(b),units=clients.length*Math.min(dt,1800)/3600,cost=units*(b.facilityType==='clinic'?1.2:.25);if(!units||money(payer)+1e-8<cost)continue;
   raw().businesses||={};const supplies=raw().businesses['civic-service-supplies']||={cash:0,inventory:0,sector:'civic-service-supplies'};
   payer.cash-=cost;supplies.cash+=cost;raw().totalTransactions=Number(raw().totalTransactions||0)+1;b.serviceSpending=Number(b.serviceSpending||0)+cost;
   for(const f of clients){const hours=Math.min(dt,1800)/3600;
    if(b.facilityType==='clinic'){
     f.health=Math.min(100,Number(f.health||0)+hours*4);
     // Engine illness is a diagnostic label (string|null), not a severity number.
     if(typeof f.illness==='string'&&f.illness){
      if(f.civicClinicCare?.illness!==f.illness)f.civicClinicCare={illness:f.illness,treatmentHours:0};
      f.civicClinicCare.treatmentHours=Number(f.civicClinicCare.treatmentHours||0)+hours;
      if(f.health>=88&&f.civicClinicCare.treatmentHours>=2){f.illness=null;f.civicClinicCare=null;}
     }
    }
    else{f.educationLevel=Math.min(100,Number(f.educationLevel||0)+hours*.12);f.knowledge||={};f.knowledge.general=Math.min(1,Number(f.knowledge.general||0)+hours*.0012);}
    b.serviceVisits=Number(b.serviceVisits||0)+hours;
   }
  }
 }
 return {tick,addChoices,handleResident,apply,capacity:clock=>civicServiceCapacity(raw(),clock)};
}
