import test from 'node:test';
import assert from 'node:assert/strict';
import {HANSDREX_AIRLINE,chargeHansdrexFare,hansdrexAirlineSummary,hansdrexReturnFare} from '../worker/hansdrex-airline.mjs';

test('a complete Hansdrex Airline return ticket conserves real cash and savings through retry and restore',()=>{
 let state={simulationAgeSeconds:120,businesses:{},totalTransactions:0},person={money:150,savings:700};
 const total=()=>person.money+person.savings+Number(state.businesses[HANSDREX_AIRLINE.id]?.cash||0);
 const before=total();
 assert.ok(chargeHansdrexFare(state,person,'inbound',{reference:'ARRIVAL-1'}));
 assert.equal(person.money,0);assert.equal(person.savings,650);assert.equal(person.returnFareReserve,200);assert.equal(total(),before);
 ({state,person}=JSON.parse(JSON.stringify({state,person})));
 assert.ok(chargeHansdrexFare(state,person,'inbound',{reference:'WEATHER-REPLACEMENT'}));
 assert.equal(hansdrexAirlineSummary(state).revenue,200);assert.equal(state.totalTransactions,1);
 assert.ok(chargeHansdrexFare(state,person,'outbound',{reference:'RETURN-1'}));
 assert.ok(chargeHansdrexFare(state,person,'outbound',{reference:'RETURN-RETRY'}));
 assert.equal(hansdrexAirlineSummary(state).revenue,400);assert.equal(person.returnFareReserve,0);assert.equal(total(),before);
 assert.equal(state.totalTransactions,2);assert.equal(state.businesses[HANSDREX_AIRLINE.id].ownerCountryId,'hansdrex');
 assert.equal(person.hansdrexAirlineReceipts.outbound.reference,'RETURN-1');
});

test('an unfunded fare changes no wallet, account, receipt or transaction count',()=>{
 const state={simulationAgeSeconds:120,businesses:{},totalTransactions:0},person={money:80,savings:119};
 const before=structuredClone({state,person});
 assert.equal(chargeHansdrexFare(state,person,'inbound'),false);
 assert.deepEqual({state,person},before);
});

test('an already travelling guest keeps the return price quoted before the new tariff',()=>{
 const state={simulationAgeSeconds:120,businesses:{},totalTransactions:0},person={money:90,savings:0,arrivalFarePaid:45};
 assert.equal(hansdrexReturnFare(person),45);
 assert.ok(chargeHansdrexFare(state,person,'inbound'));
 assert.equal(state.totalTransactions,0);
 assert.ok(chargeHansdrexFare(state,person,'outbound'));
 assert.equal(person.money,45);assert.equal(hansdrexAirlineSummary(state).revenue,45);
 assert.equal(person.hansdrexAirlineReceipts.outbound.amount,45);
});
