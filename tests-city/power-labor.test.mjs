import test from 'node:test';import assert from 'node:assert/strict';
import {freshState,restoreState,getRawState,ensurePowerPlantStaff,simulatePowerGrid,personalWorkWindow,chooseDestination,roadLife,liquidMoneySupply,gameClock,startJourney,moveFly,tickFly,cityVisitors} from '../worker/civilization-engine.mjs';
import {LOCATIONS,entrance,parkingPoint} from '../worker/city-map.mjs';
const gridIds=new Set(['power','power-evening','power-night','grid-dispatch']);
const power=()=>LOCATIONS.find(l=>l.id==='power');
function fixture(){const s=freshState();s.weather={condition:'clear',precipitation:0,wind:0};s.utilities.powerPlant.fuelReserve=1e6;return s;}
function healthy(f){Object.assign(f,{energy:90,hunger:20,thirst:10,health:100,illness:null,sleeping:false,recoveringEnergy:false,arrestedUntil:0});}

test('grid rota covers all three shifts using existing workers, retaining jobs and independent brain identities across restore',()=>{
 const s=fixture();const adults=s.flies.filter(f=>f.ageYears>=20&&f.ageYears<=68).slice(0,19);
 for(const [i,f]of adults.entries()){f.jobId=['power','power-evening','power-night','grid-dispatch'][i%4];f.preferredWorkStart=i%24;f.preferredWorkHours=6.5;}
 const before=new Map(s.flies.map(f=>[f.id,{job:f.jobId,brain:f.brain.id}]));const staff=ensurePowerPlantStaff();
 for(const f of s.flies){if(before.get(f.id).job)assert.equal(f.jobId,before.get(f.id).job);assert.equal(f.brain.id,before.get(f.id).brain);}
 for(let hour=0;hour<24;hour++)assert.ok(staff.filter(f=>personalWorkWindow(f,null,hour)).length>=6,`uncovered hour ${hour}`);
 const rota=staff.map(f=>[f.id,f.gridShiftStart,f.preferredWorkStart,f.preferredWorkHours]);restoreState(structuredClone(s));assert.deepEqual(ensurePowerPlantStaff().map(f=>[f.id,f.gridShiftStart,f.preferredWorkStart,f.preferredWorkHours]),rota);
});

test('personal errands preserve a walking commitment, an onsite worker and recovery even with a road traffic deficit',()=>{
 for(const mode of ['walking','working','recovery']){
  const s=fixture(),f=s.flies[0];healthy(f);f.vehicle='compact car';f.traits.thrift=.2;f.parkedCar=parkingPoint(f);f.jobId='power';f.gridShiftStart=6;f.preferredWorkStart=6;f.preferredWorkHours=8;s.simulationAgeSeconds=9*3600;
  if(mode==='walking'){startJourney(f,{id:'power',action:'working as power plant operator'});f.transitMode='walk';}
  if(mode==='working')Object.assign(f,{currentLocationId:'power',x:power().x,z:power().z,action:'working as power plant operator',traveling:false,indoors:true});
  if(mode==='recovery')Object.assign(f,{jobId:null,action:'resting indoors',recoveringEnergy:true,traveling:false,indoors:true});
  const before={target:f.targetLocationId,pending:f.pendingAction,action:f.action,x:f.x,z:f.z};roadLife.tick();
  assert.deepEqual({target:f.targetLocationId,pending:f.pendingAction,action:f.action,x:f.x,z:f.z},before);assert.ok(!f.roadDuty);
 }
});

test('a recovered essential employee physically commutes before the shift and stays at the workplace until its end',()=>{
 const s=fixture(),staff=ensurePowerPlantStaff(),f=staff.find(f=>f.gridShiftStart===6);healthy(f);f.socialTask=null;f.civicDuty=null;f.cityService=null;f.urbanTask=null;f.privateFlight=null;
 const door=entrance(power());Object.assign(f,{x:door.x,z:door.z-15,y:1.1,indoors:false,traveling:false,currentLocationId:'park',action:'taking a walk',actionUntil:1e12,vehicle:null});s.simulationAgeSeconds=5.5*3600;
 chooseDestination(f,gameClock());assert.equal(f.targetLocationId,'power');assert.equal(f.traveling,true);const first={x:f.x,z:f.z};
 for(let i=0;i<60&&f.traveling;i++){s.simulationAgeSeconds+=60;moveFly(f);}assert.equal(f.traveling,false);assert.equal(f.currentLocationId,'power');assert.ok(Math.hypot(f.x-first.x,f.z-first.z)>1);
 s.simulationAgeSeconds=9*3600;chooseDestination(f,gameClock());assert.match(f.action,/^working as/);const until=f.actionUntil;
 s.simulationAgeSeconds=12*3600;chooseDestination(f,gameClock());assert.equal(f.traveling,false);assert.equal(f.currentLocationId,'power');assert.equal(f.actionUntil,until);
 f.energy=5;chooseDestination(f,gameClock());assert.equal(f.recoveringEnergy,true,'exhausted staff must still recover');
});

test('overhauls and generating modules require physical workers, charge existing plant cash once per hour, and conserve domestic money',()=>{
 const s=fixture(),plant=s.utilities.powerPlant,staff=ensurePowerPlantStaff();plant.maintenance=.38;plant.cash=100000;plant.lastHourKey=-1;s.simulationAgeSeconds=9*3600;s.utilities.lastBillingDay=gameClock().day;
 for(const f of staff)Object.assign(f,{traveling:true,currentLocationId:'power',action:'working as power plant operator'});
 const initial=liquidMoneySupply();simulatePowerGrid(gameClock());assert.equal(plant.installedCapacity,185);assert.equal(plant.serviceSpending||0,0);assert.equal(plant.gridOnline,false);
 for(const f of staff.slice(0,6)){healthy(f);Object.assign(f,{traveling:false,indoors:true,currentLocationId:'power',action:'working as power plant operator',x:power().x,z:power().z});}
 // More households require more paid modules; allow one full operating day.
 for(let i=0;i<24&&!plant.gridOnline;i++){s.simulationAgeSeconds+=3600;simulatePowerGrid(gameClock());}
 assert.ok(plant.maintenance>.9);assert.ok(plant.installedCapacity>185);assert.ok(plant.serviceSpending>0);assert.equal(plant.gridOnline,true);assert.ok(plant.assetLedger.every(a=>a.workers.length>0&&a.cost>0));assert.ok(Math.abs(liquidMoneySupply()-initial)<1e-6);
 const cash=plant.cash,capacity=plant.installedCapacity,ledger=plant.assetLedger.length;simulatePowerGrid(gameClock());assert.equal(plant.cash,cash);assert.equal(plant.installedCapacity,capacity);assert.equal(plant.assetLedger.length,ledger);
 const owners=s.flies.map(f=>[f.id,f.brain.id]);restoreState(structuredClone(s));assert.deepEqual(getRawState().flies.map(f=>[f.id,f.brain.id]),owners);assert.equal(getRawState().utilities.powerPlant.installedCapacity,capacity);
});

test('live meter cut count excludes archived households while retaining account history',()=>{
 const s=fixture();s.utilities.householdAccounts['ARCHIVED-ONLY']={powerOn:false};s.utilities.lastBillingDay=gameClock().day;simulatePowerGrid(gameClock());
 const ids=new Set(s.flies.filter(f=>f.alive).map(f=>f.householdId));assert.equal(s.utilities.disconnectedHouseholds,[...ids].filter(id=>s.utilities.householdAccounts[id]?.powerOn===false).length);assert.ok(s.utilities.householdAccounts['ARCHIVED-ONLY']);
});

test('a restored city rota advances actual commutes and recovers a funded grid over a complete day',()=>{
 const seeded=fixture();const assigned=ensurePowerPlantStaff();for(const f of assigned)healthy(f);
 seeded.utilities.powerPlant.maintenance=.38;seeded.utilities.powerPlant.cash=100000;seeded.simulationAgeSeconds=0;
 const ids=assigned.map(f=>f.id),brains=new Map(assigned.map(f=>[f.id,f.brain.id]));
 const s=restoreState(structuredClone(seeded)),staff=ids.map(id=>s.flies.find(f=>f.id===id));const initialPositions=new Map(staff.map(f=>[f.id,{x:f.x,z:f.z}]));
 let workingSamples=0,onlineSamples=0;const visited=new Set();
 for(let i=0;i<720;i++){
  s.simulationAgeSeconds+=120;const clock=gameClock();
  for(const f of staff){tickFly(f,clock);if(!f.traveling&&f.currentLocationId==='power'&&String(f.action).startsWith('working')){workingSamples++;visited.add(f.id);}}
  simulatePowerGrid(clock);if(s.utilities.powerPlant.gridOnline)onlineSamples++;
 }
 assert.equal(s.simulationAgeSeconds,86400);assert.ok(visited.size>=6,`only ${visited.size} workers reached the actual plant`);assert.ok(workingSamples>300,`only ${workingSamples} worked samples`);
 assert.ok(onlineSamples>60,`grid never recovered: ${onlineSamples} online samples`);assert.ok(s.utilities.powerPlant.installedCapacity>185);
 assert.ok(staff.some(f=>Math.hypot(f.x-initialPositions.get(f.id).x,f.z-initialPositions.get(f.id).z)>10));
 for(const f of staff)assert.equal(f.brain.id,brains.get(f.id));
 const restored=restoreState(structuredClone(s));for(const id of ids)assert.equal(restored.flies.find(f=>f.id===id).brain.id,brains.get(id));assert.equal(restored.utilities.powerPlant.installedCapacity,s.utilities.powerPlant.installedCapacity);
});


test('taxi dispatch respects the same upcoming essential rota while an accepted fare still finishes physically',()=>{
 const s=fixture(),staff=ensurePowerPlantStaff(),driver=staff.find(f=>f.gridShiftStart===6),passenger=s.flies.find(f=>f.id!==driver.id);
 for(const f of s.flies)f.vehicle=null;healthy(driver);healthy(passenger);
 Object.assign(driver,{vehicle:'compact car',currentLocationId:'metro-industrial',x:-210,z:87,indoors:false,traveling:false,action:'resting',money:1200,savings:300});driver.parkedCar=parkingPoint(driver);driver.x=driver.parkedCar.x;driver.z=driver.parkedCar.z;
 Object.assign(passenger,{x:-180,z:-378,currentLocationId:'airport',indoors:false,traveling:false,money:1200,savings:300});
 s.simulationAgeSeconds=5*3600;assert.equal(cityVisitors.requestTaxi(passenger,'hotel'),false);assert.ok(!driver.cityService);
 s.simulationAgeSeconds=18*3600;const job=cityVisitors.requestTaxi(passenger,'hotel');assert.ok(job,'off-shift owners can earn taxi fares');
 s.simulationAgeSeconds=9*3600+86400;cityVisitors.tick(120,gameClock());assert.ok(!['cancelled','complete'].includes(job.phase),'crossing a shift boundary does not abandon an accepted physical ride');assert.equal(driver.cityService,job.id);
});
