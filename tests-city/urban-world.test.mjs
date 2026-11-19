import test from 'node:test';import assert from 'node:assert/strict';
import {createUrbanWorld} from '../worker/urban-world.mjs';
import {BUILDINGS,LOCATIONS,entrance,blocked,applyUrbanGeometry,pedestrianRoute} from '../worker/city-map.mjs';

function setup(){
 applyUrbanGeometry();
 const target=BUILDINGS.find(b=>b.kind==='house')||BUILDINGS.find(b=>b.kind==='block'),exit=entrance(target);
 let state={simulationAgeSeconds:0,flies:[],businesses:{},housing:{households:{},apartmentBlocks:[]},treasury:{cash:50000},totalTransactions:0,weather:{precipitation:0,wind:0},enterprises:{},utilities:{powerPlant:{gridOnline:true}}};
 for(let i=0;i<8;i++)state.flies.push({id:`TEST-${i}`,alive:true,ageYears:30,health:100,energy:90,hunger:10,money:1000,savings:5000,traits:{empathy:.8},brain:{},x:exit.x,z:exit.z,y:1.1,traveling:false,indoors:false});
 const events=[];const hooks={world:()=>state,random:()=>.5,emit:(type,text,payload)=>events.push({type,text,...payload}),remember:()=>{},startJourney:(f,chosen)=>{const dest=LOCATIONS.find(l=>l.id===chosen.id);f.routeWaypoints=pedestrianRoute(f,dest);f.targetLocationId=chosen.id;f.traveling=Boolean(f.routeWaypoints.length);f.action=chosen.action;},moveFly:f=>{if(f.traveling){const dest=LOCATIONS.find(l=>l.id===f.targetLocationId);f.x=dest.x;f.z=dest.z;f.traveling=false;f.currentLocationId=dest.id;}},needsAndActivities:()=>{},payAndFinance:()=>{}};
 let urban=createUrbanWorld(hooks);urban.init();
 const step=(dt=600)=>{state.simulationAgeSeconds+=dt;urban.tick(dt,{hour:12});};
 return {get s(){return state;},get urban(){return urban;},events,target,step,hooks,restore(){state=JSON.parse(JSON.stringify(state));urban=createUrbanWorld(hooks);urban.init();},onsite(p){for(const id of p.workerIds||p.teamIds){const f=state.flies.find(f=>f.id===id),l=LOCATIONS.find(l=>l.id===f.urbanTask.targetId);Object.assign(f,{x:l.x,z:l.z,currentLocationId:l.id,traveling:false});}}};
}
function supply(s){return s.treasury.cash+s.flies.reduce((t,f)=>t+f.money+f.savings,0)+Object.values(s.businesses).reduce((t,b)=>t+b.cash,0);}

test('a building fire evacuates occupants, persists damage, and paid firefighters need to reach it',()=>{
 const t=setup(),f=t.s.flies[0];t.s.housing.households.hh={id:'hh',unitId:t.target.id,members:[f.id]};Object.assign(f,{householdId:'hh',homeId:'home',homeX:t.target.x,homeZ:t.target.z,x:t.target.x,z:t.target.z,indoors:true,currentLocationId:'home'});
 const initial=supply(t.s),fire=t.urban.ignite(t.target.id);assert.ok(fire);assert.equal(f.indoors,false);assert.ok(f.displacedFrom);assert.equal(t.s.urbanWorld.buildings[t.target.id].stage,'unsafe');
 t.step();assert.ok(fire.detected);assert.ok(fire.teamIds.length>0);const intensity=fire.intensity;t.restore();assert.equal(t.s.urbanWorld.fires[0].intensity,intensity);assert.ok(t.s.urbanWorld.buildings[t.target.id].health<100);
 const restored=t.s.urbanWorld.fires[0];t.onsite(restored);for(let i=0;i<10&&!restored.containedAt;i++)t.step();assert.ok(restored.containedAt);assert.ok(t.events.some(e=>e.type==='fire_extinguished'));assert.ok(Math.abs(supply(t.s)-initial)<1e-7,'firefighter wages conserve cash');
});
test('a damaged building requires workers, a single paid physical delivery and labor before inspection',()=>{
 const t=setup(),id=t.target.id;t.s.urbanWorld.buildings[id]={...t.target,stage:'damaged',health:30,progress:1};applyUrbanGeometry({buildings:Object.values(t.s.urbanWorld.buildings)});
 const money=supply(t.s),p=t.urban.submitProject(id);assert.ok(p);assert.ok(Math.abs(supply(t.s)-money)<1e-7,'reserve stays in real escrow account');
 for(const f of t.s.flies)f.sleeping=true;t.step();assert.equal(p.progress,0);assert.equal(p.materialsOrdered,0);
 for(const f of t.s.flies)f.sleeping=false;t.step();assert.ok(p.workerIds.length);assert.equal(p.progress,0,'traveling workers cannot build');
 t.onsite(p);t.step();assert.equal(p.materialsOrdered,p.materialsRequired);assert.equal(p.materialsDelivered,0);const invoice=t.s.businesses['civic-materials'].cash;
 t.restore();const saved=t.s.urbanWorld.projects.find(v=>v.id===p.id);const courier=t.s.flies.find(f=>f.id===saved.courierId);
 t.urban.handleResident(courier,{hour:12});t.urban.handleResident(courier,{hour:12});t.step(1800);t.urban.handleResident(courier,{hour:12});assert.equal(saved.materialsDelivered,saved.materialsRequired);assert.equal(t.s.businesses['civic-materials'].cash,invoice,'no duplicate material invoice after restore');
 t.onsite(saved);for(let i=0;i<80&&saved.stage!=='complete';i++){for(const f of t.s.flies)if(f.urbanTask)t.urban.handleResident(f,{hour:12});t.step(600);}
 assert.equal(saved.stage,'complete');assert.equal(t.s.urbanWorld.buildings[id].stage,'operational');assert.ok(saved.materialsUsed<=saved.materialsDelivered+.001);assert.ok(t.s.urbanWorld.completedProjects>=1);assert.ok(Math.abs(supply(t.s)-money)<1e-6,'project conserves money');
 const once=t.s.urbanWorld.completedProjects,balances=supply(t.s);t.step();assert.equal(t.s.urbanWorld.completedProjects,once);assert.ok(Math.abs(supply(t.s)-balances)<1e-6);
});
test('collapse, clearing, construction and flood revisions update actual navigation geometry',()=>{
 const t=setup(),b=t.target;assert.equal(blocked(b),true);
 applyUrbanGeometry({buildings:[{...b,stage:'collapsed',health:0}]});assert.equal(blocked(b),true,'rubble stays impassable');
 applyUrbanGeometry({buildings:[{...b,stage:'cleared',health:0}]});assert.equal(blocked(b),false,'clearance opens the footprint');
 applyUrbanGeometry({buildings:[{...b,stage:'construction',progress:.2,health:30}]});assert.equal(blocked(b),true);
 applyUrbanGeometry({floods:[{id:'test-flood',x:310,z:0,w:8,d:30,depth:.7}]});assert.equal(blocked({x:310,z:0}),true);
 applyUrbanGeometry();assert.equal(blocked({x:310,z:0}),false);assert.equal(blocked(b),true);
});
test('autonomous growth validates a finite new lot and preserves it over restore',()=>{
 const t=setup();for(const f of t.s.flies){f.money=25000;f.savings=25000;}t.urban.grow();
 const p=t.s.urbanWorld.projects.find(v=>v.kind==='new');assert.ok(p,'expected at least one viable new lot');assert.ok(BUILDINGS.some(b=>b.id===p.buildingId));const before=Object.keys(t.s.urbanWorld.buildings);t.restore();assert.deepEqual(Object.keys(t.s.urbanWorld.buildings),before);assert.ok(BUILDINGS.some(b=>b.id===p.buildingId));
});
test('sustained rain floods low riverbank routes and recedes with dry weather',()=>{
 const t=setup();t.s.weather.precipitation=.95;t.s.urbanWorld.nextFireAt=1e12;t.s.urbanWorld.nextGrowthAt=1e12;
 for(let i=0;i<20;i++)t.step(600);assert.equal(t.s.urbanWorld.floods.length,2);assert.equal(blocked({x:368,z:100}),true);
 t.s.weather.precipitation=0;for(let i=0;i<20;i++)t.step(600);assert.equal(t.s.urbanWorld.floods.length,0);
});

test('a lone worker can complete a funded minor repair without consuming a full crews hourly wage',()=>{
 const t=setup();t.s.flies=t.s.flies.slice(0,1);t.urban.init();const id=t.target.id;t.s.urbanWorld.nextFireAt=1e12;t.s.urbanWorld.nextGrowthAt=1e12;
 t.s.urbanWorld.buildings[id]={...t.target,stage:'damaged',health:99,progress:1};applyUrbanGeometry({buildings:Object.values(t.s.urbanWorld.buildings)});
 const initial=supply(t.s),p=t.urban.submitProject(id);assert.ok(p);t.step();t.onsite(p);t.step();
 const worker=t.s.flies[0];t.urban.handleResident(worker,{hour:12});t.urban.handleResident(worker,{hour:12});t.step(1800);t.urban.handleResident(worker,{hour:12});assert.equal(p.materialsDelivered,p.materialsRequired);t.onsite(p);
 for(let i=0;i<100&&p.stage!=='complete';i++){t.urban.handleResident(worker,{hour:12});t.step(600);}
 assert.equal(p.stage,'complete');assert.ok(p.spent<=p.budget+1e-6);assert.ok(Math.abs(supply(t.s)-initial)<1e-6);
});

test('active visitors evacuate burning buildings and flood closures preserve committed taxi routes',()=>{
 const t=setup(),b=t.target,visitor={id:'VIS-TEST',alive:true,kind:'visitor',ageYears:30,health:95,stress:5,x:b.x,z:b.z,y:1.1,indoors:true,currentLocationId:b.id,traveling:false,brain:{}};t.s.cityVisitors={visitors:[visitor]};
 t.urban.ignite(b.id);assert.equal(visitor.indoors,false);assert.equal(visitor.health,93);assert.ok(Math.hypot(visitor.x-b.x,visitor.z-b.z)>1);
 const taxi=t.s.flies[0];Object.assign(taxi,{x:368,z:100,y:1.1,traveling:true,cityService:'TAXI-FLOOD',routeWaypoints:[{x:368,z:150,mode:'car'}]});
 const airborne=t.s.flies[1];Object.assign(airborne,{x:368,z:100,y:300,onPrivateHelicopter:true});const airborneHealth=airborne.health;
 t.s.weather.precipitation=.95;t.s.urbanWorld.nextFireAt=1e12;t.s.urbanWorld.nextGrowthAt=1e12;
 for(let i=0;i<20;i++)t.step(600);assert.equal(t.s.urbanWorld.floods.length,2);assert.equal(taxi.traveling,true);assert.equal(taxi.routeWaypoints.length,1);assert.equal(airborne.health,airborneHealth);
});

test('confirmed sidewalk arrival counts even when it is offset from the staging pin',()=>{
 const t=setup(),id=t.target.id;t.s.urbanWorld.buildings[id]={...t.target,stage:'damaged',health:35,progress:1};
 const p=t.urban.submitProject(id);t.step();t.onsite(p);
 const site=LOCATIONS.find(l=>l.id===t.s.flies.find(f=>f.id===p.workerIds[0]).urbanTask.targetId);
 for(const f of t.s.flies.filter(f=>p.workerIds.includes(f.id))){f.x=site.x+25;f.z=site.z;}
 t.step();assert.ok(p.materialsOrdered>0,'reported arrival must unlock the construction supply order');
});

test('a burned home is automatically rebuilt with state funds even when its household is poor, preserving its original home across restart',()=>{
 const t=setup(),b=t.target,[a,c]=t.s.flies,now=t.s.urbanWorld;
 now.nextFireAt=now.nextGrowthAt=now.development.nextReviewAt=1e12;
 now.buildings[b.id]={...b,stage:'collapsed',health:0,progress:0};
 t.s.housing.households.hh={id:'hh',unitId:b.id,members:[a.id,c.id],homeX:b.x,homeZ:b.z};
 for(const f of [a,c])Object.assign(f,{householdId:'hh',housingUnitId:b.id,money:20,savings:0,displacedFrom:{buildingId:b.id}});
 const before=t.s.treasury.cash,funds=supply(t.s),balances=a.money+c.money+a.savings+c.savings;
 t.step();let p=t.s.urbanWorld.projects[0];assert.ok(p);assert.equal(p.kind,'rebuild');assert.equal(p.stage,'clearance');assert.equal(p.funding.type,'public');assert.equal(p.funding.accountId,'treasury');
 assert.equal(a.money+c.money+a.savings+c.savings,balances);assert.equal(t.s.treasury.cash,before-p.budget);
 const id=p.id;t.restore();p=t.s.urbanWorld.projects.find(v=>v.id===id);
 t.step();t.onsite(p);for(let i=0;i<60&&p.stage==='clearance';i++)t.step(1200);
 assert.equal(p.stage,'delivery');
 for(let i=0;i<150&&p.stage!=='complete';i++){for(const f of t.s.flies)if(f.urbanTask)t.urban.handleResident(f,{hour:12});t.step(1800);}
 assert.equal(p.stage,'complete');assert.equal(t.s.urbanWorld.buildings[b.id].stage,'operational');assert.equal(t.s.housing.households.hh.unitId,b.id);assert.equal(t.s.urbanWorld.buildings[b.id].h,b.h);
 assert.ok(p.refunded>0);assert.equal(t.s.flies.filter(f=>f.housingUnitId===b.id).every(f=>!f.displacedFrom),true);
 assert.equal(t.events.filter(e=>e.type==='construction_contract'&&e.buildingId===b.id).length,1);assert.equal(t.s.treasury.cash,before-p.budget+p.refunded);assert.ok(Math.abs(supply(t.s)-funds)<1e-6);
});

test('a war damaged North building uses only its country treasury and still needs real delivery, labor and inspection',()=>{
 const t=setup(),b=BUILDINGS.find(b=>b.id==='north-school');t.s.businesses['treasury:north-city']={cash:30000};
 t.s.businesses['north-civic-materials']={cash:0,inventory:250};
 for(const f of t.s.flies)Object.assign(f,{x:130,z:-907,citizenshipCountryId:'north-city'});t.s.urbanWorld.nextFireAt=t.s.urbanWorld.nextGrowthAt=t.s.urbanWorld.development.nextReviewAt=1e12;
 const damage={buildingId:b.id,projectileId:'WAR-REPAIR-1',damage:48,fire:false,countryId:'north-city',fundingAccountId:'treasury:north-city',conflictId:'WAR-1'},hans=t.s.treasury.cash,funds=supply(t.s);
 assert.equal(t.urban.applyWarDamage(damage),true);assert.equal(t.urban.applyWarDamage(damage),false);assert.equal(t.s.urbanWorld.buildings[b.id].health,52);
 const north=t.s.businesses['treasury:north-city'].cash,p=t.urban.fundWarRepair(b.id);assert.ok(p);assert.equal(p.funding.accountId,'treasury:north-city');assert.equal(t.s.businesses['treasury:north-city'].cash,north-p.budget);assert.equal(t.s.treasury.cash,hans);assert.equal(p.progress,0);
 for(const f of t.s.flies)f.sleeping=true;t.step();assert.equal(p.materialsOrdered,0);assert.equal(p.progress,0);
 for(const f of t.s.flies)f.sleeping=false;t.step();t.onsite(p);t.step();assert.equal(p.materialsDelivered,0);assert.equal(p.progress,0);assert.ok(p.materialsOrdered>0);
 const id=p.id;t.restore();const saved=t.s.urbanWorld.projects.find(p=>p.id===id);
 for(let i=0;i<160&&saved.stage!=='inspection';i++){for(const f of t.s.flies)if(f.urbanTask)t.urban.handleResident(f,{hour:12});t.step(600);}
 assert.equal(saved.stage,'inspection');assert.equal(t.s.urbanWorld.buildings[b.id].stage,'construction');assert.equal(t.s.urbanWorld.buildings[b.id].warRecovery.active,true);assert.equal(saved.materialsDelivered,saved.materialsRequired);assert.ok(saved.materialsUsed>0);
 t.step(600);assert.equal(saved.stage,'complete');assert.equal(t.s.urbanWorld.buildings[b.id].stage,'operational');assert.equal(t.s.urbanWorld.buildings[b.id].warRecovery.active,false);assert.equal(t.s.treasury.cash,hans);assert.ok(Math.abs(supply(t.s)-funds)<1e-6);assert.equal(t.events.filter(e=>e.type==='construction_contract'&&e.buildingId===b.id).length,1);
});

test('ordinary North disaster repairs wait for their own treasury and never take household or Hans money',()=>{
 const t=setup(),b=BUILDINGS.find(b=>b.id==='north-school'),f=t.s.flies[0];
 t.s.businesses['treasury:north-city']={cash:0};t.s.urbanWorld.buildings[b.id]={...b,stage:'collapsed',health:0,progress:0};
 const hans=t.s.treasury.cash,wallet=f.money+f.savings;
 assert.equal(t.urban.submitProject(b.id),null);assert.equal(t.s.urbanWorld.buildings[b.id].recovery.status,'awaiting national funds');
 assert.equal(t.s.treasury.cash,hans);assert.equal(f.money+f.savings,wallet);
 t.s.businesses['treasury:north-city'].cash=30000;
 const p=t.urban.submitProject(b.id);assert.ok(p);assert.equal(p.funding.accountId,'treasury:north-city');assert.equal(t.s.treasury.cash,hans);assert.equal(f.money+f.savings,wallet);
});

test('a hundred real workers join paid reconstruction duties without taking protected staff or exceeding the target',()=>{
 const t=setup(),base=t.s.flies[0],houses=BUILDINGS.filter(b=>b.kind==='house'&&b.x<360&&b.z>-500).slice(0,8);
 assert.equal(houses.length,8);
 t.s.flies=Array.from({length:150},(_,i)=>({...structuredClone(base),id:'CREW-'+i,jobId:i<12?'doctor':undefined}));
 t.s.urbanWorld.nextFireAt=t.s.urbanWorld.nextGrowthAt=t.s.urbanWorld.development.nextReviewAt=1e12;
 for(const b of houses)t.s.urbanWorld.buildings[b.id]={...b,health:0,progress:0,stage:'collapsed'};
 t.step();for(let i=0;i<5;i++)t.step();
 const view=t.urban.snapshot(),assigned=t.s.flies.filter(f=>f.urbanTask?.type==='build');
 assert.equal(view.workforce.target,100);assert.equal(assigned.length,100);assert.equal(new Set(assigned.map(f=>f.id)).size,100);
 assert.equal(view.workforce.assigned,100);assert.ok(assigned.every(f=>f.jobId!=='doctor'));
 for(const p of t.s.urbanWorld.projects)t.onsite(p);
 t.step();assert.ok(t.urban.snapshot().workforce.onsite>=80,'workers must physically reach the sites rather than only incrementing a display counter');
 assert.ok(t.s.flies.slice(0,12).every(f=>!f.urbanTask));assert.ok(t.s.urbanWorld.projects.every(p=>p.funding.accountId==='treasury'));
});

test('existing private repair escrow is refunded and replaced by national money without duplicating materials or contracts',()=>{
 const t=setup(),b=t.target,f=t.s.flies[0];t.s.urbanWorld.nextFireAt=t.s.urbanWorld.nextGrowthAt=t.s.urbanWorld.development.nextReviewAt=1e12;
 t.s.urbanWorld.buildings[b.id]={...b,stage:'damaged',health:40,progress:1};
 const wallet=f.money,treasury=t.s.treasury.cash,p=t.urban.submitProject(b.id);assert.ok(p);
 // Reconstruct an old private contract that had reserved this same escrow.
 f.money-=p.budget;t.s.treasury.cash+=p.budget;p.ownerId=f.id;p.funding={type:'resident',contributions:[{residentId:f.id,amount:p.budget,cash:p.budget,savings:0}]};
 const funds=supply(t.s);t.step();
 assert.equal(p.funding.accountId,'treasury');assert.equal(f.money,wallet);assert.equal(t.s.treasury.cash,treasury-p.budget);
 assert.equal(p.materialsOrdered,0);assert.equal(t.s.urbanWorld.projects.filter(q=>q.buildingId===b.id).length,1);assert.ok(Math.abs(supply(t.s)-funds)<1e-6);
});

test('war home repair never charges its household and an unfunded country cannot borrow Hans recovery cash',()=>{
 const t=setup(),b=t.target,f=t.s.flies[0];t.s.housing.households.hh={id:'hh',unitId:b.id,members:[f.id]};f.housingUnitId=b.id;const wallet=f.money+f.savings;
 t.urban.applyWarDamage({buildingId:b.id,projectileId:'HOME-WAR',damage:40,fire:false,countryId:'hansdrex',fundingAccountId:'treasury'});const p=t.urban.fundWarRepair(b.id);assert.ok(p);assert.equal(p.funding.accountId,'treasury');assert.equal(f.money+f.savings,wallet);
 const north=BUILDINGS.find(b=>b.id==='north-school');t.s.businesses['treasury:north-city']={cash:0};const hans=t.s.treasury.cash;t.urban.applyWarDamage({buildingId:north.id,projectileId:'NO-NORTH-BUDGET',damage:48,fire:false,countryId:'north-city',fundingAccountId:'treasury:north-city'});assert.equal(t.urban.fundWarRepair(north.id),null);assert.equal(t.s.urbanWorld.buildings[north.id].recovery.status,'awaiting national funds');assert.equal(t.s.treasury.cash,hans);assert.equal(t.s.businesses['treasury:north-city'].cash,0);
});

test('damaged customs and North barracks receive matching country budgets even when Hans works are full',()=>{
 const t=setup(),north=t.s.businesses['treasury:north-city']={cash:30000};
 t.s.urbanWorld.nextFireAt=t.s.urbanWorld.nextGrowthAt=t.s.urbanWorld.development.nextReviewAt=1e12;
 const barracks=BUILDINGS.find(b=>b.id==='north-army'),northBooth=BUILDINGS.find(b=>b.id==='NORTH-CITY-BRIDGE-3-CUSTOMS-W'),hansBooth=BUILDINGS.find(b=>b.id==='NORTH-CITY-BRIDGE-3-CUSTOMS-E');
 for(const b of [barracks,northBooth,hansBooth])t.s.urbanWorld.buildings[b.id]={...b,health:4,stage:'collapsed'};
 const hansPlots=BUILDINGS.filter(b=>b.x>530&&b.z>0&&!['landmark','customs'].includes(b.kind)).slice(0,8);
 assert.equal(hansPlots.length,8);
 for(const b of hansPlots){t.s.urbanWorld.buildings[b.id]={...b,health:10,stage:'collapsed'};assert.ok(t.urban.submitProject(b.id));}
 const hans=t.s.treasury.cash,budget=north.cash;t.step();
 const projects=t.s.urbanWorld.projects.filter(p=>[barracks.id,northBooth.id].includes(p.buildingId));
 assert.equal(projects.length,2);
 assert.ok(projects.every(p=>p.funding.accountId==='treasury:north-city'));
 const hansRepair=t.s.urbanWorld.projects.find(p=>p.buildingId===hansBooth.id);
 assert.ok(hansRepair,'a full Hans work pool still accepts its own customs repair');assert.equal(hansRepair.stage,'queued');assert.equal(hansRepair.funding.accountId,'treasury');
 assert.equal(t.s.treasury.cash,hans-hansRepair.budget);
 assert.ok(north.cash<budget);
 assert.ok(t.s.businesses['north-civic-materials'].inventory>=projects[0].materialsRequired);
});


test('a repair reclaims a displaced optional itinerary without discarding the paid contract',()=>{
 const t=setup(),b=t.target;t.s.urbanWorld.nextFireAt=t.s.urbanWorld.nextGrowthAt=t.s.urbanWorld.development.nextReviewAt=1e12;
 t.s.urbanWorld.buildings[b.id]={...b,health:60,stage:'damaged',progress:1};
 const p=t.urban.submitProject(b.id);t.step();const f=t.s.flies.find(f=>f.id===p.workerIds[0]);
 const site=f.urbanTask.targetId;f.urbanTask.phase='onsite';const pin=LOCATIONS.find(l=>l.id===site);Object.assign(f,{x:pin.x+50,z:pin.z+50,targetLocationId:'park',traveling:true,pendingAction:'sheltering from bad weather'});
 t.urban.handleResident(f,{hour:12});
 assert.equal(f.urbanTask.id,p.id);assert.equal(f.targetLocationId,site);assert.ok(f.urbanTask.routeFailures>0);
});

test('a stale courier assignment is replaced and reserved materials are not invoiced twice',()=>{
 const t=setup(),b=t.target;t.s.urbanWorld.nextFireAt=t.s.urbanWorld.nextGrowthAt=t.s.urbanWorld.development.nextReviewAt=1e12;
 t.s.urbanWorld.buildings[b.id]={...b,health:60,stage:'damaged',progress:1};
 const p=t.urban.submitProject(b.id);t.step();t.onsite(p);t.step();const f=t.s.flies.find(f=>f.id===p.courierId);
 const invoice=t.s.businesses['civic-materials'].cash,quantity=p.materialsOrdered;
 f.urbanTask.phase='onsite';Object.assign(f,{traveling:false,currentLocationId:f.urbanTask.targetId});t.step();
 assert.ok(['collecting','delivering'].includes(t.s.flies.find(f=>f.id===p.courierId).urbanTask.phase));
 assert.equal(p.materialsOrdered,quantity);assert.equal(t.s.businesses['civic-materials'].cash,invoice);
});

test('an exhausted delivery worker leaves paid cargo at a real pickup and a replacement delivers it after restore',()=>{
 const t=setup(),b=t.target;t.s.urbanWorld.nextFireAt=t.s.urbanWorld.nextGrowthAt=t.s.urbanWorld.development.nextReviewAt=1e12;
 t.s.urbanWorld.buildings[b.id]={...b,health:60,stage:'damaged',progress:1};
 let p=t.urban.submitProject(b.id);t.step();t.onsite(p);t.step();let courier=t.s.flies.find(f=>f.id===p.courierId);
 t.urban.handleResident(courier,{hour:12});t.urban.handleResident(courier,{hour:12});
 assert.equal(courier.urbanTask.phase,'delivering');assert.equal(courier.urbanTask.materials,p.materialsOrdered);
 Object.assign(courier,{health:10,x:courier.x-15,z:courier.z-20});const drop={x:courier.x,z:courier.z},quantity=p.materialsOrdered,invoice=t.s.businesses['civic-materials'].cash;
 t.urban.handleResident(courier,{hour:12});assert.equal(courier.urbanTask,null);assert.equal(p.materialCache.quantity,quantity);
 t.restore();p=t.s.urbanWorld.projects.find(v=>v.id===p.id);const cache=LOCATIONS.find(l=>l.id===`CIVIC-CARGO-${p.id}`);assert.equal(cache.x,drop.x);assert.equal(cache.z,drop.z);
 t.step();t.onsite(p);t.step();courier=t.s.flies.find(f=>f.id===p.courierId);assert.equal(courier.targetLocationId,cache.id);
 t.urban.handleResident(courier,{hour:12});t.urban.handleResident(courier,{hour:12});t.step(1800);t.urban.handleResident(courier,{hour:12});
 assert.equal(p.materialsDelivered,quantity);assert.equal(p.materialCache,null);assert.equal(t.s.businesses['civic-materials'].cash,invoice);
});

test('recovery dispatch stays inside the country and uses builders before residents with unrelated jobs',()=>{
 const t=setup(),b=t.target;t.s.urbanWorld.nextFireAt=t.s.urbanWorld.nextGrowthAt=t.s.urbanWorld.development.nextReviewAt=1e12;
 t.s.urbanWorld.buildings[b.id]={...b,health:50,stage:'damaged',progress:1};
 const foreign=t.s.flies[0],builder=t.s.flies[7];Object.assign(foreign,{x:-600,z:-800});Object.assign(builder,{x:600,z:200,jobId:'construction'});
 for(const f of t.s.flies.slice(1,7))f.jobId='library';
 const p=t.urban.submitProject(b.id);t.step();assert.equal(p.workerIds[0],builder.id);assert.ok(!p.workerIds.includes(foreign.id));
});

test('inspection restores the original geometry and colors rather than a damaged or resized replacement',()=>{
 const t=setup(),b=t.target;t.s.urbanWorld.nextFireAt=t.s.urbanWorld.nextGrowthAt=t.s.urbanWorld.development.nextReviewAt=1e12;
 const expected={x:b.x,z:b.z,w:b.w,d:b.d,h:b.h,kind:b.kind};
 t.s.urbanWorld.buildings[b.id]={...b,health:55,stage:'damaged',progress:1};let p=t.urban.submitProject(b.id);t.step();t.onsite(p);t.step();
 const record=t.s.urbanWorld.buildings[b.id];assert.deepEqual(Object.fromEntries(Object.keys(expected).map(k=>[k,record.originalBlueprint[k]])),expected);
 // Damage history can include a stale construction height; the durable blueprint wins.
 record.h=3;record.w=4;record.d=4;p.targetHeight=3;
 for(const id of p.workerIds){const f=t.s.flies.find(f=>f.id===id);t.urban.handleResident(f,{hour:12});t.urban.handleResident(f,{hour:12});}
 t.step(1800);for(const f of t.s.flies)if(f.urbanTask)t.urban.handleResident(f,{hour:12});t.onsite(p);
 for(let i=0;i<100&&p.stage!=='complete';i++){for(const f of t.s.flies)if(f.urbanTask)t.urban.handleResident(f,{hour:12});t.step(600);}
 assert.equal(p.stage,'complete');assert.deepEqual(Object.fromEntries(Object.keys(expected).map(k=>[k,record[k]])),expected);assert.equal(record.health,100);
});

test('a custom building blueprint keeps its facade, roof colors and style across cold restore and final inspection',()=>{
 const t=setup();t.s.urbanWorld.nextFireAt=t.s.urbanWorld.nextGrowthAt=t.s.urbanWorld.development.nextReviewAt=1e12;
 const original={id:'CIVIC-CUSTOM-RESTORE',x:1000,z:120,w:18,d:16,h:36,kind:'civic',color:0x123456,roofColor:0x456789,facadeColor:0xabcdef,style:'paris',roofStyle:'mansard',seed:99};
 t.s.urbanWorld.buildings[original.id]={...original,stage:'damaged',health:45,progress:1};applyUrbanGeometry({buildings:Object.values(t.s.urbanWorld.buildings)});
 const p=t.urban.submitProject(original.id);assert.ok(p);t.restore();
 const project=t.s.urbanWorld.projects.find(v=>v.id===p.id),record=t.s.urbanWorld.buildings[original.id];
 Object.assign(record,{x:1004,z:122,w:8,d:8,h:5,color:0,roofColor:0,facadeColor:0,style:'damaged',roofStyle:'flat'});
 project.stage='inspection';project.inspectionAt=t.s.simulationAgeSeconds;t.step();
 for(const key of ['x','z','w','d','h','kind','color','roofColor','facadeColor','style','roofStyle','seed'])assert.equal(record[key],original[key],key);
 assert.equal(record.health,100);assert.equal(record.stage,'operational');
});
