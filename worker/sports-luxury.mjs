import {createSportsClubs} from './sports-clubs.mjs';
import {hasCountryCommitment} from './country-commitments.mjs';
import {COUNTRY_IDS,countryAt} from './country-map.mjs';
import {SPORTS_ACTIVITY_VENUES,sportsPlayerPose} from './sports-venues.mjs';
import {AIRPORT,BUILDINGS,LOCATIONS,SPORTS_VENUES,entrance,pedestrianRoute,clearSegment,onIsland} from './city-map.mjs';

const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));
const hour=now=>((now%86400)+86400)%86400/3600;
const locate=id=>LOCATIONS.find(l=>l.id===id);
const money=f=>Math.max(0,Number(f.money)||0)+Math.max(0,Number(f.savings)||0);
export const helicopterNetWorth=f=>money(f)+Math.max(0,Number(f.businessEquity)||0)+Math.max(0,Number(f.homeEquity)||0)+Math.max(0,Number(f.vehicleAssetValue)||0)-Math.max(0,Number(f.debt)||0)-Math.max(0,Number(f.bankLoan)||0)-Math.max(0,Number(f.vehicleLoan?.balance)||0);
export const SPORTS_RULES={tennisPlayers:4,stadiumPlayers:12,spectators:40,tennisFee:2,stadiumFee:3,playerSeconds:3600,matchSeconds:5400,flightSeconds:1500};

/** Ground bays share the airport terminal; rooftop pads have actual building/lift access. */
export function privateHelipads(){
 const eligible=BUILDINGS.filter(b=>b.w>=18&&b.d>=18&&b.h>=24&&['destination','block','apartment'].includes(b.kind));
 const selected=eligible.filter(b=>['riverside-hotel','riverside-office','riverside-clinic'].includes(b.id));
 // Distribute actual rooftop pads across both districts, rather than filling airport bays.
 while(selected.length<14){
  const candidates=eligible.filter(b=>!selected.includes(b)).sort((a,b)=>{
   const separation=p=>Math.min(...selected.map(v=>(p.x-v.x)**2+(p.z-v.z)**2));
   return separation(b)-separation(a)||a.id.localeCompare(b.id);
  });if(!candidates.length)break;selected.push(candidates[0]);
 }
 // The iconic towers have spires rather than a flat helicopter roof.
 const allHomes=BUILDINGS.filter(b=>['apartment','house'].includes(b.kind));
 const selectedAndHomes=[...selected,...allHomes.filter(b=>!selected.includes(b))];
 const roofs=selectedAndHomes.map((b,index)=>{
  if(selected.includes(b)&&!locate(b.id))LOCATIONS.push({id:b.id,type:'service',name:`${b.x>480?'Riverside':'City'} Sky ${b.kind==='apartment'?'Residence':'Tower'} ${String(index+1).padStart(2,'0')}`,x:b.x,z:b.z});
  return {id:`PAD-${b.id}`,locationId:b.id,name:`${locate(b.id)?.name||b.id+' family home'} rooftop`,x:b.x,z:b.z,y:b.h+4,access:entrance(b),rooftop:true,radius:Math.min(6,(Math.min(b.w,b.d)-.6)/2)};
 });
 const resort=BUILDINGS.find(b=>b.id==='island-resort');
 const airport=Array.from({length:2},(_,i)=>({id:`PAD-AIRPORT-${i+1}`,locationId:'airport',name:`Private aviation bay ${i+1}`,x:-280+(i%5)*23,z:-408-Math.floor(i/5)*20,y:.65,access:{x:-280+(i%5)*23,z:-408-Math.floor(i/5)*20},rooftop:false}));
 return [...roofs,...airport,...(resort?[{id:'PAD-island-resort',locationId:resort.id,name:'Island resort rooftop',x:resort.x,z:resort.z,y:resort.h+4,access:entrance(resort),rooftop:true}]:[])];
}
/** Flight positions are derived locally from these persisted endpoints and times. */
export function privateHelicopterPose(now,flight){
 const a=flight.from,b=flight.to,span=Math.max(1,flight.arrival-flight.departure),u=clamp((now-flight.departure)/span,0,1),ceiling=Math.max(290,a.y+35,b.y+35);
 let x=a.x,z=a.z,y=a.y+2;
 if(u<.2)y+=(ceiling-y)*u/.2;
 else if(u<.8){const t=(u-.2)/.6;x=a.x+(b.x-a.x)*t;z=a.z+(b.z-a.z)*t;y=ceiling;}
 else{x=b.x;z=b.z;y=ceiling+(b.y+2-ceiling)*(u-.8)/.2;}
 return {x,y,z,heading:Math.atan2(b.x-a.x,b.z-a.z),phase:u===0?'takeoff':u<1?'flying':'landed'};
}

export function createSportsLuxury({world,random,emit,remember,startJourney,moveFly,needsAndActivities,payAndFinance,isWorkCommitted=()=>false,requestAirClearance=()=>({allowed:true}),aviationAdmission=()=>({allowed:true,fee:0})}){
 const pads=privateHelipads(),padById=new Map(pads.map(p=>[p.id,p]));
 const rng=f=>clamp(random?.(f)??.5,0,1);
 const get=()=>world().sportsLuxury||init();
 const alive=id=>world().flies.find(f=>f.id===id&&f.alive);
 const account=()=>world().businesses['sports-aviation'];
 const busy=f=>f.worldCupDuty||hasCountryCommitment(f,world().simulationAgeSeconds)||isWorkCommitted(f)||f.fruitFarmDuty||f.industrialFreightDuty||f.publicServiceDuty||f.socialTask||f.urbanFloodEscape||f.emergencyTask||f.arrested||f.fireEngineDuty||f.ambulanceDuty||f.onFireEngine||f.onAmbulance||f.civicDuty||f.airTrip||f.heliPassenger||f.onPlane||f.arrestedUntil>world().simulationAgeSeconds||f.urbanDuty||f.urbanTask||f.cityService||f.constructionJob||f.rescueJob||f.taxiJob||f.taxiJobId||f.taxiPassenger;
 function transfer(f,cost,to=account()){
  if(!Number.isFinite(cost)||cost<0||money(f)+1e-7<cost)return false;
  const cash=Math.min(Math.max(0,Number(f.money)||0),cost);f.money-=cash;f.savings=Math.max(0,Number(f.savings)||0)-(cost-cash);to.cash=Number(to.cash||0)+cost;
  f.expensesLifetime=Number(f.expensesLifetime||0)+cost;world().totalTransactions=Number(world().totalTransactions||0)+1;return true;
 }
 const clubs=createSportsClubs({world,startJourney,moveFly,care,available:sportReady,venueSafe:v=>venueSafe(v)&&!dangerous(),emit,remember});
 function init(){
  const s=world();s.businesses||={};s.businesses['sports-aviation']||={cash:0,inventory:0,sector:'sport-private-aviation'};
  const d=s.sportsLuxury||={version:1,helicopters:[],nextFlight:1,privateFlights:0,privateRevenue:0,maintenanceRevenue:0,sportsRevenue:0,matchesCompleted:0,tennisSessions:0,goals:0,match:null,lastDay:-1,nextMatchAt:Math.floor(s.simulationAgeSeconds/86400)*86400+16*3600,nextOwnershipCheck:0,history:[]};
  d.history||=[];d.helicopters||=[];
  d.pickups||={nextAt:{},nextId:1,invitations:0,completed:0,blocked:{}};
  for(const venue of SPORTS_ACTIVITY_VENUES)if(!locate(venue.id)){
   LOCATIONS.push({id:venue.id,name:venue.name,type:'social',x:venue.x,z:venue.z});
  }
  if(!d.foundingGrant){
   const top=s.flies.filter(f=>f.alive&&f.ageYears>=18).sort((a,b)=>helicopterNetWorth(b)-helicopterNetWorth(a)||a.id.localeCompare(b.id)).slice(0,10),occupied=new Set(d.helicopters.map(h=>h.padId));
   for(const f of top){
    if(d.helicopters.some(h=>h.ownerId===f.id))continue;
    const home=pads.find(p=>p.locationId===f.housingUnitId);if(home)ensurePrivateAccess(home);
    const available=pads.filter(p=>p.rooftop&&p.id!=='PAD-island-resort'&&locate(p.locationId)&&!occupied.has(p.id)).sort((a,b)=>Math.hypot(a.x-(f.homeX??f.x),a.z-(f.homeZ??f.z))-Math.hypot(b.x-(f.homeX??f.x),b.z-(f.homeZ??f.z))),p=available.find(p=>p.locationId===f.housingUnitId)||available[0];if(!p)break;
    occupied.add(p.id);const h={id:`PRIVATE-HELI-${d.helicopters.length+1}`,ownerId:f.id,padId:p.id,flight:null,fuel:100,condition:1,maintenanceDebt:0,grantedAt:s.simulationAgeSeconds,grantRank:d.helicopters.length+1,nextTripAt:s.simulationAgeSeconds+(3600+rng(f)*10800),trips:0};d.helicopters.push(h);f.privateHelicopterId=h.id;
    remember?.(f,'private_helicopter_grant',{helicopterId:h.id,rank:h.grantRank});emit?.('private_helicopter',`${f.id} received a private helicopter as one of the ten wealthiest founding owners.`,{flyId:f.id,helicopterId:h.id,rank:h.grantRank});
   }
   d.foundingGrant={at:s.simulationAgeSeconds,ownerIds:top.map(f=>f.id),selection:'cash+savings+equity+vehicle value minus liabilities'};
  }
  bindFamilyHomes(d);
  if(!d.familyParkingVersion){
   for(const h of d.helicopters)if(h.padId!==h.homePadId)h.roofMigrationPending=true;
   d.familyParkingVersion=1;
  }
  relocateLegacyParking(d);
  for(const h of d.helicopters){const f=alive(h.ownerId);if(f)f.privateHelicopterId=h.id;for(const p of [h.flight?.from,h.flight?.to])if(p)ensurePrivateAccess(p);}
  return d;
 }
 function ensurePrivateAccess(pad){
  if(!locate(pad.locationId))LOCATIONS.push({id:pad.locationId,type:'private-access',name:pad.name,x:pad.x,z:pad.z});
 }
 function bindFamilyHomes(d){
  for(const h of d.helicopters){
   const owner=alive(h.ownerId),home=owner&&padById.get(`PAD-${owner.housingUnitId}`);
   if(home){ensurePrivateAccess(home);h.homePadId=home.id;h.familyHouseholdId=owner.householdId||null;}
   else if(owner||!padById.has(h.homePadId))h.homePadId=null;
   const household=world().housing?.households?.[h.familyHouseholdId],familyOwner=owner||world().flies.find(f=>f.id===h.estateOwnerId);
   h.familyIds=[...new Set([h.ownerId,...(household?.members||[]),...(familyOwner?.children||[])].filter(id=>id&&alive(id)))];
  }
 }
 function relocateLegacyParking(d){
  const taken=new Set(d.helicopters.flatMap(h=>[h.padId,h.flight?.to.id].filter(Boolean)));
  for(const h of d.helicopters){
   if(h.destroyed||!h.roofMigrationPending||h.flight)continue;
   const p=padById.get(h.homePadId)||pads.find(p=>p.rooftop&&p.id!=='PAD-island-resort'&&!taken.has(p.id));
   if(!p||taken.has(p.id)&&h.padId!==p.id)continue;
   const status=world().urbanWorld?.buildings?.[p.locationId];if(status&&status.stage!=='operational')continue;
   const before=h.padId;taken.delete(before);taken.add(p.id);h.padId=p.id;delete h.roofMigrationPending;
   if(before!==p.id)emit?.('private_rooftop_parking',`${h.id} now parks on its family's roof at ${p.locationId}.`,{helicopterId:h.id,ownerId:h.ownerId,householdId:h.familyHouseholdId,from:before,padId:p.id});
  }
 }
 function padAvailable(padId,heliId){
  const p=padById.get(padId);if(!p)return false;
  const u=world().urbanWorld,building=u?.buildings?.[p.locationId];
  if(building&&building.stage!=='operational')return false;
  if((u?.fires||[]).some(f=>f.buildingId===p.locationId&&f.status!=='extinguished'))return false;
  if((u?.floods||[]).some(f=>f.depth>.35&&Math.abs(p.access.x-f.x)<f.w/2&&Math.abs(p.access.z-f.z)<f.d/2))return false;
  return !get().helicopters.some(h=>h.id!==heliId&&(h.padId===padId&&(!h.flight||world().simulationAgeSeconds<h.flight.departure)||h.flight?.to.id===padId));}
 function dangerous(){const w=world().weather||{};return w.condition==='thunderstorm'||Number(w.precipitation||0)>.65||Number(w.wind||0)>.7;}
 function airportAccess(pad){
  const door=entrance(locate('airport')),edge={x:AIRPORT.terminal.x-AIRPORT.terminal.w/2-2,z:door.z},back={x:edge.x,z:pad.z};
  return [door,edge,back,{x:pad.x,z:pad.z}];
 }
 function walkPose(points,u){
  const lengths=points.slice(1).map((b,i)=>Math.hypot(b.x-points[i].x,b.z-points[i].z)),total=lengths.reduce((a,b)=>a+b,0);let left=u*total;
  for(let i=0;i<lengths.length;i++){if(left<=lengths[i]||i===lengths.length-1){const t=lengths[i]?clamp(left/lengths[i],0,1):1,a=points[i],b=points[i+1];return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};}left-=lengths[i];}
  return points[0];
 }
 function nextAt(now){let t=Math.floor(now/86400)*86400+16*3600;return t>now?t:t+86400;}
 function maintenance(d,day){
  if(d.lastDay===day)return;d.lastDay=day;
  for(const h of d.helicopters){const f=alive(h.ownerId);if(h.destroyed||!f)continue;const due=6+h.maintenanceDebt,paid=Math.min(due,Math.max(0,money(f)-100));if(paid>0){transfer(f,paid);d.maintenanceRevenue+=paid;}h.maintenanceDebt=Math.min(120,due-paid);h.condition=clamp(h.condition+(paid>=due?.025:-.01),.2,1);}
 }
 function inherit(d,now){
  if(now<d.nextOwnershipCheck)return;d.nextOwnershipCheck=now+3600;
  for(const h of d.helicopters){
   if(alive(h.ownerId))continue;const formerId=h.ownerId||h.estateOwnerId,former=world().flies.find(f=>f.id===formerId),candidates=[...(former?.children||[]),former?.partnerId].map(id=>alive(id)).filter(f=>f&&f.ageYears>=18&&!d.helicopters.some(o=>o.ownerId===f.id));
   const heir=candidates[0];if(heir){const before=formerId;h.ownerId=heir.id;delete h.estateOwnerId;h.nextTripAt=h.destroyed?Number.MAX_SAFE_INTEGER:now+7200;heir.privateHelicopterId=h.id;remember?.(heir,'helicopter_inheritance',{from:before,helicopterId:h.id});emit?.('inheritance',`${heir.id} inherited ${h.id}.`,{flyId:heir.id,helicopterId:h.id,from:before});}
   else if(h.ownerId){h.estateOwnerId=h.ownerId;h.ownerId=null;h.nextTripAt=Infinity;emit?.('estate',`${h.id} remains in its owner's estate pending an eligible heir.`,{helicopterId:h.id});}
  }
 }
 function settleUnattendedFlight(h,now){
  const flight=h.flight;if(h.destroyed||!flight)return;const owner=alive(flight.ownerId||h.ownerId),task=owner?.privateFlight;
  if(owner&&task?.id===flight.id&&task.helicopterId===h.id){
   if(!['boarding','flying','disembarking'].includes(task.phase)){task.phase=now<flight.departure?'boarding':now<flight.arrival?'flying':'disembarking';task.until=task.phase==='disembarking'?flight.arrival+300+Math.max(120,flight.to.y*5):flight.departure;}
   return;
  }
  if(owner?.onPrivateHelicopter&&!task){owner.privateFlight={id:flight.id,helicopterId:h.id,phase:now<flight.arrival?'flying':'disembarking',lastAt:now,until:flight.arrival+300+Math.max(120,flight.to.y*5)};return;}
  // Inheritance must not strand a flight owned by the former, now deceased owner.
  if(!flight.paid){h.flight=null;h.nextTripAt=now+7200;return;}
  if(now<flight.arrival)return;
  if(!padAvailable(flight.to.id,h.id)){
   const safe=pads.filter(p=>padAvailable(p.id,h.id)).sort((a,b)=>Number(b.locationId==='airport')-Number(a.locationId==='airport'))[0];if(!safe)return;
   const pose=privateHelicopterPose(now,flight);flight.from={...flight.from,x:pose.x,y:pose.y-2,z:pose.z};flight.to={...safe};ensurePrivateAccess(safe);flight.departure=now;flight.arrival=now+1200;return;
  }
  const former=world().flies.find(f=>f.id===(flight.ownerId||h.ownerId)),alreadyLanded=flight.landedAt!=null||former?.privateFlight?.id===flight.id&&former.privateFlight.phase==='disembarking';
  h.padId=flight.to.id;h.flight=null;h.nextTripAt=now+7200;if(!alreadyLanded){h.trips++;get().privateFlights++;}
  emit?.('private_flight_recovered',`${h.id} completed its previously committed landing after its owner became unavailable.`,{helicopterId:h.id,flightId:flight.id,padId:h.padId});
 }
 function retireUnsupportedParking(d,now){
  for(const h of d.helicopters){
   if(h.destroyed||h.flight||padById.has(h.padId))continue;
   const building=BUILDINGS.find(b=>`PAD-${b.id}`===h.padId);
   if(!building)continue;
   const safe=pads.filter(p=>padAvailable(p.id,h.id)).sort((a,b)=>Number(b.locationId==='airport')-Number(a.locationId==='airport'))[0];
   if(!safe)continue;
   // Keep the aircraft and its estate/title. A maintenance flight removes it
   // from a retired rooftop without putting a deck above the building spire.
   h.flight={id:`PRIVATE-FLIGHT-${d.nextFlight++}`,helicopterId:h.id,ownerId:null,
    from:{id:h.padId,locationId:building.id,x:building.x,z:building.z,y:building.h+4,rooftop:true,access:entrance(building)},
    to:{...safe},departure:now,arrival:now+1200,cost:0,fuel:0,paid:true,maintenance:true};
   emit?.('private_rooftop_retired',`${h.id} is being repositioned from a landmark without a helicopter roof.`,{helicopterId:h.id,from:h.padId,to:safe.id});
  }
 }
 function cancelSports(f,reason){
  const session=f.sportsSession;if(!session)return;const m=get().match;if(m?.id===session.id){m.players=m.players.filter(id=>id!==f.id);m.spectators=m.spectators.filter(id=>id!==f.id);}
  f.sportsSession=null;if(!busy(f)){f.action=`sports session interrupted: ${reason}`;f.actionUntil=world().simulationAgeSeconds;}
  remember?.(f,'sports_interrupted',{activity:session.kind,reason});
 }
 function sessionVenue(session){return session?.venueId||(session?.kind==='tennis'?'tennis':'stadium');}
 function venueSafe(venue){
  const u=world().urbanWorld,status=u?.buildings?.[venue.id];
  return (!status||status.stage==='operational')&&!(u?.fires||[]).some(f=>f.buildingId===venue.id&&!f.containedAt)&&!(u?.floods||[]).some(f=>f.depth>.35&&Math.abs(venue.x-f.x)<(Number(venue.w||40)+f.w)/2&&Math.abs(venue.z-f.z)<(Number(venue.d||50)+f.d)/2);
 }
 function sportReady(f){return f.alive&&f.ageYears>=12&&f.health>=55&&f.energy>=40&&Number(f.hunger||0)<80&&!busy(f)&&!f.sleeping&&!f.privateFlight&&!f.onPrivateHelicopter&&!f.onPlane;}
 function interruptedSports(f){
  const venue=SPORTS_ACTIVITY_VENUES.find(v=>v.id===sessionVenue(f.sportsSession));
  return !f.alive||busy(f)||f.onTrain||f.traveling||f.currentLocationId!==sessionVenue(f.sportsSession)||f.health<30||f.energy<15||f.hunger>90||!venue||!venueSafe(venue)||dangerous();
 }
 function cancelInvitation(f,reason){
  if(!f.sportsInvitation)return;
  remember?.(f,'sports_invitation_cancelled',{venueId:f.sportsInvitation.venueId,reason});
  f.sportsInvitation=null;
 }
 function organizePickups(now){
  if(!startJourney||hour(now)<7||hour(now)>=20||dangerous())return;
  const d=get(),p=d.pickups;
  for(const venue of SPORTS_ACTIVITY_VENUES){
   if(now<Number(p.nextAt[venue.id]||0)||!venueSafe(venue))continue;
   const reserved=world().flies.filter(f=>f.alive&&(f.sportsSession&&sessionVenue(f.sportsSession)===venue.id||f.sportsInvitation?.venueId===venue.id));
   if(reserved.length>=venue.pickupPlayers){p.nextAt[venue.id]=now+900;continue;}
   const candidates=world().flies.filter(f=>sportReady(f)&&!f.onTrain&&!f.traveling&&!f.sportsSession&&!f.sportsInvitation&&!f.clubDuty&&countryAt(f)===venue.countryId&&money(f)>=venue.fee*clamp(world().centralBank?.priceLevel||1,.5,10)&&now-Number(f.lastSportAt??-86400)>=21600&&Math.hypot(f.x-venue.x,f.z-venue.z)<1400)
    .sort((a,b)=>pickupInterest(b,venue)-pickupInterest(a,venue)||a.id.localeCompare(b.id));
   p.blocked[venue.id]={at:now,eligible:candidates.length,reserved:reserved.length,reason:candidates.length<2?'waiting for healthy, fed, off-duty local players':null};
   p.nextAt[venue.id]=now+(candidates.length>=2?5400:900);
   if(candidates.length<2)continue;
   const groupId=`PICKUP-${venue.id}-${p.nextId++}`,selected=candidates.slice(0,Math.max(0,venue.pickupPlayers-reserved.length));
   for(const f of selected){
    const invitation={id:groupId,venueId:venue.id,kind:venue.kind,role:'player',requestedAt:now,expiresAt:now+Math.min(43200,Math.max(10800,Math.ceil(Math.hypot(f.x-venue.x,f.z-venue.z)/2.4*Math.max(1,Number(world().timeScale||120)))+3600))};
    f.sportsInvitation=invitation;
    const result=startJourney(f,{id:venue.id,action:`joining ${venue.name} pickup session`});
    if(result===false||f.targetLocationId!==venue.id&&f.currentLocationId!==venue.id){cancelInvitation(f,'lawful route unavailable');continue;}
    p.invitations++;
    remember?.(f,'sports_invitation',{venueId:venue.id,groupId});
   }
  }
 }
 function pickupInterest(f,venue){
  const skill=Number(f.sportsProfile?.[venue.kind==='golf'?'golf':venue.kind==='tennis'?'tennis':'team']||0);
  return Number(f.traits?.sociability??.5)*30+Number(f.loneliness||0)*.3+Number(f.stress||0)*.2+skill*20-Math.hypot(f.x-venue.x,f.z-venue.z)/4;
 }
 function handleInvitation(f,clock){
  const inv=f.sportsInvitation;if(!inv)return false;
  const now=world().simulationAgeSeconds,venue=SPORTS_ACTIVITY_VENUES.find(v=>v.id===inv.venueId);
  if(!sportReady(f)||now>=inv.expiresAt||!venue||!venueSafe(venue)||dangerous()||hour(now)>=21){cancelInvitation(f,'resident, weather or venue unavailable');return false;}
  if(f.traveling){
   if(f.targetLocationId!==venue.id){cancelInvitation(f,'journey diverted');return false;}
   moveFly?.(f);care(f,clock);
   if(f.traveling)return true;
  }
  if(f.currentLocationId!==venue.id){cancelInvitation(f,'did not reach venue');return false;}
  if(beginSports(f,venue.kind,'player',venue.id))return true;
  cancelInvitation(f,'admission unavailable');return false;
 }
 function tick(gameSeconds,clock){
  const d=get(),s=world(),now=s.simulationAgeSeconds;bindFamilyHomes(d);relocateLegacyParking(d);maintenance(d,Math.floor(now/86400));inherit(d,now);
  for(const h of d.helicopters)settleUnattendedFlight(h,now);
  retireUnsupportedParking(d,now);
  for(const f of s.flies)if(f.sportsSession&&interruptedSports(f))cancelSports(f,'resident or venue unavailable');
  const cup=s.worldCup?.event,cupReserved=Boolean(cup&&now>=cup.startsAt-3*3600&&now<cup.endsAt);
  if(cupReserved&&d.match){for(const f of s.flies)if(f.sportsSession?.id===d.match.id)cancelSports(f,'stadium reserved for international football');d.match=null;d.nextMatchAt=cup.endsAt+3600;}
  if(!cupReserved&&!d.match&&now>=d.nextMatchAt){d.nextMatchAt=nextAt(now);d.match={id:`MATCH-${Math.floor(now/86400)}`,startsAt:now+1800,endsAt:now+1800+SPORTS_RULES.matchSeconds,players:[],spectators:[],score:[0,0],lastGoalAt:now+2400,settled:false};emit?.('sports_fixture','Riverside Stadium opened registration for today’s city match.',{matchId:d.match.id,startsAt:d.match.startsAt});}
  const m=d.match;if(m){
   if(now>=m.startsAt&&now<m.endsAt&&now>=m.lastGoalAt){m.lastGoalAt=now+1200;const players=m.players.map(id=>alive(id)).filter(f=>f?.sportsSession?.id===m.id&&f.currentLocationId==='stadium'&&!f.traveling);if(players.length>=2){const side=m.score[0]<=m.score[1]?0:1;m.score[side]++;d.goals++;}}
   if(now>=m.endsAt&&!m.settled){m.settled=true;const participants=[...m.players,...m.spectators].map(id=>alive(id)).filter(Boolean);for(const f of participants){if(f.sportsSession?.id===m.id)finishSports(f,now,m);}d.matchesCompleted++;d.history.push({id:m.id,score:m.score,players:m.players.length,spectators:m.spectators.length,endedAt:now});d.history=d.history.slice(-12);emit?.('sports_result',`Riverside match ended ${m.score[0]}–${m.score[1]}; ${m.spectators.length} spectators attended.`,{matchId:m.id,score:m.score});d.match=null;}
  }
  clubs.tick();
  organizePickups(now);
 }
 function addChoices(f,clock,add){
  const now=world().simulationAgeSeconds;if(f.ageYears<12||f.health<55||f.energy<35||busy(f)||f.privateFlight||f.onTrain||f.sportsInvitation||f.sportsSession)return;
  const d=get(),social=Number(f.traits?.sociability??.5),stress=Number(f.stress||0);
  if(clock.hour>=7&&clock.hour<21&&now-Number(f.lastSportAt??f.lastTennisAt??-86400)>14400){
   for(const venue of SPORTS_ACTIVITY_VENUES.filter(v=>v.countryId===countryAt(f)&&v.kind!=='stadium'&&venueSafe(v))){
    add(venue.id,`playing ${venue.kind}`,38+stress*.5+social*48+Number(f.traits?.resilience||.5)*18-Math.min(24,Math.hypot(f.x-venue.x,f.z-venue.z)/45));
   }
  }
  if(d.match&&now<d.match.endsAt){
   if(f.ageYears>=16&&f.energy>60&&d.match.players.length<SPORTS_RULES.stadiumPlayers)add('stadium','playing a stadium match',23+social*22+Number(f.excitement||0)*.25);
   if(d.match.spectators.length<SPORTS_RULES.spectators)add('stadium','watching a stadium match',22+social*30+stress*.35);
  }
  const h=d.helicopters.find(h=>h.ownerId===f.id);if(h&&!h.destroyed&&!h.flight&&h.nextTripAt<=now&&money(f)>250&&!dangerous()){
   const p=padById.get(h.padId);if(p&&onIsland(p)===onIsland(f))add(p.locationId,'taking a private helicopter',62+Number(f.traits?.ambition||.5)*30+stress*.3);
  }
 }
 function care(f,clock){needsAndActivities?.(f,clock);payAndFinance?.(f,clock);}
 function finishSports(f,now,match){
  const session=f.sportsSession;if(!session)return;
  f.sportsProfile||={tennis:0,team:0,fitness:0,attended:0};const active=session.role==='player';if(active){f.sportsProfile.fitness=clamp(Number(f.sportsProfile.fitness||0)+.015,0,1);const skill=session.kind==='golf'?'golf':session.kind==='tennis'?'tennis':'team';f.sportsProfile[skill]=clamp(Number(f.sportsProfile[skill]||0)+.01,0,1);f.health=clamp(f.health+1.2);f.energy=clamp(f.energy-3);}f.happiness=clamp(f.happiness+(active?8:5));f.stress=clamp(f.stress-9);f.loneliness=clamp(f.loneliness-8);f.sportsProfile.attended=Number(f.sportsProfile.attended||0)+1;f.lastSportAt=now;f.action='finished a sports session';f.actionUntil=now+1800;f.sportsSession=null;if(session.pickup)get().pickups.completed++;
  remember?.(f,'sports_session',{kind:session.kind,role:session.role,matchId:match?.id,score:match?.score});
 }
 function beginSports(f,kind,role,venueId=kind==='golf'?'north-golf':kind==='football'?'north-football':kind){
  const now=world().simulationAgeSeconds,d=get(),venue=SPORTS_ACTIVITY_VENUES.find(v=>v.id===venueId);
  if(!venue||venue.kind!==kind||!venueSafe(venue)||dangerous()||f.sportsSession||f.privateFlight||f.traveling||f.onTrain||f.currentLocationId!==venue.id||busy(f)||f.health<30||f.energy<15||Number(f.hunger||0)>90)return false;
  const invitation=f.sportsInvitation,players=world().flies.filter(o=>o.alive&&o.sportsSession&&sessionVenue(o.sportsSession)===venue.id&&o.sportsSession.role===role);
  const m=kind==='stadium'?d.match:null;if(kind==='stadium'&&(!m||now>=m.endsAt)&&invitation?.venueId!==venue.id)return false;
  if(players.length>=(role==='player'?venue.capacity:SPORTS_RULES.spectators))return false;
  const cost=(role==='spectator'?SPORTS_RULES.stadiumFee:venue.fee)*clamp(world().centralBank?.priceLevel||1,.5,10);if(cost>0&&!transfer(f,cost))return false;
  if(m)(role==='player'?m.players:m.spectators).push(f.id);d.sportsRevenue+=cost;if(kind==='tennis'){d.tennisSessions++;f.lastTennisAt=now;}if(kind==='golf')d.golfSessions=Number(d.golfSessions||0)+1;
  const usedSlots=new Set(players.map(p=>p.sportsSession.slot));let slot=0;while(usedSlots.has(slot))slot++;
  f.sportsSession={id:m?.id||invitation?.id||`SPORT-${f.id}-${now}`,kind,venueId:venue.id,role,slot,pickup:Boolean(invitation),startsAt:now,until:m?.endsAt||now+SPORTS_RULES.playerSeconds};f.sportsInvitation=null;f.action=kind==='stadium'?(role==='player'?'playing a stadium match':'watching a stadium match'):`playing ${kind}`;f.sleeping=false;f.traveling=false;f.indoors=false;
  const position=sportsPlayerPose(venue,slot,now,now,role);Object.assign(f,position);f.y=1.1;f.targetX=f.x;f.targetZ=f.z;f.vx=f.vz=0;
  return true;
 }
 function beginPrivate(f,destinationPadId){
  const d=get(),now=world().simulationAgeSeconds,h=d.helicopters.find(h=>h.ownerId===f.id);
  if(!h||h.destroyed||h.flight||f.privateFlight||f.sportsSession||f.sportsInvitation||f.onTrain||f.traveling||busy(f)||dangerous()||h.condition<.35||h.maintenanceDebt>30||f.health<55||f.energy<30)return false;
  const from=padById.get(h.padId);if(!from||!padAvailable(from.id,h.id)||f.currentLocationId!==from.locationId)return false;
  const dests=pads.filter(p=>p.rooftop&&p.id!==from.id&&p.locationId!==from.locationId&&padAvailable(p.id,h.id));
  const to=destinationPadId?dests.find(p=>p.id===destinationPadId):(dests.find(p=>p.id===h.homePadId)||dests[Math.floor(rng(f)*dests.length)%dests.length]);if(!to)return false;
  ensurePrivateAccess(from);ensurePrivateAccess(to);
  const travelDistance=Math.hypot(to.x-from.x,to.z-from.z),fuel=8+travelDistance*.018,cost=(12+fuel*.9)*clamp(world().centralBank?.priceLevel||1,.5,10);
  if(money(f)<cost+120)return false;
  // Reserve the landing pad before taking any payment; it remains exclusive until landing.
  const depart=now+300+Math.max(120,from.y*5),arrival=depart+SPORTS_RULES.flightSeconds+travelDistance*.6;
  const flight={id:`PRIVATE-FLIGHT-${d.nextFlight++}`,helicopterId:h.id,ownerId:f.id,operatorCountryId:h.ownerCountryId||f.citizenshipCountryId||countryAt(from)||COUNTRY_IDS.hansdrex,from:{...from},to:{...to},departure:depart,arrival,cost,fuel,paid:false};
  const admission=aviationAdmission(f,{flightId:flight.id,toCountryId:countryAt(to),fromCountryId:countryAt(from),commit:false});
  if(!admission.allowed||money(f)<cost+120+Number(admission.fee||0))return false;
  if(!requestAirClearance({flightId:flight.id,operatorCountryId:flight.operatorCountryId,countries:[countryAt(from),countryAt(to)],kind:'private'}).allowed)return false;
  h.flight=flight;f.privateFlight={id:flight.id,helicopterId:h.id,phase:'boarding',lastAt:now,until:depart};f.action='boarding a private helicopter';f.traveling=false;f.sleeping=false;f.onTrain=false;f.indoors=from.rooftop;f.vx=f.vz=0;f.routeWaypoints=[];f.pendingAction=null;
  // All ground transfer is along the airport apron, roof access is a timed building elevator.
  if(!from.rooftop){f.privateFlight.walk=airportAccess(from);const access=f.privateFlight.walk[0];f.x=access.x;f.z=access.z;f.y=1.1;}
  emit?.('private_flight_booking',`${f.id} reserved a private flight to ${to.name}.`,{flyId:f.id,helicopterId:h.id,flightId:flight.id,destination:to.id});return true;
 }
 function cancelPrivate(f,h,reason){
  const now=world().simulationAgeSeconds;h.flight=null;h.nextTripAt=now+7200;f.privateFlight=null;f.onPrivateHelicopter=false;f.y=1.1;f.currentLocationId=padById.get(h.padId)?.locationId||'airport';f.action=`private flight cancelled: ${reason}`;f.actionUntil=now+1800;f.indoors=true;emit?.('private_flight_cancelled',`${f.id}'s private flight was cancelled before departure: ${reason}.`,{flyId:f.id,helicopterId:h.id});
 }
 function handlePrivate(f,clock){
  const d=get(),t=f.privateFlight;if(!t)return false;const h=d.helicopters.find(h=>h.id===t.helicopterId),flight=h?.flight,now=world().simulationAgeSeconds;
  if(!h||h.destroyed||!flight){f.privateFlight=null;f.onPrivateHelicopter=false;return false;}
  care(f,clock);
  if(t.phase==='boarding'){
   if(dangerous()||!padAvailable(flight.from.id,h.id)||!padAvailable(flight.to.id,h.id)){cancelPrivate(f,h,'unsafe weather or unavailable landing pad');return true;}
   if(now<flight.departure){
    const u=clamp((now-(flight.departure-(300+Math.max(120,flight.from.y*5))))/(300+Math.max(120,flight.from.y*5)),0,1);
    if(flight.from.rooftop){f.x=flight.from.x;f.z=flight.from.z;f.y=1.1+(flight.from.y-1.1)*u;f.indoors=u<.95;}
    else{const p=walkPose(t.walk||[flight.from],u);f.x=p.x;f.z=p.z;f.y=1.1;f.indoors=false;}
    f.action=flight.from.rooftop?'taking the elevator to the rooftop helipad':'walking to the private aviation bay';return true;
   }
   if(!flight.paid){if(!transfer(f,flight.cost)){cancelPrivate(f,h,'insufficient operating funds');return true;}flight.paid=true;d.privateRevenue+=flight.cost;h.fuel=Math.max(0,h.fuel-flight.fuel);h.condition=Math.max(.2,h.condition-.015);// Flight price includes the measured fuel refill.
   h.fuel=Math.min(100,h.fuel+flight.fuel);}
   t.phase='flying';f.onPrivateHelicopter=true;f.indoors=false;emit?.('private_departure',`${f.id} took off in ${h.id}.`,{flyId:f.id,helicopterId:h.id,flightId:flight.id});
  }
  if(t.phase==='flying'){
   if(!padAvailable(flight.to.id,h.id)){
    const alternatives=pads.filter(p=>padAvailable(p.id,h.id)).sort((a,b)=>Number(b.locationId==='airport')-Number(a.locationId==='airport'));
    if(!alternatives.length){flight.arrival=Math.max(flight.arrival,now+600);f.action='holding above the city · waiting for a safe landing pad';return true;}
    const current=privateHelicopterPose(now,flight),old=flight.to.id;
    flight.from={id:`AIRBORNE-${flight.id}`,name:'diversion position',locationId:'airport',x:current.x,y:current.y-2,z:current.z,access:{x:current.x,z:current.z},rooftop:false};flight.to={...alternatives[0]};ensurePrivateAccess(flight.to);flight.departure=now;flight.arrival=now+1200;
    d.diversions=Number(d.diversions||0)+1;emit?.('private_diversion',`${f.id}'s helicopter diverted to ${flight.to.name} because its original landing pad became unsafe.`,{flyId:f.id,flightId:flight.id,fromPad:old,toPad:flight.to.id});
   }
   const p=privateHelicopterPose(now,flight);Object.assign(f,{x:p.x,y:p.y,z:p.z,vx:0,vz:0,traveling:false,transitMode:'private-helicopter',onPrivateHelicopter:true});f.action='flying in a personally owned helicopter';
   if(now<flight.arrival)return true;
   const entry=aviationAdmission(f,{flightId:flight.id,entryId:`${flight.id}:${f.id}:arrival`,toCountryId:countryAt(flight.to),fromCountryId:countryAt(flight.from)});
   if(!entry.allowed){f.action=`awaiting landing immigration: ${entry.reason||'entry unavailable'}`;return true;}
   t.phase='disembarking';t.until=flight.arrival+300+Math.max(120,flight.to.y*5);h.padId=flight.to.id;if(flight.landedAt==null){h.trips++;d.privateFlights++;flight.landedAt=now;}f.onPrivateHelicopter=false;remember?.(f,'private_helicopter_trip',{flightId:flight.id,from:flight.from.id,to:flight.to.id,cost:flight.cost});
  }
  if(t.phase==='disembarking'){
   const to=flight.to,u=clamp((now-flight.arrival)/Math.max(1,t.until-flight.arrival),0,1),ground=entrance(locate(to.locationId)||{x:to.x,z:to.z});if(to.rooftop){f.x=to.x;f.z=to.z;f.y=to.y+(1.1-to.y)*u;}else{const p=walkPose([...airportAccess(to)].reverse(),u);f.x=p.x;f.z=p.z;f.y=1.1;}f.indoors=to.rooftop;f.action=to.rooftop?'leaving the rooftop by elevator':'walking from the private aviation bay';
   if(now<t.until)return true;
   h.flight=null;h.nextTripAt=now+10800+rng(f)*18000;f.privateFlight=null;f.onPrivateHelicopter=false;f.x=ground.x;f.z=ground.z;f.y=1.1;f.currentLocationId=to.locationId;f.targetLocationId=to.locationId;f.transitMode='walk';f.traveling=false;f.indoors=false;f.action='arrived by private helicopter';f.actionUntil=now+1800;f.energy=clamp(f.energy-4);f.happiness=clamp(f.happiness+4);f.targetX=f.x;f.targetZ=f.z;
   emit?.('private_arrival',`${f.id} landed at ${to.name} and completed the ground transfer.`,{flyId:f.id,helicopterId:h.id,flightId:flight.id,padId:to.id});return true;
  }
  return true;
 }
 function handleResident(f,clock){
  if(clubs.handleResident(f,clock))return true;
  if(!f.alive)return false;if(f.privateFlight)return handlePrivate(f,clock);
  if(f.sportsInvitation&&handleInvitation(f,clock))return true;
  if(f.sportsSession){
   if(interruptedSports(f)){cancelSports(f,'resident or venue unavailable');return false;}
   const venue=SPORTS_ACTIVITY_VENUES.find(v=>v.id===sessionVenue(f.sportsSession)),pose=sportsPlayerPose(venue,Number(f.sportsSession.slot||0),world().simulationAgeSeconds,f.sportsSession.startsAt,f.sportsSession.role);
   f.vx=pose.x-f.x;f.vz=pose.z-f.z;Object.assign(f,pose);f.targetX=f.x;f.targetZ=f.z;f.indoors=false;
   care(f,clock);if(world().simulationAgeSeconds>=f.sportsSession.until)finishSports(f,world().simulationAgeSeconds);return true;
  }
  if(f.traveling||busy(f))return false;
  if(f.currentLocationId==='tennis'&&f.action==='playing tennis'){if(beginSports(f,'tennis','player'))return true;f.action='tennis courts full · waiting';f.actionUntil=world().simulationAgeSeconds+1200;return false;}
  if(f.currentLocationId==='stadium'&&['playing a stadium match','watching a stadium match'].includes(f.action)){if(beginSports(f,'stadium',f.action.startsWith('playing')?'player':'spectator'))return true;f.action='stadium registration closed';f.actionUntil=world().simulationAgeSeconds+1200;return false;}
  const venue=SPORTS_ACTIVITY_VENUES.find(v=>v.id===f.currentLocationId&&v.id.startsWith('north-'));
  if(venue&&f.action===`playing ${venue.kind}`){if(beginSports(f,venue.kind,'player',venue.id))return true;f.action='sports admission unavailable';f.actionUntil=world().simulationAgeSeconds+1200;return false;}
  if(f.action==='taking a private helicopter'){if(beginPrivate(f))return true;f.action='private aviation unavailable';f.actionUntil=world().simulationAgeSeconds+3600;}
  return false;
 }
 function snapshot(){
  const d=get(),now=world().simulationAgeSeconds;
  const visiblePads=new Set(['PAD-riverside-hotel','PAD-riverside-office','PAD-riverside-clinic','PAD-island-resort','PAD-AIRPORT-1','PAD-AIRPORT-2',...d.helicopters.flatMap(h=>[h.padId,h.homePadId,h.flight?.from.id,h.flight?.to.id])]);
  const shownPads=pads.filter(p=>visiblePads.has(p.id)).map(p=>({...p,householdIds:[...new Set(d.helicopters.filter(h=>h.homePadId===p.id).map(h=>h.familyHouseholdId).filter(Boolean))]}));
  return {clubs:clubs.snapshot(),privateFlights:d.privateFlights,privateRevenue:d.privateRevenue,maintenanceRevenue:d.maintenanceRevenue,sportsRevenue:d.sportsRevenue,matchesCompleted:d.matchesCompleted,tennisSessions:d.tennisSessions,golfSessions:Number(d.golfSessions||0),goals:d.goals,pickups:d.pickups,venues:SPORTS_ACTIVITY_VENUES.map(v=>({id:v.id,kind:v.kind,capacity:v.capacity,playing:world().flies.filter(f=>f.alive&&f.sportsSession&&sessionVenue(f.sportsSession)===v.id).length,traveling:world().flies.filter(f=>f.alive&&f.sportsInvitation?.venueId===v.id).length})),pads:shownPads,match:d.match,history:d.history.slice(-4),helicopters:d.helicopters.map(h=>({id:h.id,ownerId:h.ownerId,padId:h.padId,homePadId:h.homePadId,familyHouseholdId:h.familyHouseholdId,familyIds:h.familyIds||[],destroyed:Boolean(h.destroyed),destroyedAt:h.destroyedAt??null,condition:h.condition,maintenanceDebt:h.maintenanceDebt,trips:h.trips,flight:h.flight?{id:h.flight.id,from:h.flight.from,to:h.flight.to,departure:h.flight.departure,arrival:h.flight.arrival}:null})),participants:world().flies.filter(f=>f.alive&&f.sportsSession).map(f=>({id:f.id,...f.sportsSession})),algorithmOnly:true};
 }
 return {init,tick,handleResident,addChoices,snapshot,beginPrivate,beginSports,padAvailable,joinClub:clubs.join};
}
