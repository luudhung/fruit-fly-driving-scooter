import test from 'node:test';import assert from 'node:assert/strict';
import {createF1Charters} from '../worker/north-f1-charters.mjs';
import {airportById} from '../worker/aviation.mjs';
const HOUR=3600;
test('ready airport guests depart independently of a missing tour member, who later boards a separate real return flight',()=>{
 const port=airportById('city'),at=10*86400;
 const guests=Array.from({length:10},(_,i)=>({id:'RETURN-GUEST-'+i,kind:'visitor',alive:true,money:1000,savings:0,initialCash:1000,phase:i===9?'visiting':'airport-ready',x:port.gate.x,y:1.1,z:port.gate.z,currentLocationId:i===9?'park':port.locationId,nights:0,terminalAt:at-10000,departAt:at-1000,touringUntil:at-1000,hansTowerTrip:i===9}));
 const flight={id:'RETURN-COHORT',airportId:'city',sector:'east',direction:1,inboundAt:at-30000,parkedAt:at-20000,outboundAt:at-15000,exitAt:at-14000,landed:true,aircraftGone:true,guests};
 const e={id:'RETURN-EVENT',format:2,tenPassengerVersion:1,airportItineraryVersion:1,startsAt:at-20000,endsAt:at-15000,charters:[flight],tourPaths:{}};
 const s={simulationAgeSeconds:at,timeScale:120,businesses:{},weather:{condition:'clear'},northF1:{event:e,charterArrivals:10,charterDepartures:0,externalInflow:10000,externalOutflow:0,previousTours:[]}};
 const create=()=>createF1Charters({world:()=>s,signature:()=>.5,weatherClosed:()=>false,account:()=>({cash:0}),visitAttraction:()=>{},attend:()=>false});let service=create();service.tick(e);
 s.simulationAgeSeconds+=HOUR;service.tick(e);assert.ok(flight.returnLeg,'nine present passengers do not wait forever for an absent tenth');
 const firstId=flight.returnLeg.id;
 for(let i=0;i<1500&&s.northF1.charterDepartures<9;i++){s.simulationAgeSeconds+=120;service.tick(e);}
 assert.equal(s.northF1.charterDepartures,9);assert.equal(guests[9].phase,'visiting');assert.equal(guests[9].money,1000);assert.equal(flight.departed,false);assert.equal(s.businesses['hansdrex-airline'].cash,1800);
 Object.assign(guests[9],{hansTowerTrip:false,phase:'airport-ready',currentLocationId:port.locationId});service=create();
 for(let i=0;i<1500&&s.northF1.charterDepartures<10;i++){s.simulationAgeSeconds+=120;service.tick(e);}
 assert.equal(s.northF1.charterDepartures,10);assert.equal(flight.departed,true);assert.equal(flight.returnLeg.id,firstId+'-2');assert.equal(s.businesses['hansdrex-airline'].cash,2000);assert.equal(new Set(guests.map(g=>g.id)).size,10);
 service.tick(e);assert.equal(s.businesses['hansdrex-airline'].cash,2000);
});

test('a backlog books at most two new return aircraft per airport and sample, then drains on later samples without charging waiting guests',()=>{
 const at=10*86400,port=airportById('city'),e={id:'BACKLOG',format:2,tenPassengerVersion:1,airportItineraryVersion:1,startsAt:at-20000,endsAt:at-15000,tourPaths:{},charters:[]};
 for(let i=0;i<5;i++)e.charters.push({id:'OLD-COHORT-'+i,airportId:'city',sector:'east',direction:1,inboundAt:at-30000,parkedAt:at-20000,outboundAt:at-15000,exitAt:at-14000,landed:true,aircraftGone:true,guests:[{id:'READY-'+i,kind:'visitor',alive:true,money:1000,savings:0,phase:'airport-ready',x:port.gate.x,y:1.1,z:port.gate.z,currentLocationId:'airport'},{id:'MISSING-'+i,alive:true,phase:'visiting',hansTowerTrip:true,money:1000,savings:0}]});
 const s={simulationAgeSeconds:at,timeScale:120,flies:[],businesses:{},northF1:{event:e,previousTours:[]}},service=createF1Charters({world:()=>s,signature:()=>.5,weatherClosed:()=>false,account:()=>({cash:0}),visitAttraction:()=>{}}),count=()=>e.charters.filter(f=>f.returnLeg).length;
 service.tick(e);s.simulationAgeSeconds+=HOUR;service.tick(e);assert.equal(count(),2);service.tick(e);assert.equal(count(),2);s.simulationAgeSeconds+=120;service.tick(e);assert.equal(count(),4);s.simulationAgeSeconds+=120;service.tick(e);assert.equal(count(),5);assert.ok(e.charters.every(f=>f.guests.every(g=>g.money===1000)));
});
