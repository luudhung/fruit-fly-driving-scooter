import {pedestrianRoute,vehicleRoute} from './city-map.mjs';
import {COUNTRY_IDS,NORTH_AIRPORT,countryAt} from './country-map.mjs';
import {readyToDrive} from './life-skills.mjs';
import {NORTH_F1_CIRCUIT,NORTH_F1_CHARTER_STANDS} from './north-f1-map.mjs';
import {F1_TARGET_SPEED,planF1Motion,f1MotionWindow,sampleF1Motion} from './north-f1-motion.mjs';
import {INBOUND_SECONDS,OUTBOUND_SECONDS,visitorArrivalPath,visitorRunwaySlot} from './visitor-aviation.mjs';

const HOUR=3600,DAY=24*HOUR;
const NORTH=COUNTRY_IDS.north,HANS=COUNTRY_IDS.hansdrex;
const {spectator,paddock}=NORTH_F1_CIRCUIT;
const ACCOUNT='north-f1';
const WATCH='heading to the North City Grand Prix';
const DRIVE='reporting for the North City Grand Prix';
export const NORTH_F1_RULES={cadenceDays:5,startHour:19,laps:62,entryPrice:18,charterLimit:200};
const TEAM_COLORS=[0xe83c42,0x17adca,0x24a97b,0xffa022,0x5641c8,0xe14d99,0x3b68f1,0xc5d138,0xf0f4f8,0x903b2b];
const TEAM_NAMES=['Aurora GP','Northstar Racing','Riverline Works','Circuit Horizon','Midnight Motorsport','Apex Union','Beacon Racing','Polar Dynamics','Argent Grand Prix','Redleaf Engineering'];
const signature=text=>{let key=2166136261;for(const c of String(text))key=Math.imul(key^c.charCodeAt(0),16777619);return (key>>>0)/4294967296;};
const wallet=f=>Math.max(0,Number(f.money||0))+Math.max(0,Number(f.savings||0));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const counts=()=>({total:0,visitors:0,hansdrex:0,north:0});
const homeCountry=f=>f.residencyCountryId||countryAt({x:f.homeX,z:f.homeZ})||f.citizenshipCountryId;
const occupied=(f,at)=>f.fireEngineDuty||f.ambulanceDuty||f.publicServiceRole||f.publicServiceDuty||f.nationalServiceDuty||f.industrialFreightDuty
 ||f.cityService||f.taxiJobId||f.taxiPassenger||f.civicDuty||f.urbanTask||f.warResponse?.active||Number(f.arrestedUntil||0)>at||f.traveling&&f.countryBorderHold
 ||f.privateFlight||f.privateHelicopterTrip||f.airTrip||f.countryFlightPlan||f.countryAirTrip||f.heliPassenger||f.sportsSession;
const healthy=f=>f.alive&&Number(f.health??80)>45&&!f.illness;
const onSite=(f,site)=>!f.traveling&&!f.onPlane&&!f.onTrain&&f.currentLocationId===site.id&&distance(f,site)<35;

export function createNorthF1({world,northAccount,emit=()=>{},remember=()=>{},startJourney,moveFly,needsAndActivities,payAndFinance,
 isUnavailable=()=>false,aviationAdmission,lawfulPresence=()=>true,travelCost=()=>({affordable:true,closed:false,entryFee:0})}){
 const raw=()=>world(),now=()=>Number(raw().simulationAgeSeconds||0);
 function account(id){
  const businesses=raw().businesses||={};
  return businesses[id]||={cash:0,inventory:0,sector:'sports-events',countryId:NORTH};
 }
 const data=()=>raw().northF1||={teams:TEAM_NAMES.map((name,i)=>({id:`NFR-${i+1}`,name,color:TEAM_COLORS[i],drivers:[]})),
  nextAt:(Math.floor(now()/DAY)+2)*DAY+NORTH_F1_RULES.startHour*HOUR,nextRosterAt:0,reserveDrivers:[],event:null,history:[],races:0,cancelled:0,
  visits:0,hansdrexVisitors:0,visitors:0,northVisitors:0,revenue:0,ticketTax:0,prizes:0,charterArrivals:0,charterDepartures:0,externalInflow:0,externalOutflow:0};
 const durationEstimate=()=>NORTH_F1_CIRCUIT.lapLength*NORTH_F1_RULES.laps*Number(raw().timeScale||120)/(F1_TARGET_SPEED*.81)+900;
 const weatherClosed=()=>{const w=raw().weather||{};return w.condition==='thunderstorm'||Number(w.precipitation||0)>.64||Number(w.wind||0)>.73;};
 let indexedWorld,indexedAt,actorsById=new Map(),driverIds=new Set();
 function directory(d){
  if(indexedWorld!==raw()||indexedAt!==now()){
   indexedWorld=raw();indexedAt=now();actorsById=new Map((raw().flies||[]).map(f=>[f.id,f]));
   driverIds=new Set([...d.teams.flatMap(t=>t.drivers),...(d.reserveDrivers||[])]);
  }
 }
 function eligibleDriver(f){return Boolean(f&&healthy(f)&&homeCountry(f)===NORTH&&f.ageYears>=21&&f.ageYears<=68&&readyToDrive(f)
  &&!f.publicServiceRole&&!f.publicServiceDuty&&!f.nationalServiceDuty&&!f.facilityEmployment&&!f.industrialFreightDuty);}
 function rating(f,id=''){
  return Number(f.professionSkills?.racing||0)*.55+Number(f.traits?.resilience??.5)*.18+Number(f.traits?.ambition??.5)*.15
   + (String(f.vehicle||'').includes('car') ? .08 : 0)+signature(f.id+id)*.12;
 }
 function updateRoster(d){
  if(now()<d.nextRosterAt||d.event&&now()>=d.event.startsAt-28*HOUR)return;
  d.nextRosterAt=now()+12*HOUR;directory(d);
  const signed=new Set();
  for(const team of d.teams){
   team.drivers=team.drivers.filter(id=>eligibleDriver(actorsById.get(id))&&!signed.has(id)&&Boolean(signed.add(id)));
  }
  const roster=[...actorsById.values()].filter(f=>eligibleDriver(f)&&!signed.has(f.id)).sort((a,b)=>{
   const score=f=>rating(f)+(countryAt(f)===NORTH ? .42 : 0)-Math.min(.28,distance(f,paddock)/3500);
   return score(b)-score(a)||a.id.localeCompare(b.id);
  });
  for(const team of d.teams)while(team.drivers.length<2&&roster.length){
   const f=roster.shift();team.drivers.push(f.id);signed.add(f.id);
   remember(f,'north_f1_signed',{teamId:team.id});
  }
  d.reserveDrivers=roster.slice(0,16).map(f=>f.id);
  driverIds=new Set([...signed,...d.reserveDrivers]);
 }
 function offer(f){
  const e=raw().northF1?.event;
  if(!e||now()+36*HOUR<e.startsAt||now()>=e.endsAt||e.status==='cancelled'||f?.lastNorthF1Ticket===e.id)return null;
  return {id:e.id,startsAt:e.startsAt,endsAt:e.endsAt,siteId:spectator.id,price:e.price};
 }
 function ticket(f,e,kind){
  const price=e.price;
  if(wallet(f)<price||e.audience.total>=NORTH_F1_CIRCUIT.capacity)return false;
  const cash=Math.min(Math.max(0,Number(f.money||0)),price);
  f.money=Number(f.money||0)-cash;f.savings=Number(f.savings||0)-(price-cash);
  f.expensesLifetime=Number(f.expensesLifetime||0)+price;
  const tax=Math.round(price*.15*100)/100,treasury=northAccount?.();
  if(treasury)treasury.cash=Number(treasury.cash||0)+tax;
  account(ACCOUNT).cash+=price-(treasury?tax:0);
  raw().totalTransactions=Number(raw().totalTransactions||0)+1;
  f.lastNorthF1Ticket=e.id;e.audience.total++;e.audience[kind]++;
  e.ticketPayers.push({id:f.id,kind,tax:treasury?tax:0});
  const d=data();d.visits++;d.revenue+=price;d.ticketTax+=treasury?tax:0;
  if(kind==='hansdrex')d.hansdrexVisitors++;
  else if(kind==='north')d.northVisitors++;
  else d.visitors++;
  return true;
 }
 function attend(f){
  const e=raw().northF1?.event;
  if(!e||!offer(f)||now()<e.startsAt-5*HOUR||!healthy(f)||!onSite(f,spectator)||countryAt(f)!==NORTH
    ||!lawfulPresence(f,NORTH)||isUnavailable(spectator.id,f))return false;
  const kind=f.kind==='visitor'?'visitors':homeCountry(f)===HANS?'hansdrex':'north';
  if(!ticket(f,e,kind))return false;
  remember(f,'north_f1_attendance',{raceId:e.id,price:e.price,nation:homeCountry(f)});
  return true;
 }
 function fanPlan(f,e){
  if(!healthy(f)||f.kind==='visitor'||Number(f.ageYears||0)<16||occupied(f,now())||f.onPlane||f.onTrain)return null;
  const home=homeCountry(f);
  if(home!==HANS&&home!==NORTH)return null;
  const interest=signature(f.id+e.id);
  if(home===HANS?(!e.fanInvites[f.id]||e.audience.hansdrex>=e.fanTarget):interest>=.46)return null;
  const travel=travelCost(f,NORTH);
  if(travel.closed||!travel.affordable||wallet(f)<e.price+Number(travel.entryFee||0)+8)return null;
  const lead=Math.min(29*HOUR,5*HOUR+distance(f,spectator)*Number(raw().timeScale||120)/(String(f.vehicle||'').includes('car')?3.7:1.6));
  return {home,interest,departure:e.startsAt-lead-signature(e.id+f.id)*4*HOUR};
 }
 function fitForOuting(f){
  const energy=Number(f.energy??50),hunger=Number(f.hunger??0),health=Number(f.health??80);
  return energy>10&&(hunger<82||health>=72&&energy>14);
 }
 function addChoices(f,clock,add){
  const d=raw().northF1,e=d?.event;
  if(!e||!offer(f)||f.traveling||f.f1Duty||driverIds.has(f.id))return;
  const plan=fanPlan(f,e);
  if(!plan||now()<plan.departure||!fitForOuting(f))return;
  const excitement=Number(f.traits?.sociability??.5)*20+Number(f.traits?.risk??.5)*17;
  add(spectator.id,WATCH,108+excitement+Math.max(0,60-f.hunger)*.12);
 }
 function tryJourney(f,id,action){return Boolean(startJourney?.(f,{id,action}));}
 function care(f,clock){
  if(f.f1CareAt===now())return;
  f.f1CareAt=now();needsAndActivities?.(f,clock);payAndFinance?.(f,clock);
  if(!onSite(f,paddock)&&!onSite(f,spectator))return;
  if(f.thirst>48)f.thirst=Math.max(0,f.thirst-46);
  if(f.hunger<=52)return;
  const market=raw().businesses?.['north-market'];
  if(!market||market.inventory<1||wallet(f)<4)return;
  const cash=Math.min(Math.max(0,Number(f.money||0)),4);
  f.money=Number(f.money||0)-cash;f.savings=Number(f.savings||0)-(4-cash);
  f.expensesLifetime=Number(f.expensesLifetime||0)+4;f.hunger=Math.max(0,f.hunger-58);
  market.cash=Number(market.cash||0)+4;market.inventory--;raw().totalTransactions=Number(raw().totalTransactions||0)+1;
 }
 function handleResident(f,clock){
  const d=raw().northF1,e=d?.event;
  if(!d||!e&&!f.f1Duty)return false;
  directory(d);
  const driver=driverIds.has(f.id)&&eligibleDriver(f);
  const eAvailable=e&&e.status!=='cancelled'&&now()<e.endsAt;
  let duty=f.f1Duty;
  if(duty&&(occupied(f,now())||!healthy(f))){f.f1Duty=null;f.actionUntil=0;return false;}
  if(duty?.role==='fan'&&(!eAvailable||duty.raceId!==e?.id)&&homeCountry(f)===HANS&&countryAt(f)===NORTH){
   duty.role='return';duty.leaveAt=now()+signature(duty.raceId+f.id+'return')*HOUR*2;
  }
  if(duty?.role==='return'){
   if(now()<duty.leaveAt){care(f,clock);return true;}
   if(f.traveling){moveFly?.(f);care(f,clock);return true;}
   if(f.currentLocationId!==f.homeId&&tryJourney(f,f.homeId,'returning home after the North City Grand Prix')){care(f,clock);return true;}
   f.f1Duty=null;f.actionUntil=0;return false;
  }
  if(duty&&(duty.raceId!==e?.id||!eAvailable)){f.f1Duty=null;f.actionUntil=0;return false;}
  if(!duty&&eAvailable&&!f.traveling&&!f.onTrain&&!f.onPlane&&!occupied(f,now())&&healthy(f)&&Number(f.f1RetryAt||0)<=now()){
   if(driver&&e.status==='scheduled'&&now()>=e.startsAt-28*HOUR&&now()<e.startsAt+HOUR/2&&countryAt(f)!==COUNTRY_IDS.hawaii&&Number(f.energy??50)>12){
    duty=f.f1Duty={raceId:e.id,role:'driver'};
   }else if(f.action===WATCH||f.pendingAction===WATCH){
    duty=f.f1Duty={raceId:e.id,role:'fan'};
   }else if(now()<e.startsAt&&now()>=e.startsAt-34*HOUR&&fitForOuting(f)){
    const plan=fanPlan(f,e);
    // The weekend draw gives the main group a planned outing. Still catch less
    // keen residents through the ordinary competing activities in addChoices.
    if(plan&&now()>=plan.departure&&(plan.home===HANS||plan.interest<.30))duty=f.f1Duty={raceId:e.id,role:'fan'};
   }
  }
  if(!duty)return false;
  const site=duty.role==='driver'?paddock:spectator,isDriver=duty.role==='driver';
  if(!eAvailable||isUnavailable(site.id,f)){f.f1Duty=null;return false;}
  if(f.traveling){moveFly?.(f);care(f,clock);return true;}
  if(!onSite(f,site)){
   if(!tryJourney(f,site.id,isDriver?DRIVE:WATCH)){
    f.f1Duty=null;f.f1RetryAt=now()+HOUR;return false;
   }
   care(f,clock);return true;
  }
  if(isDriver){
   const car=e.cars?.find(c=>c.driverId===f.id);
   if(e.status==='racing'&&!car){f.f1Duty=null;f.actionUntil=0;return false;}
   const resting=now()<e.startsAt-HOUR&&Number(f.energy??50)<64;
   f.indoors=resting;
   f.recoveringEnergy=resting;
   f.action=resting?'resting indoors':car?'driving in the North City Grand Prix':'preparing the team car in the Grand Prix paddock';
  }else{
   if(f.lastNorthF1Ticket!==e.id&&now()>=e.startsAt-5*HOUR&&!attend(f)){f.f1Duty=null;f.f1RetryAt=now()+HOUR;return false;}
   f.action=now()<e.startsAt?'waiting for the Grand Prix in the stands':'watching the North City Grand Prix';
  }
  f.sleeping=false;care(f,clock);return true;
 }
 function roadItinerary(){
  const gate=NORTH_AIRPORT.gate,destination=spectator,scale=Number(raw().timeScale||120);
  const drive=vehicleRoute(gate,destination);
  const path=drive.some(p=>p.mode==='car')?drive:pedestrianRoute(gate,destination);
  if(!path.length||path.some(p=>countryAt(p)!==NORTH))return null;
  let prior=gate,at=0;
  const points=path.map(p=>{const driven=p.mode==='car';at+=distance(prior,p)*scale/(driven?10:2.5);prior=p;return{x:p.x,y:Number(p.y||1.1),z:p.z,at,mode:driven?'shuttle':'walk'};});
  return at>0?{duration:Math.ceil(at+180),points:[{...gate,y:1.1,at:0,mode:'walk'},...points]}:null;
 }
 function shuttlePoint(route,elapsed,returning=false){
  const at=returning?route.duration-elapsed:elapsed;
  const next=route.points.findIndex(p=>p.at>Math.max(0,at));
  if(next<0)return route.points.at(-1);
  const before=route.points[Math.max(0,next-1)],after=route.points[next];
  const weight=Math.max(0,Math.min(1,(at-before.at)/Math.max(1,after.at-before.at)));
  return {x:before.x+(after.x-before.x)*weight,y:before.y+(after.y-before.y)*weight,z:before.z+(after.z-before.z)*weight};
 }
 function trafficDuringRace(e,except){
  return [...(raw().cityVisitors?.airportTraffic?.flights||[]).filter(f=>(f.airportId||'city')==='north'),
   ...(raw().nationalServices?.aircraft||[]).filter(p=>p.airportId==='north'&&p.flight).map(p=>({inboundAt:p.flight.departure,parkedAt:p.flight.arrival})),
   ...e.charters.filter(f=>f!==except)];
 }
 function makeCharters(e){
  if(e.charterPlanned||now()<e.startsAt-13*HOUR)return;
  e.charterPlanned=true;
  if(now()>e.startsAt-6*HOUR)return;
  const route=roadItinerary();
  if(!route)return;
  e.shuttleRoute=route;
  const demand=Math.min(NORTH_F1_RULES.charterLimit,120+Math.floor(signature(e.id+'crowd')*81));
  e.charterDemand=demand;
  for(const [index,stand] of NORTH_F1_CHARTER_STANDS.entries()){
   const id=`${e.id}-CHARTER-${index+1}`,size=Math.min(100,demand-index*100);
   if(size<=0)continue;
   const earliest=Math.max(now()+180,e.startsAt-(12-index)*HOUR);
   const inboundAt=visitorRunwaySlot(earliest,INBOUND_SECONDS,trafficDuringRace(e),'north');
   const flight={id,airportId:'north',standId:stand.id,arrivalStand:stand,sector:index?'east':'north',direction:index?-1:1,
    inboundAt,parkedAt:inboundAt+INBOUND_SECONDS,arrivingGuests:size,kind:'passenger',boardAt:null,outboundAt:null,exitAt:null,
    guests:[],landed:false};
   const scale=Number(raw().timeScale||120),lastArrival=visitorArrivalPath(flight,size-1,scale).at(-1)?.at;
   if(!lastArrival||lastArrival+route.duration>=e.startsAt-600)continue;
   // These visitors bring outside money and never consume city hotel/brain quotas.
   for(let n=0;n<size;n++){
    const uid=`${id}-${n+1}`,initialCash=160+Math.round(signature(uid)*40);
    flight.guests.push({id:uid,kind:'visitor',alive:true,ageYears:19+Math.floor(signature(uid+'age')*57),citizenshipCountryId:'outside',
     originCountryId:'outside',money:initialCash,savings:0,phase:'inbound',initialCash});
   }
   flight.arrivalCompleteAt=lastArrival;
   e.charters.push(flight);
  }
 }
 function processCharters(d,e){
  const scale=Number(raw().timeScale||120);
  for(const flight of e.charters){
   if(flight.departed)continue;
   if(!flight.landed&&now()>=flight.parkedAt){
    if(weatherClosed()){
     flight.inboundAt=visitorRunwaySlot(now()+900,INBOUND_SECONDS,trafficDuringRace(e,flight),'north');
     flight.parkedAt=flight.inboundAt+INBOUND_SECONDS;
     flight.arrivalCompleteAt=visitorArrivalPath(flight,flight.guests.length-1,scale).at(-1)?.at;
     if(flight.arrivalCompleteAt+e.shuttleRoute.duration>=e.endsAt){flight.departed=true;for(const f of flight.guests)f.phase='cancelled';}
     continue;
    }
    flight.landed=true;
    for(const [index,f] of flight.guests.entries()){
     f.terminalAt=visitorArrivalPath(flight,index,scale).at(-1).at;
     f.spectatorAt=f.terminalAt+e.shuttleRoute.duration;
    }
   }
   if(!flight.landed)continue;
   for(const f of flight.guests){
    if(f.phase==='inbound'&&now()>=f.terminalAt){
     const admission=aviationAdmission?.(f,{airportId:'north',flightId:flight.id,toCountryId:NORTH});
     if(admission&&!admission.allowed){f.phase='denied';continue;}
     Object.assign(f,NORTH_AIRPORT.gate,{phase:'shuttle-to-circuit',y:1.1,currentLocationId:NORTH_AIRPORT.locationId,traveling:true});
     d.charterArrivals++;d.externalInflow+=f.initialCash;
     const fee=Math.min(26,f.money),carrier=account('north-f1-charter-service');
     f.money-=fee;f.expensesLifetime=Number(f.expensesLifetime||0)+fee;carrier.cash+=fee;
     raw().totalTransactions=Number(raw().totalTransactions||0)+1;
    }
    if(f.phase==='shuttle-to-circuit'){
     Object.assign(f,shuttlePoint(e.shuttleRoute,now()-f.terminalAt));
     if(now()>=f.spectatorAt)Object.assign(f,{phase:'at-circuit',currentLocationId:spectator.id,traveling:false});
    }
    if(f.phase==='at-circuit'&&now()<e.charterShowUntil)attend(f);
    if(f.phase==='return-shuttle'){
     Object.assign(f,shuttlePoint(e.shuttleRoute,now()-e.charterShowUntil,true));
     if(now()>=e.charterShowUntil+e.shuttleRoute.duration)Object.assign(f,{phase:'at-terminal',currentLocationId:NORTH_AIRPORT.locationId,traveling:false});
    }
   }
   if(!flight.outboundAt&&now()>=e.charterShowUntil){
    const wentToTrack=flight.guests.some(f=>f.phase==='at-circuit');
    const earliest=Math.max(now()+420,e.charterShowUntil+(wentToTrack?e.shuttleRoute.duration:0)+1200,flight.arrivalCompleteAt+420);
    flight.outboundAt=visitorRunwaySlot(earliest,OUTBOUND_SECONDS,trafficDuringRace(e,flight),'north');
    flight.exitAt=flight.outboundAt+OUTBOUND_SECONDS;flight.boardAt=flight.outboundAt-420;
    for(const f of flight.guests)if(f.phase==='at-circuit')Object.assign(f,{phase:'return-shuttle',traveling:true});
   }
   if(flight.outboundAt!=null&&now()>=flight.outboundAt&&!flight.tookOff){
    if(weatherClosed()){
     flight.outboundAt=visitorRunwaySlot(now()+900,OUTBOUND_SECONDS,trafficDuringRace(e,flight),'north');
     flight.exitAt=flight.outboundAt+OUTBOUND_SECONDS;
    }else flight.tookOff=true;
   }
   if(flight.exitAt!=null&&now()>=flight.exitAt){
    for(const f of flight.guests){
     if(!['inbound','cancelled','denied'].includes(f.phase)){d.charterDepartures++;d.externalOutflow+=wallet(f);}
     f.phase='departed';f.money=f.savings=0;
    }
    flight.departed=true;
   }
  }
 }
 function openRace(d){
  const start=d.nextAt,price=Math.round(NORTH_F1_RULES.entryPrice*Math.max(.6,Math.min(2,Number(raw().centralBank?.priceLevel||1))));
  const id=`NORTH-GP-${Math.floor(start/DAY)+1}`,hansdrexInterest=.57+signature(id+'fans')*.06;
  const hans=(raw().flies||[]).filter(f=>f.alive&&homeCountry(f)===HANS);
  const target=Math.round(hans.length*hansdrexInterest);
  const invites=hans.filter(f=>healthy(f)&&!f.publicServiceRole&&f.ageYears>=16&&wallet(f)>=price+8+(f.citizenshipCountryId===NORTH?0:50))
   .map(f=>({id:f.id,rank:signature(id+f.id)})).sort((a,b)=>a.rank-b.rank).slice(0,Math.ceil(target*1.18));
  d.event={id,startsAt:start,endsAt:start+durationEstimate(),charterShowUntil:start+HOUR,price,status:'scheduled',audience:counts(),charters:[],ticketPayers:[],
   hansdrexInterest,fanTarget:target,fanInvites:Object.fromEntries(invites.map(row=>[row.id,true]))};
 }
 function refundTickets(d,e){
  const recipients=new Map(actorsById);
  for(const f of raw().cityVisitors?.visitors||[])recipients.set(f.id,f);
  for(const flight of e.charters)for(const f of flight.guests)recipients.set(f.id,f);
  const club=account(ACCOUNT),treasury=northAccount?.();
  let reimbursed=0;
  for(const row of e.ticketPayers){
   const f=recipients.get(row.id),refund=e.price-row.tax;
   if(!f||!f.alive||club.cash<refund||row.tax&&(!treasury||treasury.cash<row.tax))continue;
   club.cash-=refund;if(row.tax)treasury.cash-=row.tax;f.money=Number(f.money||0)+e.price;
   f.expensesLifetime=Number(f.expensesLifetime||0)-e.price;
   raw().totalTransactions=Number(raw().totalTransactions||0)+1;
   d.revenue-=e.price;d.ticketTax-=row.tax;d.visits--;e.audience.total--;e.audience[row.kind]--;reimbursed++;
   if(row.kind==='hansdrex')d.hansdrexVisitors--;
   else if(row.kind==='north')d.northVisitors--;
   else d.visitors--;
  }
  e.refunds=reimbursed;
 }
 function startRace(d,e){
  if(e.status!=='scheduled'||now()<e.startsAt)return;
  const drivers=[],substitutions=[],qualifiedTeams=new Map();
  const available=id=>{const f=actorsById.get(id);return f&&healthy(f)&&!occupied(f,now())&&onSite(f,paddock)?f:null;};
  const reserves=(d.reserveDrivers||[]).map(available).filter(Boolean);
  for(const team of d.teams){
   const pair=[];
   for(let slot=0;slot<2;slot++){
    const regular=available(team.drivers[slot]),f=regular||reserves.shift();
    if(f){
     drivers.push({f,team});pair.push(f.id);
     if(!regular)substitutions.push({f,team});
    }else if(team.drivers[slot])pair.push(team.drivers[slot]);
   }
   qualifiedTeams.set(team.id,pair);
  }
  const trackClosed=weatherClosed()||isUnavailable(paddock.id);
  if(!trackClosed&&drivers.length<20&&now()<e.startsAt+HOUR/2)return;
  if(now()>=e.endsAt||trackClosed||drivers.length<20){
   e.status='cancelled';d.cancelled++;
   refundTickets(d,e);
   emit('north_f1_cancelled','North City called off the Grand Prix because safe racing could not start.',{raceId:e.id});
   return;
  }
  for(const team of d.teams)team.drivers=qualifiedTeams.get(team.id);
  for(const {f,team} of substitutions)remember(f,'north_f1_qualified',{raceId:e.id,teamId:team.id,substitute:true});
  e.status='racing';e.greenAt=now();
  drivers.sort((a,b)=>rating(b.f,e.id)-rating(a.f,e.id));
  e.cars=drivers.map(({f,team},i)=>{
   const gridGap=Math.floor(i/2)*8+2,seed=signature(e.id+f.id+'tyres'),pace=.94+rating(f,e.id)*.19;
   const motion=planF1Motion(NORTH_F1_CIRCUIT,{startAt:e.greenAt,timeScale:Number(raw().timeScale||120),laps:NORTH_F1_RULES.laps,pace,seed,gridGap});
   return {id:`${e.id}-CAR-${i+1}`,teamId:team.id,driverId:f.id,color:team.color,lane:i%2?1.65:-1.65,...motion};
  });
  e.endsAt=Math.max(...e.cars.map(c=>c.finishedAt));
  emit('north_f1_start',`The North City Grand Prix started under the lights with ${drivers.length} drivers.`,{raceId:e.id,grid:drivers.length});
 }
 function finishRace(d,e){
  if(e.status!=='racing'||now()<e.endsAt)return;
  e.status='complete';d.races++;
  const results=e.cars.filter(c=>c.retiredAt==null).sort((a,b)=>a.finishedAt-b.finishedAt)
   .map(({driverId,teamId,finishedAt,stops},index)=>({driverId,teamId,place:index+1,finishedAt,stops,laps:NORTH_F1_RULES.laps}));
  const club=account(ACCOUNT),pool=Math.min(club.cash,Math.min(1800,e.audience.total*e.price*.37));
  for(const row of results){
   const f=actorsById.get(row.driverId);if(!healthy(f))continue;
   const award=pool*(.5/results.length+([.23,.16,.11][row.place-1]||0)),actual=Math.min(club.cash,award);
   club.cash-=actual;f.money=Number(f.money||0)+actual;d.prizes+=actual;
   f.salaryLifetime=Number(f.salaryLifetime||0)+actual;f.salaryEarnedToday=Number(f.salaryEarnedToday||0)+actual;
   f.professionSkills||={};f.professionSkills.racing=Math.min(1,Number(f.professionSkills.racing||0)+.02+(row.place<=3?.01:0));
   remember(f,'north_f1_result',{raceId:e.id,place:row.place,prize:actual});
  }
  d.history.push({id:e.id,startsAt:e.startsAt,endsAt:e.endsAt,grid:e.cars.length,audience:{...e.audience},charterDemand:e.charterDemand||0,fanTarget:e.fanTarget,fanInvited:Object.keys(e.fanInvites).length,winnerId:results[0]?.driverId||null,results});
  d.history=d.history.slice(-8);
  emit('north_f1_finish',`The North City Grand Prix ended with ${e.audience.total} spectators.`,{raceId:e.id,winnerId:results[0]?.driverId,audience:e.audience});
 }
 function tick(){
  const d=data();
  updateRoster(d);
  if(d.event&&now()>=d.event.endsAt&&['complete','cancelled'].includes(d.event.status)&&d.event.charters.every(f=>f.departed)){
   d.nextAt=d.event.startsAt+NORTH_F1_RULES.cadenceDays*DAY;d.event=null;
  }
  if(!d.event&&now()>=d.nextAt-36*HOUR){
   while(now()>=d.nextAt+durationEstimate())d.nextAt+=NORTH_F1_RULES.cadenceDays*DAY;
   if(now()>=d.nextAt-36*HOUR)openRace(d);
  }
  const e=d.event;
  if(!e)return;
  makeCharters(e);
  if(now()>=e.startsAt){directory(d);startRace(d,e);}
  processCharters(d,e);
  if(e.status==='racing')for(const c of e.cars){
   const driver=actorsById.get(c.driverId);
   if(c.retiredAt==null&&now()<c.finishedAt&&!healthy(driver||{}))c.retiredAt=now();
  }
  finishRace(d,e);
 }
 function charters(){
  return (raw().northF1?.event?.charters||[]).filter(f=>!f.departed&&now()<(f.exitAt??Infinity))
   .map(({guests,...f})=>({...f,passengerIds:f.boardAt!=null&&now()>=f.boardAt?guests.filter(g=>g.phase!=='inbound').map(g=>g.id):[]}));
 }
 function snapshot(){
  const d=raw().northF1;if(!d)return null;
  const e=d.event,trackCrowd=e&&now()<e.endsAt?{...e.audience}:counts();
  let activeRace=null;
  if(e?.status==='racing'&&now()<e.endsAt)activeRace={id:e.id,startsAt:e.greenAt,endsAt:e.endsAt,totalLaps:NORTH_F1_RULES.laps,audience:trackCrowd,
   cars:e.cars.filter(c=>c.retiredAt==null&&now()<c.finishedAt+240).map(c=>{
    const motion=f1MotionWindow(c.segments,now()),sample=sampleF1Motion(motion,now());
    const segment=motion[0];
    return {id:c.id,teamId:c.teamId,driverId:c.driverId,color:c.color,lane:c.lane,lapsPerSecond:(segment.progressTo-segment.progressFrom)/(segment.end-segment.start),
     progressAt:now(),...sample,motion};
   })};
  const history=d.history.at(-1)||null;
  return {teams:d.teams,activeRace,trackCrowd,lastRace:history,races:d.races,cancelled:d.cancelled,
   nextAt:e&&now()<e.endsAt?e.startsAt:e?e.startsAt+NORTH_F1_RULES.cadenceDays*DAY:d.nextAt,
   revenue:d.revenue,ticketTax:d.ticketTax,prizes:d.prizes,visits:d.visits,hansdrexVisitors:d.hansdrexVisitors,northVisitors:d.northVisitors,
   visitors:d.visitors,charterArrivals:d.charterArrivals,charterDepartures:d.charterDepartures,charterDemand:e?.charterDemand||history?.charterDemand||0,
   fanTarget:e?.fanTarget||history?.fanTarget||0,fanInvited:e?Object.keys(e.fanInvites).length:history?.fanInvited||0,
   raceStatus:e?.status||'scheduled',charterShuttles:e?.shuttleRoute&&e.charters.length?{route:e.shuttleRoute,groups:e.charters.filter(f=>f.landed&&!f.departed).map(f=>({id:f.id,count:f.guests.length,arrivalAt:f.guests.at(-1)?.terminalAt,returnAt:e.charterShowUntil}))}:null};
 }
 function liquidCash(){
  let cash=0;
  for(const flight of raw().northF1?.event?.charters||[]){
   for(const guest of flight.guests)if(!['inbound','denied','cancelled','departed'].includes(guest.phase))cash+=wallet(guest);
  }
  return cash;
 }
 return {addChoices,attend,offer,handleResident,tick,snapshot,charters,liquidCash};
}
