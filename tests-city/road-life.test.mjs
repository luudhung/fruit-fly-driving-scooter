import test from 'node:test';import assert from 'node:assert/strict';
import{freshState,getRawState,tick,roadLife,liquidMoneySupply,chooseTravelMode,restoreState,getState,moveFly,getSimulationConfig,chooseDestination,needsAndActivities,gameClock}from'../worker/civilization-engine.mjs';
import{PARKING_SPACES,ROADS,BUILDINGS,METRO_LINES,contains,overlaps,parkingPoint,entrance}from'../worker/city-map.mjs';
import{planNetworkMetroRoute}from'../worker/metro-planner.mjs';
import{chooseDrivingStyle,ensureDrivingMemory,learnDrivingOutcome}from'../worker/road-life.mjs';
test('marked parking bays fit at the curb, stay clear of intersections and allocate distinct spaces',()=>{
 assert.ok(PARKING_SPACES.length>500);
 for(const p of PARKING_SPACES){assert.ok(!BUILDINGS.some(b=>overlaps(p,b)));assert.ok(ROADS.some(r=>contains(r,p)));assert.ok(!ROADS.some(r=>(r.w>r.d)!==(p.axis==='x')&&contains(r,p,7)));}
 const used=new Set();for(let i=0;i<150;i++){const p=parkingPoint({x:15,z:15},used);assert.ok(p&&!used.has(p.id));used.add(p.id);}
});
test('easy car finance conserves cash, charges a small deposit and pays the installment once per day',()=>{
 const s=freshState(),f=s.flies.find(f=>f.ageYears>=18);f.vehicle=null;f.money=100;f.savings=100;const supply=liquidMoneySupply(),bank=s.bank.reserves;
 assert.ok(roadLife.buy(f,'compact car',true));assert.equal(f.money,90);assert.equal(f.vehicleLoan.dailyPayment,5);assert.equal(f.vehicleLoan.annualRate,0);assert.ok(f.parkedCar.spaceId);assert.equal(s.bank.reserves,bank-f.vehicleLoan.balance);assert.ok(Math.abs(liquidMoneySupply()-supply)<1e-7);
 s.simulationAgeSeconds=f.vehicleLoan.nextDueDay*86400;roadLife.finance(f);const after=f.vehicleLoan.balance;roadLife.finance(f);assert.equal(f.vehicleLoan.balance,after);assert.ok(Math.abs(liquidMoneySupply()-supply)<1e-7);
 const brain=f.brain.id,loan=f.vehicleLoan.balance;restoreState(JSON.parse(JSON.stringify(s)));assert.equal(getRawState().flies.find(x=>x.brain.id===brain).vehicleLoan.balance,loan);
});
test('metro itineraries include real interchange walks, stairs and boarding on each line',()=>{
 const p=planNetworkMetroRoute({x:-300,z:10},{x:130,z:-325});assert.ok(p&&p.transfers>=1);assert.ok(p.waypoints.some(w=>w.stage==='interchange-walk'));assert.equal(p.waypoints.filter(w=>w.stage==='station-entry').length,p.legs.length);
 for(const leg of p.legs)assert.ok(METRO_LINES.some(l=>l.id===leg.lineId));
 const s=freshState(),f=s.flies[0];Object.assign(f,{x:-300,z:10,vehicle:'compact car',money:100,traits:{...f.traits,thrift:1}});assert.equal(chooseTravelMode(f,{x:130,z:-325}).mode,'metro');
});
test('drivers learn from rewards and penalties, so their later risk choices can change',()=>{
 const s=freshState(),f=s.flies[0];f.traits.risk=.95;f.lawAwareness=.15;f.excitement=95;
 chooseDrivingStyle(f,{motor:1,avoid:0},1,0);const before=f.brain.driving.riskProbability;assert.equal(f.brain.driving.style,'reckless');
 for(let i=0;i<8;i++)learnDrivingOutcome(f,-2,'traffic fine');chooseDrivingStyle(f,{motor:1,avoid:0},1,.5);assert.ok(f.brain.driving.riskProbability<before*.3);assert.equal(f.brain.driving.experiences,8);assert.equal(f.brain.driving.style,'careful');
});
test('a 500-resident city builds sustained real-owner road traffic with legal parking',async()=>{
 const s=freshState();s.weather.precipitation=0;s.weather.danger=0;
 for(const f of s.flies){Object.assign(f,{sleeping:false,energy:90,hunger:20,thirst:20,health:95,illness:null});if(f.vehicle?.includes('car'))f.traits.thrift=.3;}
 let peak=0,busyTicks=0;
 for(let i=0;i<650;i++){await tick({gameSeconds:60,syncBrain:false,serialized:true});const driving=s.flies.filter(f=>f.alive&&f.traveling&&f.transitMode==='car').length;peak=Math.max(peak,driving);if(driving>=50)busyTicks++;}
 assert.ok(busyTicks>=20,`expected sustained traffic for >=20 ticks, got ${busyTicks}; peak ${peak}`);
 assert.ok(peak>=50,`expected >=50 cars actually on roads, got ${peak}`);
 const parked=s.flies.filter(f=>f.alive&&f.vehicle&&(!f.traveling||f.transitMode!=='car'));assert.ok(parked.every(f=>f.parkedCar?.spaceId));assert.equal(new Set(parked.map(f=>f.parkedCar.spaceId)).size,parked.length);assert.ok(getState().roadTraffic.targetDrivingCars>=50);
});

test('a passenger physically boards two lines and walks the interchange before arrival',()=>{
 const s=freshState(),f=s.flies[0],dest=BUILDINGS.find(b=>b.id==='garage'),p=planNetworkMetroRoute({x:-310,z:10},entrance(dest));assert.ok(p&&p.transfers>=1);
 Object.assign(f,{x:-310,z:10,y:1.1,alive:true,indoors:false,sleeping:false,traveling:true,onTrain:false,money:1000,energy:95,health:100,hunger:10,vehicle:null,targetLocationId:'garage',routeWaypoints:p.waypoints,routeIndex:0,metroLineId:p.lineId,metroBoardingsThisTrip:0,transitMode:p.waypoints[0].mode,targetX:p.waypoints[0].x,targetZ:p.waypoints[0].z});
 const stages=new Set();for(let i=0;i<2000&&f.traveling;i++){s.simulationAgeSeconds+=getSimulationConfig().gameSecondsPerRealSecond*.5;moveFly(f);stages.add(f.transitStage);}
 assert.equal(f.traveling,false);assert.ok(f.metroBoardingsThisTrip>=2);assert.ok(s.transit.transfers>=1);assert.ok(stages.has('interchange-walk'));assert.equal(f.currentLocationId,'garage');assert.equal(f.x,dest.x);assert.equal(f.z,dest.z);
});

test('exhausted shelter residents recover across expired action timers before resuming trips',()=>{
 const s=freshState(),f=s.flies[0];Object.assign(f,{energy:1,sleeping:false,traveling:false,indoors:true,currentLocationId:'library',action:'sheltering from bad weather',actionUntil:0,hunger:10,thirst:10});
 for(let i=0;i<180;i++){s.simulationAgeSeconds+=60;chooseDestination(f,gameClock());needsAndActivities(f,gameClock());assert.equal(f.traveling,false);}
 assert.ok(f.energy>40);assert.equal(f.recoveringEnergy,true);assert.equal(f.sleeping,true);
});

test('dealer restocking pays the supplier once without creating money',()=>{
 const s=freshState(),dealer=s.businesses['vehicle-showroom'];dealer.inventory=0;const supply=liquidMoneySupply(),cash=dealer.cash;
 roadLife.tick();assert.equal(dealer.inventory,30);assert.equal(dealer.cash,cash-9600);assert.equal(s.businesses['vehicle-supplier'].cash,9600);assert.ok(Math.abs(liquidMoneySupply()-supply)<1e-7);
 roadLife.tick();assert.equal(s.businesses['vehicle-supplier'].cash,9600);
});

test('a car owner can fund a drive from savings when pocket cash is empty',()=>{
 const s=freshState(),f=s.flies.find(f=>f.ageYears>=18);Object.assign(f,{x:-102,z:10,vehicle:'compact car',parkedCar:parkingPoint({x:-102,z:10}),money:0,savings:100,roadDuty:true,traveling:false});s.weather.precipitation=0;s.weather.wind=0;
 const plan=chooseTravelMode(f,entrance(BUILDINGS.find(b=>b.id==='school')));assert.equal(plan.mode,'car');assert.ok(plan.route.some(p=>p.mode==='car'));
 const supply=liquidMoneySupply();f.drivingTripActive=true;roadLife.arrived(f);assert.equal(f.savings,99.7);assert.ok(Math.abs(liquidMoneySupply()-supply)<1e-7);
});
