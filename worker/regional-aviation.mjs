import {ISLAND} from './city-map.mjs';
import {COUNTRY_AIRPORTS,COUNTRY_IDS,NORTH_SPORTS_PARK,countryAt} from './country-map.mjs';
import {AVIATION,airportById,nextRegionalFlight,regionalFlightPath,flightPose,tourismFares} from './aviation.mjs';
import {visitorArrivalPose,visitorArrivalPath,visitorRunwaySlot} from './visitor-aviation.mjs';
const DAY=86400,wallet=f=>Math.max(0,Number(f.money||0))+Math.max(0,Number(f.savings||0));
const SPORTS_STOP_SECONDS=3600;
function sportsDestination(id){
  let key=0;
  for(const digit of String(id))key=(key*31+digit.charCodeAt(0))>>>0;
  return NORTH_SPORTS_PARK.activities[key%NORTH_SPORTS_PARK.activities.length];
}
const hotelFor={city:'hotel',north:'north-hotel',island:'island-resort'};

/** Quote the actual return fare, both entry visas and protected essential cash. */
export function regionalJourneyBudget(person,toId,{priceLevel=1}={}){
 const from=COUNTRY_AIRPORTS.find(p=>p.countryId===countryAt(person)),to=airportById(toId);
 if(!from||!to||from.id===to.id)return {affordable:false,cost:0,visaReserve:0,required:Infinity,from:from?.id||null,to:to?.id||null};
 const fares=tourismFares(priceLevel),cost=fares.roundTrip+fares.resortNight,visaReserve=(person.citizenshipCountryId===to.countryId?0:50)+(person.citizenshipCountryId===from.countryId?0:50),required=cost+visaReserve+80;
 return {affordable:wallet(person)>=required,cost,visaReserve,required,from:from.id,to:to.id};
}


/** Paid manifests and journeys share the existing world and existing residents. */
export function createRegionalAviationSystem({world,startJourney,moveFly,aviationAdmission,requestAirClearance,weatherDanger=()=>0,needsAndActivities=()=>{},payAndFinance=()=>{},emit=()=>{},remember=()=>{}}){
 const raw=()=>world(),now=()=>Number(raw().simulationAgeSeconds||0),people=()=>[...(raw().flies||[]),...(raw().cityVisitors?.visitors||[])];
 const data=()=>raw().regionalAviation||={version:1,ticketsSold:0,completedTrips:0,cancellations:0,flightsOperated:[],history:[],revenue:0,northSportsVisits:0};
 const account=id=>{raw().businesses||={};return raw().businesses[id]||={cash:0,inventory:0,sector:'air-transport'};};
 const occupancy=flight=>people().filter(f=>f.alive&&[f.countryAirTrip?.outbound?.id,f.countryAirTrip?.inbound?.id,f.airTrip?.outbound?.id,f.airTrip?.inbound?.id].includes(flight.id)).length;
 function charge(f,amount,to){if(wallet(f)<amount)return false;const cash=Math.min(f.money||0,amount);f.money=Number(f.money||0)-cash;f.savings=Number(f.savings||0)-(amount-cash);to.cash+=amount;f.expensesLifetime=Number(f.expensesLifetime||0)+amount;raw().totalTransactions=Number(raw().totalTransactions||0)+1;return true;}
 function clearLeg(flight,operatorCountryId){
  // Authorize the actual circuit, including the Hansdrex airspace between North
  // and Hawaii; an unrelated country must not close a route it never crosses.
  const route=regionalFlightPath(flight)||[],countries=[...new Set(route.map(p=>countryAt({x:p[0],z:p[2]})))];
  return !requestAirClearance||requestAirClearance({flightId:flight.id,operatorCountryId,fromAirportId:flight.from,toAirportId:flight.to,countries,kind:'commercial'}).allowed;
 }
 function hotels(){raw().cityVisitors||={visitors:[],hotels:{}};raw().cityVisitors.hotels||={};return raw().cityVisitors.hotels;}
 function init(){data();for(const id of ['regional-air','regional-flight-escrow'])account(id);return data();}
 function availableSeat(flight,except){return occupancy(flight)-(except?.countryAirTrip&&[except.countryAirTrip.outbound.id,except.countryAirTrip.inbound.id].includes(flight.id)?1:0)<AVIATION.seats;}
 function book(f,toId,{staySeconds=DAY,hotelId}={}){
  init();const from=COUNTRY_AIRPORTS.find(p=>p.countryId===countryAt(f)),to=airportById(toId);
  if(!f.alive||f.countryAirTrip||f.airTrip||f.onPlane||f.onTrain||f.traveling||f.fireEngineDuty||f.ambulanceDuty||f.publicServiceDuty||f.industrialFreightDuty||f.cityService||f.taxiJobId||f.urbanTask||!from||!to||from.id===to.id||f.currentLocationId!==from.locationId||Math.hypot(f.x-from.terminal.x,f.z-from.terminal.z)>55||weatherDanger()>.3)return false;
  const outbound=nextRegionalFlight(now(),from.id,to.id),inbound=nextRegionalFlight(outbound.arrival+Math.max(7200,staySeconds),to.id,from.id,0),fares=tourismFares(raw().centralBank?.priceLevel),hotel=hotelId||(from.id==='city'&&to.id==='north'&&f.citizenshipCountryId===COUNTRY_IDS.hansdrex?NORTH_SPORTS_PARK.clubhouse.id:hotelFor[to.id]),cost=fares.roundTrip+fares.resortNight;
  const budget=regionalJourneyBudget(f,to.id,{priceLevel:raw().centralBank?.priceLevel}),visas=budget.visaReserve;
  if(!budget.affordable||!availableSeat(outbound)||!availableSeat(inbound))return false;
  const rooms=hotels(),h=rooms[hotel]||={id:hotel,capacity:to.id==='island'?24:16,rooms:{},pricePerNight:fares.resortNight};h.rooms||={};
  if(h.closed||!h.rooms[f.id]&&Object.keys(h.rooms).length>=h.capacity)return false;
  for(const leg of [outbound,inbound])if(!clearLeg(leg,from.countryId))return false;
  if(!charge(f,cost,account('regional-flight-escrow')))return false;
  h.rooms[f.id]={visitorId:f.id,bookedAt:now(),checkoutAt:inbound.departure,nights:1,paid:fares.resortNight,checkedIn:false};
  f.countryAirTrip={phase:'outbound-wait',from:from.id,to:to.id,outbound:{...outbound,regional:true},inbound:{...inbound,regional:true},outboundIndex:occupancy(outbound),inboundIndex:occupancy(inbound),hotelId:hotel,cost,fares,settled:false,bookedAt:now(),visaReserve:visas};
  f.countryFlightPlan=null;f.sleeping=false;f.action='waiting at the regional gate with a paid return ticket';data().ticketsSold+=2;
  remember(f,'regional_flight_booked',{from:from.id,to:to.id,cost,outbound:outbound.id,inbound:inbound.id});return true;
 }
 function request(f,toId,options={}){
  const from=COUNTRY_AIRPORTS.find(p=>p.countryId===countryAt(f)),to=airportById(toId);if(!f.alive||!from||!to||from.id===to.id||f.countryAirTrip||f.airTrip||f.traveling||!regionalJourneyBudget(f,to.id,{priceLevel:raw().centralBank?.priceLevel}).affordable)return false;
  f.countryFlightPlan={toId:to.id,options,requestedAt:now()};
  if(f.currentLocationId===from.locationId&&!f.traveling)return book(f,to.id,options);
  startJourney?.(f,{id:from.locationId,action:'checking in for an international regional flight'});return Boolean(f.traveling);
 }
 function releaseRoom(f,t){const h=hotels()[t.hotelId];if(h?.rooms)delete h.rooms[f.id];}
 function cancel(f,t){if(!t.settled){account('regional-flight-escrow').cash-=t.cost;f.money=Number(f.money||0)+t.cost;f.expensesLifetime=Number(f.expensesLifetime||0)-t.cost;}releaseRoom(f,t);f.countryAirTrip=null;f.onPlane=false;f.action='regional trip refunded because flying weather is unsafe';data().cancellations++;}
 function settle(t){if(t.settled)return;account('regional-flight-escrow').cash-=t.cost;account('regional-air').cash+=t.fares.roundTrip;account(t.hotelId).cash+=t.fares.resortNight;t.settled=true;data().revenue+=t.cost;}
 function arrivalFlight(flight){const port=airportById(flight.to),stand=port.stands.at(-1);return{...flight,airportId:port.id,standId:stand.id,arrivalStand:stand,sector:'north',direction:1,inboundAt:flight.departure,parkedAt:flight.arrival,outboundAt:null,exitAt:null};}
 function delayReturn(f,t){let next=nextRegionalFlight(now(),t.to,t.from);for(let i=0;i<24&&!availableSeat(next,f);i++)next=nextRegionalFlight(next.departure+1,t.to,t.from,0);if(!availableSeat(next,f)||!clearLeg(next,airportById(t.from).countryId))return false;t.inbound={...next,regional:true};t.inboundIndex=occupancy(next);const room=hotels()[t.hotelId]?.rooms?.[f.id];if(room)room.checkoutAt=next.departure;return true;}
 function care(f,clock){
  if(f.regionalCareAt===now())return;
  f.regionalCareAt=now();needsAndActivities(f,clock);payAndFinance(f,clock);
 }
 function handleResident(f,clock={hour:12}){
  const owned=handleRegionalResident(f,clock);if(owned&&f.alive)care(f,clock);return owned;
 }
 function handleRegionalResident(f,clock){
  if(!f.countryAirTrip&&!f.traveling&&String(f.action||'').startsWith('regional holiday to ')){const destination=f.action.slice('regional holiday to '.length);if(!book(f,destination)){f.action='keeping savings for a later regional holiday';f.actionUntil=now()+3600;}return true;}
  if(f.countryFlightPlan&&!f.countryAirTrip){
   if(f.traveling){moveFly?.(f);return true;}
   const plan=f.countryFlightPlan;if(!book(f,plan.toId,plan.options)){f.countryFlightPlan=null;f.action='keeping savings because a regional trip is unavailable';}return true;
  }
  const t=f.countryAirTrip;if(!t)return false;
  if(!f.alive){releaseRoom(f,t);if(!t.settled){account('regional-flight-escrow').cash-=t.cost;if(f.estateSettled){const heir=(raw().flies||[]).find(h=>h.alive&&(h.id===f.partnerId||(f.children||[]).includes(h.id)));if(heir)heir.savings=Number(heir.savings||0)+t.cost;else raw().treasury.cash+=t.cost;}else f.money=Number(f.money||0)+t.cost;f.expensesLifetime=Number(f.expensesLifetime||0)-t.cost;}f.countryAirTrip=null;f.onPlane=false;return true;}
  const out=['outbound-wait','outbound','arrival'].includes(t.phase),leg=out?t.outbound:t.inbound;
  if(t.phase==='outbound-wait'||t.phase==='inbound-wait'){
   if(now()<leg.departure)return true;
   if(weatherDanger()>.3){if(out)cancel(f,t);else delayReturn(f,t);return true;}
   if(out)settle(t);t.phase=out?'outbound':'inbound';f.onPlane=true;f.indoors=false;f.traveling=false;
  }
  if(t.phase==='outbound'||t.phase==='inbound'||t.phase==='arrival'||t.phase==='return-arrival'){
   const returning=t.phase==='inbound'||t.phase==='return-arrival',flight=returning?t.inbound:t.outbound;
   if(now()<flight.arrival){const pose=flightPose(now(),flight);Object.assign(f,{x:pose.x,y:pose.y,z:pose.z,onPlane:true,indoors:false,traveling:false,transitMode:'airplane',action:`flying ${flight.from} to ${flight.to}`});return true;}
   const airport=airportById(flight.to),arrival=arrivalFlight(flight),pose=visitorArrivalPose(now(),arrival,returning?t.inboundIndex||0:t.outboundIndex||0,raw().timeScale||120);t.phase=returning?'return-arrival':'arrival';
   Object.assign(f,{x:pose.x,y:pose.y,z:pose.z,onPlane:pose.onPlane,indoors:pose.indoors,traveling:false,transitMode:pose.onPlane?'airplane':'walk',action:'walking from the aircraft through immigration'});
   if(pose.phase!=='complete')return true;
   const admitted=aviationAdmission?.(f,{airportId:airport.id,flightId:flight.id,toCountryId:airport.countryId});if(admitted&&!admitted.allowed){f.x=airport.terminal.x;f.z=airport.terminal.z;f.indoors=true;f.action='waiting for lawful airport admission';return true;}
   Object.assign(f,{x:airport.gate.x,y:1.1,z:airport.gate.z,onPlane:false,indoors:false,currentLocationId:airport.locationId,targetLocationId:airport.locationId,routeWaypoints:[],routeIndex:0});
   if(returning){releaseRoom(f,t);f.countryAirTrip=null;f.lastCountryFlightAt=now();data().completedTrips++;f.action='completed a paid international return journey';f.actionUntil=now()+1200;emit('regional_trip_complete',`${f.id} returned on a reserved regional flight.`,{flyId:f.id,from:t.from,to:t.to});}
   else{t.phase='visiting';t.arrivedAt=now();startJourney?.(f,{id:t.hotelId,action:'checking into the prepaid destination hotel'});}
   return true;
  }
  if(t.phase==='visiting'){
   const visitingSports=t.from==='city'&&t.to==='north'&&f.citizenshipCountryId===COUNTRY_IDS.hansdrex;
   const venue=visitingSports?sportsDestination(f.id):null;
   if(venue&&!f.traveling&&f.currentLocationId===venue.id&&Math.hypot(f.x-venue.x,f.z-venue.z)<18&&t.northSportsArrivedAt==null){
    t.northSportsArrivedAt=now();
    data().northSportsVisits=Number(data().northSportsVisits||0)+1;
    remember(f,'north_sports_visit',{tripId:t.outbound.id,locationId:venue.id});
   }

   if(!f.traveling&&f.currentLocationId===t.hotelId){const room=hotels()[t.hotelId]?.rooms?.[f.id];if(room)room.checkedIn=true;}
   const airport=airportById(t.to);
   const sportsLodge=t.hotelId===NORTH_SPORTS_PARK.clubhouse.id;
   const walkLead=sportsLodge?Math.min(14*3600,Math.hypot(f.x-airport.gate.x,f.z-airport.gate.z)*Number(raw().timeScale||120)/2.5*1.35):0;
   // Preserve the longer return buffer after the traveller starts moving.
   const returningToGate=Boolean(sportsLodge&&t.northSportsReturning);
   if(returningToGate||now()>=t.inbound.departure-AVIATION.checkInSeconds-walkLead){
    if(sportsLodge)t.northSportsReturning=true;if(!f.traveling&&f.currentLocationId===airport.locationId){t.phase='inbound-wait';return handleResident(f,clock);}if(now()>=t.inbound.departure)delayReturn(f,t);if(!f.traveling||f.targetLocationId!==airport.locationId)startJourney?.(f,{id:airport.locationId,action:'checking in for the reserved return flight'});}
   else if(!f.traveling){
    const hungry=Number(f.hunger||0)>55;
    const sportsStop=venue&&(t.northSportsArrivedAt==null||now()-t.northSportsArrivedAt<SPORTS_STOP_SECONDS);
    const destination=hungry?({island:'island-resort',north:'north-market',city:'market'}[t.to])
      :sportsStop?venue.id:({island:'island-beach',north:'airport-park',city:'park'}[t.to]);
    if(f.currentLocationId!==destination)startJourney?.(f,{id:destination,action:hungry?'going to a real holiday meal':sportsStop?`visiting ${venue.name}`:'visiting the destination country on a paid holiday'});
    else if(!hungry)f.energy=Math.min(100,Number(f.energy||50)+.5);
   }
   moveFly?.(f);care(f,clock);
   // The paid island room includes board, but every onsite meal uses existing
   // resort stock. City/North guests buy meals through needsAndActivities.
   const resort=raw().businesses?.['island-resort'];
   if(t.to==='island'&&t.settled&&!f.traveling&&!f.onPlane&&f.currentLocationId==='island-resort'&&Math.hypot(f.x-ISLAND.resort.x,f.z-ISLAND.resort.z)<=40&&Number(f.hunger||0)>45&&Number(resort?.inventory||0)>=1){resort.inventory-=1;f.hunger=Math.max(0,f.hunger-60);t.mealsConsumed=Number(t.mealsConsumed||0)+1;}
   return true;
  }
  return true;
 }
 function snapshot(){
  const manifests=new Map();for(const f of people()){const t=f.countryAirTrip;if(!t||!f.alive)continue;for(const leg of[t.outbound,t.inbound]){if(now()<leg.departure-300||now()>leg.arrival+900)continue;let record=manifests.get(leg.id);if(!record){record={...leg,kind:'plane',ownerCountryId:airportById(leg.from).countryId,clearance:'scheduled-commercial',passengerIds:[],seats:AVIATION.seats,pose:flightPose(now(),leg)};manifests.set(leg.id,record);}record.passengerIds.push(f.id);}}
  return{...data(),seats:AVIATION.seats,flights:[...manifests.values()].slice(0,12),airports:COUNTRY_AIRPORTS.map(p=>({id:p.id,countryId:p.countryId,nextFlights:COUNTRY_AIRPORTS.filter(to=>to.id!==p.id).map(to=>nextRegionalFlight(now(),p.id,to.id,0))}))};
 }
 function tick(){init();for(const f of people())if(f.countryAirTrip&&!f.alive||f.kind==='visitor'&&(f.countryAirTrip||f.countryFlightPlan))handleResident(f,{hour:now()%DAY/3600});for(const record of snapshot().flights)if(now()>=record.departure&&now()<record.arrival&&!data().flightsOperated.includes(record.id)){data().flightsOperated.push(record.id);data().flightsOperated=data().flightsOperated.slice(-96);const airline=account('regional-air'),fuel=account('vehicle-showroom'),cost=Math.min(24,airline.cash);airline.cash-=cost;fuel.cash+=cost;}}
 function runwayAvailable({airportId,departure,arrival}){const external=(raw().cityVisitors?.airportTraffic?.flights||[]).filter(f=>(f.airportId||'city')===airportId);return visitorRunwaySlot(departure,arrival-departure,external,airportId)===departure;}
 function addChoices(f,clock,add){
  if(f.alive&&f.citizenshipCountryId===COUNTRY_IDS.north&&countryAt(f)===COUNTRY_IDS.north&&!f.traveling&&!f.onPlane&&!f.onTrain&&!f.countryAirTrip&&f.energy>55&&f.hunger<45&&clock.hour>=9&&clock.hour<=17&&weatherDanger()<.25){
   const venue=sportsDestination(f.id);
   add(venue.id,`visiting ${venue.name}`,14+Number(f.stress||0)*.4+Number(f.traits?.sociability||.5)*12);
  }
  if(!f.alive||f.kind==='visitor'||f.ageYears<18||f.traveling||f.airTrip||f.countryAirTrip||f.onPlane||f.onTrain||f.fireEngineDuty||f.ambulanceDuty||f.publicServiceDuty||f.industrialFreightDuty||f.cityService||f.urbanTask||f.civicDuty||f.health<65||f.energy<55||wallet(f)<400||weatherDanger()>.25||clock.hour<6||clock.hour>17||now()-Number(f.lastCountryFlightAt??-8*DAY)<7*DAY)return;
  const origin=COUNTRY_AIRPORTS.find(p=>p.countryId===countryAt(f));if(!origin)return;
  const destinations=COUNTRY_AIRPORTS.filter(p=>p.id!==origin.id);let hash=Math.floor(now()/DAY);for(const c of String(f.id))hash=(Math.imul(hash,31)+c.charCodeAt(0))>>>0;
  const score=8+Number(f.stress||0)*.2+Number(f.traits?.ambition||.5)*10+Number(f.traits?.sociability||.5)*8;
  const northSports=origin.id==='city'&&f.citizenshipCountryId===COUNTRY_IDS.hansdrex&&regionalJourneyBudget(f,'north',{priceLevel:raw().centralBank?.priceLevel}).affordable;
  const destination=destinations[hash%destinations.length];
  if(!northSports||destination.id!=='north')add(origin.locationId,`regional holiday to ${destination.id}`,score);
  if(northSports&&hash%4!==0)add(origin.locationId,'regional holiday to north',score+24);

 }
 return{init,book,request,handleResident,addChoices,tick,snapshot,runwayAvailable};
}
