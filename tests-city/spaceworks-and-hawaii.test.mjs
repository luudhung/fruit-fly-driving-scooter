import assert from 'node:assert/strict';
import test from 'node:test';
import {createSpaceProgram} from '../worker/space-program.mjs';
import {SPACEPORT,SPACEPORT_BUILDINGS,SPACEPORT_ROADS,spaceflightPose} from '../worker/spaceport-map.mjs';
import {HAWAII_APARTMENTS,HAWAII_ROADS,COUNTRY_AIRPORTS,countryAt} from '../worker/country-map.mjs';
import {BUILDINGS,ROADS,WATER,entrance,onIsland,overlaps,pedestrianRoute} from '../worker/city-map.mjs';

test('West City spaceworks and Hawaii apartments connect to dry ground without using an airport runway',()=>{
 for(const place of SPACEPORT_BUILDINGS){
  assert.equal(countryAt(place),'hansdrex');
  assert.ok(![...WATER,...ROADS,...COUNTRY_AIRPORTS.map(a=>a.runway)].some(b=>overlaps(place,b,1)),place.id);
  assert.ok(BUILDINGS.some(b=>b.id===place.id));
 }
 assert.ok(SPACEPORT_ROADS.some(r=>r.z+r.d/2===-400));
 assert.ok(pedestrianRoute({x:-760,z:-396},entrance(SPACEPORT_BUILDINGS[0])).length);
 assert.ok(!WATER.some(w=>overlaps(w,SPACEPORT)));
 assert.equal(HAWAII_APARTMENTS.length,3);
 for(const b of HAWAII_APARTMENTS){
  assert.ok(b.seasonal&&!b.primaryResidence&&b.capacity>0);
  assert.ok(!ROADS.some(r=>overlaps(r,b,.45)),b.id);
  assert.ok(pedestrianRoute(COUNTRY_AIRPORTS.find(a=>a.id==='island').gate,entrance(b)).every(p=>onIsland(p)));
 }
 for(const road of HAWAII_ROADS)for(const dx of [-road.w/2,road.w/2])for(const dz of [-road.d/2,road.d/2])assert.ok(onIsland({x:road.x+dx,z:road.z+dz}),road.id);
});

test('a civilian launch reserves real employer cash once and requires two kinds of onsite worker',()=>{
 let world={simulationAgeSeconds:100,flies:[],treasury:{cash:40000},businesses:{},weather:{},totalTransactions:0};
 const events=[];
 const hooks={world:()=>world,emit:(type)=>events.push(type),remember:()=>{},isUnavailable:()=>false,isWorkCommitted:()=>false};
 let service=createSpaceProgram(hooks);
 service.tick();assert.equal(world.treasury.cash,30000);assert.equal(world.businesses.spaceworks.cash,10000);
 const staff=(id)=>({id,jobId:null,currentLocationId:'spaceworks-control',x:-670,z:-459,alive:true,ageYears:35,energy:95,hunger:5,health:95,action:'applying to Hansdrex Spaceworks'});
 for(let i=0;i<4;i++)world.flies.push(staff('STAFF-'+i));
 for(const f of world.flies)service.finishApplication(f);
 assert.equal(service.snapshot().employees,4);
 const engineering=world.flies.find(f=>f.jobId==='spaceworks-engineer');
 const operations=world.flies.find(f=>f.jobId==='spaceworks-operations');
 Object.assign(engineering,{currentLocationId:'spaceworks-assembly',indoors:true,action:'working as engineer'});
 world.simulationAgeSeconds+=900;service.tick();assert.equal(service.snapshot().active,null);
 Object.assign(operations,{currentLocationId:'spaceworks-control',indoors:true,action:'working as controller'});
 world.weather.precipitation=.9;world.simulationAgeSeconds+=900;service.tick();assert.equal(service.snapshot().active,null);
 world.weather.precipitation=0;world.simulationAgeSeconds+=900;service.tick();
 const mission=service.snapshot().active;assert.ok(mission);assert.equal(world.businesses.spaceworks.cash,9100);
 assert.equal(world.businesses['spaceworks-supply'].cash,900);
 assert.equal(spaceflightPose(mission.departure,mission).firing,false);
 assert.ok(spaceflightPose(mission.departure+1100,mission).y>100);
 world=structuredClone(world);service=createSpaceProgram(hooks);
 world.simulationAgeSeconds=mission.arrival;service.tick();service.tick();
 assert.equal(service.snapshot().missions,1);
 assert.equal(world.businesses['spaceworks-supply'].cash,900);
 assert.equal(world.businesses.spaceworks.cash,10500);
 assert.equal(world.treasury.cash,28600);
 assert.equal(events.filter(t=>t==='spaceworks_mission').length,1);
});
