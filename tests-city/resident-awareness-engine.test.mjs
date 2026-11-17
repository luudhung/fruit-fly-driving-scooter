import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,restoreState,getRawState,getState,getNeuralAgents,tick,maintainHouseholds,completePregnancy,setNeuralSyncEnabled} from '../worker/civilization-engine.mjs';

setNeuralSyncEnabled(false);
test('real resident ticks populate bounded eyes and self knowledge, send visual senses to the neural bridge and survive a checkpoint',async()=>{
 const state=freshState(),resident=state.flies.find(f=>f.alive&&f.brain);
 resident.sleeping=false;resident.onPlane=resident.onTrain=false;
 await tick({gameSeconds:120,syncBrain:false,serialized:true,perceptionBudget:32});
 assert.ok(resident.vision);assert.ok(resident.selfModel);
 const selected=getState({observer:true,compactObserver:true,selectedId:resident.id}).flies.find(f=>f.id===resident.id);
 assert.equal(selected.awareness.algorithmOnly,true);assert.equal(selected.awareness.identity.id,resident.id);
 assert.equal(selected.awareness.identity.homeId,resident.homeId);
 assert.ok(selected.vision.observations.length<=8);assert.ok(selected.awareness.knownPlaces.length<=12);
 const input=getNeuralAgents().find(a=>a.brain_id===resident.brain.id);
 assert.ok(input.vision);assert.ok(input.vision.left>=0&&input.vision.left<=1);
 const before=structuredClone({vision:resident.vision,selfModel:resident.selfModel});
 const copy=JSON.parse(JSON.stringify(getRawState()));restoreState(copy);
 const restored=getRawState().flies.find(f=>f.id===resident.id);
 assert.deepEqual(restored.vision,before.vision);assert.deepEqual(restored.selfModel,before.selfModel);
 assert.ok(getRawState().flies.some(f=>f.id===resident.id&&f.brain.id===resident.brain.id));
});

test('an actual partner death records bereavement once without inventing a loss from an absent visual contact',()=>{
 const state=freshState(),a=state.flies[0],b=state.flies[1];
 a.alive=b.alive=true;a.partnerId=b.id;b.partnerId=a.id;
 a.affection=b.affection=75;
 const before=a.brain.memory.episodes.filter(e=>e.kind==='lost_partner').length;
 maintainHouseholds();assert.equal(a.partnerId,b.id);
 assert.equal(a.brain.memory.episodes.filter(e=>e.kind==='lost_partner').length,before);
 b.alive=false;b.causeOfDeath='old age';b.estateSettled=true;
 maintainHouseholds();maintainHouseholds();
 assert.equal(a.partnerId,null);
 assert.equal(a.brain.memory.episodes.filter(e=>e.kind==='lost_partner').length,before+1);
 assert.ok(a.selfModel.milestones.some(e=>e.kind==='lost_partner'&&e.otherId===b.id));
});

test('parents retain their actual child birth as a life milestone without inventing a newborn inner monologue',()=>{
 const state=freshState(),mother=state.flies.find(f=>f.sex==='F'),father=state.flies.find(f=>f.sex==='M');
 state.flies.findLast(f=>f!==mother&&f!==father).alive=false;
 mother.pregnancyBy=father.id;mother.pregnancyDueAt=-.1;
 const prior=new Set(state.flies.map(f=>f.id));completePregnancy(mother);
 const child=state.flies.find(f=>!prior.has(f.id));assert.ok(child);
 for(const parent of [mother,father]){
  assert.ok(parent.brain.memory.episodes.some(e=>e.kind==='child_born'&&e.otherId===child.id));
  assert.ok(parent.selfModel.milestones.some(e=>e.kind==='child_born'&&e.otherId===child.id));
 }
 assert.ok(!child.brain.memory.episodes.some(e=>e.kind==='child_born'||e.kind==='first_person_thought'));
});
