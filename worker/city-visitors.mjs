import {AIRPORT,LOCATIONS,BUILDINGS,entrance,pedestrianRoute,parkingPoint,clearSegment,onIsland} from './city-map.mjs';
import {motorwaySpeedMultiplier} from './motorway.mjs';
import {COMBINED_CAP} from './population-limits.mjs';
import {signalBarrier,createVehicleIndex} from './traffic.mjs';
import {syncHospitalityHotels,hospitalityAccount,recordHospitalitySale,diningVenues,purchaseHospitalityMeal} from './hospitality-enterprises.mjs';
import {AIRPORT_SECTORS, INBOUND_SECONDS, OUTBOUND_SECONDS, VISITOR_STANDS, VISITOR_TOUCHDOWN_SECONDS, MIN_VISITOR_PASSENGERS, visitorAircraftPose, visitorArrivalPath, visitorArrivalPose, visitorRunwaySlot} from './visitor-aviation.mjs';

const MAX_VISITORS=40,MAX_TAXIS=6,DAY=86400;
const cap=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
const money=f=>Math.max(0,Number(f.money||0))+Math.max(0,Number(f.savings||0));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const location=id=>LOCATIONS.find(l=>l.id===id);
const atAirport=v=>v.currentLocationId==='airport'&&dist(v,AIRPORT.terminal)<40;
const scenery=['bridge-view','park','ferris-wheel','stadium','riverside-park','rooftop'];
function busy(f,now=0){return f.socialTask||f.fireEngineDuty||f.ambulanceDuty||f.onFireEngine||f.onAmbulance||!f.alive||f.sleeping||f.arrested||f.arrestedUntil>now||f.onPlane||f.onTrain||f.heliPassenger||f.airTrip||f.privateFlight||f.onPrivateHelicopter||f.privateHelicopterTrip||f.luxuryTrip||f.civicDuty||f.urbanTask||f.urbanFloodEscape||f.urbanJob||f.emergencyTask||f.sportsSession||f.cityService||f.taxiJobId||f.taxiPassenger||onIsland(f);}

/** Persisted finite visitors, physical taxi trips and compact scene records. No pixel rendering on server. */
export function createCityVisitors({world,random=()=>.5,brainRandom,emit=()=>{},remember=()=>{},startJourney,moveFly,createVisitor,needsAndActivities,payAndFinance,isUnavailable=()=>false,isWorkCommitted=()=>false}){
 const raw=()=>world();
 const now=()=>Number(raw().simulationAgeSeconds||0);
 const level=()=>cap(Number(raw().centralBank?.priceLevel||1),.6,8);
 const rng=()=>{
  const s=data();s.rngState=(Math.imul(s.rngState>>>0,1664525)+1013904223)>>>0;return s.rngState/4294967296;
 };
 function data(){
  const w=raw();return w.cityVisitors||=( {version:1,rngState:487329,visitors:[],departures:[],nextVisitorId:1,nextArrivalAt:now()+1800,
   hotels:{hotel:{id:'hotel',capacity:8,rooms:{}},'riverside-hotel':{id:'riverside-hotel',capacity:8,rooms:{}}},
   taxiJobs:[],nextTaxiId:1,taxiCompleted:0,taxiCancelled:0,taxiRevenue:0,totalArrivals:0,totalDepartures:0,externalInflow:0,externalOutflow:0,
   reputation:55,photos:[],nextPhotoId:1,photoCount:0,club:{nextAt:now()+7200,event:null,completed:0},lastTickAt:now()});
 }
 const residents=()=>raw().flies.filter(f=>f.alive);
 const actors=()=>[...residents(),...data().visitors.filter(v=>v.alive&&!v.departed)];
 const actor=id=>[...raw().flies,...data().visitors].find(f=>f.id===id);
 function business(id){raw().businesses||={};return raw().businesses[id]||=( {cash:0,inventory:999,price:0,sector:'city-services'});}
 function transfer(f,cost,to){
  cost=Math.max(0,Number(cost||0));if(!Number.isFinite(cost)||money(f)+1e-7<cost)return false;
  const cash=Math.min(Math.max(0,Number(f.money||0)),cost);f.money-=cash;f.savings=Math.max(0,Number(f.savings||0))-(cost-cash);to.cash=Number(to.cash||0)+cost;
  f.expensesLifetime=Number(f.expensesLifetime||0)+cost;if(cost)raw().totalTransactions=Number(raw().totalTransactions||0)+1;return true;
 }
 function init(){
  const s=data();business('city-taxi-escrow');business('city-tourism');business('city-media');
  s.hotels||={};s.hotels['marina-bay']||={id:'marina-bay',capacity:24,pricePerNight:28,rooms:{}};
  syncHospitalityHotels(raw(),{isUnavailable});
  for(const id of Object.keys(s.hotels)){business(id);s.hotels[id].rooms||={};}
  s.visitors||=[];s.departures||=[];s.taxiJobs||=[];s.photos||=[];
  s.airportTraffic||={nextFlightId:1,flights:[],landed:0,departed:0};
  for(const flight of s.airportTraffic.flights){
   if(flight.unloaded&&flight.landedAt==null)flight.landedAt=flight.parkedAt;
   flight.kind||=flight.arrivingGuests>0?'passenger':'ferry';
  }
  for(const v of s.visitors){v.kind='visitor';v.taxiPassenger=Boolean(v.taxiPassenger);}
  // Reservations and committed trips resume from stored phases; never recharge in init.
  return s;
 }
 function reserveRoom(v,hotelId,nights){
  const h=data().hotels[hotelId];if(!h||h.closed||!location(hotelId)||isUnavailable(hotelId,v))return false;
  if(h.rooms[v.id])return true;
  if(Object.keys(h.rooms).length>=h.capacity)return false;
  const cost=Math.round(Number(h.pricePerNight||18)*level()*nights*100)/100;
  const enterprise=hospitalityAccount(raw(),hotelId);
  if(!transfer(v,cost,enterprise||business(hotelId)))return false;
  if(enterprise)recordHospitalitySale(raw(),hotelId,cost);
  h.rooms[v.id]={visitorId:v.id,bookedAt:now(),checkoutAt:v.departAt,nights,paid:cost,checkedIn:false};
  v.hotelId=hotelId;v.hotelPaid=cost;v.hotelReserved=true;
  return true;
 }
 function spawnVisitor(options={}){
  const s=data();if(!createVisitor||residents().length+s.visitors.filter(v=>v.alive&&!v.departed).length>=COMBINED_CAP||s.visitors.filter(v=>v.alive&&!v.departed).length>=MAX_VISITORS)return null;
  const available=Object.values(s.hotels).filter(h=>!h.closed&&location(h.id)&&!isUnavailable(h.id)&&Object.keys(h.rooms).length<h.capacity);
  if(!available.length)return null;
  const index=s.nextVisitorId++,id=`VIS-${String(index).padStart(6,'0')}`,name=`Visitor ${index}`;
  const v=options.preparedVisitor||createVisitor(name,index);if(!v?.brain?.id)return null;
  const duration=Number(options.staySeconds||DAY*(3+Math.floor(rng()*3))),budget=Number(options.budget||Math.round((420+rng()*500)*level()));
  Object.assign(v,{id,name,kind:'visitor',alive:true,departed:false,causeOfDeath:null,visitorArrivedAt:now(),departAt:now()+duration,
   money:budget,savings:0,debt:0,jobId:null,jobTitle:'visiting Hansdrex',wage:0,vehicle:null,vehicleLoan:null,ownsHome:false,homeId:'hotel',
   householdId:null,housingUnitId:null,businessId:null,businessEmployeeOf:null,partnerId:null,pregnancyDueAt:null,children:[],parents:[],
   x:AIRPORT.gate.x,y:1.1,z:AIRPORT.gate.z,targetX:AIRPORT.gate.x,targetZ:AIRPORT.gate.z,vx:0,vz:0,
   currentLocationId:'airport',targetLocationId:'airport',traveling:false,indoors:false,onTrain:false,onPlane:false,heliPassenger:false,
   hunger:20,thirst:15,energy:90,health:95,happiness:70,stress:10,loneliness:15,transitMode:'walk',transitStage:null,
   routeWaypoints:[],routeIndex:0,action:'arrived at the city airport',visitorPhase:'arrival',expensesLifetime:0,nextVisitAt:now(),placesVisited:[],photoInterest:rng()>.3});
  const h=available[Math.floor(rng()*available.length)];
  // This cash enters from outside Hansdrex and is accounted as an external inflow.
  if(!reserveRoom(v,h.id,Math.max(1,Math.ceil(duration/DAY))))return null;
  v.homeId=h.id;v.homeX=location(h.id).x;v.homeZ=location(h.id).z;
  s.visitors.push(v);s.externalInflow+=budget;
  v.arrivalFlightId=options.flightId||null;
  if(options.inboundFlight){
   v.visitorPhase='inbound-flight';v.onPlane=true;v.indoors=true;v.currentLocationId=null;v.targetLocationId='airport';
   v.action='flying to Hansdrex on a booked visitor flight';v.airportArrivalIndex=Number(options.arrivalIndex||0);
   v.visitorArrivedAt=null;v.staySeconds=duration;v.departAt=1e15;
   return v;
  }
  completeAirportArrival(v);
  return v;
 }
 function completeAirportArrival(v){
  if(v.immigrationClearedAt!=null)return;
  const s=data();s.totalArrivals++;v.visitorArrivedAt=now();v.immigrationClearedAt=now();
  if(v.staySeconds){v.departAt=now()+v.staySeconds;const room=s.hotels[v.hotelId]?.rooms[v.id];if(room)room.checkoutAt=v.departAt;}
  Object.assign(v,{x:AIRPORT.gate.x,y:1.1,z:AIRPORT.gate.z,visitorPhase:'arrival',currentLocationId:'airport',targetLocationId:'airport',onPlane:false,indoors:false,traveling:false,routeWaypoints:[],vx:0,vz:0,action:'cleared airport immigration'});
  const duration=v.departAt-now(),budget=money(v)+Number(v.hotelPaid||0),h=s.hotels[v.hotelId],id=v.id;
  emit('visitor_arrival',`${v.id} cleared immigration and booked ${Math.ceil(duration/DAY)} days at ${h.id}.`,{visitorId:id,hotelId:h.id,budget,departAt:v.departAt,flightId:v.arrivalFlightId});
  remember(v,'city_arrival',{hotelId:h.id,departure:v.departAt});
 }
 function startWalk(f,destinationId,action){
  const l=location(destinationId);if(!l||isUnavailable(destinationId,f))return false;
  if(startJourney){startJourney(f,{id:destinationId,action});const ok=f.traveling||f.currentLocationId===destinationId;if(ok&&f.kind==='visitor')f.visitorTransitDestination=destinationId;return ok;}
  const route=pedestrianRoute(f,l);if(!route.length)return false;
  setRoute(f,route,destinationId,action);if(f.kind==='visitor')f.visitorTransitDestination=destinationId;return true;
 }
 function setRoute(f,route,id,action){
  f.routeWaypoints=route;f.routeIndex=0;f.targetLocationId=id;f.targetX=route[0]?.x??f.x;f.targetZ=route[0]?.z??f.z;
  f.traveling=route.length>0;f.indoors=false;f.onTrain=false;f.sleeping=false;f.transitMode=route[0]?.mode||'walk';f.action=action;f.pendingAction=action;
  f.travelStartedAt=now();f.travelLastDistance=dist(f,{x:f.targetX,z:f.targetZ});f.travelStuckTicks=0;f.actionUntil=0;
 }
 function taxiCandidates(){
  return residents().filter(f=>!busy(f,now())&&!isWorkCommitted(f)&&f.ageYears>=18&&f.ageYears<76&&String(f.vehicle||'').includes('car')&&f.energy>40&&f.hunger<80&&f.health>50&&!f.traveling&&!f.airTrip)
   .sort((a,b)=>(Number(a.traits?.thrift||0)-Number(b.traits?.thrift||0))||a.id.localeCompare(b.id)).slice(0,MAX_TAXIS);
 }
 function requestTaxi(passenger,destinationId){
  const s=data(),dest=location(destinationId);if(!dest||isUnavailable(destinationId,passenger)||passenger.departed||busy(passenger,now()))return false;
  if(s.taxiJobs.filter(j=>!['complete','cancelled'].includes(j.phase)).length>=MAX_TAXIS)return false;
  const pickup=parkingPoint(passenger),drop=parkingPoint(dest);if(!pickup||!drop||dist(pickup,drop)<30)return false;
  const drivers=taxiCandidates().sort((a,b)=>dist(a,pickup)-dist(b,pickup));
  const driver=drivers.find(d=>pedestrianRoute(d.parkedCar||d,pickup,'car').length);if(!driver)return false;
  const road=pedestrianRoute(pickup,drop,'car'),walk=pedestrianRoute(passenger,pickup);if(!road.length||!walk.length)return false;
  const fare=Math.round((3+dist(pickup,drop)*.025)*level()*100)/100;
  if(money(passenger)<fare+30||!transfer(passenger,fare,business('city-taxi-escrow')))return false;
  const job={id:`TAXI-${s.nextTaxiId++}`,driverId:driver.id,passengerId:passenger.id,destinationId,pickup,drop,fare,phase:'pickup',createdAt:now(),deadline:now()+24*3600,paid:false,rideRoute:road};
  const approach=pedestrianRoute(driver.parkedCar||driver,pickup,'car');
  // An idle owner walks to their own curb-parked car before driving to the pickup.
  const access=driver.indoors?pedestrianRoute(entrance(driver),driver.parkedCar||driver):pedestrianRoute(driver,driver.parkedCar||driver);
  if(!access.length){business('city-taxi-escrow').cash-=fare;passenger.money+=fare;return false;}
  if(driver.indoors){const door=entrance(driver);driver.x=door.x;driver.z=door.z;driver.y=1.1;}
  if(passenger.indoors){const door=entrance(passenger);passenger.x=door.x;passenger.z=door.z;passenger.y=1.1;}
  setRoute(driver,[...access,...approach.map(p=>({...p,mode:'car'}))],passenger.currentLocationId,'collecting a taxi passenger');
  driver.cityService=job.id;driver.taxiDriver=true;driver.roadDuty=false;driver.mobilityShopping=false;
  setRoute(passenger,walk,passenger.currentLocationId,'walking to the taxi pickup');passenger.cityService=job.id;passenger.taxiJobId=job.id;passenger.taxiPassenger=false;
  s.taxiJobs.push(job);emit('taxi_dispatch',`${driver.id} accepted ${passenger.id}'s ride to ${destinationId}.`,{taxiId:job.id,driverId:driver.id,passengerId:passenger.id,fare});
  return job;
 }
 function localMotion(f,gameSeconds,headway){
  if(!f.traveling)return true;
  f.trafficStatus=null;f.trafficHoldUntil=0;f.signalEncounter=null;
  let left=Math.max(0,gameSeconds)/Math.max(1,Number(raw().timeScale||120));
  for(let hop=0;left>1e-6&&hop<48;hop++){
   const p=f.routeWaypoints?.[f.routeIndex];if(!p){f.traveling=false;f.vx=f.vz=0;return true;}
   f.targetX=p.x;f.targetZ=p.z;f.transitMode=p.mode||'walk';const dx=p.x-f.x,dz=p.z-f.z,length=Math.hypot(dx,dz),speed=f.transitMode==='car'?11*motorwaySpeedMultiplier(f):2.5;
   if(length<.05){f.x=p.x;f.z=p.z;f.y=p.y??1.1;f.routeIndex++;continue;}
   const ux=dx/length,uz=dz/length;let step=Math.min(length,left*speed),stop=false;
   if(f.transitMode==='car'){
    const barrier=signalBarrier(f,{x:f.x+ux*step,z:f.z+uz*step},now()/Math.max(1,Number(raw().timeScale||120)));
    if(barrier){step=Math.min(step,barrier.distance);stop=true;f.trafficStatus='waiting at red light';}
    const limit=headway?headway(f,{x:f.x+ux*step,z:f.z+uz*step}):step;if(limit<step){step=limit;stop=true;f.trafficStatus='queuing behind traffic';}
   }
   const next={x:f.x+ux*step,z:f.z+uz*step};if(!clearSegment(f,next)){f.vx=f.vz=0;f.trafficStatus='route temporarily blocked';f.trafficHoldUntil=now()+Math.max(1,gameSeconds);return false;}
   f.vx=next.x-f.x;f.vz=next.z-f.z;f.x=next.x;f.z=next.z;f.y=p.y??1.1;f.motionSpeed=speed;
   if(f.transitMode==='car')f.carPosition={x:f.x,z:f.z};
   f.movementTrace=[...(f.movementTrace||[]),{x:f.x,y:f.y,z:f.z,t:now()+hop*.001}].slice(-8);
   left-=step/speed;if(stop){f.trafficHoldUntil=now()+Math.max(1,gameSeconds);break;}if(step>=length-.001)f.routeIndex++;
  }
  if(f.routeIndex>=f.routeWaypoints.length){f.traveling=false;f.vx=f.vz=0;f.routeWaypoints=[];f.routeIndex=0;return true;}return false;
 }
 function divertedTaxiActor(f){return Boolean(f.socialTask||f.fireEngineDuty||f.ambulanceDuty||f.onFireEngine||f.onAmbulance||f.urbanTask||f.urbanFloodEscape||f.emergencyTask||f.civicDuty||f.privateFlight||f.onPrivateHelicopter||f.sportsSession||f.airTrip||f.onPlane||f.onTrain||f.heliPassenger||f.arrested||f.arrestedUntil>now());}
 function finishTaxi(job,cancel=false,reason=''){
  const s=data();job=job&&s.taxiJobs.find(current=>current.id===job.id);if(!job||['complete','cancelled'].includes(job.phase))return;
  const driver=actor(job.driverId),passenger=actor(job.passengerId),escrow=business('city-taxi-escrow');
  if(!job.paid){
   escrow.cash-=job.fare;
   if(cancel&&passenger)passenger.money=Number(passenger.money||0)+job.fare;
   else if(driver){driver.money=Number(driver.money||0)+job.fare;driver.salaryLifetime=Number(driver.salaryLifetime||0)+job.fare;}
   else business('city-tourism').cash+=job.fare;
   job.paid=true;
   if(!cancel){s.taxiRevenue+=job.fare;raw().totalTransactions=Number(raw().totalTransactions||0)+1;}
  }
  if(driver){
   if(driver.cityService===job.id)driver.cityService=null;driver.taxiDriver=false;
   if(driver.alive&&!divertedTaxiActor(driver)){driver.traveling=false;driver.routeWaypoints=[];driver.action='finished a taxi job';driver.actionUntil=now()+1200;driver.carPosition=null;driver.parkedCar=job.phase==='riding'?job.drop:(parkingPoint(driver)||driver.parkedCar);}
  }
  if(passenger){
   if(passenger.cityService===job.id)passenger.cityService=null;if(passenger.taxiJobId===job.id)passenger.taxiJobId=null;passenger.taxiPassenger=false;
   if(passenger.alive&&!divertedTaxiActor(passenger)){
    passenger.traveling=false;passenger.routeWaypoints=[];passenger.transitMode='walk';passenger.indoors=false;
    // Continue from the actual curb; a rescue/evacuation owns its own route and position.
    startWalk(passenger,job.destinationId,cancel?'continuing after a cancelled taxi':'walking from taxi drop-off');
    if(passenger.kind==='visitor')passenger.visitorTransitDestination=job.destinationId;
   }
  }
  job.phase=cancel?'cancelled':'complete';job.completedAt=now();
  if(cancel)s.taxiCancelled++;else s.taxiCompleted++;
  emit(cancel?'taxi_cancelled':'taxi_completed',`${job.id} ${cancel?'cancelled: '+reason:'dropped off its passenger and settled the fare once'}.`,{taxiId:job.id,reason,fare:job.fare});
 }
 function tickTaxis(dt){
  const active=data().taxiJobs.filter(j=>!['complete','cancelled'].includes(j.phase));
  const index=createVehicleIndex(residents());
  for(const j of active){
   const d=actor(j.driverId),p=actor(j.passengerId);
   if(!d||!p||!d.alive||!p.alive||divertedTaxiActor(d)||divertedTaxiActor(p)||now()>j.deadline){finishTaxi(j,true,!d?'driver unavailable':!p?'passenger unavailable':'pickup or trip timed out');continue;}
   d.cityService=p.cityService=j.id;
   if(j.phase==='pickup'){
    localMotion(d,dt,index);localMotion(p,dt);if(!d.traveling&&dist(d,j.pickup)<1.5)d.parkedCar={...j.pickup};
    if(!d.traveling&&!p.traveling&&dist(d,j.pickup)<1.5&&dist(p,j.pickup)<1.5){
     j.phase='riding';j.boardedAt=now();p.taxiPassenger=true;p.indoors=false;p.traveling=false;p.action='riding in a taxi';
     setRoute(d,j.rideRoute,j.destinationId,'driving a taxi passenger');d.transitMode='car';d.carPosition={x:d.x,z:d.z};
    }
   }else if(j.phase==='riding'){
    localMotion(d,dt,index);Object.assign(p,{x:d.x,y:1.1,z:d.z,vx:d.vx,vz:d.vz,transitMode:'taxi',onTrain:false,traveling:false});
    if(!d.traveling&&dist(d,j.drop)<1.5)finishTaxi(j);
   }
  }
  data().taxiJobs=data().taxiJobs.filter(j=>!['complete','cancelled'].includes(j.phase)||now()-j.completedAt<7200).slice(-24);
 }
 function depart(v){
  if(v.departed||v.ambulanceDuty||v.onAmbulance)return;
  const s=data(),h=s.hotels[v.hotelId];if(h)delete h.rooms[v.id];
  if(v.taxiJobId){const j=s.taxiJobs.find(j=>j.id===v.taxiJobId);if(j)finishTaxi(j,true,'visitor departure');}
  s.externalOutflow+=money(v);s.totalDepartures++;
  const safety=v.health>75?1:-2,value=v.placesVisited.length>=2?2:0,review=cap(2.5+safety*.4+value*.35-v.stress*.012,1,5);
  s.reputation=cap(s.reputation*.96+review*20*.04,10,95);
  s.departures.push({id:v.id,name:v.name,brainId:v.brain.id,arrivedAt:v.visitorArrivedAt,departedAt:now(),review,spending:Math.max(0,Number(v.expensesLifetime||0))});s.departures=s.departures.slice(-64);
  Object.assign(v,{alive:false,departed:true,visitorPhase:'departed',action:'departed Hansdrex by the airport',traveling:false,indoors:true,money:0,savings:0});
  emit('visitor_departure',`${v.id} departed through the airport, rating the visit ${review.toFixed(1)}/5.`,{visitorId:v.id,review,places:v.placesVisited,flightId:v.airportFlightId||null});
  v.onPlane=false;v.airportFlightId=null;
 }
 function travelVisitor(v,id,action){
  const target=location(id),distance=target?dist(v,target):0;
  const fare=(3+distance*.025)*level(),budget=money(v),thrift=Number(v.traits?.thrift??.5);
  const comfort=Number(v.traits?.sociability??v.traits?.sociable??.5)*.12+cap(v.stress,0,100)/400;
  const taxiScore=cap(.58-thrift*.5+comfort+Math.min(.18,distance/3000)-(budget<fare*12?.35:0),.05,.85);
  let draw;
  if(brainRandom)draw=brainRandom(v);
  else {v.transportRngState=(Math.imul(Number(v.transportRngState??(Number(v.id.replace(/\D/g,''))+4817)),1664525)+1013904223)>>>0;draw=v.transportRngState/4294967296;}
  const taxiPreferred=budget>=fare+30&&distance>30&&draw<taxiScore;
  if(taxiPreferred&&requestTaxi(v,id)){
   v.lastTransportDecision={at:now(),destinationId:id,mode:'taxi',fare:Math.round(fare*100)/100,reason:'comfort and affordable fare'};
   remember(v,'transport_choice',v.lastTransportDecision);return;
  }
  startWalk(v,id,action);
  v.lastTransportDecision={at:now(),destinationId:id,mode:v.transitMode||'walk',reason:taxiPreferred?'taxi unavailable; public transport or walking':'saving the budget and using public transport or walking'};
  remember(v,'transport_choice',v.lastTransportDecision);
 }
 function tickVisitor(v,clock,dt){
  if(v.departed||v.ambulanceDuty||v.onAmbulance)return;
  if(v.health<=0)v.alive=false;
  if(!v.alive){
   const s=data(),h=s.hotels[v.hotelId];
   const job=s.taxiJobs.find(j=>j.id===v.taxiJobId);if(job)finishTaxi(job,true,'passenger suffered fatal injuries');
   if(h)delete h.rooms[v.id];
   s.externalOutflow+=money(v);s.visitorFatalities=Number(s.visitorFatalities||0)+1;
   s.departures.push({id:v.id,brainId:v.brain?.id,status:'died during visit',at:now(),cause:v.causeOfDeath||'fatal injuries'});s.departures=s.departures.slice(-64);
   v.money=v.savings=0;v.departed=true;v.visitorPhase='fatality';s.reputation=cap(s.reputation-8,10,95);
   emit('visitor_fatality',`${v.id} died during a visit; the room was released and the estate returned abroad.`,{visitorId:v.id,cause:v.causeOfDeath||'fatal injuries'});return;
  }
  if(v.visitorPhase==='inbound-flight'||v.visitorPhase==='airport-arrival')return;
  if(v.airportFlightId||v.visitorPhase==='airport-wait'&&atAirport(v))return;
  if(v.visitorPhase==='airport-wait')v.visitorPhase='departing';
  const hours=dt/3600;
  v.hunger=cap(v.hunger+hours*3);v.thirst=cap(v.thirst+hours*4);v.energy=cap(v.energy-hours*1.1);v.stress=cap(v.stress+hours*.15);
  if((isUnavailable(v.hotelId,v)||data().hotels[v.hotelId]?.closed)&&v.hotelEvacuatedAt==null){
   v.hotelEvacuatedAt=now();v.departAt=Math.min(v.departAt,now());v.stress=cap(v.stress+12);
   if(v.targetLocationId===v.hotelId){v.traveling=false;v.routeWaypoints=[];v.visitorTransitDestination=null;}
   const job=data().taxiJobs.find(j=>j.id===v.taxiJobId);if(job&&job.destinationId===v.hotelId)finishTaxi(job,true,'hotel closed by an emergency');
   emit('visitor_stay_interrupted',`${v.id} shortened their stay because the booked hotel became unsafe; they are returning through the airport.`,{visitorId:v.id,hotelId:v.hotelId});
  }
  if(v.urbanFloodEscape){
   const e=v.urbanFloodEscape,dx=e.x-v.x,dz=e.z-v.z,length=Math.hypot(dx,dz),step=Math.min(length,dt/Math.max(1,Number(raw().timeScale||120))*1.4);
   if(length>.01){v.x+=dx/length*step;v.z+=dz/length*step;}
   v.action='wading out of flooded streets';v.traveling=false;v.indoors=false;v.sleeping=false;v.vx=v.vz=0;v.routeWaypoints=[];v.visitorTransitDestination=null;
   if(length<=step+.15){v.urbanFloodEscape=null;v.currentLocationId=null;v.nextVisitAt=now();}return;
  }
  // A stay ending takes priority over an unfinished outing. Let an occupied vehicle or
  // current train leg finish safely; cancel an unboarded outing taxi and walk homeward.
  if(now()>=v.departAt&&!v.taxiPassenger&&!v.onTrain){
   const outing=data().taxiJobs.find(j=>j.id===v.taxiJobId&&j.destinationId!=='airport');
   if(outing)finishTaxi(outing,true,'visitor stay ended before pickup');
   if(v.traveling&&v.targetLocationId!=='airport'){
    v.traveling=false;v.routeWaypoints=[];v.visitorTransitDestination=null;v.visitorPhase='departing';
    startWalk(v,'airport','returning to the airport for departure');return;
   }
  }
  if(v.taxiJobId)return;
  if(v.traveling){if(moveFly)moveFly(v);else localMotion(v,dt);return;}
  if(v.visitorTransitDestination){v.currentLocationId=v.visitorTransitDestination;v.visitorTransitDestination=null;}
  if(now()>=v.departAt){
   if(atAirport(v)){
    v.visitorPhase='airport-wait';v.airportQueuedAt=now();v.action='checked in and waiting at the international gate';
    v.indoors=true;v.sleeping=false;v.vx=v.vz=0;
    return;
   }
   v.visitorPhase='departing';travelVisitor(v,'airport','returning to the airport for departure');return;
  }
  if(v.visitorPhase==='arrival'){
   v.visitorPhase='checking-in';travelVisitor(v,v.hotelId,'travelling to the reserved city hotel');return;
  }
  if(v.hunger>=40&&purchaseHospitalityMeal(raw(),v,v.currentLocationId)){
   v.action='eating a meal served by a resident business';v.nextVisitAt=now()+1800;
   remember(v,'restaurant_meal',{locationId:v.currentLocationId});return;
  }
  if(v.currentLocationId===v.hotelId){
   const room=data().hotels[v.hotelId].rooms[v.id];if(room&&!room.checkedIn){room.checkedIn=true;room.checkedInAt=now();v.visitorPhase='staying';emit('hotel_checkin',`${v.id} checked into ${v.hotelId}.`,{visitorId:v.id,hotelId:v.hotelId});}
   if(clock.hour>=21||clock.hour<7||v.energy<35){v.action='resting in a prepaid city hotel room';v.indoors=true;v.sleeping=true;v.energy=cap(v.energy+hours*18);v.hunger=Math.min(v.hunger,25);v.thirst=Math.min(v.thirst,20);v.stress=cap(v.stress-hours*4);return;}
   v.sleeping=false;
  }
  if(now()<v.nextVisitAt)return;
  if(v.hunger>=45){
   const venues=diningVenues(raw(),v).filter(venue=>!isUnavailable(venue.id,v)&&money(v)>=venue.price*level()+30);
   const restaurant=venues.find(venue=>venue.id!==v.currentLocationId);
   if(restaurant){travelVisitor(v,restaurant.id,'visiting a resident restaurant for a meal');v.nextVisitAt=now()+1800;return;}
  }
  if(v.currentLocationId!==v.hotelId&&!v.placesVisited.includes(v.currentLocationId)){
   v.placesVisited.push(v.currentLocationId);v.happiness=cap(v.happiness+5);v.stress=cap(v.stress-3);
   if(v.photoInterest)takePhoto(v,v.currentLocationId);
   const expense=Math.min(money(v)-35,Math.round((4+rng()*8)*level()*100)/100);if(expense>0)transfer(v,expense,business('city-tourism'));
   v.nextVisitAt=now()+3600+rng()*3600;v.action='enjoying a city attraction';return;
  }
  if(clock.hour>=20||v.energy<40||v.hunger>65){travelVisitor(v,v.hotelId,'returning to the hotel');v.nextVisitAt=now()+1800;return;}
  const places=scenery.filter(id=>location(id)&&!isUnavailable(id,v)&&!v.placesVisited.slice(-3).includes(id));
  if(!places.length)return;
  const id=places[Math.floor(rng()*places.length)];travelVisitor(v,id,'visiting a city attraction');v.nextVisitAt=now()+1800;
 }
 function takePhoto(f,subjectId){
  const s=data(),subject=location(subjectId)||BUILDINGS.find(b=>b.id===subjectId);if(!subject||f.indoors||!f.alive||now()-Number(f.lastCityPhotoAt??-DAY)<1800)return null;
  // A camera is an actual durable purchase, funded by the photographer and paid to city media.
  if(!f.cameraOwned){const price=20*level();if(money(f)<price+35||!transfer(f,price,business('city-media')))return null;f.cameraOwned={model:'compact',purchasedAt:now(),price};remember(f,'camera_purchased',{model:'compact',price});}
  const number=s.nextPhotoId++,quality=cap(.35+Number(f.professionSkills?.photography||0)*.3+(1-Number(raw().weather?.precipitation||0))*.2+rng()*.15,0,1),round=n=>Math.round(n*100)/100;
  const camera={x:round(f.x),y:round(Number(f.y||1.1)+.45),z:round(f.z)};
  let target={x:subject.x,y:Math.min(50,Number(subject.h||BUILDINGS.find(b=>b.id===subjectId)?.h||12)*.55),z:subject.z};
  if(dist(camera,target)<6){const skyline=BUILDINGS.filter(b=>b.h>50&&dist(b,camera)>35).sort((a,b)=>dist(a,camera)-dist(b,camera))[0];if(skyline)target={x:skyline.x,y:Math.min(60,skyline.h*.55),z:skyline.z};else target={x:camera.x+35,y:8,z:camera.z+20};}
  const p={id:`PHOTO-${number}`,photographerId:f.id,photographerName:f.name||f.id,subjectId,subjectName:subject.name||subjectId,at:now(),camera,target,daylightAt:(now()%DAY)/3600,weather:raw().weather?.condition||'clear',quality,kind:'scene-record',rendered:false};
  s.photos.push(p);s.photos=s.photos.slice(-64);s.photoCount++;f.lastCityPhotoAt=now();f.professionSkills||={};f.professionSkills.photography=cap(Number(f.professionSkills.photography||0)+.01,0,1);
  f.happiness=cap(Number(f.happiness||50)+2);remember(f,'photographed_city',{photoId:p.id,subjectId,quality});
  if(quality>.65&&scenery.includes(subjectId))s.reputation=cap(s.reputation+.05,10,95);
  emit('city_photograph',`${f.id} recorded a photograph of ${subjectId}.`,{photoId:p.id,subjectId,photographerId:f.id,recordType:'resident camera pose; pixels rendered on device'});return p;
 }
 function tickClub(clock){
  const s=data(),club=s.club;if(!club)return;
  if(!club.event&&now()>=club.nextAt){
   club.event={id:`PHOTO-WALK-${club.completed+1}`,locationId:'bridge-view',startsAt:now(),endsAt:now()+14400,attendees:[],winnerId:null};club.nextAt=now()+2*DAY;
   emit('community_event','Residents organized a riverbank photo walk and exhibition.',{eventId:club.event.id,locationId:'bridge-view'});
  }
  const e=club.event;if(!e||now()<e.endsAt)return;
  const photos=s.photos.filter(p=>p.at>=e.startsAt&&e.attendees.includes(p.photographerId)).sort((a,b)=>b.quality-a.quality);
  if(photos[0]){
   const winner=actor(photos[0].photographerId);if(winner){const prize=Math.min(25,Math.max(0,Number(raw().treasury.cash||0)));raw().treasury.cash-=prize;winner.money+=prize;e.winnerId=winner.id;remember(winner,'photo_competition_won',{eventId:e.id,prize});}
  }
  s.lastCommunityEvent={...e,attendees:e.attendees.slice()};club.event=null;club.completed++;
 }
 function handleResident(f,clock){
  if(f.cityService&&String(f.cityService).startsWith('TAXI-')){
   const id=f.cityService,job=data().taxiJobs.find(j=>j.id===id&&!['complete','cancelled'].includes(j.phase)&&(j.driverId===f.id||j.passengerId===f.id));
   if(!job){f.cityService=null;if(f.taxiJobId===id)f.taxiJobId=null;f.taxiPassenger=false;f.taxiDriver=false;if(!divertedTaxiActor(f)){f.traveling=false;f.routeWaypoints=[];f.action='orphan taxi commitment released';f.actionUntil=0;}return false;}
   if(f.kind!=='visitor'){needsAndActivities?.(f,clock);payAndFinance?.(f,clock);}return true;}
  if(!f.alive||f.kind==='visitor'||f.traveling)return false;
  if(f.action==='calling a city taxi'){
   if(!f.requestedTaxiDestination){const destinations=scenery.filter(id=>location(id)&&dist(f,location(id))>140);f.requestedTaxiDestination=destinations[Math.floor(random(f)*destinations.length)];}
   if(f.requestedTaxiDestination&&requestTaxi(f,f.requestedTaxiDestination)){f.requestedTaxiDestination=null;return true;}
   f.requestedTaxiDestination=null;f.action='taxi unavailable; choosing public transport';f.actionUntil=now()+1800;return false;
  }
  if(f.action==='photographing the city'||f.action==='joining the riverbank photo club'){
   if(!f.photoSession||f.photoSession.locationId!==f.currentLocationId)f.photoSession={locationId:f.currentLocationId,until:now()+1800};
   if(now()>=f.photoSession.until){f.photoSession=null;f.action='finished a photography outing';f.actionUntil=now();return false;}
   takePhoto(f,f.currentLocationId);
   const e=data().club.event;if(e&&e.locationId===f.currentLocationId&&!e.attendees.includes(f.id)&&e.attendees.length<24){e.attendees.push(f.id);f.loneliness=cap(f.loneliness-8);remember(f,'photo_club_meeting',{eventId:e.id,with:e.attendees.filter(id=>id!==f.id).slice(-3)});}
   f.actionUntil=f.photoSession.until;return false;
  }
  return false;
 }
 function addChoices(f,clock,add){
  if(f.kind==='visitor'||!f.alive||f.ageYears<12||f.energy<30||f.hunger>75)return;
  if(clock.hour>=7&&clock.hour<21&&Number(raw().weather?.precipitation||0)<.5){
   const nearest=scenery.filter(id=>location(id)&&!BUILDINGS.some(b=>b.id===id)&&id!=='rooftop'&&!isUnavailable(id,f)).sort((a,b)=>dist(f,location(a))-dist(f,location(b)))[0];
   if(nearest&&money(f)>(f.cameraOwned?35:55)*level())add(nearest,'photographing the city',12+f.stress*.35+Number(f.traits?.ambition||.5)*15+Number(f.professionSkills?.photography||0)*25);
  }
  const event=data().club.event;
  if(event&&event.endsAt>now())add(event.locationId,'joining the riverbank photo club',32+f.loneliness*.5+Number(f.traits?.sociability||.5)*20);
  if(money(f)>350&&f.ageYears>=18&&Number(f.traits?.thrift||.5)<.45&&f.currentLocationId&&location(f.currentLocationId)&&clock.hour>=7&&clock.hour<21&&!f.vehicle)add(f.currentLocationId,'calling a city taxi',8+f.stress*.25);
 }
 function airportAdmissionCapacity(){
  const s=data(),active=s.visitors.filter(v=>v.alive&&!v.departed).length;
  const rooms=Object.values(s.hotels).filter(h=>!h.closed&&location(h.id)&&!isUnavailable(h.id))
   .reduce((sum,h)=>sum+Math.max(0,h.capacity-Object.keys(h.rooms).length),0);
  return Math.max(0,Math.min(MAX_VISITORS-active,COMBINED_CAP-residents().length-active,rooms));
 }
 function reserveManifest(flight){
  if(flight.arrivalPassengerIds)return true;
  const count=Math.max(MIN_VISITOR_PASSENGERS,Number(flight.arrivingGuests||0));
  if(!createVisitor||airportAdmissionCapacity()<count)return false;
  const start=data().nextVisitorId;
  const seeds=Array.from({length:count},(_,index)=>createVisitor(`Visitor ${start+index}`,start+index));
  if(seeds.some(seed=>!seed?.brain?.id))return false;
  flight.arrivingGuests=count;flight.kind='passenger';flight.arrivalPassengerIds=[];
  if(now()>flight.parkedAt)flight.disembarkAt=now();
  for(let index=0;index<count;index++){
   const visitor=spawnVisitor({flightId:flight.id,inboundFlight:true,arrivalIndex:index,preparedVisitor:seeds[index]});
   if(!visitor)throw new Error('Reserved airport manifest lost its hotel or admission capacity');
   flight.arrivalPassengerIds.push(visitor.id);
  }
  flight.arrivalCompleteAt=visitorArrivalPath(flight,count-1,Number(raw().timeScale||120)).at(-1)?.at;
  return true;
 }
 function queueAircraft(guests){
  const traffic=data().airportTraffic;
  const stand=VISITOR_STANDS.find(p=>!traffic.flights.some(f=>f.standId===p.id));
  if(!stand)return false;
  if(guests>0&&airportAdmissionCapacity()<MIN_VISITOR_PASSENGERS)return false;
  const sector=AIRPORT_SECTORS[Math.floor(rng()*AIRPORT_SECTORS.length)];
  const direction=sector==='east'?-1:sector==='west'?1:rng()<.5?-1:1;
  const inboundAt=visitorRunwaySlot(now()+180,INBOUND_SECONDS,traffic.flights);
  const flight={id:`HCA-${traffic.nextFlightId++}`,standId:stand.id,sector,direction,inboundAt,
   parkedAt:inboundAt+INBOUND_SECONDS,arrivingGuests:guests,unloaded:false,passengerIds:[],
   kind:guests>0?'passenger':'ferry',arrivalPassengerIds:guests>0?undefined:[],
   boardAt:null,outboundAt:null,exitAt:null};
  if(guests>0&&!reserveManifest(flight))return false;
  traffic.flights.push(flight);
  return true;
 }
 function airportClosed(){
  const weather=raw().weather||{};
  return weather.condition==='thunderstorm'||Number(weather.precipitation||0)>=.7||Number(weather.wind||0)>.72;
 }
 function updateAirport(){
  const s=data(),traffic=s.airportTraffic,time=now(),closed=airportClosed();
  const previous=Number(s.lastTickAt??time);
  for(const f of traffic.flights){
   // Upgrade a scheduled legacy 1–3 guest service before it reaches the runway.
   // Existing people and completed arrivals are never regenerated.
   if(!f.unloaded&&!f.arrivalPassengerIds&&f.arrivingGuests>0&&!reserveManifest(f)){
    f.inboundAt=visitorRunwaySlot(time+900,INBOUND_SECONDS,traffic.flights.filter(other=>other!==f));
    f.parkedAt=f.inboundAt+INBOUND_SECONDS;continue;
   }
   if(closed&&!f.unloaded&&time>=f.inboundAt&&previous<f.inboundAt+VISITOR_TOUCHDOWN_SECONDS){
    const pose=visitorAircraftPose(Math.max(f.inboundAt,previous),f);
    if(pose)f.hold={x:pose.x,y:pose.y,z:pose.z,at:time};
    f.inboundAt=visitorRunwaySlot(time+900,INBOUND_SECONDS,traffic.flights.filter(other=>other!==f));
    f.parkedAt=f.inboundAt+INBOUND_SECONDS;
    if(f.arrivalPassengerIds?.length)f.arrivalCompleteAt=visitorArrivalPath(f,f.arrivalPassengerIds.length-1,Number(raw().timeScale||120)).at(-1)?.at;
   }
   if(closed&&f.outboundAt!=null&&time>=f.outboundAt&&previous<f.outboundAt){
    f.outboundAt=visitorRunwaySlot(time+900,OUTBOUND_SECONDS,traffic.flights.filter(other=>other!==f));
    f.exitAt=f.outboundAt+OUTBOUND_SECONDS;
   }
   if(!f.landedAt&&time>=f.parkedAt){f.landedAt=time;traffic.landed++;}
   let allOffPlane=true;
   for(const [index,id] of (f.arrivalPassengerIds||[]).entries()){
    const visitor=s.visitors.find(v=>v.id===id&&v.alive&&!v.departed);
    if(!visitor||visitor.immigrationClearedAt!=null)continue;
    const pose=visitorArrivalPose(time,f,index,Number(raw().timeScale||120));
    if(!pose){allOffPlane=false;continue;}
    const oldX=visitor.x,oldZ=visitor.z;
    Object.assign(visitor,{x:pose.x,y:pose.y,z:pose.z,indoors:pose.indoors,onPlane:pose.onPlane,
     transitMode:pose.onPlane?'airplane':'walk',visitorPhase:pose.onPlane?'inbound-flight':'airport-arrival',
     traveling:!pose.onPlane&&!pose.indoors&&pose.phase!=='complete',
     action:pose.phase==='disembarking'?'walking down the aircraft boarding stairs':pose.phase==='apron'?'walking across the apron to the terminal':pose.phase==='immigration'?'clearing airport immigration':'arriving on an international flight',
     vx:pose.x-oldX,vz:pose.z-oldZ,motionSpeed:1.8,routeIndex:0,
     routeWaypoints:pose.next?[{x:pose.next.x,y:pose.next.y,z:pose.next.z,mode:'walk'}]:[]});
    visitor.movementTrace=[...(visitor.movementTrace||[]),{x:visitor.x,y:visitor.y,z:visitor.z,t:time}].slice(-8);
    if(pose.onPlane)allOffPlane=false;
    if(pose.phase==='complete')completeAirportArrival(visitor);
   }
   if(!f.unloaded&&time>=f.parkedAt&&allOffPlane)f.unloaded=true;
   if(f.boardAt==null||time<f.boardAt)continue;
   const pose=visitorAircraftPose(time,f);
   for(const id of f.passengerIds){
    const visitor=s.visitors.find(v=>v.id===id&&v.alive&&!v.departed);
    if(!visitor||visitor.airportFlightId!==f.id)continue;
    if(visitor.ambulanceDuty||visitor.onAmbulance||!visitor.onPlane&&!atAirport(visitor)){
     Object.assign(visitor,{airportFlightId:null,onPlane:false,visitorPhase:'departing'});
     continue;
    }
    if(time>=f.exitAt){depart(visitor);continue;}
    visitor.onPlane=true;visitor.indoors=true;visitor.visitorPhase='return-flight';
    visitor.transitMode='airplane';visitor.action=time<f.outboundAt?'boarded at the international stand':'flying out of Hansdrex';
    if(pose)Object.assign(visitor,{x:pose.x,y:pose.y,z:pose.z});
   }
   if(time>=f.exitAt)traffic.departed++;
  }
  traffic.flights=traffic.flights.filter(f=>f.exitAt==null||time<f.exitAt);
  if(closed)return;
  const waiting=s.visitors.filter(v=>v.alive&&!v.departed&&v.visitorPhase==='airport-wait'&&!v.airportFlightId&&!v.ambulanceDuty&&!v.onAmbulance&&atAirport(v))
   .sort((a,b)=>a.airportQueuedAt-b.airportQueuedAt);
  for(const f of traffic.flights){
   if(!f.unloaded||f.outboundAt!=null||time<Math.max(f.parkedAt+900,Number(f.arrivalCompleteAt||0)))continue;
   if(!waiting.length&&time<f.parkedAt+3600)continue;
   const passengers=waiting.splice(0,12);
   f.outboundAt=visitorRunwaySlot(time+720,OUTBOUND_SECONDS,traffic.flights);
   f.boardAt=f.outboundAt-420;f.exitAt=f.outboundAt+OUTBOUND_SECONDS;
   f.passengerIds=passengers.map(v=>v.id);
   for(const v of passengers){v.airportFlightId=f.id;v.action=`waiting to board ${f.id}`;}
  }
  // A return flight can operate even when all hotel rooms are occupied.
  if(waiting.length&&!traffic.flights.some(f=>f.outboundAt==null))queueAircraft(0);
 }
 function tick(gameSeconds,clock){
  init();const s=data(),dt=Math.max(0,Number(gameSeconds||0));
  tickTaxis(dt);
  for(const v of s.visitors)tickVisitor(v,clock,dt);
  updateAirport();
  s.visitors=s.visitors.filter(v=>!v.departed);
  if(now()>=s.nextArrivalAt){
   const capacity=airportAdmissionCapacity();
   if(!airportClosed()&&capacity>=MIN_VISITOR_PASSENGERS&&rng()<.35+s.reputation/140)queueAircraft(MIN_VISITOR_PASSENGERS);
   s.nextArrivalAt=now()+Math.round((7200+rng()*12600)*(1.4-s.reputation/140));
  }
  tickClub(clock);s.lastTickAt=now();
 }
 function snapshot(){
  const s=data(),airport=s.airportTraffic;return {
   airportTraffic:airport?{flights:airport.flights,landed:airport.landed,departed:airport.departed,waiting:s.visitors.filter(v=>v.visitorPhase==='airport-wait').length}:undefined,
   capacity:MAX_VISITORS,totalArrivals:s.totalArrivals,totalDepartures:s.totalDepartures,reputation:Math.round(s.reputation*10)/10,
   externalInflow:s.externalInflow,externalOutflow:s.externalOutflow,visitorFatalities:Number(s.visitorFatalities||0),hotelRooms:Object.values(s.hotels).map(h=>({id:h.id,capacity:h.capacity,occupied:Object.keys(h.rooms).length})),
   taxiCompleted:s.taxiCompleted,taxiRevenue:s.taxiRevenue,taxiCancelled:s.taxiCancelled,
   taxiJobs:s.taxiJobs.filter(j=>!['complete','cancelled'].includes(j.phase)).map(j=>({id:j.id,driverId:j.driverId,passengerId:j.passengerId,destinationId:j.destinationId,phase:j.phase,fare:j.fare,x:actor(j.driverId)?.x,z:actor(j.driverId)?.z})),
   visitors:s.visitors.filter(v=>v.alive&&!v.departed).map(v=>({id:v.id,name:v.name,kind:'visitor',alive:true,ageYears:v.ageYears,generation:v.generation,sex:v.sex,x:v.x,y:v.y,z:v.z,vx:v.vx,vz:v.vz,money:v.money,savings:v.savings,action:v.action,traveling:v.traveling,indoors:v.indoors,sleeping:v.sleeping,onTrain:v.onTrain,onPlane:v.onPlane,transitMode:v.transitMode,metroLineId:v.metroLineId,heliPassenger:false,taxiPassenger:v.taxiPassenger,currentLocationId:v.currentLocationId,targetLocationId:v.targetLocationId,movementTrace:(v.movementTrace||[]).slice(-8),motion:v.traveling&&!v.onTrain?{at:now(),speed:Number(v.motionSpeed||Math.hypot(v.vx,v.vz)||2.5),mode:v.transitMode,blocked:Number(v.trafficHoldUntil||0)>now(),points:(v.routeWaypoints||[]).slice(v.routeIndex||0,(v.routeIndex||0)+8).filter(p=>p.mode===v.transitMode).map(p=>({x:p.x,y:p.y??1.1,z:p.z}))}:null,health:v.health,hunger:v.hunger,energy:v.energy,stress:v.stress,happiness:v.happiness,excitement:v.excitement,loneliness:v.loneliness,children:[],parents:[],homeId:v.hotelId,hotelId:v.hotelId,departAt:v.departAt,brainId:v.brain.id})),
   photoCount:s.photoCount,photos:s.photos.slice(-16),communityEvent:s.club.event||s.lastCommunityEvent||null};
 }
 return {init,tick,handleResident,addChoices,snapshot,visitors:()=>data().visitors.filter(v=>v.alive&&!v.departed),spawnVisitor,reserveRoom,requestTaxi,finishTaxi,takePhoto,depart};
}
