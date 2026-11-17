import test from 'node:test';
import assert from 'node:assert/strict';
import {createResidentVision,RESIDENT_VISION_RULES} from '../worker/resident-vision.mjs';
const actor=(id,x,z,extra={})=>({id,name:'Person '+id,alive:true,x,y:1.1,z,vx:0,vz:1,indoors:false,...extra});
const fixture=(flies,buildings=[])=>{const state={simulationAgeSeconds:120,timeScale:120,flies,urbanWorld:{buildings:{},fires:[]}};return{state,vision:createResidentVision({world:()=>state,buildings})};};
const ids=sights=>sights.map(s=>s.id);

test('eyes respect horizontal FOV/range and retain a physical heading while stopped',()=>{
 const me=actor('ME',0,0),front=actor('FRONT',0,20),behind=actor('BACK',0,-15),side=actor('SIDE',30,0),far=actor('FAR',0,101);
 const {state,vision}=fixture([me,front,behind,side,far]);
 assert.deepEqual(ids(vision.observe(me)),['FRONT']);
 assert.equal(me.vision.heading,0);
 assert.equal(me.vision.eyeHeight,.55);
 me.vx=1;me.vz=0;state.simulationAgeSeconds+=120;
 assert.deepEqual(ids(vision.observe(me)),['SIDE']);
 assert.equal(me.vision.heading,Math.PI/2);
 me.vx=me.vz=0;state.simulationAgeSeconds+=120;
 assert.deepEqual(ids(vision.observe(me)),['SIDE']);
 assert.equal(me.vision.heading,Math.PI/2);
});

test('solid buildings block people and fires, but a clear elevated ray sees over their roofs',()=>{
 const me=actor('ME',0,0),person=actor('OTHER',0,30),wall={id:'WALL',x:0,z:15,w:12,d:3,h:8},burning={id:'BURNING',x:0,z:42,w:10,d:8,h:5};
 const {state,vision}=fixture([me,person],[wall,burning]);state.urbanWorld.fires=[{id:'FIRE',buildingId:'BURNING',intensity:80}];
 const lower=vision.observe(me);assert.ok(ids(lower).includes('WALL'));assert.ok(!ids(lower).includes('OTHER'));assert.ok(!ids(lower).includes('FIRE'));
 me.y=person.y=15;state.simulationAgeSeconds+=120;
 const elevated=vision.observe(me);assert.ok(ids(elevated).includes('OTHER'),'true3Dray clears roof, unlike2Dwalltest');
});

test('a nearby visible facade fire is seen once, while a contained or distant fire supplies no knowledge',()=>{
 const me=actor('ME',0,0),b={id:'HOUSE',x:0,z:25,w:10,d:10,h:8};const {state,vision}=fixture([me],[b]);
 state.urbanWorld.fires=[{id:'FIRE',buildingId:'HOUSE',intensity:90}];
 let sights=vision.observe(me);assert.ok(ids(sights).includes('FIRE'));assert.equal(sights.find(s=>s.id==='FIRE').source,'seen');
 state.urbanWorld.fires[0].containedAt=240;state.simulationAgeSeconds+=120;
 assert.ok(!ids(vision.observe(me)).includes('FIRE'));
});

test('unknown people reveal tracking identity and position, never names or private/country/player information',()=>{
 const me=actor('ME',0,-550),unknown=actor('OTHER',0,-575,{name:'Secret name',money:99999,brain:{id:'SECRET-BRAIN'},citizenshipCountryId:'north-city',action:'private intent'});
 // Look north from Hansdrex: a foreign riverbank is visible if physically clear.
 me.vz=-1;const {vision}=fixture([me,unknown]);const seen=vision.observe(me).find(s=>s.id==='OTHER');assert.ok(seen);
 assert.equal(seen.name,undefined);assert.equal(seen.money,undefined);assert.equal(seen.brain,undefined);assert.equal(seen.citizenshipCountryId,undefined);assert.equal(seen.action,undefined);
 assert.deepEqual(Object.keys(seen).sort(),['kind','id','x','y','z','distance','confidence','source','observedAt'].sort());
 assert.ok(seen.confidence>0&&seen.confidence<=1);
});

test('recognized family/friends may be named, but dead or hidden indoors people cannot be seen from the street',()=>{
 const me=actor('ME',0,0,{partnerId:'PARTNER'}),partner=actor('PARTNER',0,15,{name:'Known partner'}),dead=actor('DEAD',1,10,{alive:false}),hidden=actor('HIDDEN',2,12,{indoors:true}),plane=actor('PLANE',-1,11,{onPlane:true});
 const {vision}=fixture([me,partner,dead,hidden,plane]);const sights=vision.observe(me);assert.deepEqual(ids(sights),['PARTNER']);assert.equal(sights[0].name,'Known partner');
});

test('inside a home eyes only see nearby physically present household peers in the same room',()=>{
 const me=actor('ME',0,0,{indoors:true,householdId:'HH',currentLocationId:'HOME'}),roommate=actor('ROOMMATE',0,3,{indoors:true,householdId:'HH',currentLocationId:'HOME'}),neighbor=actor('NEIGHBOR',1,3,{indoors:true,householdId:'OTHER-HH',currentLocationId:'HOME'}),otherRoom=actor('OTHER-ROOM',-1,4,{indoors:true,householdId:'HH',currentLocationId:'CAFE'}),street=actor('STREET',0,4),distant=actor('FAR-FAMILY',0,20,{indoors:true,householdId:'HH',currentLocationId:'HOME'});
 const {vision}=fixture([me,roommate,neighbor,otherRoom,street,distant],[{id:'HOME',x:0,z:0,w:20,d:20,h:12}]);
 const sights=vision.observe(me);assert.deepEqual(ids(sights),['ROOMMATE']);assert.equal(sights[0].name,'Person ROOMMATE');
});

test('diagonal grid-corner walls occlude rays without sampling gaps',()=>{
 const me=actor('ME',0,0,{vx:1,vz:1}),other=actor('OTHER',60,60),thin={id:'THIN',x:32,z:32,w:.2,d:.2,h:10};
 const {vision}=fixture([me,other],[thin]);assert.ok(!ids(vision.observe(me)).includes('OTHER'));
});

test('nearby vehicles are visible but hidden drivers and destroyed vehicles do not expose identities',()=>{
 const me=actor('ME',0,0),driver=actor('DRIVER',0,20,{traveling:true,transitMode:'car'});const {state,vision}=fixture([me,driver]);
 state.industrialEconomy={trucks:[{id:'TRUCK',x:4,y:1.1,z:25},{id:'BROKEN',x:-4,y:1.1,z:20,destroyed:true}]};
 const seen=vision.observe(me);assert.ok(ids(seen).includes('vehicle:DRIVER'));assert.ok(ids(seen).includes('TRUCK'));assert.ok(!ids(seen).includes('DRIVER'));assert.ok(!ids(seen).includes('BROKEN'));assert.ok(seen.every(s=>s.kind==='vehicle'));
});

test('one shared spatial index bounds1000 decisions and each resident keeps at most8 sightings',()=>{
 const people=Array.from({length:1000},(_,i)=>actor('P-'+i,(i%40)*9,Math.floor(i/40)*9));const {vision}=fixture(people);
 for(const p of people){const observations=vision.observe(p);assert.ok(observations.length<=8);assert.equal(p.vision.observations,observations);}
 const stats=vision.stats();assert.equal(stats.indexBuilds,1);assert.ok(stats.nodeVisits<=1000*RESIDENT_VISION_RULES.maxNodeVisits);assert.ok(stats.candidateChecks<=64000);assert.ok(stats.occlusionTests<=192000);
 const again=vision.observe(people[0]);assert.equal(again,people[0].vision.observations);assert.equal(vision.stats().cacheHits,1);
});

test('closing eyes or entering an opaque vehicle clears the last percept, then seeing resumes immediately on exit',()=>{
 const me=actor('ME',0,0),other=actor('OTHER',0,10);const {state,vision}=fixture([me,other]);
 assert.ok(ids(vision.observe(me)).includes('OTHER'));
 for(const flag of ['onPlane','onTrain','heliPassenger','onPrivateHelicopter','sleeping','eyesClosed']){
  me[flag]=true;state.simulationAgeSeconds++;
  assert.deepEqual(vision.observe(me),[]);assert.deepEqual(me.vision.observations,[]);
  assert.equal(me.vision.available,false);assert.equal(me.vision.lastObservedAt,state.simulationAgeSeconds);
  assert.equal(me.vision.unavailableReason,['sleeping','eyesClosed'].includes(flag)?'eyes_closed':'inside_vehicle');
  me[flag]=false;
  assert.ok(ids(vision.observe(me)).includes('OTHER'),'unavailable cached perception cannot suppress reopening eyes');
 }
 const dead=actor('DEAD',0,0,{alive:false});assert.deepEqual(vision.observe(dead),[]);assert.equal(dead.vision,undefined);
});

test('known names stay complete and knowledge of a stranger name is never inferred from a global profile',()=>{
 const name='A deliberately long public venue name '.repeat(5),me=actor('ME',0,0),b={id:'VENUE',name,x:0,z:20,w:10,d:8,h:10},other=actor('OTHER',10,15,{name:'A real introduction'});
 const {state,vision}=fixture([me,other],[b]);assert.equal(vision.observe(me).find(s=>s.id==='VENUE').name,name);
 assert.equal(me.vision.observations.find(s=>s.id==='OTHER').name,undefined);
 me.selfModel={seenPeople:[{id:'OTHER',name:'A real introduction'}]};state.simulationAgeSeconds+=120;
 assert.equal(vision.observe(me).find(s=>s.id==='OTHER').name,'A real introduction');
});

test('physically present F1 foreign guests share the scene index without spawning knowledge of future or hidden passengers',()=>{
 const me=actor('ME',0,0),visible=actor('F1-SEEN',0,12,{kind:'visitor',phase:'visiting',name:'Unknown foreign guest'}),previous=actor('F1-PREVIOUS',3,14,{kind:'visitor',phase:'visiting'});
 const {state,vision}=fixture([me]);
 state.northF1={event:{charters:[{inboundAt:0,guests:[visible,{id:'F1-FUTURE',alive:true,phase:'inbound'},actor('F1-PLANE',0,10,{phase:'inbound',onPlane:true}),actor('F1-INDOORS',0,11,{phase:'visiting',indoors:true}),actor('F1-GONE',0,9,{phase:'departed'}),actor('F1-DENIED',0,8,{phase:'denied'}),actor('F1-CANCELLED',0,7,{phase:'cancelled'})]},{inboundAt:99999,guests:[actor('F1-UNARRIVED',0,5,{phase:'inbound',onPlane:false})]}]},previousTours:[{charters:[{inboundAt:0,guests:[previous]}]}]};
 state.cityVisitors={visitors:[visible]};
 const sights=vision.observe(me);
 assert.deepEqual(ids(sights),['F1-SEEN','F1-PREVIOUS']);
 assert.equal(sights.filter(s=>s.id==='F1-SEEN').length,1,'the same active guest cannot be perceived twice through two registries');
 assert.ok(sights.every(s=>s.kind==='resident'&&s.name===undefined&&s.source==='seen'));
});
