import test from 'node:test';
import assert from 'node:assert/strict';
import {planIndustrialLabour} from '../worker/industrial-labor.mjs';
import {createIndustrialEconomy} from '../worker/industrial-economy.mjs';
import {INDUSTRIAL_PLANTS} from '../worker/industry-map.mjs';
import {BUILDINGS,LOCATIONS,contains,pedestrianRoute} from '../worker/city-map.mjs';
const loc=id=>LOCATIONS.find(l=>l.id===id),place=(f,id)=>Object.assign(f,{...loc(id),id:f.id,currentLocationId:id,targetLocationId:id,traveling:false});
function fixture(){const s={simulationAgeSeconds:3600,timeScale:120,flies:Array.from({length:180},(_,i)=>({id:`LABOUR-${i}`,name:`Resident ${i}`,alive:true,ageYears:32,money:10000,savings:2000,energy:95,health:95,traits:{ambition:.9,thrift:.3},creditScore:750,x:0,z:0,currentLocationId:'bank',preferredWorkStart:8,preferredWorkHours:8})),enterprises:{},businesses:{},treasury:{cash:100000},bank:{reserves:100000,loansOutstanding:0},nextEnterpriseId:1};const svc=createIndustrialEconomy({world:()=>s,regionalDistribution:false,neuralDrive:()=>.9,urbanWorld:{isUnavailable:id=>Boolean(s.urbanWorld?.buildings?.[id]&&s.urbanWorld.buildings[id].stage!=='operational')}});svc.init();return{s,svc};}
const money=s=>s.flies.reduce((n,f)=>n+f.money+f.savings,0)+s.treasury.cash+s.bank.reserves+Object.values(s.enterprises).reduce((n,b)=>n+b.cash,0)+Object.values(s.businesses).reduce((n,b)=>n+b.cash,0);

test('all factories offer up to 50 voluntary jobs; owner shifts and wages follow demand and cash rather than forced staffing',()=>{
 assert.ok(INDUSTRIAL_PLANTS.every(p=>p.capacity===50));
 const owner={traits:{ambition:.95,thrift:.2}},b={id:'F',cash:100000,employees:[],industrialSector:'garments',inventory:{finished:0}},s={flies:[],enterprises:Object.fromEntries(Array.from({length:20},(_,i)=>[i,{garmentRetail:true,status:'operating',targetStock:36,inventory:0}]))};
 const plan=planIndustrialLabour(b,INDUSTRIAL_PLANTS[0],owner,s,3600);assert.equal(plan.targetWorkers,50);assert.equal(plan.shifts,3);assert.deepEqual(plan.shiftStarts,[0,8,16]);assert.ok(plan.wageOffer>4.6*1.06);assert.equal(b.employees.length,0);
 b.cash=50;const poor=planIndustrialLabour(b,INDUSTRIAL_PLANTS[0],owner,s,7200);assert.equal(poor.targetWorkers,0);assert.equal(b.employees.length,0);
});

test('an existing industrial worker may accept a better funded offer without duplicate employment or forced reassignment',()=>{
 const {s,svc}=fixture(),old=svc.foundCompany(s.flies[0],'INDUSTRY-west-1'),next=svc.foundCompany(s.flies[1],'INDUSTRY-west-5'),f=s.flies[5];place(f,old.locationId);assert.equal(svc.applyJob(f,old.id),true);const oldWage=f.wage;next.labourPlan={...next.labourPlan,targetWorkers:4,wageOffer:oldWage*1.7};next.wageOffer=next.labourPlan.wageOffer;next.nextLabourDecisionAt=1e12;place(f,next.locationId);const total=money(s);assert.equal(svc.applyJob(f,next.id),true);assert.equal(f.businessEmployeeOf,next.id);assert.ok(!old.employees.includes(f.id));assert.equal(next.employees.filter(id=>id===f.id).length,1);assert.ok(f.wage>oldWage);assert.equal(svc.applyJob(f,next.id),false);assert.equal(money(s),total);
});

test('funded civic facility employees cannot simultaneously found a factory, run a clothing shop or accept industrial work',()=>{
 const {s,svc}=fixture(),b=svc.foundCompany(s.flies[0],'INDUSTRY-west-1'),f=s.flies[1];f.facilityEmployment={facilityId:'CIVIC-SCHOOL',role:'teacher'};place(f,'bank');assert.equal(svc.foundCompany(f,'INDUSTRY-west-5'),null);assert.equal(svc.clothingRetail.open(f),null);place(f,b.locationId);assert.equal(svc.applyJob(f,b.id),false);assert.equal(f.facilityEmployment.role,'teacher');
});

test('existing residents finance multiple physical clothing shops; escrow delivery then actual customer purchases conserve money',()=>{
 const {s,svc}=fixture(),total=money(s),factory=svc.foundCompany(s.flies[0],'INDUSTRY-west-1');assert.ok(factory);factory.openingAt=0;factory.inventory.finished=90;
 const shops=[1,2,3].map(i=>{place(s.flies[i],'bank');const b=svc.clothingRetail.open(s.flies[i]);assert.ok(b);b.openingAt=0;place(s.flies[i],b.locationId);return b;});assert.equal(new Set(shops.map(b=>b.locationId)).size,3);assert.equal(s.flies.length,180);assert.ok(Math.abs(money(s)-total)<1e-7);
 const shop=shops[0],stock=factory.inventory.finished,order=svc.requestSale(factory.id,shop.id,20);assert.ok(order);assert.equal(order.destinationId,shop.locationId);assert.equal(shop.inventory,0);assert.equal(factory.inventory.finished,stock-20);assert.ok(Math.abs(money(s)-total)<1e-7);
 svc.finishOrder(order);assert.equal(shop.inventory,20);assert.equal(svc.finishOrder(order),false);const buyer=s.flies[8];place(buyer,shop.locationId);const wallet=buyer.money,revenue=shop.revenueLifetime;assert.equal(svc.clothingRetail.purchase(buyer,shop),true);assert.equal(buyer.money,wallet-shop.garmentPrice);assert.equal(shop.inventory,19);assert.equal(shop.revenueLifetime,revenue+shop.garmentPrice);assert.equal(svc.clothingRetail.purchase(buyer,shop),false);assert.ok(Math.abs(money(s)-total)<1e-7);
 s.flies[1].traveling=true;buyer.nextClothesPurchaseAt=0;assert.equal(svc.clothingRetail.purchase(buyer,shop),false);assert.equal(shop.inventory,19);assert.equal(svc.snapshot().clothingShops.length,3);
});

test('clothing premises have reachable outside doors and never repurpose an owner-funded civic clinic',()=>{
 const {s,svc}=fixture(),f=s.flies[1],bank=loc('bank'),clinic={id:'CIVIC-RETAIL-EXCLUSION-CLINIC',kind:'civic',x:bank.x+1,z:bank.z,w:10,d:10,h:6};s.urbanWorld={buildings:{[clinic.id]:{...clinic,usage:'clinic',stage:'operational',ownerId:f.id}}};BUILDINGS.push(clinic);
 try{const b=svc.clothingRetail.open(f);assert.ok(b);assert.notEqual(b.locationId,clinic.id);const site=BUILDINGS.find(p=>p.id===b.locationId),door=loc(b.locationId);assert.ok(site);assert.equal(contains(site,door),false);assert.ok(pedestrianRoute(bank,door).length);const cash=b.cash;Object.assign(door,{x:site.x,z:site.z});svc.init();assert.equal(contains(site,loc(b.locationId)),false);assert.equal(b.cash,cash);}finally{BUILDINGS.splice(BUILDINGS.indexOf(clinic),1);}
});

test('funded dynamic factories become owner-specific leases without granting companies or inputs',()=>{
 const {s,svc}=fixture();s.urbanWorld={buildings:{'CIVIC-FACTORY':{id:'CIVIC-FACTORY',usage:'factory',stage:'operational',industrySector:'garments',district:'west',capacity:50,ownerId:s.flies[0].id,x:-900,z:320,w:20,d:20,h:16,frontage:{x:-900,z:335}}}};LOCATIONS.push({id:'CIVIC-FACTORY',type:'industrial',x:-900,z:335});svc.init();assert.equal(svc.foundCompany(s.flies[1],'CIVIC-FACTORY'),null);const b=svc.foundCompany(s.flies[0],'CIVIC-FACTORY');assert.ok(b);assert.equal(b.inventory.raw,0);assert.equal(b.inventory.finished,0);assert.equal(b.employees.length,0);assert.equal(svc.snapshot().plants.find(p=>p.id==='CIVIC-FACTORY').capacity,50);
});

test('a damaged dynamic factory retains its lease and suspends offers instead of crashing or replacing ownership',()=>{
 const {s,svc}=fixture(),id='CIVIC-FACTORY-DAMAGE';s.urbanWorld={buildings:{[id]:{id,usage:'factory',stage:'operational',industrySector:'garments',district:'west',capacity:50,ownerId:s.flies[0].id,x:-900,z:300,w:20,d:20,h:16,frontage:{x:-900,z:315}}}};LOCATIONS.push({id,type:'industrial',x:-900,z:315});svc.init();const b=svc.foundCompany(s.flies[0],id);assert.ok(b);s.urbanWorld.buildings[id].stage='damaged';s.simulationAgeSeconds+=120;assert.doesNotThrow(()=>svc.tick(120,{hour:9}));assert.equal(svc.snapshot().plants.find(p=>p.id===id).businessId,b.id);assert.equal(b.ownerId,s.flies[0].id);const choices=[];svc.addChoices(s.flies[1],{hour:9},(id,action)=>choices.push({id,action}));assert.ok(!choices.some(c=>c.id===id));
});

test('garments reach a resident shop by a paid physical truck trip before they can be sold',()=>{
 const {s,svc}=fixture(),total=money(s),f=s.flies[0],owner=s.flies[1],factory=svc.foundCompany(f,'INDUSTRY-west-1');place(owner,'bank');const shop=svc.clothingRetail.open(owner);assert.ok(shop);shop.openingAt=0;factory.openingAt=1e12;factory.inventory.finished=24;place(f,factory.locationId);place(owner,shop.locationId);const order=svc.requestSale(factory.id,shop.id,20);assert.ok(order);svc.tick(0,{hour:9});const truck=s.industrialEconomy.trucks[0];assert.equal(order.phase,'collecting');assert.equal(shop.inventory,0);
 // The boarding journey is a real walk in the engine; the fixture completes that walk explicitly.
 if(truck.boarding){Object.assign(f,{x:truck.x,z:truck.z,traveling:false,currentLocationId:null});truck.boarding=false;}
 let progressed=false;for(let step=0;step<3000&&!order.paid;step++){s.simulationAgeSeconds+=120;svc.tick(120,{hour:9});progressed ||=truck.motionSpeed>0;}
 assert.equal(order.phase,'complete',JSON.stringify({truck,order}));assert.ok(progressed);assert.equal(shop.inventory,20);assert.ok(Math.abs(money(s)-total)<1e-6);assert.equal(factory.inventory.finished,4);
});
