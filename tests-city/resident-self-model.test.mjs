import test from 'node:test';
import assert from 'node:assert/strict';
import {createResidentSelfModel,SELF_MODEL_LIMITS} from '../worker/resident-self-model.mjs';

function fixture(){
 const world={simulationAgeSeconds:1000,hiddenTreasury:999999,flies:[{id:'SECRET-PERSON',x:3,z:3,money:9999,indoors:true}],buildings:[{id:'SECRET-BASE',x:20,z:20,secretPlan:'not perceived'}]};
 const f={id:'A',name:'Ada',alive:true,health:100,energy:90,hunger:0,stress:0,loneliness:0,money:100,savings:100,homeId:'HOME',homeX:0,homeZ:0,householdId:'FAMILY',parents:['P'],children:['C'],partnerId:'PARTNER',workplaceId:'WORK',currentLocationId:'HOME',x:0,z:0};
 return{world,f,model:createResidentSelfModel({world:()=>world})};
}
const seen=(id,kind='building',extra={})=>({id,kind,x:20,z:0,distance:20,confidence:.9,source:'seen',observedAt:1000,...extra});

test('own identity comes from actual resident assignments, with no invented autobiography or hidden world knowledge',()=>{
 const {f,world,model}=fixture();model.observe(f,[]);
 const s=model.snapshot(f);
 assert.deepEqual(s.identity,{id:'A',name:'Ada',homeId:'HOME',householdId:'FAMILY',familyIds:['P','C','PARTNER'],workplaceId:'WORK'});
 assert.deepEqual(s.knownPlaces.map(p=>p.id),['HOME','WORK']);assert.equal(s.milestones.length,0);assert.equal(s.seenPeople.length,0);
 assert.ok(!JSON.stringify(s).includes('SECRET'));assert.ok(!JSON.stringify(s).includes(String(world.hiddenTreasury)));
 assert.equal(s.algorithmOnly,true);assert.equal('isReal' in s,false);assert.equal('conscious' in s,false);
 assert.equal(s.modeledAffect.source,'needs-and-observed-events');
});

test('only direct visible records become world beliefs; messages and hidden economic attributes remain unknown',()=>{
 const {f,model}=fixture();
 model.observe(f,[seen('VISIBLE-PERSON','resident',{money:9000,brain:{secrets:true}}),seen('CAFE','building',{name:'Cafe'}),seen('RUMOUR','building',{source:'message'}),seen('FUTURE','building',{observedAt:2000})]);
 let s=model.snapshot(f);assert.deepEqual(s.seenPeople.map(p=>p.id),['VISIBLE-PERSON']);
 assert.ok(s.knownPlaces.some(p=>p.id==='CAFE'));assert.ok(!s.knownPlaces.some(p=>['RUMOUR','FUTURE','SECRET-BASE'].includes(p.id)));
 assert.equal('money' in s.seenPeople[0],false);assert.equal('brain' in s.seenPeople[0],false);
 assert.equal(model.remember(f,'arrived',{locationId:'LIE',source:'rumor'}),false);
 assert.equal(model.remember(f,'claim',{locationId:'LIE',isReal:true}),false);
 assert.equal(model.remember(f,'hired',{residentId:'SOMEONE-ELSE',locationId:'OTHER-WORK'}),false);
 s=model.snapshot(f);assert.ok(!s.knownPlaces.some(p=>['LIE','OTHER-WORK'].includes(p.id)));
});

test('beliefs retain last-seen positions and become uncertain instead of reading unseen current positions',()=>{
 const {f,world,model}=fixture();model.observe(f,[seen('P','resident',{x:8,z:9}),seen('CAFE')]);
 const first=model.snapshot(f);world.simulationAgeSeconds+=86400*6;world.flies.push({id:'P',x:500,z:600});
 const later=model.snapshot(f);assert.equal(later.seenPeople[0].x,8);assert.equal(later.seenPeople[0].z,9);assert.equal(later.seenPeople[0].lastSeenAt,1000);
 assert.ok(later.seenPeople[0].confidence<first.seenPeople[0].confidence);assert.ok(later.knownPlaces.find(p=>p.id==='CAFE').confidence<.3);
 model.observe(f,[seen('P','resident',{x:12,z:13,observedAt:world.simulationAgeSeconds})]);
 assert.equal(model.snapshot(f).seenPeople[0].x,12);
});

test('persistent model bounds remain fixed and salient family/history milestones survive repetitive daily events',()=>{
 const {f,world,model}=fixture();
 model.remember(f,'child_born',{otherId:'C'},{at:500});
 for(let i=0;i<80;i++){
  world.simulationAgeSeconds+=700;
  model.observe(f,[seen('BUILDING-'+i,'building',{observedAt:world.simulationAgeSeconds}),seen('PERSON-'+i,'resident',{observedAt:world.simulationAgeSeconds})]);
  model.remember(f,'resident_restaurant_meal',{locationId:'BUILDING-'+i});
 }
 const s=model.snapshot(f);assert.equal(s.knownPlaces.length,SELF_MODEL_LIMITS.places);assert.equal(s.seenPeople.length,SELF_MODEL_LIMITS.people);assert.equal(s.milestones.length,SELF_MODEL_LIMITS.milestones);
 assert.ok(s.milestones.some(m=>m.kind==='child_born'&&m.otherId==='C'&&m.at===500));
 assert.ok(JSON.stringify(f.selfModel).length<9000);
 const restored=JSON.parse(JSON.stringify(f)),service=createResidentSelfModel({world:()=>world});
 assert.deepEqual(service.snapshot(restored),s);
 s.identity.familyIds.push('FAKE');s.milestones[0].kind='FAKE';assert.ok(!JSON.stringify(f.selfModel).includes('FAKE'),'inspector snapshots do not mutate persistent beliefs');
});

test('hunger, exhaustion, family and wages causally bias existing choices without inventing new known destinations',()=>{
 const {f,model}=fixture();model.observe(f,[seen('CAFE')]);
 assert.equal(model.bias(f,{id:'UNSEEN',type:'restaurant'},'eating a meal'),0);
 const fed=model.bias(f,'CAFE','eating a meal');f.hunger=90;
 const hungry=model.bias(f,'CAFE','eating a meal');assert.ok(hungry>fed+10);
 f.energy=10;f.loneliness=85;const home=model.bias(f,'HOME','resting at home');assert.ok(home>10);
 f.money=f.savings=0;assert.ok(model.bias(f,'WORK','working a shift')>5);
 const original=[{id:'CAFE',score:40},{id:'WORK',score:43}];
 const chosen=original.map(c=>({...c,score:c.score+model.bias(f,c.id,c.id==='CAFE'?'eating a meal':'working a shift')})).sort((a,b)=>b.score-a.score)[0];
 assert.equal(chosen.id,'CAFE','the learned need changes an otherwise work-favoring utility choice');
 for(const score of [hungry,home,model.bias(f,'WORK','working')])assert.ok(Math.abs(score)<=24);
});

test('visible fire and actual injuries cause bounded avoidance and shelter preference, then decay with evidence age',()=>{
 const {f,world,model}=fixture();f.hunger=95;model.observe(f,[seen('CAFE'),seen('FIRE-1','fire',{x:21,z:0})]);
 const threat=model.snapshot(f);assert.ok(threat.modeledAffect.fear>.8);assert.ok(threat.milestones.some(m=>m.kind==='noticed_fire'));
 assert.ok(model.bias(f,'CAFE','eating a meal')<0);assert.ok(model.bias(f,'HOME','sheltering at home')>0);
 const afraid=threat.modeledAffect.fear;world.simulationAgeSeconds+=86400;assert.ok(model.snapshot(f).modeledAffect.fear<afraid*.1);
 model.remember(f,'projectile_injury',{locationId:'CAFE',damage:30});
 assert.equal(model.snapshot(f).milestones.at(-1).outcome,-30);assert.ok(model.bias(f,'CAFE','walking')<0);
});

test('direct outcomes alter later destination choices and unrelated invented events are ignored',()=>{
 const {f,model}=fixture();model.observe(f,[seen('ROAD')]);const before=model.bias(f,'ROAD','driving');
 model.remember(f,'driving_outcome',{locationId:'ROAD',reward:-1.8});
 assert.ok(model.bias(f,'ROAD','driving')<before);assert.equal(model.remember(f,'I feel truly conscious',{locationId:'COSMOS'}),false);
 const count=model.snapshot(f).milestones.length;model.remember(f,'driving_outcome',{locationId:'ROAD',reward:-1.8});assert.equal(model.snapshot(f).milestones.length,count);
 f.homeId='NEW-HOME';f.homeX=50;model.observe(f,[]);assert.equal(model.snapshot(f).identity.homeId,'NEW-HOME');assert.ok(model.snapshot(f).knownPlaces.some(p=>p.id==='NEW-HOME'));
});

test('ordinary job holders know only their own employer assignment through the engine hook',()=>{
 const {f,world}=fixture();delete f.workplaceId;f.jobId='doctor';f.money=f.savings=0;
 const model=createResidentSelfModel({world:()=>world,workplaceFor:person=>person.jobId==='doctor'?{id:'CLINIC',x:70,z:35}:null});
 model.observe(f,[]);let s=model.snapshot(f);
 assert.equal(s.identity.workplaceId,'CLINIC');assert.deepEqual(s.knownPlaces.find(p=>p.id==='CLINIC'),{id:'CLINIC',source:'own-assignment',lastSeenAt:1000,confidence:.85,x:70,z:35});
 assert.ok(model.bias(f,'CLINIC','working a shift')>5);assert.equal(model.bias(f,'OTHER-EMPLOYER','working a shift'),0);
 f.jobId=null;model.observe(f,[]);s=model.snapshot(f);assert.equal(s.identity.workplaceId,null);assert.equal(model.bias(f,'CLINIC','working a shift'),0,'a remembered old workplace is not a current employment commitment');
});

test('modeled grief requires an actual partner-loss event and changes bounded comfort/rest choices before decaying',()=>{
 const {f,world,model}=fixture();model.observe(f,[]);
 const ordinaryHome=model.bias(f,'HOME','resting at home'),ordinaryComfort=model.snapshot(f).modeledAffect.comfort;
 model.observe(f,[]);world.flies=[];world.simulationAgeSeconds+=700;model.observe(f,[]);
 assert.equal(model.snapshot(f).modeledAffect.grief,0,'not seeing a partner cannot invent a death');
 assert.equal(model.remember(f,'lost_partner',{otherId:'PARTNER',source:'rumor'}),false);
 assert.equal(model.snapshot(f).modeledAffect.grief,0);
 f.partnerId=null;model.remember(f,'lost_partner',{otherId:'PARTNER'});
 let s=model.snapshot(f);assert.equal(s.modeledAffect.grief,1);assert.ok(s.modeledAffect.comfort<ordinaryComfort);
 assert.ok(model.bias(f,'HOME','resting at home')>ordinaryHome+5);assert.ok(model.bias(f,'HOME','resting at home')<=24);
 assert.ok(s.milestones.some(e=>e.kind==='lost_partner'&&e.otherId==='PARTNER'&&e.importance===5));
 for(let i=0;i<20;i++){world.simulationAgeSeconds+=700;model.remember(f,'resident_restaurant_meal',{locationId:'CAFE'});}
 s=model.snapshot(f);assert.ok(s.milestones.some(e=>e.kind==='lost_partner'));assert.equal(s.milestones.length,12);
 world.simulationAgeSeconds+=86400*12;assert.ok(model.snapshot(f).modeledAffect.grief<.02);assert.ok(model.bias(f,'HOME','resting at home')<ordinaryHome+1);
});
