import test from 'node:test';import assert from 'node:assert/strict';
import {selectResidentView} from '../src/airport-arrival-view.ts';
import {SceneViewBudget} from '../src/view-budget.ts';
test('nearby arrivals remain visible in a crowded airport without raising the resident mesh budget',()=>{
 const residents=Array.from({length:200},(_,i)=>({id:'resident-'+i,x:0,z:0,kind:'resident'}));
 const arrivals=Array.from({length:10},(_,i)=>({id:'arrival-'+i,x:30,z:0,kind:'visitor',visitorPhase:'airport-arrival'}));
 const hidden={id:'in-plane',x:30,z:0,kind:'visitor',visitorPhase:'inbound',onPlane:true};
 const selected=selectResidentView([...residents,...arrivals,hidden],new SceneViewBudget(),f=>'onPlane' in f&&f.onPlane?null:f,new Set(residents.map(f=>f.id)),180);
 assert.equal(selected.length,180);assert.ok(arrivals.every(a=>selected.some(f=>f.id===a.id)));assert.ok(!selected.some(f=>f.id===hidden.id));
});
