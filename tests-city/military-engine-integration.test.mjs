import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,restoreState,getState,getNeuralAgents,liquidMoneySupply} from '../worker/civilization-engine.mjs';
import {blocked} from '../worker/city-map.mjs';

test('the actual thousand-resident engine has fifty real soldiers with fixed homes, stable ranks, and restart-safe military assets',()=>{
 const s=freshState(),view=getState({observer:true}),army=view.publicServices.army.members,authorized=new Set(s.thousandSettlement.militaryCadreIds);assert.equal(s.flies.filter(f=>f.alive).length,1000);assert.equal(getNeuralAgents().length,1000);assert.equal(army.length,50);assert.ok(army.every(f=>authorized.has(f.id)));assert.ok(army.every(f=>!blocked(f)&&!f.indoors));assert.equal(army.filter(f=>f.rank.id==='captain').length,1);assert.equal(view.publicServices.ships.length,2);assert.equal(view.publicServices.ammunition,1600);
 const records=s.flies.map(f=>[f.id,f.brain.id,f.money,f.savings,f.householdId,f.housingUnitId,f.homeX,f.homeZ]),money=liquidMoneySupply(),commander=view.publicServices.military.commanderId,ammo=view.publicServices.ammunition,restored=restoreState(structuredClone(s));assert.deepEqual(restored.flies.map(f=>[f.id,f.brain.id,f.money,f.savings,f.householdId,f.housingUnitId,f.homeX,f.homeZ]),records);assert.ok(Math.abs(liquidMoneySupply()-money)<1e-6);assert.equal(getState().publicServices.army.count,50);assert.equal(getState().publicServices.military.commanderId,commander);assert.equal(getState().publicServices.ammunition,ammo);assert.equal(restored.thousandSettlement.added,272);
});
