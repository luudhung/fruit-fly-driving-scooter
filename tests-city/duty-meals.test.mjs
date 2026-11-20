import test from 'node:test';
import assert from 'node:assert/strict';
import {provisionDutyMeal} from '../worker/duty-meals.mjs';
import {NORTH_FARM} from '../worker/country-map.mjs';
test('on-duty food uses finite domestic stock and the proper treasury, once per actual meal',()=>{
 const s={simulationAgeSeconds:12,totalTransactions:0,treasury:{cash:100},businesses:{'treasury:north-city':{cash:50},market:{cash:10,inventory:3},'north-market':{cash:20,inventory:1}}},f={id:'CREW',alive:true,x:180,z:-620,hunger:100,thirst:80,money:12};
 assert.equal(provisionDutyMeal(s,f,'north-city'),true);assert.equal(f.hunger,40);assert.equal(s.businesses['north-market'].inventory,0);assert.equal(s.businesses['north-market'].cash,24);assert.equal(s.businesses['treasury:north-city'].cash,46);assert.equal(s.treasury.cash,100);assert.equal(s.businesses.market.inventory,3);assert.equal(f.money,12);
 assert.equal(provisionDutyMeal(s,f,'north-city'),false);f.hunger=100;assert.equal(provisionDutyMeal(s,f,'north-city'),false);assert.equal(f.hunger,100);
 s.businesses['north-market'].inventory=1;f.traveling=true;assert.equal(provisionDutyMeal(s,f,'north-city'),false);f.traveling=false;assert.equal(provisionDutyMeal(s,f,'hansdrex'),false);
});


test('North construction crews can eat their own paid materials-yard pantry without consuming Hans food or seed grain',()=>{
 const s={simulationAgeSeconds:12,treasury:{cash:100},businesses:{'treasury:north-city':{cash:50},'civic-recovery':{cash:0,inventory:60},'north-civic-recovery':{cash:0,inventory:1}},regionalFreight:{stocks:{'INDUSTRY-north-4':{grain:20}}}},f={alive:true,x:197,z:-963,hunger:100,thirst:80};
 assert.equal(provisionDutyMeal(s,f,'north-city'),true);assert.equal(f.hunger,40);assert.equal(s.businesses['north-civic-recovery'].inventory,0);assert.equal(s.businesses['north-civic-recovery'].cash,4);assert.equal(s.businesses['treasury:north-city'].cash,46);assert.equal(s.businesses['civic-recovery'].inventory,60);assert.equal(s.treasury.cash,100);assert.equal(s.regionalFreight.stocks['INDUSTRY-north-4'].grain,20);
});


test('a hungry farmer can cook a paid mixed meal from fractional produce without eating seed or inventing stock',()=>{
 const s={simulationAgeSeconds:12,treasury:{cash:100},businesses:{'treasury:north-city':{cash:50},'farm:north-city':{cash:20}},internationalEconomy:{stock:{rice:.48,vegetables:.52,seeds:46}}};
 const f={alive:true,x:NORTH_FARM.x,z:NORTH_FARM.z,hunger:100,thirst:80,internationalWork:{employerId:'farm:north-city'}};
 assert.equal(provisionDutyMeal(s,f,'north-city'),true);assert.equal(f.hunger,40);assert.deepEqual(s.internationalEconomy.stock,{rice:0,vegetables:0,seeds:46});
 assert.equal(s.businesses['treasury:north-city'].cash,46);assert.equal(s.businesses['farm:north-city'].cash,24);assert.equal(s.treasury.cash,100);
 f.hunger=100;assert.equal(provisionDutyMeal(s,f,'north-city'),false);assert.equal(f.hunger,100);
 s.internationalEconomy.stock={rice:.2,vegetables:.3,seeds:46};assert.equal(provisionDutyMeal(s,f,'north-city'),false);assert.equal(s.businesses['treasury:north-city'].cash,46);
});
