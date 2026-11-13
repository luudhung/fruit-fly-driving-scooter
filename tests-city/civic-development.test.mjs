import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrbanWorld} from '../worker/urban-world.mjs';
import {CIVIC_FACILITY_CATALOG,nationalDevelopmentDemand,civicServiceCapacity} from '../worker/civic-development.mjs';
import {BUILDINGS,LOCATIONS,applyUrbanGeometry,pedestrianRoute} from '../worker/city-map.mjs';

function setup(){
 applyUrbanGeometry();let state={simulationAgeSeconds:0,flies:[],businesses:{},housing:{households:{},apartmentBlocks:[]},treasury:{cash:50000},totalTransactions:0,weather:{precipitation:0,wind:0},enterprises:{},utilities:{powerPlant:{cash:60000,gridOnline:true,demand:0,installedCapacity:185}}};
 for(let i=0;i<8;i++)state.flies.push({id:`REAL-${i}`,alive:true,ageYears:30,health:100,energy:90,hunger:10,money:30000,savings:30000,traits:{empathy:.8,ambition:.8},professionSkills:{medicine:.8,electrical:.8,teaching:.8},brain:{identity:`brain-${i}`},jobId:null,x:860,z:0,y:1.1,traveling:false,indoors:false});
 const events=[],hooks={world:()=>state,random:()=>.5,emit:(type,text,payload)=>events.push({type,...payload}),remember:()=>{},startJourney:(f,chosen)=>{const dest=LOCATIONS.find(l=>l.id===chosen.id);f.targetLocationId=chosen.id;f.traveling=true;f.action=chosen.action;f.routeWaypoints=dest?pedestrianRoute(f,dest):[];},moveFly:f=>{if(f.traveling){const d=LOCATIONS.find(l=>l.id===f.targetLocationId);if(d)Object.assign(f,{x:d.x,z:d.z,traveling:false,currentLocationId:d.id});}},needsAndActivities:()=>{},payAndFinance:()=>{}};
 let urban=createUrbanWorld(hooks);urban.init();state.urbanWorld.nextFireAt=state.urbanWorld.nextGrowthAt=state.urbanWorld.development.nextReviewAt=1e12;
 return {get s(){return state;},get urban(){return urban;},events,restore(){state=JSON.parse(JSON.stringify(state));urban=createUrbanWorld(hooks);urban.init();},step(dt=600,clock={hour:12}){state.simulationAgeSeconds+=dt;urban.tick(dt,clock);},onsite(p){for(const id of p.workerIds){const f=state.flies.find(v=>v.id===id),target=LOCATIONS.find(l=>l.id===f.urbanTask.targetId);Object.assign(f,{x:target.x,z:target.z,currentLocationId:target.id,traveling:false});}},finish(p){for(let i=0;i<180&&p.stage!=='complete';i++){for(const f of state.flies)if(f.urbanTask)urban.handleResident(f,{hour:12});this.step(1800);}}};
}
const supply=s=>s.treasury.cash+s.utilities.powerPlant.cash+s.flies.reduce((n,f)=>n+f.money+f.savings,0)+Object.values(s.businesses).reduce((n,b)=>n+Number(b.cash||0),0);
const point={x:1000,z:0};

test('catalog distinguishes factories and public services from homes; shortages count planned capacity',()=>{
 assert.deepEqual(Object.keys(CIVIC_FACILITY_CATALOG).sort(),['clinic','factory','power-plant','school','warehouse','workshop']);
 const s={flies:[],utilities:{powerPlant:{demand:400,installedCapacity:185}},urbanWorld:{buildings:{}},businesses:{}};
 const unmet=nationalDevelopmentDemand(s).find(n=>n.type==='power-plant');assert.equal(unmet.unmet,315);
 s.urbanWorld.buildings.p={id:'p',facilityType:'power-plant',stage:'construction',capacity:240};
 assert.equal(nationalDevelopmentDemand(s).find(n=>n.type==='power-plant').unmet,75);
 s.urbanWorld.buildings.q={id:'q',facilityType:'power-plant',stage:'operational',capacity:240};assert.ok(!nationalDevelopmentDemand(s).some(n=>n.type==='power-plant'));
 s.utilities.powerPlant.installedCapacity=1000;s.utilities.powerPlant.generation=0;assert.ok(!nationalDevelopmentDemand(s).some(n=>n.type==='power-plant'),'operator shortage alone cannot cause speculative plant construction');
 s.flies=Array.from({length:75},()=>({alive:true,ageYears:10,health:95}));assert.equal(nationalDevelopmentDemand(s)[0].type,'school');
});

test('private factory contract reserves actual owner capital, builds its road and materials, survives restore and adds no apartments',()=>{
 const t=setup(),owner=t.s.flies[0],initial=supply(t.s),ids=t.s.flies.map(f=>f.id),brains=t.s.flies.map(f=>JSON.stringify(f.brain)),wallet=owner.money+owner.savings;
 const p=t.urban.developFacility('factory',{ownerId:owner.id,lot:point,industrySector:'food-production'});assert.ok(p);assert.equal(p.funding.type,'resident');assert.equal(owner.money+owner.savings,wallet-p.budget);assert.equal(supply(t.s),initial);
 assert.equal(t.urban.completedFacilities().length,0);assert.equal(t.s.housing.apartmentBlocks.length,0);
 for(const f of t.s.flies)f.sleeping=true;t.step();assert.equal(p.progress,0);assert.equal(p.materialsOrdered,0);for(const f of t.s.flies)f.sleeping=false;
 t.step();t.onsite(p);t.step();assert.ok(p.materialsOrdered>0);assert.equal(p.materialsDelivered,0);
 const invoice=t.s.businesses['civic-materials'].cash;t.restore();const saved=t.s.urbanWorld.projects.find(v=>v.id===p.id);t.finish(saved);
 assert.equal(saved.stage,'complete');assert.equal(t.s.urbanWorld.buildings[p.buildingId].stage,'operational');assert.equal(t.urban.completedFacilities()[0].industrySector,'food-production');assert.equal(t.urban.completedFacilities()[0].capacity,50);
 assert.equal(t.s.housing.apartmentBlocks.length,0,'factories must not create residential capacity');assert.equal(t.s.businesses[p.buildingId].inventory,0,'commissioning does not invent output inventory');
 const l=LOCATIONS.find(l=>l.id===p.buildingId);assert.deepEqual({x:l.x,z:l.z},t.s.urbanWorld.buildings[p.buildingId].frontage);
 assert.deepEqual(t.s.flies.map(f=>f.id),ids);assert.deepEqual(t.s.flies.map(f=>JSON.stringify(f.brain)),brains);assert.equal(t.events.filter(e=>e.type==='construction_contract'&&e.buildingId===p.buildingId).length,1);
 assert.ok(t.s.businesses['civic-materials'].cash>=invoice);assert.ok(Math.abs(supply(t.s)-initial)<1e-6);
 const refund=saved.refunded;LOCATIONS.splice(LOCATIONS.findIndex(l=>l.id===p.buildingId),1);t.restore();assert.ok(LOCATIONS.some(l=>l.id===p.buildingId),'cold restore recreates facility access pins');t.step();assert.equal(t.s.urbanWorld.projects.find(p=>p.id===saved.id).refunded,refund);assert.ok(Math.abs(supply(t.s)-initial)<1e-6);
});

test('public power works reserve utility cash, never commission before inspection, and refund only that account',()=>{
 const t=setup(),initial=supply(t.s),cash=t.s.utilities.powerPlant.cash,treasury=t.s.treasury.cash,wallets=t.s.flies.map(f=>f.money+f.savings);
 const p=t.urban.developFacility('power-plant',{lot:point});assert.ok(p);assert.equal(p.funding.accountId,'power-grid');assert.equal(t.s.utilities.powerPlant.cash,cash-p.budget);assert.equal(t.s.treasury.cash,treasury);assert.deepEqual(t.s.flies.map(f=>f.money+f.savings),wallets);
 assert.equal(civicServiceCapacity(t.s,{hour:12}).power,0);t.finish(p);assert.equal(p.stage,'complete');assert.ok(p.refunded>0);assert.equal(t.s.utilities.powerPlant.cash,cash-p.budget+p.refunded);assert.equal(t.s.treasury.cash,treasury);assert.equal(t.s.housing.apartmentBlocks.length,0);assert.equal(civicServiceCapacity(t.s,{hour:12}).power,0,'commissioned equipment waits for paid operators');assert.ok(Math.abs(supply(t.s)-initial)<1e-6);
});

test('approval rejects unsafe land, unknown types and unfunded budgets without changing money, IDs or roads',()=>{
 const t=setup(),owner=t.s.flies[0],cash=supply(t.s),roads=t.s.urbanWorld.roads.length;
 assert.equal(t.urban.developFacility('castle',{lot:point,ownerId:owner.id}),null);
 assert.equal(t.urban.developFacility('factory',{ownerId:owner.id,lot:{x:430,z:0}}),null);
 owner.money=owner.savings=0;assert.equal(t.urban.developFacility('workshop',{ownerId:owner.id,lot:point}),null);
 t.s.utilities.powerPlant.cash=0;assert.equal(t.urban.developFacility('power-plant',{lot:point}),null);
 assert.equal(Object.keys(t.s.urbanWorld.buildings).length,0);assert.equal(t.s.urbanWorld.roads.length,roads);assert.equal(supply(t.s),cash-60000-60000);
});

test('national planner makes a bounded demand-based funded approval, counts its committed capacity and preserves disaster priority',()=>{
 const t=setup();t.s.utilities.powerPlant.demand=450;const cash=supply(t.s),p=t.urban.planNationalDevelopment();assert.ok(p);assert.equal(p.facilityType,'power-plant');assert.ok(p.approval.need.unmet>0);assert.equal(t.s.urbanWorld.development.decisions.length,1);assert.ok(t.s.urbanWorld.growthCursor<=144);assert.ok(Math.abs(supply(t.s)-cash)<1e-6);
 t.urban.planNationalDevelopment();assert.equal(t.s.urbanWorld.projects.filter(p=>p.facilityType==='power-plant').length,1);
 const b=BUILDINGS.find(b=>b.kind==='house');t.s.urbanWorld.buildings[b.id]={...b,stage:'collapsed',health:0,progress:0};
 const snapshot=supply(t.s);assert.equal(t.urban.developFacility('clinic',{lot:{x:1000,z:100}}),null);assert.equal(t.urban.planNationalDevelopment(),null);assert.equal(supply(t.s),snapshot);
});

function staffedFixture(type){const t=setup(),spec=CIVIC_FACILITY_CATALOG[type],id=`CIVIC-${type}-OPERATING`;t.s.urbanWorld.buildings[id]={id,x:1000,z:0,w:spec.w,d:spec.d,h:spec.h,kind:'civic',usage:type,facilityType:type,name:spec.name,capacity:spec.capacity,stage:'operational',health:100,frontage:{x:970,z:0},fundingAccountId:spec.funding};LOCATIONS.push({id,x:970,z:0,type:'job',name:spec.name});for(const f of t.s.flies)Object.assign(f,{x:970,z:0,currentLocationId:id,action:'applying for a civic facility job'});return {t,id};}

test('clinic jobs accept qualified unemployed applicants without replacing old jobs; care and wages require onsite funded staff',()=>{
 const {t,id}=staffedFixture('clinic'),worker=t.s.flies[0],existing=t.s.flies[1];existing.jobId='doctor';t.urban.handleResident(existing,{hour:12});assert.ok(!existing.facilityEmployment);assert.equal(existing.jobId,'doctor');
 t.urban.handleResident(worker,{hour:12});assert.equal(worker.facilityEmployment.buildingId,id);
 const patient=t.s.flies[2];Object.assign(patient,{ageYears:12,health:50,illness:'respiratory illness',action:'visiting a community clinic'});const cash=supply(t.s),wallet=worker.money;
 t.step();assert.equal(patient.health,50,'first observation cannot pay unobserved past work');t.step();assert.ok(patient.health>50);assert.ok(worker.money>wallet);assert.ok(t.s.businesses['civic-service-supplies'].cash>0);assert.ok(Math.abs(supply(t.s)-cash)<1e-6);
 const health=patient.health;worker.traveling=true;t.step();assert.equal(patient.health,health);worker.traveling=false;t.s.treasury.cash=0;t.step();t.step();assert.equal(patient.health,health,'unfunded care consumes no imaginary supplies');
 t.restore();assert.equal(t.s.flies[0].facilityEmployment.buildingId,id);assert.equal(t.s.flies[1].jobId,'doctor');
});

test('power capacity requires two paid real operators on the correct shift and disappears when the building is unsafe',()=>{
 const {t,id}=staffedFixture('power-plant');for(const f of t.s.flies)t.urban.handleResident(f,{hour:12});t.step();assert.equal(t.urban.serviceCapacity({hour:12}).power,0);t.step();assert.equal(t.urban.serviceCapacity({hour:12}).power,240);
 assert.equal(t.s.flies.filter(f=>f.facilityEmployment).length,6,'three shifts use six existing residents');
 t.s.urbanWorld.buildings[id].stage='damaged';assert.equal(t.urban.serviceCapacity({hour:12}).power,0);
});


test('destroyed/dead/conflicting facility jobs release; fire suspension and off-shift attendance pay no wages',()=>{
 const {t,id}=staffedFixture('power-plant');for(const f of t.s.flies)t.urban.handleResident(f,{hour:12});t.step();t.step();
 const operator=t.s.flies.find(f=>f.facilityEmployment?.shiftStart===8),other=t.s.flies.find(f=>f.facilityEmployment?.shiftStart===0),cash=operator.money,off=other.money;
 assert.equal(other.facilityEmployment.lastPaidAt,-1);assert.equal(other.money,off);
 t.s.urbanWorld.buildings[id].stage='unsafe';t.step();assert.equal(operator.money,cash);assert.equal(operator.facilityEmployment.suspended,true);assert.equal(t.urban.serviceCapacity({hour:12}).power,0);
 t.s.urbanWorld.buildings[id].stage='operational';t.step();assert.equal(operator.money,cash,'reopening cannot pay the closed interval');t.step();assert.ok(operator.money>cash);
 other.alive=false;t.step();assert.ok(!other.facilityEmployment);
 operator.businessEmployeeOf='EXISTING-GARMENT-CONTRACT';t.step();assert.ok(!operator.facilityEmployment);assert.equal(operator.businessEmployeeOf,'EXISTING-GARMENT-CONTRACT');
 t.s.urbanWorld.buildings[id].stage='collapsed';t.step();assert.ok(t.s.flies.every(f=>!f.facilityEmployment));assert.equal(t.urban.serviceCapacity({hour:12}).power,0);
});

test('school lessons require actual funded teacher attendance and improve only children present at the school',()=>{
 const {t,id}=staffedFixture('school'),teacher=t.s.flies[0];t.urban.handleResident(teacher,{hour:12});
 const child=t.s.flies[1],absent=t.s.flies[2];Object.assign(child,{ageYears:10,educationLevel:20,action:'attending a community school'});Object.assign(absent,{ageYears:10,educationLevel:20,currentLocationId:'home',x:0,z:0});
 const money=supply(t.s);t.step();assert.equal(child.educationLevel,20);t.step();assert.ok(child.educationLevel>20);assert.equal(absent.educationLevel,20);assert.ok(Math.abs(supply(t.s)-money)<1e-6);
 const earned=teacher.money;t.step(600,{hour:20});assert.equal(teacher.money,earned,'a teacher staying on campus outside the shift earns nothing');
});

test('private facilities fund their own repairs and utility plants retain utility funding after damage',()=>{
 const t=setup(),owner=t.s.flies[0];
 const record=(id,type,x,ownerId=null)=>({id,facilityType:type,usage:type,kind:'civic',name:type,x,z:0,w:20,d:18,h:18,capacity:20,stage:'damaged',health:40,progress:1,frontage:{x:x-16,z:0},ownerId,fundingAccountId:type==='power-plant'?'power-grid':null});
 const privateId='CIVIC-PRIVATE-REPAIR',publicId='CIVIC-UTILITY-REPAIR';t.s.urbanWorld.buildings[privateId]=record(privateId,'workshop',1000,owner.id);t.s.urbanWorld.buildings[publicId]=record(publicId,'power-plant',1060);t.urban.init();
 const treasury=t.s.treasury.cash,wealth=owner.money+owner.savings,p=t.urban.submitProject(privateId);assert.ok(p);assert.equal(p.funding.type,'resident');assert.equal(owner.money+owner.savings,wealth-p.budget);assert.equal(t.s.treasury.cash,treasury);
 const plant=t.s.utilities.powerPlant.cash,q=t.urban.submitProject(publicId);assert.ok(q);assert.equal(q.funding.accountId,'power-grid');assert.equal(t.s.utilities.powerPlant.cash,plant-q.budget);assert.equal(t.s.treasury.cash,treasury);
});


test('hundreds of civic job/clinic choosers share a bounded staff directory instead of rescanning all residents per choice',()=>{
 const {t}=staffedFixture('clinic'),base=t.s.flies[0];
 const residents=Array.from({length:500},(_,i)=>({...base,id:`CHOOSER-${i}`,brain:{id:i}}));let scans=0;
 t.s.flies=new Proxy(residents,{get(array,key,receiver){if(key===Symbol.iterator)return function(){scans++;return array[Symbol.iterator]();};return Reflect.get(array,key,receiver);}});
 for(const f of residents)t.urban.addChoices(f,{hour:12},()=>{});
 assert.ok(scans<=1,`500 choosers performed ${scans} full resident scans`);
});


test('actual engine string illnesses retain their diagnosis through clinic treatment and restart without NaN',async()=>{
 const {freshState}=await import('../worker/civilization-engine.mjs');
 const {createCivicFacilityOperations}=await import('../worker/civic-facilities.mjs');
 let state=freshState();state.urbanWorld.buildings['CIVIC-REAL-CLINIC']={id:'CIVIC-REAL-CLINIC',facilityType:'clinic',name:'Real clinic',stage:'operational',capacity:12,fundingAccountId:'treasury',x:1000,z:0,frontage:{x:980,z:0}};
 const [worker,patient]=state.flies.filter(f=>f.alive&&f.ageYears>=21).slice(0,2),wid=worker.id,pid=patient.id;
 Object.assign(worker,{jobId:null,businessId:null,businessEmployeeOf:null,publicServiceRole:null,x:980,z:0,currentLocationId:'CIVIC-REAL-CLINIC',traveling:false,sleeping:false,health:100,energy:90,ageYears:30});worker.professionSkills.medicine=1;
 Object.assign(patient,{x:980,z:0,currentLocationId:'CIVIC-REAL-CLINIC',traveling:false,sleeping:false,health:88,energy:90,illness:'viral fatigue'});
 let ops=createCivicFacilityOperations({world:()=>state});assert.equal(ops.apply(worker,'CIVIC-REAL-CLINIC'),true);
 for(let i=0;i<3;i++){state.simulationAgeSeconds+=600;ops.tick(600,{hour:12});}
 assert.equal(patient.illness,'viral fatigue');assert.ok(patient.civicClinicCare.treatmentHours>0);assert.ok(Number.isFinite(patient.health));
 const hours=patient.civicClinicCare.treatmentHours;state=JSON.parse(JSON.stringify(state));ops=createCivicFacilityOperations({world:()=>state});
 const restored=state.flies.find(f=>f.id===pid);assert.equal(restored.civicClinicCare.treatmentHours,hours);assert.equal(restored.illness,'viral fatigue');
 for(let i=0;i<15;i++){state.simulationAgeSeconds+=600;ops.tick(600,{hour:12});assert.ok(Number.isFinite(restored.health));assert.ok(restored.illness===null||typeof restored.illness==='string');}
 assert.equal(restored.illness,null);assert.equal(restored.civicClinicCare,null);assert.ok(Number.isFinite(state.flies.find(f=>f.id===wid).money));
});
