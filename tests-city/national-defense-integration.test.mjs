import test from 'node:test';
import assert from 'node:assert/strict';
import {createNationalDefenseIntegration,tourHelicopterFlightId} from '../worker/national-defense-integration.mjs';
import {createNationalDefense} from '../worker/national-defense.mjs';
import {createInternationalLife} from '../worker/international-life.mjs';
import {privateHelicopterPose} from '../worker/sports-luxury.mjs';
import {helicopterPose} from '../worker/aviation.mjs';
import {createUrbanWorld} from '../worker/urban-world.mjs';
const person=(id,extra={})=>({id,alive:true,ageYears:30,health:100,energy:90,hunger:20,money:500,savings:900,x:0,y:1.1,z:0,brain:{id:`BRAIN-${id}`},citizenshipCountryId:'hansdrex',children:[],...extra});
function fixture(){
 let state={simulationAgeSeconds:500,timeScale:1,flies:[],businesses:{},treasury:{cash:100000},deaths:0,urbanWorld:{buildings:{}},sportsLuxury:{helicopters:[]}};
 const damages=[],events=[],memories=[],urbanWorld={applyWarDamage:d=>{damages.push(d);return true;}},countries=()=>createInternationalLife({world:()=>state,redistribute:false,nationalEconomy:false});
 let international=countries();international.init();
 const factory=()=>createNationalDefenseIntegration({world:()=>state,urbanWorld,countryAccount:id=>international.countryAccount(id),remember:(f,type,p)=>memories.push({id:f.id,type,...p}),emit:(type,text,p)=>events.push({type,text,...p})});
 let integration=factory();
 return {get s(){return state;},get integration(){return integration;},get international(){return international;},damages,events,memories,restore(){state=JSON.parse(JSON.stringify(state));international=countries();international.init();integration=factory();},privateFlight(){const flight={id:'PRIVATE-FLIGHT-ACTUAL',paid:true,from:{x:275,y:68,z:-1000},to:{x:276,y:68,z:-1000},departure:0,arrival:1000},h={id:'PRIVATE-HELI-ACTUAL',ownerId:'OWNER',condition:.8,flight},pose=privateHelicopterPose(state.simulationAgeSeconds,flight),owner=person('OWNER',{...pose,onPrivateHelicopter:true,privateFlight:{id:flight.id,helicopterId:h.id,phase:'flying'}});state.sportsLuxury.helicopters.push(h);state.flies.push(owner);return {h,flight,owner,pose};}};
}
test('actual private flight positions and boarding identity exclude distant owners and unrelated passengers',()=>{
 const t=fixture(),{h,flight,owner,pose}=t.privateFlight();t.s.flies.push(person('DISTANT',{x:-300,z:200,onPrivateHelicopter:true,privateFlight:{id:flight.id,helicopterId:h.id}}),person('GROUND',{...pose,onPrivateHelicopter:false}));
 const [a]=t.integration.getAircraft();assert.equal(a.id,h.id);assert.equal(a.flightId,flight.id);assert.deepEqual(a.occupantIds,[owner.id]);assert.equal(a.x,pose.x);assert.equal(a.y,pose.y);
 t.s.simulationAgeSeconds=flight.arrival;assert.equal(t.integration.getAircraft().length,0);
});
test('a concrete air-defense interception kills only actual occupants once and preserves their estate, brain and deed',()=>{
 const t=fixture(),{h,owner}=t.privateFlight();t.s.flies.push(person('NORTH-ARMY',{x:270,z:-995,citizenshipCountryId:'north-city',publicServiceRole:'army',publicServiceCountryId:'north-city',professionSkills:{armyTraining:1}}),person('SAFE-HEIR'));
 owner.children=['SAFE-HEIR'];owner.housingUnitId='DEED-UNCHANGED';const wallet=owner.money+owner.savings,brain=owner.brain;
 const defense=createNationalDefense({world:()=>t.s,international:t.international,...t.integration,random:()=>.5});defense.init();defense.tick();assert.equal(t.s.nationalDefense.projectiles.length,1);t.s.simulationAgeSeconds+=2;defense.tick();
 assert.equal(h.destroyed,true);assert.equal(h.flight,null);assert.equal(owner.alive,false);assert.equal(owner.money+owner.savings,wallet);assert.equal(owner.brain,brain);assert.equal(owner.housingUnitId,'DEED-UNCHANGED');assert.equal(owner.estateSettled,undefined);assert.equal(t.s.deaths,1);assert.equal(t.s.flies.at(-1).alive,true);assert.equal(defense.snapshot().casualties,1);
 const details={flightId:h.crashFlightId,projectileId:'REPLAY',cause:'air-defense interception',countryId:'north-city',point:h.crashPoint};assert.equal(t.integration.crashAircraft(h.id,details),false);t.restore();assert.equal(t.integration.crashAircraft(h.id,details),false);assert.equal(t.s.deaths,1);
});
test('actual tour timestamps identify passengers and only the initial legacy tour receives grandfather clearance',()=>{
 const t=fixture(),tour={startsAt:100,endsAt:1000},pose=helicopterPose(t.s.simulationAgeSeconds,tour.startsAt,tour.endsAt);t.s.helicopterFlight=tour;t.s.flies.push(person('GUEST',{...pose,heliPassenger:true,heliTourStartedAt:100,heliTourUntil:1000}),person('UNRELATED',{...pose,heliPassenger:true,heliTourStartedAt:200,heliTourUntil:1100}));
 t.integration.init();const [a]=t.integration.getAircraft();assert.equal(a.flightId,tourHelicopterFlightId(tour));assert.deepEqual(a.occupantIds,['GUEST']);assert.equal(t.international.airspaceStatus(a.flightId,{x:110,z:-910},{operatorCountryId:'hansdrex'}).authorized,true);
 t.s.helicopterFlight={startsAt:200,endsAt:1100};t.integration.init();assert.equal(t.s.internationalLife.airClearances[tourHelicopterFlightId(t.s.helicopterFlight)],undefined);
 Object.assign(t.s.flies[1],helicopterPose(t.s.simulationAgeSeconds,200,1100));assert.equal(t.integration.crashAircraft(a.id,{flightId:tourHelicopterFlightId(t.s.helicopterFlight),projectileId:'TOUR-HIT',point:pose}),true);assert.equal(t.s.flies[0].alive,true,'a passenger from a different flight cannot become a crash victim');assert.equal(t.s.flies[1].alive,false);assert.equal(t.s.deaths,1);
});
test('injury receipts survive restore and never settle estates or mutate a detached identity',()=>{
 const t=fixture(),f=person('INJURED');t.s.flies.push(f);const details={projectileId:'ONE-BLAST',cause:'missile impact'};
 assert.equal(t.integration.injureActor(f,30,details),true);assert.equal(f.health,70);assert.equal(t.integration.injureActor(f,30,details),false);assert.equal(t.integration.injureActor({...f},30,{projectileId:'DETACHED'}),false);t.restore();assert.equal(t.integration.injureActor(t.s.flies[0],30,details),false);assert.equal(t.s.flies[0].health,70);assert.equal(t.s.deaths,0);
});
test('building recovery uses the physical destination country regardless of an attacker supplied account',()=>{
 const t=fixture();assert.equal(t.integration.damageBuilding({buildingId:'north-school',projectileId:'REAL-IMPACT',countryId:'hansdrex',fundingAccountId:'treasury'}),true);assert.equal(t.damages[0].countryId,'north-city');assert.equal(t.damages[0].fundingAccountId,'treasury:north-city');assert.equal(t.integration.damageBuilding({buildingId:'NONEXISTENT',projectileId:'FAKE'}),false);
});

test('a real missed interception ignites only its physical school impact and injures people before evacuation moves them',()=>{
 const t=fixture(),flight={id:'MISSED-ACTUAL-FLIGHT',paid:true,departure:0,arrival:1000,from:{x:54,y:68,z:-910},to:{x:54,y:68,z:-910}},h={id:'MISSED-ACTUAL-HELI',ownerId:'AIRBORNE-OWNER',condition:1,flight};t.s.sportsLuxury.helicopters.push(h);t.s.flies.push(person(h.ownerId,{...privateHelicopterPose(t.s.simulationAgeSeconds,flight),onPrivateHelicopter:true,privateFlight:{id:flight.id,helicopterId:h.id,phase:'flying'}}),person('NORTH-ARMY',{x:270,z:-995,citizenshipCountryId:'north-city',publicServiceRole:'army',publicServiceCountryId:'north-city',professionSkills:{armyTraining:1}}),person('PUPIL',{x:110,z:-910,indoors:true,currentLocationId:'north-school'}),person('FAR',{x:-300,z:200}));
 const urban=createUrbanWorld({world:()=>t.s,random:()=>1,remember:()=>{},emit:()=>{},startJourney:()=>{},moveFly:()=>{},needsAndActivities:()=>{},payAndFinance:()=>{}});urban.init();
 const integration=createNationalDefenseIntegration({world:()=>t.s,urbanWorld:urban,countryAccount:t.international.countryAccount}),defense=createNationalDefense({world:()=>t.s,international:t.international,...integration,random:()=>1});defense.init();defense.tick();assert.equal(t.s.nationalDefense.projectiles[0].plannedHit,false);t.s.simulationAgeSeconds+=3;defense.tick();
 assert.equal(h.destroyed,undefined);assert.equal(t.s.flies.find(f=>f.id==='AIRBORNE-OWNER').alive,true);assert.equal(t.s.flies.find(f=>f.id==='PUPIL').alive,false);assert.equal(t.s.flies.find(f=>f.id==='FAR').health,100);assert.equal(t.s.deaths,1);assert.equal(t.s.urbanWorld.buildings['north-school'].health,52);assert.equal(t.s.urbanWorld.buildings['north-school'].warRecovery.fundingAccountId,'treasury:north-city');assert.equal(t.s.urbanWorld.fires.length,1);assert.equal(t.s.urbanWorld.fires[0].buildingId,'north-school');
 defense.tick();assert.equal(t.s.deaths,1);assert.equal(t.s.urbanWorld.fires.length,1);
});
