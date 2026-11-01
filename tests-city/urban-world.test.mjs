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
