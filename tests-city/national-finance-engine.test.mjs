import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,restoreState,payBirthGrant,payAndFinance,needsAndActivities,simulateEnterprises,liquidMoneySupply,countries} from '../worker/civilization-engine.mjs';
import {countryForHome,NORTH_FARM} from '../worker/country-map.mjs';
import {LOCATIONS} from '../worker/city-map.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const country=(s,f)=>{const h=s.housing.households[f.householdId];return countryForHome(h.unitId,{x:h.homeX,z:h.homeZ});};
function resident(s,nation){return s.flies.find(f=>f.alive&&f.ageYears>=21&&country(s,f)===nation);}
function northAccount(s){return s.businesses['treasury:north-city']||=( {cash:10000,inventory:0,sector:'national-treasury'});}
function at(f,id,x,z){Object.assign(f,{currentLocationId:id,x,z,traveling:false,indoors:true,hunger:90,thirst:10,health:90,energy:90,stress:5,action:'resting indoors'});}
function payroll(f){Object.assign(f,{jobId:'office',businessEmployeeOf:null,publicServicePayrollManaged:false,internationalWork:null,internationalFreightDuty:null,preferredWorkStart:8,preferredWorkHours:8,workMinutesToday:480,lastPaidDay:0,financeClockSeconds:16*3600-1,wage:5});}

test('actual newborn grants follow the family home, conserve budgets and remain once-only after restore',()=>{
 let s=freshState();const north=resident(s,'north-city'),hans=resident(s,'hansdrex');assert.ok(north&&hans);
 northAccount(s).cash=10000;s.treasury.cash=10000;at(north,'market',0,0);
 const money=liquidMoneySupply(),wallet=north.money,treasury=s.treasury.cash;
 assert.equal(payBirthGrant({id:'NATIONAL-NEWBORN-NORTH'},north),true);close(north.money,wallet+1600);close(northAccount(s).cash,8400);assert.equal(s.treasury.cash,treasury);close(liquidMoneySupply(),money);
 s=restoreState(structuredClone(s));const parent=s.flies.find(f=>f.id===north.id);const after=liquidMoneySupply();assert.equal(payBirthGrant({id:'NATIONAL-NEWBORN-NORTH'},parent),false);close(liquidMoneySupply(),after);
 const local=s.flies.find(f=>f.id===hans.id),cash=local.money;assert.equal(payBirthGrant({id:'NATIONAL-NEWBORN-HANS'},local),true);close(local.money,cash+1000);
 northAccount(s).cash=1599;const printed=s.centralBank.moneyPrintedLifetime;assert.equal(payBirthGrant({id:'UNFUNDED-NORTH-BIRTH'},parent),false);assert.equal(northAccount(s).cash,1599);assert.equal(s.centralBank.moneyPrintedLifetime,printed);assert.equal(parent.nationalBenefits['birth:UNFUNDED-NORTH-BIRTH'],undefined);
});

test('cross-border public work is paid and taxed at the workplace, including a real partial-pay budget',()=>{
 const s=freshState(),f=resident(s,'north-city');assert.ok(f);payroll(f);s.treasury.cash=5;const north=northAccount(s).cash,wallet=f.money,total=liquidMoneySupply(),tax=Number(s.treasury.taxRevenue||0);
 payAndFinance(f,{day:1,hour:16,minute:0});close(f.money,wallet+4.65);close(s.treasury.cash,.35);close(s.treasury.taxRevenue,tax+.35);assert.equal(northAccount(s).cash,north);assert.ok(f.wageArrears>30);close(liquidMoneySupply(),total);
 const once=f.money;payAndFinance(f,{day:1,hour:16,minute:0});assert.equal(f.money,once);
});

test('a family visiting Hansdrex pays rent once to its North home country',()=>{
 const s=freshState(),f=resident(s,'north-city'),hh=s.housing.households[f.householdId];assert.ok(f);at(f,'market',0,0);f.jobId=null;f.creditScore=0;f.ownsHome=false;f.financeClockSeconds=86399;f.lastRentDay=0;hh.lastRentDay=0;
 const account=northAccount(s),cash=account.cash,hans=s.treasury.cash,total=liquidMoneySupply(),rent=hh.monthlyHousingCost/30;
 payAndFinance(f,{day:2,hour:0,minute:0});close(account.cash,cash+rent);assert.equal(s.treasury.cash,hans);close(liquidMoneySupply(),total);
 for(const id of hh.members){const member=s.flies.find(f=>f.id===id);if(member){member.financeClockSeconds=86399;payAndFinance(member,{day:2,hour:0,minute:0});}}
 close(account.cash,cash+rent);
});

test('actual meals consume the inherited pantry finitely and cannot reset empty market inventories',()=>{
 const s=freshState(),f=resident(s,'hansdrex');for(const id of ['market','grocery','bakery','restaurant','night-market','riverside-market'])s.businesses[id].inventory=0;s.foodReserve=2;s.treasury.cash=10000;at(f,'market',0,0);const total=liquidMoneySupply();
 needsAndActivities(f,{day:1,hour:12,minute:0},0);assert.equal(f.hunger,30);assert.equal(s.foodReserve,0);assert.equal(s.businesses.market.inventory,1);
 f.hunger=90;s.simulationAgeSeconds++;needsAndActivities(f,{day:1,hour:12,minute:0},0);assert.equal(f.hunger,30);assert.equal(s.businesses.market.inventory,0);
 f.hunger=90;s.simulationAgeSeconds++;needsAndActivities(f,{day:1,hour:12,minute:0},0);assert.equal(f.hunger,90);assert.equal(s.businesses.market.inventory,0);assert.equal(s.foodReserve,0);close(liquidMoneySupply(),total);
});

test('North meals require real stock and funding, allow full-price cash purchases, and never print money',()=>{
 const s=freshState(),f=resident(s,'north-city'),account=northAccount(s);account.cash=0;s.businesses['north-market']||={cash:0,inventory:0};const vendor=s.businesses['north-market'];vendor.inventory=2;vendor.cash=0;f.money=10;at(f,'north-market',110,-730);const printed=s.centralBank.moneyPrintedLifetime,total=liquidMoneySupply(),reserve=s.foodReserve;
 needsAndActivities(f,{day:1,hour:12,minute:0},0);assert.equal(f.hunger,30);assert.equal(f.money,6);assert.equal(vendor.cash,4);assert.equal(vendor.inventory,1);assert.equal(account.cash,0);close(liquidMoneySupply(),total);
 f.money=0;f.hunger=90;needsAndActivities(f,{day:1,hour:12,minute:0},0);assert.equal(f.hunger,90);assert.equal(vendor.inventory,1);assert.equal(s.foodReserve,reserve);assert.equal(s.centralBank.moneyPrintedLifetime,printed);
});

test('foreign settlement support requires arrival at the durable home and a funded national budget',()=>{
 const s=freshState(),f=resident(s,'north-city'),account=northAccount(s);f.jobId=null;f.citizenshipCountryId='hansdrex';f.countryPresence={countryId:'north-city',entryId:'PAID-TEST-ENTRY'};f.financeClockSeconds=12*3600;account.cash=299;at(f,f.homeId,f.homeX,f.homeZ);const wallet=f.money;
 payAndFinance(f,{day:1,hour:12,minute:0});assert.equal(f.money,wallet);account.cash=300;f.traveling=true;payAndFinance(f,{day:1,hour:12,minute:0});assert.equal(f.money,wallet);f.traveling=false;const total=liquidMoneySupply();payAndFinance(f,{day:1,hour:12,minute:0});assert.equal(f.money,wallet+300);assert.equal(account.cash,0);close(liquidMoneySupply(),total);payAndFinance(f,{day:1,hour:12,minute:0});assert.equal(f.money,wallet+300);
});

test('a real first-home purchase pays North title proceeds and its larger housing grant from finite funds',()=>{
 const s=freshState(),f=resident(s,'north-city'),hh=s.housing.households[f.householdId],account=northAccount(s);
 const lot={id:'NORTH-FINANCE-PURCHASE-LOT',x:-250,z:-800,baseValue:10000,ownerHouseholdId:null};s.housing.houseLots=[lot];
 Object.assign(f,{jobId:null,ageYears:30,ownsHome:false,homeDistrict:'north',creditScore:850,money:5000,savings:5000,debt:0,bankLoan:0,financeClockSeconds:86399,lastRentDay:0});f.traits.ambition=1;f.traits.thrift=1;f.brain.rngState=1972;hh.lastRentDay=2;account.cash=2000;const total=liquidMoneySupply(),hans=s.treasury.cash;
 payAndFinance(f,{day:2,hour:0,minute:0});assert.equal(f.ownsHome,true);assert.equal(hh.unitId,lot.id);assert.equal(lot.ownerHouseholdId,hh.id);assert.equal(f.nationalBenefits[`housing:${hh.id}`].amount,900);close(account.cash,2000+10000-900);assert.equal(s.treasury.cash,hans);close(liquidMoneySupply(),total);
});

test('real North enterprise payroll and operating charges stay in its workplace treasury',()=>{
 const s=freshState(),owner=resident(s,'hansdrex'),employee=resident(s,'north-city'),account=northAccount(s);s.enterprises={};s.economy.lastEnterpriseHour=-1;at(owner,'north-market',110,-730);at(employee,'north-market',110,-730);employee.action='working as market assistant';Object.assign(employee,{wage:5,preferredWorkStart:6,preferredWorkHours:12});const business={id:'NORTH-FINANCE-TEST',name:'North services office',ownerId:owner.id,status:'operating',locationId:'north-market',sector:'services',employees:[employee.id],cash:100,margin:.5,assetValue:10000,loanBalance:0,revenueLifetime:0,expensesLifetime:0,reputation:.5,badDays:0};
 owner.traveling=true;s.enterprises[business.id]=business;const cash=account.cash,hans=s.treasury.cash,wallet=employee.money,tax=Number(account.taxRevenue||0);simulateEnterprises({day:1,hour:12,minute:0});assert.ok(employee.money>wallet);assert.ok(account.cash>cash);assert.ok(account.taxRevenue>tax);assert.equal(s.treasury.cash,hans);
});

test('paid physical North rice and vegetable arrivals feed the actual engine meals only after delivery',()=>{
 const s=freshState(),service=countries;
 const eater=resident(s,'hansdrex'),farmer=s.flies.find(f=>f!==eater&&f.alive&&f.ageYears>=23&&f.ageYears<60&&!f.publicServiceRole&&!f.facilityEmployment&&!f.businessId&&!f.businessEmployeeOf);assert.ok(farmer&&eater);
 Object.assign(farmer,{jobId:null,internationalWork:null,publicServiceDuty:null,citizenshipCountryId:'north-city',countryPresence:{countryId:'north-city',entryId:'FARM-TEST'},hunger:0});at(farmer,'north-farm',NORTH_FARM.gate.x,NORTH_FARM.gate.z);farmer.hunger=0;farmer.action='applying for agricultural work';assert.equal(service.economy.applyJob(farmer),true);
 const d=s.internationalEconomy;d.nextDecisionAt=Infinity;d.stock.rice=2;d.stock.vegetables=2;s.businesses.market.inventory=0;s.foodReserve=0;
 at(eater,'market',0,0);needsAndActivities(eater,{day:1,hour:8,minute:0},0);assert.equal(eater.hunger,90);
 const before=liquidMoneySupply();for(const product of ['rice','vegetables']){
  const field=LOCATIONS.find(l=>l.id===farmer.internationalWork.locationId);at(farmer,field.id,field.x,field.z);farmer.indoors=false;farmer.hunger=0;farmer.action='working at the North farm';farmer.countryPresence={countryId:'north-city',entryId:`FARM-${product}`};
  const inventory=s.businesses.market.inventory,order=service.economy.requestShipment({sellerId:'farm:north-city',buyerId:'market',sourceLocationId:'north-farm',destinationId:'market',product,quantity:2,unitPrice:2.5});assert.ok(order);assert.equal(s.businesses.market.inventory,inventory);assert.equal(d.stock[product],0);
  for(let i=0;i<1800&&!order.paid;i++){s.simulationAgeSeconds+=120;service.economy.tick(120,{day:1,hour:8,minute:0});service.economy.handleResident(farmer,{day:1,hour:8,minute:0});}
  assert.equal(order.phase,'complete',JSON.stringify({order,trucks:d.trucks,farmer:{id:farmer.id,action:farmer.action,onTrain:farmer.onTrain,onPlane:farmer.onPlane,privateFlight:farmer.privateFlight,airTrip:farmer.airTrip,role:farmer.publicServiceRole,facility:farmer.facilityEmployment,business:farmer.businessId,employee:farmer.businessEmployeeOf,fire:farmer.fireEngineDuty,civic:farmer.civicDuty,social:farmer.socialTask,arrested:farmer.arrested,x:farmer.x,z:farmer.z}}));assert.equal(s.businesses.market.inventory,inventory+2);
  eater.hunger=90;needsAndActivities(eater,{day:1,hour:8,minute:0},0);assert.equal(eater.hunger,30);assert.equal(s.businesses.market.inventory,inventory+1);
 }
 close(liquidMoneySupply(),before);assert.equal(s.foodReserve,0);assert.equal(d.delivered,2);
});
