import test from 'node:test';import assert from 'node:assert/strict';
import {validDevelopmentLot,planAccessRoad,MIN_ALLEY} from '../worker/urban-roads.mjs';
import {createUrbanWorld} from '../worker/urban-world.mjs';
import {BUILDINGS,LOCATIONS,ROADS,WORLD_HALF,applyUrbanGeometry,pedestrianRoute} from '../worker/city-map.mjs';
const bounds={minX:480,maxX:WORLD_HALF-20,minZ:-WORLD_HALF+20,maxZ:450};
const lot={id:'CIVIC-1000-0',x:1000,z:0,w:12,d:14,h:24};
const base={bounds,roads:[{x:860,z:0,w:9.5,d:480}],buildings:[],water:[],parks:[],reserved:[],underpasses:[]};

test('development keeps real alleys and never treats water, parks or another reserved site as free grass',()=>{
 assert.equal(MIN_ALLEY,3);assert.equal(validDevelopmentLot(lot,base),true);
 assert.equal(validDevelopmentLot(lot,{...base,buildings:[{...lot,id:'neighbor',x:lot.x+lot.w+2}]}),false);
 assert.equal(validDevelopmentLot(lot,{...base,buildings:[{...lot,id:'neighbor',x:lot.x+lot.w+3.2}]}),true);
 for(const key of ['water','parks','reserved'])assert.equal(validDevelopmentLot(lot,{...base,[key]:[{...lot}]}),false,key);
 assert.equal(validDevelopmentLot({...lot,x:WORLD_HALF},base),false);
});
test('access roads connect an arbitrary valid property to the existing network and reject an unbridged river crossing',()=>{
 const p=planAccessRoad(lot,base);assert.ok(p?.roads.length);assert.ok(p.length>100);
 assert.ok(p.roads.some(r=>Math.abs(r.x-r.w/2-860)<.01));
 const water=[{x:930,z:0,w:20,d:WORLD_HALF*2}];assert.equal(planAccessRoad(lot,{...base,water}),null);
 const underpasses=[{x:930,z:0,w:30,halfLength:500}];assert.equal(planAccessRoad(lot,{...base,underpasses}),null);
});
function setup(){
 applyUrbanGeometry();let state={simulationAgeSeconds:0,flies:[],businesses:{},housing:{households:{},apartmentBlocks:[]},treasury:{cash:50000},totalTransactions:0,weather:{precipitation:0,wind:0},enterprises:{},utilities:{powerPlant:{gridOnline:true}}};
 for(let i=0;i<6;i++)state.flies.push({id:`BUILD-${i}`,alive:true,ageYears:30,health:100,energy:90,hunger:10,money:30000,savings:30000,traits:{empathy:.8},brain:{},x:860,z:0,y:1.1,traveling:false,indoors:false});
 const events=[],hooks={world:()=>state,random:()=>.5,emit:(type,text,payload)=>events.push({type,...payload}),remember:()=>{},startJourney:(f,chosen)=>{const dest=LOCATIONS.find(l=>l.id===chosen.id);f.targetLocationId=chosen.id;f.traveling=true;f.action=chosen.action;f.routeWaypoints=pedestrianRoute(f,dest);},moveFly:f=>{if(f.traveling){const d=LOCATIONS.find(l=>l.id===f.targetLocationId);Object.assign(f,{x:d.x,z:d.z,traveling:false,currentLocationId:d.id});}},needsAndActivities:()=>{},payAndFinance:()=>{}};
 let urban=createUrbanWorld(hooks);urban.init();state.urbanWorld.nextFireAt=state.urbanWorld.nextGrowthAt=1e12;
 return {get s(){return state;},get urban(){return urban;},events,restore(){state=JSON.parse(JSON.stringify(state));urban=createUrbanWorld(hooks);urban.init();},step(dt=600){state.simulationAgeSeconds+=dt;urban.tick(dt,{hour:12});},onsite(p){for(const id of p.workerIds){const f=state.flies.find(v=>v.id===id),target=LOCATIONS.find(l=>l.id===f.urbanTask.targetId);Object.assign(f,{x:target.x,z:target.z,currentLocationId:target.id,traveling:false});}}};
}
const supply=s=>s.treasury.cash+s.flies.reduce((n,f)=>n+f.money+f.savings,0)+Object.values(s.businesses).reduce((n,b)=>n+b.cash,0);

test('a funded road is delivered, built by onsite crews and opened before its property completes, including restart',()=>{
 const t=setup(),initial=supply(t.s),p=t.urban.develop(lot,t.s.flies[0].id);assert.ok(p);assert.ok(p.roadIds.length);const roadId=p.roadIds[0];assert.ok(!ROADS.some(r=>r.id===roadId));assert.ok(Math.abs(supply(t.s)-initial)<1e-6);
 for(const f of t.s.flies)f.sleeping=true;t.step();assert.equal(p.roadProgress,0);assert.equal(p.materialsOrdered,0);
 for(const f of t.s.flies)f.sleeping=false;t.step();t.onsite(p);t.step();assert.ok(p.materialsOrdered>0);const invoice=t.s.businesses['civic-materials'].cash;t.restore();let saved=t.s.urbanWorld.projects.find(v=>v.id===p.id),courier=t.s.flies.find(f=>f.id===saved.courierId);
 t.urban.handleResident(courier,{hour:12});t.urban.handleResident(courier,{hour:12});t.step(1800);t.urban.handleResident(courier,{hour:12});assert.equal(saved.materialsDelivered,saved.materialsRequired);assert.equal(t.s.businesses['civic-materials'].cash,invoice);t.onsite(saved);
 let sawRoadOpen=false;for(let i=0;i<150&&saved.stage!=='complete';i++){for(const f of t.s.flies)if(f.urbanTask)t.urban.handleResident(f,{hour:12});t.step();if(saved.roadProgress>=1){sawRoadOpen=true;assert.ok(ROADS.some(r=>r.id===roadId));}}
 assert.ok(sawRoadOpen);assert.equal(saved.stage,'complete');assert.ok(t.events.some(e=>e.type==='access_road_opened'));assert.ok(Math.abs(supply(t.s)-initial)<1e-6);assert.ok(saved.materialsUsed<=saved.materialsDelivered+.001);
 const completed=t.s.urbanWorld.completedRoads,refund=saved.refunded;t.restore();t.step();assert.equal(t.s.urbanWorld.completedRoads,completed);assert.equal(t.s.urbanWorld.projects.find(v=>v.id===p.id).refunded,refund);assert.equal(ROADS.filter(r=>r.id===roadId).length,1);assert.ok(Math.abs(supply(t.s)-initial)<1e-6);
});
test('development beyond the original district has no eight-building cap, but still requires capital and network access',()=>{
 const t=setup();for(let i=0;i<9;i++)t.s.urbanWorld.buildings[`CIVIC-HIST-${i}`]={id:`CIVIC-HIST-${i}`,x:1040,z:-700+i*30,w:10,d:12,h:18,health:100,stage:'operational',progress:1,kind:'civic'};
 t.urban.init();assert.ok(t.urban.develop(lot,t.s.flies[0].id));assert.ok(Object.keys(t.s.urbanWorld.buildings).length>9);
 const other={...lot,id:'CIVIC-1000-80',z:80},poor=t.s.flies[1];poor.money=poor.savings=0;const cash=supply(t.s),roads=t.s.urbanWorld.roads.length;assert.equal(t.urban.develop(other,poor.id),null);assert.ok(!t.s.urbanWorld.buildings[other.id]);assert.equal(t.s.urbanWorld.roads.length,roads);assert.equal(supply(t.s),cash);
});
