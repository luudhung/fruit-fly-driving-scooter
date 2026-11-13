import test from 'node:test';
import assert from 'node:assert/strict';
process.env.CIV_INITIAL_POPULATION='12';
const engine=await import('../worker/civilization-engine.mjs');
const {freshState,restoreState,getState,urbanWorld,gameClock,liquidMoneySupply,simulatePowerGrid,ensurePowerPlantStaff,tickFly,setNeuralSyncEnabled}=engine;
const {BUILDINGS,LOCATIONS,ROADS}=await import('../worker/city-map.mjs');
const {CIVIC_FACILITY_CATALOG}=await import('../worker/civic-development.mjs');
setNeuralSyncEnabled(false);
const gridJobs=new Set(['power','power-evening','power-night','grid-dispatch']);
const available=f=>f.alive&&f.ageYears>=21&&f.ageYears<65&&!f.businessId&&!f.businessEmployeeOf&&!f.publicServiceRole&&!f.facilityEmployment&&!gridJobs.has(f.jobId)&&!['doctor','school','police','military','firefighter','paramedic'].includes(f.jobId);
function healthy(f){Object.assign(f,{health:100,energy:90,hunger:10,thirst:10,illness:null,stress:5,traveling:false,sleeping:false,recoveringEnergy:false,arrested:false,arrestedUntil:0,urbanTask:null,socialTask:null,civicDuty:null,publicServiceDuty:null,cityService:null,taxiJobId:null,taxiPassenger:null,privateFlight:null,onPrivateHelicopter:false,onTrain:false,onPlane:false,fireEngineDuty:null,ambulanceDuty:null,industrialFreightDuty:null,airTrip:null,roadDuty:false,bankLoan:0,creditCardDebt:0});}
function fixture(){const s=freshState();s.weather={condition:'clear',precipitation:0,wind:0};s.urbanWorld.nextFireAt=s.urbanWorld.nextGrowthAt=s.urbanWorld.development.nextReviewAt=1e12;s.simulationAgeSeconds=12*3600;s.urbanWorld.lastTickAt=s.simulationAgeSeconds;return s;}
function step(s,dt=600){s.simulationAgeSeconds+=dt;urbanWorld.tick(dt,gameClock());}
function siteActor(f,id){const pin=LOCATIONS.find(l=>l.id===id);assert.ok(pin,`missing durable pin ${id}`);Object.assign(f,{x:pin.x,z:pin.z,currentLocationId:id,targetLocationId:id,traveling:false,onTrain:false,onPlane:false,indoors:false,routeWaypoints:[],vx:0,vz:0});}
function operating(s,type,z=0){const spec=CIVIC_FACILITY_CATALOG[type],id=`CIVIC-ENGINE-${type}`;s.urbanWorld.buildings[id]={...spec,id,x:1000,z,kind:'civic',facilityType:type,usage:type,health:100,progress:1,stage:'operational',frontage:{x:970,z},fundingAccountId:spec.funding==='resident'?null:spec.funding};urbanWorld.init();return id;}
function applicants(s,id,count){const people=s.flies.filter(available).slice(0,count);assert.equal(people.length,count);for(const f of people){healthy(f);Object.assign(f,{ageYears:30,jobId:null,jobTitle:null,wage:0,action:'applying for a civic facility job',pendingAction:null});Object.assign(f.professionSkills,{medicine:1,electrical:1,teaching:1});siteActor(f,id);urbanWorld.handleResident(f,gameClock());assert.equal(f.facilityEmployment?.buildingId,id);}return people;}
function arriveCrew(s,p){for(const id of p.workerIds){const f=s.flies.find(f=>f.id===id),task=f.urbanTask;healthy(f);f.urbanTask=task;siteActor(f,task.targetId);}}

// Exercise the actual engine-bound construction service, not a fake createUrbanWorld callback fixture.
test('real engine builds a paid nonresidential factory with delivered materials and opened access roads without creating housing across cold restore',()=>{
 let s=fixture();const crew=s.flies.filter(available).slice(0,8);assert.equal(crew.length,8);
 for(const f of crew){healthy(f);Object.assign(f,{jobId:'construction',jobTitle:'builder',x:1000,z:40,currentLocationId:'construction',money:30000,savings:10000});}
 const owner=crew[0],housing=s.housing.apartmentBlocks.length,identities=s.flies.map(f=>[f.id,f.brain.id,f.housingUnitId]);
 const initial=liquidMoneySupply(),wallet=owner.money+owner.savings,p=urbanWorld.developFacility('factory',{ownerId:owner.id,lot:{x:1000,z:0},industrySector:'garments'});assert.ok(p);assert.ok(p.roadIds.length);assert.equal(owner.money+owner.savings,wallet-p.budget);assert.ok(Math.abs(liquidMoneySupply()-initial)<1e-6);assert.equal(urbanWorld.completedFacilities().length,0);
 step(s);assert.equal(p.progress,0);assert.equal(p.materialsOrdered,0,'travelling workers cannot order or build');assert.ok(p.workerIds.length);
 arriveCrew(s,p);step(s);assert.ok(p.materialsOrdered>0);assert.equal(p.materialsDelivered,0);const invoice=s.businesses['civic-materials'].cash,projectId=p.id,buildingId=p.buildingId;
 s=restoreState(structuredClone(s));const saved=s.urbanWorld.projects.find(p=>p.id===projectId);assert.ok(saved);assert.equal(saved.materialsOrdered,p.materialsOrdered);
 for(let i=0;i<100&&saved.stage!=='complete';i++){
  for(const id of saved.workerIds){const f=s.flies.find(f=>f.id===id),task=f.urbanTask;if(!task)continue;
   siteActor(f,task.phase==='collecting'?'construction':task.targetId);urbanWorld.handleResident(f,gameClock());
  }
  step(s,1800);
 }
 assert.equal(saved.stage,'complete');assert.equal(s.urbanWorld.buildings[buildingId].stage,'operational');assert.equal(s.housing.apartmentBlocks.length,housing);assert.ok(saved.materialsUsed<=saved.materialsDelivered+1e-6);assert.ok(s.businesses['civic-materials'].cash>=invoice);
 for(const id of saved.roadIds)assert.ok(ROADS.some(r=>r.id===id),'only physically finished roads enter authoritative routing');
 assert.deepEqual(s.flies.map(f=>[f.id,f.brain.id,f.housingUnitId]),identities);assert.ok(Math.abs(liquidMoneySupply()-initial)<1e-5,'real engine finance conserves project and wage cash');
 const refund=saved.refunded,location=LOCATIONS.findIndex(l=>l.id===buildingId);LOCATIONS.splice(location,1);s=restoreState(structuredClone(s));assert.ok(LOCATIONS.some(l=>l.id===buildingId));assert.equal(s.housing.apartmentBlocks.length,housing);assert.equal(s.urbanWorld.projects.find(p=>p.id===projectId).refunded,refund);
});

test('real engine civic payroll needs actual funded attendance; full snapshots preserve employment and diagnostic strings over restore',()=>{
 let s=fixture();const id=operating(s,'clinic'),[staff]=applicants(s,id,1),patient=s.flies.find(f=>available(f)&&f.id!==staff.id);assert.ok(patient);healthy(patient);siteActor(patient,id);Object.assign(patient,{health:88,illness:'respiratory illness',action:'visiting a community clinic'});
 const cash=liquidMoneySupply(),salary=staff.salaryLifetime;staff.traveling=true;step(s);assert.equal(staff.salaryLifetime,salary);assert.equal(patient.health,88);
 staff.traveling=false;step(s);assert.equal(staff.salaryLifetime,salary);step(s);assert.ok(staff.salaryLifetime>salary);assert.ok(patient.health>88);assert.equal(patient.illness,'respiratory illness');assert.equal(typeof patient.illness,'string');assert.ok(Math.abs(liquidMoneySupply()-cash)<1e-5);
 const paid=staff.salaryLifetime;for(let i=0;i<4;i++)tickFly(staff,gameClock());assert.equal(staff.salaryLifetime,paid,'resident ticks cannot pay civic salary a second time');
 const observed=getState().flies.find(f=>f.id===staff.id);assert.equal(observed.facilityEmployment.buildingId,id);assert.match(observed.jobTitle,/staff/);
 const workerId=staff.id,patientId=patient.id,hours=patient.civicClinicCare.treatmentHours;s=restoreState(structuredClone(s));assert.equal(s.flies.find(f=>f.id===workerId).facilityEmployment.buildingId,id);assert.equal(s.flies.find(f=>f.id===patientId).illness,'respiratory illness');assert.equal(s.flies.find(f=>f.id===patientId).civicClinicCare.treatmentHours,hours);
 const worker=s.flies.find(f=>f.id===workerId);worker.facilityEmployment.shiftStart=0;const before=worker.salaryLifetime;step(s);assert.equal(worker.salaryLifetime,before,'remaining on campus outside the assigned shift earns nothing');
});

test('real grid adds already-staffed civic generation once without applying the old plant staffing factor twice',()=>{
 const s=fixture(),id=operating(s,'power-plant'),operators=applicants(s,id,6);step(s);step(s);assert.equal(urbanWorld.serviceCapacity(gameClock()).power,240);
 const old=ensurePowerPlantStaff();for(const f of old)Object.assign(f,{traveling:true,currentLocationId:'power',action:'working as grid operator'});
 const plant=s.utilities.powerPlant;Object.assign(plant,{installedCapacity:185,maintenance:.8,cash:60000,fuelReserve:1e6,lastHourKey:-1});s.utilities.lastBillingDay=gameClock().day;
 simulatePowerGrid(gameClock());assert.equal(plant.onDuty,0);assert.equal(plant.civicGenerationCapacity,240);assert.equal(plant.capacity,425);
 const expected=Math.min((185*.3+240)*plant.maintenance,plant.demand*1.08);assert.ok(Math.abs(plant.generation-expected)<1e-8);assert.ok(plant.generation>Math.min(425*.3*plant.maintenance,plant.demand*1.08),'civic operators are independent of legacy plant attendance');
 const one=operators.find(f=>f.facilityEmployment.shiftStart===8);one.traveling=true;plant.lastHourKey=-1;simulatePowerGrid(gameClock());assert.equal(plant.civicGenerationCapacity,120);
 s.urbanWorld.buildings[id].stage='unsafe';plant.lastHourKey=-1;simulatePowerGrid(gameClock());assert.equal(plant.civicGenerationCapacity,0);assert.equal(plant.capacity,185);
 for(const f of operators)assert.equal(f.jobId,null,'legacy grid recruitment cannot overwrite civic contracts');
});

test('actual engine recovery pauses a new industrial contract, retains its paid stock and restores original building height before new growth',()=>{
 const s=fixture(),owner=s.flies.find(available);healthy(owner);Object.assign(owner,{jobId:'construction',money:50000,savings:10000});
 const p=urbanWorld.developFacility('workshop',{ownerId:owner.id,lot:{x:1000,z:0}});assert.ok(p);step(s);arriveCrew(s,p);step(s);assert.ok(p.materialsOrdered>0);const ordered=p.materialsOrdered,invoice=s.businesses['civic-materials'].cash,ids=[...p.workerIds],contract=p.id;
 const b=BUILDINGS.find(b=>b.kind==='block'&&!s.urbanWorld.buildings[b.id]);assert.ok(b);s.treasury.cash=50000;s.urbanWorld.buildings[b.id]={...b,health:0,stage:'collapsed',progress:0,originalHeight:b.h};const cash=liquidMoneySupply();
 step(s);assert.equal(p.recoveryPaused,true);assert.equal(p.id,contract);assert.equal(p.materialsOrdered,ordered);assert.equal(s.businesses['civic-materials'].cash,invoice);assert.equal(p.workerIds.length,0);assert.ok(ids.every(id=>s.flies.find(f=>f.id===id).urbanTask?.id!==contract));
 const repair=s.urbanWorld.projects.find(v=>v.buildingId===b.id);assert.ok(repair);assert.equal(repair.kind,'rebuild');assert.equal(repair.targetHeight,b.h);assert.equal(urbanWorld.developFacility('clinic',{lot:{x:1000,z:100}}),null);assert.ok(Math.abs(liquidMoneySupply()-cash)<1e-5);
 const snapshot=getState().urbanWorld;assert.ok(snapshot.projects.some(v=>v.id===repair.id));assert.equal(snapshot.buildings.find(v=>v.id===p.buildingId).facilityType,'workshop');
});


test('a real simulation tick cannot poach civic staff when national teacher and rooftop host posts become vacant',async()=>{
 const s=fixture(),power=operating(s,'power-plant'),operators=applicants(s,power,6),clinic=operating(s,'clinic',100),clinicians=applicants(s,clinic,2),crew=[...operators,...clinicians];
 for(const f of crew){f.intelligence=1.3;f.educationLevel=100;f.traits.empathy=f.traits.sociability=1;}
 s.education.teacherId=null;for(const f of s.flies)if(f.jobId==='rooftop')f.jobId=null;
 s.flies=[operators[0],...s.flies.filter(f=>f!==operators[0])];const contracts=crew.map(f=>[f.id,f.facilityEmployment.buildingId,f.brain.id]);
 await engine.tick({gameSeconds:120,syncBrain:false});
 for(const [id,buildingId,brainId]of contracts){const f=s.flies.find(f=>f.id===id);assert.equal(f.jobId,null,`${id} was overwritten by automatic staffing`);assert.equal(f.facilityEmployment?.buildingId,buildingId);assert.equal(f.brain.id,brainId);}
 assert.ok(!crew.some(f=>f.id===s.education.teacherId));assert.ok(s.flies.some(f=>f.jobId==='rooftop'));
 assert.equal(Number(s.simulationFaults?.total||0),0);
});
