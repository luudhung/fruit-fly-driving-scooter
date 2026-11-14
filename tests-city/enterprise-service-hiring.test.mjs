import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,simulateEnterprises,startupReadiness} from '../worker/civilization-engine.mjs';

test('ordinary businesses can hire a civilian without silently removing low-income soldiers or essential staff from their jobs',()=>{
 const s=freshState(),army=s.flies.filter(f=>f.publicServiceRole==='army'),owner=s.flies.find(f=>!f.publicServiceRole&&f.ageYears>=21),civilian=s.flies.find(f=>f!==owner&&!f.publicServiceRole&&f.ageYears>=21);
 const protectedStaff=[...army,{...structuredClone(civilian),id:'TEST-GRID-STAFF',jobId:'power',publicServiceRole:null},{...structuredClone(civilian),id:'TEST-CLINIC-STAFF',jobId:null,facilityEmployment:{buildingId:'clinic'}}];
 for(const f of protectedStaff)Object.assign(f,{socialClass:'low income',businessId:null,businessEmployeeOf:null});
 Object.assign(civilian,{jobId:null,businessId:null,businessEmployeeOf:null,facilityEmployment:null,socialClass:'low income'});
 Object.assign(owner,{businessId:'TEST-RETAIL',jobId:null,stress:0,traits:{...owner.traits,ambition:1,thrift:1,resilience:1}});
 s.flies=[owner,civilian,...protectedStaff];const before=protectedStaff.map(f=>[f.id,f.jobId,f.publicServiceRole,f.brain.id]);
 s.enterprises={'TEST-RETAIL':{id:'TEST-RETAIL',name:'Test retailer',ownerId:owner.id,sector:'retail',locationId:'market',cash:100000,assetValue:1000,loanBalance:0,employees:[],revenueLifetime:0,expensesLifetime:0,profitToday:0,margin:.2,reputation:.5,status:'operating',badDays:0}};
 for(let h=0;h<96&&!civilian.businessEmployeeOf;h++)simulateEnterprises({day:1+Math.floor(h/24),hour:h%24});
 assert.equal(civilian.businessEmployeeOf,'TEST-RETAIL');
 for(let h=96;h<120;h++)simulateEnterprises({day:1+Math.floor(h/24),hour:h%24});
 assert.deepEqual(protectedStaff.map(f=>[f.id,f.jobId,f.publicServiceRole,f.brain.id]),before);assert.ok(protectedStaff.every(f=>!f.businessEmployeeOf));
 for(const f of army)assert.equal(startupReadiness(f),0);
});
