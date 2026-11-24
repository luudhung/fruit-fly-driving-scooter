import test from 'node:test';import assert from 'node:assert/strict';
import {freshState,restoreState,startJourney,moveFly,chooseDestination,countries,liquidMoneySupply,maybeRoamInsidePark} from '../worker/civilization-engine.mjs';
import {LOCATIONS,clearSegment,METRO_LINES,PARK} from '../worker/city-map.mjs';
import {countryAt,BORDER_CHECKPOINTS,borderDirection,NORTH_RIVERSIDE_LINK} from '../worker/country-map.mjs';
const crossingX=NORTH_RIVERSIDE_LINK.x,northWalkX=crossingX+6.2,hansWalkX=crossingX-6.2;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function point(id,x,z){let p=LOCATIONS.find(p=>p.id===id);if(p)Object.assign(p,{x,z});else LOCATIONS.push(p={id,x,z,type:'country-test',name:id});return p;}
function fixture(){const s=freshState();s.weather={condition:'clear',precipitation:0,wind:0};const f=s.flies.find(f=>f.alive&&f.ageYears>23&&!f.publicServiceRole&&!f.facilityEmployment&&!f.businessId&&!f.businessEmployeeOf);Object.assign(f,{x:northWalkX,y:1.1,z:-550,indoors:false,traveling:false,onTrain:false,onPlane:false,onPrivateHelicopter:false,heliPassenger:false,onFireEngine:false,onAmbulance:false,jobId:null,vehicle:null,money:200,savings:0,health:100,energy:95,hunger:10,thirst:10,stress:5,actionUntil:0,sleeping:false,recoveringEnergy:false,citizenshipCountryId:'hansdrex',countryPresence:{countryId:'hansdrex',entryId:'INITIAL'},routeWaypoints:[],routeIndex:0});point('COUNTRY-NAV-NORTH',northWalkX,-650);point('COUNTRY-NAV-HANS',hansWalkX,-540);return{s,f};}
function finish(s,f,limit=500){for(let i=0;i<limit&&f.traveling;i++){s.simulationAgeSeconds+=1200;moveFly(f,0,10);}assert.equal(f.traveling,false,JSON.stringify({x:f.x,z:f.z,action:f.action,route:f.routeWaypoints,denied:f.countryTravelDenied}));}

test('checkpoint directions keep opposite cars apart and pedestrians on distinct bridge footpaths',()=>{
 for(const port of BORDER_CHECKPOINTS){const n=borderDirection(port,'north-city'),h=borderDirection(port,'hansdrex');if(port.axis==='z'){assert.ok(n.queuePoint.x>port.bounds.x);assert.ok(h.queuePoint.x<port.bounds.x);}else{assert.ok(n.queuePoint.z<port.bounds.z);assert.ok(h.queuePoint.z>port.bounds.z);}if(port.modes.includes('walk')){const w=borderDirection(port,'north-city','walk');close(Math.abs(w.queuePoint.x-port.bounds.x),6.2);assert.ok(clearSegment(w.queuePoint,w.admissionPoint));}}
});

test('actual walking entry charges North fifty once, survives restore and returns home free',()=>{
 let {s,f}=fixture();const total=liquidMoneySupply(),north=countries.countryAccount('north-city').cash,hans=s.treasury.cash;assert.equal(startJourney(f,{id:'COUNTRY-NAV-NORTH',action:'visiting North',mode:'walk'}),true);assert.ok(f.routeWaypoints.some(p=>p.stage==='border-entry'));assert.ok(f.routeWaypoints.every(p=>p.mode==='walk'));assert.equal(f.money,200);
 for(let i=0;i<100&&!f.countryEntryReceipts?.length;i++){s.simulationAgeSeconds+=120;moveFly(f);}assert.equal(countryAt(f),'north-city');assert.equal(f.money,150);assert.equal(f.countryEntryReceipts.length,1);close(countries.countryAccount('north-city').cash,north+50);assert.equal(s.treasury.cash,hans);
 s=restoreState(structuredClone(s));f=s.flies.find(p=>p.id===f.id);finish(s,f);assert.equal(f.currentLocationId,'COUNTRY-NAV-NORTH');assert.equal(f.money,150);assert.equal(f.countryEntryReceipts.length,1);assert.equal(startJourney(f,{id:'COUNTRY-NAV-HANS',action:'returning home',mode:'walk'}),true);finish(s,f);assert.equal(countryAt(f),'hansdrex');assert.equal(f.money,150);assert.equal(f.countryEntryReceipts.at(-1).fee,0);close(liquidMoneySupply(),total);
});

test('an unaffordable foreign journey preserves the indoor pose and a poor hungry North resident chooses stocked local food',()=>{
 const {s,f}=fixture();Object.assign(f,{indoors:true,currentLocationId:'office',x:0,z:0,money:49,savings:0});const before=[f.x,f.y,f.z,f.indoors,f.currentLocationId];assert.equal(startJourney(f,{id:'COUNTRY-NAV-NORTH',action:'visiting North'}),false);assert.deepEqual([f.x,f.y,f.z,f.indoors,f.currentLocationId],before);assert.equal(f.money,49);
 Object.assign(f,{x:110,z:-760,indoors:false,currentLocationId:null,money:1,citizenshipCountryId:'north-city',countryPresence:{countryId:'north-city',entryId:'LOCAL'},hunger:95,actionUntil:0});s.businesses['north-market'].inventory=2;chooseDestination(f,{day:1,hour:12,minute:0});assert.equal(f.targetLocationId,'north-market');assert.ok(f.routeWaypoints.every(p=>countryAt(p)==='north-city'));assert.equal(f.money,1);
});

test('tiny waypoint snaps and forged river shortcuts cannot charge through blocked geometry or bypass entry funds',()=>{
 const {s,f}=fixture(),before=liquidMoneySupply();Object.assign(f,{x:crossingX+12.3,z:-569.7,targetX:crossingX+12.7,targetZ:-570.1,transitMode:'walk',traveling:true,routeWaypoints:[{x:crossingX+12.7,z:-570.1,mode:'walk'}],routeIndex:0});assert.equal(clearSegment(f,{x:f.targetX,z:f.targetZ}),false);const pose=[f.x,f.z];moveFly(f);assert.deepEqual([f.x,f.z],pose);assert.equal(f.money,200);assert.equal(f.countryEntryReceipts,undefined);close(liquidMoneySupply(),before);
 Object.assign(f,{x:northWalkX,z:-569.7,targetX:northWalkX,targetZ:-570.1,traveling:true,routeWaypoints:[{x:northWalkX,z:-570.1,mode:'walk'}],money:0,savings:0});assert.ok(clearSegment(f,{x:f.targetX,z:f.targetZ}));moveFly(f);assert.deepEqual([f.x,f.z],[northWalkX,-569.7]);assert.equal(f.traveling,false);assert.equal(f.countryEntryReceipts,undefined);
});

test('a border closed after departure holds the same physical route and peace resumes it without a duplicate fee',()=>{
 const {s,f}=fixture();assert.equal(startJourney(f,{id:'COUNTRY-NAV-NORTH',action:'visiting North',mode:'walk'}),true);countries.relation('hansdrex','north-city').state='war';for(let i=0;i<100&&!f.countryBorderHold;i++){s.simulationAgeSeconds+=120;moveFly(f);}assert.ok(f.countryBorderHold);assert.equal(f.traveling,true);assert.equal(countryAt(f),'hansdrex');const pose=[f.x,f.z],route=f.routeWaypoints;moveFly(f);assert.deepEqual([f.x,f.z],pose);assert.equal(f.routeWaypoints,route);assert.equal(f.money,200);countries.relation('hansdrex','north-city').state='peace';finish(s,f);assert.equal(f.money,150);assert.equal(f.countryEntryReceipts.length,1);
});

test('regional island requests never become ocean walking and committed train passengers retain their paid journey',()=>{
 const {f}=fixture();f.money=400;const pose=[f.x,f.z];startJourney(f,{id:'island-beach',action:'visiting Hawaii',mode:'walk'});assert.deepEqual([f.x,f.z],pose);assert.equal(f.countryFlightPlan?.toId,'island');assert.equal(f.targetLocationId,'airport');assert.ok(f.routeWaypoints.every(p=>countryAt(p)!=='hawaii'));
 Object.assign(f,{onTrain:true,metroLineId:'M1',metroTrainId:'M1-1',metroBoardingsThisTrip:1,traveling:true});const records=[f.x,f.z,f.metroLineId,f.metroTrainId,f.metroBoardingsThisTrip,f.routeWaypoints,f.targetLocationId];assert.equal(startJourney(f,{id:'COUNTRY-NAV-NORTH',action:'rerouting a passenger'}),false);assert.deepEqual([f.x,f.z,f.metroLineId,f.metroTrainId,f.metroBoardingsThisTrip,f.routeWaypoints,f.targetLocationId],records);assert.ok(METRO_LINES.every(l=>l.points.every(p=>countryAt({x:p[0],z:p[1]})===l.countryId)));
});

test('a real car crossing uses the physical road route and pays the receiving country once',()=>{
 const {s,f}=fixture();Object.assign(f,{x:-525,z:-420,vehicle:'compact car',roadDuty:true,money:200,citizenshipCountryId:'north-city',countryPresence:{countryId:'hansdrex',entryId:'LEGACY'}});point('COUNTRY-NAV-DRIVE-NORTH',-500,-1011);const total=liquidMoneySupply();assert.equal(startJourney(f,{id:'COUNTRY-NAV-DRIVE-NORTH',action:'driving home to North',mode:'car'}),true);assert.ok(f.routeWaypoints.some(p=>p.mode==='car'));finish(s,f,1600);assert.equal(countryAt(f),'north-city');assert.equal(f.countryEntryReceipts.filter(r=>r.toCountryId==='north-city').length,1);assert.equal(f.countryEntryReceipts.at(-1).fee,0);close(liquidMoneySupply(),total);
});


test('a penniless Hawaii visitor with empty food stocks can rest locally without losing its mind or walking overseas',()=>{
 const {s,f}=fixture();Object.assign(f,{x:235,z:790,currentLocationId:'island-beach',money:0,savings:0,homeX:0,homeZ:0,stress:65,hunger:10,thirst:10,actionUntil:0,jobId:null,publicServiceRole:null,facilityEmployment:null,businessId:null,businessEmployeeOf:null,countryPresence:{countryId:'hawaii',entryId:'PAID-ISLAND'}});
 for(const id of ['island-market','island-restaurant','island-resort'])if(s.businesses[id])s.businesses[id].inventory=0;
 const total=liquidMoneySupply();assert.doesNotThrow(()=>chooseDestination(f,{day:1,hour:12,minute:0}));assert.equal(countryAt(LOCATIONS.find(p=>p.id===f.targetLocationId)),'hawaii');assert.equal(f.countryFlightPlan,undefined);assert.equal(f.money,0);close(liquidMoneySupply(),total);assert.ok(f.routeWaypoints.every(p=>countryAt(p)==='hawaii'));
});

test('North children choose their actual domestic school without paying a foreign school commute visa',()=>{
 const {s,f}=fixture();Object.assign(f,{ageYears:10,x:110,z:-888,currentLocationId:null,money:0,savings:0,homeX:110,homeZ:-900,citizenshipCountryId:'north-city',countryPresence:{countryId:'north-city',entryId:'HOME'},hunger:0,thirst:0,energy:100,stress:0,sleepDebt:0,caffeine:0,loneliness:0,jobId:null});f.brain.dynamic.curiosity=0;f.brain.plasticity.noveltyBias=0;f.traits.sociability=0;chooseDestination(f,{day:1,hour:9,minute:0});assert.equal(f.targetLocationId,'north-school');assert.ok(f.routeWaypoints.every(p=>countryAt(p)==='north-city'));assert.equal(f.money,0);
});


test('a known unfunded island journey preserves the indoor position and never starts an unpaid airport loop',()=>{
 const {f}=fixture();Object.assign(f,{indoors:true,currentLocationId:'office',x:0,z:0,money:200,savings:0});const before=[f.x,f.y,f.z,f.indoors,f.currentLocationId,f.routeWaypoints];assert.equal(startJourney(f,{id:'island-beach',action:'visiting Hawaii'}),false);assert.deepEqual([f.x,f.y,f.z,f.indoors,f.currentLocationId,f.routeWaypoints],before);assert.equal(f.countryFlightPlan,undefined);assert.equal(f.money,200);
});


test('park wandering needs actual attendance and cannot pull a poor North resident across a foreign border from a stale label',()=>{
 const {s,f}=fixture();Object.assign(f,{x:-386,z:-570.52,currentLocationId:'park',targetLocationId:'park',money:0,savings:16,citizenshipCountryId:'north-city',countryPresence:{countryId:'north-city',entryId:'HOME'},lastParkRoamAt:-10000});
 const pose=[f.x,f.y,f.z],route=f.routeWaypoints,total=liquidMoneySupply();assert.equal(maybeRoamInsidePark(f),false);assert.deepEqual([f.x,f.y,f.z],pose);assert.equal(f.routeWaypoints,route);assert.equal(f.traveling,false);close(liquidMoneySupply(),total);
 Object.assign(f,{x:PARK.x,z:PARK.z,currentLocationId:'park',energy:0,hunger:100});assert.equal(maybeRoamInsidePark(f),false,'exhausted hungry residents do not start another leisure loop');
});

test('a poor domestic North journey walks away from a bridge without a false fifty-dollar border touch',()=>{
 for(const mode of ['walk','car']){
  const {s,f}=fixture();Object.assign(f,{x:-374,z:-570.2166384238858,money:0,savings:8,citizenshipCountryId:'north-city',countryPresence:{countryId:'north-city',entryId:'HOME'},currentLocationId:null,vehicle:mode==='car'?'compact car':null,parkedCar:{x:-510,z:-1003.95,heading:-Math.PI/2}});
  const total=liquidMoneySupply();assert.equal(startJourney(f,{id:'INDUSTRY-north-4',action:'commuting within North',mode}),true);assert.ok(f.routeWaypoints.every(p=>countryAt(p)==='north-city'),'the domestic itinerary never touches Hansdrex');
  finish(s,f,1600);assert.equal(f.currentLocationId,'INDUSTRY-north-4');assert.equal(f.countryTravelDenied,null);assert.equal(f.countryEntryReceipts,undefined);assert.equal(f.money,0);close(f.savings,mode==='car'?7.7:8);close(liquidMoneySupply(),total);
 }
});

test('a denied legacy park trip releases its stale location and can physically return to its North home without visa money',()=>{
 const {s,f}=fixture();Object.assign(f,{x:-386,z:-570.5220686915084,currentLocationId:'park',targetLocationId:'park',money:0,savings:16,citizenshipCountryId:'north-city',countryPresence:{countryId:'north-city',entryId:'HOME'},homeId:'airport-gardens-homes',homeX:-340,homeZ:-692,traveling:true,targetX:-386,targetZ:-570,routeIndex:0,routeWaypoints:[{x:-386,z:-570,mode:'walk',stage:'park-roam'},{x:-386,z:-550,mode:'walk',stage:'park-roam'}]});
 const pose=[f.x,f.y,f.z],total=liquidMoneySupply();moveFly(f);assert.equal(f.traveling,false);assert.equal(f.currentLocationId,null);assert.equal(f.indoors,false);assert.equal(f.countryTravelDenied.reason,'insufficient funds for entry visa');assert.deepEqual([f.x,f.y,f.z],pose);assert.equal(maybeRoamInsidePark(f),false);
 assert.equal(startJourney(f,{id:f.homeId,action:'sleeping',mode:'walk'}),true);finish(s,f);assert.equal(f.currentLocationId,f.homeId);assert.equal(f.indoors,true);assert.equal(f.sleeping,true);assert.equal(countryAt(f),'north-city');assert.equal(f.countryEntryReceipts,undefined);close(liquidMoneySupply(),total);
});
