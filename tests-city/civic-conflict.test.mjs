import test from 'node:test';import assert from 'node:assert/strict';
import {createCivicConflict,CIVIC_RULES} from '../worker/civic-conflict.mjs';
import {LOCATIONS,pedestrianRoute} from '../worker/city-map.mjs';
const person=(id,x=-154,z=-29)=>({id,alive:true,ageYears:30,health:95,energy:95,hunger:10,stress:90,money:1200,savings:500,politicalInterest:.9,partyId:'PARTY-A',traits:{risk:.9,empathy:.1},brain:{},x,y:1.1,z,vx:0,vz:0,traveling:false,indoors:false,currentLocationId:'market',action:'resting',lawAwareness:.3});
function setup(){
 let state={simulationAgeSeconds:0,flies:[person('A'),person('B')],businesses:{},totalTransactions:0};state.flies[1].partyId='PARTY-B';const events=[],memories=[],fires=[];let care=0,finance=0,system;
 const hooks={world:()=>state,random:()=>0,emit:(type,text,payload)=>events.push({type,text,...payload}),remember:(f,kind,payload)=>memories.push({id:f.id,kind,...payload}),urbanWorld:{isUnavailable:()=>false,ignite:(id,reason)=>{fires.push({id,reason});return {id};}},startJourney:(f,{id,action})=>{const l=LOCATIONS.find(l=>l.id===id),route=pedestrianRoute(f,l);f.routeWaypoints=route;f.routeIndex=0;f.targetLocationId=id;f.action=action;f.traveling=Boolean(route.length);},moveFly:f=>{if(!f.traveling)return;const point=f.routeWaypoints[f.routeIndex++];Object.assign(f,{x:point.x,z:point.z});if(f.routeIndex>=f.routeWaypoints.length){f.traveling=false;f.currentLocationId=f.targetLocationId;}},needsAndActivities:()=>care++,payAndFinance:()=>finance++};
 const build=()=>{system=createCivicConflict(hooks);system.init();state.civicConflict.nextCheckAt=Infinity;};build();
 return {get s(){return state;},get c(){return system;},events,memories,fires,get care(){return care;},get finance(){return finance;},step(dt=120,move=true){state.simulationAgeSeconds+=dt;system.tick(dt,{hour:12});if(move)for(const f of state.flies)system.handleResident(f,{hour:12});},restore(){state=JSON.parse(JSON.stringify(state));build();}};
}
const supply=s=>s.flies.reduce((n,f)=>n+f.money+f.savings,0)+Object.values(s.businesses).reduce((n,b)=>n+b.cash,0);
test('assemblies require physical arrival before debate and consequences; walkers receive care exactly once',()=>{
 const h=setup(),i=h.c.startAssembly(h.s.flies[0]);assert.ok(i);assert.ok(h.c.join(h.s.flies[1],i));assert.ok(h.s.flies.every(f=>f.traveling));i.tension=95;
 h.step(1900,false);assert.equal(i.phase,'gathering');assert.equal(h.c.snapshot().injuries,0);assert.equal(h.c.snapshot().active[0].members.filter(m=>m.present).length,0);
 for(let n=0;n<120&&h.s.flies.some(f=>f.traveling);n++)h.step(10);
 assert.ok(h.s.flies.every(f=>!f.traveling));assert.ok(h.memories.some(m=>m.kind==='attended_assembly'));assert.equal(h.care,h.finance);assert.ok(h.care>0);
});
test('fictional equipment uses finite paid inventory and survives restart without duplicate payment',()=>{
 const h=setup(),f=h.s.flies[0],total=supply(h.s),cash=f.money;assert.ok(h.c.buyEquipment(f));assert.equal(f.money,cash-CIVIC_RULES.equipmentPrice);assert.equal(supply(h.s),total);assert.equal(h.s.businesses['civic-equipment'].inventory,79);
 assert.equal(h.c.buyEquipment(f),false);h.restore();assert.equal(h.c.buyEquipment(h.s.flies[0]),false);assert.equal(h.s.civicConflict.equipmentRevenue,CIVIC_RULES.equipmentPrice);assert.equal(supply(h.s),total);assert.equal(h.s.flies[0].civicEquipment.charges,CIVIC_RULES.charges);
});
test('opposing physical factions can escalate; mediation and police must actually arrive to deescalate',()=>{
 const h=setup(),park=LOCATIONS.find(l=>l.id==='park');for(const f of h.s.flies)Object.assign(f,{x:park.x,z:park.z,currentLocationId:'park'});const i=h.c.startAssembly(h.s.flies[0]);assert.ok(h.c.join(h.s.flies[1],i));assert.ok(h.c.buyEquipment(h.s.flies[0]));i.tension=90;
 h.step(1900);assert.equal(i.phase,'unrest');assert.equal(h.s.civicConflict.unrestIncidents,1);assert.equal(h.s.civicConflict.injuries,1);assert.ok(h.s.flies[1].health<95);
 const officer=person('OFFICER');officer.jobId='police';officer.traits={risk:.2,empathy:.8};h.s.flies.push(officer);assert.ok(h.c.join(officer,i,'police'));const mediator=person('MEDIATOR');mediator.traits={risk:.1,empathy:1};h.s.flies.push(mediator);assert.ok(h.c.join(mediator,i,'mediator'));
 const initialMediation=i.mediation;h.step(600,false);assert.equal(i.mediation,initialMediation,'traveling responders cannot mediate');
 for(let n=0;n<2000&&h.s.flies.some(f=>f.traveling);n++)h.step(10);assert.ok(!officer.traveling&&!mediator.traveling);const injuries=h.s.civicConflict.injuries;
 for(let n=0;n<20&&h.s.civicConflict.active.length;n++)h.step(600);
 assert.equal(h.s.civicConflict.active.length,0);assert.equal(h.s.civicConflict.history.length,1);assert.equal(h.s.civicConflict.injuries,injuries);assert.ok(h.s.flies.every(f=>!f.civicDuty));assert.ok(h.s.flies.every(f=>f.health>=8));
});
test('capacity and essential work commitments prevent assemblies from stealing actors',()=>{
 const h=setup();for(const field of ['urbanTask','cityService','taxiJobId','taxiPassenger','privateFlight','onPrivateHelicopter','sportsSession','onPlane','onTrain','displacedFrom']){
  const f=person(field);f[field]={};assert.equal(h.c.startAssembly(f),null,field);
 }
 for(const jobId of ['doctor','school','police','power','power-evening','power-night','grid-dispatch']){const f=person(jobId);f.jobId=jobId;assert.equal(h.c.startAssembly(f),null,jobId);}
 const p=LOCATIONS.find(l=>l.id==='park');for(const f of h.s.flies)Object.assign(f,{x:p.x,z:p.z,currentLocationId:p.id});const i=h.c.startAssembly(h.s.flies[0]);
 for(let n=0;n<20;n++){const f=person('JOIN-'+n,p.x,p.z);h.s.flies.push(f);h.c.join(f,i);}
 assert.equal(i.members.length,CIVIC_RULES.maxParticipants);const second=h.c.startAssembly(h.s.flies[1],{locationId:'riverside-park'});assert.ok(second);assert.equal(h.c.startAssembly(person('EXTRA')),null);
});
test('restore preserves incident reservations and a resolution settles once with bounded memories/history',()=>{
 const h=setup(),p=LOCATIONS.find(l=>l.id==='park');for(const f of h.s.flies)Object.assign(f,{x:p.x,z:p.z,currentLocationId:p.id});const i=h.c.startAssembly(h.s.flies[0]);h.c.join(h.s.flies[1],i);h.restore();const restored=h.s.civicConflict.active[0];assert.equal(restored.id,i.id);assert.equal(h.s.flies[0].civicDuty.incidentId,i.id);const total=supply(h.s);assert.ok(h.c.resolve(restored));assert.equal(h.c.resolve(restored),false);assert.equal(h.c.resolve(i),false,'a pre-restore reference cannot settle a closed assembly');assert.equal(h.c.join(h.s.flies[0],i),false,'a stale reference cannot reserve an orphan duty');assert.equal(h.s.civicConflict.peacefulResolutions,1);assert.equal(supply(h.s),total);assert.ok(h.s.flies.every(f=>!f.civicDuty));
 for(let n=0;n<30;n++){const x=h.c.startAssembly(h.s.flies[0]);assert.ok(x);h.c.resolve(x);}
 assert.equal(h.s.civicConflict.history.length,20);assert.ok(h.s.flies[0].civicMemories.length<=6);
});
test('ordinary low-tension civic debate resolves peacefully and abstainers remain unassigned',()=>{
 const h=setup(),p=LOCATIONS.find(l=>l.id==='park');for(const f of h.s.flies)Object.assign(f,{x:p.x,z:p.z,currentLocationId:p.id,stress:10,partyId:'PARTY-A',traits:{risk:.1,empathy:.9}});const i=h.c.startAssembly(h.s.flies[0]);h.c.join(h.s.flies[1],i,'mediator');const abstainer=person('ABSTAIN');h.s.flies.push(abstainer);
 for(let n=0;n<24&&h.s.civicConflict.active.length;n++)h.step(600);assert.equal(h.s.civicConflict.peacefulResolutions,1);assert.equal(h.s.civicConflict.injuries,0);assert.equal(h.s.civicConflict.unrestIncidents,0);assert.ok(!abstainer.civicDuty);assert.ok(h.s.civicConflict.confidence>=75);
});
test('property damage requires a physically gathered violent group and ignites at most once per incident',()=>{
 const h=setup(),p=LOCATIONS.find(l=>l.id==='park');for(let n=2;n<4;n++)h.s.flies.push(person('GROUP-'+n));for(const [n,f]of h.s.flies.entries())Object.assign(f,{x:p.x,z:p.z,currentLocationId:p.id,partyId:n%2?'OPPOSITION':'GOVERNMENT',stress:100,traits:{risk:1,empathy:0}});
 const i=h.c.startAssembly(h.s.flies[0]);for(const f of h.s.flies.slice(1))assert.ok(h.c.join(f,i));i.tension=99;h.step(1900);assert.equal(i.phase,'unrest');assert.equal(h.fires.length,1);assert.equal(h.s.civicConflict.propertyIncidents,1);assert.ok(h.fires[0].reason.includes('civic unrest'));
 for(let n=0;n<4;n++)h.step(600);assert.equal(h.fires.length,1);h.restore();h.step(600);assert.equal(h.fires.length,1);
});
