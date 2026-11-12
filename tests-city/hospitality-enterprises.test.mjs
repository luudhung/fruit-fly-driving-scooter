import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,restoreState,attemptStartup,simulateEnterprises,liquidMoneySupply,cityVisitors,gameClock} from '../worker/civilization-engine.mjs';
import {BUILDINGS,LOCATIONS,APARTMENTS,SKYLINE_REDEVELOPMENTS} from '../worker/city-map.mjs';
import {hospitalityDemand,hospitalityPremises,hospitalityReady,syncHospitalityHotels,purchaseHospitalityMeal,diningVenues} from '../worker/hospitality-enterprises.mjs';

function founder(state,sector){
 const f=state.flies.find(f=>f.ageYears>=25&&f.ageYears<60&&!f.businessId);
 Object.assign(f,{money:20000,savings:10000,currentLocationId:'bank',traveling:false,stress:0,creditScore:850,bankLoan:0,debt:0});
 Object.assign(f.traits,{ambition:1,risk:1,thrift:.8});f.brain.plasticity.persistence=1;
 f.brain.memory.locationReward[sector==='hotel'?'hotel':'restaurant']=50;
 return f;
}

test('learned demand leads a resident to fund a unique hotel lease and wait for fit-out, with durable identity and money',()=>{
 const s=freshState(),owner=founder(s,'hotel');s.cityVisitors.airportTraffic.unmetGuests=30;
 const money=liquidMoneySupply(),brain=owner.brain.id;
 attemptStartup(owner);const b=s.enterprises[owner.businessId];
 assert.ok(b?.hospitality);assert.equal(b.sector,'hotel');assert.ok(b.lease.fitoutPaid>0);
 assert.ok(BUILDINGS.find(site=>site.id===b.locationId).kind==='block');
 assert.ok(!Object.values(s.housing.households).some(h=>h.unitId===b.locationId));
 assert.equal(hospitalityReady(s,b),false);syncHospitalityHotels(s);assert.equal(s.cityVisitors.hotels[b.locationId].closed,true);
 assert.ok(Math.abs(liquidMoneySupply()-money)<1e-6);
 const site=b.locationId,id=b.id,cash=b.cash,paid=b.lease.fitoutPaid;
 const restored=restoreState(structuredClone(s)),restoredBusiness=restored.enterprises[id];
 assert.equal(restoredBusiness.cash,cash);assert.equal(restoredBusiness.lease.fitoutPaid,paid);
 assert.equal(restored.flies.find(f=>f.id===owner.id).brain.id,brain);
 assert.ok(LOCATIONS.some(l=>l.id===site));
 restored.simulationAgeSeconds=b.openingAt;syncHospitalityHotels(restored);
 assert.equal(restored.cityVisitors.hotels[site].closed,false);
 assert.ok(!hospitalityPremises(restored,'hotel',owner).some(site=>site.id===b.locationId));
});

test('hotel guests pay the owner enterprise once and hospitality hourly accounting does not invent export receipts',()=>{
 const s=freshState(),owner=founder(s,'hotel');attemptStartup(owner);const b=s.enterprises[owner.businessId];
 s.simulationAgeSeconds=b.openingAt;syncHospitalityHotels(s);
 const guest=cityVisitors.spawnVisitor({budget:2000});assert.ok(guest);
 const before=liquidMoneySupply(),cash=b.cash;
 assert.equal(cityVisitors.reserveRoom(guest,b.locationId,3),true);
 const receipt=b.roomPrice*3;assert.equal(b.cash,cash+receipt);assert.equal(b.revenueLifetime,receipt);
 assert.equal(cityVisitors.reserveRoom(guest,b.locationId,3),true);assert.equal(b.cash,cash+receipt);
 assert.ok(Math.abs(liquidMoneySupply()-before)<1e-6);
 Object.assign(owner,{currentLocationId:b.locationId,traveling:false});
 const exports=Number(s.externalTrade?.exports||0),pending=b.pendingSales,revenue=b.revenueLifetime;
 simulateEnterprises(gameClock());assert.equal(b.pendingSales,0);assert.equal(b.revenueLifetime,revenue);assert.equal(Number(s.externalTrade?.exports||0),exports);
 assert.ok(pending>0);assert.ok(Math.abs(liquidMoneySupply()-before)<1e-6);
});

test('resident restaurant meals require real on-site staff and pay once for real finite stock',()=>{
 const s=freshState(),owner=founder(s,'food');attemptStartup(owner);const b=s.enterprises[owner.businessId];assert.equal(b.sector,'food');
 s.simulationAgeSeconds=b.openingAt;
 const guest=cityVisitors.spawnVisitor({budget:2000});Object.assign(guest,{currentLocationId:b.locationId,traveling:false,hunger:85,thirst:55});
 assert.ok(diningVenues(s,guest).some(v=>v.id===b.locationId));
 assert.equal(purchaseHospitalityMeal(s,guest,b.locationId),false,'an empty restaurant cannot serve');
 Object.assign(owner,{currentLocationId:b.locationId,traveling:false,sleeping:false});
 const before=liquidMoneySupply(),cash=b.cash,stock=b.stock,quote=diningVenues(s,guest).find(v=>v.id===b.locationId).price;
 assert.equal(purchaseHospitalityMeal(s,guest,b.locationId),true);assert.equal(b.cash,cash+quote);assert.equal(b.stock,stock-1);assert.equal(guest.hunger,30);
 assert.equal(purchaseHospitalityMeal(s,guest,b.locationId),false);assert.ok(Math.abs(liquidMoneySupply()-before)<1e-6);
 s.urbanWorld.buildings[b.locationId]={id:b.locationId,stage:'unsafe',health:40};
 assert.equal(diningVenues(s,guest).some(v=>v.id===b.locationId),false);
});

test('empty hotel supply and competing restaurants dampen autonomous startup demand',()=>{
 const s=freshState();s.cityVisitors.airportTraffic.unmetGuests=30;
 const demand=hospitalityDemand(s,'hotel');s.cityVisitors.hotels.extra={capacity:100,rooms:{}};
 assert.ok(hospitalityDemand(s,'hotel')<demand);
 const food=hospitalityDemand(s,'food');for(let i=0;i<30;i++)s.enterprises[`COMP-${i}`]={status:'operating',sector:'food',hospitality:true};
 assert.ok(hospitalityDemand(s,'food')<food/2);
});

test('a hired restaurant employee receives real payroll only while physically working',()=>{
 const s=freshState(),owner=founder(s,'food');attemptStartup(owner);const b=s.enterprises[owner.businessId];s.simulationAgeSeconds=b.openingAt;
 const employee=s.flies.find(f=>f.id!==owner.id&&f.ageYears>=20&&f.ageYears<65),clock=gameClock();
 Object.assign(employee,{jobId:null,businessEmployeeOf:b.id,currentLocationId:b.locationId,traveling:false,sleeping:false,action:'working as a cook',preferredWorkStart:clock.hour,preferredWorkHours:8,wage:6});b.employees=[employee.id];
 const cash=employee.money,money=liquidMoneySupply();simulateEnterprises(clock);
 assert.ok(employee.money>cash);assert.ok(Math.abs(liquidMoneySupply()-money)<1e-6);
 employee.traveling=true;const after=employee.money;s.economy.lastEnterpriseHour=-1;simulateEnterprises(clock);assert.equal(employee.money,after);
});

test('map23 moves the second tower household with its title and appends new ordinary apartments without resetting money or brains',()=>{
 const s=freshState(),f=s.flies[0],hh=s.housing.households[f.householdId],base=APARTMENTS.find(b=>b.id==='petronas-east');
 s.mapVersion=22;const block=s.housing.apartmentBlocks.find(b=>b.id===base.id);block.x=-71;block.z=-43.5;block.occupants=[hh.id];
 Object.assign(hh,{unitId:base.id,homeX:-71,homeZ:-43.5});Object.assign(f,{housingUnitId:base.id,homeId:base.id,currentLocationId:base.id,indoors:true,traveling:false,x:-71,z:-43.5,homeX:-71,homeZ:-43.5});
 const before={money:f.money,savings:f.savings,brain:f.brain.id};
 for(const b of APARTMENTS.filter(b=>b.id.startsWith('TOWER-COURT-')))s.housing.apartmentBlocks=s.housing.apartmentBlocks.filter(item=>item.id!==b.id);
 const restored=restoreState(structuredClone(s)),person=restored.flies.find(person=>person.id===f.id);
 assert.equal(person.homeX,base.x);assert.equal(person.x,base.x);assert.equal(restored.housing.households[hh.id].homeX,base.x);
 assert.deepEqual({money:person.money,savings:person.savings,brain:person.brain.id},before);
 for(const b of APARTMENTS.filter(b=>b.id.startsWith('TOWER-COURT-')))assert.ok(restored.housing.apartmentBlocks.some(item=>item.id===b.id));
 for(const [oldId,newId]of Object.entries(SKYLINE_REDEVELOPMENTS))if(newId===base.id)assert.ok(!restored.urbanWorld.buildings[oldId]);
});
