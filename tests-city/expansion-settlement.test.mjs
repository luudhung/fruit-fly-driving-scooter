import test from 'node:test';
import assert from 'node:assert/strict';
import {settleExpansionResidents,expansionSettlementPlan} from '../worker/expansion-settlement.mjs';
import {RESIDENT_CAP,COMBINED_CAP} from '../worker/population-limits.mjs';
import {freshState,restoreState,getState,getNeuralAgents,settleExpansionResidents as settleEngineExpansion,liquidMoneySupply} from '../worker/civilization-engine.mjs';
import {BUILDINGS} from '../worker/city-map.mjs';

function fixture(){
 const state={simulationAgeSeconds:9000,nextFlyId:3,flies:[
  {id:'OLD-1',alive:true,brain:{id:'OLD-BRAIN-1',memory:{history:['old event']}},money:150,savings:450,householdId:'OLD-HH',housingUnitId:'OLD-APT',x:3,z:4},
  {id:'OLD-2',alive:false,brain:{id:'OLD-BRAIN-2'},money:99,savings:211,householdId:'DEAD-HH',housingUnitId:'OLD-APT',x:1,z:2},
 ],housing:{households:{'OLD-HH':{id:'OLD-HH',unitId:'OLD-APT',members:['OLD-1']}},
  apartmentBlocks:[{id:'OLD-APT',x:0,z:0,h:24,rent:24,occupants:['OLD-HH']},
   ...Array.from({length:7},(_,i)=>({id:`AIRPORT-APT-${i}`,x:-100-i*20,z:-800,h:24,rent:24,occupants:[]})),
   ...Array.from({length:6},(_,i)=>({id:`WEST-APT-${i}`,x:-600-i*20,z:0,h:24,rent:24,occupants:[]}))],
  houseLots:Array.from({length:16},(_,i)=>({id:`WEST-HOUSE-${i}`,x:-800-i*10,z:50,baseValue:9000,ownerHouseholdId:null}))},
  treasury:{cash:4000},bank:{reserves:9000},businesses:{},cityVisitors:{visitors:[]}};
 const events=[];let created=0;
 const hooks={
  createResident:()=>{
   const index=state.nextFlyId++,id=`NEW-${index}`,hh={id:`HH-${index}`,members:[id],unitId:'OLD-APT'};
   state.housing.households[hh.id]=hh;state.housing.apartmentBlocks[0].occupants.push(hh.id);created++;
   return {id,alive:true,brain:{id:`NEW-BRAIN-${index}`,memory:{history:[]}},householdId:hh.id,housingUnitId:'OLD-APT',money:100+index,savings:200+index,vehicle:null};
  },
  releaseHousingUnit:hh=>{
   for(const block of state.housing.apartmentBlocks)block.occupants=block.occupants.filter(id=>id!==hh.id);
   for(const house of state.housing.houseLots)if(house.ownerHouseholdId===hh.id)house.ownerHouseholdId=null;
  },
  liquidMoneySupply:()=>state.flies.reduce((n,f)=>n+f.money+f.savings,0)+state.treasury.cash+state.bank.reserves,
  remember:(f,type,data)=>f.brain.memory.history.push({type,...data}),
  emit:(type,text,data)=>events.push({type,...data}),
 };
 return {state,hooks,events,get created(){return created;}};
}

test('both districts receive 64 additional residents in reserved homes while every old record and balance stays intact',()=>{
 const t=fixture(),old=structuredClone(t.state.flies),oldHousehold=structuredClone(t.state.housing.households['OLD-HH']),before=t.hooks.liquidMoneySupply();
 assert.equal(settleExpansionResidents(t.state,t.hooks),128);assert.equal(t.created,128);
 assert.deepEqual(t.state.flies.slice(0,old.length),old);assert.deepEqual(t.state.housing.households['OLD-HH'],oldHousehold);
 assert.deepEqual(t.state.housing.apartmentBlocks[0].occupants,['OLD-HH']);
 for(const [district,prefix]of [['airport','AIRPORT-APT-'],['west','WEST-']]){
  const group=t.state.flies.filter(f=>f.homeDistrict===district);assert.equal(group.length,64);
  assert.ok(group.every(f=>f.housingUnitId.startsWith(prefix)&&f.indoors&&!f.traveling&&f.x===f.homeX&&f.z===f.homeZ));
  assert.equal(t.state.expansionSettlement[district].added,64);assert.equal(t.state.expansionSettlement[district].arrivalIds.length,64);
 }
 assert.equal(t.state.flies.filter(f=>f.homeDistrict==='west'&&f.housingType==='house').length,16);
 assert.ok(t.state.housing.apartmentBlocks.every(b=>b.occupants.length<=10));
 assert.equal(new Set(t.state.flies.map(f=>f.brain.id)).size,t.state.flies.length);
 assert.equal(t.state.expansionSettlement.externalCapital,t.hooks.liquidMoneySupply()-before);
 const once=structuredClone(t.state),balance=t.hooks.liquidMoneySupply();
 assert.equal(settleExpansionResidents(t.state,t.hooks),0);assert.deepEqual(t.state,once);assert.equal(t.hooks.liquidMoneySupply(),balance);
 assert.equal(t.events.filter(e=>e.type==='district_settlement').length,1);
});

test('insufficient homes or world admission capacity fail before creating or modifying any person',()=>{
 for(const mode of ['airport','west','residents','combined','unsafe']){
  const t=fixture();
  if(mode==='airport')t.state.housing.apartmentBlocks=t.state.housing.apartmentBlocks.filter(b=>b.id!=='AIRPORT-APT-6');
  if(mode==='west')t.state.housing.apartmentBlocks=t.state.housing.apartmentBlocks.filter(b=>!b.id.startsWith('WEST-APT-'));
  if(mode==='residents')t.state.flies=Array.from({length:RESIDENT_CAP-127},(_,i)=>({id:`OLD-${i}`,alive:true}));
  if(mode==='combined')t.state.cityVisitors.visitors=Array.from({length:COMBINED_CAP-128},()=>({alive:true}));
  if(mode==='unsafe')t.state.urbanWorld={buildings:{'AIRPORT-APT-6':{stage:'unsafe'}}};
  const before=structuredClone(t.state);
  assert.throws(()=>expansionSettlementPlan(t.state));assert.equal(t.created,0);assert.deepEqual(t.state,before);
 }
});

test('the real engine adds exactly 128 new district residents to an old checkpoint without redistributing or rebalancing old residents',()=>{
 const state=freshState(),arrivalIds=new Set(state.expansionSettlement.arrivalIds);
 const newHouseholds=new Set(state.flies.filter(f=>arrivalIds.has(f.id)).map(f=>f.householdId));
 state.flies=state.flies.filter(f=>!arrivalIds.has(f.id));
 for(const id of newHouseholds)delete state.housing.households[id];
 for(const block of state.housing.apartmentBlocks)block.occupants=block.occupants.filter(id=>!newHouseholds.has(id));
 for(const lot of state.housing.houseLots)if(newHouseholds.has(lot.ownerHouseholdId))lot.ownerHouseholdId=null;
 delete state.expansionSettlement;state.mapVersion=24;
 const before=state.flies.map(f=>[f.id,f.brain.id,f.money,f.savings,f.householdId,f.housingUnitId,f.alive]),count=state.flies.length,money=liquidMoneySupply();
 const deaths=state.deaths,births=state.births,restored=restoreState(structuredClone(state)),added=restored.flies.slice(count);
 assert.equal(added.length,128);assert.deepEqual(restored.flies.slice(0,count).map(f=>[f.id,f.brain.id,f.money,f.savings,f.householdId,f.housingUnitId,f.alive]),before);
 assert.equal(restored.deaths,deaths);assert.equal(restored.births,births);
 assert.equal(added.filter(f=>f.homeDistrict==='airport'&&f.housingUnitId.startsWith('AIRPORT-APT-')).length,64);
 assert.equal(added.filter(f=>f.homeDistrict==='west'&&f.housingUnitId.startsWith('WEST-')).length,64);
 assert.ok(added.every(f=>{const b=BUILDINGS.find(b=>b.id===f.housingUnitId);return b&&f.x===b.x&&f.z===b.z&&f.indoors&&!f.traveling;}));
 assert.ok(Math.abs(liquidMoneySupply()-money-restored.expansionSettlement.externalCapital)<1e-6);
 const census=getState({observer:true});assert.equal(census.districts.airport.settlersAdded,64);assert.equal(census.districts.west.settlersAdded,64);
 const ids=restored.flies.map(f=>f.id),balances=liquidMoneySupply(),again=restoreState(structuredClone(restored));
 assert.deepEqual(again.flies.map(f=>f.id),ids);assert.equal(settleEngineExpansion(),0);assert.equal(liquidMoneySupply(),balances);
});

test('the enlarged fresh population remains within each neural shard batch and the adaptive checkpoint write budget',()=>{
 const state=freshState(),agents=getNeuralAgents(),shards=Array(16).fill(0);
 assert.equal(state.flies.filter(f=>f.alive).length,728);assert.equal(agents.length,728);
 for(const agent of agents)shards[Number(agent.brain_id.replace(/\D/g,''))%16]++;
 assert.ok(Math.max(...shards)<=64);
 const intervalMs=Math.max(360000,Math.ceil(COMBINED_CAP*86400/60000)*1000);
 assert.ok(COMBINED_CAP*86400000/intervalMs<=60000);
 assert.equal(new Set(agents.map(a=>a.brain_id)).size,agents.length);
});
