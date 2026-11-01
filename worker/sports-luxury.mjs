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

export function createSportsLuxury({world,random,emit,remember,startJourney,moveFly,needsAndActivities,payAndFinance}){
 const pads=privateHelipads(),padById=new Map(pads.map(p=>[p.id,p]));
 const rng=f=>clamp(random?.(f)??.5,0,1);
 const get=()=>world().sportsLuxury||init();
 const alive=id=>world().flies.find(f=>f.id===id&&f.alive);
 const account=()=>world().businesses['sports-aviation'];
 const busy=f=>f.socialTask||f.fireEngineDuty||f.ambulanceDuty||f.onFireEngine||f.onAmbulance||f.civicDuty||f.airTrip||f.heliPassenger||f.onPlane||f.onTrain||f.arrestedUntil>world().simulationAgeSeconds||f.urbanDuty||f.urbanTask||f.cityService||f.constructionJob||f.rescueJob||f.taxiJob||f.taxiJobId||f.taxiPassenger;
 function transfer(f,cost,to=account()){
  if(!Number.isFinite(cost)||cost<0||money(f)+1e-7<cost)return false;
  const cash=Math.min(Math.max(0,Number(f.money)||0),cost);f.money-=cash;f.savings=Math.max(0,Number(f.savings)||0)-(cost-cash);to.cash=Number(to.cash||0)+cost;
  f.expensesLifetime=Number(f.expensesLifetime||0)+cost;world().totalTransactions=Number(world().totalTransactions||0)+1;return true;
 }
 function init(){
  const s=world();s.businesses||={};s.businesses['sports-aviation']||={cash:0,inventory:0,sector:'sport-private-aviation'};
  const d=s.sportsLuxury||={version:1,helicopters:[],nextFlight:1,privateFlights:0,privateRevenue:0,maintenanceRevenue:0,sportsRevenue:0,matchesCompleted:0,tennisSessions:0,goals:0,match:null,lastDay:-1,nextMatchAt:Math.floor(s.simulationAgeSeconds/86400)*86400+16*3600,nextOwnershipCheck:0,history:[]};
  d.history||=[];d.helicopters||=[];
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
  for(const h of d.helicopters){const f=alive(h.ownerId);if(f)f.privateHelicopterId=h.id;}
  return d;
 }
 function ensurePrivateAccess(pad){
  if(!locate(pad.locationId))LOCATIONS.push({id:pad.locationId,type:'private-access',name:pad.name,x:pad.x,z:pad.z});
 }
 function bindFamilyHomes(d){
  for(const h of d.helicopters){
   const owner=alive(h.ownerId),home=owner&&padById.get(`PAD-${owner.housingUnitId}`);
   if(home){ensurePrivateAccess(home);h.homePadId=home.id;h.familyHouseholdId=owner.householdId||null;}
   else h.homePadId ||= pads.find(p=>p.rooftop&&p.id===h.padId)?.id||null;
   const household=world().housing?.households?.[h.familyHouseholdId],familyOwner=owner||world().flies.find(f=>f.id===h.estateOwnerId);
   h.familyIds=[...new Set([h.ownerId,...(household?.members||[]),...(familyOwner?.children||[])].filter(id=>id&&alive(id)))];
  }
 }
 function relocateLegacyParking(d){
  const taken=new Set(d.helicopters.flatMap(h=>[h.padId,h.flight?.to.id].filter(Boolean)));
  for(const h of d.helicopters){
   if(!h.roofMigrationPending||h.flight)continue;
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
  for(const h of d.helicopters){const f=alive(h.ownerId);if(!f)continue;const due=6+h.maintenanceDebt,paid=Math.min(due,Math.max(0,money(f)-100));if(paid>0){transfer(f,paid);d.maintenanceRevenue+=paid;}h.maintenanceDebt=Math.min(120,due-paid);h.condition=clamp(h.condition+(paid>=due?.025:-.01),.2,1);}
 }
 function inherit(d,now){
  if(now<d.nextOwnershipCheck)return;d.nextOwnershipCheck=now+3600;
  for(const h of d.helicopters){
   if(alive(h.ownerId))continue;const formerId=h.ownerId||h.estateOwnerId,former=world().flies.find(f=>f.id===formerId),candidates=[...(former?.children||[]),former?.partnerId].map(id=>alive(id)).filter(f=>f&&f.ageYears>=18&&!d.helicopters.some(o=>o.ownerId===f.id));
   const heir=candidates[0];if(heir){const before=formerId;h.ownerId=heir.id;delete h.estateOwnerId;h.nextTripAt=now+7200;heir.privateHelicopterId=h.id;remember?.(heir,'helicopter_inheritance',{from:before,helicopterId:h.id});emit?.('inheritance',`${heir.id} inherited ${h.id}.`,{flyId:heir.id,helicopterId:h.id,from:before});}
   else if(h.ownerId){h.estateOwnerId=h.ownerId;h.ownerId=null;h.nextTripAt=Infinity;emit?.('estate',`${h.id} remains in its owner's estate pending an eligible heir.`,{helicopterId:h.id});}
   if(h.flight&&now>=h.flight.arrival){h.padId=h.flight.to.id;h.flight=null;}
  }
 }
 function tick(gameSeconds,clock){
  const d=get(),s=world(),now=s.simulationAgeSeconds;bindFamilyHomes(d);relocateLegacyParking(d);maintenance(d,Math.floor(now/86400));inherit(d,now);
  for(const h of d.helicopters)if(!alive(h.ownerId)&&h.flight&&now>=h.flight.arrival){h.padId=h.flight.to.id;h.flight=null;}
  if(!d.match&&now>=d.nextMatchAt){d.nextMatchAt=nextAt(now);d.match={id:`MATCH-${Math.floor(now/86400)}`,startsAt:now+1800,endsAt:now+1800+SPORTS_RULES.matchSeconds,players:[],spectators:[],score:[0,0],lastGoalAt:now+2400,settled:false};emit?.('sports_fixture','Riverside Stadium opened registration for today’s city match.',{matchId:d.match.id,startsAt:d.match.startsAt});}
  const m=d.match;if(m){
   if(now>=m.startsAt&&now<m.endsAt&&now>=m.lastGoalAt){m.lastGoalAt=now+1200;const players=m.players.map(id=>alive(id)).filter(f=>f?.sportsSession?.id===m.id&&f.currentLocationId==='stadium'&&!f.traveling);if(players.length>=2){const side=m.score[0]<=m.score[1]?0:1;m.score[side]++;d.goals++;}}
   if(now>=m.endsAt&&!m.settled){m.settled=true;const participants=[...m.players,...m.spectators].map(id=>alive(id)).filter(Boolean);for(const f of participants){if(f.sportsSession?.id===m.id)finishSports(f,now,m);}d.matchesCompleted++;d.history.push({id:m.id,score:m.score,players:m.players.length,spectators:m.spectators.length,endedAt:now});d.history=d.history.slice(-12);emit?.('sports_result',`Riverside match ended ${m.score[0]}–${m.score[1]}; ${m.spectators.length} spectators attended.`,{matchId:m.id,score:m.score});d.match=null;}
  }
 }
 function addChoices(f,clock,add){
  const now=world().simulationAgeSeconds;if(f.ageYears<12||f.health<55||f.energy<35||busy(f)||f.privateFlight)return;
  const d=get(),social=Number(f.traits?.sociability??.5),stress=Number(f.stress||0);
  if(clock.hour>=7&&clock.hour<21&&now-Number(f.lastTennisAt??-86400)>14400)add('tennis','playing tennis',38+stress*.5+social*48+Number(f.traits?.resilience||.5)*18+(f.homeX>480?18:0)-Math.min(24,Math.hypot(f.x-830,f.z-120)/45));
  if(d.match&&now<d.match.endsAt){
   if(f.ageYears>=16&&f.energy>60&&d.match.players.length<SPORTS_RULES.stadiumPlayers)add('stadium','playing a stadium match',23+social*22+Number(f.excitement||0)*.25);
   if(d.match.spectators.length<SPORTS_RULES.spectators)add('stadium','watching a stadium match',22+social*30+stress*.35);
  }
  const h=d.helicopters.find(h=>h.ownerId===f.id);if(h&&!h.flight&&h.nextTripAt<=now&&money(f)>250&&!dangerous()){
   const p=padById.get(h.padId);if(p&&onIsland(p)===onIsland(f))add(p.locationId,'taking a private helicopter',62+Number(f.traits?.ambition||.5)*30+stress*.3);
  }
 }
 function care(f,clock){needsAndActivities?.(f,clock);payAndFinance?.(f,clock);}
 function finishSports(f,now,match){
  const session=f.sportsSession;if(!session)return;
  f.sportsProfile||={tennis:0,team:0,fitness:0,attended:0};const active=session.role==='player';if(active){f.sportsProfile.fitness=clamp(f.sportsProfile.fitness+.015,0,1);f.sportsProfile[session.kind==='tennis'?'tennis':'team']=clamp(f.sportsProfile[session.kind==='tennis'?'tennis':'team']+.01,0,1);f.health=clamp(f.health+1.2);f.energy=clamp(f.energy-3);}f.happiness=clamp(f.happiness+(active?8:5));f.stress=clamp(f.stress-9);f.loneliness=clamp(f.loneliness-8);f.sportsProfile.attended++;f.lastSportAt=now;f.action='finished a sports session';f.actionUntil=now+1800;f.sportsSession=null;
  remember?.(f,'sports_session',{kind:session.kind,role:session.role,matchId:match?.id,score:match?.score});
 }
 function beginSports(f,kind,role){
  const now=world().simulationAgeSeconds,d=get();if(f.sportsSession||f.privateFlight||f.traveling||f.currentLocationId!==(kind==='tennis'?'tennis':'stadium')||busy(f))return false;
  const m=kind==='stadium'?d.match:null;if(kind==='stadium'&&(!m||now>=m.endsAt))return false;
  if(kind==='tennis'&&world().flies.filter(o=>o.alive&&o.sportsSession?.kind==='tennis').length>=SPORTS_RULES.tennisPlayers)return false;
  if(m&&(role==='player'?m.players:m.spectators).length>=(role==='player'?SPORTS_RULES.stadiumPlayers:SPORTS_RULES.spectators))return false;
  const cost=(kind==='tennis'?SPORTS_RULES.tennisFee:role==='player'?0:SPORTS_RULES.stadiumFee)*clamp(world().centralBank?.priceLevel||1,.5,10);if(cost>0&&!transfer(f,cost))return false;
  if(m)(role==='player'?m.players:m.spectators).push(f.id);d.sportsRevenue+=cost;if(kind==='tennis'){d.tennisSessions++;f.lastTennisAt=now;}
  f.sportsSession={id:m?.id||`TENNIS-${f.id}-${now}`,kind,role,startsAt:now,until:m?.endsAt||now+SPORTS_RULES.playerSeconds};f.action=kind==='tennis'?'playing tennis':role==='player'?'playing a stadium match':'watching a stadium match';f.sleeping=false;f.traveling=false;f.indoors=false;
  const venue=SPORTS_VENUES.find(v=>v.id===(kind==='tennis'?'tennis':'stadium'));
  const slot=kind==='tennis'?world().flies.filter(o=>o.alive&&o.sportsSession?.kind==='tennis').length-1:(role==='player'?m.players:m.spectators).length-1;
  f.x=venue.x+(kind==='tennis'?(slot<2?-10:10):role==='player'?(slot%3-1)*7:slot%2?18:-18);
  f.z=venue.z+(kind==='tennis'?(slot%2?8:-8):role==='player'?(Math.floor(slot/3)-1.5)*10:Math.floor(slot/2)*2-20);f.y=1.1;f.targetX=f.x;f.targetZ=f.z;
  return true;
 }
 function beginPrivate(f,destinationPadId){
  const d=get(),now=world().simulationAgeSeconds,h=d.helicopters.find(h=>h.ownerId===f.id);
  if(!h||h.flight||f.privateFlight||f.traveling||busy(f)||dangerous()||h.condition<.35||h.maintenanceDebt>30||f.health<55||f.energy<30)return false;
  const from=padById.get(h.padId);if(!from||!padAvailable(from.id,h.id)||f.currentLocationId!==from.locationId)return false;
  const dests=pads.filter(p=>p.rooftop&&p.id!==from.id&&p.locationId!==from.locationId&&padAvailable(p.id,h.id));
  const to=destinationPadId?dests.find(p=>p.id===destinationPadId):(dests.find(p=>p.id===h.homePadId)||dests[Math.floor(rng(f)*dests.length)%dests.length]);if(!to)return false;
  const travelDistance=Math.hypot(to.x-from.x,to.z-from.z),fuel=8+travelDistance*.018,cost=(12+fuel*.9)*clamp(world().centralBank?.priceLevel||1,.5,10);
  if(money(f)<cost+120)return false;
  // Reserve the landing pad before taking any payment; it remains exclusive until landing.
  const depart=now+300+Math.max(120,from.y*5),arrival=depart+SPORTS_RULES.flightSeconds+travelDistance*.6;
  const flight={id:`PRIVATE-FLIGHT-${d.nextFlight++}`,helicopterId:h.id,ownerId:f.id,from:{...from},to:{...to},departure:depart,arrival,cost,fuel,paid:false};
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
  if(!h||!flight){f.privateFlight=null;f.onPrivateHelicopter=false;return false;}
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
    flight.from={id:`AIRBORNE-${flight.id}`,name:'diversion position',locationId:'airport',x:current.x,y:current.y-2,z:current.z,access:{x:current.x,z:current.z},rooftop:false};flight.to={...alternatives[0]};flight.departure=now;flight.arrival=now+1200;
    d.diversions=Number(d.diversions||0)+1;emit?.('private_diversion',`${f.id}'s helicopter diverted to ${flight.to.name} because its original landing pad became unsafe.`,{flyId:f.id,flightId:flight.id,fromPad:old,toPad:flight.to.id});
   }
   const p=privateHelicopterPose(now,flight);Object.assign(f,{x:p.x,y:p.y,z:p.z,vx:0,vz:0,traveling:false,transitMode:'private-helicopter',onPrivateHelicopter:true});f.action='flying in a personally owned helicopter';
   if(now<flight.arrival)return true;
   t.phase='disembarking';t.until=flight.arrival+300+Math.max(120,flight.to.y*5);h.padId=flight.to.id;h.trips++;d.privateFlights++;f.onPrivateHelicopter=false;remember?.(f,'private_helicopter_trip',{flightId:flight.id,from:flight.from.id,to:flight.to.id,cost:flight.cost});
  }
  if(t.phase==='disembarking'){
   const to=flight.to,u=clamp((now-flight.arrival)/Math.max(1,t.until-flight.arrival),0,1),ground=entrance(locate(to.locationId));if(to.rooftop){f.x=to.x;f.z=to.z;f.y=to.y+(1.1-to.y)*u;}else{const p=walkPose([...airportAccess(to)].reverse(),u);f.x=p.x;f.z=p.z;f.y=1.1;}f.indoors=to.rooftop;f.action=to.rooftop?'leaving the rooftop by elevator':'walking from the private aviation bay';
   if(now<t.until)return true;
   h.flight=null;h.nextTripAt=now+10800+rng(f)*18000;f.privateFlight=null;f.onPrivateHelicopter=false;f.x=ground.x;f.z=ground.z;f.y=1.1;f.currentLocationId=to.locationId;f.targetLocationId=to.locationId;f.transitMode='walk';f.traveling=false;f.indoors=false;f.action='arrived by private helicopter';f.actionUntil=now+1800;f.energy=clamp(f.energy-4);f.happiness=clamp(f.happiness+4);f.targetX=f.x;f.targetZ=f.z;
   emit?.('private_arrival',`${f.id} landed at ${to.name} and completed the ground transfer.`,{flyId:f.id,helicopterId:h.id,flightId:flight.id,padId:to.id});return true;
  }
  return true;
 }
 function handleResident(f,clock){
  if(!f.alive)return false;if(f.privateFlight)return handlePrivate(f,clock);
  if(f.sportsSession){care(f,clock);if(world().simulationAgeSeconds>=f.sportsSession.until)finishSports(f,world().simulationAgeSeconds);return true;}
  if(f.traveling||busy(f))return false;
  if(f.currentLocationId==='tennis'&&f.action==='playing tennis'){if(beginSports(f,'tennis','player'))return true;f.action='tennis courts full · waiting';f.actionUntil=world().simulationAgeSeconds+1200;return false;}
  if(f.currentLocationId==='stadium'&&['playing a stadium match','watching a stadium match'].includes(f.action)){if(beginSports(f,'stadium',f.action.startsWith('playing')?'player':'spectator'))return true;f.action='stadium registration closed';f.actionUntil=world().simulationAgeSeconds+1200;return false;}
  if(f.action==='taking a private helicopter'){if(beginPrivate(f))return true;f.action='private aviation unavailable';f.actionUntil=world().simulationAgeSeconds+3600;}
  return false;
 }
 function snapshot(){
  const d=get(),now=world().simulationAgeSeconds;
  const visiblePads=new Set(['PAD-riverside-hotel','PAD-riverside-office','PAD-riverside-clinic','PAD-island-resort','PAD-AIRPORT-1','PAD-AIRPORT-2',...d.helicopters.flatMap(h=>[h.padId,h.homePadId,h.flight?.from.id,h.flight?.to.id])]);
  const shownPads=pads.filter(p=>visiblePads.has(p.id)).map(p=>({...p,householdIds:[...new Set(d.helicopters.filter(h=>h.homePadId===p.id).map(h=>h.familyHouseholdId).filter(Boolean))]}));
  return {privateFlights:d.privateFlights,privateRevenue:d.privateRevenue,maintenanceRevenue:d.maintenanceRevenue,sportsRevenue:d.sportsRevenue,matchesCompleted:d.matchesCompleted,tennisSessions:d.tennisSessions,goals:d.goals,pads:shownPads,match:d.match,history:d.history.slice(-4),helicopters:d.helicopters.map(h=>({id:h.id,ownerId:h.ownerId,padId:h.padId,homePadId:h.homePadId,familyHouseholdId:h.familyHouseholdId,familyIds:h.familyIds||[],condition:h.condition,maintenanceDebt:h.maintenanceDebt,trips:h.trips,flight:h.flight?{id:h.flight.id,from:h.flight.from,to:h.flight.to,departure:h.flight.departure,arrival:h.flight.arrival}:null})),participants:world().flies.filter(f=>f.alive&&f.sportsSession).map(f=>({id:f.id,...f.sportsSession})),algorithmOnly:true};
 }
 return {init,tick,handleResident,addChoices,snapshot,beginPrivate,beginSports,padAvailable};
}
