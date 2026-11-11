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
 assert.equal(repair.kind,'rebuild');assert.equal(repair.funding.type,'household');
 for(const p of t.s.urbanWorld.projects.filter(p=>newIds.includes(p.id))){
  assert.equal(p.recoveryPaused,true);assert.equal(p.workerIds.length,0);assert.equal(p.materialsOrdered,20);assert.equal(p.materialsDelivered,0);assert.equal(p.spent,100);assert.equal(p.progress,.2);
 }
 assert.ok(t.s.flies.every(f=>!newIds.includes(f.urbanTask?.id)));
 t.restore();
 for(let i=0;i<300&&t.s.urbanWorld.projects.find(p=>p.id===repair.id).stage!=='complete';i++)t.step();
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

test('unfunded household damage and a fire still burning do not suspend all other work indefinitely',()=>{
 const t=fixture();fiveNewProjects(t);
 const owner=t.s.flies[0],b=t.home;t.s.housing.households.HH={id:'HH',unitId:b.id,members:[owner.id]};
 Object.assign(owner,{householdId:'HH',housingUnitId:b.id,money:0,savings:0});
 t.s.urbanWorld.buildings[b.id]={...b,stage:'collapsed',health:0,progress:0};
 t.step();assert.ok(t.s.urbanWorld.projects.filter(p=>p.kind==='new').every(p=>!p.recoveryPaused));
 owner.money=10000;Object.assign(t.s.urbanWorld.buildings[b.id],{stage:'unsafe',health:50});t.s.urbanWorld.fires.push({id:'BURNING',buildingId:b.id,containedAt:null,detected:false,intensity:18,teamIds:[],waterUsed:0,startedAt:t.s.simulationAgeSeconds,lastAt:t.s.simulationAgeSeconds,spreadAttemptAt:1e12});
 t.step();assert.ok(t.s.urbanWorld.projects.filter(p=>p.kind==='new').every(p=>!p.recoveryPaused));
});

test('one requested restoration refunds only unused escrow once, keeps new sites, and never auto-heals future fires',()=>{
 const t=fixture(),b=t.home,owner=t.s.flies[0];
 t.s.housing.households.HH={id:'HH',unitId:b.id,members:[owner.id]};Object.assign(owner,{householdId:'HH',housingUnitId:b.id,displacedFrom:{buildingId:b.id}});
 t.s.urbanWorld.buildings[b.id]={...b,originalHeight:b.h,stage:'damaged',health:30,progress:1,lastDamageAt:120};
 const p=t.urban.submitProject(b.id);assert.ok(p);
 p.spent=30;p.targetHeight=b.h+50;t.s.businesses['civic-escrow'].cash-=30;t.s.businesses['civic-materials'].cash+=30;
 t.s.urbanWorld.buildings['CIVIC-UNFINISHED']={id:'CIVIC-UNFINISHED',x:850,z:300,w:10,d:12,h:18,kind:'civic',stage:'cleared',health:100,progress:0};
 delete t.s.urbanWorld.ownerRestoration;
 const before=owner.money+owner.savings,total=supply(t.s);t.restore();
 const restoredOwner=t.s.flies.find(f=>f.id===owner.id),saved=t.s.urbanWorld.projects.find(q=>q.id===p.id);
 assert.equal(saved.stage,'complete');assert.equal(saved.refunded,p.budget-30);assert.equal(restoredOwner.money+restoredOwner.savings,before+p.budget-30);
 assert.equal(t.s.urbanWorld.buildings[b.id].h,b.h);assert.equal(t.s.urbanWorld.buildings[b.id].health,100);assert.equal(restoredOwner.displacedFrom,null);
 assert.equal(t.s.urbanWorld.buildings['CIVIC-UNFINISHED'].stage,'cleared');assert.ok(Math.abs(supply(t.s)-total)<1e-6);
 const balance=restoredOwner.money+restoredOwner.savings;t.restore();assert.equal(t.s.flies.find(f=>f.id===owner.id).money+t.s.flies.find(f=>f.id===owner.id).savings,balance);
 for(const f of t.s.flies)f.sleeping=true;
 const fire=t.urban.ignite(b.id);assert.ok(fire);t.step();assert.ok(t.s.urbanWorld.buildings[b.id].health<100);
 t.restore();assert.ok(t.s.urbanWorld.buildings[b.id].health<100,'a future fire is not healed by restoring a checkpoint');
});
