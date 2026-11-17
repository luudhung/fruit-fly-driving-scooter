import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNorthF1,NORTH_F1_RULES} from '../worker/north-f1.mjs';
import {NORTH_F1_CIRCUIT,NORTH_F1_GARAGES,NORTH_F1_GRANDSTANDS,NORTH_F1_PIT_APRON,NORTH_F1_PIT_BOXES,NORTH_F1_PIT_BOX_LENGTH,NORTH_F1_PIT_BOX_WIDTH,northF1PitPose,northF1Pose,northF1RacePose} from '../worker/north-f1-map.mjs';
import {F1_TARGET_SPEED,planF1Motion,sampleF1Motion} from '../worker/north-f1-motion.mjs';
import {createCityVisitors} from '../worker/city-visitors.mjs';
import {createInternationalLife} from '../worker/international-life.mjs';

const DAY=86400,HOUR=3600;
const {paddock,spectator}=NORTH_F1_CIRCUIT;
function fixture(actors=[]){
 const state={simulationAgeSeconds:DAY*.1,timeScale:120,weather:{},businesses:{},treasury:{cash:0},totalTransactions:0,flies:actors};
 const intl=createInternationalLife({world:()=>state,redistribute:false,nationalEconomy:false});
 const north=intl.countryAccount('north-city');
 const visitors=createCityVisitors({world:()=>state});
 visitors.init();
 const system=createNorthF1({world:()=>state,northAccount:()=>north,travelCost:intl.travelCost,lawfulPresence:intl.lawfulPresence,aviationAdmission:intl.aviationAdmission,
  interceptMovement:intl.interceptMovement,bookEventHotel:visitors.reserveEventRoom,releaseEventHotel:visitors.releaseEventRoom});
 const step=at=>{state.simulationAgeSeconds=at;system.tick();};
 system.tick();step(state.northF1.nextAt-36*HOUR);
 const totalCash=()=>state.treasury.cash+Object.values(state.businesses).reduce((sum,b)=>sum+Number(b.cash||0),0)+state.flies.reduce((sum,f)=>sum+Number(f.money||0)+Number(f.savings||0),0)+system.liquidCash();
 return {state,system,intl,north,step,event:state.northF1.event,totalCash,initialCash:totalCash()};
}
function driver(i){
 return {id:`DRIVER-${i}`,alive:true,ageYears:32,health:95,money:180,savings:30,traits:{ambition:.7,resilience:.7},
  x:paddock.x,z:paddock.z,homeX:paddock.x,homeZ:paddock.z,currentLocationId:paddock.id,citizenshipCountryId:i<15?'hansdrex':'north-city'};
}
function patron(id,x,z){
 return {id,alive:true,ageYears:27,health:92,money:150,savings:0,x,z,homeX:x,homeZ:z,citizenshipCountryId:'hansdrex'};
}

test('North GP professional field has ten real teams, twenty local drivers, a sixty-two lap race and tyre pit stops',()=>{
 const drivers=Array.from({length:20},(_,i)=>driver(i)),{system,step,event,state}=fixture(drivers);
 assert.equal(system.snapshot().teams.length,10);
 assert.ok(system.snapshot().teams.every(t=>t.drivers.length===2));
 assert.equal(new Set(system.snapshot().teams.flatMap(t=>t.drivers)).size,20);
 assert.ok(system.snapshot().teams.flatMap(t=>t.drivers).every(id=>drivers.some(f=>f.id===id)));
 assert.equal(event.startsAt%DAY,19*HOUR);
 step(event.startsAt);
 assert.equal(system.snapshot().activeRace.cars.length,20);
 assert.equal(system.snapshot().activeRace.startsAt,event.startsAt);
 const field=system.snapshot().activeRace.cars;
 assert.equal(field.filter(c=>c.countryId==='hansdrex').length,15);
 assert.equal(field.filter(c=>c.countryId==='north-city').length,5);
 assert.equal(NORTH_F1_RULES.laps,62);
 assert.equal(new Set(state.northF1.event.cars.map(c=>c.pitBox)).size,20);
 for(const c of state.northF1.event.cars){
  const box=NORTH_F1_PIT_BOXES[c.pitBox];
  assert.equal(system.snapshot().teams[box.teamIndex].drivers[box.driverIndex],c.driverId);
  for(const stop of c.segments.filter(s=>s.pitPhase==='changing tyres')){
   const sample=sampleF1Motion(c.segments,(stop.start+stop.end)/2);
   const pose=northF1RacePose(sample,c.lane,c.pitBox);
   assert.ok(Math.hypot(pose.x-box.x,pose.z-box.z)<.01);
   const savedPose=northF1RacePose({progress:sample.progress,pit:.43},c.lane,c.pitBox,true);
   assert.ok(Math.hypot(savedPose.x-box.x,savedPose.z-box.z)<.01,'old running races align without replacing their timings');
  }
 }

 const car=state.northF1.event.cars[0],stop=car.segments.find(s=>s.pitPhase==='changing tyres');
 assert.ok(stop.end>stop.start);
 const position=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 assert.ok(position(northF1Pose(NORTH_F1_CIRCUIT.pit.enter),northF1PitPose(0))<.1);
 assert.ok(position(northF1Pose(NORTH_F1_CIRCUIT.pit.exit),northF1PitPose(1))<.1);
 const first=sampleF1Motion(car.segments,stop.start+.2),last=sampleF1Motion(car.segments,stop.end-.2),leaving=sampleF1Motion(car.segments,stop.end+.2);
 assert.equal(first.pit,last.pit);
 assert.notEqual(first.compound,leaving.compound);
 assert.equal(leaving.wear,0);
 step(event.endsAt);
 assert.equal(system.snapshot().races,1);
 assert.equal(system.snapshot().lastRace.results.length,20);
 assert.ok(system.snapshot().lastRace.results.every(r=>r.laps===62&&r.stops>=1));
 step(event.endsAt+1);
 assert.equal(state.northF1.nextAt,event.startsAt+5*DAY);
});

test('foreign visitor snapshots identify the active car leg and stop prediction before the walk back onto the pavement',()=>{
 const {system,event}=fixture(),guest=event.charters[0].guests[0],key='airport>hotel';
 Object.assign(guest,{phase:'visiting',x:0,y:1.1,z:-40,onPlane:false,indoors:false,motion:null,leg:{key,index:1,destination:'hotel',at:0}});
 event.tourPaths||={};event.tourPaths[key]=[
  {x:0,y:1.1,z:-40,mode:'walk'},
  {x:0,y:1.1,z:-60,mode:'car'},
  {x:0,y:1.1,z:-80,mode:'car'},
  {x:4,y:1.1,z:-80,mode:'walk'},
 ];
 const view=()=>system.snapshot().foreignVisitors.find(f=>f.id===guest.id);
 const driving=view();assert.equal(driving.transitMode,'car');assert.equal(driving.traveling,true);
 assert.equal(driving.motion.mode,'car');assert.equal(driving.motion.points.length,2);
 assert.ok(driving.motion.points.every(p=>p.mode==='car'));
 assert.equal(driving.vehicle,undefined,'a temporary road trip is not permanent car ownership');
 guest.leg.blocked=true;assert.equal(view().motion.blocked,true,'a blocked trip cannot predict through its obstacle');
 guest.leg.index=3;assert.equal(view().transitMode,'walk');assert.equal(view().motion.points.length,1);
 guest.leg=null;const arrived=view();assert.equal(arrived.transitMode,'walk');assert.equal(arrived.traveling,false);assert.equal(arrived.motion,null);
});

test('past protection records do not block actual residents from reporting to the paddock',()=>{
 const residents=Array.from({length:20},(_,i)=>driver(i));
 const {system,step,event}=fixture(residents);
 const a=residents[0],b=residents[1];
 a.warResponse={active:false,peaceAt:event.startsAt-2*DAY};
 a.arrestedUntil=event.startsAt-DAY*2;
 b.warResponse={active:true};
 step(event.startsAt-HOUR);
 assert.ok(system.handleResident(a,{hour:18}));
 assert.equal(a.f1Duty.role,'driver');
 assert.equal(system.handleResident(b,{hour:18}),false);
 assert.equal(b.f1Duty,undefined);
});

test('each lap is timed with map distance at six times the motorway baseline and degrades with tyre wear',()=>{
 const plan=planF1Motion(NORTH_F1_CIRCUIT,{startAt:0,timeScale:120,laps:62,pace:1,seed:.5});
 const [newTyre,used]=plan.segments;
 assert.ok(Math.abs(newTyre.end/(NORTH_F1_CIRCUIT.lapLength/F1_TARGET_SPEED*120)-1)<.001);
 assert.ok(used.end-used.start>newTyre.end-newTyre.start);
 const finish=sampleF1Motion(plan.segments,plan.finishedAt+1);
 assert.equal(finish.progress,62);
 assert.ok(plan.finishedAt<DAY);
});

test('a grandstand ticket requires physically arriving, and is charged only once after legal entry',()=>{
 const f=patron('HANS-FAN',-440,-510),{system,intl,north,event,step,state}=fixture([f,...Array.from({length:20},(_,i)=>driver(i))]);
 step(event.startsAt-3*HOUR);
 f.currentLocationId=spectator.id;
 assert.equal(system.attend(f),false);
 const at={x:-526,z:-560},after={x:-526,z:-580};
 assert.ok(intl.interceptMovement(f,at,after,{mode:'walk'}).allowed);
 Object.assign(f,{x:spectator.x,z:spectator.z});
 const before=f.money+f.savings,treasury=north.cash;
 assert.ok(system.attend(f));assert.equal(system.attend(f),false);
 assert.equal(before-f.money-f.savings,event.price);
 assert.ok(Math.abs(north.cash-treasury-event.price*.15)<.001);
 assert.equal(state.northF1.hansdrexVisitors,1);
 assert.equal(f.countryEntryReceipts[0].fee,50);
});

test('three hundred physically present foreign fans can buy tickets without consuming either national quota',()=>{
 const hansFans=Array.from({length:12},(_,i)=>({...patron('HANS-LOCAL-'+i,0,0),homeX:0,homeZ:0}));
 const northFans=Array.from({length:12},(_,i)=>({...patron('NORTH-LOCAL-'+i,spectator.x,spectator.z),citizenshipCountryId:'north-city',homeX:spectator.x,homeZ:spectator.z}));
 const {system,intl,event,step,state}=fixture([...Array.from({length:20},(_,i)=>driver(i)),...hansFans,...northFans]);
 step(event.startsAt-HOUR);
 assert.equal(NORTH_F1_RULES.charterLimit,300);
 assert.ok(event.fanTarget>0&&event.northFanTarget>0);
 const present=(f,id)=>{
  assert.ok(intl.aviationAdmission(f,{airportId:'north',flightId:id,toCountryId:'north-city'}).allowed);
  Object.assign(f,{x:spectator.x,z:spectator.z,y:1.1,currentLocationId:spectator.id,traveling:false,onPlane:false,onTrain:false});
  return f;
 };
 assert.ok(system.attend(present(hansFans[0],'local-flight')));
 Object.assign(northFans[0],{currentLocationId:spectator.id,traveling:false});
 assert.ok(system.attend(northFans[0]));
 const quotas={hansdrex:event.audience.hansdrex,north:event.audience.north};
 const guests=Array.from({length:301},(_,i)=>({...patron('OUTSIDE-FAN-'+i,0,0),kind:'visitor',citizenshipCountryId:'outside',originCountryId:'outside',money:1000,returnFareReserve:200}));
 for(const f of guests.slice(0,300))assert.ok(system.attend(present(f,'visitor-flight-'+Math.floor(Number(f.id.split('-').at(-1))/10))),f.id);
 assert.equal(event.audience.visitors,300);
 assert.equal(event.audience.total,302);
 assert.ok(event.audience.total<NORTH_F1_CIRCUIT.capacity);
 assert.deepEqual({hansdrex:event.audience.hansdrex,north:event.audience.north},quotas);
 const revenue=state.northF1.revenue,firstMoney=guests[0].money;
 assert.equal(system.attend(guests[0]),false,'the same visitor cannot buy a duplicate entry');
 assert.equal(system.attend(present(guests[300],'extra-visitor-flight')),false,'the foreign quota stops at300');
 assert.equal(guests[0].money,firstMoney);
 assert.equal(state.northF1.revenue,revenue);
 assert.equal(guests.slice(0,300).filter(f=>f.lastNorthF1Ticket===event.id).length,300);
});

test('the starter refunds sold tickets when the track is unsafe, and refunds only once',()=>{
 const fan={...patron('NORTH-FAN',spectator.x,spectator.z),citizenshipCountryId:'north-city',currentLocationId:spectator.id};
 const {state,system,step,event,north}=fixture([fan,...Array.from({length:20},(_,i)=>driver(i))]);
 const beforeTreasury=north.cash;
 step(event.startsAt-HOUR);
 assert.ok(system.attend(fan));
 assert.equal(fan.money,150-event.price);
 state.weather.condition='thunderstorm';
 step(event.startsAt);
 assert.equal(event.status,'cancelled');
 assert.equal(fan.money,150);
 assert.ok(north.cash>=beforeTreasury);
 assert.equal(system.snapshot().ticketTax,0);
 assert.equal(system.snapshot().revenue,0);
 assert.equal(system.snapshot().visits,0);
 step(event.startsAt+1);
 assert.equal(fan.money,150);
});

test('200–300 overseas fans arrive through both airports and choose day trips or paid Hansdrex stays',()=>{
 const {system,intl,event,step,state,totalCash,initialCash}=fixture(Array.from({length:20},(_,i)=>driver(i)));
 const endDay=Math.floor(event.startsAt/DAY)*DAY+DAY;
 for(let at=event.startsAt-72*HOUR;at<=event.startsAt+4*DAY;at+=240)step(at);
 const report=system.snapshot(),flights=event.charters;
 const guests=flights.flatMap(f=>f.guests);
 assert.equal(flights.reduce((n,f)=>n+f.guests.length,0),event.charterDemand);
 assert.ok(event.charterDemand>=200&&event.charterDemand<=300);
 assert.ok(flights.every(f=>f.guests.length===10));
 assert.deepEqual(new Set(flights.map(f=>f.airportId)),new Set(['city','north']));
 assert.ok(flights.filter(f=>f.parkedAt<event.startsAt-DAY).length>=2);
 assert.ok(guests.every(f=>f.phase!=='inbound'),JSON.stringify(flights.map(f=>({id:f.id,phase:f.guests[0].phase}))));
 assert.equal(guests.filter(f=>f.phase==='departed').length,event.charterDemand,JSON.stringify(flights.map(f=>({id:f.id,time:f.outboundAt,phases:f.guests.reduce((a,v)=>(a[v.phase]=(a[v.phase]||0)+1,a),{}),at:f.guests.find(v=>v.phase!=='departed')?.currentLocationId}))));
 assert.equal(guests.filter(f=>f.watched&&f.lastNorthF1Ticket===event.id).length,event.audience.visitors,'count only physically admitted spectators with paid entry');
 assert.equal(event.audience.visitors,event.charterDemand,`Only ${report.visitors} charter visitors were counted at the circuit`);
 assert.ok(report.hotelBookings>100);
 assert.ok(report.hansdrexSightVisits>50);
 assert.ok(flights.every(f=>f.exitAt<event.startsAt),'arrival aircraft vacate the stands before the race');
 assert.ok(flights.every(f=>f.returnLeg?.exitAt>event.startsAt),'actual return equipment collects the guests after their visits');
 assert.ok(guests.some(f=>f.nights===0)&&guests.some(f=>f.nights>0));
 assert.ok(intl.snapshot().visaRevenue>=50*event.charterDemand);

 assert.ok(Math.abs(totalCash()+state.northF1.externalOutflow-state.northF1.externalInflow-initialCash)<1e-5,
 JSON.stringify({cash:totalCash(),out:state.northF1.externalOutflow,imported:state.northF1.externalInflow,initialCash}));

});

test('the local spectator lottery uses 20–30% of Hansdrex and 30% of North City',()=>{
 const drivers=Array.from({length:20},(_,i)=>driver(i));
 const hans=Array.from({length:100},(_,i)=>patron('H'+i,0,0));
 const north=Array.from({length:100},(_,i)=>({...patron('N'+i,-300,-790),citizenshipCountryId:'north-city'}));
 const {event}=fixture([...drivers,...hans,...north]);
 const residents=[...drivers,...north,...hans],hansCount=residents.filter(f=>f.homeZ>=-570).length,northCount=residents.length-hansCount;
 assert.ok(event.fanTarget>=Math.round(hansCount*.2)&&event.fanTarget<=Math.round(hansCount*.3));
 assert.equal(event.northFanTarget,Math.round(northCount*.3));
 assert.ok(Object.keys(event.fanInvites).length<=event.fanTarget);
 assert.ok(Object.keys(event.northInvites).length<=event.northFanTarget);
});

test('North City circuit has a continuous main track, a separate pit lane and a clear street surface',async()=>{
 const {NORTH_F1_CIRCUIT,northF1Pose,northF1PitPose,onNorthF1Track}=await import('../worker/north-f1-map.mjs');
 const {BUILDINGS,WATER}=await import('../worker/city-map.mjs');
 assert.ok(NORTH_F1_CIRCUIT.lapLength>=1900);
 assert.ok(NORTH_F1_CIRCUIT.width>=16);
 const {pit}=NORTH_F1_CIRCUIT;
 for(const [at,progress] of [[0,pit.enter],[1,pit.exit]]){
  const a=northF1Pose(progress),b=northF1PitPose(at);
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.01,'pit lane meets the track at both ends');
 }
 assert.equal(onNorthF1Track(northF1PitPose(pit.box)),false);
 for(let i=0;i<400;i++){
  const p=northF1Pose(i/400);
  assert.ok(onNorthF1Track(p));
  assert.ok(![...BUILDINGS,...WATER].some(b=>Math.abs(p.x-b.x)<b.w/2+5&&Math.abs(p.z-b.z)<b.d/2+5));
 }
});


test('all seven North City grandstands face a clear track and each painted pit box fits on the apron',async()=>{
 const {BUILDINGS,ROADS,WATER,contains,overlaps,pedestrianRoute}=await import('../worker/city-map.mjs');
 const {NORTH_SPORTS_PARK}=await import('../worker/country-map.mjs');
 const occupied=[...BUILDINGS,...ROADS,...WATER,NORTH_SPORTS_PARK.golf,NORTH_SPORTS_PARK.football,...NORTH_SPORTS_PARK.tennis];
 const track=Array.from({length:800},(_,i)=>northF1Pose(i/800));
 assert.equal(NORTH_F1_GRANDSTANDS.length,7);
 for(const stand of NORTH_F1_GRANDSTANDS){
  assert.ok(!occupied.some(land=>land.id!==stand.id&&overlaps(land,stand,.5)),stand.id);
  assert.ok(track.some(p=>{
   const dx=p.x-stand.x,dz=p.z-stand.z;
   return Math.hypot(dx,dz)<65&&dx*Math.sin(stand.yaw)+dz*Math.cos(stand.yaw)>Math.hypot(dx,dz)*.7;
  }),`${stand.name} should face a nearby part of the track`);
 }
 assert.ok(!occupied.some(land=>land.id!==NORTH_F1_GARAGES.id&&overlaps(land,NORTH_F1_GARAGES,.5)));
 for(let i=0;i<NORTH_F1_PIT_BOXES.length;i++){
  const current=NORTH_F1_PIT_BOXES[i];
  for(const side of [-1,1])for(const end of [-1,1])assert.ok(contains(NORTH_F1_PIT_APRON,{x:current.x+end*NORTH_F1_PIT_BOX_LENGTH/2,z:current.z+side*NORTH_F1_PIT_BOX_WIDTH/2}));
  if(i>0)assert.ok(current.x-NORTH_F1_PIT_BOXES[i-1].x>NORTH_F1_PIT_BOX_LENGTH);
 }
 assert.ok(pedestrianRoute(NORTH_F1_CIRCUIT.spectator,NORTH_F1_CIRCUIT.paddock).length>=2);
});
