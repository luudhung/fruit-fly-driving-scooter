import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,restoreState,residentRelationships,startJourney,tickFly,getState,liquidMoneySupply,gameClock,maybeRoamInsidePark} from '../worker/civilization-engine.mjs';

test('household care survives restore, runs through real engine hooks and leaves cash and medical state intact',()=>{
 let s=freshState();s.simulationAgeSeconds=9*3600;s.weather.precipitation=0;
 let [a,p]=s.flies.filter(f=>f.ageYears>=20&&f.ageYears<60).slice(0,2);
 const home={homeId:a.homeId,homeX:a.homeX,homeZ:a.homeZ,housingUnitId:a.housingUnitId,householdId:a.householdId};
 for(const f of[a,p])Object.assign(f,home,{x:home.homeX,z:home.homeZ,y:1.1,currentLocationId:home.homeId,traveling:false,indoors:true,sleeping:false,jobId:null,businessEmployeeOf:null,health:90,energy:90,hunger:20,thirst:20,stress:70,action:'resting at home',actionUntil:0});
 s.housing.households[a.householdId].members=[a.id,p.id];p.health=55;p.illness='fatigue';
 const choices=[];residentRelationships.addChoices(a,gameClock(),(id,action,utility)=>choices.push({id,action,utility}));
 const care=choices.find(c=>c.action==='providing household care');assert.ok(care);startJourney(a,care);tickFly(a,gameClock());assert.ok(a.socialTask);
 const cash=liquidMoneySupply(),brain=a.brain.id,ids=[a.id,p.id],health=p.health;
 s=restoreState(structuredClone(s));[a,p]=ids.map(id=>s.flies.find(f=>f.id===id));assert.equal(a.brain.id,brain);assert.ok(a.socialTask);
 for(let i=0;i<31&&a.socialTask;i++){s.simulationAgeSeconds+=60;tickFly(a,gameClock());}
 assert.equal(s.residentRelationships.completedCare,1);assert.equal(a.socialProfile.careMinutes,30);assert.equal(p.socialProfile.receivedCareMinutes,30);
 assert.equal(p.health,health);assert.equal(p.illness,'fatigue');assert.equal(liquidMoneySupply(),cash);
 const view=getState({observer:true,selectedId:a.id});const record=view.flies.find(f=>f.id===a.id);assert.equal(record.relationships.profile.completedCare,1);
});

test('park roaming cannot overwrite an accepted social appointment',()=>{
 const s=freshState(),f=s.flies[0];Object.assign(f,{alive:true,traveling:false,currentLocationId:'park',x:15,z:-48,socialTask:{kind:'visit'},lastParkRoamAt:-10000});
 assert.equal(maybeRoamInsidePark(f),false);assert.equal(f.traveling,false);
});
