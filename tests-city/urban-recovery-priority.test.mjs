import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrbanWorld} from '../worker/urban-world.mjs';
import {BUILDINGS,LOCATIONS,entrance,applyUrbanGeometry} from '../worker/city-map.mjs';

function fixture(){
 applyUrbanGeometry();
 const home={...BUILDINGS.find(b=>b.kind==='house')},door=entrance(home);
 let state={simulationAgeSeconds:120,flies:Array.from({length:8},(_,i)=>({id:`BUILDER-${i}`,alive:true,ageYears:30,health:100,energy:90,hunger:10,money:1000,savings:5000,traits:{empathy:.8},brain:{},x:door.x,y:1.1,z:door.z,indoors:false,traveling:false})),businesses:{},treasury:{cash:50000},housing:{households:{},apartmentBlocks:[]},enterprises:{},weather:{precipitation:0,wind:0},utilities:{powerPlant:{gridOnline:true}},totalTransactions:0};
 const events=[];
 const hooks={world:()=>state,random:()=>.5,emit:(type,text,payload)=>events.push({type,...payload}),remember:()=>{},startJourney:(f,chosen)=>{const l=LOCATIONS.find(l=>l.id===chosen.id);Object.assign(f,{x:l.x,z:l.z,traveling:false,currentLocationId:l.id,targetLocationId:l.id,routeWaypoints:[]});},moveFly:()=>{},needsAndActivities:()=>{},payAndFinance:()=>{}};
 let urban=createUrbanWorld(hooks);urban.init();
 state.urbanWorld.nextFireAt=state.urbanWorld.nextGrowthAt=1e12;
 return {get s(){return state;},get urban(){return urban;},home,events,
  step(dt=600){for(const f of state.flies)if(f.urbanTask)urban.handleResident(f,{hour:12});state.simulationAgeSeconds+=dt;urban.tick(dt,{hour:12});},
  restore(){state=JSON.parse(JSON.stringify(state));urban=createUrbanWorld(hooks);urban.init();}};
}
const supply=s=>s.treasury.cash+s.flies.reduce((n,f)=>n+f.money+f.savings,0)+Object.values(s.businesses).reduce((n,b)=>n+Number(b.cash||0),0);

function fiveNewProjects(t){
 const lots=BUILDINGS.filter(b=>b.kind==='block').slice(0,5);
 for(const [index,b] of lots.entries()){
  t.s.urbanWorld.buildings[b.id]={...b,stage:'construction',health:100,progress:.2};
  const id=`OLD-NEW-${index}`,worker=t.s.flies[index];
  t.s.urbanWorld.projects.push({id,buildingId:b.id,ownerId:null,kind:'new',stage:'delivery',progress:.2,materialsRequired:20,materialsOrdered:20,materialsDelivered:0,materialsUsed:0,budget:1000,spent:100,workerIds:[worker.id],courierId:worker.id,startedAt:index,lastAt:0,targetHeight:b.h,roadIds:[],roadProgress:0,roadMaterialsRequired:0,roadMaterialsUsed:0});
  worker.urbanTask={type:'build',id,targetId:`CIVIC-SITE-${id}`,phase:'collecting',materials:20};
  t.s.treasury.cash-=1000;t.s.businesses['civic-escrow'].cash+=900;t.s.businesses['civic-materials'].cash+=100;t.s.businesses['civic-materials'].inventory-=20;
 }
 t.urban.init();
}

test('five funded new projects yield their workers and slots to recovery, retain paid stock over restart, then resume',()=>{
 const t=fixture();fiveNewProjects(t);
 const [owner]=t.s.flies,b=t.home;
 t.s.housing.households.HH={id:'HH',unitId:b.id,members:[owner.id]};
 Object.assign(owner,{householdId:'HH',housingUnitId:b.id,displacedFrom:{buildingId:b.id}});
 t.s.urbanWorld.buildings[b.id]={...b,originalHeight:b.h,stage:'collapsed',health:0,progress:0,lastDamageAt:120};
 const initial=supply(t.s),newIds=t.s.urbanWorld.projects.map(p=>p.id);
 t.step();
 const repair=t.s.urbanWorld.projects.find(p=>p.buildingId===b.id);
 assert.ok(repair,'recovery receives a project slot despite five existing developments');
 assert.equal(repair.kind,'rebuild');assert.equal(repair.funding.type,'public');assert.equal(repair.funding.accountId,'treasury');
 for(const p of t.s.urbanWorld.projects.filter(p=>newIds.includes(p.id))){
  assert.equal(p.recoveryPaused,true);assert.equal(p.workerIds.length,0);assert.equal(p.materialsOrdered,20);assert.equal(p.materialsDelivered,0);assert.equal(p.spent,100);assert.equal(p.progress,.2);
 }
 assert.ok(t.s.flies.every(f=>!newIds.includes(f.urbanTask?.id)));
 t.restore();
 for(let i=0;i<1000&&t.s.urbanWorld.projects.find(p=>p.id===repair.id).stage!=='complete';i++)t.step();
 const completed=t.s.urbanWorld.projects.find(p=>p.id===repair.id);
 assert.equal(completed.stage,'complete');assert.equal(t.s.urbanWorld.buildings[b.id].h,b.h);assert.equal(t.s.urbanWorld.buildings[b.id].health,100);
 assert.equal(t.events.filter(e=>e.type==='construction_contract'&&e.buildingId===b.id).length,1);
 const invoice=t.s.businesses['civic-materials'].cash;
 t.step();
 const resumed=t.s.urbanWorld.projects.filter(p=>newIds.includes(p.id));assert.equal(resumed.length,5);
 assert.ok(resumed.every(p=>!p.recoveryPaused));assert.ok(resumed.every(p=>p.materialsOrdered===20&&p.spent===100));
 assert.equal(t.s.businesses['civic-materials'].cash,invoice,'resuming does not charge the already-paid stock again');
 assert.ok(Math.abs(supply(t.s)-initial)<1e-6);
});

test('unfunded national recovery and a fire still burning do not suspend all other work indefinitely',()=>{
 const t=fixture();fiveNewProjects(t);
 const owner=t.s.flies[0],b=t.home;t.s.housing.households.HH={id:'HH',unitId:b.id,members:[owner.id]};
 Object.assign(owner,{householdId:'HH',housingUnitId:b.id,money:0,savings:0});
 t.s.treasury.cash=0;
 t.s.urbanWorld.buildings[b.id]={...b,stage:'collapsed',health:0,progress:0};
 t.step();assert.ok(t.s.urbanWorld.projects.filter(p=>p.kind==='new').every(p=>!p.recoveryPaused));
 t.s.treasury.cash=50000;Object.assign(t.s.urbanWorld.buildings[b.id],{stage:'unsafe',health:50});t.s.urbanWorld.fires.push({id:'BURNING',buildingId:b.id,containedAt:null,detected:false,intensity:18,teamIds:[],waterUsed:0,startedAt:t.s.simulationAgeSeconds,lastAt:t.s.simulationAgeSeconds,spreadAttemptAt:1e12});
 t.step();assert.ok(t.s.urbanWorld.projects.filter(p=>p.kind==='new').every(p=>!p.recoveryPaused));
});

test('one requested restoration leaves active repairs and their escrow unchanged and does not heal future fires',()=>{
 const t=fixture(),b=t.home,owner=t.s.flies[0];
 t.s.housing.households.HH={id:'HH',unitId:b.id,members:[owner.id]};Object.assign(owner,{householdId:'HH',housingUnitId:b.id,displacedFrom:{buildingId:b.id}});
 t.s.urbanWorld.buildings[b.id]={...b,originalHeight:b.h,stage:'damaged',health:30,progress:1,lastDamageAt:120};
 const p=t.urban.submitProject(b.id);assert.ok(p);
 p.spent=30;p.targetHeight=b.h+50;t.s.businesses['civic-escrow'].cash-=30;t.s.businesses['civic-materials'].cash+=30;
 t.s.urbanWorld.buildings['CIVIC-UNFINISHED']={id:'CIVIC-UNFINISHED',x:850,z:300,w:10,d:12,h:18,kind:'civic',stage:'cleared',health:100,progress:0};
 delete t.s.urbanWorld.ownerRestoration;
 const before=owner.money+owner.savings,treasury=t.s.treasury.cash,total=supply(t.s);t.restore();
 const restoredOwner=t.s.flies.find(f=>f.id===owner.id),saved=t.s.urbanWorld.projects.find(q=>q.id===p.id);
 assert.equal(saved.stage,p.stage);assert.equal(Number(saved.refunded||0),0);assert.equal(restoredOwner.money+restoredOwner.savings,before);assert.equal(t.s.treasury.cash,treasury);
 assert.equal(t.s.urbanWorld.buildings[b.id].h,b.h);assert.equal(t.s.urbanWorld.buildings[b.id].health,30);assert.ok(restoredOwner.displacedFrom);
 assert.equal(t.s.urbanWorld.buildings['CIVIC-UNFINISHED'].stage,'cleared');assert.ok(Math.abs(supply(t.s)-total)<1e-6);
 const balance=restoredOwner.money+restoredOwner.savings;t.restore();assert.equal(t.s.flies.find(f=>f.id===owner.id).money+t.s.flies.find(f=>f.id===owner.id).savings,balance);
 for(const f of t.s.flies)f.sleeping=true;
 const fire=t.urban.ignite(b.id);assert.ok(fire);t.step();assert.ok(t.s.urbanWorld.buildings[b.id].health<100);
 t.restore();assert.ok(t.s.urbanWorld.buildings[b.id].health<100,'a future fire is not healed by restoring a checkpoint');
});

test('all burned homes receive paid national contracts within one game day even when the active site pool is full',()=>{
 const t=fixture(),houses=BUILDINGS.filter(b=>b.kind==='house'&&b.x<360&&b.z>-500).slice(0,28);
 assert.equal(houses.length,28);const ready=t.s.simulationAgeSeconds;
 for(const b of houses)t.s.urbanWorld.buildings[b.id]={...b,stage:'collapsed',health:0,progress:0,lastDamageAt:ready,recoveryReadyAt:ready};
 const total=supply(t.s),cash=t.s.treasury.cash;
 t.step(600);
 const repairs=t.s.urbanWorld.projects.filter(p=>houses.some(b=>b.id===p.buildingId));
 assert.equal(repairs.length,28,'every home has an accepted contract instead of being excluded by the site cap');
 assert.equal(repairs.filter(p=>p.stage!=='queued').length,24,'emergency recovery spreads crews across twenty-four Hansdrex sites');
 assert.equal(repairs.filter(p=>p.stage==='queued').length,4);
 for(const p of repairs){
  assert.equal(p.funding.accountId,'treasury');assert.equal(p.contractorId,'national-reconstruction:hansdrex');
  assert.ok(p.acceptedAt<=p.deadlineAt);assert.equal(p.deadlineAt,ready+86400);
  assert.equal(t.s.urbanWorld.buildings[p.buildingId].recovery.projectId,p.id);
 }
 assert.equal(t.s.treasury.cash,cash-repairs.reduce((n,p)=>n+p.budget,0));
 assert.ok(Math.abs(supply(t.s)-total)<1e-6,'all accepted contracts reserve real funds in escrow');
 t.restore();
 assert.equal(t.s.urbanWorld.projects.filter(p=>p.stage==='queued').length,4);
 assert.equal(t.s.urbanWorld.projects.filter(p=>p.kind!=='new').length,28,'cold restore does not duplicate accepted repairs');
 t.step();assert.ok(t.s.flies.some(f=>f.urbanTask?.type==='build'),'healthy real residents receive worksite duties');
 assert.ok(t.s.flies.filter(f=>f.urbanTask?.type==='build').length<=100);
});

test('the oldest accepted repair leaves the queue when a physical site completes and a later request cannot jump it',()=>{
 const t=fixture(),houses=BUILDINGS.filter(b=>b.kind==='house'&&b.x<360&&b.z>-500).slice(0,26);
 for(const [i,b]of houses.entries())t.s.urbanWorld.buildings[b.id]={...b,stage:'collapsed',health:0,progress:0,lastDamageAt:t.s.simulationAgeSeconds+i};
 t.step();const active=t.s.urbanWorld.projects.filter(p=>p.stage!=='queued'),queued=t.s.urbanWorld.projects.filter(p=>p.stage==='queued');
 assert.equal(queued.length,2);const oldest=queued.sort((a,b)=>a.deadlineAt-b.deadlineAt)[0];
 // The site has already finished its real delivery/labor; only inspection is due.
 const finished=active[0];Object.assign(finished,{stage:'inspection',inspectionAt:t.s.simulationAgeSeconds,progress:1,materialsOrdered:finished.materialsRequired,materialsDelivered:finished.materialsRequired,materialsUsed:finished.materialsRequired});
 t.step();assert.equal(finished.stage,'complete');
 t.step();assert.notEqual(oldest.stage,'queued');assert.ok(oldest.workStartedAt>=oldest.acceptedAt);assert.equal(t.s.urbanWorld.projects.filter(p=>p.stage==='queued').length,1);
 assert.equal(t.s.urbanWorld.projects.filter(p=>!['queued','complete','cancelled'].includes(p.stage)).length,24);
});

test('queue acceptance never rebuilds an active fire or borrows another countrys repair budget',()=>{
 const t=fixture(),b=BUILDINGS.find(b=>b.id==='north-school');
 t.s.urbanWorld.buildings[b.id]={...b,stage:'collapsed',health:0,progress:0,lastDamageAt:t.s.simulationAgeSeconds};
 t.s.businesses['treasury:north-city']={cash:0};const hans=t.s.treasury.cash;
 t.step();assert.equal(t.s.urbanWorld.projects.filter(p=>p.buildingId===b.id).length,0);assert.equal(t.s.treasury.cash,hans);
 t.s.businesses['treasury:north-city'].cash=50000;t.s.urbanWorld.buildings[b.id].recovery.nextFundingCheckAt=0;
 t.s.urbanWorld.fires.push({id:'NORTH-ACTIVE-FIRE',buildingId:b.id,startedAt:t.s.simulationAgeSeconds,intensity:100,detected:true,teamIds:[],waterUsed:0,spreadAttemptAt:1e12});
 // An explicit request while the fire is active is rejected before any escrow transfer.
 assert.equal(t.urban.submitProject(b.id),null);assert.equal(t.s.businesses['treasury:north-city'].cash,50000);assert.equal(t.s.treasury.cash,hans);
});

test('hungry uncommitted builders report to a real funded canteen before joining the site instead of remaining permanently ineligible',()=>{
 const t=fixture(),b=t.home;
 for(const f of t.s.flies)f.hunger=100;
 t.s.businesses.market={cash:0,inventory:12,sector:'food'};
 t.s.urbanWorld.buildings[b.id]={...b,stage:'collapsed',health:0,progress:0,lastDamageAt:t.s.simulationAgeSeconds};
 const total=supply(t.s);t.step();t.step();
 const p=t.s.urbanWorld.projects.find(p=>p.buildingId===b.id);
 assert.ok(p.workerIds.length>0,'hunger alone cannot prevent reporting for an actual paid meal');
 const worker=t.s.flies.find(f=>f.id===p.workerIds[0]);
 assert.equal(worker.urbanTask.phase,'canteen');assert.equal(worker.currentLocationId,'construction');assert.equal(worker.hunger,100);assert.equal(t.s.businesses.market.inventory,12,'assignment itself does not conjure or consume food');
 const workers=p.workerIds.length;t.step();
 assert.equal(worker.hunger,40);assert.equal(worker.lastDutyMeal.countryId,'hansdrex');assert.equal(worker.lastDutyMeal.price,4);
 assert.equal(t.s.businesses.market.inventory,12-workers);assert.equal(t.s.businesses.market.cash,workers*4);
 assert.notEqual(worker.urbanTask.phase,'canteen');assert.equal(worker.urbanTask.targetId,`CIVIC-SITE-${p.id}`);
 assert.ok(Math.abs(supply(t.s)-total)<1e-6);
});

test('an empty canteen keeps its workers waiting without clearing hunger or progressing the building; paid stock arriving later releases the same crew',()=>{
 const t=fixture(),b=t.home;for(const f of t.s.flies)f.hunger=100;
 t.s.businesses.market={cash:0,inventory:0,sector:'food'};
 t.s.urbanWorld.buildings[b.id]={...b,stage:'collapsed',health:0,progress:0,lastDamageAt:t.s.simulationAgeSeconds};
 t.step();t.step();const p=t.s.urbanWorld.projects.find(p=>p.buildingId===b.id),workerId=p.workerIds[0];
 t.step();assert.equal(p.progress,0);assert.equal(p.clearance||0,0);assert.equal(t.s.flies.find(f=>f.id===workerId).hunger,100);
 assert.equal(t.s.flies.find(f=>f.id===workerId).urbanTask.phase,'canteen');
 t.restore();const saved=t.s.urbanWorld.projects.find(q=>q.id===p.id),worker=t.s.flies.find(f=>f.id===workerId);
 t.s.businesses.market.inventory=12;t.step();
 assert.equal(worker.hunger,40);assert.ok(saved.workerIds.includes(workerId));assert.notEqual(worker.urbanTask.phase,'canteen');
});

test('a fire deadline starts at ignition and a fresh disaster gets an arriving crew despite an old full work pool',()=>{
 const t=fixture(),old=BUILDINGS.filter(b=>b.kind==='house'&&b.x<360&&b.z>-500&&b.id!==t.home.id).slice(0,24);
 for(const b of old)t.s.urbanWorld.buildings[b.id]={...b,stage:'collapsed',health:0,progress:0,recoveryReadyAt:t.s.simulationAgeSeconds};
 t.step();assert.equal(t.s.urbanWorld.projects.filter(p=>p.stage!=='queued').length,24);
 t.s.simulationAgeSeconds+=2*86400;
 const fire=t.urban.ignite(t.home.id);assert.ok(fire);
 const deadline=fire.startedAt+86400;
 assert.equal(t.s.urbanWorld.buildings[t.home.id].recoveryDeadlineAt,deadline);
 t.s.simulationAgeSeconds+=6*3600;fire.intensity=0;
 t.step();const p=t.s.urbanWorld.projects.find(p=>p.buildingId===t.home.id);
 assert.ok(p);assert.equal(p.requestedAt,fire.startedAt);assert.equal(p.deadlineAt,deadline);
 assert.equal(p.crewArrivedAt,undefined,'accepting a contract is not counted as crew arrival');
 t.step();assert.notEqual(p.stage,'queued');assert.ok(p.workerIds.length>0);
 assert.ok(p.crewAssignedAt<=deadline);assert.ok(p.crewArrivedAt<=deadline);
 assert.ok(p.workerIds.some(id=>t.s.flies.find(f=>f.id===id)?.currentLocationId===`CIVIC-SITE-${p.id}`||p.courierId===id&&p.materialsOrdered>0),'an arrived worker either stays on site or has actually collected its funded material invoice');
 assert.equal(t.s.urbanWorld.projects.filter(p=>!['queued','complete','cancelled'].includes(p.stage)).length,24);
 t.restore();const restored=t.s.urbanWorld.projects.find(q=>q.id===p.id);
 assert.equal(restored.deadlineAt,deadline);assert.equal(restored.crewArrivedAt,p.crewArrivedAt);
});

test('reconstruction releases orchard employees even between shifts so recovery does not shut down its own food supply',()=>{
 const t=fixture(),grower=t.s.flies[0],b=t.home;
 t.s.urbanWorld.buildings[b.id]={...b,stage:'collapsed',health:0,progress:0,recoveryReadyAt:t.s.simulationAgeSeconds};
 const p=t.urban.submitProject(b.id);grower.fruitFarmDuty={farmId:'HANSDREX-FRUIT-FARM'};grower.jobId='hansdrex-fruit-grower';
 grower.urbanTask={type:'build',id:p.id,targetId:`CIVIC-SITE-${p.id}`,assignedAt:t.s.simulationAgeSeconds};p.workerIds=[grower.id];
 t.step();assert.equal(grower.urbanTask,null);assert.ok(!p.workerIds.includes(grower.id));assert.ok(p.workerIds.length>0);
 t.step();assert.equal(grower.urbanTask,null);assert.equal(grower.jobId,'hansdrex-fruit-grower');assert.ok(grower.fruitFarmDuty);
});
