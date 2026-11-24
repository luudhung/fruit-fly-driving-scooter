import {airportTerminalForStand} from './airport-campus.mjs';
import {visitorDepartureCompleteAt,visitorBoardingPose,visitorFlightDuration,visitorRunwayTiming,visitorTouchdownSeconds,visitorStandReleaseSeconds} from './visitor-aviation.mjs';
import {BUILDINGS,LOCATIONS,clearSegment,entrance,pedestrianRoute,vehicleRoute} from './city-map.mjs';
import {trafficActors,reserveRoadParking} from './vehicle-parking.mjs';
import {createVehicleIndex,signalBarrier} from './traffic.mjs';
import {BORDER_CHECKPOINTS,COUNTRY_IDS,countryAt} from './country-map.mjs';
import {airportById} from './aviation.mjs';
import {chargeHansdrexFare,HANSDREX_AIRLINE} from './hansdrex-airline.mjs';
import {NORTH_F1_CIRCUIT,NORTH_F1_CHARTER_STANDS,NORTH_F1_AIRPORT_FOOTBRIDGE} from './north-f1-map.mjs';
import {INBOUND_SECONDS,OUTBOUND_SECONDS,visitorArrivalPath,visitorArrivalCompleteAt,visitorStairsClearAt,visitorArrivalPose,visitorArrivalMotion,visitorBoardingMotion,visitorAircraftPose,visitorRunwayReservation,visitorRunwaySlot,visitorStandReservation,visitorStandReleaseAt,legacyVisitorStand,VISITOR_TOUCHDOWN_SECONDS,resolveVisitorTaxiStand} from './visitor-aviation.mjs';

const DAY=86400,HOUR=3600;
const HANS=COUNTRY_IDS.hansdrex,NORTH=COUNTRY_IDS.north;
const airportPoint=id=>({...airportById(id).gate,id:airportById(id).locationId});
const cityStands=[{id:'CITY-GP-1',x:-155,z:-443},{id:'CITY-GP-2',x:-128,z:-443}];
const spots=['tower-observation','park','riverside-cafe','rooftop','riverside-market'];
const sectors=['west','north','east'];
const carrier={carrierId:HANSDREX_AIRLINE.id,carrierName:HANSDREX_AIRLINE.name,oneWayFare:HANSDREX_AIRLINE.oneWayFare};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Keep the current mode and its prediction window together at walk/car boundaries. */
export function f1VisitorTravel(event,guest,at){
 const leg=guest.leg,route=leg?(event.tourPaths?.[leg.key]||[]):[];
 if(!leg)return {traveling:Boolean(guest.motion),transitMode:guest.motion?.mode||'walk',motion:guest.motion||null,routeWaypoints:[],routeIndex:0};
 const transitMode=route[leg.index]?.mode==='car'?'car':'walk',points=[];
 for(let i=leg.index;i<route.length&&points.length<8;i++){
  if((route[i].mode==='car'?'car':'walk')!==transitMode)break;
  points.push(route[i]);
 }
 return {traveling:true,transitMode,motion:{at,speed:transitMode==='car'?11:2.8,mode:transitMode,blocked:Boolean(leg.blocked),points},routeWaypoints:route.slice(leg.index),routeIndex:0};
}

export function createF1Charters({world,signature,admit,intercept,weatherClosed,movementBlocked,account,bookHotel,releaseHotel,visitAttraction,attend,onVehicleCollision,eventKey='northF1',eventVenue=null,foreignDemand=null,teamPlayers=0}){
 const now=()=>Number(world().simulationAgeSeconds||0);
 const scale=()=>Number(world().timeScale||120);
 const ports=['city','north'].map(airportById);
 const byLocation=id=>ports.some(p=>p.locationId===id)
  ?airportPoint(ports.find(p=>p.locationId===id).id)
  :(()=>{const l=LOCATIONS.find(p=>p.id===id)||BUILDINGS.find(p=>p.id===id);return l?{...entrance(l),id}:null;})();
 const spectator=eventVenue||NORTH_F1_CIRCUIT.spectator;
 const stats=()=>world()[eventKey];
 function charge(f,price,to){
  const reserve=f.legacyAirlineContract||f.returnFarePaid?0:200;
  if(Number(f.money||0)<price+reserve)return false;
  const paid=price;
  if(!paid)return true;
  f.money-=paid;f.expensesLifetime=Number(f.expensesLifetime||0)+paid;
  to.cash=Number(to.cash||0)+paid;world().totalTransactions=Number(world().totalTransactions||0)+1;
 }
 function groundPath(f,a,b){
  const assess=(path)=>{
   if(!path.length)return false;
   let from=a;
   for(const point of path){
    if(countryAt(from)!==countryAt(point)&&intercept?.(f,from,point,{mode:point.mode==='car'?'car':'walk',commit:false})?.allowed===false)return false;
    from=point;
   }
   return distance(from,b)<4;
  };
  if((a.id===spectator.id&&b.id==='north-airport')||(a.id==='north-airport'&&b.id===spectator.id)){
   const route=[
    {...spectator,y:1.1},{x:-592,z:-944,y:1.1},
    ...NORTH_F1_AIRPORT_FOOTBRIDGE.toReversed(),
    {x:-906,z:-908,y:1.1},{x:-886,z:-908,y:1.1},
    {...airportPoint('north'),y:1.1},
   ].map(p=>({...p,mode:'walk'}));
   if(a.id==='north-airport')route.reverse();
   return route;
  }
  // Most arriving fans use walkable routes; a bounded minority hire cars.
  // The old shared path silently created a car for every one of 200 guests.
  const hire=!f.vehicleRecovery&&(f.rentalCar||signature(f.id+'rental-car')<.12);
  const origin=hire?(f.parkedCar||(f.traveling&&f.transitMode==='car'?{x:f.x,z:f.z,heading:Number(f.vehicleHeading??Math.atan2(f.vx||0,f.vz||0))}:reserveRoadParking(world(),f,a))):null;
  if(origin)f.parkedCar=origin;
  f.destinationParking=hire?reserveRoadParking(world(),f,b):null;
  const drive=origin&&f.destinationParking?vehicleRoute(a,b,'car',origin,f.destinationParking):[];
  if(drive.some(p=>p.mode==='car')&&assess(drive)){f.rentalCar=true;return drive;}
  f.destinationParking=null;
  if(countryAt(a)===countryAt(b)){
   const walk=pedestrianRoute(a,b);
   if(assess(walk))return walk;
   return null;
  }
  // The pedestrian crossing must begin and end on the designated sidewalks.
  const bridges=BORDER_CHECKPOINTS.filter(p=>!p.motorway).sort((x,y)=>distance(a,x.bounds)+distance(b,x.bounds)-distance(a,y.bounds)-distance(b,y.bounds));
  for(const bridge of bridges){
   const side=bridge.walkDirections[countryAt(b)];if(!side)continue;
   const {queuePoint,admissionPoint}=side;
   const before=pedestrianRoute(a,queuePoint),after=pedestrianRoute(admissionPoint,b);
   if(!before.length||!after.length||!clearSegment(queuePoint,admissionPoint))continue;
   const walk=[...before,{...admissionPoint,mode:'walk'},...after];
   if(assess(walk))return walk;
  }
  return null;
 }
 function makeRoute(e,f,destination,fromPoint=null){
  const key=f.id+'|'+f.currentLocationId+'>'+destination;
  const paths=e.tourPaths||={};
  // Each car has its own origin/arrival reservation. Reusing a route for all
  // 200 spectators used to send their vehicles onto the identical curb point.
  if(f.currentLocationId===destination)return null;
  const from=fromPoint||byLocation(f.currentLocationId),to=byLocation(destination);
  if(!from||!to)return null;
  const path=groundPath(f,from,to);
  if(!path)return null;
  paths[key]=path.map(p=>({x:p.x,z:p.z,y:p.y??1.1,mode:p.mode==='car'?'car':'walk',...(p.stage?{stage:p.stage}:{}),...(p.spaceId?{spaceId:p.spaceId,heading:p.heading}: {})}));
  return key;
 }
 function begin(e,f,destination,fromPoint=null){
  if(!destination||f.currentLocationId===destination)return false;
  const key=makeRoute(e,f,destination,fromPoint);
  if(!key){f.retryAt=now()+600;return false;}
  f.leg={key,destination,index:0,at:now(),parkingVersion:1};if(f.parkedCar)f.vehicleHeading=f.parkedCar.heading;f.transitMode=e.tourPaths[key][0]?.mode||'walk';f.traveling=true;f.motion=null;f.action='travelling to '+destination;return true;
 }
 let headway=null;
 function move(e,f){
  if(f.leg.needsRecoveryRoute){
   const destination=f.leg.destination,key=makeRoute(e,f,destination,{x:f.x,z:f.z,y:f.y??1.1});
   if(!key){f.leg.blocked=true;return;}
   f.leg={key,destination,index:0,at:now(),parkingVersion:1};f.traveling=true;
  }
  if(!f.leg.parkingVersion&&e.tourPaths[f.leg.key]?.some(p=>p.mode==='car')&&now()>=Number(f.leg.parkingRetryAt||0)){
   if(f.transitMode==='car')f.rentalCar=true;
   const destination=f.leg.destination,key=makeRoute(e,f,destination,{x:f.x,z:f.z,y:f.y??1.1});
   if(key)f.leg={key,destination,index:0,at:f.leg.at,parkingVersion:1};
   else f.leg.parkingRetryAt=now()+600; // keep draining the existing legal route while a curb reservation is unavailable
  }
  const leg=f.leg,route=e.tourPaths[leg.key];
  let left=Math.min(1200,Math.max(0,now()-leg.at))/scale();
  leg.at=now();
  leg.blocked=false;f.vx=f.vz=0;
  for(let i=0;i<30&&left>0&&leg.index<route.length;i++){
   const p=route[leg.index],d=distance(f,p);
   if(d<.015){if(p.stage==='parking'){f.parkedCar=f.destinationParking;f.destinationParking=null;}leg.index++;continue;}
   const speed=p.mode==='car'?11*(.55+.45*Number(f.vehicleCondition??100)/100):2.8;let step=Math.min(d,left*speed);
   f.targetX=p.x;f.targetZ=p.z;f.transitMode=p.mode;
   if(p.mode==='car'){
    const parkingManoeuvre=p.stage==='parking'||f.parkedCar&&distance(f,f.parkedCar)<5.5;
    f.vehicleHeading=parkingManoeuvre?Number((p.stage==='parking'?f.vehicleHeading:f.parkedCar?.heading)??Math.atan2(p.x-f.x,p.z-f.z)):Math.atan2(p.x-f.x,p.z-f.z);
   }
   if(p.mode==='car'){
    if(now()<Number(f.trafficHoldUntil||0)){leg.blocked=true;return;}
    const end={x:f.x+(p.x-f.x)*step/d,z:f.z+(p.z-f.z)*step/d};
    const light=signalBarrier(f,end,now()/scale());if(light)step=Math.min(step,light.distance);
    const allowed=headway?.(f,{x:f.x+(p.x-f.x)*step/d,z:f.z+(p.z-f.z)*step/d});
    if(allowed!==undefined&&allowed<step){step=allowed;leg.blocked=true;}
   }
   const next={x:f.x+(p.x-f.x)*step/d,z:f.z+(p.z-f.z)*step/d,y:p.y};
   f.transitMode=p.mode;
   if(movementBlocked?.(f,next,p.mode==='car'?1:.25)){leg.blocked=true;return;}
   if(countryAt(f)!==countryAt(next)&&intercept?.(f,f,next,{mode:p.mode})?.allowed===false){leg.blocked=true;return;}
   f.vx=step>.001?(p.x-f.x)/d*speed:0;f.vz=step>.001?(p.z-f.z)/d*speed:0;
   Object.assign(f,next);left-=step/speed;
   if(step>=d-.01){if(p.stage==='parking'){f.parkedCar=f.destinationParking;f.destinationParking=null;}leg.index++;}
   if(step<.001){leg.blocked=true;return;}
  }
  if(leg.index>=route.length){
   f.currentLocationId=leg.destination;f.leg=null;f.traveling=false;f.transitMode='walk';f.vx=f.vz=0;
  }else f.transitMode=route[leg.index]?.mode||'walk';
 }
 function traffic(e,id,except){
  const city=world().cityVisitors?.airportTraffic?.flights||[];
  const events=[...(world().northF1?.previousTours||[]),world().northF1?.event,...(world().worldCup?.previousTours||[]),world().worldCup?.event,e].filter(Boolean);
  const planes=[...new Set(events)].flatMap(event=>(event.charters||[]).flatMap(f=>[f,...(f.returnLeg?[f.returnLeg]:[])]));
  return [...city,...planes].filter(f=>f!==except&&(f.airportId||'city')===id&&!f.aircraftGone&&Number.isFinite(f.inboundAt));
 }
 function schedule(e,flight,earliest,stay=1800){
  const others=traffic(e,flight.airportId,flight);
  for(let tries=0;tries<40;tries++){
   const reservation=visitorStandReservation(earliest,others,flight.airportId,stay,{...flight,motionVersion:2});
   if(!reservation)return false;
   const candidate={...flight,motionVersion:2,standId:reservation.stand.id,arrivalStand:reservation.stand,terminalId:flight.airportId==='city'?airportTerminalForStand(reservation.stand).id:undefined,runwayId:reservation.runwayId,
    inboundAt:reservation.at,parkedAt:reservation.at+reservation.duration};
   const path=visitorArrivalPath(candidate,Math.max(0,(flight.guests?.length||10)-1),scale());
   const ground=candidate.kind==='positioning'?visitorDepartureCompleteAt({...candidate,boardingStartedAt:candidate.parkedAt},flight.guests?.length||10,scale())-candidate.parkedAt+780:Math.max(1200,visitorStairsClearAt(candidate,flight.guests?.length||10,scale())-candidate.parkedAt+120);
   outbound(e,candidate,candidate.parkedAt+ground);
   const actualStay=candidate.standReleasedAt-candidate.parkedAt;
   if(actualStay>stay){stay=actualStay;continue;}
   Object.assign(flight,candidate);return true;
  }
  return false;
 }
 function migrate(e){
  if(e.tenPassengerVersion){routeFutureVisitors(e);return;}
  e.tenPassengerVersion=1;
  const flights=[];
  for(const flight of e.charters||[]){
   if(flight.guests.length<=10||flight.landed||Number(flight.parkedAt)<=now()){
    if(!flight.arrivalStand)flight.arrivalStand=legacyVisitorStand(flight)||undefined;
    for(const guest of flight.guests)if(guest.phase!=='inbound')guest.legacyAirlineContract=true;
    flights.push(flight);continue;
   }
   for(let i=0;i<flight.guests.length;i+=10){
    const guests=flight.guests.slice(i,i+10),copy={...flight,id:flight.id+'-BATCH-'+(i/10+1),guests,arrivingGuests:guests.length,
     tenPassengerTour:true,earliestAt:Math.max(now()+60,Number(flight.inboundAt)||now()+60),inboundAt:null,parkedAt:null,outboundAt:null,exitAt:null,landed:false};
    for(const guest of guests){guest.money=Math.max(750,guest.money);guest.initialCash=guest.money;guest.leaveRaceAt??=e.endsAt;guest.touringUntil??=e.endsAt;guest.nights??=0;guest.visitorReservedBudget=330;}
    delete copy.arrivalStand;delete copy.expectedStandReleaseAt;flights.push(copy);
   }
  }
  e.charters=flights;
  routeFutureVisitors(e);
 }
 function routeFutureVisitors(e){
  if(e.airportItineraryVersion)return;
  for(const flight of e.charters||[]){
   if(flight.landed||flight.departed||Number.isFinite(flight.inboundAt)&&flight.inboundAt<=now()||flight.guests.some(f=>f.phase!=='inbound'||f.immigrationClearedAt!=null))continue;
   const airport=flight.guests.every(f=>!f.nights)?'north':'city';
   if(flight.airportId===airport)continue;
   Object.assign(flight,{airportId:airport,inboundAt:null,parkedAt:null,outboundAt:null,exitAt:null,earliestAt:Math.max(now()+60,Number(flight.earliestAt)||now()+60)});
   for(const key of ['standId','arrivalStand','runwayId','disembarkAt','standReleasedAt','expectedStandReleaseAt','tookOff','aircraftGone'])delete flight[key];
   for(const f of flight.guests)f.entryAirportId=airport;
  }
  e.airportItineraryVersion=1;
 }
 function make(e){
  if(e.charterPlanned){migrate(e);return;}
  e.charterPlanned=true;e.tenPassengerVersion=1;e.airportItineraryVersion=1;
  e.charterDemand=foreignDemand??400+Math.min(10,Math.floor(signature(e.id+'crowd')*11))*20;
  const count=Math.ceil((e.charterDemand+teamPlayers)/10),shortCount=foreignDemand===null?Math.max(1,Math.round(count*.25)):0;
  for(let i=0;i<count;i++){
   const short=i>=count-shortCount,airport=short?'north':'city',id=e.id+'-TOUR-'+(i+1);
   const day=Math.floor(e.startsAt/DAY)*DAY;
   const earliest=short?e.startsAt-(28+signature(id+'hour')*2)*HOUR:e.startsAt-(60+signature(id+'hour')*10)*HOUR;
   const flight={...carrier,id,airportId:airport,sector:sectors[Math.floor(signature(id)*3)],direction:signature(id+'wind')<.5?-1:1,
    earliestAt:Math.max(now()+60,earliest),inboundAt:null,parkedAt:null,arrivingGuests:10,kind:'passenger',guests:[],
    outboundAt:null,exitAt:null,landed:false};
   for(let n=0;n<10;n++){
    const uid=id+'-'+(n+1),temperament=signature(uid+'stay'),long=!short;
    const budget=long?1450+Math.round(signature(uid+'wallet')*550):750+Math.round(signature(uid+'wallet')*190);
    flight.guests.push({id:uid,name:(eventKey==='worldCup'?'World Cup guest ':'Grand Prix visitor ')+(i*10+n+1),kind:'visitor',eventRole:i*10+n>=e.charterDemand?'football-player':'spectator',alive:true,ageYears:i*10+n>=e.charterDemand?20+Math.floor(signature(uid+'age')*16):18+Math.floor(signature(uid+'age')*65),
     entryAirportId:airport,citizenshipCountryId:'outside',originCountryId:'outside',money:budget,savings:0,initialCash:budget,phase:'inbound',
     nights:long?2+Math.floor(temperament*2):0,visitorReservedBudget:330,attractionOffset:Math.floor(signature(uid+'interests')*spots.length),
     touringUntil:long?e.startsAt+HOUR*(32+Math.floor(temperament*10)):e.startsAt+16*HOUR,leaveRaceAt:long?e.endsAt:e.startsAt+16*HOUR});
   }
   e.charters.push(flight);
  }
  for(const flight of [...e.charters].sort((a,b)=>a.earliestAt-b.earliestAt))schedule(e,flight,flight.earliestAt);
 }
 function hospitalityStop(f){
  const hotel=world().cityVisitors?.hotels?.[f.hotelId];
  if(hotel?.rooms?.[f.id])hotel.rooms[f.id].checkedIn=true;
 }
 function atSite(f,id){return f.currentLocationId===id;}
 function visit(e,f,flight){
  if(f.phase==='inbound'){
   if(!Number.isFinite(f.terminalAt)||now()<f.terminalAt)return;
   const port=airportById(flight.airportId);
   if(admit?.(f,{airportId:port.id,flightId:flight.id,toCountryId:port.countryId})?.allowed===false){f.phase='denied';return;}
   if(!f.legacyAirlineContract&&!chargeHansdrexFare(world(),f,'inbound',{reference:flight.id})){f.action='waiting for airline ticket payment';return;}
   Object.assign(f,port.gate,{phase:'visiting',y:1.1,currentLocationId:port.locationId,traveling:false,motion:null,arrivedAt:now()});
   const totals=stats();
   totals.charterArrivals++;totals.externalInflow+=f.initialCash;
   f.immigrationClearedAt=now();f.visitorReservedBudget=Math.max(200,Number(f.visitorReservedBudget||0));
   if(f.nights>0){
    f.departAt=f.touringUntil+20*HOUR;f.visitorReservedBudget=330;
    bookHotel?.(f,f.nights);
    if(!f.hotelId)f.nights=0;
    else totals.hotelBookings=Number(totals.hotelBookings||0)+1;
   }
  }
  if(f.phase!=='visiting')return;
  if(f.hansTowerTrip||f.heliPassenger){visitAttraction?.(f,null,{hour:Math.floor(now()%DAY/HOUR)});return;}
  // An obsolete sightseeing route must not own the guest forever after their
  // booked stay ends. Replan from the actual position, retaining visa and fare.
  const exit=airportById(flight.airportId).locationId;
  if(f.leg&&f.leg.destination!==exit&&now()>=Number(f.departAt??f.touringUntil??e.endsAt)&&now()>=Number(f.returnRouteRetryAt||0)){
   f.returnRouteRetryAt=now()+600;
   begin(e,f,exit,{x:f.x,z:f.z,y:f.y??1.1});
  }
  if(f.leg&&!f.rentalCar&&!f.watched&&f.leg.destination!==spectator.id&&now()>=e.startsAt-36*HOUR&&now()<Math.min(e.endsAt,f.leaveRaceAt)&&e.status!=='cancelled')
   begin(e,f,spectator.id,{x:f.x,z:f.z,y:f.y??1.1});
  if(f.leg?.blocked&&f.rentalCar){
   f.leg.blockedSince??=now();
   if(now()-f.leg.blockedSince>=2*HOUR&&Number(f.money||0)>=235){
    // A paid rental recovery ends a genuine long road deadlock. The guest
    // walks from the actual roadside position; no jump to the destination.
    const destination=f.leg.destination;f.rentalCar=false;
    const key=makeRoute(e,f,destination,{x:f.x,z:f.z,y:f.y??1.1});
    if(key){charge(f,35,account('vehicle-showroom'));f.leg={key,destination,index:0,at:now(),parkingVersion:1};f.parkedCar=null;f.destinationParking=null;f.rentalRecoveredAt=now();stats().rentalRecoveries=Number(stats().rentalRecoveries||0)+1;}
    else f.rentalCar=true;
   }
  }else if(f.leg)delete f.leg.blockedSince;
  if(f.leg){move(e,f);if(f.leg)return;}
  if(now()<Number(f.retryAt||0))return;
  const endPort=airportById(flight.airportId).locationId;
  if(atSite(f,f.hotelId))hospitalityStop(f);
  if(atSite(f,spectator.id)){
   if(!f.watched&&now()>=e.startsAt-5*HOUR&&now()<Math.min(e.endsAt,f.leaveRaceAt)&&e.status!=='cancelled'){
    f.watched=attend(f,e)||f.lastNorthF1Ticket===e.id;
   }
   if(now()<Math.min(e.endsAt,f.leaveRaceAt)&&e.status!=='cancelled')return;
  }
  const raceTripAt=f.nights?e.startsAt-36*HOUR:f.terminalAt;
  if(!f.watched&&e.status!=='cancelled'&&now()>=raceTripAt&&now()<Math.min(e.endsAt,f.leaveRaceAt)){
   if(!atSite(f,spectator.id))begin(e,f,spectator.id);return;
  }
  if(f.nights&&now()<f.touringUntil){
   if(!f.checkedIn&&f.hotelId){
    if(!atSite(f,f.hotelId)){begin(e,f,f.hotelId);return;}
    f.checkedIn=true;f.nextSightAt=now()+HOUR;
   }
   if(now()<Number(f.nextSightAt||0))return;
   const count=Number(f.sights||0),site=spots[(f.attractionOffset+count)%spots.length];
   if(atSite(f,site)){
    const paid=visitAttraction?.(f,site,{hour:Math.floor(now()%DAY/HOUR)});
    if(paid&&(f.hansTowerTrip||f.heliPassenger))return;
    f.sights=count+1;f.nextSightAt=now()+2*HOUR;
    if(!paid)charge(f,12,account('city-tourism'));
    stats().hansdrexSightVisits=Number(stats().hansdrexSightVisits||0)+1;
   }else if(byLocation(site))begin(e,f,site);
   else {f.sights=count+1;f.nextSightAt=now()+600;}
   return;
  }
  if(!atSite(f,endPort)){begin(e,f,endPort);return;}
  f.rentalCar=false;f.parkedCar=null;f.destinationParking=null;
  f.phase='airport-ready';f.action='waiting for the Hansdrex Airline return flight';releaseHotel?.(f);
 }
 function outbound(e,plane,earliest){
  const at=visitorRunwaySlot(earliest,visitorFlightDuration(plane,true),traffic(e,plane.airportId,plane),plane.airportId,plane.runwayId,plane.motionVersion>=1?visitorRunwayTiming(plane,true):null);
  plane.outboundAt=at;plane.exitAt=at+visitorFlightDuration(plane,true);
  plane.expectedStandReleaseAt=plane.standReleasedAt=at+visitorStandReleaseSeconds(plane);
 }
 function stepPlane(e,plane){
  if(plane.aircraftGone||!Number.isFinite(plane.parkedAt))return;
  const previous=Number(plane.lastAirfieldAt??Math.min(now(),plane.inboundAt));plane.lastAirfieldAt=now();
  if(!plane.landed&&!Number.isFinite(plane.touchdownAt)&&now()>=plane.inboundAt&&previous<plane.inboundAt+visitorTouchdownSeconds(plane)&&weatherClosed()){
   const pose=visitorAircraftPose(Math.max(plane.inboundAt,previous),plane);
   if(pose)plane.hold={...pose,at:now()};
   schedule(e,plane,now()+900,plane.kind==='positioning'?8*HOUR:1800);return;
  }
  if(!plane.landed&&now()>=plane.inboundAt+visitorTouchdownSeconds(plane))plane.touchdownAt??=plane.inboundAt+visitorTouchdownSeconds(plane);
  if(resolveVisitorTaxiStand(plane,traffic(e,plane.airportId,plane),now())&&plane.outboundAt!=null)outbound(e,plane,Math.max(plane.outboundAt,plane.parkedAt+1200));
  if(!plane.landed&&!plane.taxiHold&&now()>=plane.parkedAt)plane.landed=true;
  if(plane.outboundAt!=null&&now()>=plane.outboundAt&&!plane.tookOff){
   if(weatherClosed())outbound(e,plane,now()+900);else plane.tookOff=true;
  }
  if(plane.tookOff&&now()>=plane.exitAt)plane.aircraftGone=true;
 }
 function boardingPose(plane,index){return visitorBoardingPose(now(),plane,index,scale());}

 function tick(e){
  migrate(e);
  headway=createVehicleIndex(trafficActors(world()),onVehicleCollision);
  for(const flight of e.charters){
   if(e.format!==2&&!flight.tenPassengerTour)continue;
   if(flight.departed)continue;
   if(!Number.isFinite(flight.parkedAt))schedule(e,flight,Math.max(now()+60,flight.earliestAt||now()+60));
   if(!Number.isFinite(flight.parkedAt))continue;
   stepPlane(e,flight);
   for(const [index,f] of flight.guests.entries()){
    if(f.phase==='inbound'){
     if(!flight.landed&&now()>=flight.parkedAt)continue;
     const pose=visitorArrivalPose(now(),flight,index,scale());
     if(!pose)continue;
     Object.assign(f,{x:pose.x,y:pose.y,z:pose.z,onPlane:pose.onPlane,indoors:pose.indoors,
      action:pose.phase==='inbound'?'flying to the Grand Prix':pose.phase==='disembarking'?'walking down the aircraft stairs':pose.phase==='immigration'?'clearing airport immigration':'walking across the airport apron'});
     const arrivalPath=visitorArrivalPath(flight,index,scale());
     f.terminalAt=arrivalPath.at(-1).at;
     f.motion=visitorArrivalMotion(now(),flight,index,scale());
     if(pose.phase!=='complete')continue;
    }
    visit(e,f,flight);
   }
   // Empty arriving equipment leaves promptly; its passengers keep their own
   // durable ground itineraries instead of reserving the stand for their holiday.
   if(flight.landed&&flight.outboundAt==null){
    const stairsClear=visitorStairsClearAt(flight,flight.guests.length,scale())||flight.parkedAt+900;
    outbound(e,flight,Math.max(flight.parkedAt+1200,stairsClear+120));
   }
   const waiting=flight.guests.filter(f=>f.phase==='airport-ready');
   if(waiting.length)flight.returnReadyAt??=now();else delete flight.returnReadyAt;
   const ready=flight.guests.every(f=>['airport-ready','denied','departed','cancelled'].includes(f.phase));
   // A stranded or late holidaymaker cannot hold every other passenger forever.
   // Depart after a bounded boarding wait; missing people retain their own trip.
   if(waiting.length&&!flight.returnLeg&&(ready||now()-flight.returnReadyAt>=HOUR)){
    const returnNumber=Number(flight.completedReturnFlights||0)+1;
    const plane={...carrier,id:flight.id+'-RETURN'+(returnNumber>1?'-'+returnNumber:''),airportId:flight.airportId,kind:'positioning',arrivingGuests:0,sector:flight.sector,
     direction:flight.direction,earliestAt:now()+120,inboundAt:null,parkedAt:null,outboundAt:null,exitAt:null};
    if(schedule(e,plane,plane.earliestAt,8*HOUR))flight.returnLeg=plane;
   }
   const plane=flight.returnLeg;if(!plane)continue;
   if(!Number.isFinite(plane.parkedAt))schedule(e,plane,Math.max(now()+60,plane.earliestAt||now()+60),8*HOUR);
   stepPlane(e,plane);
   if(plane.landed&&plane.boardingStartedAt==null){
    plane.boardingStartedAt=now();
    plane.boardingGuestIds=flight.guests.filter(f=>f.phase==='airport-ready').map(f=>f.id);
    const duration=visitorDepartureCompleteAt(plane,plane.boardingGuestIds.length,scale())-now();
    if(plane.outboundAt==null||plane.outboundAt<now()+duration+600)outbound(e,plane,now()+duration+600);
    plane.boardAt=now()+duration;plane.passengerIds=[];
   }
   if(plane.boardingStartedAt!=null&&!plane.boardingGuestIds)plane.boardingGuestIds=flight.guests.filter(f=>['airport-ready','boarding','return-flight'].includes(f.phase)).map(f=>f.id);
   if(plane.boardingStartedAt!=null)for(const [index,id] of plane.boardingGuestIds.entries()){
    const f=flight.guests.find(f=>f.id===id);if(!f)continue;
    if(!['airport-ready','boarding','return-flight'].includes(f.phase))continue;
    const pose=boardingPose(plane,index);if(!pose)continue;
    if(pose.onPlane&&!f.legacyAirlineContract&&!chargeHansdrexFare(world(),f,'outbound',{reference:plane.id})){
     f.phase='stranded';f.onPlane=false;f.motion=null;f.action='waiting at the terminal: return ticket funds unavailable';continue;
    }
    Object.assign(f,pose,{indoors:pose.onPlane,traveling:false,motion:pose.onPlane?null:visitorBoardingMotion(now(),plane,index,scale()),action:pose.onPlane?'flying home with Hansdrex Airline':'walking through the terminal to board Hansdrex Airline'});
    f.phase=pose.onPlane?'return-flight':'boarding';
    if(pose.onPlane&&!plane.passengerIds.includes(f.id)){
     plane.passengerIds.push(f.id);
    }
   }
   if(plane.aircraftGone){
    const totals=stats();
    for(const f of flight.guests){
     if(!plane.passengerIds?.includes(f.id)||f.phase!=='return-flight')continue;
     totals.charterDepartures++;totals.externalOutflow+=f.money+f.savings;
     f.phase='departed';f.departedAt=now();f.money=f.savings=0;f.onPlane=false;
    }
    flight.departed=flight.guests.every(f=>['departed','denied','cancelled'].includes(f.phase));
    if(!flight.departed){flight.completedReturnFlights=Number(flight.completedReturnFlights||0)+1;flight.returnLeg=null;delete flight.returnReadyAt;}
   }
  }
 }
 return {make,tick,migrate};
}
