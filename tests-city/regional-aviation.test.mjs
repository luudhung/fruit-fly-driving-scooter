import {ISLAND} from '../worker/city-map.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {COUNTRY_AIRPORTS} from '../worker/country-map.mjs';
import {nextRegionalFlight,flightPose,AVIATION} from '../worker/aviation.mjs';
import {createRegionalAviationSystem,regionalJourneyBudget} from '../worker/regional-aviation.mjs';
import {createInternationalLife} from '../worker/international-life.mjs';
import {visitorArrivalPath} from '../worker/visitor-aviation.mjs';

const supply=s=>(s.flies||[]).reduce((n,f)=>n+f.money+f.savings,0)+s.treasury.cash+Object.values(s.businesses).reduce((n,b)=>n+Number(b.cash||0),0);
function fixture(from='north',count=1){
 let s={simulationAgeSeconds:7*3600,timeScale:120,flies:[],treasury:{cash:10000},businesses:{},totalTransactions:0,cityVisitors:{visitors:[],hotels:{}}};
 const airport=COUNTRY_AIRPORTS.find(p=>p.id===from);s.flies=Array.from({length:count},(_,i)=>({id:`RES-${i}`,alive:true,ageYears:30,citizenshipCountryId:airport.countryId,originCountryId:airport.countryId,money:500,savings:1000,health:95,energy:90,x:airport.gate.x,z:airport.gate.z,y:1.1,currentLocationId:airport.locationId,brain:{id:`BRAIN-${i}`}}));
 let countries,air;const build=()=>{countries=createInternationalLife({world:()=>s,redistribute:false});countries.init();air=createRegionalAviationSystem({world:()=>s,aviationAdmission:countries.aviationAdmission,requestAirClearance:countries.requestAirClearance});air.init();};build();
 return{get s(){return s;},get air(){return air;},get countries(){return countries;},restore(){s=structuredClone(s);build();},at(time){s.simulationAgeSeconds=time;},arrive(f,leg,index=0){const p=COUNTRY_AIRPORTS.find(p=>p.id===leg.to),stand=p.stands.at(-1),path=visitorArrivalPath({airportId:p.id,standId:stand.id,arrivalStand:stand,inboundAt:leg.departure,parkedAt:leg.arrival},index,120);s.simulationAgeSeconds=path.at(-1).at+1;air.handleResident(f,{hour:12});}};
}

test('the four direct airport pairs have ten-seat schedules and actual runway/taxi/flight/immigration trajectories; North-Hawaii requires Hansdrex',()=>{
 for(const from of COUNTRY_AIRPORTS)for(const to of COUNTRY_AIRPORTS){if(from===to)continue;
  if(from.id==='north'&&to.id==='island'||from.id==='island'&&to.id==='north'){assert.equal(nextRegionalFlight(0,from.id,to.id),null);continue;}
  const t=fixture(from.id),f=t.s.flies[0],total=supply(t.s);assert.ok(t.air.book(f,to.id));assert.equal(supply(t.s),total);const trip=f.countryAirTrip,flight=trip.outbound;
  assert.ok(flight.departure>=t.s.simulationAgeSeconds+AVIATION.checkInSeconds);assert.equal(flight.to,to.id);
  t.at(flight.departure+600);t.air.handleResident(f);assert.equal(f.onPlane,true);assert.ok(f.y>20);assert.deepEqual({x:f.x,y:f.y,z:f.z},{x:flightPose(t.s.simulationAgeSeconds,flight).x,y:flightPose(t.s.simulationAgeSeconds,flight).y,z:flightPose(t.s.simulationAgeSeconds,flight).z});
  t.at(flight.arrival+180);t.air.handleResident(f);assert.equal(f.onPlane,false);assert.equal(f.airportMotion?.timed,true);assert.ok(f.y>=1.1&&f.y<=3.4);assert.equal(t.countries.snapshot().visaRevenue,0,'no airport fee is charged during overflight or on the aircraft');
  t.arrive(f,flight);assert.equal(f.currentLocationId,to.locationId);assert.equal(f.airportMotion,null);assert.equal(t.countries.snapshot().visaRevenue,50);assert.equal(trip.phase,'visiting');assert.equal(t.s.cityVisitors.hotels[trip.hotelId].rooms[f.id].checkedIn,false,'a reserved room is not a remote check-in');
  t.restore();const restored=t.s.flies[0],back=restored.countryAirTrip.inbound;Object.assign(restored,{currentLocationId:to.locationId,x:to.gate.x,z:to.gate.z,traveling:false});t.at(back.departure-1200);t.air.handleResident(restored);t.at(back.departure+600);t.air.handleResident(restored);assert.equal(restored.onPlane,true);
  t.arrive(restored,back);assert.equal(restored.countryAirTrip,null);assert.equal(restored.currentLocationId,from.locationId);assert.equal(t.countries.snapshot().visaRevenue,50,'the home-country return is exempt');assert.equal(supply(t.s),total);assert.equal(t.air.snapshot().completedTrips,1);
 }
});

test('both manifests reject seat eleven, keep identity/fare/hotel escrow on restore and never touch legacy paid trips',()=>{
 const t=fixture('north',11),total=supply(t.s);assert.equal(AVIATION.seats,10);for(const f of t.s.flies.slice(0,10))assert.ok(t.air.book(f,'city'));
 assert.equal(t.air.book(t.s.flies[10],'city'),false);assert.equal(t.s.flies[10].money,500);assert.equal(t.s.businesses['regional-flight-escrow'].cash,10*134);assert.equal(supply(t.s),total);
 const identities=t.s.flies.map(f=>[f.id,f.brain.id,f.money,f.savings]);t.restore();assert.deepEqual(t.s.flies.map(f=>[f.id,f.brain.id,f.money,f.savings]),identities);assert.equal(t.s.businesses['regional-flight-escrow'].cash,10*134);
 const legacy=t.s.flies[10];legacy.airTrip={phase:'outbound-wait',outbound:nextRegionalFlight(t.s.simulationAgeSeconds,'city','island'),inbound:nextRegionalFlight(t.s.simulationAgeSeconds+86400,'island','city'),cost:134};assert.equal(t.air.book(legacy,'island'),false);assert.equal(legacy.airTrip.cost,134);
});

test('a North traveller checks in for Hawaii only after reaching Hansdrex airport',()=>{
 const t=fixture('north'),f=t.s.flies[0],airport=COUNTRY_AIRPORTS.find(p=>p.id==='city');
 const air=createRegionalAviationSystem({world:()=>t.s,aviationAdmission:t.countries.aviationAdmission,
  startJourney:(person,choice)=>{person.traveling=true;person.targetLocationId=choice.id;}});
 assert.equal(air.book(f,'island'),false);
 assert.equal(air.request(f,'island'),true);
 assert.equal(f.targetLocationId,airport.locationId);assert.equal(f.countryAirTrip,undefined);
 Object.assign(f,airport.gate,{traveling:false,currentLocationId:airport.locationId});
 air.handleResident(f);
 assert.equal(f.countryAirTrip.outbound.from,'city');assert.equal(f.countryAirTrip.outbound.to,'island');
 assert.equal(f.countryAirTrip.inbound.to,'city');assert.equal(f.countryFlightPlan,null);
 for(let hour=0;hour<24;hour+=4){
  t.at(hour*3600+300);
  const [flight]=air.snapshot().flights;
  assert.equal(flight.departure,hour*3600);assert.equal(flight.from,'city');assert.equal(flight.to,'island');
  assert.equal(flight.scheduled,true);
 }
});

test('a deceased passenger releases both seats and their real room, and unused escrow joins the settled estate only once',()=>{
 const t=fixture('north',2),f=t.s.flies[0],heir=t.s.flies[1];f.children=[heir.id];assert.ok(t.air.book(f,'city'));const before=heir.savings;
 f.alive=false;f.estateSettled=true;t.air.tick();assert.equal(f.countryAirTrip,null);assert.equal(t.s.businesses['regional-flight-escrow'].cash,0);assert.equal(heir.savings,before+134);assert.equal(t.s.cityVisitors.hotels.hotel.rooms[f.id],undefined);
 t.air.tick();assert.equal(heir.savings,before+134);assert.equal(f.alive,false);
});


test('regional full board needs a settled paid stay, actual resort attendance and finite stock across restore',()=>{
 const t=fixture('city'),f=t.s.flies[0];assert.ok(t.air.book(f,'island'));const trip=f.countryAirTrip;t.at(trip.outbound.departure+600);t.air.handleResident(f);t.arrive(f,trip.outbound);
 const resort=t.s.businesses['island-resort'];Object.assign(f,{hunger:90,currentLocationId:'island-resort',x:ISLAND.resort.x,z:ISLAND.resort.z,traveling:false,onPlane:false});resort.inventory=0;const before=supply(t.s);
 t.air.handleResident(f);assert.equal(f.hunger,90,'an empty prepaid pantry cannot create food');
 resort.inventory=1;Object.assign(f,{currentLocationId:'island-beach',x:ISLAND.beach.x,z:ISLAND.beach.z});t.air.handleResident(f);assert.equal(resort.inventory,1);assert.equal(f.hunger,90,'beach relaxation is not a meal');
 Object.assign(f,{currentLocationId:'island-resort'});t.air.handleResident(f);assert.equal(resort.inventory,1,'a stale location label cannot serve a remote meal');
 Object.assign(f,{x:ISLAND.resort.x,z:ISLAND.resort.z});trip.settled=false;t.air.handleResident(f);assert.equal(resort.inventory,1,'unpaid reservations do not include a meal');
 trip.settled=true;t.air.handleResident(f);assert.equal(resort.inventory,0);assert.equal(f.hunger,30);assert.equal(trip.mealsConsumed,1);assert.equal(supply(t.s),before);
 t.restore();const restored=t.s.flies[0];restored.hunger=90;t.air.handleResident(restored);assert.equal(restored.hunger,90);assert.equal(t.s.businesses['island-resort'].inventory,0);assert.equal(restored.countryAirTrip.mealsConsumed,1);
});


test('a mainland conflict closes only actual route airspace, leaving Hansdrex-Hawaii travel open',()=>{
 const t=fixture('city'),f=t.s.flies[0];assert.equal(t.countries.requestConflict({requestId:'unrelated-airspace',quick:true}).accepted,true);t.countries.tick(0);
 assert.equal(t.countries.relation('hansdrex','north-city').state,'war');assert.ok(t.air.book(f,'island'),'Hawaii route never enters North City');
 for(const leg of [f.countryAirTrip.outbound,f.countryAirTrip.inbound]){const permit=t.s.internationalLife.airClearances[leg.id];assert.ok(permit);assert.ok(permit.countries.includes('hansdrex'));assert.ok(permit.countries.includes('hawaii'));assert.equal(permit.countries.includes('north-city'),false);}
 const n=fixture('north'),guest=n.s.flies[0];n.countries.requestConflict({requestId:'north-closed-airspace',quick:true});n.countries.tick(0);const wallet=guest.money+guest.savings;assert.equal(n.air.book(guest,'island'),false,'North-Hawaii passes through Hansdrex');assert.equal(guest.money+guest.savings,wallet);assert.equal(n.s.businesses['regional-flight-escrow'].cash,0);
});

test('a missed regional return obtains a new permit before replacing its paid reservation',()=>{
 const t=fixture('north'),f=t.s.flies[0];assert.ok(t.air.book(f,'city'));const trip=f.countryAirTrip;t.at(trip.outbound.departure+600);t.air.handleResident(f);t.arrive(f,trip.outbound);
 const old=trip.inbound;Object.assign(f,{traveling:false,currentLocationId:'park',x:0,z:0});t.at(old.departure+1);t.air.handleResident(f);
 assert.notEqual(trip.inbound.id,old.id);assert.ok(t.s.internationalLife.airClearances[trip.inbound.id]);assert.equal(t.s.cityVisitors.hotels[trip.hotelId].rooms[f.id].checkoutAt,trip.inbound.departure);
 const held=structuredClone(trip.inbound),checkout=t.s.cityVisitors.hotels[trip.hotelId].rooms[f.id].checkoutAt;t.countries.requestConflict({requestId:'close-before-delay',quick:true});t.countries.tick(0);t.at(trip.inbound.departure+1);t.air.handleResident(f);
 assert.deepEqual(trip.inbound,held,'a denied replacement cannot silently assign an unlicensed flight');assert.equal(t.s.cityVisitors.hotels[trip.hotelId].rooms[f.id].checkoutAt,checkout);
});


test('an unaffordable regional request cannot reserve transport or send a poor island resident to an airport loop',()=>{
 const t=fixture('island'),f=t.s.flies[0];Object.assign(f,{money:0,savings:0,currentLocationId:'island-beach',indoors:true});const pose=[f.x,f.z,f.currentLocationId,f.indoors],quote=regionalJourneyBudget(f,'city');assert.equal(quote.cost,134);assert.equal(quote.visaReserve,50);assert.equal(quote.required,264);assert.equal(quote.affordable,false);
 assert.equal(t.air.request(f,'city'),false);assert.equal(f.countryFlightPlan,undefined);assert.deepEqual([f.x,f.z,f.currentLocationId,f.indoors],pose);assert.equal(t.s.businesses['regional-flight-escrow'].cash,0);
 f.money=263;assert.equal(t.air.request(f,'city'),false);f.money=264;assert.equal(regionalJourneyBudget(f,'city').affordable,true);
});


test('regional airport walks, gates, flight and immigration continue resident care once per simulation time',()=>{
 let calls={needs:0,finance:0,moves:0};const port=COUNTRY_AIRPORTS.find(p=>p.id==='city');
 const f={id:'REGIONAL-CARE',alive:true,ageYears:30,money:1000,savings:0,citizenshipCountryId:'hansdrex',currentLocationId:'park',x:0,y:1.1,z:0,hunger:0,traveling:false};
 const s={simulationAgeSeconds:7*3600,timeScale:120,flies:[f],treasury:{cash:0},businesses:{},cityVisitors:{visitors:[],hotels:{}}};
 const air=createRegionalAviationSystem({world:()=>s,startJourney:(person,q)=>{person.traveling=true;person.targetLocationId=q.id;},moveFly:()=>{calls.moves++;},aviationAdmission:()=>({allowed:true}),requestAirClearance:()=>({allowed:true}),needsAndActivities:(person,clock)=>{assert.equal(clock.hour,7);calls.needs++;person.hunger++;},payAndFinance:()=>{calls.finance++;}});
 assert.ok(air.request(f,'island'));assert.ok(f.traveling);air.handleResident(f,{hour:7});air.handleResident(f,{hour:7});assert.deepEqual(calls,{needs:1,finance:1,moves:2});assert.equal(f.hunger,1,'the airport commute still accumulates needs');
 Object.assign(f,{traveling:false,currentLocationId:port.locationId,x:port.gate.x,z:port.gate.z});s.simulationAgeSeconds+=120;air.handleResident(f,{hour:7});assert.ok(f.countryAirTrip);assert.equal(calls.needs,2);
 const trip=f.countryAirTrip;s.simulationAgeSeconds=trip.outbound.departure-120;air.handleResident(f,{hour:7});air.handleResident(f,{hour:7});assert.equal(calls.needs,3);
 s.simulationAgeSeconds=trip.outbound.departure+300;air.handleResident(f,{hour:7});air.handleResident(f,{hour:7});assert.equal(f.onPlane,true);assert.equal(calls.needs,4);
 s.simulationAgeSeconds=trip.outbound.arrival+180;air.handleResident(f,{hour:7});air.handleResident(f,{hour:7});assert.equal(calls.needs,5,'disembarkation and immigration must also continue care');assert.equal(calls.finance,5);assert.equal(f.hunger,5);
});

test('Hawaii seasonal apartments offer real room capacity when the main resort is full',()=>{
 const t=fixture('city'),f=t.s.flies[0];
 t.s.cityVisitors.hotels['island-resort']={id:'island-resort',capacity:1,rooms:{existing:{visitorId:'existing'}}};
 assert.ok(t.air.book(f,'island'));
 const trip=f.countryAirTrip;
 assert.match(trip.hotelId,/^HAWAII-APT-/);
 assert.ok(t.s.cityVisitors.hotels[trip.hotelId].rooms[f.id]);
 assert.equal(t.s.cityVisitors.hotels['island-resort'].rooms[f.id],undefined);
 assert.equal(t.s.businesses['regional-flight-escrow'].cash,trip.cost);
});

test('North City exchange charges two room nights and tuition, then counts physical lessons once', async()=>{
 const {MAIN_SCHOOL_CAMPUSES}=await import('../worker/education-map.mjs');
 const t=fixture('north'),student=t.s.flies[0],campus=MAIN_SCHOOL_CAMPUSES[0];
 Object.assign(student,{ageYears:19,traits:{ambition:.9}});
 const travel=[];
 let teacher=false;
 const air=createRegionalAviationSystem({
  world:()=>t.s,schoolOpen:id=>id===campus.id,studyAtSchool:f=>teacher&&f.indoors&&Math.hypot(f.x-campus.x,f.z-campus.z)<20,
  startJourney:(f,choice)=>travel.push(choice),aviationAdmission:t.countries.aviationAdmission,requestAirClearance:t.countries.requestAirClearance,
 });
 const options=[];
 air.addChoices(student,{hour:9},(id,action)=>options.push({id,action}));
 assert.ok(options.some(o=>o.id==='north-airport'&&o.action.endsWith(campus.id)));
 assert.equal(air.book(student,'city',{studySchoolId:'north-school'}),false);
 assert.ok(air.book(student,'city',{studySchoolId:campus.id}));
 const trip=student.countryAirTrip,originalCash=supply(t.s);
 assert.ok(trip.inbound.departure-trip.outbound.arrival>=172800);
 assert.equal(t.s.cityVisitors.hotels.hotel.rooms[student.id].nights,2);
 t.at(trip.outbound.departure+300);
 air.handleResident(student,{hour:9});
 assert.equal(t.s.businesses[campus.id].cash,15);
 assert.equal(t.s.businesses.hotel.cash,88);
 t.arrive(student,trip.outbound);
 t.at(t.s.simulationAgeSeconds+120);
 air.handleResident(student,{hour:12});
 assert.equal(travel.at(-1).id,campus.id);
 assert.equal(air.snapshot().exchangeStudents,undefined);
 Object.assign(student,{currentLocationId:campus.id,x:campus.x,z:campus.z,indoors:true});
 air.handleResident(student,{hour:12});
 assert.equal(air.snapshot().exchangeStudents,undefined);
 teacher=true;air.handleResident(student,{hour:12});air.handleResident(student,{hour:12});
 assert.equal(air.snapshot().exchangeStudents,1);
 assert.equal(supply(t.s),originalCash);
});
