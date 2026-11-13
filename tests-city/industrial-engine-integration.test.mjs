import test from 'node:test';import assert from 'node:assert/strict';
import {freshState,restoreState,getState,industrialEconomy,simulateEnterprises,liquidMoneySupply} from '../worker/civilization-engine.mjs';
import {LOCATIONS} from '../worker/city-map.mjs';
test('real engine publishes the three industrial zones and skips fabricated export revenue for a resident financed factory across restore',()=>{
 const s=freshState(),f=s.flies.find(f=>f.alive&&f.ageYears>=23&&f.ageYears<60&&!f.businessId&&!f.businessEmployeeOf&&!['doctor','power','police','military','firefighter','paramedic','school','transit'].includes(f.jobId));
 assert.ok(f);const bank=LOCATIONS.find(l=>l.id==='bank');
 Object.assign(f,{jobId:null,jobTitle:null,wage:0,money:6000,savings:4000,creditScore:750,health:95,energy:90,hunger:10,stress:5,currentLocationId:'bank',x:bank.x,z:bank.z,traveling:false,preferredWorkStart:8,preferredWorkHours:8});f.traits.ambition=.95;f.traits.thrift=.9;
 const total=liquidMoneySupply(),b=industrialEconomy.foundCompany(f,'INDUSTRY-west-1');assert.ok(b);assert.ok(Math.abs(liquidMoneySupply()-total)<1e-6);
 const view=getState().industrialEconomy;assert.equal(view.plants.length,16);assert.equal(view.plants.filter(p=>p.zone==='west').length,8);assert.equal(view.companies[0].ownerId,f.id);
 b.openingAt=0;b.nextOrderAt=1e12;b.inventory.raw=20;const before=b.cash;simulateEnterprises({day:1,hour:9});assert.equal(b.cash,before);assert.equal(b.revenueLifetime,0);
 const site=LOCATIONS.find(l=>l.id===b.locationId);Object.assign(f,{x:site.x,z:site.z,currentLocationId:site.id,traveling:false});s.simulationAgeSeconds+=1800;industrialEconomy.tick(1800,{hour:9,minute:30});assert.ok(b.productionUnits>0);assert.ok(b.inventory.raw<20);assert.equal(b.revenueLifetime,0);
 const records=s.flies.map(f=>[f.id,f.brain.id,f.housingUnitId]),cash=b.cash,inventory={...b.inventory};const restored=restoreState(structuredClone(s));
 assert.deepEqual(restored.flies.map(f=>[f.id,f.brain.id,f.housingUnitId]),records);assert.equal(restored.enterprises[b.id].cash,cash);assert.deepEqual(restored.enterprises[b.id].inventory,inventory);assert.equal(getState().industrialEconomy.companies.length,1);
});

test('real engine restores a resident-financed clothing shop without fabricated exports or stock',()=>{
 const s=freshState(),f=s.flies.find(f=>f.alive&&f.ageYears>=23&&f.ageYears<60&&!f.businessId&&!f.businessEmployeeOf&&!f.publicServiceRole&&!['doctor','power','police','military','firefighter','paramedic','school','transit'].includes(f.jobId));assert.ok(f);const bank=LOCATIONS.find(l=>l.id==='bank');Object.assign(f,{jobId:null,jobTitle:null,wage:0,money:6000,savings:4000,health:95,energy:90,currentLocationId:'bank',x:bank.x,z:bank.z,traveling:false});f.traits.ambition=.95;f.traits.thrift=.3;
 const total=liquidMoneySupply(),b=industrialEconomy.clothingRetail.open(f);assert.ok(b);assert.ok(Math.abs(liquidMoneySupply()-total)<1e-6);b.openingAt=0;const cash=b.cash;s.economy.lastEnterpriseHour=-1;simulateEnterprises({day:1,hour:9});assert.equal(b.cash,cash);assert.equal(b.revenueLifetime,0);assert.equal(b.inventory,0);
 const records=s.flies.map(f=>[f.id,f.brain.id,f.housingUnitId]),restored=restoreState(structuredClone(s));assert.deepEqual(restored.flies.map(f=>[f.id,f.brain.id,f.housingUnitId]),records);assert.equal(restored.enterprises[b.id].cash,cash);assert.equal(restored.enterprises[b.id].inventory,0);assert.equal(getState().industrialEconomy.clothingShops.find(shop=>shop.id===b.id).ownerId,f.id);
});
