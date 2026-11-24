import test from 'node:test';
import assert from 'node:assert/strict';
import {constructionSchedule,constructionWorkStep,GAME_DAY_SECONDS,CONSTRUCTION_HOURLY_WAGE} from '../worker/construction-schedule.mjs';

const house={w:10,d:12,h:6};

test('a small house requires two full game days of structural work even with excess workers',()=>{
 const schedule=constructionSchedule(house,{kind:'rebuild'});
 assert.equal(schedule.structureSeconds,2*GAME_DAY_SECONDS);
 const first=constructionWorkStep(schedule,{onsiteCount:100,dt:2*GAME_DAY_SECONDS-1});
 assert.ok(first.progress<1);
 const finished=constructionWorkStep(schedule,{progress:first.progress,onsiteCount:100,dt:1});
 assert.equal(finished.progress,1);
 assert.equal(first.activeWorkers,schedule.targetCrew);
});

test('structural time grows with height and footprint up to the ten-day cap',()=>{
 const base=constructionSchedule(house);
 const tall=constructionSchedule({...house,h:12});
 const taller=constructionSchedule({...house,h:24});
 const wide=constructionSchedule({...house,w:20});
 const wider=constructionSchedule({...house,w:40});
 assert.ok(base.structureSeconds<tall.structureSeconds&&tall.structureSeconds<taller.structureSeconds);
 assert.ok(base.structureSeconds<wide.structureSeconds&&wide.structureSeconds<wider.structureSeconds);
 const tower=constructionSchedule({w:100,d:100,h:300});
 const largerTower=constructionSchedule({w:120,d:100,h:400});
 assert.equal(tower.targetCrew,25);assert.equal(largerTower.targetCrew,25);
 assert.equal(tower.structureSeconds,10*GAME_DAY_SECONDS);assert.equal(largerTower.structureSeconds,10*GAME_DAY_SECONDS);
});

test('reconstruction schedules retain original dimensions and height after collapse',()=>{
 const original=constructionSchedule(house,{kind:'rebuild'});
 const burnt=constructionSchedule({w:1,d:1,h:0,originalBlueprint:{...house}},{kind:'rebuild'});
 assert.deepEqual(burnt,original);
 assert.ok(constructionSchedule(house,{targetHeight:18}).structureSeconds>original.structureSeconds);
});

test('no labor, no elapsed work, or no wages cannot reconstruct a building',()=>{
 const schedule=constructionSchedule(house);
 for(const options of [{onsiteCount:0,dt:GAME_DAY_SECONDS},{onsiteCount:3,dt:0},{onsiteCount:3,dt:GAME_DAY_SECONDS,availableWages:0}]){
  const step=constructionWorkStep(schedule,{progress:.25,...options});
  assert.equal(step.progress,.25);assert.equal(step.wages,0);assert.equal(step.workerSeconds,0);
 }
});

test('a smaller crew takes longer and consumes only its actual paid labor',()=>{
 const schedule=constructionSchedule(house);
 const first=constructionWorkStep(schedule,{onsiteCount:1,dt:schedule.structureSeconds});
 assert.ok(first.progress<1);
 assert.equal(first.wages,schedule.structureSeconds/3600*CONSTRUCTION_HOURLY_WAGE);
 const rest=constructionWorkStep(schedule,{progress:first.progress,onsiteCount:1,dt:schedule.structureSeconds*(schedule.targetCrew-1)});
 assert.equal(rest.progress,1);
 assert.ok(Math.abs(first.wages+rest.wages-schedule.workerSeconds/3600*CONSTRUCTION_HOURLY_WAGE)<1e-8);
});

test('budget covers full-price materials and all planned wages for a two-day rebuild',()=>{
 const schedule=constructionSchedule(house,{kind:'rebuild',materialsRequired:54,roadArea:120,roadLength:20});
 const totalWages=(schedule.workerSeconds+18000+7200)/3600*CONSTRUCTION_HOURLY_WAGE;
 assert.equal(schedule.materialCost,108);
 assert.ok(schedule.minimumBudget>=108+totalWages);
 assert.ok(schedule.minimumBudget>55,'legacy short-project budgets must be topped up from the national treasury');
});

test('partial funding and final ticks charge only work actually performed',()=>{
 const schedule=constructionSchedule(house);
 const partial=constructionWorkStep(schedule,{onsiteCount:25,dt:GAME_DAY_SECONDS,availableWages:1.5});
 assert.equal(partial.wages,1.5);assert.equal(partial.workerSeconds,1800);
 const final=constructionWorkStep(schedule,{progress:.99,onsiteCount:25,dt:100*GAME_DAY_SECONDS});
 assert.equal(final.progress,1);
 assert.ok(Math.abs(final.workerSeconds-schedule.workerSeconds*.01)<1e-7);
 assert.equal(constructionWorkStep(schedule,{progress:1,onsiteCount:25,dt:100}).wages,0);
});

test('a funded, working single-person crew finishes even a large tower within ten productive days',()=>{const schedule=constructionSchedule({w:100,d:100,h:300});assert.equal(constructionWorkStep(schedule,{onsiteCount:1,dt:10*GAME_DAY_SECONDS-1}).progress<1,true);assert.equal(constructionWorkStep(schedule,{onsiteCount:1,dt:10*GAME_DAY_SECONDS}).progress,1);});
