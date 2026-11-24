import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRPORT,BUILDINGS,ROADS,WATER,PARK,LOCATIONS,DISTRICT_BRIDGES,BRIDGES,blocked,onWaterCrossing,clearSegment,pedestrianRoute,overlaps,contains} from '../worker/city-map.mjs';
import {NORTH_RIVERSIDE_LINK,NORTH_FARM,BORDER_CHECKPOINTS,BORDER_CUSTOMS_BUILDINGS,BORDER_CUSTOMS_DECKS,countryAt,borderDirection} from '../worker/country-map.mjs';
import {MAIN_SCHOOL_CAMPUSES,relocateGatewaySchool} from '../worker/education-map.mjs';
import {relocateNorthAccessRoutes,resumeNorthAccessJourney,relocateNorthCustoms,strandedInDistrictRiver} from '../worker/district-river-migration.mjs';
import {createInternationalLife} from '../worker/international-life.mjs';

const samples=route=>route.flatMap((b,i)=>{if(!i)return [b];const a=route[i-1],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)));return Array.from({length:n},(_,j)=>({x:a.x+(b.x-a.x)*(j+1)/n,z:a.z+(b.z-a.z)*(j+1)/n}));});
test('the former airport crossing is water, while the replacement customs bridge and Europe shortcut have real decks',()=>{
 assert.ok(blocked({x:50,z:-570}));assert.equal(onWaterCrossing({x:50,z:-570}),false);
 assert.ok(![...BORDER_CHECKPOINTS,...DISTRICT_BRIDGES,...BUILDINGS,...BORDER_CUSTOMS_DECKS].some(b=>b.id?.startsWith('NORTH-CITY-BRIDGE-3')));
 assert.ok(!ROADS.some(r=>contains(r,{x:50,z:-570})));
 const port=BORDER_CHECKPOINTS.find(p=>p.id===NORTH_RIVERSIDE_LINK.id);assert.ok(port);
 for(const country of ['north-city','hansdrex'])for(const mode of ['walk','car']){
  const d=borderDirection(port,country,mode);assert.equal(countryAt(d.admissionPoint),country);assert.ok(clearSegment(d.queuePoint,d.admissionPoint));
  if(mode==='walk')assert.ok(pedestrianRoute(d.admissionPoint,country==='north-city'?NORTH_FARM.gate:{x:367.8,z:-355}).length,'a dry bank sidewalk must not be mistaken for the main river');
 }
 for(const booth of BORDER_CUSTOMS_BUILDINGS.filter(b=>b.id.startsWith(port.id)))assert.equal(countryAt(booth),booth.countryId);
 const bridge=BRIDGES.find(b=>b.id==='EUROPE-RIVERSIDE-BRIDGE');assert.ok(bridge?.atGrade);
 assert.ok(samples([{x:bridge.x-bridge.w/2,z:bridge.z},{x:bridge.x+bridge.w/2,z:bridge.z}]).every(p=>countryAt(p)==='hansdrex'&&!blocked(p)));
});

test('bank roads support walking, cars and scooters to the farm and Europe without cutting crops, buildings, water or runways',()=>{
 for(const mode of ['walk','car','scooter'])for(const [a,b]of [[{x:374,z:-355},NORTH_FARM.gate],[NORTH_FARM.gate,{x:500,z:-240}]]){
  const route=pedestrianRoute(a,b,mode);assert.ok(route.length>1,mode);
  assert.ok(route.every((p,i)=>!i||clearSegment(route[i-1],p)));
  for(const p of samples(route)){
   assert.equal(NORTH_FARM.fields.some(f=>contains(f,p)),false,`${mode} cuts crops`);
   assert.equal(AIRPORT.runways.some(r=>contains(r,p,10)),false,`${mode} enters runway`);
   assert.equal(AIRPORT.taxiways.some(r=>contains(r,p,4)),false,`${mode} enters taxiway`);
  }
  if(b.x===500)assert.ok(route.some(p=>p.x>430&&Math.abs(p.z-NORTH_RIVERSIDE_LINK.europeBridgeZ)<8),'takes the new shortcut');
 }
 const bank=ROADS.find(r=>r.id==='NORTH-RIVERSIDE-ACCESS');
 assert.ok(!BUILDINGS.some(b=>overlaps(bank,b,1.4)));
 assert.ok(!AIRPORT.runways.some(r=>overlaps(bank,r,8)));
 assert.ok(!AIRPORT.taxiways.some(r=>overlaps(bank,r,4)));
});

test('a retired border route is re-banked in its current country without granting a visa or changing paid receipts',()=>{
 const receipt={entryId:'PAID',toCountryId:'north-city',portId:'NORTH-CITY-BRIDGE-3',fee:50};
 const brain={id:'SAME'},resident={id:'N',alive:true,x:50,z:-570,y:1.1,money:123,savings:456,brain,homeId:'same-home',targetLocationId:'north-farm',traveling:true,metroBoardingsThisTrip:2,borderPortId:'NORTH-CITY-BRIDGE-3',countryPresence:{countryId:'hansdrex',entryId:'PREVIOUS'},countryEntryReceipts:[receipt],routeWaypoints:[{x:50,z:-580,portId:'NORTH-CITY-BRIDGE-3'}]};
 const other={...resident,id:'H',z:-574,countryPresence:{countryId:'north-city',entryId:'PAID'},routeWaypoints:[{x:50,z:-560,portId:'NORTH-CITY-BRIDGE-3'}]};
 const ride={...resident,id:'R',onTrain:true,y:35},state={districtRiverMigrationVersion:29,flies:[resident,other,ride]};
 const before=state.flies.map(f=>[f.money,f.savings,f.countryPresence,structuredClone(f.countryEntryReceipts)]);let calls=0;
 const result=relocateNorthAccessRoutes(state,{replanResident(f,chosen){calls++;assert.ok(!strandedInDistrictRiver(f));assert.equal(chosen.id,'north-farm');f.routeWaypoints=[];f.metroBoardingsThisTrip=0;}});
 assert.equal(result.unresolved.length,0);assert.equal(calls,2);assert.equal(result.deferred,1);
 assert.equal(countryAt(resident),'hansdrex');assert.equal(countryAt(other),'north-city');assert.equal(resident.brain,brain);assert.equal(resident.metroBoardingsThisTrip,2);
 assert.equal(ride.x,50);assert.equal(ride.y,35);assert.equal(ride.routeWaypoints[0].portId,'NORTH-CITY-BRIDGE-3');assert.ok(ride.northAccessRouteReplan);
 assert.deepEqual(state.flies.map(f=>[f.money,f.savings,f.countryPresence,f.countryEntryReceipts]),before);
 const once=structuredClone(state);relocateNorthAccessRoutes(state);assert.deepEqual(state,once);
});

test('entry is still denied at the removed crossing and charges exactly one visa at the true riverside frontier',()=>{
 const person={id:'P',alive:true,ageYears:30,x:374,z:-550,citizenshipCountryId:'hansdrex',money:100,savings:0,countryPresence:{countryId:'hansdrex',entryId:'OLD'}};
 const state={simulationAgeSeconds:0,flies:[person],treasury:{cash:1000},businesses:{},internationalLife:{initialized:true,countries:{},relations:{},entries:0,visaRevenue:0,history:[],conflictRequests:{},conflictQueue:[],conflictRequestCount:0,nextConflictId:1,activeConflict:null,completedConflicts:0,airClearances:{}}};
 const life=createInternationalLife({world:()=>state,redistribute:false,nationalEconomy:false});
 assert.equal(life.interceptMovement(person,{x:50,z:-560},{x:50,z:-580},{mode:'walk'}).allowed,false);assert.equal(person.money,100);
 assert.equal(life.interceptMovement(person,{x:374,z:-560},{x:374,z:-580},{mode:'walk',entryId:'TRIP'}).allowed,true);assert.equal(person.money,50);
 assert.equal(life.interceptMovement(person,{x:374,z:-560},{x:374,z:-580},{mode:'walk',entryId:'TRIP'}).allowed,true);assert.equal(person.money,50);
 assert.equal(person.countryEntryReceipts[0].portId,NORTH_RIVERSIDE_LINK.id);
});

test('a deferred rider keeps the current ride and replans its remaining walk only after reaching the ground',()=>{
 const receipt={entryId:'PAID',portId:'NORTH-CITY-BRIDGE-3',fee:50},person={id:'R',alive:true,x:50,z:-650,y:35,onTrain:true,northAccessRouteReplan:true,targetLocationId:'market',money:120,metroBoardingsThisTrip:2,countryEntryReceipts:[receipt]};
 let calls=0;const replanResident=(p,chosen)=>{calls++;assert.equal(chosen.id,'market');assert.equal(p.x,50);assert.equal(p.z,-650);assert.equal(p.y,1.1);p.routeWaypoints=[{x:374,z:-650}];p.metroBoardingsThisTrip=0;};
 assert.equal(resumeNorthAccessJourney(person,{replanResident}),false);assert.equal(calls,0);
 person.onTrain=false;assert.equal(resumeNorthAccessJourney(person,{replanResident}),false);assert.equal(calls,0);
 person.y=1.1;assert.equal(resumeNorthAccessJourney(person,{replanResident}),true);assert.equal(calls,1);assert.equal(person.metroBoardingsThisTrip,2);assert.equal(person.money,120);assert.deepEqual(person.countryEntryReceipts,[receipt]);assert.equal(person.northAccessRouteReplan,undefined);
 assert.equal(resumeNorthAccessJourney(person,{replanResident}),false);
});

test('an emergency vehicle stranded on the removed deck keeps its water and crew while its relief pickup follows the nearest dry bank',()=>{
 const id='STRANDED-TEST-ENGINE',pickupId=`EMERGENCY-PICKUP-${id}`,pickup={id:pickupId,x:46.3,z:-576,type:'emergency-access'};LOCATIONS.push(pickup);
 const walker={id:'RELIEF',alive:true,x:806,z:-112.22,y:1.1,targetLocationId:pickupId,traveling:true,routeWaypoints:[{x:46.3,z:-576}],money:90};
 const aboard={id:'ABOARD',alive:true,x:46.3,z:-576,y:1.1,onFireEngine:true,money:40};
 const engine={id,x:46.3,z:-576,phase:'gathering-return',repatriating:true,countryId:'hansdrex',crewIds:[walker.id,aboard.id],pickup:{x:46.3,z:-576},route:[],water:760,fuel:61};
 const state={flies:[walker,aboard],urbanWorld:{fireService:{engines:[engine],ambulances:[]}}};
 try{
  const result=relocateNorthAccessRoutes(state);assert.equal(result.emergencyVehicles,1);assert.equal(strandedInDistrictRiver(engine),false);assert.equal(countryAt(engine),'north-city','the recovery stays on the same bank before its lawful retreat');
  assert.deepEqual(engine.pickup,{x:engine.x,z:engine.z});assert.equal(pickup.x,engine.x);assert.equal(pickup.z,engine.z);
  assert.equal(walker.x,806);assert.equal(walker.z,-112.22);assert.equal(walker.traveling,false);assert.deepEqual(walker.routeWaypoints,[]);assert.equal(aboard.x,engine.x);assert.equal(aboard.z,engine.z);
  assert.equal(engine.water,760);assert.equal(engine.fuel,61);assert.equal(engine.phase,'gathering-return');assert.equal(engine.repatriating,true);assert.deepEqual(engine.crewIds,['RELIEF','ABOARD']);assert.equal(walker.money+aboard.money,130);
 }finally{LOCATIONS.splice(LOCATIONS.indexOf(pickup),1);}
});

test('Gateway keeps its identity, damage and contractors while relocating to a clear school plot',()=>{
 const school=MAIN_SCHOOL_CAMPUSES[0];
 assert.equal(overlaps(school,PARK),false);assert.equal([...BUILDINGS,...ROADS,...WATER].some(b=>b.id!==school.id&&overlaps(b,school,1)),false);
 const brain={id:'B'},student={id:'S',alive:true,x:123,z:-414,indoors:true,currentLocationId:school.id,money:45,brain};
 const contractor={id:'C',alive:true,x:115,z:-402,y:1.1,traveling:true,urbanTask:{id:'WORK',phase:'working',routeFailures:3},routeWaypoints:[{x:121,z:-405}]};
 const traveler={id:'T',alive:true,x:100,z:-350,traveling:true,targetLocationId:school.id};
 const record={id:school.id,x:121,z:-415,w:22,d:16,h:9,health:42,stage:'damaged',ownerId:'OWNER',originalBlueprint:{x:121,z:-415,w:22,d:16,h:13}};
 const project={id:'WORK',buildingId:school.id,kind:'repair',stage:'construction',progress:.4,escrow:300,contractorIds:['C']};
 const state={flies:[student,contractor,traveler],urbanWorld:{buildings:{[school.id]:record},projects:[project]}};
 assert.ok(relocateGatewaySchool(state).moved);assert.equal(record.x,school.x);assert.equal(record.originalBlueprint.z,school.z);assert.equal(record.health,42);assert.equal(record.h,9);assert.equal(record.stage,'damaged');assert.equal(record.ownerId,'OWNER');
 assert.equal(student.x,school.x+2);assert.equal(student.z,school.z+1);assert.equal(student.brain,brain);assert.equal(student.money,45);
 assert.equal(contractor.x,115);assert.equal(contractor.z,-402);assert.equal(contractor.urbanTask.id,'WORK');assert.equal(contractor.urbanTask.nextRouteAt,0);assert.deepEqual(project.contractorIds,['C']);assert.equal(project.escrow,300);assert.equal(project.progress,.4);
 assert.equal(traveler.x,100);assert.equal(traveler.relocatedDestinationId,school.id);
 const once=structuredClone(state);assert.equal(relocateGatewaySchool(state).moved,false);assert.deepEqual(state,once);
});

test('existing customs damage and active repair escrow move to the riverside crossing without restarting the contract',()=>{
 const oldId='NORTH-CITY-BRIDGE-3-CUSTOMS-W',newId=`${NORTH_RIVERSIDE_LINK.id}-CUSTOMS-W`,base=BORDER_CUSTOMS_BUILDINGS.find(b=>b.id===newId);
 const record={id:oldId,x:40,z:-578,w:2.4,d:4,h:3,health:22,stage:'construction',progress:.3,lastFireId:'FIRE',originalBlueprint:{id:oldId,x:40,z:-578,w:2.4,d:4,h:3}},project={id:'WORK',buildingId:oldId,stage:'construction',progress:.3,escrow:500,spent:80,workerIds:['WORKER'],countryId:'north-city'},fire={id:'FIRE',buildingId:oldId,intensity:0,containedAt:45},worker={id:'WORKER',alive:true,x:34,z:-602,y:1.1,traveling:true,urbanTask:{id:'WORK',buildingId:oldId,phase:'working'},routeWaypoints:[{x:40,z:-578}],money:90};
 const state={flies:[worker],urbanWorld:{buildings:{[oldId]:record},fires:[fire],projects:[project],ownerRestoration:{pending:[oldId],completed:[],untouched:[oldId]}}};
 assert.equal(relocateNorthCustoms(state).moved,1);assert.equal(state.urbanWorld.buildings[newId],record);assert.equal(state.urbanWorld.buildings[oldId],undefined);assert.equal(record.previousMapId,oldId);assert.equal(record.health,22);assert.equal(record.stage,'construction');assert.equal(record.progress,.3);assert.equal(record.x,base.x);assert.equal(record.originalBlueprint.z,base.z);assert.equal(strandedInDistrictRiver(record),false);
 assert.equal(project.buildingId,newId);assert.equal(project.escrow,500);assert.equal(project.spent,80);assert.equal(project.progress,.3);assert.equal(project.stage,'construction');assert.deepEqual(project.workerIds,['WORKER']);assert.equal(fire.buildingId,newId);assert.equal(fire.containedAt,45);
 assert.equal(worker.x,34);assert.equal(worker.z,-602);assert.equal(worker.money,90);assert.equal(worker.urbanTask.buildingId,newId);assert.equal(worker.urbanTask.nextRouteAt,0);assert.deepEqual(state.urbanWorld.ownerRestoration.untouched,[newId]);
 const once=structuredClone(state);assert.equal(relocateNorthCustoms(state).moved,0);assert.deepEqual(state,once);
});
