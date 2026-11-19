import test from 'node:test';import assert from 'node:assert/strict';
import {createFruitFarm} from '../worker/fruit-farm.mjs';
import {HANSDREX_FRUIT_FARM as F} from '../worker/fruit-farm-map.mjs';
import {LOCATIONS,pedestrianRoute,parkingPoint} from '../worker/city-map.mjs';
function fixture(){let s={simulationAgeSeconds:0,flies:Array.from({length:30},(_,i)=>({id:`WORKER-${i}`,alive:true,ageYears:30,health:100,energy:100,hunger:10,money:50,x:1042,z:-660,currentLocationId:F.id,traveling:false})),treasury:{cash:100000},businesses:{'treasury:north-city':{cash:20000},market:{cash:3000,inventory:0},'north-market':{cash:3000,inventory:0}},totalTransactions:0};const requests=[];
 const hooks={world:()=>s,countryAccount:c=>c==='hansdrex'?s.treasury:s.businesses[`treasury:${c}`],transfer:(a,b,n)=>{if(a.cash<n)return false;a.cash-=n;b.cash=Number(b.cash||0)+n;return true;},startJourney:(f,c)=>{f.traveling=true;f.targetLocationId=c.id;},moveFly:f=>{const l=LOCATIONS.find(l=>l.id===f.targetLocationId);Object.assign(f,{x:l.x,z:l.z,currentLocationId:l.id,traveling:false});},requestShipment:o=>{requests.push(o);return o;}};
 let farm=createFruitFarm(hooks);farm.init();return {get s(){return s;},get farm(){return farm;},requests,step(dt=1800){s.simulationAgeSeconds+=dt;const c={hour:s.simulationAgeSeconds%86400/3600};farm.tick(dt,c);for(const f of s.flies)farm.handleResident(f,c);},restore(){s=structuredClone(s);farm=createFruitFarm(hooks);farm.init();}};
}
const money=s=>s.treasury.cash+Object.values(s.businesses).reduce((n,b)=>n+Number(b.cash||0),0)+s.flies.reduce((n,f)=>n+f.money,0);
test('new fruit farm has real reachable road access and recruits existing workers into three paid rotations',()=>{
 const t=fixture(),initial=money(t.s);assert.ok(pedestrianRoute({x:900,z:-400},LOCATIONS.find(l=>l.id===F.id)).length);assert.ok(parkingPoint(LOCATIONS.find(l=>l.id===F.id)));
 for(let i=0;i<20;i++)t.step();const snap=t.farm.snapshot();assert.equal(t.s.flies.length,30);assert.equal(snap.workers,24);assert.deepEqual(snap.shifts.map(s=>s.workers),[8,8,8]);assert.ok(snap.planted>0);assert.equal(snap.harvested,0);assert.ok(Math.abs(money(t.s)-initial)<1e-7);assert.ok(snap.wagesPaid>0);
 const workers=t.s.fruitFarm.employees.slice();t.restore();assert.deepEqual(t.s.fruitFarm.employees,workers);assert.ok(Math.abs(money(t.s)-initial)<1e-7);
});
test('each mature fruit plant yields exactly ten, with nine for sale and a seed that can only replant after real work',()=>{
 const t=fixture();for(let i=0;i<6;i++)t.step();
 const d=t.s.fruitFarm,staff=t.s.flies.find(f=>f.fruitFarmDuty&&f.preferredWorkStart===0);assert.ok(staff);
 for(const f of t.s.flies)if(f!==staff)f.energy=0;
 Object.assign(staff,{x:1022,z:-660,currentLocationId:'HANSDREX-FRUIT-FIELD',energy:100,traveling:false});
 d.beds=[{id:1,plantedAt:-86400,readyAt:1}];d.seeds=0;d.labour=0;d.nextOrderAt=Infinity;
 t.s.simulationAgeSeconds=3600;d.lastProductionAt=2700;t.farm.tick(900,{hour:1});
 assert.equal(d.harvested,10);assert.equal(t.farm.snapshot().inventory,9);assert.equal(d.retainedSeed,1);assert.equal(d.seeds,1);assert.equal(d.beds[0].readyAt,null);
 t.restore();const r=t.s.fruitFarm;t.s.simulationAgeSeconds+=900;t.farm.tick(900,{hour:1.25});assert.equal(r.harvested,10);assert.equal(t.farm.snapshot().inventory,9);assert.equal(r.seeds,0);assert.ok(r.beds[0].readyAt>t.s.simulationAgeSeconds);
 t.s.simulationAgeSeconds=r.beds[0].readyAt-1;t.farm.tick(900,{hour:1});assert.equal(r.harvested,10);
});
test('fruit wholesales reorder before zero and name physical North and Hans buyers instead of adding vendor inventory',()=>{
 const t=fixture();t.s.businesses[F.accountId].inventory=100;t.s.fruitFarm.nextOrderAt=0;t.step();
 assert.ok(t.requests.some(o=>o.product==='fruit'&&o.buyerId==='market'));assert.ok(t.requests.some(o=>o.product==='fruit'&&o.buyerId==='north-market'));assert.equal(t.s.businesses.market.inventory,0);assert.equal(t.s.businesses['north-market'].inventory,0);assert.ok(t.requests.every(o=>o.sourceLocationId===F.id&&o.quantity<=60));
});

test('the paid orchard can recruit lower-paid ordinary workers while retaining essential and better-paid jobs',()=>{
 const t=fixture();for(const f of t.s.flies)Object.assign(f,{jobId:'office',wage:10});
 Object.assign(t.s.flies[0],{jobId:'grocery',wage:3.1});Object.assign(t.s.flies[1],{jobId:'doctor',wage:2});Object.assign(t.s.flies[2],{jobId:'school',wage:2});
 t.step();assert.equal(t.s.flies[0].jobId,'hansdrex-fruit-grower');assert.equal(t.s.flies[0].wage,6);assert.equal(t.s.flies[0].fruitFarmDuty.previousJob,'grocery');
 assert.equal(t.s.flies[1].jobId,'doctor');assert.equal(t.s.flies[2].jobId,'school');assert.equal(t.s.flies[3].jobId,'office');assert.equal(t.farm.snapshot().workers,1);
});
