import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,restoreState,countries,industrialEconomy,liquidMoneySupply} from '../worker/civilization-engine.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function quiet(s){s.regionalFreight.nextDispatchAt=1e12;s.industrialEconomy.nextRestockAt=1e12;s.internationalEconomy.nextDecisionAt=1e12;}

test('an actual funded North food import uses the existing agency fleet, arrives physically and settles its source escrow once across restore',()=>{
 let s=freshState();quiet(s);const before={money:liquidMoneySupply(),buyer:s.businesses['north-market'].cash,inventory:s.businesses['north-market'].inventory||0,source:s.businesses.market.inventory,seller:s.businesses.market.cash,escrow:s.businesses['international-trade-escrow'].cash,regionalEscrow:s.businesses['regional-freight-escrow'].cash,privateCarrier:s.businesses['north-farm-carrier'].cash,delivered:s.internationalEconomy.delivered,people:s.flies.map(f=>[f.id,f.brain.id,f.x,f.z])};
 const order=countries.economy.requestShipment({sellerId:'market',buyerId:'north-market',sourceLocationId:'market',destinationId:'north-market',quantity:40,unitPrice:5.2});assert.ok(order);assert.equal(s.businesses['north-market'].inventory||0,before.inventory);assert.equal(s.businesses.market.inventory,before.source-40);near(s.businesses['north-market'].cash,before.buyer-order.total);near(s.businesses['international-trade-escrow'].cash,before.escrow+order.total);
 industrialEconomy.tick(0,{hour:2,minute:0});assert.ok(s.regionalFreight.jobs.some(j=>j.providerId==='national'&&j.sourceOrderId===order.id));assert.ok(s.regionalFreight.trucks.some(t=>t.jobId===`REGIONAL-NATIONAL-${order.id}`));assert.equal(s.businesses['regional-freight-escrow'].cash,before.regionalEscrow);const origin=new Map(s.regionalFreight.trucks.map(t=>[t.id,{x:t.x,z:t.z}]));let displacement=0;
 for(let i=0;i<2500&&!s.internationalEconomy.orders.find(o=>o.id===order.id)?.paid;i++){s.simulationAgeSeconds+=120;industrialEconomy.tick(120,{hour:2,minute:0});for(const t of s.regionalFreight.trucks){const p=origin.get(t.id);displacement=Math.max(displacement,Math.hypot(t.x-p.x,t.z-p.z));}if(i===20){s=restoreState(structuredClone(s));quiet(s);}}
 const paid=s.internationalEconomy.orders.find(o=>o.id===order.id);assert.equal(paid.phase,'complete',JSON.stringify({paid,trucks:s.regionalFreight.trucks}));assert.ok(displacement>100);assert.equal(paid.carrierId,'regional-logistics');assert.equal(paid.regionalCrewSettled,true);assert.equal(s.internationalEconomy.delivered,before.delivered+1);assert.equal(s.businesses['north-market'].inventory,before.inventory+40);near(s.businesses.market.cash,before.seller+40*5.2);assert.equal(s.businesses['north-farm-carrier'].cash,before.privateCarrier);near(s.businesses['international-trade-escrow'].cash,before.escrow);near(liquidMoneySupply(),before.money);assert.deepEqual(s.flies.map(f=>[f.id,f.brain.id,f.x,f.z]),before.people);assert.equal(s.regionalFreight.trucks.length,24);assert.equal(s.internationalEconomy.trucks.length,2);
 s=restoreState(structuredClone(s));quiet(s);assert.equal(countries.economy.freightProvider.settle(s.internationalEconomy.orders.find(o=>o.id===order.id)),false);industrialEconomy.tick(0,{hour:2,minute:0});assert.equal(s.businesses['north-market'].inventory,before.inventory+40);assert.equal(s.internationalEconomy.delivered,before.delivered+1);near(liquidMoneySupply(),before.money);
});

test('a cancelled agency seed import restores the actual seed seller and funded buyer without phantom planting or duplicate refund',()=>{
 let s=freshState();quiet(s);const before={money:liquidMoneySupply(),cash:s.businesses['farm:north-city'].cash,inventory:s.businesses.farm.inventory,seeds:s.internationalEconomy.stock.seeds,escrow:s.businesses['international-trade-escrow'].cash};const order=countries.economy.requestShipment({sellerId:'farm',buyerId:'farm:north-city',sourceLocationId:'farm',destinationId:'north-farm',product:'seed grain',quantity:20,unitPrice:1.4});assert.ok(order);industrialEconomy.tick(0,{hour:2,minute:0});assert.equal(order.carrierId,'regional-logistics');assert.equal(countries.economy.freightProvider.settle(order,true),true);assert.equal(countries.economy.freightProvider.settle(order,true),false);assert.equal(s.businesses.farm.inventory,before.inventory);assert.equal(s.internationalEconomy.stock.seeds,before.seeds);near(s.businesses['farm:north-city'].cash,before.cash);near(s.businesses['international-trade-escrow'].cash,before.escrow);s=restoreState(structuredClone(s));quiet(s);industrialEconomy.tick(0,{hour:2,minute:0});assert.equal(s.businesses.farm.inventory,before.inventory);assert.equal(s.internationalEconomy.stock.seeds,before.seeds);near(s.businesses['farm:north-city'].cash,before.cash);near(liquidMoneySupply(),before.money);
});

test('a grain ration for the fire station is paid and physically unloaded before a hungry responder can eat',()=>{
 const s=freshState();quiet(s);
 const sourceId='INDUSTRY-north-4',sellerId=`regional-warehouse-${sourceId}`,buyerId='emergency-operations';
 s.businesses[sellerId]||={cash:0,inventory:0};s.regionalFreight.stocks[sourceId]||={fabric:0,grain:0,aggregate:0};s.regionalFreight.stocks[sourceId].grain=100;
 s.businesses[buyerId].inventory=0;s.businesses[buyerId].cash=2000;
 const before=liquidMoneySupply(),grain=s.regionalFreight.stocks[sourceId].grain;
 const order=countries.economy.requestShipment({sellerId,buyerId,sourceLocationId:sourceId,destinationId:'firestation',product:'grain rations',quantity:30,unitPrice:2});
 assert.ok(order);assert.equal(s.regionalFreight.stocks[sourceId].grain,grain-30);assert.equal(s.businesses[buyerId].inventory,0);
 let travelled=0;const starts=new Map(s.regionalFreight.trucks.map(t=>[t.id,{x:t.x,z:t.z}]));
 for(let i=0;i<2500&&!order.paid;i++){
  s.simulationAgeSeconds+=120;industrialEconomy.tick(120,{hour:2,minute:0});
  for(const truck of s.regionalFreight.trucks){const origin=starts.get(truck.id);travelled=Math.max(travelled,Math.hypot(truck.x-origin.x,truck.z-origin.z));}
  if(!order.paid)assert.equal(s.businesses[buyerId].inventory,0,'food cannot arrive before unloading');
 }
 assert.equal(order.phase,'complete');assert.ok(travelled>100);assert.equal(s.businesses[buyerId].inventory,30);assert.equal(s.regionalFreight.stocks[sourceId].grain,grain-30);near(liquidMoneySupply(),before);
});
