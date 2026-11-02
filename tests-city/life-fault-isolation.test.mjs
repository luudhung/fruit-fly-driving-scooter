import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,tick,setNeuralSyncEnabled} from '../worker/civilization-engine.mjs';

test('one malformed resident decision cannot stop later residents or the rest of the world tick',async()=>{
 setNeuralSyncEnabled(false);const s=freshState(),[broken,later]=s.flies.filter(f=>f.ageYears>=18&&f.ageYears<60).slice(0,2);
 for(const f of[broken,later])Object.assign(f,{traveling:false,indoors:true,currentLocationId:f.homeId,action:'resting at home',actionUntil:0,energy:90,health:95,hunger:10,thirst:10,sleeping:false,recoveringEnergy:false,privateFlight:null,sportsSession:null,civicDuty:null,socialTask:null,urbanTask:null,cityService:null});
 Object.defineProperty(broken.brain,'decisionCount',{configurable:true,get(){throw Error('corrupt resident decision fixture');},set(){}});
 const before=later.hunger,clock=s.simulationAgeSeconds,logs=[],original=console.error;console.error=(...args)=>logs.push(args);
 try{await tick({serialized:true,gameSeconds:120,syncBrain:false});}finally{console.error=original;Object.defineProperty(broken.brain,'decisionCount',{configurable:true,writable:true,value:0});}
 assert.equal(s.simulationAgeSeconds,clock+120);assert.ok(later.hunger>before,'a later resident must still receive their life step');
 assert.ok(s.simulationFaults?.recent.some(f=>f.flyId===broken.id&&f.source==='resident'));assert.ok(logs.some(l=>l[0].includes('isolated')));
 assert.ok(s.roadLife&&s.economy,'world services remain intact');
});
