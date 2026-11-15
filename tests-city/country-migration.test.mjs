import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {nationalResidencePlan,applyNationalResidences,ownsCountryHome,residenceCountry} from '../worker/country-migration.mjs';
function productionFixture(){
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/country-migration-production.json',import.meta.url),'utf8'));
 const households=Object.fromEntries(fixture.households.map(([id,unitId,housingType,propertyValue])=>[id,{id,unitId,housingType,propertyValue,members:[]}])),blocks=fixture.blocks.map(([id,x,z,h,luxury,occupants])=>({id,x,z,h,luxury,occupants,rent:20}));
 const state={simulationAgeSeconds:100,flies:fixture.people.map(([id,householdId,ownsHome,publicServiceRole,homeX,homeZ],i)=>{households[householdId].members.push(id);return {id,alive:true,householdId,housingUnitId:households[householdId].unitId,ownsHome,publicServiceRole,homeX,homeZ,brain:{id:`PRESERVED-BRAIN-${id}`},money:100+i,savings:200+i,x:i,y:1.1,z:-i};}),housing:{households,apartmentBlocks:blocks,houseLots:fixture.lots.map(([id,x,z,ownerHouseholdId])=>({id,x,z,ownerHouseholdId}))},urbanWorld:{buildings:Object.fromEntries(fixture.buildingStages.map(([id,stage])=>[id,{id,stage}]))}};
 return {state,fixture};
}
const checksum=plan=>createHash('sha256').update(JSON.stringify(plan)).digest('hex');
test('production census keeps the complete original ordered 101-household plan, 15 country changes and district tie policy',()=>{
 const {state,fixture}=productionFixture(),before=structuredClone(state),plan=nationalResidencePlan(state);
 assert.deepEqual(plan.initialDistrictCounts,{main:182,europe:328,west:247});assert.deepEqual(plan.districtCounts,{main:270,europe:250,west:230});assert.equal(plan.minDistrictGap,20);assert.equal(plan.moves.length,101);assert.equal(plan.moves.filter(m=>m.fromCountryId!==m.toCountryId).length,15);assert.equal(checksum(plan),fixture.expectedPlanSha256,'every household, member order, destination unit and ranking tie matches the original exhaustive planner');assert.deepEqual(state,before,'planning must be read-only');
 for(const move of plan.moves)assert.deepEqual(move.memberIds,state.flies.filter(f=>f.householdId===move.householdId).map(f=>f.id));
});
test('migration caches occupied household counts once per apartment rather than rescanning them for each target',()=>{
 const {state}=productionFixture();let reads=0;for(const block of state.housing.apartmentBlocks){const occupants=block.occupants;Object.defineProperty(block,'occupants',{get(){reads++;return occupants;}});}
 const plan=nationalResidencePlan(state);assert.equal(plan.moves.length,101);assert.ok(reads<=state.housing.apartmentBlocks.length,`expected at most one occupancy read per block, observed ${reads}`);
});
test('applying the optimized household plan preserves brains, wallets, physical poses and all owned titles exactly',()=>{
 const {state}=productionFixture(),identities=state.flies.map(f=>[f.id,f.brain,f.money,f.savings,f.ownsHome,f.x,f.y,f.z]),titles=structuredClone(state.housing.houseLots),plan=applyNationalResidences(state);
 assert.equal(plan.moves.length,101);assert.deepEqual(state.flies.map(f=>[f.id,f.brain,f.money,f.savings,f.ownsHome,f.x,f.y,f.z]),identities);assert.deepEqual(state.housing.houseLots,titles);assert.equal(state.flies.filter(f=>residenceCountry(state,f)==='north-city').length,250);assert.equal(state.flies.filter(f=>residenceCountry(state,f)==='hansdrex').length,750);const saved=structuredClone(state);applyNationalResidences(state);assert.deepEqual(state,saved);
});
test('ordinary apartment deeds qualify their actual household owner and spouse without a luxury purchase timestamp',()=>{
 const owner={id:'OWNER',householdId:'HH',housingUnitId:'NORTH-ORDINARY-APT',ownsHome:true,homeEquity:4000},spouse={id:'SPOUSE',householdId:'HH',housingUnitId:'NORTH-ORDINARY-APT',ownsHome:false,homeEquity:0},hh={id:'HH',unitId:'NORTH-ORDINARY-APT',housingType:'apartment',propertyValue:4000,members:['OWNER','SPOUSE']},state={flies:[owner,spouse],housing:{households:{HH:hh},houseLots:[],apartmentBlocks:[{id:hh.unitId,x:100,z:-900}]}};
 for(const resident of [owner,spouse])assert.deepEqual(ownsCountryHome(state,resident,'north-city'),{unitId:hh.unitId,householdId:hh.id,title:'purchased apartment'});
 assert.equal(hh.luxuryPurchaseAt,undefined);owner.ownsHome=false;assert.ok(ownsCountryHome(state,spouse,'north-city'),'recorded primary-home equity also preserves a legal title');owner.homeEquity=0;assert.equal(ownsCountryHome(state,owner,'north-city'),null,'propertyValue alone does not manufacture ownership');
 owner.ownsHome=true;owner.housingUnitId='SECONDARY-APT';assert.equal(ownsCountryHome(state,spouse,'north-city'),null,'an owner record in another unit is not a primary title');owner.housingUnitId=hh.unitId;assert.equal(ownsCountryHome(state,{id:'GUEST',householdId:hh.id,housingUnitId:hh.unitId},'north-city'),null,'a guest is not a durable household member');
 hh.unitId='MAIN-RENTAL';hh.propertyValue=0;state.housing.apartmentBlocks.push({id:hh.unitId,x:0,z:0});state.housing.houseLots.push({id:'NORTH-SECONDARY-HOUSE',x:100,z:-900,ownerHouseholdId:hh.id});owner.housingUnitId='NORTH-SECONDARY-HOUSE';assert.equal(ownsCountryHome(state,owner,'north-city'),null,'a forged home field or secondary house does not replace the actual primary home');
});
