import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILDINGS,LOCATIONS,ROADS,WATER,overlaps,pedestrianRoute} from '../worker/city-map.mjs';
import {MAIN_SCHOOL_CAMPUSES,MAIN_SCHOOL_IDS} from '../worker/education-map.mjs';
import {countryAt} from '../worker/country-map.mjs';
import {districtAt,districtProfile,districtHousingUtility} from '../worker/district-economy.mjs';

test('Main City has five physically accessible school parcels',()=>{
 assert.equal(new Set(MAIN_SCHOOL_IDS).size,5);
 for(const campus of MAIN_SCHOOL_CAMPUSES){
  assert.equal(countryAt(campus),'hansdrex');
  assert.equal(districtAt(campus),'main');
  assert.ok(LOCATIONS.some(site=>site.id===campus.id));
  assert.ok(![...BUILDINGS,...ROADS,...WATER].some(site=>site.id!==campus.id&&overlaps(site,campus,.5)));
  const station=LOCATIONS.filter(s=>s.type==='transit').sort((a,b)=>Math.hypot(a.x-campus.x,a.z-campus.z)-Math.hypot(b.x-campus.x,b.z-campus.z))[0];
  assert.ok(pedestrianRoute(station,campus).length>=2);
 }
});

test('retirees value quiet and clean air, while young sociable residents can prefer the costly centre',()=>{
 const central={x:100,z:100},europe={x:640,z:100};
 const preferences={health:86,money:240,savings:1900,traits:{risk:.45,ambition:.8,sociability:.85,thrift:.5}};
 const retiree={...preferences,ageYears:78,homeX:central.x,homeZ:central.z};
 const young={...preferences,ageYears:24,homeX:europe.x,homeZ:europe.z};
 assert.ok(districtHousingUtility(retiree,europe)>24);
 assert.ok(districtHousingUtility(young,central)>8);
 assert.ok(districtProfile(central).housing>districtProfile(europe).housing);
 assert.ok(districtProfile(central).pollution>districtProfile(europe).pollution);
});

test('North public-service assignments do not count as Hansdrex employment',async()=>{
 process.env.CIV_INITIAL_POPULATION='12';
 const {freshState,getState}=await import('../worker/civilization-engine.mjs');
 const state=freshState(),workers=state.flies.filter(f=>f.alive&&f.publicServiceRole);
 const north=workers.find(f=>f.publicServiceCountryId==='north-city');
 const city=workers.find(f=>f.publicServiceCountryId!=='north-city'&&f.publicServiceRole==='army');
 const worker=north||city;
 assert.ok(worker);
 for(const f of state.flies)f.alive=f===worker;
 Object.assign(worker,{publicServiceCountryId:'north-city',nationalServiceRole:'army',publicServiceRole:'army',jobId:'north-military'});
 assert.equal(getState({view:'observer'}).hansdrexEmployment.total,0);
 Object.assign(worker,{publicServiceCountryId:'hansdrex',nationalServiceRole:null,jobId:'military'});
 assert.equal(getState({view:'observer'}).hansdrexEmployment.total,1);
});
