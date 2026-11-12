import test from 'node:test';
import assert from 'node:assert/strict';
import {createIndustrialEconomy} from '../worker/industrial-economy.mjs';
import {INDUSTRIAL_BUILDINGS,INDUSTRIAL_PLANTS,INDUSTRIAL_ROADS,INDUSTRIAL_LOCATIONS,INDUSTRIAL_LOADING_BAYS,MAX_FREIGHT_TRUCKS} from '../worker/industry-map.mjs';
import {BUILDINGS,ROADS,LOCATIONS,WATER,applyUrbanGeometry,overlaps,pedestrianRoute,clearSegment} from '../worker/city-map.mjs';
import {GOVERNMENT_BUILDINGS,GOVERNMENT_RESERVED} from '../worker/government-map.mjs';
import {motorwaySegmentAt} from '../worker/motorway.mjs';
const byId=id=>LOCATIONS.find(p=>p.id===id);
function fixture(){
 applyUrbanGeometry({roads:INDUSTRIAL_ROADS.map(r=>({...r,stage:'operational'}))});for(const l of INDUSTRIAL_LOCATIONS)if(!byId(l.id))LOCATIONS.push({...l});
 let state={simulationAgeSeconds:3600,timeScale:120,flies:Array.from({length:30},(_,i)=>({id:`IND-${i}`,name:`Industrial resident ${i}`,brain:{id:`BRAIN-${i}`},alive:true,ageYears:32,health:95,energy:90,hunger:10,thirst:10,stress:5,money:6000,savings:4000,debt:0,bankLoan:0,creditScore:750,wage:0,jobId:null,jobTitle:null,traits:{ambition:.9,thrift:.9,resilience:.8},professionSkills:{},preferredWorkStart:8,preferredWorkHours:8,x:0,z:0,y:1.1,traveling:false,currentLocationId:'bank'})),businesses:{market:{cash:30000,inventory:0},grocery:{cash:30000,inventory:0},bakery:{cash:30000,inventory:0},'corner-shop':{cash:30000,inventory:0},'night-market':{cash:30000,inventory:0},'riverside-market':{cash:30000,inventory:0},'civic-materials':{cash:30000,inventory:0}},enterprises:{},treasury:{cash:100000},bank:{reserves:200000,loansOutstanding:0,defaults:0},nextEnterpriseId:1,totalTransactions:0};
 const events=[],care=[];const hooks={regionalDistribution:false,world:()=>state,neuralDrive:()=>.9,emit:(type,text,payload)=>events.push({type,...payload}),remember:()=>{},needsAndActivities:f=>care.push(f.id),payAndFinance:()=>{},startJourney:(f,chosen)=>{f.traveling=true;f.targetLocationId=chosen.id;f.action=chosen.action;f.routeWaypoints=pedestrianRoute(f,byId(chosen.id));},moveFly:f=>{const target=byId(f.targetLocationId);if(target){f.x=target.x;f.z=target.z;f.currentLocationId=target.id;f.traveling=false;}}};
 let service=createIndustrialEconomy(hooks);service.init();
 return{get s(){return state;},get service(){return service;},events,care,place(f,id){const p=byId(id);Object.assign(f,{x:p.x,z:p.z,currentLocationId:id,targetLocationId:id,traveling:false,indoors:false});},found(index,plantId){const f=state.flies[index];this.place(f,'bank');const b=service.foundCompany(f,plantId);assert.ok(b,plantId);return b;},restore(){state=JSON.parse(JSON.stringify(state));service=createIndustrialEconomy(hooks);service.init();},step(seconds=120){state.simulationAgeSeconds+=seconds;const h=8+(state.simulationAgeSeconds/3600)%8,clock={hour:Math.floor(h),minute:h%1*60};for(const f of state.flies)service.handleResident(f,clock);service.tick(seconds,clock);}};
}
const cash=s=>s.flies.reduce((n,f)=>n+f.money+f.savings,0)+s.treasury.cash+s.bank.reserves+Object.values(s.enterprises).reduce((n,b)=>n+b.cash,0)+Object.values(s.businesses).reduce((n,b)=>n+b.cash,0);

test('sixteen physical leases remain vacant until existing resident founders finance them, and West has twice the industrial sites',()=>{
 const t=fixture(),total=cash(t.s),ids=t.s.flies.map(f=>[f.id,f.brain.id]);assert.equal(t.service.snapshot().companies.length,0);
 assert.equal(INDUSTRIAL_PLANTS.filter(p=>p.zone==='west').length,8);
 for(const [i,p]of INDUSTRIAL_PLANTS.entries())t.found(i,p.id);
 assert.equal(t.service.snapshot().companies.length,16);assert.equal(t.service.snapshot().trucks.length,MAX_FREIGHT_TRUCKS);assert.ok(Math.abs(cash(t.s)-total)<1e-7);
 const other=t.s.flies[20];t.place(other,'bank');assert.equal(t.service.foundCompany(other),null);assert.deepEqual(t.s.flies.map(f=>[f.id,f.brain.id]),ids);
 t.restore();assert.equal(t.service.snapshot().companies.length,16);assert.equal(t.service.snapshot().trucks.length,16);assert.ok(Math.abs(cash(t.s)-total)<1e-7);
});

test('essential personnel and government recruits cannot be poached; industrial wages depend on district and actual attendance',()=>{
 const t=fixture(),b=t.found(0,'INDUSTRY-west-1');for(const [i,job]of ['doctor','power','firefighter','paramedic','transit','military','police'].entries()){const f=t.s.flies[i+1];f.jobId=job;t.place(f,b.locationId);assert.equal(t.service.applyJob(f,b.id),false);assert.equal(f.jobId,job);}
 const f=t.s.flies[10];t.place(f,b.locationId);assert.equal(t.service.applyJob(f,b.id),true);assert.equal(f.wage,4.6*.82);const total=cash(t.s),money=f.money;
 t.service.handleResident(f,{hour:9});t.s.simulationAgeSeconds+=1800;t.service.handleResident(f,{hour:9.5});assert.ok(Math.abs(f.money-money-f.wage*.5*.95)<1e-7);assert.ok(Math.abs(cash(t.s)-total)<1e-7);
 const paid=f.money;t.service.handleResident(f,{hour:9.5});assert.equal(f.money,paid);t.place(f,'park');t.s.simulationAgeSeconds+=1800;t.service.handleResident(f,{hour:10});assert.equal(f.money,paid);
});

test('production consumes finite input stock only with a resident physically at the factory; no synthetic export revenue appears',()=>{
 const t=fixture(),b=t.found(0,'INDUSTRY-west-1');b.openingAt=0;b.nextOrderAt=1e12;b.inventory.raw=20;const total=cash(t.s),money=b.cash;t.s.simulationAgeSeconds+=1800;t.service.tick(1800,{hour:9});assert.equal(b.productionUnits,0);assert.equal(b.inventory.raw,20);assert.equal(b.cash,money);
 t.place(t.s.flies[0],b.locationId);t.s.simulationAgeSeconds+=1800;t.service.tick(1800,{hour:9.5});assert.ok(b.productionUnits>0);assert.ok(b.inventory.raw<20);assert.equal(b.revenueLifetime,0);assert.ok(Math.abs(cash(t.s)-total)<1e-7);
});

test('a real escrow reserves raw stock, survives restore, settles once and refunds a cancelled order without minting cash',()=>{
 const t=fixture(),b=t.found(0,'INDUSTRY-north-1'),total=cash(t.s),stock=t.s.industrialEconomy.rawStock.fabric,cashBefore=b.cash,o=t.service.requestInput(b.id,40);assert.ok(o);assert.equal(b.inventory.raw,0);assert.equal(b.cash,cashBefore-o.total);assert.equal(t.s.industrialEconomy.rawStock.fabric,stock-40);
 t.restore();const saved=t.s.industrialEconomy.orders.find(x=>x.id===o.id);assert.equal(t.service.finishOrder(saved,true),true);assert.equal(t.service.finishOrder(saved,true),false);assert.equal(t.s.enterprises[b.id].cash,cashBefore);assert.equal(t.s.industrialEconomy.rawStock.fabric,stock);assert.ok(Math.abs(cash(t.s)-total)<1e-7);
 const sale=t.s.enterprises[b.id];sale.inventory.finished=30;const before=t.s.businesses['corner-shop'].inventory,order=t.service.requestSale(b.id,'corner-shop',20);assert.ok(order);assert.equal(t.s.businesses['corner-shop'].inventory,before);assert.equal(sale.revenueLifetime,0);assert.equal(t.service.finishOrder(order),true);assert.equal(t.s.businesses['corner-shop'].inventory,before+20);assert.equal(sale.revenueLifetime,160+order.fee);assert.equal(t.service.finishOrder(order),false);assert.ok(Math.abs(cash(t.s)-total)<1e-7);
});

test('inter-zone cargo follows actual motorway lanes and physically completes rather than creating remote stock',()=>{
 const t=fixture(),b=t.found(0,'INDUSTRY-north-1'),f=t.s.flies[0];b.openingAt=1e12;t.place(f,b.locationId);const total=cash(t.s),o=t.service.requestInput(b.id,40);assert.ok(o);t.service.tick(0,{hour:9});const truck=t.s.industrialEconomy.trucks[0];assert.equal(o.phase,'collecting');assert.equal(truck.boarding,true);const parked={x:truck.x,z:truck.z};assert.equal(f.traveling,true);assert.deepEqual({x:truck.x,z:truck.z},parked);assert.ok(truck.routeWaypoints.some(p=>motorwaySegmentAt(p)),'the inter-zone haul uses the ring road');assert.equal(b.inventory.raw,0);
 let fastest=0;for(let i=0;i<2200&&!t.s.industrialEconomy.orders.find(x=>x.id===o.id)?.paid;i++){t.step();fastest=Math.max(fastest,t.s.industrialEconomy.trucks[0]?.motionSpeed||0);if(i===30)t.restore();}
 const saved=t.s.industrialEconomy.orders.find(x=>x.id===o.id);assert.ok(saved?.paid,JSON.stringify({phase:saved?.phase,truck:t.s.industrialEconomy.trucks[0],age:t.s.simulationAgeSeconds}));assert.equal(saved.phase,'complete');assert.equal(t.s.enterprises[b.id].inventory.raw,40);assert.ok(fastest>=20);assert.equal(t.s.flies[0].industrialFreightDuty,null);assert.ok(Math.abs(cash(t.s)-total)<1e-6);
});

test('owner death releases the same private lease, cancels held cargo and clears driver commitments',()=>{
 const t=fixture(),b=t.found(0,'INDUSTRY-west-1'),f=t.s.flies[0];const o=t.service.requestInput(b.id,40),total=cash(t.s);f.alive=false;t.s.simulationAgeSeconds+=120;t.service.tick(120,{hour:9});assert.equal(b.status,'closed');assert.equal(o.phase,'cancelled');assert.equal(t.service.snapshot().trucks.length,0);assert.equal(t.s.flies.length,30);assert.ok(Math.abs(cash(t.s)-total)<1e-7);
});

test('industrial plots and street extensions avoid homes, the army, water and existing roads; every plant has a reachable loading bay',()=>{
 for(const b of INDUSTRIAL_BUILDINGS){for(const old of [...BUILDINGS.filter(o=>!INDUSTRIAL_BUILDINGS.some(p=>p.id===o.id)),...GOVERNMENT_BUILDINGS,...GOVERNMENT_RESERVED,...WATER])assert.equal(overlaps(b,old,.5),false,`${b.id} / ${old.id}`);for(const r of ROADS)assert.equal(overlaps(b,r,.5),false,`${b.id} / ${r.id}`);}
 for(const r of INDUSTRIAL_ROADS)for(const b of BUILDINGS.filter(o=>!INDUSTRIAL_BUILDINGS.some(p=>p.id===o.id)))assert.equal(overlaps(r,b,.5),false,`${r.id} / ${b.id}`);
 for(const p of INDUSTRIAL_PLANTS){const bay=INDUSTRIAL_LOADING_BAYS[p.id],route=pedestrianRoute(bay,INDUSTRIAL_LOADING_BAYS['industrial-raw-depot'],'car');assert.ok(route.length,p.id);assert.ok(route.every((q,i)=>!i||clearSegment(route[i-1],q)),p.id);assert.ok(pedestrianRoute(byId(p.id),byId('bank')).length,`${p.id} pedestrian access`);}
});


test('a logistics founder accepts another company’s funded haul; emergency diversion refunds cargo and preserves the emergency journey',()=>{
 const t=fixture(),factory=t.found(0,'INDUSTRY-north-1'),carrier=t.found(1,'INDUSTRY-west-4'),driver=t.s.flies[1];t.place(t.s.flies[0],factory.locationId);t.place(driver,carrier.locationId);const total=cash(t.s),o=t.service.requestInput(factory.id,40);t.service.tick(0,{hour:9});assert.equal(o.carrierId,carrier.id);assert.equal(driver.industrialFreightDuty.orderId,o.id);assert.ok(t.s.industrialEconomy.trucks.find(x=>x.orderId===o.id));
 const emergencyRoute=[{x:30,z:30}];Object.assign(driver,{civicDuty:{kind:'evacuation'},traveling:true,targetLocationId:'hospital-central',routeWaypoints:emergencyRoute});assert.equal(t.service.handleResident(driver,{hour:9}),false);assert.equal(o.phase,'cancelled');assert.equal(driver.industrialFreightDuty,null);assert.equal(driver.traveling,true);assert.equal(driver.targetLocationId,'hospital-central');assert.equal(driver.routeWaypoints,emergencyRoute);assert.ok(Math.abs(cash(t.s)-total)<1e-7);
});
