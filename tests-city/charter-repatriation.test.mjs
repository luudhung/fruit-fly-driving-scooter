import test from 'node:test';import assert from 'node:assert/strict';
import {createF1Charters} from '../worker/north-f1-charters.mjs';
import {airportById} from '../worker/aviation.mjs';
const at=10*86400,port=airportById('city'),stand=port.stands[0];
const cash=s=>s.northF1.event.charters.flatMap(f=>f.guests).reduce((n,p)=>n+Number(p.money||0)+Number(p.savings||0),0)+Object.values(s.businesses).reduce((n,b)=>n+Number(b.cash||0),0);

test('a guest stranded on the apron walks back before receiving one real funded return ticket, preserving identity and money through restore',()=>{
 let guest={id:'STRANDED-GUEST',brain:{id:'STRANDED-BRAIN'},kind:'visitor',alive:true,phase:'stranded',money:5,savings:7,initialCash:1000,x:stand.x-6,y:1.1,z:stand.z+4,onPlane:false,currentLocationId:null,entryAirportId:'city',expensesLifetime:0};
 const oldPlane={id:'OLD-RETURN',airportId:'city',arrivalStand:stand,standId:stand.id,sector:'west',direction:1,inboundAt:at-30000,parkedAt:at-20000,outboundAt:at-10000,exitAt:at-8000,aircraftGone:true,boardingStartedAt:at-15000,boardingGuestIds:[guest.id],passengerIds:[]};
 const flight={id:'STRANDED-COHORT',airportId:'city',sector:'west',direction:1,inboundAt:at-40000,parkedAt:at-30000,outboundAt:at-20000,exitAt:at-18000,landed:true,aircraftGone:true,guests:[guest],returnLeg:oldPlane};
 let s={simulationAgeSeconds:at,timeScale:120,flies:[],businesses:{'hansdrex-airline':{cash:1000}},weather:{condition:'clear'},northF1:{event:{id:'STRANDED-EVENT',format:2,tenPassengerVersion:1,airportItineraryVersion:1,startsAt:at-30000,endsAt:at-20000,charters:[flight],tourPaths:{}},previousTours:[],charterDepartures:0}};
 let service;const build=()=>{service=createF1Charters({world:()=>s,signature:()=>.5,weatherClosed:()=>false,account:()=>({cash:0})});};build();const total=cash(s),position=[guest.x,guest.y,guest.z];
 service.tick(s.northF1.event);assert.equal(guest.phase,'repatriation-walk');assert.deepEqual([guest.x,guest.y,guest.z],position);assert.equal(guest.money+guest.savings,12);assert.equal(s.businesses['hansdrex-airline'].repatriationLoans,undefined);
 s=structuredClone(s);build();guest=s.northF1.event.charters[0].guests[0];
 for(let i=0;i<1000&&!guest.returnFarePaid;i++){s.simulationAgeSeconds+=120;service.tick(s.northF1.event);}
 assert.equal(guest.returnFarePaid,200);assert.equal(guest.brain.id,'STRANDED-BRAIN');assert.equal(guest.id,'STRANDED-GUEST');assert.equal(guest.repatriationLoan.amount,188);assert.equal(guest.y,6.52);assert.equal(guest.currentLocationId,'airport');assert.equal(cash(s),total);
 const wallet=[guest.money,guest.savings],airline=structuredClone(s.businesses['hansdrex-airline']);s=structuredClone(s);build();guest=s.northF1.event.charters[0].guests[0];service.tick(s.northF1.event);
 assert.deepEqual([guest.money,guest.savings],wallet);assert.deepEqual(s.businesses['hansdrex-airline'],airline);assert.equal(guest.hansdrexAirlineReceipts.outbound.amount,200);
 for(let i=0;i<1500&&!guest.departedAt;i++){s.simulationAgeSeconds+=120;service.tick(s.northF1.event);}
 assert.equal(guest.phase,'departed');assert.equal(s.northF1.charterDepartures,1);assert.equal(s.businesses['hansdrex-airline'].outboundPassengers,1);assert.equal(guest.expensesLifetime,200);assert.equal(s.businesses['hansdrex-airline'].repatriationCreditOutstanding,188);
});

test('a prepared return group checks in before the positioning aircraft occupies its stand and keeps paid passengers through a partial manifest',()=>{
 const guests=Array.from({length:3},(_,i)=>({id:'PREPARED-'+i,kind:'visitor',alive:true,phase:'airport-ready',money:500,savings:0,x:port.gate.x,y:1.1,z:port.gate.z,currentLocationId:'airport',entryAirportId:'city'}));
 const flight={id:'PREPARED-COHORT',airportId:'city',sector:'west',direction:1,inboundAt:at-40000,parkedAt:at-30000,outboundAt:at-20000,exitAt:at-18000,landed:true,aircraftGone:true,guests};
 const event={id:'PREPARED-EVENT',format:2,tenPassengerVersion:1,airportItineraryVersion:1,startsAt:at-30000,endsAt:at-20000,charters:[flight],tourPaths:{}};
 const s={simulationAgeSeconds:at,timeScale:120,flies:[],businesses:{},weather:{condition:'clear'},northF1:{event,previousTours:[],charterDepartures:0}};
 const service=createF1Charters({world:()=>s,signature:()=>.5,weatherClosed:()=>false,account:()=>({cash:0})});service.tick(event);
 const plane=flight.returnLeg;assert.ok(plane.preboarding);assert.equal(plane.boardingStartedAt,at);assert.ok(plane.inboundAt>at);assert.ok(guests.every(f=>f.phase==='boarding'&&!f.onPlane));
 assert.equal(plane.boardingGuestIds.length,3);assert.equal(plane.passengerIds.length,0);
 for(let i=0;i<1500&&!flight.departed;i++){s.simulationAgeSeconds+=120;service.tick(event);}
 assert.equal(flight.departed,true);assert.equal(s.northF1.charterDepartures,3);assert.equal(s.businesses['hansdrex-airline'].outboundPassengers,3);
});
