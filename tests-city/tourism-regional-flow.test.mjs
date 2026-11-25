import test from 'node:test';
import assert from 'node:assert/strict';
import {createTourismSystem} from '../worker/tourism.mjs';
import {createRegionalAviationSystem} from '../worker/regional-aviation.mjs';
import {COUNTRY_AIRPORTS} from '../worker/country-map.mjs';
import {visitorDeparturePath,visitorArrivalPath} from '../worker/visitor-aviation.mjs';

function fixture(){
 let state={simulationAgeSeconds:7*3600,timeScale:120,flies:[],centralBank:{priceLevel:1},treasury:{cash:10000},businesses:Object.fromEntries(['travel-escrow','island-air','island-resort'].map(id=>[id,{cash:0}])),totalTransactions:0,cityVisitors:{visitors:[],hotels:{}}};
 const airport=COUNTRY_AIRPORTS.find(p=>p.id==='city');
 state.flies=[{id:'HAWAII-HOLIDAY',alive:true,ageYears:30,health:95,energy:90,happiness:50,stress:30,money:500,savings:2000,wage:5,citizenshipCountryId:'hansdrex',x:airport.terminal.x,y:1.1,z:airport.terminal.z,currentLocationId:airport.locationId,action:'taking a holiday on Hansdrex Island',brain:{id:'UNCHANGED-BRAIN'}}];
 let regional,tourism,requests=0;
 function build(){
  const hooks={world:()=>state,weatherDanger:()=>0,emit:()=>{},remember:()=>{},startJourney:(f,q)=>{f.traveling=true;f.targetLocationId=q.id;},moveFly:()=>{},needsAndActivities:()=>{},payAndFinance:()=>{},requestAirClearance:()=>({allowed:true}),aviationAdmission:()=>({allowed:true,fee:0})};
  regional=createRegionalAviationSystem(hooks);regional.init();
  tourism=createTourismSystem({...hooks,requestRegionalTrip:(...args)=>{requests++;return regional.request(...args);}});
 }
 build();return {get state(){return state;},get f(){return state.flies[0];},get tourism(){return tourism;},get regional(){return regional;},get requests(){return requests;},at(time){state.simulationAgeSeconds=time;},restore(){state=structuredClone(state);build();}};
}

test('an autonomously chosen Hawaii holiday uses the shared T4 manifest, upstairs train/check-in and physical arrival after reload',()=>{
 const t=fixture(),f=t.f;assert.equal(t.tourism.simulateIslandHoliday(f,{hour:7}),true);
 assert.equal(t.requests,1);assert.equal(f.airTrip,undefined);assert.ok(f.countryAirTrip);assert.equal(f.lastHolidayDay,0);
 const trip=f.countryAirTrip,plan=trip.outboundBoarding,path=visitorDeparturePath(plan,0,120),checkIn=path.find(p=>p.stage==='departure-check-in');
 assert.equal(plan.terminalId,'T4');assert.ok(path.some(p=>p.stage==='terminal-train'));assert.equal(checkIn.y,6.52);
 assert.ok(path.at(-1).at<trip.outbound.departure);assert.equal(t.state.businesses['travel-escrow'].cash,0);assert.equal(t.state.businesses['regional-flight-escrow'].cash,trip.cost);
 const paid=f.money+f.savings,identity=[f.id,f.brain.id],accepted=structuredClone(trip.outbound);
 t.at(checkIn.at+30);t.regional.handleResident(f);assert.equal(f.onPlane,false);assert.equal(f.y,6.52);assert.equal(f.airportMotion.timed,true);
 t.restore();assert.deepEqual([t.f.id,t.f.brain.id],identity);assert.deepEqual(t.f.countryAirTrip.outbound,accepted);assert.equal(t.f.money+t.f.savings,paid);
 assert.equal(t.tourism.simulateIslandHoliday(t.f,{hour:12}),false,'the regional controller owns this trip, without a second legacy booking');
 t.at(accepted.departure+600);t.regional.handleResident(t.f);assert.equal(t.f.onPlane,true);
 t.at(accepted.arrival+180);t.regional.handleResident(t.f);assert.equal(t.f.onPlane,false);assert.equal(t.f.airportMotion.timed,true);assert.equal(t.f.countryAirTrip.phase,'arrival');
 const island=COUNTRY_AIRPORTS.find(p=>p.id==='island'),stand=island.stands.at(-1),arrivalPath=visitorArrivalPath({...accepted,airportId:'island',standId:stand.id,arrivalStand:stand,inboundAt:accepted.departure,parkedAt:accepted.arrival},0,120);
 t.at(arrivalPath.at(-1).at+1);t.regional.handleResident(t.f);assert.equal(t.f.countryAirTrip.phase,'visiting');assert.equal(t.f.targetLocationId,t.f.countryAirTrip.hotelId);assert.equal(t.f.money+t.f.savings,paid);
});

test('a full regional manifest cannot fall back to a second legacy plane or charge another holiday',()=>{
 const t=fixture(),f=t.f,flightPrice=f.money+f.savings;
 for(let i=0;i<10;i++){const person={...f,id:`SEAT-${i}`,brain:{id:`BRAIN-${i}`}};t.state.flies.push(person);assert.equal(t.regional.book(person,'island'),true);}
 assert.equal(t.tourism.simulateIslandHoliday(f,{hour:7}),true);assert.equal(t.requests,1);assert.equal(f.countryAirTrip,undefined);assert.equal(f.airTrip,undefined);assert.equal(f.money+f.savings,flightPrice);assert.equal(t.state.businesses['travel-escrow'].cash,0);assert.equal(f.lastHolidayDay,undefined);
});

test('an already prepaid legacy holiday keeps its accepted flights, escrow, brain and controller',()=>{
 const t=fixture(),f=t.f;assert.equal(t.tourism.bookIslandHoliday(f),true);
 const reserved=structuredClone(f.airTrip),identity=[f.id,f.brain.id],paid=f.money+f.savings;
 t.restore();t.at(reserved.outbound.departure-120);assert.equal(t.tourism.simulateIslandHoliday(t.f,{hour:7}),true);
 assert.equal(t.requests,0);assert.equal(t.f.countryAirTrip,undefined);assert.deepEqual(t.f.airTrip,reserved);assert.deepEqual([t.f.id,t.f.brain.id],identity);assert.equal(t.f.money+t.f.savings,paid);assert.equal(t.state.businesses['travel-escrow'].cash,reserved.cost);
});

test('the live engine decision path delegates a new Hawaii holiday to the physical regional system',async()=>{
 const {freshState,simulateIslandHoliday,gameClock}=await import('../worker/civilization-engine.mjs');
 const state=freshState(),airport=COUNTRY_AIRPORTS.find(p=>p.id==='city');
 state.simulationAgeSeconds=7*3600;state.weather={condition:'clear',precipitation:0,wind:0,lightning:0};
 const f=state.flies.find(p=>p.citizenshipCountryId==='hansdrex'&&!p.publicServiceRole&&!p.facilityEmployment&&!p.businessId);
 Object.assign(f,{x:airport.terminal.x,y:1.1,z:airport.terminal.z,ageYears:30,money:500,savings:2000,health:95,energy:90,traveling:false,onTrain:false,onPlane:false,currentLocationId:'airport',action:'taking a holiday on Hansdrex Island'});
 assert.equal(simulateIslandHoliday(f,gameClock()),true);assert.equal(f.airTrip,undefined);assert.equal(f.countryAirTrip.to,'island');assert.equal(f.countryAirTrip.outboundBoarding.terminalId,'T4');assert.equal(f.lastHolidayDay,0);
});
