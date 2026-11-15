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

test('a Riverside worker takes an actual Main City offer after reaching the interview site',async()=>{
 const {freshState,getState,productionAndRetail}=await import('../worker/civilization-engine.mjs');
 const state=freshState(),office=LOCATIONS.find(s=>s.id==='office');
 const residents=state.flies.filter(f=>f.alive).slice(0,10),candidate=residents.at(-1);
 for(const f of state.flies)f.alive=residents.includes(f);
 for(const f of residents)Object.assign(f,{citizenshipCountryId:'hansdrex',jobId:'riverside-office',jobTitle:'Riverside exchange clerk',businessId:null,businessEmployeeOf:null,internationalWork:null,publicServiceRole:null,publicServiceCountryId:null,facilityEmployment:null});
 Object.assign(candidate,{ageYears:31,educationLevel:41,energy:51,health:90,x:office.x,z:office.z,traveling:true,indoors:false,urbanTask:null,industrialFreightDuty:null,cityService:null,civicDuty:null,displacedFrom:null,action:'interviewing for a Main City job',currentLocationId:office.id});
 const before=getState({view:'observer'}).hansdrexEmployment;
 assert.equal(before.jobs.europe,10);
 productionAndRetail(candidate,{day:10,hour:14,minute:0});
 assert.equal(candidate.jobId,'riverside-office');
 candidate.traveling=false;candidate.indoors=true;
 productionAndRetail(candidate,{day:10,hour:14,minute:0});
 assert.equal(candidate.jobId,'central-finance');
 const after=getState({view:'observer'}).hansdrexEmployment;
 assert.equal(after.jobs.main,1);
 assert.equal(after.jobs.europe,9);
 assert.equal(after.total,before.total);
});
