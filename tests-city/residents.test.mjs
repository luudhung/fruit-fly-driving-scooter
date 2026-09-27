import test from 'node:test';
import assert from 'node:assert/strict';
import {sortResidents} from '../src/resident-directory.ts';
test('directory excludes the dead, ranks cash plus savings and sorts IDs numerically',()=>{
 const f=(id,money,ageYears,alive=true,savings=0)=>({id,name:id,money,savings,ageYears,alive,action:'resting'});
 const flies=[f('FLY-10',100,40),f('FLY-2',20,20,true,200),f('FLY-1',999,90,false)];
 assert.deepEqual(sortResidents(flies,'id').map(f=>f.id),['FLY-2','FLY-10']);
 assert.equal(sortResidents(flies,'money')[0].id,'FLY-2');
 assert.equal(sortResidents(flies,'age-desc')[0].id,'FLY-10');
 assert.equal(sortResidents(flies,'age-asc')[0].id,'FLY-2');
 assert.deepEqual(sortResidents([f('FLY-1',0,30,false)],'id'),[]);
 assert.equal(flies.length,3);
});
