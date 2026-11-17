import {BUILDINGS,LOCATIONS,clearSegment,entrance,pedestrianRoute,vehicleRoute} from './city-map.mjs';
import {BORDER_CHECKPOINTS,COUNTRY_IDS,countryAt} from './country-map.mjs';
import {airportById} from './aviation.mjs';
import {chargeHansdrexFare,HANSDREX_AIRLINE} from './hansdrex-airline.mjs';
import {NORTH_F1_CIRCUIT,NORTH_F1_CHARTER_STANDS,NORTH_F1_AIRPORT_FOOTBRIDGE} from './north-f1-map.mjs';
import {INBOUND_SECONDS,OUTBOUND_SECONDS,visitorArrivalPath,visitorArrivalPose,visitorAircraftPose,visitorRunwayReservation,visitorRunwaySlot,visitorStandReservation,visitorStandReleaseAt,legacyVisitorStand} from './visitor-aviation.mjs';

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

export function createF1Charters({world,signature,admit,intercept,weatherClosed,movementBlocked,account,bookHotel,releaseHotel,visitAttraction,attend}){
 const now=()=>Number(world().simulationAgeSeconds||0);
 const scale=()=>Number(world().timeScale||120);
 const ports=['city','north'].map(airportById);
 const byLocation=id=>ports.some(p=>p.locationId===id)
  ?airportPoint(ports.find(p=>p.locationId===id).id)
  :(()=>{const l=LOCATIONS.find(p=>p.id===id)||BUILDINGS.find(p=>p.id===id);return l?{...entrance(l),id}:null;})();
 const {spectator}=NORTH_F1_CIRCUIT;
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
  const drive=vehicleRoute(a,b);
  if(drive.some(p=>p.mode==='car')&&assess(drive))return drive;
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
 function route(e,f,destination){
  const key=f.currentLocationId+'>'+destination;
  const paths=e.tourPaths||={};
  if(paths[key])return key;
  if(f.currentLocationId===destination)return null;
  const from=byLocation(f.currentLocationId),to=byLocation(destination);
  if(!from||!to)return null;
  const path=groundPath(f,from,to);
  if(!path)return null;
  paths[key]=path.map(p=>({x:p.x,z:p.z,y:p.y??1.1,mode:p.mode==='car'?'car':'walk'}));
  return key;
 }
 function begin(e,f,destination){
  if(!destination||f.currentLocationId===destination)return false;
  const key=route(e,f,destination);
  if(!key){f.retryAt=now()+600;return false;}
  f.leg={key,destination,index:0,at:now()};f.transitMode=e.tourPaths[key][0]?.mode||'walk';f.traveling=true;f.motion=null;f.action='travelling to '+destination;return true;
 }
 function move(e,f){
  const leg=f.leg,route=e.tourPaths[leg.key];
  let left=Math.min(1200,Math.max(0,now()-leg.at))/scale();
  leg.at=now();
  leg.blocked=false;f.vx=f.vz=0;
  for(let i=0;i<30&&left>0&&leg.index<route.length;i++){
   const p=route[leg.index],d=distance(f,p);
   if(d<.015){leg.index++;continue;}
   const speed=p.mode==='car'?11:2.8,step=Math.min(d,left*speed);
   const next={x:f.x+(p.x-f.x)*step/d,z:f.z+(p.z-f.z)*step/d,y:p.y};
   f.transitMode=p.mode;
   if(movementBlocked?.(f,next,p.mode==='car'?1:.25)){leg.blocked=true;return;}
   if(countryAt(f)!==countryAt(next)&&intercept?.(f,f,next,{mode:p.mode})?.allowed===false){leg.blocked=true;return;}
   f.vx=(p.x-f.x)/d*speed;f.vz=(p.z-f.z)/d*speed;
   Object.assign(f,next);left-=step/speed;
   if(step>=d-.01)leg.index++;
  }
  if(leg.index>=route.length){
   f.currentLocationId=leg.destination;f.leg=null;f.traveling=false;f.transitMode='walk';f.vx=f.vz=0;
  }else f.transitMode=route[leg.index]?.mode||'walk';
 }
 function traffic(e,id,except){
  const city=world().cityVisitors?.airportTraffic?.flights||[];
  const events=[...(world().northF1?.previousTours||[]),e];
  const planes=events.flatMap(event=>(event.charters||[]).flatMap(f=>[f,...(f.returnLeg?[f.returnLeg]:[])]));
  return [...city,...planes].filter(f=>f!==except&&(f.airportId||'city')===id&&!f.aircraftGone&&Number.isFinite(f.inboundAt));
 }
 function schedule(e,flight,earliest,stay=1800){
  const others=traffic(e,flight.airportId,flight);
  for(let tries=0;tries<40;tries++){
   const reservation=visitorStandReservation(earliest,others,flight.airportId,stay);
   if(!reservation)return false;
   const candidate={...flight,standId:reservation.stand.id,arrivalStand:reservation.stand,runwayId:reservation.runwayId,
    inboundAt:reservation.at,parkedAt:reservation.at+INBOUND_SECONDS};
   const path=visitorArrivalPath(candidate,Math.max(0,(flight.guests?.length||10)-1),scale());
   const ground=candidate.kind==='positioning'?path.at(-1).at-path[0].at+780:Math.max(1200,(path[1]?.at||candidate.parkedAt+900)-candidate.parkedAt+120);
   outbound(e,candidate,candidate.parkedAt+ground);
   const actualStay=candidate.standReleasedAt-candidate.parkedAt;
   if(actualStay>stay){stay=actualStay;continue;}
   Object.assign(flight,candidate);return true;
  }
  return false;
 }
 function migrate(e){
  if(e.tenPassengerVersion)return;
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
 }
 function make(e){
  if(e.charterPlanned){migrate(e);return;}
  e.charterPlanned=true;e.tenPassengerVersion=1;
  e.charterDemand=200+Math.min(10,Math.floor(signature(e.id+'crowd')*11))*10;
  const count=e.charterDemand/10,shortCount=Math.max(1,Math.round(count*.25));
  for(let i=0;i<count;i++){
   const short=i>=count-shortCount,airport=short?'north':i%2?'north':'city',id=e.id+'-TOUR-'+(i+1);
   const day=Math.floor(e.startsAt/DAY)*DAY;
   const earliest=short?e.startsAt-(10+signature(id+'hour')*4)*HOUR:e.startsAt-(44+signature(id+'hour')*23)*HOUR;
   const flight={...carrier,id,airportId:airport,sector:sectors[Math.floor(signature(id)*3)],direction:signature(id+'wind')<.5?-1:1,
    earliestAt:Math.max(now()+60,earliest),inboundAt:null,parkedAt:null,arrivingGuests:10,kind:'passenger',guests:[],
    outboundAt:null,exitAt:null,landed:false};
   for(let n=0;n<10;n++){
    const uid=id+'-'+(n+1),temperament=signature(uid+'stay'),long=!short;
    const budget=long?1450+Math.round(signature(uid+'wallet')*550):750+Math.round(signature(uid+'wallet')*190);
    flight.guests.push({id:uid,name:'Grand Prix visitor '+(i*10+n+1),kind:'visitor',alive:true,ageYears:18+Math.floor(signature(uid+'age')*65),
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
   const stats=world().northF1;
   stats.charterArrivals++;stats.externalInflow+=f.initialCash;
   f.immigrationClearedAt=now();f.visitorReservedBudget=Math.max(200,Number(f.visitorReservedBudget||0));
   if(f.nights>0){
    f.departAt=f.touringUntil+20*HOUR;f.visitorReservedBudget=330;
    bookHotel?.(f,f.nights);
    if(!f.hotelId)f.nights=0;
    else stats.hotelBookings=Number(stats.hotelBookings||0)+1;
   }
  }
  if(f.phase!=='visiting')return;
  if(f.hansTowerTrip||f.heliPassenger){visitAttraction?.(f,null,{hour:Math.floor(now()%DAY/HOUR)});return;}
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
  const raceTripAt=f.nights?e.startsAt-24*HOUR:f.terminalAt;
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
    world().northF1.hansdrexSightVisits=Number(world().northF1.hansdrexSightVisits||0)+1;
   }else if(byLocation(site))begin(e,f,site);
   else {f.sights=count+1;f.nextSightAt=now()+600;}
   return;
  }
  if(!atSite(f,endPort)){begin(e,f,endPort);return;}
  f.phase='airport-ready';f.action='waiting for the Hansdrex Airline return flight';releaseHotel?.(f);
 }
 function outbound(e,plane,earliest){
  const at=visitorRunwaySlot(earliest,OUTBOUND_SECONDS,traffic(e,plane.airportId,plane),plane.airportId,plane.runwayId);
  plane.outboundAt=at;plane.exitAt=at+OUTBOUND_SECONDS;
  plane.expectedStandReleaseAt=plane.standReleasedAt=at+140;
 }
 function stepPlane(e,plane){
  if(plane.aircraftGone||!Number.isFinite(plane.parkedAt))return;
  if(!plane.landed&&now()>=plane.inboundAt+690){
   const conflict=traffic(e,plane.airportId,plane).find(other=>other.landed&&!other.aircraftGone&&
    other.arrivalStand&&plane.arrivalStand&&distance(other.arrivalStand,plane.arrivalStand)<24&&visitorStandReleaseAt(other)>plane.parkedAt);
   if(conflict){
    const pose=visitorAircraftPose(now(),plane);if(pose)plane.hold={...pose,at:now()};
    schedule(e,plane,Math.max(now()+900,visitorStandReleaseAt(conflict)+120-INBOUND_SECONDS),plane.kind==='positioning'?8*HOUR:1800);
    return;
   }
  }
  if(!plane.landed&&now()>=plane.parkedAt){
   if(weatherClosed()){
    if(!schedule(e,plane,now()+900,plane.kind==='positioning'?8*HOUR:1800)){
     plane.inboundAt=null;plane.parkedAt=null;plane.earliestAt=now()+900;
    }
    return;
   }
   plane.landed=true;
  }
  if(plane.outboundAt!=null&&now()>=plane.outboundAt&&!plane.tookOff){
   if(weatherClosed())outbound(e,plane,now()+900);else plane.tookOff=true;
  }
  if(plane.tookOff&&now()>=plane.exitAt)plane.aircraftGone=true;
 }
 function boardingPose(plane,index){
  const path=visitorArrivalPath(plane,index,scale()).toReversed(),first=path[0].at,last=path.at(-1).at;
  const elapsed=now()-plane.boardingStartedAt;
  if(elapsed>=first-last)return {onPlane:true,...visitorAircraftPose(now(),plane)};
  const target=first-elapsed;
  let i=path.findIndex(p=>p.at<=target);i=Math.max(1,i);
  const a=path[i-1],b=path[i],u=Math.min(1,Math.max(0,(a.at-target)/Math.max(1,a.at-b.at)));
  return{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u,onPlane:false};
 }
 function tick(e){
  migrate(e);
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
     f.motion=!pose.onPlane&&pose.phase!=='complete'?{at:now(),speed:1.8,mode:'walk',blocked:pose.phase==='immigration',points:arrivalPath.filter(p=>p.at>now()).slice(0,8).map(p=>({x:p.x,y:p.y,z:p.z}))}:null;
     if(pose.phase!=='complete')continue;
    }
    visit(e,f,flight);
   }
   // Empty arriving equipment leaves promptly; its passengers keep their own
   // durable ground itineraries instead of reserving the stand for their holiday.
   if(flight.landed&&flight.outboundAt==null){
    const stairsClear=visitorArrivalPath(flight,flight.guests.length-1,scale())[1]?.at||flight.parkedAt+900;
    outbound(e,flight,Math.max(flight.parkedAt+1200,stairsClear+120));
   }
   const ready=flight.guests.every(f=>['airport-ready','denied','departed','cancelled'].includes(f.phase));
   if(ready&&!flight.returnLeg&&flight.guests.some(f=>f.phase==='airport-ready')){
    const plane={...carrier,id:flight.id+'-RETURN',airportId:flight.airportId,kind:'positioning',arrivingGuests:0,sector:flight.sector,
     direction:flight.direction,earliestAt:now()+120,inboundAt:null,parkedAt:null,outboundAt:null,exitAt:null};
    if(schedule(e,plane,plane.earliestAt,8*HOUR))flight.returnLeg=plane;
   }
   const plane=flight.returnLeg;if(!plane)continue;
   if(!Number.isFinite(plane.parkedAt))schedule(e,plane,Math.max(now()+60,plane.earliestAt||now()+60),8*HOUR);
   stepPlane(e,plane);
   if(plane.landed&&plane.boardingStartedAt==null){
    plane.boardingStartedAt=now();
    const duration=Math.max(...flight.guests.map((_,i)=>{const p=visitorArrivalPath(plane,i,scale());return p.at(-1).at-p[0].at;}));
    if(plane.outboundAt==null||plane.outboundAt<now()+duration+600)outbound(e,plane,now()+duration+600);
    plane.boardAt=now()+duration;plane.passengerIds=[];
   }
   if(plane.boardingStartedAt!=null)for(const [index,f] of flight.guests.entries()){
    if(!['airport-ready','boarding','return-flight'].includes(f.phase))continue;
    const pose=boardingPose(plane,index);if(!pose)continue;
    if(pose.onPlane&&!f.legacyAirlineContract&&!chargeHansdrexFare(world(),f,'outbound',{reference:plane.id})){
     f.phase='stranded';f.onPlane=false;f.action='waiting at the terminal: return ticket funds unavailable';continue;
    }
    Object.assign(f,pose,{indoors:pose.onPlane,traveling:false,action:pose.onPlane?'flying home with Hansdrex Airline':'walking through the terminal to board Hansdrex Airline'});
    f.phase=pose.onPlane?'return-flight':'boarding';
    if(pose.onPlane&&!plane.passengerIds.includes(f.id)){
     plane.passengerIds.push(f.id);
    }
   }
   if(plane.aircraftGone){
    const stats=world().northF1;
    for(const f of flight.guests){
     if(['return-flight','airport-ready','boarding'].includes(f.phase)){stats.charterDepartures++;stats.externalOutflow+=f.money+f.savings;}
     if(f.phase==='stranded')continue;
     f.phase='departed';f.departedAt=now();f.money=f.savings=0;f.onPlane=false;
    }
    flight.departed=flight.guests.every(f=>['departed','denied','cancelled'].includes(f.phase));
   }
  }
 }
 return {make,tick,migrate};
}
