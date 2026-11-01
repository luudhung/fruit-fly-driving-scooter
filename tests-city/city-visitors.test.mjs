import test from 'node:test';import assert from 'node:assert/strict';
import {createCityVisitors} from '../worker/city-visitors.mjs';
import {AIRPORT,LOCATIONS,parkingPoint,entrance,pedestrianRoute} from '../worker/city-map.mjs';
const loc=id=>LOCATIONS.find(l=>l.id===id);
const person=(id,x=-210,z=87)=>({id,name:id,kind:'resident',alive:true,brain:{id:'BRAIN-'+id,memory:{episodes:[]}},ageYears:32,generation:1,sex:'M',money:1200,savings:300,expensesLifetime:0,salaryLifetime:0,health:95,energy:95,hunger:20,thirst:20,stress:5,happiness:60,loneliness:20,excitement:20,traits:{thrift:.1,sociability:.8,ambition:.6},professionSkills:{},x,y:1.1,z,vx:0,vz:0,currentLocationId:'metro-industrial',targetLocationId:'metro-industrial',traveling:false,indoors:false,transitMode:'walk',vehicle:null,children:[],parents:[]});
function setup(){
 let state={simulationAgeSeconds:0,timeScale:120,flies:[],businesses:{},treasury:{cash:2000},centralBank:{priceLevel:1},weather:{condition:'clear',precipitation:0},totalTransactions:0};let brains=0;const events=[];
 const build=()=>createCityVisitors({world:()=>state,createVisitor:(name,index)=>({...person('seed-'+index,AIRPORT.gate.x,AIRPORT.gate.z),brain:{id:`BRAIN-TEST-${++brains}`,memory:{episodes:[]}},name}),emit:(type,text,payload)=>events.push({type,text,payload}),remember:(f,kind,payload)=>f.brain.memory.episodes.push({kind,...payload})});
 let system=build();system.init();state.cityVisitors.nextArrivalAt=Infinity;state.cityVisitors.club.nextAt=Infinity;
 const step=(seconds=120)=>{state.simulationAgeSeconds+=seconds;system.tick(seconds,{day:Math.floor(state.simulationAgeSeconds/86400)+1,hour:Math.floor(state.simulationAgeSeconds%86400/3600),minute:Math.floor(state.simulationAgeSeconds%3600/60)});};
 return {get state(){return state;},get system(){return system;},events,step,restore(){state=JSON.parse(JSON.stringify(state));system=build();system.init();state.cityVisitors.nextArrivalAt=Infinity;state.cityVisitors.club.nextAt=Infinity;}};
}
function money(s){return s.flies.reduce((n,f)=>n+f.money+f.savings,0)+s.cityVisitors.visitors.reduce((n,f)=>n+f.money+f.savings,0)+Object.values(s.businesses).reduce((n,b)=>n+b.cash,0)+s.treasury.cash;}

test('visitors own independent brains and finite prepaid hotel rooms; foreign cash is accounted explicitly',()=>{
 const h=setup(),before=money(h.state),visitors=Array.from({length:16},()=>h.system.spawnVisitor({budget:1000}));
 assert.ok(visitors.every(Boolean));assert.equal(new Set(visitors.map(v=>v.brain.id)).size,16);assert.equal(h.system.spawnVisitor(),null);assert.equal(h.state.flies.length,0);
 const rooms=h.system.snapshot().hotelRooms;assert.equal(rooms.reduce((n,x)=>n+x.occupied,0),16);assert.ok(rooms.every(x=>x.occupied<=x.capacity));
 assert.equal(h.state.cityVisitors.externalInflow,16000);assert.ok(Math.abs(money(h.state)-before-16000)<1e-6);
 const v=visitors[0],cash=v.money,total=money(h.state);assert.ok(h.system.reserveRoom(v,v.hotelId,4));assert.equal(v.money,cash);assert.equal(money(h.state),total);
});
test('a visitor physically checks in, returns to airport and departs without entering the death census',()=>{
 const h=setup(),v=h.system.spawnVisitor({budget:1000,staySeconds:86400*3});assert.ok(v);
 h.step();assert.ok(v.traveling);assert.equal(v.visitorPhase,'checking-in');
 // Follow the actual route at bounded simulation samples; no client/browser is needed.
 for(let i=0;i<2000&&!h.state.cityVisitors.hotels[v.hotelId].rooms[v.id].checkedIn;i++)h.step();
 assert.equal(h.state.cityVisitors.hotels[v.hotelId].rooms[v.id].checkedIn,true);assert.ok(v.placesVisited.length>=0);
 v.departAt=h.state.simulationAgeSeconds;for(let i=0;i<3000&&!v.departed;i++)h.step();
 assert.equal(v.departed,true);assert.equal(v.causeOfDeath,null);assert.equal(h.state.flies.length,0);assert.equal(h.system.snapshot().totalDepartures,1);assert.ok(!h.state.cityVisitors.hotels[v.hotelId].rooms[v.id]);
 assert.ok(h.state.cityVisitors.externalOutflow>0);const departed=h.state.cityVisitors.totalDepartures;h.system.depart(v);assert.equal(h.state.cityVisitors.totalDepartures,departed);
});
test('a physical taxi pickup and ride co-locates the passenger and settles a fare once, including restore',()=>{
 const h=setup(),d=person('DRIVER'),p=person('PASSENGER',-180,-378);d.vehicle='compact car';d.parkedCar=parkingPoint(d);d.x=d.parkedCar.x;d.z=d.parkedCar.z;p.kind='visitor';p.currentLocationId='airport';p.visitorPhase='staying';p.departAt=1e9;p.nextVisitAt=1e9;p.placesVisited=[];
 h.state.flies.push(d);h.state.cityVisitors.visitors.push(p);const total=money(h.state),job=h.system.requestTaxi(p,'hotel');assert.ok(job);assert.ok(d.cityService);assert.equal(p.taxiPassenger,false);
 let boarded=false;for(let i=0;i<1000&&!['complete','cancelled'].includes(job.phase);i++){
  h.step();if(job.phase==='riding'){boarded=true;assert.equal(p.taxiPassenger,true);assert.equal(p.x,d.x);assert.equal(p.z,d.z);}
 }
 assert.ok(boarded,'passenger must actually board');assert.equal(job.phase,'complete');assert.equal(p.taxiPassenger,false);assert.equal(h.state.cityVisitors.taxiCompleted,1);assert.ok(Math.abs(money(h.state)-total)<1e-6);
 const driverCash=d.money,paid=job.paid;h.system.finishTaxi(job);assert.equal(d.money,driverCash);assert.equal(job.paid,paid);
 h.restore();const restoredJob=h.state.cityVisitors.taxiJobs.find(j=>j.id===job.id);if(restoredJob)h.system.finishTaxi(restoredJob);assert.equal(h.state.cityVisitors.taxiCompleted,1);assert.ok(Math.abs(money(h.state)-total)<1e-6);
});
test('taxi cancellation refunds escrow and releases driver/passenger commitments exactly once',()=>{
 const h=setup(),d=person('DRIVER'),p=person('PASSENGER');d.vehicle='compact car';d.parkedCar=parkingPoint(d);d.x=d.parkedCar.x;d.z=d.parkedCar.z;h.state.flies.push(d,p);const before=money(h.state),cash=p.money;
 const job=h.system.requestTaxi(p,'riverside-office');assert.ok(job);h.system.finishTaxi(job,true,'test cancellation');assert.equal(p.money,cash);assert.equal(job.phase,'cancelled');assert.ok(!d.cityService&&!p.cityService&&!p.taxiPassenger);h.system.finishTaxi(job,true);assert.ok(Math.abs(money(h.state)-before)<1e-6);
});
test('camera records retain real scene metadata, bounded storage and learned photography skill',()=>{
 const h=setup(),p=person('PHOTOGRAPHER');h.state.flies.push(p);p.currentLocationId='park';const first=h.system.takePhoto(p,'park');assert.equal(first.kind,'scene-record');assert.equal(first.rendered,false);assert.ok(p.professionSkills.photography>0);assert.equal(h.system.takePhoto(p,'park'),null);
 for(let i=0;i<80;i++){h.state.simulationAgeSeconds+=1801;h.system.takePhoto(p,i%2?'park':'bridge-view');}
 assert.equal(h.state.cityVisitors.photos.length,64);assert.ok(h.state.cityVisitors.photoCount>64);assert.ok(h.state.cityVisitors.reputation>55);
 p.action='photographing the city';h.system.handleResident(p,{hour:12});const until=p.photoSession.until;h.state.simulationAgeSeconds=until;h.system.handleResident(p,{hour:12});assert.equal(p.photoSession,null);assert.equal(p.action,'finished a photography outing');
});


test('restart during an occupied taxi ride preserves reservation, passenger and one-time fare',()=>{
 const h=setup(),d=person('DRIVER'),p=person('PASSENGER',-180,-378);d.vehicle='compact car';d.parkedCar=parkingPoint(d);d.x=d.parkedCar.x;d.z=d.parkedCar.z;p.currentLocationId='airport';h.state.flies.push(d,p);
 const total=money(h.state),j=h.system.requestTaxi(p,'hotel');assert.ok(j);const id=j.id;
 for(let i=0;i<500&&j.phase!=='riding';i++)h.step();assert.equal(j.phase,'riding');
 const escrow=h.state.businesses['city-taxi-escrow'].cash;h.restore();assert.equal(h.state.businesses['city-taxi-escrow'].cash,escrow);
 let restored=h.state.cityVisitors.taxiJobs.find(x=>x.id===id);
 for(let i=0;i<1000&&!['complete','cancelled'].includes(restored.phase);i++)h.step();
 assert.equal(restored.phase,'complete');assert.equal(h.state.cityVisitors.taxiCompleted,1);assert.ok(Math.abs(money(h.state)-total)<1e-6);
 assert.equal(h.state.flies.find(f=>f.id==='PASSENGER').taxiPassenger,false);
});
test('fatal visitor injuries release hotel capacity and estate without counting a normal departure',()=>{
 const h=setup(),v=h.system.spawnVisitor({budget:1000});v.health=0;h.step();assert.equal(v.departed,true);assert.equal(v.visitorPhase,'fatality');
 assert.equal(h.system.snapshot().visitorFatalities,1);assert.equal(h.state.cityVisitors.totalDepartures,0);assert.equal(h.system.snapshot().hotelRooms.reduce((n,x)=>n+x.occupied,0),0);assert.ok(h.state.cityVisitors.externalOutflow>0);
});

test('taxi work never steals a committed firefighter, athlete or helicopter owner',()=>{
 for(const commitment of ['urbanTask','urbanFloodEscape','privateFlight','onPrivateHelicopter','sportsSession','airTrip']){
  const h=setup(),d=person('DRIVER'),p=person('PASSENGER',-180,-378);d.vehicle='compact car';d.parkedCar=parkingPoint(d);d.x=d.parkedCar.x;d.z=d.parkedCar.z;d[commitment]={id:'existing-task'};h.state.flies.push(d,p);
  const cash=money(h.state);assert.equal(h.system.requestTaxi(p,'hotel'),false,commitment);assert.equal(money(h.state),cash);assert.ok(!p.cityService);
  delete d[commitment];p[commitment]={id:'existing-task'};assert.equal(h.system.requestTaxi(p,'hotel'),false,'passenger '+commitment);assert.ok(!d.cityService);
 }
});

test('resident taxi commitments continue need and finance processing while preserving exclusive movement',()=>{
 const h=setup();let care=0,finance=0;const system=createCityVisitors({world:()=>h.state,needsAndActivities:f=>{f.hunger++;care++;},payAndFinance:()=>finance++});system.init();
 const driver=person('DRIVER');driver.cityService='TAXI-1';const hunger=driver.hunger;
 assert.equal(system.handleResident(driver,{hour:12}),true);assert.equal(driver.hunger,hunger+1);assert.equal(care,1);assert.equal(finance,1);
 driver.kind='visitor';system.handleResident(driver,{hour:12});assert.equal(care,1,'visitor needs are handled by the finite visitor lifecycle');
});

test('a taxi stops at the shared red line, exposes the hold to prediction, and resumes on green',()=>{
 const h=setup(),d=person('DRIVER'),p=person('PASSENGER',-180,-378);d.vehicle='compact car';d.parkedCar=parkingPoint(d);d.x=d.parkedCar.x;d.z=d.parkedCar.z;h.state.flies.push(d,p);
 const j=h.system.requestTaxi(p,'hotel');assert.ok(j);j.phase='riding';
 Object.assign(d,{x:-310,z:-275,targetX:-310,targetZ:-240,transitMode:'car',traveling:true,routeWaypoints:[{x:-310,z:-240,mode:'car'}],routeIndex:0});
 h.state.simulationAgeSeconds=4080;h.step(120);assert.ok(Math.abs(d.z-(-267.4))<1e-6);assert.ok(d.trafficHoldUntil>h.state.simulationAgeSeconds);assert.equal(d.trafficStatus,'waiting at red light');assert.deepEqual(d.carPosition,{x:d.x,z:d.z});assert.equal(d.motionSpeed,11);
 h.state.simulationAgeSeconds=7080;h.step(120);assert.ok(d.z>-267.4);assert.equal(d.trafficHoldUntil,0);assert.equal(d.trafficStatus,null);
});

test('unsafe hotels reject new bookings and an interrupted visitor physically returns to the airport',()=>{
 const h=setup(),closed=new Set(['hotel']);const system=createCityVisitors({world:()=>h.state,createVisitor:(name,index)=>({...person('seed-'+index),name,brain:{id:'SAFE-BRAIN-'+index,memory:{episodes:[]}}}),isUnavailable:id=>closed.has(id)});system.init();
 const v=system.spawnVisitor({budget:1000});assert.ok(v);assert.equal(v.hotelId,'riverside-hotel');const hotel=loc(v.hotelId);Object.assign(v,{x:hotel.x,z:hotel.z,currentLocationId:v.hotelId,indoors:true});
 closed.add(v.hotelId);h.state.simulationAgeSeconds=120;system.tick(120,{hour:12});assert.equal(v.departAt,120);assert.equal(v.hotelEvacuatedAt,120);assert.equal(v.visitorPhase,'departing');assert.ok(v.traveling,'interrupted guest must take a physical departure route');assert.equal(system.spawnVisitor({budget:1000}),null);
});

test('a visitor wades out of floodwater before resuming the normal finite visit',()=>{
 const h=setup(),v=h.system.spawnVisitor({budget:1000});Object.assign(v,{x:368,z:100,currentLocationId:null,urbanFloodEscape:{x:390,z:100,lastAt:0},traveling:false});
 h.step(120);assert.ok(v.x>368&&v.x<390);assert.equal(v.action,'wading out of flooded streets');
 for(let i=0;i<30&&v.urbanFloodEscape;i++)h.step(120);assert.equal(v.urbanFloodEscape,null);assert.ok(Math.abs(v.x-390)<.2);
});


test('a stay ending cancels an unboarded outing taxi and routes the guest to the airport',()=>{
 const h=setup(),d=person('DRIVER'),v=h.system.spawnVisitor({budget:1000});
 d.vehicle='compact car';d.parkedCar=parkingPoint(d);d.x=d.parkedCar.x;d.z=d.parkedCar.z;h.state.flies.push(d);
 Object.assign(v,{x:-180,z:-378,visitorPhase:'staying',currentLocationId:'airport',nextVisitAt:1e9});
 const total=money(h.state),job=h.system.requestTaxi(v,'riverside-park');assert.ok(job);v.departAt=0;h.step();
 assert.equal(job.phase,'cancelled');assert.equal(v.taxiJobId,null);assert.equal(v.targetLocationId,'airport');assert.ok(Math.abs(money(h.state)-total)<1e-6);
});
