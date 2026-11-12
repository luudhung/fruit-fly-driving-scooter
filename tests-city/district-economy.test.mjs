import test from 'node:test';import assert from 'node:assert/strict';
import {districtAt,districtProfile,applyDistrictExposure,districtHousingUtility} from '../worker/district-economy.mjs';
test('four named districts have location based income and living costs without classifying residents by skill',()=>{
 assert.equal(districtAt({x:0,z:0}),'main');assert.equal(districtAt({x:700,z:0}),'europe');assert.equal(districtAt({x:-200,z:-830}),'north');assert.equal(districtAt({x:-700,z:0}),'west');
 const west=districtProfile('west'),main=districtProfile('main'),north=districtProfile('north');
 for(const key of ['wage','housing','property','food','living'])assert.ok(west[key]<north[key]&&north[key]<main[key]);assert.ok(north.amenities>=main.amenities*.95);
});
test('western exposure accumulates slowly, never retroactively or twice per tick, and improves after moving',()=>{
 const actor={alive:true,health:90,homeX:-700,homeZ:0,x:-700,z:0,indoors:true},s={simulationAgeSeconds:100000};applyDistrictExposure(actor,s);assert.equal(actor.health,90);
 for(let i=0;i<1440;i++){s.simulationAgeSeconds+=720;applyDistrictExposure(actor,s);}
 assert.ok(actor.environmentalAgePenalty>0&&actor.environmentalAgePenalty<.21);assert.equal(actor.alive,true);assert.ok(actor.health>89&&actor.health<90);const penalty=actor.environmentalAgePenalty,health=actor.health;
 applyDistrictExposure(actor,s);assert.equal(actor.health,health);assert.equal(actor.environmentalAgePenalty,penalty);
 Object.assign(actor,{homeX:-200,homeZ:-830,x:-200,z:-830});for(let i=0;i<1440;i++){s.simulationAgeSeconds+=720;applyDistrictExposure(actor,s);}assert.ok(actor.environmentalAgePenalty<penalty);
});
test('affluent health conscious residents can prefer a clean northern home while a tight budget values western affordability',()=>{
 const a={homeX:-700,homeZ:0,health:70,money:5000,savings:5000,traits:{risk:.1,ambition:.8,thrift:.3}};
 assert.ok(districtHousingUtility(a,{x:-200,z:-830})>0);
 const b={homeX:0,homeZ:0,health:95,money:30,savings:20,traits:{risk:.9,ambition:.1,thrift:.95}};
 assert.ok(districtHousingUtility(b,{x:-700,z:0},{x:-800,z:0})>0);
});
