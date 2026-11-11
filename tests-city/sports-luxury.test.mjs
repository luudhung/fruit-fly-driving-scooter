import test from 'node:test';
import assert from 'node:assert/strict';
import {createSportsLuxury,privateHelipads,privateHelicopterPose,helicopterNetWorth,SPORTS_RULES} from '../worker/sports-luxury.mjs';
import {BUILDINGS,LOCATIONS,clearSegment} from '../worker/city-map.mjs';
function setup(count=18){
 let s={simulationAgeSeconds:0,businesses:{},totalTransactions:0,weather:{condition:'clear',wind:0,precipitation:0},centralBank:{priceLevel:1},flies:Array.from({length:count},(_,i)=>({id:`FLY-${i+1}`,alive:true,ageYears:30,money:1000+i*100,savings:10000+i*200,homeEquity:0,businessEquity:0,debt:0,health:90,energy:90,happiness:50,stress:50,loneliness:50,x:0,y:1.1,z:0,traits:{sociability:.7,ambition:.8}}))};
 const events=[],memories=[];const factory=()=>createSportsLuxury({world:()=>s,random:()=>.3,emit:(type,text,payload)=>events.push({type,text,...payload}),remember:(f,type,payload)=>memories.push({id:f.id,type,...payload}),needsAndActivities:()=>{},payAndFinance:()=>{}});
 let system=factory();system.init();
 return{get s(){return s;},get system(){return system;},events,memories,restore(){s=JSON.parse(JSON.stringify(s));system=factory();system.init();},at(t){s.simulationAgeSeconds=t;return{day:Math.floor(t/86400)+1,hour:Math.floor(t%86400/3600),minute:Math.floor(t%3600/60)};}};
}
const supply=s=>s.flies.reduce((a,f)=>a+f.money+f.savings,0)+Object.values(s.businesses).reduce((a,b)=>a+b.cash,0);
const putAtPad=(s,h)=>{const pad=privateHelipads().find(p=>p.id===h.padId),f=s.flies.find(f=>f.id===h.ownerId),loc=LOCATIONS.find(l=>l.id===pad.locationId);Object.assign(f,{x:loc.x,z:loc.z,currentLocationId:pad.locationId,action:'taking a private helicopter',traveling:false,indoors:true});return f;};

test('iconic spires never receive helipads; retired aircraft move without losing ownership or charging families',()=>{
 const t=setup(),pads=privateHelipads(),icons=['toronto','empire','burj-khalifa','petronas','petronas-east'];
 assert.ok(pads.every(p=>!icons.includes(p.locationId)));
 const h=t.s.sportsLuxury.helicopters[0],owner=t.s.flies.find(f=>f.id===h.ownerId),before=supply(t.s);
 owner.housingUnitId='petronas';h.homePadId=h.padId='PAD-petronas';
 const id=h.id,ownerId=h.ownerId;t.system.tick(0,t.at(0));
 assert.equal(h.homePadId,null);assert.equal(h.id,id);assert.equal(h.ownerId,ownerId);
 assert.ok(h.flight?.maintenance);assert.equal(supply(t.s),before);
 const to=h.flight.to.id;t.restore();t.system.tick(0,t.at(1201));
 const restored=t.s.sportsLuxury.helicopters.find(aircraft=>aircraft.id===id);
 assert.equal(restored.padId,to);assert.equal(restored.flight,null);assert.equal(restored.ownerId,ownerId);assert.equal(supply(t.s),before);
});

test('one-time founding grant selects ten wealthiest living adults after liabilities, then preserves ownership',()=>{
 const t=setup(),d=t.s.sportsLuxury;assert.equal(d.helicopters.length,10);
 const expected=t.s.flies.filter(f=>f.alive&&f.ageYears>=18).sort((a,b)=>helicopterNetWorth(b)-helicopterNetWorth(a)).slice(0,10).map(f=>f.id);
 assert.deepEqual(d.helicopters.map(h=>h.ownerId),expected);assert.equal(new Set(d.helicopters.map(h=>h.padId)).size,10);
 const ownership=d.helicopters.map(h=>h.ownerId),before=supply(t.s);t.s.flies[0].money=1e7;const after=supply(t.s);t.restore();assert.deepEqual(t.s.sportsLuxury.helicopters.map(h=>h.ownerId),ownership);assert.equal(supply(t.s),after);assert.ok(after>before);
});
test('roof pads sit on actual broad roofs and all aircraft have distinct home bays',()=>{
 const t=setup();for(const p of privateHelipads().filter(p=>p.rooftop)){const b=BUILDINGS.find(b=>b.id===p.locationId);assert.ok(b&&p.y>b.h&&(p.radius??6)*2<=b.w&&(p.radius??6)*2<=b.d);}
 assert.ok(privateHelipads().filter(p=>p.rooftop).length>=3);assert.equal(new Set(t.s.sportsLuxury.helicopters.map(h=>h.padId)).size,10);
});
test('private flight charges exactly once at takeoff, persists mid-air, lands and completes a ground transfer',()=>{
 const t=setup(),h=t.s.sportsLuxury.helicopters[0],f=putAtPad(t.s,h),destination=privateHelipads().find(p=>p.id==='PAD-island-resort'),before=supply(t.s),cash=f.money+f.savings;
 assert.equal(t.system.beginPrivate(f,destination.id),true);assert.equal(t.system.beginPrivate(f,destination.id),false);assert.equal(f.money+f.savings,cash);
 const departure=h.flight.departure,arrival=h.flight.arrival,cost=h.flight.cost;t.system.handleResident(f,t.at(departure));assert.ok(f.onPrivateHelicopter);assert.equal(f.money+f.savings,cash-cost);assert.ok(Math.abs(supply(t.s)-before)<1e-6);
 t.system.handleResident(f,t.at(departure+200));assert.equal(f.money+f.savings,cash-cost);assert.ok(f.y>100);
 t.restore();const restored=t.s.flies.find(o=>o.id===f.id);t.system.handleResident(restored,t.at(arrival));assert.equal(restored.privateFlight.phase,'disembarking');t.system.handleResident(restored,t.at(restored.privateFlight.until));
 assert.equal(restored.privateFlight,null);assert.equal(restored.onPrivateHelicopter,false);assert.equal(restored.currentLocationId,'island-resort');assert.equal(t.s.sportsLuxury.privateFlights,1);assert.equal(t.s.sportsLuxury.helicopters[0].padId,destination.id);assert.ok(Math.abs(supply(t.s)-before)<1e-6);
});
test('bad weather cancels before takeoff without charging and landing-pad reservations prevent two arrivals',()=>{
 const t=setup(),h=t.s.sportsLuxury.helicopters[0],f=putAtPad(t.s,h),to=privateHelipads().find(p=>p.id==='PAD-island-resort'),before=f.money+f.savings;
 assert.ok(t.system.beginPrivate(f,to.id));assert.equal(t.system.padAvailable(to.id,'another'),false);
 t.s.weather.condition='thunderstorm';t.system.handleResident(f,t.at(h.flight.departure-10));assert.equal(h.flight,null);assert.equal(f.privateFlight,null);assert.equal(f.money+f.savings,before);assert.ok(t.system.padAvailable(to.id,'another'));
});
test('airport access goes around the terminal instead of through its walls',()=>{
 const t=setup(),h=t.s.sportsLuxury.helicopters[0];h.padId='PAD-AIRPORT-1';const f=putAtPad(t.s,h);assert.ok(t.system.beginPrivate(f,'PAD-island-resort'));
 const path=f.privateFlight.walk;assert.ok(path.length>=3);for(let i=1;i<path.length;i++)assert.ok(clearSegment(path[i-1],path[i]));
});
test('private flight cruise stays above the tallest skyline, endpoints stay at physical pads',()=>{
 const p=privateHelipads(),flight={from:p[0],to:p.at(-1),departure:100,arrival:1600};const mid=privateHelicopterPose(850,flight);assert.ok(mid.y>Math.max(...BUILDINGS.map(b=>b.h)));const end=privateHelicopterPose(1600,flight);assert.equal(end.x,flight.to.x);assert.equal(end.z,flight.to.z);
});
test('maintenance transfers money once a day and inheritance keeps aircraft identities',()=>{
 const t=setup(),h=t.s.sportsLuxury.helicopters[0],old=t.s.flies.find(f=>f.id===h.ownerId),heir=t.s.flies[0],before=supply(t.s);t.system.tick(120,t.at(120));const earned=t.s.sportsLuxury.maintenanceRevenue;t.system.tick(120,t.at(240));assert.equal(t.s.sportsLuxury.maintenanceRevenue,earned);assert.ok(Math.abs(supply(t.s)-before)<1e-6);
 old.children=[heir.id];old.alive=false;t.system.tick(120,t.at(4000));assert.equal(h.ownerId,heir.id);assert.equal(heir.privateHelicopterId,h.id);t.restore();assert.equal(t.s.sportsLuxury.helicopters[0].ownerId,heir.id);
});
test('tennis enforces court capacity, charges once and creates fitness/social consequences',()=>{
 const t=setup();for(let i=0;i<5;i++)Object.assign(t.s.flies[i],{currentLocationId:'tennis',action:'playing tennis',traveling:false});const f=t.s.flies[0],cash=f.money,before=supply(t.s);
 for(let i=0;i<4;i++)assert.ok(t.system.beginSports(t.s.flies[i],'tennis','player'));assert.equal(t.system.beginSports(t.s.flies[4],'tennis','player'),false);assert.equal(t.system.beginSports(f,'tennis','player'),false);assert.equal(f.money,cash-2);assert.ok(Math.abs(supply(t.s)-before)<1e-6);
 const health=f.health;t.system.handleResident(f,t.at(SPORTS_RULES.playerSeconds));assert.equal(f.sportsSession,null);assert.ok(f.health>health&&f.stress<50&&f.sportsProfile.fitness>0);assert.equal(t.s.sportsLuxury.tennisSessions,4);
});
test('scheduled stadium match has players, paying spectators, score and a persistent result',()=>{
 const t=setup();t.system.tick(120,t.at(16*3600));const m=t.s.sportsLuxury.match;assert.ok(m);
 for(const [i,role]of [[0,'player'],[1,'player'],[2,'spectator']]){Object.assign(t.s.flies[i],{currentLocationId:'stadium',traveling:false});assert.ok(t.system.beginSports(t.s.flies[i],'stadium',role));}
 const revenue=t.s.sportsLuxury.sportsRevenue;t.system.tick(120,t.at(m.startsAt+1200));assert.ok(m.score[0]+m.score[1]>0);t.system.tick(120,t.at(m.endsAt));assert.equal(t.s.sportsLuxury.matchesCompleted,1);assert.equal(t.s.sportsLuxury.match,null);assert.equal(t.s.sportsLuxury.history.length,1);assert.equal(revenue,3);assert.equal(t.s.flies[2].sportsSession,null);
});

test('newly unsafe roofs reject bookings and an airborne owner diverts to an available safe pad',()=>{
 const t=setup(),h=t.s.sportsLuxury.helicopters[0],f=putAtPad(t.s,h),dest=privateHelipads().find(p=>p.id==='PAD-island-resort');assert.ok(t.system.beginPrivate(f,dest.id));
 t.system.handleResident(f,t.at(h.flight.departure));t.s.urbanWorld={buildings:{'island-resort':{stage:'unsafe'}},fires:[],floods:[]};
 const oldArrival=h.flight.arrival;t.system.handleResident(f,t.at(oldArrival-100));assert.notEqual(h.flight.to.id,dest.id);assert.ok(h.flight.to.id.startsWith('PAD-AIRPORT'));assert.equal(t.s.sportsLuxury.diversions,1);
});

test('a helicopter held in an estate remains inheritable when its child becomes an adult',()=>{
 const t=setup(),h=t.s.sportsLuxury.helicopters[0],former=t.s.flies.find(f=>f.id===h.ownerId),heir=t.s.flies[0];former.alive=false;former.children=[heir.id];heir.ageYears=17;
 t.system.tick(120,t.at(120));assert.equal(h.ownerId,null);assert.equal(h.estateOwnerId,former.id);
 t.restore();const restored=t.s.sportsLuxury.helicopters.find(o=>o.id===h.id),adult=t.s.flies.find(f=>f.id===heir.id);adult.ageYears=18;t.system.tick(120,t.at(4000));assert.equal(restored.ownerId,heir.id);assert.equal(restored.estateOwnerId,undefined);assert.ok(Number.isFinite(restored.nextTripAt));
});

test('all ten private owners park on real rooftops and legacy airport parking migrates once',()=>{
 const t=setup(),pads=privateHelipads(),fleet=t.s.sportsLuxury.helicopters;
 assert.ok(fleet.every(h=>pads.find(p=>p.id===h.padId)?.rooftop));assert.ok(pads.filter(p=>p.rooftop).length>10);
 const owners=fleet.map(h=>[h.id,h.ownerId]),cash=supply(t.s);for(let i=0;i<fleet.length;i++)fleet[i].padId=`PAD-AIRPORT-${i+1}`;
 delete t.s.sportsLuxury.familyParkingVersion;t.restore();const migrated=t.s.sportsLuxury.helicopters.map(h=>h.padId);
 assert.deepEqual(t.s.sportsLuxury.helicopters.map(h=>[h.id,h.ownerId]),owners);assert.equal(new Set(migrated).size,10);assert.ok(migrated.every(id=>pads.find(p=>p.id===id)?.rooftop));assert.equal(supply(t.s),cash);
 t.restore();assert.deepEqual(t.s.sportsLuxury.helicopters.map(h=>h.padId),migrated);
});

test('a family rooftop belongs to the real home, includes children and follows an adult heir',()=>{
 const t=setup(),fleet=t.s.sportsLuxury.helicopters,units=BUILDINGS.filter(b=>b.kind==='apartment').slice(0,10);t.s.housing={households:{}};
 for(let i=0;i<fleet.length;i++){const f=t.s.flies.find(f=>f.id===fleet[i].ownerId),b=units[i];f.householdId=`FAMILY-${i}`;f.housingUnitId=b.id;f.homeX=b.x;f.homeZ=b.z;t.s.housing.households[f.householdId]={id:f.householdId,unitId:b.id,members:[f.id]};}
 const parent=t.s.flies.find(f=>f.id===fleet[0].ownerId),child=t.s.flies[0];Object.assign(child,{ageYears:12,householdId:parent.householdId,housingUnitId:parent.housingUnitId});parent.children=[child.id];t.s.housing.households[parent.householdId].members.push(child.id);
 delete t.s.sportsLuxury.familyParkingVersion;t.restore();const h=t.s.sportsLuxury.helicopters[0],p=t.system.snapshot().pads.find(p=>p.id===h.padId);assert.equal(p.locationId,parent.housingUnitId);assert.ok(h.familyIds.includes(child.id));assert.equal(h.familyHouseholdId,parent.householdId);
 const before=supply(t.s),restoredParent=t.s.flies.find(f=>f.id===parent.id),restoredChild=t.s.flies.find(f=>f.id===child.id);restoredParent.alive=false;t.system.tick(120,t.at(120));assert.equal(h.ownerId,null);assert.ok(h.familyIds.includes(child.id));
 restoredChild.ageYears=18;t.system.tick(120,t.at(4000));t.system.tick(120,t.at(4120));assert.equal(h.ownerId,child.id);assert.equal(h.homePadId,`PAD-${child.housingUnitId}`);assert.equal(supply(t.s),before);
});

test('a flight to a previously unregistered family roof survives restore and completes disembarking',()=>{
 const t=setup(),h=t.s.sportsLuxury.helicopters[0],f=putAtPad(t.s,h),to=privateHelipads().find(p=>p.rooftop&&!LOCATIONS.some(l=>l.id===p.locationId));assert.ok(to,'fixture needs a real roof without a destination record');
 const before=supply(t.s);assert.ok(t.system.beginPrivate(f,to.id));const departure=h.flight.departure,arrival=h.flight.arrival;t.system.handleResident(f,t.at(departure));t.restore();const restored=t.s.flies.find(o=>o.id===f.id);
 assert.doesNotThrow(()=>t.system.handleResident(restored,t.at(arrival)));assert.equal(restored.privateFlight.phase,'disembarking');assert.doesNotThrow(()=>t.system.handleResident(restored,t.at(restored.privateFlight.until+1)));assert.equal(restored.privateFlight,null);assert.equal(restored.currentLocationId,to.locationId);assert.ok(Number.isFinite(restored.x)&&Number.isFinite(restored.z));assert.equal(t.s.sportsLuxury.privateFlights,1);assert.ok(Math.abs(supply(t.s)-before)<1e-6);
});

test('an inherited helicopter completes its deceased former owner’s paid flight instead of reserving the roof forever',()=>{
 const t=setup(),h=t.s.sportsLuxury.helicopters[0],f=putAtPad(t.s,h),heir=t.s.flies[0],to=privateHelipads().find(p=>p.id==='PAD-island-resort');assert.ok(t.system.beginPrivate(f,to.id));const departure=h.flight.departure,arrival=h.flight.arrival;t.system.handleResident(f,t.at(departure));f.alive=false;f.children=[heir.id];heir.ageYears=25;
 t.system.tick(120,t.at(departure+120));assert.equal(h.ownerId,heir.id);t.restore();const restored=t.s.sportsLuxury.helicopters.find(o=>o.id===h.id);t.system.tick(120,t.at(arrival+2000));assert.equal(restored.flight,null);assert.equal(restored.padId,to.id);assert.ok(t.system.padAvailable(to.id,restored.id));
});

test('a tennis session interrupted by ambulance care releases its slot without a false sports reward',()=>{
 const t=setup(),f=t.s.flies[0];f.currentLocationId='tennis';assert.ok(t.system.beginSports(f,'tennis','player'));const route=[{x:0,z:40,mode:'walk'}];Object.assign(f,{ambulanceDuty:{id:'CARE-1'},action:'receiving ambulance care',routeWaypoints:route,traveling:true,targetLocationId:'hospital-central'});
 t.system.tick(120,t.at(f.sportsSession.until+1));assert.equal(f.sportsSession,null);assert.equal(f.sportsProfile?.attended||0,0);assert.equal(f.action,'receiving ambulance care');assert.equal(f.routeWaypoints,route);assert.equal(f.traveling,true);
});

test('an estate settles a previously counted landing without counting the same private flight twice',()=>{
 const t=setup(),h=t.s.sportsLuxury.helicopters[0],f=putAtPad(t.s,h),to=privateHelipads().find(p=>p.id==='PAD-island-resort');assert.ok(t.system.beginPrivate(f,to.id));const departure=h.flight.departure,arrival=h.flight.arrival;t.system.handleResident(f,t.at(departure));t.system.handleResident(f,t.at(arrival));assert.equal(t.s.sportsLuxury.privateFlights,1);assert.equal(f.privateFlight.phase,'disembarking');f.alive=false;t.restore();t.system.tick(120,t.at(arrival+2000));assert.equal(t.s.sportsLuxury.privateFlights,1);assert.equal(t.s.sportsLuxury.helicopters.find(o=>o.id===h.id).flight,null);
});

test('a durable airborne flight reconstructs its missing passenger task then finishes safely once',()=>{
 const t=setup(),h=t.s.sportsLuxury.helicopters[0],f=putAtPad(t.s,h),to=privateHelipads().find(p=>p.id==='PAD-island-resort');assert.ok(t.system.beginPrivate(f,to.id));const departure=h.flight.departure,arrival=h.flight.arrival;t.system.handleResident(f,t.at(departure));f.privateFlight=null;t.restore();const restored=t.s.flies.find(p=>p.id===f.id);t.system.tick(120,t.at(departure+120));assert.ok(restored.privateFlight);assert.equal(restored.onPrivateHelicopter,true);t.system.handleResident(restored,t.at(arrival));t.system.handleResident(restored,t.at(restored.privateFlight.until+1));assert.equal(restored.privateFlight,null);assert.equal(restored.onPrivateHelicopter,false);assert.equal(t.s.sportsLuxury.privateFlights,1);
});
