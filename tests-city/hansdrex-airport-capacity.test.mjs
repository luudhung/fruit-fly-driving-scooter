import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRPORT,BUILDINGS,ROADS,DISTRICT_RIVERS,contains} from '../worker/city-map.mjs';
import {HANSDREX_AIRPORT} from '../worker/hansdrex-airport-map.mjs';
import {countryAt} from '../worker/country-map.mjs';
import * as airportTraffic from '../worker/visitor-aviation.mjs';
import {airportById} from '../worker/aviation.mjs';
import {createNorthF1} from '../worker/north-f1.mjs';
import {createF1Charters} from '../worker/north-f1-charters.mjs';
import {NORTH_F1_CIRCUIT} from '../worker/north-f1-map.mjs';
import {createCityVisitors} from '../worker/city-visitors.mjs';
import {createInternationalLife} from '../worker/international-life.mjs';
import {MIN_VISITOR_PASSENGERS,visitorArrivalPath,visitorAircraftPose,visitorStands} from '../worker/visitor-aviation.mjs';
import {showResidentBody} from '../src/actor-transport.ts';

function internationalAirport(){
 let state={simulationAgeSeconds:0,timeScale:120,flies:[],businesses:{},housing:{households:{},apartmentBlocks:[],houseLots:[]},treasury:{cash:10000},centralBank:{priceLevel:1},weather:{condition:'clear',precipitation:0,wind:0},totalTransactions:0};
 const admissions=[],events=[];
 let countries,visitors;
 function rebuild(){
  countries=createInternationalLife({world:()=>state,redistribute:false,nationalEconomy:false});countries.init();
  visitors=createCityVisitors({world:()=>state,
   createVisitor:(_name,index)=>({ageYears:30,generation:1,sex:index%2?'M':'F',brain:{id:`AIRPORT-FOREIGN-BRAIN-${index}`,memory:{episodes:[]}},traits:{thrift:.8,sociability:.5,ambition:.4},professionSkills:{}}),
   aviationAdmission:(person,request)=>{
    admissions.push({id:person.id,at:state.simulationAgeSeconds,onPlane:person.onPlane,x:person.x,z:person.z,request});
    return countries.aviationAdmission(person,request);
   },
   emit:(type,_text,payload)=>events.push({type,...payload}),
  });
  visitors.init();state.cityVisitors.nextArrivalAt=Infinity;state.cityVisitors.club.nextAt=Infinity;
 }
 rebuild();
 return {get state(){return state;},get visitors(){return visitors;},get countries(){return countries;},admissions,events,
  tick(at){const elapsed=at-state.simulationAgeSeconds;assert.ok(elapsed>=0);state.simulationAgeSeconds=at;visitors.tick(elapsed,{day:Math.floor(at/86400)+1,hour:Math.floor(at/3600)%24,minute:Math.floor(at/60)%60});},
  restore(){state=JSON.parse(JSON.stringify(state));rebuild();}};
}

test('ten separately identified foreign passengers pay 50 H$ once only after walking from the aircraft through immigration',()=>{
 const t=internationalAirport(),treasury=t.countries.countryAccount('hansdrex').cash;
 assert.equal(MIN_VISITOR_PASSENGERS,10);
 assert.equal(t.visitors.queueAircraft(10,'city'),true);
 let flight=t.state.cityVisitors.airportTraffic.flights[0];
 assert.equal(flight.arrivingGuests,10);assert.equal(flight.arrivalPassengerIds.length,10);
 const people=t.state.cityVisitors.visitors;
 assert.equal(people.length,10);assert.equal(new Set(people.map(v=>v.id)).size,10);assert.equal(new Set(people.map(v=>v.brain.id)).size,10);
 assert.ok(people.every(v=>v.onPlane&&v.citizenshipCountryId==='outside'));
 assert.equal(t.admissions.length,0);assert.equal(t.countries.countryAccount('hansdrex').cash,treasury);
 const first=visitorArrivalPath(flight,0),last=visitorArrivalPath(flight,9);
 t.tick(first[0].at+1);assert.equal(people[0].onPlane,false);assert.match(people[0].action,/aircraft boarding stairs/);
 assert.equal(t.admissions.length,0);
 t.tick(first.find(point=>point.phase==='immigration').at+1);
 assert.equal(people[0].indoors,true);assert.equal(t.admissions.length,0,'the waiting period at immigration is real');
 t.tick(first.at(-1).at-1);assert.equal(t.admissions.length,0);
 const identities=people.map(v=>[v.id,v.brain.id]);
 t.restore();flight=t.state.cityVisitors.airportTraffic.flights[0];
 t.tick(last.at(-1).at+1);
 assert.equal(t.admissions.length,10);assert.ok(t.admissions.every(entry=>!entry.onPlane&&entry.x===AIRPORT.gate.x&&entry.z===AIRPORT.gate.z));
 assert.equal(t.countries.countryAccount('hansdrex').cash,treasury+500);
 assert.equal(t.state.internationalLife.visaRevenue,500);assert.equal(t.state.internationalLife.entries,10);
 assert.equal(t.state.businesses['hansdrex-airline'].cash,2000);
 assert.equal(t.state.businesses['hansdrex-airline'].ownerCountryId||t.state.businesses['hansdrex-airline'].countryId,'hansdrex');
 assert.equal(t.state.cityVisitors.totalArrivals,10);
 assert.deepEqual(t.state.cityVisitors.visitors.map(v=>[v.id,v.brain.id]),identities);
 assert.ok(t.state.cityVisitors.visitors.every(v=>v.countryEntryReceipts.length===1&&v.countryEntryReceipts[0].fee===50));
 t.restore();t.tick(t.state.simulationAgeSeconds+120);
 assert.equal(t.admissions.length,10);assert.equal(t.state.internationalLife.visaRevenue,500);assert.equal(t.countries.countryAccount('hansdrex').cash,treasury+500);
 assert.equal(t.events.filter(event=>event.type==='visitor_arrival').length,10);
});

test('both Hansdrex and North expose all ten real disembarking passengers to the body renderer before immigration',()=>{
 for(const airport of ['city','north']){
  const t=internationalAirport();assert.equal(t.visitors.queueAircraft(10,airport),true);
  const flight=t.state.cityVisitors.airportTraffic.flights[0],seen=new Set();
  for(let index=0;index<10;index++){
   const path=visitorArrivalPath(flight,index);t.tick(path[0].at+1);
   const view=t.visitors.snapshot().visitors,passenger=view.find(f=>f.id===flight.arrivalPassengerIds[index]);
   assert.ok(passenger);assert.equal(showResidentBody(passenger),true,airport+':'+index);
   assert.equal(passenger.visitorPhase,'airport-arrival');assert.equal(passenger.transitMode,'walk');assert.equal(passenger.traveling,true);
   seen.add(passenger.id);
  }
  assert.equal(seen.size,10);assert.equal(t.admissions.length,0);
  t.tick(visitorArrivalPath(flight,9).at(-1).at+1);assert.equal(t.admissions.length,10);
  assert.ok(t.admissions.every(a=>a.request.airportId===airport));
 }
});

test('future long holidays change to Hansdrex and express race visits to North without rerouting airborne passengers or resetting their identities',()=>{
 const make=(id,airportId,nights,inboundAt)=>({id,airportId,inboundAt,parkedAt:inboundAt+1020,outboundAt:inboundAt+2000,exitAt:inboundAt+3080,standId:'old',arrivalStand:{id:'old',x:0,z:0},guests:[{id:id+'-guest',phase:'inbound',entryAirportId:airportId,nights,money:1400}]});
 const holiday=make('holiday','north',3,2000),express=make('express','city',0,2500),airborne=make('airborne','north',3,500);
 const event={charterPlanned:true,tenPassengerVersion:1,charters:[holiday,express,airborne]},state={simulationAgeSeconds:1000,northF1:{event}},service=createF1Charters({world:()=>state});
 const flying=JSON.stringify(airborne),identities=event.charters.map(f=>[f.id,f.guests[0].id,f.guests[0].money]);
 service.make(event);assert.equal(holiday.airportId,'city');assert.equal(express.airportId,'north');assert.equal(JSON.stringify(airborne),flying);
 for(const f of [holiday,express]){assert.equal(f.inboundAt,null);assert.equal(f.arrivalStand,undefined);assert.equal(f.guests[0].entryAirportId,f.airportId);}
 assert.deepEqual(event.charters.map(f=>[f.id,f.guests[0].id,f.guests[0].money]),identities);
 const once=JSON.stringify(event);service.make(event);assert.equal(JSON.stringify(event),once);
});


const rectanglesOverlap=(a,b,margin=0)=>Math.abs(a.x-b.x)<(a.w+b.w)/2+margin&&Math.abs(a.z-b.z)<(a.d+b.d)/2+margin;

test('the two real Hansdrex runways and eight stand envelopes share one layout and clear rivers, public roads and buildings',()=>{
 const port=airportById('city');
 assert.equal(AIRPORT,HANSDREX_AIRPORT);assert.equal(port.runways.length,2);assert.equal(port.stands.length,8);
 assert.deepEqual(port.runways,AIRPORT.runways);assert.deepEqual(port.stands,AIRPORT.stands);
 assert.equal(new Set(port.runways.map(r=>r.id)).size,2);assert.equal(new Set(port.stands.map(r=>r.id)).size,8);
 for(const runway of port.runways){
  for(const dx of [-runway.w/2,runway.w/2])for(const dz of [-runway.d/2,runway.d/2])assert.equal(countryAt({x:runway.x+dx,z:runway.z+dz}),'hansdrex');
  assert.ok(!DISTRICT_RIVERS.some(river=>rectanglesOverlap(runway,river,1)),runway.id+' overlaps a river');
  assert.ok(!ROADS.some(road=>rectanglesOverlap(runway,road)),runway.id+' crosses a public road');
  assert.ok(!BUILDINGS.some(building=>rectanglesOverlap(runway,building,1)),runway.id+' is blocked by a building');
 }
 assert.ok(!rectanglesOverlap(port.runways[0],port.runways[1],4));
 const envelopes=port.stands.map(stand=>({...stand,w:18,d:20}));
 for(const [i,envelope]of envelopes.entries()){
  assert.ok(contains(AIRPORT.apron,{x:envelope.x-envelope.w/2,z:envelope.z-envelope.d/2}));
  assert.ok(contains(AIRPORT.apron,{x:envelope.x+envelope.w/2,z:envelope.z+envelope.d/2}));
  assert.ok(!BUILDINGS.some(building=>rectanglesOverlap(envelope,building,1)),envelope.id+' is blocked by a building');
  assert.ok(envelopes.every((other,j)=>j===i||!rectanglesOverlap(envelope,other,1)),envelope.id+' overlaps another parked aircraft');
 }
});

test('all eight stand-to-immigration walks remain clear of the control tower and hangar',()=>{
 for(const stand of AIRPORT.stands){
  const flight={id:'WALK-'+stand.id,airportId:'city',standId:stand.id,arrivalStand:stand,inboundAt:0,parkedAt:1020,sector:'west',direction:1};
  const path=visitorArrivalPath(flight,9,120);assert.ok(path.length>=5);
  assert.deepEqual({x:path.at(-1).x,z:path.at(-1).z},AIRPORT.gate);
  for(let i=1;i<path.length;i++){
   const from=path[i-1],to=path[i],steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.5));
   for(let n=0;n<=steps;n++){
    const t=n/steps,p={x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t,y:from.y+(to.y-from.y)*t};
    const obstruction=BUILDINGS.find(building=>building.id!=='airport'&&building.h>p.y&&contains(building,p,.35));
    assert.equal(obstruction,undefined,`${stand.id} passenger walk intersects ${obstruction?.id} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
   }
  }
 }
});


test('ten returning passengers board real seats and pay 200 H$ each way without repeat airline or visa charges after restore',()=>{
 const t=internationalAirport(),treasury=t.countries.countryAccount('hansdrex').cash;
 assert.equal(t.visitors.queueAircraft(10,'city'),true);
 const inbound=t.state.cityVisitors.airportTraffic.flights[0],ids=[...inbound.arrivalPassengerIds];
 t.tick(visitorArrivalPath(inbound,9,120).at(-1).at+1);
 assert.equal(t.state.businesses['hansdrex-airline'].cash,2000);assert.equal(t.countries.countryAccount('hansdrex').cash,treasury+500);
 for(const person of t.state.cityVisitors.visitors){person.departAt=t.state.simulationAgeSeconds;person.travelGoalsCompleted=[...person.travelGoals];}
 let returning;
 for(let i=0;i<120&&!returning;i++){
  t.tick(t.state.simulationAgeSeconds+120);
  returning=t.state.cityVisitors.airportTraffic.flights.find(flight=>flight.passengerIds?.length===10);
 }
 assert.ok(returning,'all ten guests must receive an actual outbound manifest');
 assert.deepEqual(new Set(returning.passengerIds),new Set(ids));
 t.tick(Math.max(t.state.simulationAgeSeconds,returning.boardAt));
 assert.equal(t.state.businesses['hansdrex-airline'].cash,4000);
 assert.ok(t.state.cityVisitors.visitors.every(person=>person.onPlane));
 const flightId=returning.id,paid=t.state.businesses['hansdrex-airline'].cash;
 t.restore();returning=t.state.cityVisitors.airportTraffic.flights.find(flight=>flight.id===flightId);
 t.tick(t.state.simulationAgeSeconds+1);assert.equal(t.state.businesses['hansdrex-airline'].cash,paid);
 t.tick(returning.exitAt+1);
 assert.equal(t.state.cityVisitors.totalDepartures,10);assert.equal(t.state.businesses['hansdrex-airline'].cash,4000);
 assert.equal(t.state.internationalLife.visaRevenue,500);assert.equal(t.countries.countryAccount('hansdrex').cash,treasury+500);
 assert.ok(!t.state.cityVisitors.airportTraffic.flights.some(flight=>flight.id===flightId));
 assert.equal(t.visitors.queueAircraft(10,'city'),true,'the departed aircraft releases its stand for a new real manifest');
});

test('both runway IDs are used for overlapping operations while shared taxi movements stay separated',()=>{
 const {visitorRunwayReservation}=airportTraffic;
 assert.equal(typeof visitorRunwayReservation,'function');
 const first=visitorRunwayReservation(3600,1020,[],'city');
 const a={id:'CONCURRENT-A',airportId:'city',standId:AIRPORT.stands[0].id,arrivalStand:AIRPORT.stands[0],sector:'west',direction:1,runwayId:first.runwayId,inboundAt:first.at,parkedAt:first.at+1020,outboundAt:null,exitAt:null};
 const second=visitorRunwayReservation(3600,1020,[a],'city');
 const b={id:'CONCURRENT-B',airportId:'city',standId:AIRPORT.stands[1].id,arrivalStand:AIRPORT.stands[1],sector:'east',direction:-1,runwayId:second.runwayId,inboundAt:second.at,parkedAt:second.at+1020,outboundAt:null,exitAt:null};
 assert.notEqual(first.runwayId,second.runwayId);assert.ok(second.at<a.parkedAt,'second strip allows a real concurrent approach');
 for(const flight of [a,b]){
  const assigned=AIRPORT.runways.find(runway=>runway.id===flight.runwayId),touchdown=visitorAircraftPose(flight.inboundAt+520,flight);
  assert.equal(touchdown.z,assigned.z);assert.equal(touchdown.y,3);assert.ok(Math.abs(touchdown.x-assigned.x)<assigned.w/2);
  for(let elapsed=520;elapsed<=1020;elapsed+=5){
   const pose=visitorAircraftPose(flight.inboundAt+elapsed,flight);
   const obstruction=BUILDINGS.find(building=>building.h>pose.y&&contains(building,pose,8.8));
   assert.equal(obstruction,undefined,`${flight.id} taxi envelope touches ${obstruction?.id}`);
   const other=AIRPORT.runways.find(runway=>runway.id!==flight.runwayId);
   if(contains(other,pose,0))assert.fail(`${flight.id} taxis across the other active strip`);
  }
  const departing={...flight,outboundAt:20000,exitAt:21080};
  for(let elapsed=0;elapsed<460;elapsed+=5){
   const pose=visitorAircraftPose(departing.outboundAt+elapsed,departing);
   const other=AIRPORT.runways.find(runway=>runway.id!==flight.runwayId);
   assert.ok(!contains(other,pose,0),`${flight.id} departure taxi crosses the other active strip`);
   const obstruction=BUILDINGS.find(building=>building.h>pose.y&&contains(building,pose,8.8));
   assert.equal(obstruction,undefined,`${flight.id} departure taxi envelope touches ${obstruction?.id}`);
  }
 }
 // Use the renderer's actual 17.6m wing span / ~19m fuselage envelope, rotated
 // with its heading, rather than merely testing different centre points.
 const corners=pose=>{const c=Math.cos(pose.heading),s=Math.sin(pose.heading);return [-1,1].flatMap(x=>[-1,1].map(z=>({x:pose.x+x*8.8*c+z*9.6*s,z:pose.z-x*8.8*s+z*9.6*c})));};
 const overlap=(one,two)=>{
  const p=corners(one),q=corners(two),axes=[one.heading,one.heading+Math.PI/2,two.heading,two.heading+Math.PI/2];
  return axes.every(angle=>{const c=Math.cos(angle),s=Math.sin(angle),a=p.map(v=>v.x*c+v.z*s),b=q.map(v=>v.x*c+v.z*s);return Math.max(...a)>Math.min(...b)&&Math.max(...b)>Math.min(...a);});
 };
 for(let time=3600;time<=Math.max(a.parkedAt,b.parkedAt)+60;time+=5){
  const p=visitorAircraftPose(time,a),q=visitorAircraftPose(time,b);
  if(p&&q&&p.y<8&&q.y<8)assert.equal(overlap(p,q),false,`concurrent airliners overlap at ${time}`);
 }
});

test('stand reservations consider actual spatial occupancy and release only after a real aircraft leaves',()=>{
 const {visitorStandReservation,visitorStandReleaseAt}=airportTraffic;
 assert.equal(typeof visitorStandReservation,'function');
 const pool=visitorStands('city');assert.equal(pool.length,7,'the eighth physical stand stays available to regional services');
 const occupied=pool.map((stand,i)=>({id:'OCCUPIED-'+i,airportId:'city',standId:stand.id,arrivalStand:stand,runwayId:AIRPORT.runways[i%2].id,inboundAt:-1020,parkedAt:0,outboundAt:null,exitAt:null}));
 assert.equal(visitorStandReservation(3600,occupied,'city'),null);
 occupied[0].outboundAt=10000;occupied[0].exitAt=11080;
 assert.equal(visitorStandReleaseAt(occupied[0]),10140);
 const later=visitorStandReservation(3600,occupied,'city');
 assert.ok(later);assert.equal(later.stand.id,pool[0].id);assert.ok(later.at+1020>=10140);
 occupied[0].aircraftGone=true;
 const released=visitorStandReservation(3600,occupied,'city');assert.ok(released);assert.equal(released.stand.id,pool[0].id);assert.ok(released.at<later.at);
 const legacy={id:'RESTORED-LEGACY',airportId:'city',standId:'CITY-STAND-1',arrivalStand:{x:-225,z:-443},inboundAt:0,parkedAt:1020,outboundAt:null,exitAt:null};
 const available=visitorStandReservation(3600,[legacy],'city');
 assert.ok(Math.hypot(available.stand.x-legacy.arrivalStand.x,available.stand.z-legacy.arrivalStand.z)>=24,'legacy parking blocks nearby new stands by physical coordinates');
});


function grandPrixAirport(startDay=20){
 const paddock=NORTH_F1_CIRCUIT.paddock;
 let state={simulationAgeSeconds:(startDay+.1)*86400,timeScale:120,weather:{condition:'clear',precipitation:0,wind:0},businesses:{},housing:{households:{},apartmentBlocks:[],houseLots:[]},treasury:{cash:100000},totalTransactions:0,
  flies:Array.from({length:20},(_,i)=>({id:`AIR-TEST-DRIVER-${i}`,brain:{id:`AIR-TEST-BRAIN-${i}`},alive:true,ageYears:32,health:95,energy:90,money:300,savings:100,traits:{ambition:.7,resilience:.7},x:paddock.x,z:paddock.z,homeX:paddock.x,homeZ:paddock.z,currentLocationId:paddock.id,citizenshipCountryId:i<15?'hansdrex':'north-city'}))};
 let countries,visitors,system;
 function rebuild(){
  countries=createInternationalLife({world:()=>state,redistribute:false,nationalEconomy:false});countries.init();
  visitors=createCityVisitors({world:()=>state});visitors.init();
  system=createNorthF1({world:()=>state,northAccount:()=>countries.countryAccount('north-city'),travelCost:countries.travelCost,lawfulPresence:countries.lawfulPresence,aviationAdmission:countries.aviationAdmission,
   interceptMovement:countries.interceptMovement,bookEventHotel:visitors.reserveEventRoom,releaseEventHotel:visitors.releaseEventRoom});
 }
 rebuild();system.tick();state.simulationAgeSeconds=state.northF1.nextAt-72*3600;system.tick();
 return {get state(){return state;},get system(){return system;},get event(){return state.northF1.event;},
  tick(at){assert.ok(at>=state.simulationAgeSeconds);state.simulationAgeSeconds=at;system.tick();},restore(){state=JSON.parse(JSON.stringify(state));rebuild();}};
}

test('Grand Prix foreign demand varies in complete ten-person manifests between 200 and 300 people',()=>{
 const sizes=new Set();
 for(let seed=0;seed<12;seed++){
  const t=grandPrixAirport(20+seed),event=t.event;
  assert.ok(event);assert.ok(event.charterDemand>=200&&event.charterDemand<=300);assert.equal(event.charterDemand%10,0);
  assert.equal(event.charters.length,event.charterDemand/10);assert.ok(event.charters.length>=20&&event.charters.length<=30);
  assert.ok(event.charters.every(flight=>flight.arrivingGuests===10&&flight.guests.length===10));
  const north=event.charters.filter(f=>f.airportId==='north'),hans=event.charters.filter(f=>f.airportId==='city');
  assert.ok(Math.abs(hans.length-3*north.length)<=2,'complete ten-seat aircraft round the 3:1 tourism split');
  assert.ok(hans.every(f=>f.guests.every(g=>g.nights>=2)&&f.earliestAt<event.startsAt-86400));
  assert.ok(north.every(f=>f.guests.every(g=>g.nights===0)&&f.earliestAt>event.startsAt-86400));
  const people=event.charters.flatMap(flight=>flight.guests);
  assert.equal(new Set(people.map(person=>person.id)).size,event.charterDemand);
  assert.ok(people.every(person=>person.originCountryId==='outside'&&person.citizenshipCountryId==='outside'));
  assert.equal(t.state.northF1.charterArrivals,0,'creating a reservation is not admission');
  sizes.add(event.charterDemand);
 }
 assert.ok(sizes.size>1,'independent events should not all request the same foreign cohort');
});

test('restored fifty-person reservations split into ten-seat flights without changing admitted guests or counting unscheduled passengers as arrivals',()=>{
 const at=100000,state={simulationAgeSeconds:at,timeScale:120,northF1:{charterArrivals:50,externalInflow:15000},businesses:{}};
 const guests=(prefix,phase)=>Array.from({length:50},(_,i)=>({id:prefix+i,phase,money:300,initialCash:300,savings:0}));
 const landed={id:'LEGACY-LANDED',airportId:'city',standId:'CITY-GP-1',inboundAt:at-3000,parkedAt:at-1980,landed:true,guests:guests('ADMITTED-','visiting')};
 const future={id:'LEGACY-FUTURE',airportId:'north',standId:'NORTH-CHARTER-1',inboundAt:at+4000,parkedAt:at+5020,landed:false,guests:guests('FUTURE-','inbound')};
 const event={id:'LEGACY-EVENT',format:2,charterPlanned:true,startsAt:at+86400,endsAt:at+172800,charters:[landed,future]};
 state.northF1.event=event;
 const service=createF1Charters({world:()=>state});
 const ids=event.charters.flatMap(f=>f.guests.map(g=>g.id)).sort();
 service.make(event);
 assert.equal(event.charters.length,6);assert.equal(event.charters[0],landed);
 assert.equal(landed.guests.length,50);assert.ok(landed.guests.every(g=>g.money===300&&g.initialCash===300&&g.legacyAirlineContract));
 const batches=event.charters.slice(1);
 assert.ok(batches.every(f=>f.guests.length===10&&f.arrivingGuests===10&&!Number.isFinite(f.parkedAt)&&!Number.isFinite(f.inboundAt)));
 assert.ok(batches.flatMap(f=>f.guests).every(g=>g.money>=750&&g.initialCash===g.money&&g.visitorReservedBudget>=200&&!g.legacyAirlineContract));
 assert.deepEqual(event.charters.flatMap(f=>f.guests.map(g=>g.id)).sort(),ids);
 assert.equal(state.northF1.charterArrivals,50);assert.equal(state.northF1.externalInflow,15000);
 const once=JSON.stringify(event);service.make(event);assert.equal(JSON.stringify(event),once,'saved cohort migration is idempotent');
 // With all real stands occupied indefinitely, null schedule timestamps must
 // never be interpreted as epoch-zero landing or immigration completion.
 state.cityVisitors={airportTraffic:{flights:visitorStands('north').map((stand,i)=>({id:'BLOCK-'+i,airportId:'north',arrivalStand:stand,standId:stand.id,inboundAt:0,parkedAt:1020,landed:true,outboundAt:null,exitAt:null}))}};
 const blocked={id:'BLOCKED-EVENT',format:2,tenPassengerVersion:1,charterPlanned:true,charters:[batches[0]],startsAt:at+86400,endsAt:at+172800};
 state.northF1.event=blocked;
 let admissions=0;
 const waiting=createF1Charters({world:()=>state,admit:()=>{admissions++;return {allowed:true};}});
 waiting.tick(blocked);
 assert.equal(admissions,0);assert.equal(state.northF1.charterArrivals,50);
 assert.ok(blocked.charters[0].guests.every(g=>g.phase==='inbound'&&!Number.isFinite(g.terminalAt)));
});

for(const seed of [20,22,27])test(`bulk foreign arrivals rotate finite stands and retain physical journeys and receipts through storm/restart (event seed ${seed})`,()=>{
 const t=grandPrixAirport(seed),startsAt=t.event.startsAt,eventId=t.event.id,demand=t.event.charterDemand;
 const identities=t.event.charters.flatMap(flight=>flight.guests.map(person=>person.id)).sort();
 let restarted=false,sawStairs=false,sawImmigration=false,previous=new Map();
 const admittedAt=new Map();
 for(let at=t.state.simulationAgeSeconds+180;at<=startsAt;at+=180){
  const storm=at>=startsAt-51*3600&&at<startsAt-49*3600;
  Object.assign(t.state.weather,{condition:storm?'thunderstorm':'clear',precipitation:storm?.9:0});
  t.tick(at);
  const event=t.event;
  const parked=event.charters.map(flight=>({flight,pose:visitorAircraftPose(at,flight)})).filter(({pose})=>pose?.phase==='parked');
  for(let i=0;i<parked.length;i++)for(let j=i+1;j<parked.length;j++)if(parked[i].flight.airportId===parked[j].flight.airportId){
   assert.ok(Math.hypot(parked[i].pose.x-parked[j].pose.x,parked[i].pose.z-parked[j].pose.z)>=24,`two charter aircraft occupy the same stand at ${at}: ${JSON.stringify([parked[i],parked[j]].map(({flight,pose})=>({id:flight.id,airport:flight.airportId,stand:flight.standId,inboundAt:flight.inboundAt,parkedAt:flight.parkedAt,outboundAt:flight.outboundAt,exitAt:flight.exitAt,expectedRelease:flight.expectedStandReleaseAt,standReleasedAt:flight.standReleasedAt,aircraftGone:flight.aircraftGone,pose})))}`);
  }
  const publicPeople=t.system.snapshot().foreignVisitors;
  assert.ok(Array.isArray(publicPeople),'public observers receive the real foreign-person records');
  for(const person of publicPeople){
   assert.ok([person.x,person.y,person.z].every(Number.isFinite));
   if(!person.onPlane&&/stairs/i.test(person.action||''))sawStairs=true;
   if(!person.onPlane&&/immigration/i.test(person.action||''))sawImmigration=true;
   const before=previous.get(person.id);
   if(before&&!before.onPlane&&!person.onPlane&&before.y<10&&person.y<10&&at-before.at<=360){
    assert.ok(Math.hypot(person.x-before.x,person.y-before.y,person.z-before.z)<=50,`${person.id} teleported during a public ground journey`);
   }
  }
  previous=new Map(publicPeople.map(person=>[person.id,{...person,at}]));
  for(const flight of event.charters)for(const person of flight.guests){
   const airEntries=(person.countryEntryReceipts||[]).filter(receipt=>receipt.via==='air');
   if(airEntries.length){assert.equal(airEntries.length,1,`${person.id} paid for the same international arrival more than once`);assert.equal(airEntries[0].fee,50);admittedAt.set(person.id,airEntries[0].at);}
  }
  if(!restarted&&at>=startsAt-36*3600){
   const arrivals=t.state.northF1.charterArrivals,airline=t.state.businesses['hansdrex-airline']?.cash||0;
   t.restore();restarted=true;
   assert.equal(t.event.id,eventId);assert.equal(t.state.northF1.charterArrivals,arrivals);assert.equal(t.state.businesses['hansdrex-airline']?.cash||0,airline);
   assert.deepEqual(t.event.charters.flatMap(flight=>flight.guests.map(person=>person.id)).sort(),identities);
  }
 }
 assert.equal(t.state.northF1.charterArrivals,demand,'the booked foreign cohort clears the airport before the scheduled green light');
 assert.equal(admittedAt.size,demand);assert.ok([...admittedAt.values()].every(at=>at<=startsAt));
 assert.equal(t.state.businesses['hansdrex-airline'].cash,demand*200);
 assert.ok(sawStairs,'foreign people are visible walking down aircraft stairs');assert.ok(sawImmigration,'foreign people are visible at immigration');
});
