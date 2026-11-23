import test from 'node:test';
import assert from 'node:assert/strict';
import {createIslandAirCargo} from '../worker/island-air-cargo.mjs';
import {createRegionalAviationSystem} from '../worker/regional-aviation.mjs';
import {AVIATION,nextFlight,scheduledAircraft,flightPose,regionalFlightPath} from '../worker/aviation.mjs';
import {COUNTRY_AIRPORTS} from '../worker/country-map.mjs';
import {visitorAircraftPose,visitorStandReservation,visitorStands,INBOUND_SECONDS} from '../worker/visitor-aviation.mjs';
const cash=s=>Number(s.treasury.cash)+Object.values(s.businesses).reduce((n,b)=>n+Number(b.cash||0),0);
function fixture(){
 let s={simulationAgeSeconds:8*3600,timeScale:120,foodReserve:1500,flies:[],treasury:{cash:5000},businesses:{farm:{inventory:50,cash:500,price:1.4},'treasury:hawaii':{cash:1000},'island-market':{cash:0,inventory:0},'island-restaurant':{cash:300,inventory:0},'island-resort':{cash:400,inventory:0}},cityVisitors:{visitors:[]}};
 let cargo=createIslandAirCargo({world:()=>s});
 return{get s(){return s;},get cargo(){return cargo;},at(at){s.simulationAgeSeconds=at;cargo.tick();},restore(){s=structuredClone(s);cargo=createIslandAirCargo({world:()=>s});}};
}
test('Hawaii passenger departures are two real minutes apart at scale120 and each aircraft parks only after its physical flight ends',()=>{
 assert.equal(AVIATION.islandIntervalSeconds/120,120);
 for(let day=0;day<2;day++)for(let hour=0;hour<24;hour+=4){
  const at=day*86400+hour*3600,leg=nextFlight(at,'city',0),back=nextFlight(at,'island',0);
  assert.equal(leg.departure,at);assert.equal(back.departure,at+7200);assert.equal(nextFlight(at+1,'city',0).departure,at+14400);
  const parked=flightPose(leg.arrival,leg),next=scheduledAircraft(at+7200);
  assert.equal(parked.phase,'parked');assert.equal(next.from,'island');assert.equal(next.phase,'flying');
  assert.ok(Number.isFinite(next.x)&&Number.isFinite(next.z));
 }
});
test('paid finite daily food remains aboard until actual landing, parking and unloading; restore never duplicates a receipt',()=>{
 const t=fixture(),before=cash(t.s);t.at(8*3600);
 const shipment=t.cargo.snapshot().shipments[0];assert.equal(shipment.quantity,100);assert.equal(shipment.flight.id,'city-28800-V2');
 assert.equal(t.s.foodReserve,1400);assert.equal(t.s.businesses.farm.inventory,50);assert.equal(t.s.businesses['island-market'].inventory,0);assert.equal(cash(t.s),before);
 assert.equal(t.cargo.snapshot().publicAdvanceOutstanding,165);assert.equal(t.s.businesses['treasury:hawaii'].cash,835);
 t.at(shipment.flight.arrival-1);assert.equal(t.s.businesses['island-market'].inventory,0);
 t.restore();t.at(shipment.unloadAt-1);assert.equal(t.cargo.snapshot().deliveredUnits,0);
 t.at(shipment.unloadAt);assert.equal(t.s.businesses['island-market'].inventory,60);assert.equal(t.s.businesses['island-restaurant'].inventory,25);assert.equal(t.s.businesses['island-resort'].inventory,15);assert.equal(cash(t.s),before);
 t.restore();t.at(shipment.unloadAt+120);t.at(12*3600);assert.equal(t.cargo.snapshot().deliveredUnits,100);assert.equal(t.cargo.snapshot().shipments.length,1);assert.equal(t.s.foodReserve,1400);
 for(const id of ['island-market','island-restaurant','island-resort'])t.s.businesses[id].inventory=0;
 t.at(86400+8*3600);assert.equal(t.cargo.snapshot().shipments.length,2);assert.equal(t.s.foodReserve,1300);assert.equal(t.s.businesses['island-market'].inventory,0);
});
test('no budget, no food or unsafe weather cannot conjure shipments or debit protected mainland food',()=>{
 const t=fixture();t.s.foodReserve=1000;
 t.at(8*3600);assert.equal(t.cargo.snapshot().shipments.length,0);assert.equal(t.s.foodReserve,1000);
 t.s.foodReserve=1500;for(const b of Object.values(t.s.businesses))b.cash=0;
 t.at(8*3600+120);assert.equal(t.cargo.snapshot().shipments.length,0);assert.equal(t.s.foodReserve,1500);
 t.s.businesses['treasury:hawaii'].cash=1000;
 const blocked=createIslandAirCargo({world:()=>t.s,mayDepart:()=>false});blocked.tick();assert.equal(blocked.snapshot().shipments.length,0);
 t.at(12*3600);assert.equal(t.cargo.snapshot().shipments.length,1);assert.equal(t.cargo.snapshot().shipments[0].flight.departure,12*3600);
});
test('a clock jump past a completed flight cannot create retroactive cargo or food',()=>{
 const t=fixture();t.at(9*3600);assert.equal(t.cargo.snapshot().shipments.length,0);assert.equal(t.s.foodReserve,1500);
 t.at(12*3600);assert.equal(t.cargo.snapshot().shipments.length,1);
});
test('regional aviation ticks run the daily food service on the existing scheduled passenger flight',()=>{
 const t=fixture(),air=createRegionalAviationSystem({world:()=>t.s,weatherDanger:()=>0});air.tick();
 const snapshot=air.snapshot();assert.equal(snapshot.cargo.shipments.length,1);assert.equal(snapshot.cargo.shipments[0].flight.id,snapshot.flights[0].id);assert.equal(snapshot.flights[0].seats,10);assert.ok(snapshot.flights.length>=1&&snapshot.flights.length<=12);assert.ok(snapshot.flights.every(f=>f.scheduled));
});
test('Hawaii has separate painted visitor and shuttle stands with safe runway/taxi/terminal clearances',()=>{
 const island=COUNTRY_AIRPORTS.find(p=>p.id==='island'),r=island.runway;
 assert.deepEqual(r,{x:145,z:742,w:240,d:16});assert.equal(visitorStands('island').length,1);
 for(const stand of island.stands){
  assert.ok(stand.z-11>r.z+r.d/2+4);assert.ok(stand.z-island.taxiwayZ>=20);
  assert.ok(stand.x-12.5>=island.apron.x-island.apron.w/2);assert.ok(stand.x+12.5<=island.apron.x+island.apron.w/2);
  assert.ok(stand.x-12.5>island.terminal.x+island.terminal.w/2+8);
 }
 const inbound=nextFlight(8*3600,'city',0),path=regionalFlightPath(inbound);assert.equal(path.at(-2)[2],island.taxiwayZ);assert.deepEqual(path.at(-1),[170,3,782]);
 const slot=visitorStandReservation(9*3600,[],'island'),foreign={airportId:'island',arrivalStand:slot.stand,standId:slot.stand.id,sector:'east',direction:1,inboundAt:slot.at,parkedAt:slot.at+INBOUND_SECONDS};
 const parked=visitorAircraftPose(foreign.parkedAt,foreign);assert.equal(parked.phase,'parked');assert.equal(parked.x,120);assert.equal(parked.z,782);
 const shuttle=flightPose(9*3600,inbound);assert.ok(Math.hypot(shuttle.x-parked.x,shuttle.z-parked.z)>=24);
 const taxi=visitorAircraftPose(foreign.inboundAt+950,foreign);assert.equal(taxi.z,island.taxiwayZ);assert.equal(taxi.x,120);
});

test('daily food can load on the mainland before departure so a coarse background tick cannot miss its entire flight',()=>{
 const t=fixture();t.at(11*3600+300);const shipment=t.cargo.snapshot().shipments[0];
 assert.equal(shipment.flight.departure,12*3600);assert.equal(shipment.status,'loaded');assert.equal(t.s.businesses['island-market'].inventory,0);
 t.restore();t.at(shipment.unloadAt+600);assert.equal(t.cargo.snapshot().deliveredUnits,100);assert.equal(t.s.businesses['island-market'].inventory,60);
});
test('island procurement protects two daily meals per resident at the market and pays resort-service wages from actual employers',()=>{
 const t=fixture();t.s.flies=Array.from({length:50},(_,i)=>({id:'HWI-'+i,alive:true,residencyCountryId:'hawaii',x:170,z:850,jobId:i===0?'island-retail':null,wage:4.7}));t.s.foodReserve=1800;t.at(8*3600);
 const shipment=t.cargo.snapshot().shipments[0];assert.equal(shipment.manifest.find(p=>p.buyerId==='island-market').quantity,100);assert.ok(shipment.quantity<=200);assert.equal(t.s.businesses['island-market'].price,6);assert.equal(t.s.businesses['island-restaurant'].price,10);assert.equal(t.s.flies[0].wage,8.8);
});


test('daily island provisioning can buy domestic warehouse grain when retail shelves are empty, preserving mainland crew rations',()=>{
 const t=fixture();t.s.foodReserve=0;t.s.industrialEconomy={rawStock:{grain:260,fabric:34,aggregate:88}};t.s.businesses['industrial-raw-depot']={cash:20};
 const before=cash(t.s);t.at(8*3600);const shipment=t.cargo.snapshot().shipments[0];assert.equal(shipment.quantity,100);
 assert.ok(shipment.manifest.every(p=>p.sellerId==='industrial-raw-depot'));assert.equal(t.s.industrialEconomy.rawStock.grain,160);assert.equal(t.s.industrialEconomy.rawStock.fabric,34);assert.equal(cash(t.s),before);
 assert.equal(t.s.businesses['island-market'].inventory,0);t.at(shipment.unloadAt);assert.equal(t.s.businesses['island-market'].inventory,60);
 const limited=fixture();limited.s.foodReserve=0;limited.s.industrialEconomy={rawStock:{grain:76}};limited.at(8*3600);
 assert.equal(limited.cargo.snapshot().shipments[0].quantity,16);assert.equal(limited.s.industrialEconomy.rawStock.grain,60);
});
