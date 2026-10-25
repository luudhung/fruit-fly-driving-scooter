import {AIRPORT,ISLAND,onIsland} from './city-map.mjs';
import {AVIATION,tourismFares,nextFlight,flightPose,scheduledAircraft} from './aviation.mjs';

export function createTourismSystem({world,emit,remember,weatherDanger,startJourney,moveFly,needsAndActivities,payAndFinance}){
 const money=f=>Math.max(0,f.money)+Math.max(0,f.savings);
 const reserve=f=>Math.max(80,Number(f.wage||5)*16);
 const fares=()=>tourismFares(world().centralBank?.priceLevel);
 function ensure(){
  const s=world();
  s.aviation||={ticketsSold:0,completedHolidays:0,cancellations:0,delays:0,operatingFlights:[],revenue:0};
  return s.aviation;
 }
 function affordable(f,cost){return f.ageYears>=18&&money(f)>=cost+reserve(f)&&cost<=money(f)*.15;}
 function canHoliday(f){const p=fares();return !f.airTrip&&affordable(f,p.roundTrip+p.resortNight)&&f.health>65&&f.energy>55;}
 function charge(f,cost,business){
  if(money(f)+1e-7<cost)return false;
  const cash=Math.min(f.money,cost);f.money-=cash;f.savings-=cost-cash;
  business.cash+=cost;f.expensesLifetime=Number(f.expensesLifetime||0)+cost;world().totalTransactions++;
  return true;
 }
 function seats(flight,except){return world().flies.filter(f=>f.alive&&f!==except&&f.airTrip&&[f.airTrip.outbound.id,f.airTrip.inbound.id].includes(flight.id)).length;}
 function bookIslandHoliday(f){
  const s=world(),p=fares(),cost=p.roundTrip+p.resortNight;
  if(f.traveling||f.currentLocationId!=='airport'||!canHoliday(f)||weatherDanger()>.3)return false;
  const outbound=nextFlight(s.simulationAgeSeconds),returnMorning=(Math.floor(outbound.departure/86400)+1)*86400+9*3600;
  const inbound=nextFlight(returnMorning,'island',0);
  if(seats(outbound,f)>=AVIATION.seats||seats(inbound,f)>=AVIATION.seats){f.action='island flight sold out · waiting for another departure';f.actionUntil=s.simulationAgeSeconds+1800;return false;}
  if(!charge(f,cost,s.businesses['travel-escrow']))return false;
  f.airTrip={phase:'outbound-wait',outbound,inbound,fares:p,cost,settled:false,bookedAt:s.simulationAgeSeconds};
  f.lastHolidayDay=Math.floor(s.simulationAgeSeconds/86400);f.traveling=false;f.sleeping=false;f.onTrain=false;
  f.action='checked in for Hansdrex Island · return seat and full-board hotel reserved';
  const a=ensure();a.ticketsSold+=2;
  emit('air_ticket',`${f.id} booked a return flight (${p.roundTrip.toFixed(0)} H$) and full-board island stay (${p.resortNight.toFixed(0)} H$).`,{flyId:f.id,amount:cost,outbound:outbound.id,inbound:inbound.id});
  remember(f,'island_booking',{cost,outbound:outbound.id,inbound:inbound.id});
  return true;
 }
 function settleTicket(trip){
  if(trip.settled)return;
  const s=world(),p=trip.fares;
  s.businesses['travel-escrow'].cash-=trip.cost;
  s.businesses['island-air'].cash+=p.roundTrip-2*p.airportFee;
  s.treasury.cash+=2*p.airportFee;s.businesses['island-resort'].cash+=p.resortNight;
  trip.settled=true;ensure().revenue+=trip.cost;
 }
 function cancel(f,reason){
  const s=world(),trip=f.airTrip;
  // Pre-departure money remains in escrow, so a weather refund never depends on operator solvency.
  s.businesses['travel-escrow'].cash-=trip.cost;f.money+=trip.cost;f.expensesLifetime-=trip.cost;s.totalTransactions++;
  ensure().cancellations++;f.airTrip=null;f.action=`island trip refunded · ${reason}`;f.actionUntil=s.simulationAgeSeconds+3600;
  emit('air_refund',`${f.id} received a full ${trip.cost.toFixed(0)} H$ refund: ${reason}.`,{flyId:f.id,amount:trip.cost});
 }
 function delayReturn(f,reason){
  const t=f.airTrip;let flight=nextFlight(world().simulationAgeSeconds,'island');
  for(let i=0;i<12&&seats(flight,f)>=AVIATION.seats;i++)flight=nextFlight(flight.departure+1,'island',0);
  t.inbound=flight;ensure().delays++;f.action=`return flight delayed · ${reason} · hotel extension included`;
  emit('air_delay',`${f.id}'s return was moved to the next available flight at no charge.`,{flyId:f.id,departure:flight.departure,reason});
 }
 function arrive(f,island){
  const p=island?ISLAND.terminal:AIRPORT.terminal;
  Object.assign(f,{x:p.x,y:1.1,z:p.z,vx:0,vz:0,traveling:false,indoors:true,onPlane:false,transitMode:'walk',transitStage:null,
   currentLocationId:island?'island-airport':'airport',targetLocationId:island?'island-airport':'airport',routeWaypoints:[],routeIndex:0,pendingAction:null});
  f.targetX=p.x;f.targetZ=p.z;
  if(island){
   f.airTrip.phase='island';f.airTrip.arrivedAt=world().simulationAgeSeconds;
   startJourney(f,{id:'island-resort',action:'checking into Hansdrex Island Resort'});
   emit('air_arrival',`${f.id} landed on Hansdrex Island.`,{flyId:f.id});
  }else{
   ensure().completedHolidays++;f.airTrip=null;f.action='home from Hansdrex Island';f.actionUntil=world().simulationAgeSeconds+1200;
   f.happiness=Math.min(100,f.happiness+18);f.stress=Math.max(0,f.stress-25);
   emit('holiday_complete',`${f.id} returned from Hansdrex Island with the prepaid return ticket.`,{flyId:f.id});
  }
 }
 function touristNeeds(f,clock){
  needsAndActivities(f,clock);
  // The room includes meals and drinking water. Leisure extras remain optional purchases.
  if(onIsland(f)){f.thirst=Math.max(0,f.thirst-1);if(f.hunger>40)f.hunger=15;f.energy=Math.min(100,f.energy+.18);f.stress=Math.max(0,f.stress-.15);}
  payAndFinance(f,clock);
 }
 function simulateIslandHoliday(f,clock){
  const s=world(),now=s.simulationAgeSeconds;
  if(!f.airTrip){
   if(f.currentLocationId==='airport'&&!f.traveling&&f.action==='taking a holiday on Hansdrex Island'){
    if(!bookIslandHoliday(f)){f.action='island trip unavailable · keeping savings for essentials';f.actionUntil=now+3600;}
    return true;
   }
   return false;
  }
  const t=f.airTrip;
  if(t.phase==='outbound-wait'||t.phase==='inbound-wait'){
   const out=t.phase==='outbound-wait',flight=out?t.outbound:t.inbound;
   if(now<flight.departure){f.action=out?'waiting at gate · HCA → HIA':'waiting at gate · HIA → HCA';touristNeeds(f,clock);return true;}
   if(weatherDanger()>.3){if(out)cancel(f,'unsafe flying weather');else delayReturn(f,'unsafe flying weather');return true;}
   if(out)settleTicket(t);
   t.phase=out?'outbound':'inbound';
   emit('air_departure',`${f.id} boarded ${flight.id} for ${out?'Hansdrex Island':'Hansdrex City'}.`,{flyId:f.id,flightId:flight.id});
  }
  if(t.phase==='outbound'||t.phase==='inbound'){
   const out=t.phase==='outbound',flight=out?t.outbound:t.inbound;
   if(now>=flight.arrival){arrive(f,out);return true;}
   const pose=flightPose(now,flight);
   Object.assign(f,{x:pose.x,y:pose.y,z:pose.z,vx:0,vz:0,onPlane:true,indoors:false,traveling:false,transitMode:'airplane',transitStage:'island-flight',sleeping:false});
   f.action=out?'flying to Hansdrex Island':'flying home to Hansdrex City';touristNeeds(f,clock);return true;
  }
  if(t.phase==='island'){
   if(now>=t.inbound.departure-AVIATION.checkInSeconds){
    if(f.currentLocationId==='island-airport'&&!f.traveling){t.phase='inbound-wait';return simulateIslandHoliday(f,clock);}
    if(now>=t.inbound.departure){delayReturn(f,'missed check-in');}
    if(f.targetLocationId!=='island-airport'||!f.traveling)startJourney(f,{id:'island-airport',action:'checking in for the return flight'});
   }else if(!f.traveling){
    const night=clock.hour>=19||clock.hour<7;
    const dest=night?'island-resort':'island-beach';
    if(f.currentLocationId!==dest)startJourney(f,{id:dest,action:night?'resting at Hansdrex Island Resort':'relaxing on Hansdrex Island beach'});
    if(!night&&!t.beachActivity&&money(f)>reserve(f)+t.fares.beachActivity){
     charge(f,t.fares.beachActivity,s.businesses['island-resort']);t.beachActivity=true;
     emit('resort_spending',`${f.id} paid ${t.fares.beachActivity.toFixed(0)} H$ for a guided beach and kayak activity.`,{flyId:f.id,amount:t.fares.beachActivity});
    }
   }
   moveFly(f);touristNeeds(f,clock);return true;
  }
  return false;
 }
 function aviationTick(){
  const s=world(),a=ensure(),plane=scheduledAircraft(s.simulationAgeSeconds);
  if(plane.phase!=='flying'||a.operatingFlights.includes(plane.id)||weatherDanger()>.3)return;
  const airline=s.businesses['island-air'],cost=24*Number(s.centralBank?.priceLevel||1);
  if(airline.cash>=cost){
   const maintenance=s.businesses.garage||s.businesses['vehicle-showroom']||s.treasury;
   airline.cash-=cost;s.treasury.cash+=cost*.75;maintenance.cash=Number(maintenance.cash||0)+cost*.25;s.totalTransactions++;
  }
  a.operatingFlights=[...a.operatingFlights,plane.id].slice(-48);
 }
 function aviationSummary(){
  const s=world(),now=s.simulationAgeSeconds;
  return {...ensure(),fares:fares(),seats:AVIATION.seats,heliSeats:AVIATION.heliSeats,
   nextCityFlight:nextFlight(now,'city',0),nextIslandFlight:nextFlight(now,'island',0),
   plane:scheduledAircraft(now),weatherClosed:weatherDanger()>.3,
   passengers:s.flies.filter(f=>f.alive&&f.onPlane).length,holidaymakers:s.flies.filter(f=>f.alive&&f.airTrip).length,
   helicopterGuests:s.flies.filter(f=>f.alive&&f.heliPassenger).length};
 }
 return {bookIslandHoliday,simulateIslandHoliday,aviationSummary,aviationTick,canHoliday,affordable};
}
