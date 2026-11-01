import test from 'node:test';import assert from 'node:assert/strict';
import {createResidentRelationships,RELATIONSHIP_RULES} from '../worker/resident-relationships.mjs';
import {LOCATIONS,pedestrianRoute} from '../worker/city-map.mjs';
const person=(id,x=15,z=-48)=>({id,name:id,alive:true,kind:'resident',ageYears:30,health:95,energy:90,hunger:10,stress:30,loneliness:70,happiness:55,money:300,savings:700,traits:{empathy:.9,sociability:.8,risk:.2},brain:{},friends:[],parents:[],children:[],householdId:'HH-'+id,homeId:'apt-north',homeX:15,homeZ:-330,x,y:1.1,z,vx:0,vz:0,currentLocationId:'park',traveling:false,indoors:false,sleeping:false,action:'resting'});
function setup(people=[person('A'),person('B')]){
 let state={simulationAgeSeconds:0,flies:people,housing:{households:{}},businesses:{},totalTransactions:0},draw=.9,blocked=false,care=0,finance=0,moves=0,system;const memories=[],events=[];
 const hooks={world:()=>state,random:()=>draw,emit:(type,text,payload)=>events.push({type,text,...payload}),remember:(f,kind,payload)=>memories.push({id:f.id,kind,...payload}),urbanWorld:{isUnavailable:()=>blocked},neuralDrive:()=>.5,
 startJourney:(f,{id,action})=>{const l=LOCATIONS.find(l=>l.id===id),dest=id===f.homeId?{...l,x:f.homeX,z:f.homeZ}:l;f.routeWaypoints=pedestrianRoute(f,dest);f.routeIndex=0;f.targetLocationId=id;f.action=action;f.traveling=Boolean(f.routeWaypoints.length);f.indoors=false;},
 moveFly:f=>{moves++;if(!f.traveling)return;const p=f.routeWaypoints[f.routeIndex++];Object.assign(f,{x:p.x,z:p.z});if(f.routeIndex>=f.routeWaypoints.length){f.traveling=false;f.currentLocationId=f.targetLocationId;if(f.currentLocationId===f.homeId){f.x=f.homeX;f.z=f.homeZ;f.indoors=true;}}},needsAndActivities:()=>care++,payAndFinance:()=>finance++};
 const build=()=>{system=createResidentRelationships(hooks);system.init();};build();
 return {get s(){return state;},get c(){return system;},memories,events,get care(){return care;},get finance(){return finance;},get moves(){return moves;},set random(v){draw=v;},set blocked(v){blocked=v;},tick(seconds=600){state.simulationAgeSeconds+=seconds;system.tick(seconds,{day:Math.floor(state.simulationAgeSeconds/86400)+1,hour:12});},handle(f){return system.handleResident(f,{hour:12});},choose(f){const choices=[];system.addChoices(f,{hour:12},(id,action,utility)=>choices.push({id,action,utility}));return choices;},restore(){state=JSON.parse(JSON.stringify(state));build();},get hooks(){return hooks;}};
}
function formFriends(h){for(let n=0;n<5;n++)h.tick();}
const money=s=>s.flies.reduce((sum,f)=>sum+f.money+f.savings,0);
test('only real outdoor peers meet, including across spatial cell borders; no remote/working/traveling encounters',()=>{
 const a=person('A',15.9),b=person('B',16.1),far=person('FAR',100),inside=person('INSIDE'),travel=person('TRAVEL'),worker=person('WORKER');inside.indoors=true;travel.traveling=true;worker.action='working as a cook';
 const h=setup([a,b,far,inside,travel,worker]);h.tick();assert.equal(h.c.snapshot().encounters,1);assert.ok(a.socialTies.B);assert.ok(b.socialTies.A);for(const f of [far,inside,travel,worker])assert.equal(Object.keys(f.socialTies).length,0);assert.ok(!a.friends.length,'one meeting is not an instant friendship');
});
test('repeated positive contacts create independent bounded friendships and genuine negative experience changes trust',()=>{
 const h=setup();formFriends(h);const [a,b]=h.s.flies;assert.deepEqual(a.friends,['B']);assert.deepEqual(b.friends,['A']);assert.equal(h.c.snapshot().friendshipsFormed,1);const trust=a.socialTies.B.trust;
 a.stress=b.stress=100;a.traits.empathy=b.traits.empathy=0;h.random=0;h.tick();assert.ok(a.socialTies.B.trust<trust);assert.equal(h.c.snapshot().negativeEncounters,1);assert.ok(h.memories.some(m=>m.kind==='negative_social_experience'));
 for(let i=0;i<40;i++){const f=person('NEW-'+i);f.socialTies={};h.s.flies.push(f);h.random=.9;h.tick();}
 assert.ok(h.s.flies.every(f=>Object.keys(f.socialTies).length<=RELATIONSHIP_RULES.maxTies));assert.ok(h.s.flies.every(f=>f.socialMemories.length<=8));assert.ok(h.s.residentRelationships.lastCandidateChecks<=h.s.flies.length*36);
});
test('a friend visit follows real route and requires shared onsite time, with care/finance exactly once per handler',()=>{
 const h=setup();formFriends(h);const [a,b]=h.s.flies;a.x=-154;a.z=-29;a.currentLocationId='metro-industrial';a.loneliness=90;const before=money(h.s),choices=h.choose(a),choice=choices.find(c=>c.action.includes('friend'));assert.ok(choice);
 h.hooks.startJourney(a,choice);assert.ok(a.traveling);const origin={x:a.x,z:a.z};assert.ok(h.handle(a));assert.ok(a.socialTask);assert.equal(a.socialTask.onsiteSeconds,0);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>12,'first movement sample cannot complete a remote visit');assert.ok(Math.hypot(a.x-origin.x,a.z-origin.z)<40);
 for(let n=0;n<300&&a.traveling;n++){h.tick(10);h.handle(a);}assert.equal(a.traveling,false);assert.ok(a.socialTask);const deadline=h.s.simulationAgeSeconds+3000;
 while(a.socialTask&&h.s.simulationAgeSeconds<deadline){h.tick(300);h.handle(a);}
 assert.equal(a.socialTask,null);assert.equal(h.c.snapshot().completedVisits,1);assert.equal(h.care,h.finance);assert.equal(money(h.s),before);assert.ok(h.memories.some(m=>m.kind==='completed_social_commitment'));
});
test('household care needs a real co-located sick household member and time; it is not remote medical healing',()=>{
 const a=person('CARER',15,-330),p=person('PATIENT',15,-330);Object.assign(a,{householdId:'HOME',currentLocationId:'apt-north',indoors:true});Object.assign(p,{householdId:'HOME',currentLocationId:'apt-north',indoors:true,health:55,illness:'fatigue',stress:85});
 const h=setup([a,p]);h.s.housing.households.HOME={members:[a.id,p.id]};const before=money(h.s),health=p.health,stress=p.stress,choice=h.choose(a).find(c=>c.action.includes('household care'));assert.ok(choice);a.action=choice.action;assert.ok(h.handle(a));assert.equal(h.c.snapshot().completedCare,0);assert.equal(p.health,health);
 h.tick(600);h.handle(a);assert.equal(h.c.snapshot().careMinutes,10);assert.ok(p.stress<stress);assert.equal(p.health,health,'support does not impersonate medical treatment');const halfway=h.c.snapshot().careMinutes;h.restore();const carer=h.s.flies[0],patient=h.s.flies[1];assert.equal(h.c.snapshot().careMinutes,halfway);
 for(let n=0;n<6&&carer.socialTask;n++){h.tick(600);h.handle(carer);}assert.equal(h.c.snapshot().completedCare,1);assert.equal(h.c.snapshot().careMinutes,30);assert.equal(patient.socialProfile.receivedCareMinutes,30);assert.equal(money(h.s),before);assert.ok(h.c.supportSignal(patient)>0);
 h.handle(carer);assert.equal(h.c.snapshot().completedCare,1);assert.equal(h.c.snapshot().careMinutes,30,'completed care cannot credit twice');
});
test('same home label in a different household/location cannot provide remote care; unavailable buildings cancel commitments',()=>{
 const a=person('A'),p=person('P');Object.assign(p,{illness:'fatigue',health:55,currentLocationId:'apt-north',indoors:true,householdId:'OTHER',homeX:245,homeZ:12,x:245,z:12});const h=setup([a,p]);h.s.housing.households[a.householdId]={members:[a.id]};assert.ok(!h.choose(a).some(c=>c.action.includes('care')));
 // A corrupted/old membership list does not override the physical/home and household checks.
 h.s.housing.households[a.householdId].members.push(p.id);assert.ok(!h.choose(a).some(c=>c.action.includes('care')));
 p.homeX=a.homeX;p.homeZ=a.homeZ;p.x=a.homeX;p.z=a.homeZ;assert.ok(!h.choose(a).some(c=>c.action.includes('care')),'even co-located apartments with the same generic home label are not the same household');p.householdId=a.householdId;const choice=h.choose(a).find(c=>c.action.includes('care'));assert.ok(choice);a.action=choice.action;h.hooks.startJourney(a,choice);h.handle(a);assert.ok(a.socialTask);h.blocked=true;assert.equal(h.handle(a),false);assert.equal(a.socialTask,null);assert.equal(h.c.snapshot().completedCare,0);
});
test('emergency, service and work commitments cannot be stolen; recipient departure cancels without teleporting anyone',()=>{
 const h=setup();formFriends(h);const a=h.s.flies[0];for(const field of ['urbanTask','civicDuty','cityService','taxiJobId','taxiPassenger','privateFlight','onPrivateHelicopter','sportsSession','fireEngineDuty','ambulanceDuty','onFireEngine','onAmbulance','urbanFloodEscape','emergencyTask']){a[field]={};assert.equal(h.choose(a).length,0,field);delete a[field];}
 a.action='working as a teacher';assert.equal(h.choose(a).length,0);a.action='resting';const choice=h.choose(a).find(c=>c.action.includes('friend'));assert.ok(choice);a.action=choice.action;h.handle(a);assert.ok(a.socialTask);const b=h.s.flies[1],position={x:b.x,z:b.z};b.traveling=true;assert.equal(h.handle(a),false);assert.equal(a.socialTask,null);assert.equal(b.x,position.x);assert.equal(b.z,position.z);assert.equal(h.c.snapshot().completedVisits,0);
});
test('dead friends leave active support and free tie capacity while a bounded loss memory persists',()=>{
 const h=setup();formFriends(h);const [a,b]=h.s.flies;b.alive=false;h.tick(600);assert.ok(!a.friends.includes(b.id));assert.equal(h.c.snapshot().friendships,0);h.tick(86400);assert.ok(!a.friends.includes(b.id));assert.ok(!a.socialTies[b.id]);assert.ok(h.memories.some(m=>m.kind==='lost_social_contact'));assert.equal(h.c.supportSignal(a),0);h.restore();assert.ok(!h.s.flies[0].friends.includes(b.id));
});
test('old checkpoints retain named legacy friends without fabricated contacts and migrate idempotently',()=>{
 const a=person('A'),b=person('B');a.friends=['B'];b.friends=['A'];const h=setup([a,b]);assert.ok(a.socialTies.B.legacy);assert.equal(a.socialTies.B.contacts,0);assert.equal(a.socialTies.B.lastMetAt,null);assert.deepEqual(a.friends,['B']);const saved=structuredClone(a.socialTies.B);h.restore();assert.deepEqual(h.s.flies[0].socialTies.B,saved);assert.equal(h.c.supportSignal(h.s.flies[0]),0,'unknown legacy contact time must not count as recent actual support');
});
test('real engine preserves a timed friend visit, independent brain identity and selected observer profile across restore',async()=>{
 const engine=await import('../worker/civilization-engine.mjs');engine.setNeuralSyncEnabled(false);const s=engine.freshState(),[a,b]=s.flies.filter(f=>f.ageYears>=18&&f.ageYears<70).slice(0,2);
 s.weather={...s.weather,precipitation:0,danger:0,wind:0};for(const f of s.flies)if(f!==a&&f!==b){f.sleeping=true;f.indoors=true;}
 for(const f of [a,b])Object.assign(f,{x:15,z:-48,currentLocationId:'park',traveling:false,indoors:false,sleeping:false,action:'resting',actionUntil:0,energy:95,hunger:10,thirst:10,health:95,stress:10,loneliness:90,jobId:null,vehicle:null,cityService:null,urbanTask:null,privateFlight:null,sportsSession:null,civicDuty:null,socialTask:null,traits:{...f.traits,empathy:1,sociability:1}});
 for(let n=0;n<5;n++){s.simulationAgeSeconds+=600;engine.residentRelationships.tick(600,engine.gameClock());}
 assert.ok(a.friends.includes(b.id));const brainId=a.brain.id;
 Object.assign(a,{x:15,z:-14.5,indoors:true,currentLocationId:'cafe',householdId:'RELATIONSHIP-TEST-HH',vehicle:null,money:0,savings:0,transitPass:false,action:'resting'});
 const choices=[];engine.residentRelationships.addChoices(a,{hour:12},(id,action,utility)=>choices.push({id,action,utility}));const choice=choices.find(c=>c.action.includes('friend'));assert.ok(choice);engine.startJourney(a,choice);assert.ok(a.traveling);const origin={x:a.x,z:a.z};
 engine.tickFly(a,engine.gameClock());assert.ok(a.socialTask);assert.equal(a.socialTask.onsiteSeconds,0);assert.ok(Math.hypot(a.x-origin.x,a.z-origin.z)<10,'ordinary engine motion must not teleport to the friend');
 for(let n=0;n<180&&a.socialTask;n++){s.simulationAgeSeconds+=120;engine.residentRelationships.tick(120,engine.gameClock());engine.tickFly(a,engine.gameClock());}
 assert.equal(engine.residentRelationships.snapshot().completedVisits,1);assert.equal(a.socialTask,null);assert.equal(a.brain.id,brainId);
 const selected=engine.getState({observer:true,selectedId:a.id}).flies.find(f=>f.id===a.id);assert.ok(selected.relationships.friends.includes(b.id));assert.equal(selected.relationships.profile.completedVisits,1);
 engine.restoreState(structuredClone(s));const restored=engine.getRawState().flies.find(f=>f.id===a.id);assert.equal(restored.brain.id,brainId);assert.equal(restored.socialProfile.completedVisits,1);assert.equal(engine.residentRelationships.snapshot().completedVisits,1);engine.tickFly(restored,engine.gameClock());assert.equal(engine.residentRelationships.snapshot().completedVisits,1,'restore cannot award the same visit twice');
});
