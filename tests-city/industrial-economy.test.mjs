import test from 'node:test';
import assert from 'node:assert/strict';
import {createIndustrialEconomy,NORTH_F1_MERCH_ID} from '../worker/industrial-economy.mjs';
import {INDUSTRIAL_BUILDINGS,INDUSTRIAL_PLANTS,INDUSTRIAL_ROADS,INDUSTRIAL_LOCATIONS,INDUSTRIAL_LOADING_BAYS,MAX_FREIGHT_TRUCKS} from '../worker/industry-map.mjs';
import {BUILDINGS,ROADS,LOCATIONS,WATER,applyUrbanGeometry,overlaps,pedestrianRoute,clearSegment} from '../worker/city-map.mjs';
import {GOVERNMENT_BUILDINGS,GOVERNMENT_RESERVED} from '../worker/government-map.mjs';
import {motorwaySegmentAt} from '../worker/motorway.mjs';
import {createInternationalLife} from '../worker/international-life.mjs';
const byId=id=>LOCATIONS.find(p=>p.id===id);
function fixture({sovereign=false,regionalDistribution=false}={}){
 applyUrbanGeometry({roads:INDUSTRIAL_ROADS.map(r=>({...r,stage:'operational'}))});for(const l of INDUSTRIAL_LOCATIONS)if(!byId(l.id))LOCATIONS.push({...l});
 let state={simulationAgeSeconds:3600,timeScale:120,flies:Array.from({length:30},(_,i)=>({id:`IND-${i}`,name:`Industrial resident ${i}`,brain:{id:`BRAIN-${i}`},alive:true,ageYears:32,health:95,energy:90,hunger:10,thirst:10,stress:5,money:6000,savings:4000,debt:0,bankLoan:0,creditScore:750,wage:0,jobId:null,jobTitle:null,traits:{ambition:.9,thrift:.9,resilience:.8},professionSkills:{},preferredWorkStart:8,preferredWorkHours:8,x:0,z:0,y:1.1,traveling:false,currentLocationId:'bank'})),businesses:{market:{cash:30000,inventory:0},grocery:{cash:30000,inventory:0},bakery:{cash:30000,inventory:0},'corner-shop':{cash:30000,inventory:0},'night-market':{cash:30000,inventory:0},'riverside-market':{cash:30000,inventory:0},'civic-materials':{cash:30000,inventory:0}},enterprises:{},treasury:{cash:100000},bank:{reserves:200000,loansOutstanding:0,defaults:0},nextEnterpriseId:1,totalTransactions:0};
 const events=[],care=[];const hooks={regionalDistribution,world:()=>state,neuralDrive:()=>.9,emit:(type,text,payload)=>events.push({type,...payload}),remember:()=>{},needsAndActivities:f=>care.push(f.id),payAndFinance:()=>{},startJourney:(f,chosen)=>{f.traveling=true;f.targetLocationId=chosen.id;f.action=chosen.action;f.routeWaypoints=pedestrianRoute(f,byId(chosen.id));},moveFly:f=>{const target=byId(f.targetLocationId);if(target){f.x=target.x;f.z=target.z;f.currentLocationId=target.id;f.traveling=false;}}};
 if(sovereign){hooks.countryAccount=id=>id==='hansdrex'?state.treasury:state.businesses[`treasury:${id}`]||=( {cash:100000,inventory:0});hooks.countryAccount('north-city');const borders=createInternationalLife({world:()=>state,redistribute:false,nationalEconomy:false});hooks.interceptMovement=(...args)=>borders.interceptMovement(...args);}
 let service=createIndustrialEconomy(hooks);service.init();
 return{get s(){return state;},get service(){return service;},events,care,place(f,id){const p=byId(id);Object.assign(f,{x:p.x,z:p.z,currentLocationId:id,targetLocationId:id,traveling:false,indoors:false});},found(index,plantId){const f=state.flies[index];this.place(f,'bank');const b=service.foundCompany(f,plantId);assert.ok(b,plantId);return b;},restore(){state=JSON.parse(JSON.stringify(state));service=createIndustrialEconomy(hooks);service.init();},step(seconds=120){state.simulationAgeSeconds+=seconds;const h=8+(state.simulationAgeSeconds/3600)%8,clock={hour:Math.floor(h),minute:h%1*60};for(const f of state.flies)service.handleResident(f,clock);service.tick(seconds,clock);}};
}
const cash=s=>s.flies.reduce((n,f)=>n+f.money+f.savings,0)+s.treasury.cash+s.bank.reserves+Object.values(s.enterprises).reduce((n,b)=>n+b.cash,0)+Object.values(s.businesses).reduce((n,b)=>n+b.cash,0);

test('foreign-owned North industry pays its licence, on-site payroll tax and public rent to the workplace nation',()=>{
 const t=fixture({sovereign:true}),north=t.s.businesses['treasury:north-city'],hans=t.s.treasury.cash,total=cash(t.s),start=north.cash,b=t.found(0,'INDUSTRY-north-1');
 assert.equal(t.s.treasury.cash,hans);assert.equal(north.cash,start+500);assert.ok(Math.abs(cash(t.s)-total)<1e-6);
 const employee=t.s.flies[10];employee.citizenshipCountryId='hansdrex';employee.homeX=0;employee.homeZ=0;t.place(employee,b.locationId);assert.equal(t.service.applyJob(employee,b.id),true);b.openingAt=0;b.nextOrderAt=Infinity;
 t.service.handleResident(employee,{hour:9});const before=north.cash,wallet=employee.money;t.s.simulationAgeSeconds+=1800;t.service.handleResident(employee,{hour:9.5});assert.ok(Math.abs(employee.money-wallet-employee.wage*.5*.95)<1e-7);assert.ok(Math.abs(north.cash-before-employee.wage*.5*.05)<1e-7);assert.equal(t.s.treasury.cash,hans);assert.ok(Math.abs(cash(t.s)-total)<1e-6);
 const rent=b.lease.hourlyRent*24,preRent=north.cash;b.nextFinanceAt=t.s.simulationAgeSeconds;b.nextOrderAt=0;b.inventory.raw=40;t.service.tick(0,{hour:10});assert.ok(Math.abs(north.cash-preRent-rent)<1e-7);assert.equal(t.s.treasury.cash,hans);assert.ok(Math.abs(cash(t.s)-total)<1e-6);
});

test('a resident-driven industrial shipment pays actual border entry once and delivers finite inputs without changing money supply',()=>{
 const t=fixture({sovereign:true}),b=t.found(0,'INDUSTRY-north-1'),f=t.s.flies[0];f.citizenshipCountryId='north-city';f.countryPresence={countryId:'north-city',entryId:'INITIAL'};b.openingAt=1e12;t.place(f,b.locationId);const total=cash(t.s),order=t.service.requestInput(b.id,20);assert.ok(order);t.service.tick(0,{hour:9});
 for(let i=0;i<2400&&!order.paid;i++)t.step();assert.equal(order.phase,'complete',JSON.stringify({order,trucks:t.s.industrialEconomy.trucks}));assert.equal(b.inventory.raw,20);const entries=f.countryEntryReceipts.filter(r=>r.toCountryId==='hansdrex');assert.equal(entries.length,1);assert.equal(entries[0].fee,50);assert.ok(Math.abs(cash(t.s)-total)<1e-6);assert.equal(f.industrialFreightDuty,null);
});

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
 const f=t.s.flies[10];t.place(f,b.locationId);assert.equal(t.service.applyJob(f,b.id),true);assert.equal(f.wage,b.wageOffer);assert.ok(f.wage>=4.6*.82);const total=cash(t.s),money=f.money;
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
 const t=fixture(),b=t.found(0,'INDUSTRY-north-1'),f=t.s.flies[0];b.openingAt=1e12;t.place(f,b.locationId);const total=cash(t.s),o=t.service.requestInput(b.id,40);assert.ok(o);t.service.tick(0,{hour:9});const truck=t.s.industrialEconomy.trucks[0];assert.equal(o.phase,'collecting');assert.equal(truck.boarding,Math.hypot(byId(b.locationId).x-truck.x,byId(b.locationId).z-truck.z)>5);const parked={x:truck.x,z:truck.z};assert.equal(f.traveling,truck.boarding);assert.deepEqual({x:truck.x,z:truck.z},parked);assert.ok(truck.routeWaypoints.some(p=>motorwaySegmentAt(p)),'the inter-zone haul uses the ring road');assert.equal(b.inventory.raw,0);
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


test('an existing owner voluntarily reinvests real savings, keeps a personal reserve, and cannot repeat the draw after restore',()=>{
 const t=fixture(),b=t.found(0,'INDUSTRY-west-2'),f=t.s.flies[0];Object.assign(b,{cash:0,openingAt:0,nextOrderAt:0,nextFinanceAt:1e12,inventory:{raw:40,finished:0}});Object.assign(f,{money:100,savings:1000});const total=cash(t.s),bank=t.s.bank.reserves,loan=b.loanBalance;t.service.tick(0,{hour:2});assert.equal(b.cash,600);assert.equal(f.money+f.savings,500);assert.equal(b.equityContributedLifetime,600);assert.equal(b.workingCapitalHistory[0].kind,'owner equity');assert.equal(t.s.bank.reserves,bank);assert.equal(b.loanBalance,loan);assert.ok(Math.abs(cash(t.s)-total)<1e-6);t.restore();t.service.tick(0,{hour:2});assert.equal(t.s.enterprises[b.id].cash,600);assert.equal(t.s.enterprises[b.id].workingCapitalHistory.length,1);assert.ok(Math.abs(cash(t.s)-total)<1e-6);
});

test('working capital credit uses actual bank reserves, collateral and owner credit without erasing existing debt',()=>{
 const t=fixture(),b=t.found(0,'INDUSTRY-west-2'),f=t.s.flies[0];Object.assign(b,{cash:0,loanBalance:0,openingAt:0,nextOrderAt:0,nextFinanceAt:1e12,inventory:{raw:40,finished:0}});Object.assign(f,{money:100,savings:400,bankLoan:90,creditScore:700});t.s.bank.reserves=1000;const total=cash(t.s),loans=t.s.bank.loansOutstanding;t.service.tick(0,{hour:2});assert.equal(b.cash,600);assert.equal(t.s.bank.reserves,400);assert.equal(t.s.bank.loansOutstanding,loans+600);assert.equal(b.loanBalance,600);assert.equal(f.bankLoan,690);assert.equal(b.workingCapitalHistory[0].kind,'secured bank loan');assert.ok(Math.abs(cash(t.s)-total)<1e-6);
 const poor=fixture(),pb=poor.found(0,'INDUSTRY-west-2'),pf=poor.s.flies[0];Object.assign(pb,{cash:0,loanBalance:1000,openingAt:0,nextOrderAt:0,nextFinanceAt:1e12,inventory:{raw:40,finished:0}});Object.assign(pf,{money:100,savings:400,bankLoan:1000,creditScore:500});const before=cash(poor.s),reserve=poor.s.bank.reserves;poor.service.tick(0,{hour:2});assert.equal(pb.cash,0);assert.equal(pb.loanBalance,1000);assert.equal(pf.bankLoan,1000);assert.equal(poor.s.bank.reserves,reserve);assert.ok(Math.abs(cash(poor.s)-before)<1e-6);
});

test('funded local warehouse inputs travel on existing licensed trucks at night and settle exactly once after restore',()=>{
 const t=fixture({regionalDistribution:true,sovereign:true}),b=t.found(0,'INDUSTRY-north-1'),hub='INDUSTRY-north-4',warehouse=t.s.businesses[`regional-warehouse-${hub}`];b.openingAt=1e12;t.s.industrialEconomy.nextRestockAt=1e12;t.s.regionalFreight.nextDispatchAt=1e12;t.s.industrialEconomy.rawStock.fabric-=40;t.s.regionalFreight.stocks[hub]={fabric:40,grain:0,aggregate:0};const raw=t.s.industrialEconomy.rawStock.fabric,total=cash(t.s),beforeWarehouse=warehouse.cash,actors=t.s.flies.map(f=>[f.id,f.brain.id,f.x,f.z]);
 const order=t.service.requestInput(b.id,20);assert.ok(order);assert.equal(order.sourceLocationId,hub);assert.equal(order.sellerId,`regional-warehouse-${hub}`);assert.equal(t.s.regionalFreight.stocks[hub].fabric,20);assert.equal(t.s.industrialEconomy.rawStock.fabric,raw);assert.equal(b.inventory.raw,0);t.service.tick(0,{hour:2});assert.ok(t.s.regionalFreight.jobs.some(j=>j.industrialOrderId===order.id));assert.ok(t.s.regionalFreight.trucks.some(truck=>truck.jobId===`REGIONAL-INDUSTRIAL-${order.id}`));let distance=0;const origins=new Map(t.s.regionalFreight.trucks.map(truck=>[truck.id,{x:truck.x,z:truck.z}]));
 for(let i=0;i<2200&&!t.s.industrialEconomy.orders.find(o=>o.id===order.id)?.paid;i++){t.step();for(const truck of t.s.regionalFreight.trucks){const p=origins.get(truck.id);distance=Math.max(distance,Math.hypot(truck.x-p.x,truck.z-p.z));}if(i===20)t.restore();}
 const paid=t.s.industrialEconomy.orders.find(o=>o.id===order.id);assert.equal(paid.phase,'complete',JSON.stringify({paid,trucks:t.s.regionalFreight.trucks}));assert.ok(distance>20);assert.equal(t.s.enterprises[b.id].inventory.raw,20);assert.ok(Math.abs(t.s.businesses[`regional-warehouse-${hub}`].cash-beforeWarehouse-20*order.unitPrice)<1e-6);assert.equal(paid.regionalCrewSettled,true);assert.equal(t.s.regionalFreight.trucks.length,24);assert.deepEqual(t.s.flies.map(f=>[f.id,f.brain.id,f.x,f.z]),actors);assert.ok(Math.abs(cash(t.s)-total)<1e-6);t.restore();assert.equal(t.service.finishOrder(t.s.industrialEconomy.orders.find(o=>o.id===order.id)),false);assert.equal(t.s.enterprises[b.id].inventory.raw,20);
});

test('cancelling a brokered local input restores its actual warehouse stock and funded buyer only once',()=>{
 const t=fixture({regionalDistribution:true}),b=t.found(0,'INDUSTRY-north-1'),hub='INDUSTRY-north-4';b.openingAt=1e12;t.s.regionalFreight.nextDispatchAt=1e12;t.s.industrialEconomy.rawStock.fabric-=40;t.s.regionalFreight.stocks[hub]={fabric:40,grain:0,aggregate:0};const before=b.cash,total=cash(t.s),order=t.service.requestInput(b.id,20);t.service.tick(0,{hour:2});assert.equal(t.service.finishOrder(order,true),true);assert.equal(t.service.finishOrder(order,true),false);assert.equal(t.s.regionalFreight.stocks[hub].fabric,40);assert.equal(b.cash,before);t.restore();t.service.tick(0,{hour:2});assert.equal(t.s.regionalFreight.stocks[hub].fabric,40);assert.equal(t.s.enterprises[b.id].cash,before);assert.ok(Math.abs(cash(t.s)-total)<1e-6);
});

test('a paid food consignment reaches its real buyer at night without borrowing or teleporting a resident driver',()=>{
 const t=fixture({regionalDistribution:true,sovereign:true}),b=t.found(0,'INDUSTRY-west-2');b.openingAt=1e12;b.inventory.finished=30;t.s.regionalFreight.nextDispatchAt=1e12;t.s.industrialEconomy.nextRestockAt=1e12;const before=b.cash,total=cash(t.s),actors=t.s.flies.map(f=>[f.id,f.brain.id,f.x,f.z]),order=t.service.requestSale(b.id,'market',20);assert.ok(order);assert.equal(t.s.businesses.market.inventory,0);t.service.tick(0,{hour:2});for(let i=0;i<2400&&!t.s.industrialEconomy.orders.find(o=>o.id===order.id)?.paid;i++)t.step();const paid=t.s.industrialEconomy.orders.find(o=>o.id===order.id);assert.equal(paid.phase,'complete',JSON.stringify(paid));assert.equal(t.s.businesses.market.inventory,20);assert.equal(b.cash,before+76);assert.equal(b.inventory.finished,10);assert.deepEqual(t.s.flies.map(f=>[f.id,f.brain.id,f.x,f.z]),actors);assert.ok(Math.abs(cash(t.s)-total)<1e-6);
});

test('an unboarded private pickup reassigns the same funded consignment to the licensed fleet without restarting escrow or moving its resident',()=>{
 const t=fixture({regionalDistribution:true}),b=t.found(0,'INDUSTRY-west-2'),f=t.s.flies[0];b.openingAt=1e12;b.inventory.finished=30;t.s.regionalFreight.nextDispatchAt=1e12;t.place(f,b.locationId);Object.assign(t.s.industrialEconomy.trucks[0],{x:-1082.6,z:-668});const o=t.service.requestSale(b.id,'market',20);t.service.tick(0,{hour:9});const privateTruck=t.s.industrialEconomy.trucks.find(truck=>truck.orderId===o.id);assert.ok(privateTruck?.boarding);const pose=[f.x,f.z,f.money,f.savings],escrow=t.s.businesses['industrial-freight-escrow'].cash,remaining=b.inventory.finished,total=cash(t.s);t.s.simulationAgeSeconds+=8*3600+120;t.service.tick(0,{hour:18});assert.equal(privateTruck.orderId,null);assert.equal(f.industrialFreightDuty,null);assert.deepEqual([f.x,f.z,f.money,f.savings],pose);assert.equal(t.s.businesses['industrial-freight-escrow'].cash,escrow);assert.equal(b.inventory.finished,remaining);assert.equal(o.paid,false);assert.equal(o.carrierId,'regional-logistics');assert.ok(t.s.regionalFreight.jobs.some(j=>j.industrialOrderId===o.id));assert.ok(Math.abs(cash(t.s)-total)<1e-6);t.restore();assert.equal(t.s.businesses['industrial-freight-escrow'].cash,escrow);assert.equal(t.s.regionalFreight.jobs.filter(j=>j.industrialOrderId===o.id).length,1);
});

test('a director can decline recapitalization and exhausted collateral never draws unbacked credit',()=>{
 for(const blocked of ['unwilling','collateral','bank']){const t=fixture(),b=t.found(0,'INDUSTRY-west-2'),f=t.s.flies[0];Object.assign(b,{cash:0,loanBalance:blocked==='collateral'?1000:0,openingAt:0,nextOrderAt:0,nextFinanceAt:1e12,inventory:{raw:40,finished:0}});Object.assign(f,{money:100,savings:400,creditScore:750});if(blocked==='unwilling'){f.savings=4000;f.traits.ambition=0;f.traits.thrift=0;}if(blocked==='bank')t.s.bank.reserves=50;const before=cash(t.s),reserve=t.s.bank.reserves,debt=b.loanBalance;t.service.tick(0,{hour:2});assert.equal(b.cash,0,blocked);assert.equal(t.s.bank.reserves,reserve,blocked);assert.equal(b.loanBalance,debt,blocked);assert.ok(Math.abs(cash(t.s)-before)<1e-6);}
});


test('the Grand Prix shop orders real finished garments and receives stock only after physical delivery',()=>{
 const t=fixture({sovereign:true,regionalDistribution:true}),supplier=t.found(0,'INDUSTRY-north-1');
 Object.assign(supplier,{openingAt:0,nextFinanceAt:1e12,nextOrderAt:1e12,inventory:{raw:0,finished:42}});
 t.s.industrialEconomy.nextRestockAt=1e12;t.s.regionalFreight.nextDispatchAt=1e12;
 t.s.northF1={event:{status:'scheduled',startsAt:t.s.simulationAgeSeconds+24*3600,endsAt:t.s.simulationAgeSeconds+36*3600}};
 const total=cash(t.s),north=t.s.businesses['treasury:north-city'],budget=north.cash,initialRevenue=supplier.revenueLifetime;
 t.service.tick(0,{hour:2});
 const shop=t.s.businesses[NORTH_F1_MERCH_ID],order=t.s.industrialEconomy.orders.find(o=>o.buyerId===NORTH_F1_MERCH_ID);
 assert.equal(shop.locationId,'north-f1-grandstand');
 assert.equal(north.cash,budget-1800);
 assert.ok(order);
 assert.equal(order.quantity,42);
 assert.equal(shop.inventory,0);
 assert.equal(supplier.inventory.finished,0);
 for(let i=0;i<1000&&shop.inventory===0;i++){
  t.s.simulationAgeSeconds+=120;
  t.service.tick(120,{hour:2});
 }
 assert.equal(order.phase,'complete');
 assert.equal(shop.inventory,42);
 assert.equal(supplier.revenueLifetime-initialRevenue,42*8);
 assert.equal(north.cash,budget-1800);
 assert.ok(Math.abs(cash(t.s)-total)<1e-6);
});


test('food-crisis wholesale support transfers domestic money into a paid delayed import, survives restore and remains bounded',()=>{
 const t=fixture({sovereign:true}),d=t.s.industrialEconomy,depot=t.s.businesses['industrial-raw-depot'];d.rawStock={fabric:0,grain:0,aggregate:0};depot.cash=96;d.nextRestockAt=t.s.simulationAgeSeconds+86400;
 for(const f of t.s.flies)f.hunger=100;
 const total=cash(t.s),hans=t.s.treasury.cash,north=t.s.businesses['treasury:north-city'].cash;
 t.service.tick(0,{hour:9});assert.equal(d.foodSecurityAdvance.outstanding,4000);assert.equal(t.s.treasury.cash,hans-4000);assert.equal(t.s.businesses['treasury:north-city'].cash,north);assert.equal(d.rawStock.grain,0);assert.equal(d.rawRestock.units,400);assert.ok(Math.abs(cash(t.s)-total)<1e-6);
 const arrival=d.rawRestock.arrival;t.restore();let restored=t.s.industrialEconomy;t.service.tick(0,{hour:9});assert.equal(restored.foodSecurityAdvance.advanced,4000);assert.equal(restored.rawStock.grain,0);
 t.s.simulationAgeSeconds=arrival;t.service.tick(1800,{hour:12});assert.equal(restored.rawStock.grain,400);assert.ok(Math.abs(cash(t.s)-total)<1e-6);
 for(let i=0;i<5;i++){t.s.simulationAgeSeconds+=86400;restored.rawStock.grain=0;t.s.businesses['industrial-raw-depot'].cash=0;restored.rawRestock=null;t.service.tick(0,{hour:9});}
 assert.equal(restored.foodSecurityAdvance.outstanding,12000);assert.equal(restored.foodSecurityAdvance.advanced,12000);
});

test('ordinary demand and an unfunded country cannot trigger wholesale food advances',()=>{
 const t=fixture(),d=t.s.industrialEconomy;d.rawStock.grain=0;t.s.businesses['industrial-raw-depot'].cash=0;t.service.tick(0,{hour:9});assert.equal(d.foodSecurityAdvance,undefined);
 for(const f of t.s.flies)f.hunger=100;t.s.treasury.cash=1000;const stock=d.rawStock.grain;t.service.tick(0,{hour:9});assert.equal(d.foodSecurityAdvance,undefined);assert.equal(d.rawStock.grain,stock);assert.equal(t.s.treasury.cash,1000);
});

test('a recovered wholesaler repays only its domestic treasury once while retaining operating cash and grain',()=>{
 const t=fixture({sovereign:true}),d=t.s.industrialEconomy,depot=t.s.businesses['industrial-raw-depot'];
 d.foodSecurityAdvance={outstanding:500,advanced:500,repaid:0,nextAt:t.s.simulationAgeSeconds+86400};d.rawStock.grain=1400;depot.cash=5500;
 const total=cash(t.s),hans=t.s.treasury.cash,north=t.s.businesses['treasury:north-city'].cash;
 t.service.tick(0,{hour:9});assert.equal(d.foodSecurityAdvance.outstanding,0);assert.equal(d.foodSecurityAdvance.repaid,500);assert.equal(depot.cash,5000);assert.equal(d.rawStock.grain,1400);assert.equal(t.s.treasury.cash,hans+500);assert.equal(t.s.businesses['treasury:north-city'].cash,north);assert.equal(cash(t.s),total);
 t.restore();t.service.tick(0,{hour:9});assert.equal(t.s.treasury.cash,hans+500);assert.equal(cash(t.s),total);
});
