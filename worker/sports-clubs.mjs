import {COUNTRY_IDS,countryAt} from './country-map.mjs';
import {LOCATIONS} from './city-map.mjs';
import {SPORTS_ACTIVITY_VENUES,sportsPlayerPose} from './sports-venues.mjs';
const DAY=86400;
export const CLUB_RULES=[
 {id:'north-golf-club',venueId:'north-golf',kind:'golf',membershipFee:10,prize:500,ticket:50,seats:30,players:4,hour:15},
 {id:'north-tennis-club',venueId:'north-tennis',kind:'tennis',membershipFee:5,prize:200,ticket:20,seats:35,players:2,hour:18},
];
const wallet=f=>Math.max(0,Number(f.money)||0)+Math.max(0,Number(f.savings)||0);
const hash=id=>[...String(id)].reduce((v,c)=>(Math.imul(v,31)+c.charCodeAt(0))>>>0,17)/4294967296;
export function clubSpectatorPose(venue,slot){
 const courts=venue.courts,bounds=courts?{x:(Math.min(...courts.map(c=>c.x))+Math.max(...courts.map(c=>c.x)))/2,z:Math.max(...courts.map(c=>c.z+c.d/2)),w:Math.max(...courts.map(c=>c.x+c.w/2))-Math.min(...courts.map(c=>c.x-c.w/2))}: {x:venue.x,z:venue.z+venue.d/2,w:venue.w};
 return{x:bounds.x+(slot%15-7)*Math.min(2,bounds.w/16),y:1.1,z:bounds.z+3+Math.floor(slot/15)*1.5};
}
/** Club money, memberships, daily resident tournaments; no renderer or private synthetic people. */
export function createSportsClubs({world,startJourney,moveFly,care=()=>{},available=()=>true,venueSafe=()=>true,emit=()=>{},remember=()=>{}}){
 const now=()=>Number(world().simulationAgeSeconds||0),people=()=>world().flies||[];
 const account=id=>{world().businesses||={};return world().businesses[id]||={cash:0,sector:'sports-club',countryId:COUNTRY_IDS.north};};
 const data=()=>world().sportsClubs||={version:1,nextReviewAt:0,clubs:Object.fromEntries(CLUB_RULES.map(r=>[r.id,{id:r.id,members:{},history:[],membershipRevenue:0,ticketRevenue:0,prizes:0,event:null}]))};
 function pay(f,amount,to){if(wallet(f)<amount)return false;const cash=Math.min(amount,Math.max(0,Number(f.money)||0));f.money=Number(f.money||0)-cash;f.savings=Number(f.savings||0)-(amount-cash);to.cash=Number(to.cash||0)+amount;world().totalTransactions=Number(world().totalTransactions||0)+1;return true;}
 function join(f,id){const rule=CLUB_RULES.find(r=>r.id===id);if(!rule||!f.alive)return false;const club=data().clubs[id],member=club.members[f.id];if(member?.until>now())return true;if(wallet(f)<rule.membershipFee+80)return false;if(!pay(f,rule.membershipFee,account(id)))return false;club.members[f.id]={joinedAt:member?.joinedAt??now(),until:now()+30*DAY,renewals:Number(member?.renewals||0)+(member?1:0)};club.membershipRevenue+=rule.membershipFee;remember(f,'club_membership',{clubId:id,until:club.members[f.id].until});return true;}
 function physical(f,venue){const gate=LOCATIONS.find(l=>l.id===venue.id)||venue;return !f.traveling&&!f.onPlane&&!f.onTrain&&f.currentLocationId===venue.id&&Math.hypot(f.x-gate.x,f.z-gate.z)<25;}
 function finish(club,rule,event){
  if(event.settled)return;event.settled=true;event.endedAt=now();
  const players=event.playing.map(id=>people().find(f=>f.id===id&&f.alive&&f.clubDuty?.eventId===event.id)).filter(Boolean);
  if(players.length>=2){players.sort((a,b)=>(Number(b.sportsProfile?.[rule.kind]||0)+hash(b.id+event.id)*.2)-(Number(a.sportsProfile?.[rule.kind]||0)+hash(a.id+event.id)*.2));event.winnerId=players[0].id;
   const treasury=account('treasury:'+COUNTRY_IDS.north);if(treasury.cash>=rule.prize){treasury.cash-=rule.prize;players[0].money=Number(players[0].money||0)+rule.prize;event.prizePaid=rule.prize;club.prizes+=rule.prize;remember(players[0],'sports_tournament_win',{eventId:event.id,kind:rule.kind,prize:rule.prize});}}
  for(const f of people())if(f.clubDuty?.eventId===event.id){if(event.playing.includes(f.id)){f.sportsProfile||={};f.sportsProfile[rule.kind]=Math.min(1,Number(f.sportsProfile[rule.kind]||0)+.02);}f.clubDuty=null;f.sportsSession=null;f.action='finished the club tournament';f.actionUntil=now()+600;}
  event.netAfterPrize=event.revenue-Number(event.prizePaid||0);club.history.push({...event});club.history=club.history.slice(-4);emit('club_tournament_complete',`${rule.kind} tournament finished.`,{clubId:rule.id,winnerId:event.winnerId,prizePaid:event.prizePaid||0,revenue:event.revenue});
 }
 function tick(){const d=data();for(const rule of CLUB_RULES){const club=d.clubs[rule.id];if(club.event&&!club.event.settled&&now()>=club.event.endsAt)finish(club,rule,club.event);}
  if(now()<d.nextReviewAt)return;d.nextReviewAt=now()+900;
  for(const rule of CLUB_RULES){const club=d.clubs[rule.id],venue=SPORTS_ACTIVITY_VENUES.find(v=>v.id===rule.venueId);if(!venue||!venueSafe(venue))continue;
   for(const id of Object.keys(club.members))if(!people().some(f=>f.id===id&&f.alive))delete club.members[id];
   const day=Math.floor(now()/DAY),startsAt=day*DAY+rule.hour*3600;if(now()>startsAt+3600)continue;
   if(club.event?.day!==day){club.event={id:`${rule.id}-${day}`,day,startsAt,endsAt:startsAt+3600,invited:[],playing:[],spectators:[],revenue:0,settled:false};}
   const event=club.event;event.invited=[...new Set(event.invited)].filter(id=>people().find(f=>f.id===id)?.clubDuty?.eventId===event.id);if(event.settled||now()>=event.startsAt)continue;
   const ready=people().filter(f=>f.alive&&f.ageYears>=16&&countryAt(f)===COUNTRY_IDS.north&&!f.traveling&&!f.onTrain&&!f.onPlane&&!f.clubDuty&&!f.sportsSession&&!f.sportsInvitation&&available(f));
   const players=ready.filter(f=>wallet(f)>rule.membershipFee+80).sort((a,b)=>Number(Boolean(club.members[b.id]?.until>now()))-Number(Boolean(club.members[a.id]?.until>now()))+Number(b.sportsProfile?.[rule.kind]||0)-Number(a.sportsProfile?.[rule.kind]||0));
   const plannedPlayers=event.invited.filter(id=>people().find(f=>f.id===id)?.clubDuty?.role==='player').length;
   const chosen=players.slice(0,Math.max(0,rule.players-plannedPlayers)).filter(f=>join(f,rule.id));
   const audience=ready.filter(f=>!chosen.includes(f)&&wallet(f)>=rule.ticket+80).sort((a,b)=>hash(a.id+event.id)-hash(b.id+event.id)).slice(0,Math.max(0,rule.seats-event.invited.filter(id=>people().find(f=>f.id===id)?.clubDuty?.role==='spectator').length));
   for(const [role,list]of [['player',chosen],['spectator',audience]])for(const f of list){
    f.clubDuty={clubId:rule.id,eventId:event.id,role,requestedAt:now(),slot:role==='player'?event.invited.filter(id=>people().find(f=>f.id===id)?.clubDuty?.role==='player').length:event.invited.length};event.invited.push(f.id);
    if(!physical(f,venue)){const ok=startJourney?.(f,{id:venue.id,action:role==='player'?`playing the daily ${rule.kind} club tournament`:`watching the daily ${rule.kind} tournament from outside the field`});if(ok===false||!f.traveling){f.clubDuty=null;event.invited=event.invited.filter(id=>id!==f.id);}}
   }
  }
 }
 function handleResident(f,clock){const duty=f.clubDuty;if(!duty)return false;const rule=CLUB_RULES.find(r=>r.id===duty.clubId),club=data().clubs[duty.clubId],event=club?.event,venue=SPORTS_ACTIVITY_VENUES.find(v=>v.id===rule?.venueId);
  if(!f.alive||!event||event.id!==duty.eventId||event.settled||now()>=event.endsAt||!venue||!venueSafe(venue)||!available(f)){f.clubDuty=null;if(f.sportsSession?.clubEventId)f.sportsSession=null;return false;}
  care(f,clock);if(f.traveling){moveFly?.(f);return true;}
  if(!duty.admittedAt){if(!physical(f,venue)){f.clubDuty=null;return false;}
   if(duty.role==='spectator'){if(event.spectators.length>=rule.seats||!pay(f,rule.ticket,account(rule.id))){f.clubDuty=null;return false;}event.spectators.push(f.id);event.revenue+=rule.ticket;club.ticketRevenue+=rule.ticket;duty.slot=event.spectators.length-1;}
   else {event.playing.push(f.id);duty.slot=event.playing.length-1;}
   duty.admittedAt=now()||.001;
  }
  const playing=duty.role==='player'&&now()>=event.startsAt,pose=playing?sportsPlayerPose(venue,duty.slot,now(),event.startsAt):clubSpectatorPose(venue,duty.slot);
  const distance=Math.hypot(pose.x-f.x,pose.z-f.z),step=Math.min(distance,2.5*Math.max(0,now()-Number(duty.lastAt??now()))/Math.max(1,Number(world().timeScale||120)));if(distance>.01){f.x+=(pose.x-f.x)*step/distance;f.z+=(pose.z-f.z)*step/distance;}f.y=1.1;duty.lastAt=now();f.indoors=false;f.onPlane=false;f.traveling=false;f.action=playing?`competing in the daily ${rule.kind} tournament`:`watching ${rule.kind} outside the field`;
  f.sportsSession={id:event.id,clubEventId:event.id,kind:rule.kind,venueId:venue.id,role:duty.role,slot:duty.slot,startsAt:event.startsAt,until:event.endsAt};return true;
 }
 function snapshot(){return CLUB_RULES.map(rule=>{const c=data().clubs[rule.id];return{...rule,members:Object.values(c.members).filter(m=>m.until>now()).length,membershipRevenue:c.membershipRevenue,ticketRevenue:c.ticketRevenue,prizes:c.prizes,event:c.event,history:c.history};});}
 return{tick,join,handleResident,snapshot};
}
