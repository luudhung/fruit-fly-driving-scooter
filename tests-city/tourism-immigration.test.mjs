import test from 'node:test';
import assert from 'node:assert/strict';
import {createTourismSystem} from '../worker/tourism.mjs';
import {createInternationalLife} from '../worker/international-life.mjs';
import {AIRPORT,ISLAND} from '../worker/city-map.mjs';
function fixture(deny=false){
 let state={simulationAgeSeconds:7*3600,flies:[{id:'HOLIDAY-GUEST',alive:true,ageYears:30,health:90,energy:90,money:500,savings:2000,wage:5,currentLocationId:'airport',x:AIRPORT.terminal.x,z:AIRPORT.terminal.z,citizenshipCountryId:'hansdrex',countryPresence:{countryId:'hansdrex',entryId:'HOME'},action:'taking a holiday on Hansdrex Island'}],businesses:Object.fromEntries(['travel-escrow','island-air','island-resort'].map(id=>[id,{cash:0}])),treasury:{cash:10000},centralBank:{priceLevel:1},totalTransactions:0};
 const international=createInternationalLife({world:()=>state,redistribute:false,nationalEconomy:false});international.init();
 const hooks={world:()=>state,weatherDanger:()=>0,emit:()=>{},remember:()=>{},startJourney:()=>{},moveFly:()=>{},needsAndActivities:()=>{},payAndFinance:()=>{},requestAirClearance:deny?()=>({allowed:false}):international.requestAirClearance,aviationAdmission:international.aviationAdmission};let tourism=createTourismSystem(hooks);
 return {get s(){return state;},get guest(){return state.flies[0];},get tourism(){return tourism;},international,restore(){state=structuredClone(state);tourism=createTourismSystem(hooks);},at(time){state.simulationAgeSeconds=time;tourism.simulateIslandHoliday(state.flies[0],{hour:12});}};
}
test('commercial holiday has real permits, Hawaii charges one 50 entry fee at landing, and own-country return is free',()=>{
 const t=fixture(),f=t.guest,before=f.money+f.savings;assert.equal(t.tourism.bookIslandHoliday(f),true);const {outbound,inbound,cost}=f.airTrip;for(const flight of [outbound,inbound])assert.ok(t.s.internationalLife.airClearances[flight.id]);const hawaii=t.international.countryAccount('hawaii').cash,hans=t.s.treasury.cash;
 t.at(outbound.departure+600);assert.equal(f.money+f.savings,before-cost);assert.equal(t.international.countryAccount('hawaii').cash,hawaii);
 t.at(outbound.arrival);assert.equal(f.countryPresence.countryId,'hawaii');assert.equal(f.money+f.savings,before-cost-50);assert.equal(t.international.countryAccount('hawaii').cash,hawaii+50);t.restore();const saved=t.guest;saved.airTrip.beachActivity=true;t.at(outbound.arrival);assert.equal(t.international.countryAccount('hawaii').cash,hawaii+50);
 saved.airTrip.phase='inbound-wait';saved.currentLocationId='island-airport';t.at(inbound.departure+600);t.at(inbound.arrival);assert.equal(saved.airTrip,null);assert.equal(saved.countryPresence.countryId,'hansdrex');assert.equal(saved.money+saved.savings,before-cost-50);assert.equal(saved.countryEntryReceipts.length,2);assert.equal(saved.countryEntryReceipts.at(-1).fee,0);assert.equal(t.s.treasury.cash,hans+12);
});
test('closed commercial airspace refuses booking before escrow charge or travel confirmation',()=>{
 const t=fixture(true),f=t.guest,before=f.money+f.savings;assert.equal(t.tourism.bookIslandHoliday(f),false);assert.equal(f.airTrip,undefined);assert.equal(t.s.businesses['travel-escrow'].cash,0);assert.equal(f.money+f.savings,before);
});


test('legacy prepaid board consumes finite resort inventory only onsite and stays consumed after restore',()=>{
 const t=fixture(),f=t.guest;assert.equal(t.tourism.bookIslandHoliday(f),true);const flight=f.airTrip.outbound;t.at(flight.departure+600);t.at(flight.arrival);
 f.airTrip.beachActivity=true;Object.assign(f,{hunger:90,currentLocationId:'island-resort',x:ISLAND.resort.x,z:ISLAND.resort.z,traveling:false,onPlane:false});
 const resort=t.s.businesses['island-resort'],money=f.money+f.savings;resort.inventory=0;t.at(t.s.simulationAgeSeconds+1);assert.equal(f.hunger,90,'an empty prepaid pantry cannot create a meal');
 resort.inventory=1;Object.assign(f,{currentLocationId:'island-beach',x:ISLAND.beach.x,z:ISLAND.beach.z});t.at(t.s.simulationAgeSeconds+1);assert.equal(f.hunger,90);assert.equal(resort.inventory,1,'a beach guest must reach the resort');
 Object.assign(f,{currentLocationId:'island-resort',x:ISLAND.beach.x,z:ISLAND.beach.z});t.at(t.s.simulationAgeSeconds+1);assert.equal(resort.inventory,1,'a stale location label cannot serve a remote meal');
 Object.assign(f,{currentLocationId:'island-resort',x:ISLAND.resort.x,z:ISLAND.resort.z});t.at(t.s.simulationAgeSeconds+1);assert.equal(f.hunger,30);assert.equal(resort.inventory,0);assert.equal(f.airTrip.mealsConsumed,1);assert.equal(f.money+f.savings,money,'board is already paid');
 t.restore();const restored=t.guest;restored.hunger=90;t.at(t.s.simulationAgeSeconds+1);assert.equal(restored.hunger,90);assert.equal(t.s.businesses['island-resort'].inventory,0);assert.equal(restored.airTrip.mealsConsumed,1);
});
