import test from 'node:test';
import assert from 'node:assert/strict';
import {createCityVisitors} from '../worker/city-visitors.mjs';
import {LOCATIONS,entrance,parkingPoint} from '../worker/city-map.mjs';
import {AIRPORT_DEPARTURE_DROPOFFS} from '../worker/airport-departure-roads.mjs';

const person=(id,p)=>({id,name:id,kind:'resident',alive:true,brain:{id:'BRAIN-'+id},ageYears:32,money:1500,savings:0,health:95,energy:95,hunger:20,thirst:20,stress:5,happiness:60,traits:{thrift:.1},...p,y:1.1,vx:0,vz:0,traveling:false,indoors:false,currentLocationId:'hotel',targetLocationId:'hotel',transitMode:'walk',children:[],parents:[]});
function fixture(){
 const door=entrance(LOCATIONS.find(l=>l.id==='hotel')),driver=person('TAXI-DRIVER',door),passenger=person('TAXI-PASSENGER',door);
 driver.vehicle='compact car';driver.parkedCar=parkingPoint(driver);Object.assign(driver,driver.parkedCar);
 let state={simulationAgeSeconds:8*3600,timeScale:120,flies:[driver,passenger],businesses:{},treasury:{cash:1000},centralBank:{priceLevel:1},weather:{condition:'clear',precipitation:0},totalTransactions:0};let system;
 const build=()=>{system=createCityVisitors({world:()=>state});system.init();state.cityVisitors.nextArrivalAt=Infinity;state.cityVisitors.club.nextAt=Infinity;};build();
 return{get s(){return state;},get system(){return system;},get d(){return state.flies[0];},get p(){return state.flies[1];},step(){state.simulationAgeSeconds+=120;system.tick(120,{hour:8,day:1});},restore(){state=structuredClone(state);build();}};
}
const cash=s=>s.flies.reduce((n,f)=>n+f.money+f.savings,0)+Object.values(s.businesses).reduce((n,b)=>n+b.cash,0)+s.treasury.cash;

test('an airport taxi physically climbs to upstairs departures, delivers into the check-in hall and descends before releasing its driver after restore',()=>{
 const t=fixture(),total=cash(t.s),job=t.system.requestTaxi(t.p,'airport');assert.ok(job);const id=job.id,fare=job.fare;
 assert.ok(job.rideRoute.some(p=>p.airportDepartureRoad&&p.y>6));assert.equal(job.drop.y,6.27);
 let restored=false,ascending=false,descending=false,delivered=false,lastY=t.d.y;
 for(let i=0;i<2000;i++){
  const current=t.s.cityVisitors.taxiJobs.find(j=>j.id===id);if(['complete','cancelled'].includes(current.phase))break;
  t.step();const now=t.s.cityVisitors.taxiJobs.find(j=>j.id===id);
  if(now.phase==='riding')assert.equal(t.p.y,t.d.y,'the passenger must stay in the actual climbing car');
  if(now.phase==='riding'&&t.d.y>1.2){assert.ok(Math.abs(t.d.y-lastY)<.6,'ramp height must interpolate rather than jump at waypoints');ascending=true;}
  if(ascending&&!restored&&t.d.y>2&&t.d.y<5){const pose={x:t.d.x,y:t.d.y,z:t.d.z},paid=t.p.money;t.restore();assert.deepEqual({x:t.d.x,y:t.d.y,z:t.d.z},pose);assert.equal(t.p.money,paid);restored=true;}
  if(now.phase==='exiting'){delivered=true;assert.equal(t.p.taxiPassenger,false);assert.equal(t.d.cityService,id);assert.equal(t.s.cityVisitors.taxiCompleted,1);if(t.d.y<lastY)descending=true;}
  lastY=t.d.y;
 }
 const finished=t.s.cityVisitors.taxiJobs.find(j=>j.id===id);assert.equal(finished.phase,'complete');assert.ok(restored&&ascending&&descending&&delivered);
 assert.equal(t.p.currentLocationId,'airport');assert.equal(t.p.y,6.52);assert.equal(t.p.airportDepartureEntrance.terminalId,finished.departureTerminalId);
 assert.equal(t.p.taxiJobId,null);assert.equal(t.d.cityService,null);assert.equal(t.d.parkedCar.y,1.1);assert.equal(t.d.y,1.1);
 assert.equal(t.p.money,1500-fare);assert.equal(t.d.money,1500+fare);assert.equal(t.s.cityVisitors.taxiCompleted,1);assert.ok(Math.abs(cash(t.s)-total)<1e-6);
 t.system.finishTaxi(finished);assert.equal(t.s.cityVisitors.taxiCompleted,1);assert.ok(Math.abs(cash(t.s)-total)<1e-6);
});

test('a delivered taxi may be restored, interrupted or finalized again without refunding the completed passenger ride',()=>{
 const t=fixture(),total=cash(t.s),job=t.system.requestTaxi(t.p,'airport');assert.ok(job);let current;
 for(let i=0;i<2000;i++){t.step();current=t.s.cityVisitors.taxiJobs.find(j=>j.id===job.id);if(current.phase==='exiting')break;}
 assert.equal(current.phase,'exiting');assert.ok(current.paid);const received=t.d.money,charged=t.p.money;
 t.system.finishTaxi(current);t.system.finishTaxi(current,true,'late duplicate cancellation');assert.equal(current.phase,'exiting');assert.equal(t.d.traveling,true);assert.equal(t.d.money,received);assert.equal(t.p.money,charged);
 t.restore();t.d.ambulanceDuty={id:'EMERGENCY'};t.d.routeWaypoints=[{x:t.d.x+1,y:t.d.y,z:t.d.z,mode:'walk'}];t.d.traveling=true;
 t.step();const final=t.s.cityVisitors.taxiJobs.find(j=>j.id===job.id);assert.equal(final.phase,'complete');assert.equal(t.d.money,received);assert.equal(t.p.money,charged);assert.equal(t.d.routeWaypoints.length,1);assert.equal(t.s.cityVisitors.taxiCompleted,1);assert.ok(Math.abs(cash(t.s)-total)<1e-6);
});

test('separate upstairs curb reservations allow four airport taxis without reusing an occupied departure bay',()=>{
 const t=fixture();t.s.cityVisitors.taxiJobs.push(...AIRPORT_DEPARTURE_DROPOFFS.slice(0,3).map((b,i)=>({id:'RESERVED-'+i,phase:'pickup',drop:{bayId:b.id}})));
 const job=t.system.requestTaxi(t.p,'airport');assert.ok(job);assert.equal(job.departureTerminalId,'T4');assert.equal(job.drop.bayId,AIRPORT_DEPARTURE_DROPOFFS[3].id);
});

test('cancelling on the ascending ramp refunds once and carries the passenger safely down before releasing either person',()=>{
 const t=fixture(),total=cash(t.s),job=t.system.requestTaxi(t.p,'airport');assert.ok(job);
 for(let i=0;i<2000&&!(t.d.y>2&&t.d.y<5);i++)t.step();
 assert.equal(job.phase,'riding');const pose={x:t.d.x,y:t.d.y,z:t.d.z};t.system.finishTaxi(job,true,'trip cancelled on the ramp');
 assert.equal(job.phase,'exiting');assert.equal(t.p.taxiPassenger,true);assert.deepEqual({x:t.d.x,y:t.d.y,z:t.d.z},pose);
 assert.equal(t.p.money,1500);assert.equal(t.d.money,1500);assert.equal(t.s.cityVisitors.taxiCancelled,1);assert.equal(t.s.cityVisitors.taxiCompleted,0);
 t.restore();for(let i=0;i<2000;i++){const current=t.s.cityVisitors.taxiJobs.find(j=>j.id===job.id);if(current.phase==='cancelled')break;t.step();}
 const finished=t.s.cityVisitors.taxiJobs.find(j=>j.id===job.id);assert.equal(finished.phase,'cancelled');assert.equal(t.d.y,1.1);assert.equal(t.p.y,1.1);assert.equal(t.p.taxiPassenger,false);assert.equal(t.p.airportDepartureEntrance,undefined);
 assert.equal(t.s.cityVisitors.taxiCancelled,1);assert.ok(Math.abs(cash(t.s)-total)<1e-6);
});
