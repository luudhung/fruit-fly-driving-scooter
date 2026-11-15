import test from 'node:test';import assert from 'node:assert/strict';
import {freshState,restoreState,industrialEconomy,liquidMoneySupply,getState} from '../worker/civilization-engine.mjs';
import {REGIONAL_TRUCK_LIMIT,REGIONAL_HUBS} from '../worker/regional-freight.mjs';
import {motorwaySegmentAt} from '../worker/motorway.mjs';
const goods=s=>Object.values(s.industrialEconomy.rawStock).reduce((a,b)=>a+b,0)+Object.values(s.regionalFreight.stocks).flatMap(Object.values).reduce((a,b)=>a+b,0)+s.regionalFreight.jobs.filter(j=>!j.paid).reduce((a,b)=>a+b.quantity,0)+s.regionalFreight.exports;
test('a bounded funded intercity fleet exists without waiting for resident startups and restore never purchases it twice',()=>{
 const s=freshState(),people=s.flies.map(f=>[f.id,f.brain.id,f.money,f.savings,f.housingUnitId]),cash=liquidMoneySupply();assert.equal(s.regionalFreight.trucks.length,REGIONAL_TRUCK_LIMIT);assert.equal(s.regionalFreight.procurement,10800);assert.equal(new Set(s.regionalFreight.trucks.map(t=>`${t.x},${t.z}`)).size,REGIONAL_TRUCK_LIMIT);
 const restored=restoreState(structuredClone(s));assert.deepEqual(restored.flies.map(f=>[f.id,f.brain.id,f.money,f.savings,f.housingUnitId]),people);assert.ok(Math.abs(liquidMoneySupply()-cash)<1e-6);assert.equal(restored.regionalFreight.trucks.length,24);assert.equal(getState().industrialEconomy.regionalFreight.fleet,24);
});
test('warehouse demand sends real cargo via motorways, waits to load and delivers before booking receipts; cargo and cash survive restart',()=>{
 let s=freshState(),cash=liquidMoneySupply(),stock=goods(s),fastest=0,moving=0;
 s.industrialEconomy.nextRestockAt=1e12;
 for(let i=0;i<4200;i++){
  s.simulationAgeSeconds+=120;industrialEconomy.tick(120,{hour:Math.floor(s.simulationAgeSeconds/3600)%24,minute:0});
  const fleet=s.regionalFreight.trucks;moving=Math.max(moving,fleet.filter(t=>t.traveling).length);fastest=Math.max(fastest,...fleet.map(t=>t.motionSpeed));
  if(i===20){assert.ok(fleet.some(t=>t.routeWaypoints.some(p=>motorwaySegmentAt(p))));assert.ok(s.regionalFreight.jobs.some(j=>!j.paid));s=restoreState(structuredClone(s));}
  if(s.regionalFreight.delivered>=12)break;
 }
 assert.ok(moving>=8,`only ${moving} trucks moving`);assert.ok(fastest>=20,`maximum ${fastest}`);assert.ok(s.regionalFreight.delivered>=12,JSON.stringify({done:s.regionalFreight.delivered,jobs:s.regionalFreight.jobs.map(j=>({id:j.id,phase:j.phase})),trucks:s.regionalFreight.trucks.map(t=>({id:t.id,x:t.x,z:t.z,phase:t.phase,v:t.motionSpeed}))}));
 assert.ok(Math.abs(goods(s)-stock)<1e-6);assert.equal(s.regionalFreight.exportRevenue,0,'Hans/North warehouse trade has funded buyers');assert.ok(s.regionalFreight.jobs.every(j=>!j.exported));assert.ok(Math.abs(liquidMoneySupply()-cash)<1e-6);for(const id of REGIONAL_HUBS.slice(1))for(const amount of Object.values(s.regionalFreight.stocks[id]))assert.ok(amount>=0);
});

test('a restored legacy North forwarding consignment becomes a funded warehouse purchase once',()=>{
 let s=freshState();const [from,to]=REGIONAL_HUBS,quantity=20,job={id:'LEGACY-NORTH-FUNDED',from,to,product:'fabric',quantity,price:40,fee:30,exported:true,phase:'queued',paid:false,createdAt:0,deadline:86400};s.industrialEconomy.rawStock.fabric-=quantity;s.regionalFreight.jobs.push(job);const buyerId=`regional-warehouse-${to}`,cash=s.businesses[buyerId].cash,total=liquidMoneySupply(),stock=goods(s),escrow=s.businesses['regional-freight-escrow'].cash;
 s=restoreState(structuredClone(s));const saved=s.regionalFreight.jobs.find(j=>j.id===job.id);assert.equal(saved.exported,false);assert.equal(saved.paid,false);assert.equal(s.businesses[buyerId].cash,cash-70);assert.equal(s.businesses['regional-freight-escrow'].cash,escrow+70);assert.ok(Math.abs(liquidMoneySupply()-total)<1e-6);assert.equal(goods(s),stock);
 s=restoreState(structuredClone(s));assert.equal(s.businesses[buyerId].cash,cash-70);assert.equal(s.businesses['regional-freight-escrow'].cash,escrow+70);assert.ok(Math.abs(liquidMoneySupply()-total)<1e-6);
});

test('an idle licensed truck physically returns from a motorway to legal depot parking, paying real fuel and agency costs once',()=>{
 const s=freshState(),d=s.regionalFreight,t=d.trucks[0];d.nextDispatchAt=1e12;d.nextExportAt=1e12;s.industrialEconomy.nextRestockAt=1e12;Object.assign(t,{x:-1082.6,z:-668,phase:'parked',jobId:null,traveling:false,routeWaypoints:[],returnParking:null,returning:false});const origin={x:t.x,z:t.z},before=liquidMoneySupply(),operator=s.businesses['regional-logistics'].cash,stock=goods(s);let moved=0;for(let i=0;i<2400;i++){s.simulationAgeSeconds+=120;industrialEconomy.tick(120,{hour:2,minute:0});moved=Math.max(moved,Math.hypot(t.x-origin.x,t.z-origin.z));if(t.returnParking&&!t.traveling&&Math.hypot(t.x-t.returnParking.x,t.z-t.returnParking.z)<.8)break;}
 assert.ok(moved>100,JSON.stringify(t));assert.equal(t.phase,'parked');assert.equal(t.jobId,null);assert.ok(t.returnParking?.spaceId);assert.ok(Math.hypot(t.x-t.returnParking.x,t.z-t.returnParking.z)<.8);assert.equal(d.trucks.length,24);assert.equal(d.jobs.length,0);assert.equal(goods(s),stock);assert.ok(s.businesses['regional-logistics'].cash<operator);assert.ok(s.businesses['industrial-fuel'].cash>0);assert.ok(s.businesses['regional-haul-crews'].cash>0);assert.ok(Math.abs(liquidMoneySupply()-before)<1e-6);const costs=d.emptyReturnCosts;for(let i=0;i<30;i++){s.simulationAgeSeconds+=120;industrialEconomy.tick(120,{hour:2,minute:0});}assert.equal(d.emptyReturnCosts,costs);
});

test('funded national warehouses do not buy already-full stock merely to keep trucks animated',()=>{
 const s=freshState(),d=s.regionalFreight;s.industrialEconomy.nextRestockAt=1e12;for(const id of REGIONAL_HUBS.slice(1)){d.stocks[id]={fabric:240,grain:240,aggregate:240};for(const product of ['fabric','grain','aggregate']){s.industrialEconomy.rawStock[product]-=240;s.businesses[`regional-warehouse-${id}`].cash-=480;s.businesses['industrial-raw-depot'].cash+=480;}}const stock=goods(s),money=liquidMoneySupply(),accounts=REGIONAL_HUBS.slice(1).map(id=>s.businesses[`regional-warehouse-${id}`].cash);for(let i=0;i<30;i++){s.simulationAgeSeconds+=120;industrialEconomy.tick(120,{hour:2,minute:0});}assert.equal(d.jobs.length,0);assert.equal(d.delivered,0);assert.equal(goods(s),stock);assert.deepEqual(REGIONAL_HUBS.slice(1).map(id=>s.businesses[`regional-warehouse-${id}`].cash),accounts);assert.ok(Math.abs(liquidMoneySupply()-money)<1e-6);
});
