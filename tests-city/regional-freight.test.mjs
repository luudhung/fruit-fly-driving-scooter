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
 assert.ok(Math.abs(goods(s)-stock)<1e-6);assert.ok(Math.abs(liquidMoneySupply()-cash-s.regionalFreight.exportRevenue)<1e-6);for(const id of REGIONAL_HUBS.slice(1))for(const amount of Object.values(s.regionalFreight.stocks[id]))assert.ok(amount>=0);
});
