import {createF1Charters,f1VisitorTravel} from './north-f1-charters.mjs';
import {SPORTS_VENUES,LOCATIONS,entrance} from './city-map.mjs';
import {COUNTRY_IDS,countryAt} from './country-map.mjs';
const DAY=86400,HOUR=3600,signature=id=>[...String(id)].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,113)/4294967296;
export const WORLD_CUP_RULES={afterF1Days:2,cadenceDays:4,foreignFans:350,localFans:150,foreignPlayers:30,hostingFee:1000,ticket:100,matchSeconds:5400};
export function createWorldCup({world,startJourney,moveFly,needsAndActivities=()=>{},payAndFinance=()=>{},isWorkCommitted=()=>false,aviationAdmission,interceptMovement,lawfulPresence=()=>true,bookEventHotel,releaseEventHotel,visitEventAttraction,emit=()=>{},remember=()=>{}}){
 const now=()=>Number(world().simulationAgeSeconds||0),venue=SPORTS_VENUES.find(v=>v.id==='stadium'),gate={...entrance(venue),id:'stadium'};
 const account=id=>{world().businesses||={};return world().businesses[id]||={cash:0,inventory:0,sector:'football-events',countryId:COUNTRY_IDS.hansdrex};};
 const data=()=>world().worldCup||={version:1,nextAt:Number(world().northF1?.event?.startsAt??world().northF1?.nextAt??now()+3*DAY)+2*DAY,event:null,previousTours:[],history:[],matches:0,revenue:0,hostingRevenue:0,charterArrivals:0,charterDepartures:0,externalInflow:0,externalOutflow:0};
 const available=f=>f.alive&&f.ageYears>=16&&f.health>50&&!isWorkCommitted(f)&&!f.clubDuty&&!f.publicServiceDuty&&!f.publicServiceRole&&!f.urbanTask&&!f.fireEngineDuty&&!f.ambulanceDuty&&!f.onPlane&&!f.onTrain&&!f.countryAirTrip&&!f.privateFlight&&!f.f1Duty&&!f.sportsSession&&!f.sportsInvitation;
 function pay(f,amount){if(amount===0)return true;if(Number(f.money||0)+Number(f.savings||0)<amount)return false;const cash=Math.min(amount,Math.max(0,Number(f.money)||0));f.money=Number(f.money||0)-cash;f.savings=Number(f.savings||0)-(amount-cash);world().treasury.cash+=amount;f.expensesLifetime=Number(f.expensesLifetime||0)+amount;world().totalTransactions=Number(world().totalTransactions||0)+1;return true;}
 function attend(f,e=data().event){
  if(!e||now()<e.startsAt-3*HOUR||now()>=e.endsAt||f.onPlane||f.onTrain||f.traveling||f.currentLocationId!=='stadium'||Math.hypot(f.x-gate.x,f.z-gate.z)>45||!lawfulPresence(f,COUNTRY_IDS.hansdrex))return false;
  if(f.lastWorldCupTicket===e.id)return true;
  const player=f.eventRole==='football-player',foreign=f.kind==='visitor';
  if(player){if(f.citizenshipCountryId!=='outside'||e.players.length>=30)return false;e.players.push(f.id);}
  else {if(foreign?e.foreignFans.length>=350:e.localFans.length>=150)return false;const hansResident=f.kind!=='visitor'&&(f.residencyCountryId||f.citizenshipCountryId)===COUNTRY_IDS.hansdrex,fee=hansResident?0:WORLD_CUP_RULES.ticket;if(!pay(f,fee))return false;data().revenue+=fee;e.revenue+=fee;(foreign?e.foreignFans:e.localFans).push(f.id);}
  f.lastWorldCupTicket=e.id;remember(f,'world_cup_attended',{eventId:e.id,role:player?'foreign-player':'spectator'});return true;
 }
 const tours=createF1Charters({world,signature,eventKey:'worldCup',eventVenue:gate,foreignDemand:350,teamPlayers:30,admit:aviationAdmission,intercept:interceptMovement,account,bookHotel:bookEventHotel,releaseHotel:releaseEventHotel,visitAttraction:visitEventAttraction,attend,weatherClosed:()=>world().weather?.condition==='thunderstorm',movementBlocked:()=>false});
 function care(f,clock){if(f.worldCupCareAt===now())return;f.worldCupCareAt=now();needsAndActivities(f,clock);payAndFinance(f,clock);}
 function handleResident(f,clock){const duty=f.worldCupDuty;if(!duty)return false;const e=data().event;if(!available(f)||!e||e.id!==duty.eventId||now()>=e.endsAt){f.worldCupDuty=null;return false;}
  care(f,clock);if(f.traveling){moveFly?.(f);return true;}
  if(f.currentLocationId!=='stadium'){startJourney?.(f,{id:'stadium',action:'attending the international World Cup match'});return Boolean(f.traveling);}
  attend(f,e);if(f.lastWorldCupTicket===e.id){const i=e.localFans.indexOf(f.id);f.x=venue.x+(i%2?venue.w*.39:-venue.w*.39);f.z=venue.z+((Math.floor(i/2)%25)-12)*1.5;f.y=1.1;f.indoors=false;f.action='watching the World Cup from the grandstand';}return true;
 }
 function open(d){const id=`HANSDREX-WORLD-CUP-${Math.floor(d.nextAt/DAY)}`;d.event={id,format:2,startsAt:d.nextAt,endsAt:d.nextAt+WORLD_CUP_RULES.matchSeconds,status:'scheduled',charters:[],tourPaths:{},players:[],foreignFans:[],localFans:[],invitations:[],score:[0,0],revenue:0,teams:['Overseas United','International Athletic'],hostingPaid:false};tours.make(d.event);emit('world_cup_fixture','International football follows the Grand Prix two days later.',{eventId:id,startsAt:d.nextAt});}
 function tick(){const d=data();for(const old of d.previousTours)tours.tick(old);d.previousTours=d.previousTours.filter(e=>e.charters.some(f=>!f.departed));
  let e=d.event;if(e&&now()>=e.endsAt&&!e.settled){e.settled=true;e.status=e.players.length>=22?'complete':'postponed';d.matches+=e.status==='complete'?1:0;d.history.push({id:e.id,startsAt:e.startsAt,score:e.score,players:e.players.length,foreignFans:e.foreignFans.length,localFans:e.localFans.length,revenue:e.revenue,hostingPaid:e.hostingPaid});d.history=d.history.slice(-4);for(const f of world().flies||[])if(f.worldCupDuty?.eventId===e.id)f.worldCupDuty=null;}
  if(e?.settled){d.previousTours.push(e);d.nextAt=e.startsAt+4*DAY;d.event=null;e=null;}
  if(!e&&now()>=d.nextAt-3*DAY){while(d.nextAt<=now())d.nextAt+=4*DAY;open(d);e=d.event;}
  if(!e)return;tours.tick(e);
  if(!e.hostingPaid&&now()>=e.startsAt&&e.players.length>=22){const sponsor=account('world-cup-organizer');if(!e.sponsorFunded){sponsor.cash+=1000;d.externalInflow+=1000;e.sponsorFunded=true;}if(sponsor.cash>=1000){sponsor.cash-=1000;world().treasury.cash+=1000;e.hostingPaid=true;d.hostingRevenue+=1000;}e.status='playing';}
  if(now()>=e.startsAt&&now()<e.endsAt){const elapsed=now()-e.startsAt;e.score=[Math.floor(elapsed/1800),Math.floor(elapsed/2500)];
   for(const guest of e.charters.flatMap(f=>f.guests)){
    if(guest.phase!=='visiting'||guest.currentLocationId!=='stadium'||guest.lastWorldCupTicket!==e.id)continue;
    const slot=e.players.indexOf(guest.id);
    if(slot>=0&&slot<22){const side=slot<11?-1:1,n=slot%11;guest.x=venue.x+side*(3+(n%4)*2)+Math.sin(elapsed/90+n)*1.5;guest.z=venue.z+((Math.floor(n/4)-1)*14)+Math.cos(elapsed/120+n)*2;guest.action='playing international football';}
    else if(slot>=22){guest.x=venue.x-19;guest.z=venue.z+25+(slot-22)*.7;guest.action='waiting on the international substitute bench';}
    else {const i=e.foreignFans.indexOf(guest.id);guest.x=venue.x+(i%2?1:-1)*(18+Math.floor(i/70)*1.1);guest.z=venue.z+(Math.floor(i/2)%35-17)*1.2;guest.action='watching World Cup from the grandstand';}
    guest.y=1.1;
   }
  }
  if(now()<e.startsAt&&now()>=e.startsAt-36*HOUR&&now()>=Number(e.nextInviteAt||0)){
   e.nextInviteAt=now()+HOUR;const ids=new Set(e.invitations),locals=(world().flies||[]).filter(f=>available(f)&&!f.traveling&&!f.worldCupDuty&&!ids.has(f.id)&&[COUNTRY_IDS.hansdrex,COUNTRY_IDS.north].includes(f.citizenshipCountryId)).sort((a,b)=>signature(b.id+e.id)-signature(a.id+e.id));
   for(const f of locals.slice(0,Math.max(0,150-e.invitations.length))){f.worldCupDuty={eventId:e.id};e.invitations.push(f.id);startJourney?.(f,{id:'stadium',action:'traveling to the World Cup stadium'});}
  }
 }
 function events(){const d=data();return[d.event,...d.previousTours].filter(Boolean);}
 function charters(){return events().flatMap(e=>e.charters.filter(f=>!f.departed).flatMap(f=>[f,f.returnLeg].filter(p=>p&&!p.aircraftGone&&Number.isFinite(p.inboundAt)).map(({guests,returnLeg,...p})=>p)));}
 function foreignVisitors(){return events().flatMap(e=>e.charters.flatMap(f=>f.guests.map(g=>({e,g})))).filter(({g})=>!['departed','denied','cancelled'].includes(g.phase)&&Number.isFinite(g.x)).map(({e,g})=>({eventRole:g.eventRole,id:g.id,name:g.name,kind:'visitor',alive:true,sex:signature(g.id)<.5?'F':'M',ageYears:g.ageYears,generation:1,x:g.x,y:g.y??1.1,z:g.z,money:g.money,savings:g.savings,onPlane:Boolean(g.onPlane),indoors:Boolean(g.indoors),citizenshipCountryId:'outside',originCountryId:'outside',action:g.action||'visiting the World Cup',health:95,hunger:20,energy:85,children:[],parents:[],...f1VisitorTravel(e,g,now())}));}
 function snapshot(){const d=data(),e=d.event;return{nextAt:e?.startsAt||d.nextAt,matches:d.matches,revenue:d.revenue,hostingRevenue:d.hostingRevenue,charterArrivals:d.charterArrivals,charterDepartures:d.charterDepartures,event:e?{id:e.id,startsAt:e.startsAt,endsAt:e.endsAt,status:e.status,score:e.score,teams:e.teams,players:e.players.length,foreignFans:e.foreignFans.length,localFans:e.localFans.length}:null,foreignVisitors:foreignVisitors(),history:d.history};}
 function liquidCash(){return events().flatMap(e=>e.charters.flatMap(f=>f.guests)).reduce((sum,f)=>sum+(!['inbound','denied','cancelled','departed'].includes(f.phase)?Math.max(0,Number(f.money)||0)+Math.max(0,Number(f.savings)||0):0),0);}
 return{tick,handleResident,snapshot,charters,foreignVisitors,attend,liquidCash};
}
