import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,needsAndActivities,payAndFinance,productionAndRetail,liquidMoneySupply} from '../worker/civilization-engine.mjs';

test('equal game time produces equal basic needs and earned work minutes at different sampling cadences',()=>{
 const s=freshState(),base=s.flies.find(f=>f.ageYears>=18&&f.ageYears<60);
 const create=()=>({...structuredClone(base),hunger:10,thirst:10,energy:70,sleepDebt:10,caffeine:0,health:100,traveling:true,sleeping:false});
 const a=create(),b=create(),clock={day:1,hour:12,minute:0};
 for(let i=0;i<60;i++)needsAndActivities(a,clock,60);
 for(let i=0;i<30;i++)needsAndActivities(b,clock,120);
 for(const key of ['hunger','thirst','energy','sleepDebt'])assert.ok(Math.abs(a[key]-b[key])<1e-8,key);
 for(const f of[a,b])Object.assign(f,{traveling:false,jobId:'market',businessEmployeeOf:null,currentLocationId:'market',action:'working as a vendor',workMinutesToday:0});
 productionAndRetail(a,clock,60);productionAndRetail(a,clock,60);productionAndRetail(b,clock,120);
 assert.equal(a.workMinutesToday,2);assert.equal(b.workMinutesToday,2);
});

test('salary is paid once when a step crosses the shift end without landing inside its first two minutes',()=>{
 const s=freshState(),f=s.flies.find(f=>f.ageYears>=18&&f.ageYears<60);
 Object.assign(f,{jobId:'market',businessEmployeeOf:null,wage:10,preferredWorkStart:9,preferredWorkHours:8,workMinutesToday:180,lastPaidDay:-1,money:100,savings:0,ownsHome:true,debt:0});
 s.treasury.cash=100000;payAndFinance(f,{day:10,hour:16,minute:59});const supply=liquidMoneySupply(),salary=f.salaryLifetime;
 payAndFinance(f,{day:10,hour:17,minute:7});assert.ok(f.salaryLifetime>salary);assert.equal(f.workMinutesToday,0);assert.equal(f.lastPaidDay,10);
 const paid=f.salaryLifetime;payAndFinance(f,{day:10,hour:17,minute:8});assert.equal(f.salaryLifetime,paid);assert.ok(Math.abs(liquidMoneySupply()-supply)<1e-7);
});

test('household rent crosses midnight once even when the first sample is seven minutes late',()=>{
 const s=freshState(),f=s.flies.find(f=>f.ageYears>=18&&f.ageYears<60),hh=s.housing.households[f.householdId];
 Object.assign(f,{jobId:null,money:100,savings:0,debt:0,ownsHome:true,lastRentDay:10,traits:{...f.traits,thrift:0}});Object.assign(hh,{members:[f.id],monthlyHousingCost:300,lastRentDay:10});
 payAndFinance(f,{day:10,hour:23,minute:59});const supply=liquidMoneySupply();payAndFinance(f,{day:11,hour:0,minute:7});
 assert.equal(f.money,90);assert.equal(hh.lastRentDay,11);payAndFinance(f,{day:11,hour:0,minute:8});assert.equal(f.money,90);assert.ok(Math.abs(liquidMoneySupply()-supply)<1e-7);
});
