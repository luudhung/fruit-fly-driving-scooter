import test from 'node:test';
import assert from 'node:assert/strict';
import {createSportsLuxury} from '../worker/sports-luxury.mjs';
import {SPORTS_ACTIVITY_VENUES} from '../worker/sports-venues.mjs';
import {LOCATIONS} from '../worker/city-map.mjs';
import {countryAt} from '../worker/country-map.mjs';

function setup({north=24,hans=12,denied=false}={}){
 let state={simulationAgeSeconds:8*3600,timeScale:120,weather:{condition:'clear'},businesses:{},totalTransactions:0,
  sportsLuxury:{helicopters:[],foundingGrant:{at:0},history:[],lastDay:0,nextMatchAt:16*3600,nextOwnershipCheck:1e12},
  flies:Array.from({length:north+hans},(_,i)=>({id:`SPORT-${String(i).padStart(3,'0')}`,alive:true,ageYears:30,health:80,energy:85,hunger:40,
   money:100,savings:100,x:i<north?-500:740,z:i<north?-730:100,y:1.1,currentLocationId:'home',action:'resting indoors',indoors:true,
   happiness:40,stress:50,loneliness:60,traits:{sociability:.8},citizenshipCountryId:i<north?'north-city':'hansdrex'}))};
 const journeys=[],events=[],memories=[];
 const hooks={world:()=>state,random:()=>.5,isWorkCommitted:f=>Boolean(f.testWorking),
  startJourney:(f,chosen)=>{
   journeys.push({id:f.id,from:{x:f.x,z:f.z},to:chosen.id});if(denied)return false;
   const place=LOCATIONS.find(l=>l.id===chosen.id);assert.ok(place);
   assert.equal(countryAt(f),countryAt(place),'pickup never arranges an unauthorized international journey');
   Object.assign(f,{traveling:true,targetLocationId:chosen.id,pendingAction:chosen.action,action:chosen.action,indoors:false});return true;
  },moveFly:f=>{if(!f.testArrive)return;const place=LOCATIONS.find(l=>l.id===f.targetLocationId);Object.assign(f,{x:place.x,z:place.z,currentLocationId:place.id,traveling:false,action:f.pendingAction});},
  needsAndActivities:()=>{},payAndFinance:()=>{},emit:(type,text,data)=>events.push({type,...data}),remember:(f,type,data)=>memories.push({id:f.id,type,...data})};
 let system=createSportsLuxury(hooks);system.init();
 return{get state(){return state;},get system(){return system;},journeys,events,memories,
  tick(dt=120){state.simulationAgeSeconds+=dt;system.tick(dt,{hour:state.simulationAgeSeconds%86400/3600});},
  arrive(){for(const f of state.flies)if(f.sportsInvitation){f.testArrive=true;system.handleResident(f,{hour:8});}},
  restore(){state=JSON.parse(JSON.stringify(state));system=createSportsLuxury(hooks);system.init();}};
}
const supply=s=>s.flies.reduce((sum,f)=>sum+f.money+f.savings,0)+Object.values(s.businesses).reduce((sum,b)=>sum+Number(b.cash||0),0);

test('bounded local pickup parties physically travel before admission at all five sports venues',()=>{
 const t=setup(),money=supply(t.state),originalCount=t.state.flies.length;
 t.tick();
 for(const venue of SPORTS_ACTIVITY_VENUES){
  const invited=t.state.flies.filter(f=>f.sportsInvitation?.venueId===venue.id);
  assert.ok(invited.length>=2,`${venue.id} has an actual pickup party`);
  assert.ok(invited.length<=venue.pickupPlayers);
  assert.ok(invited.every(f=>f.traveling&&!f.sportsSession));
 }
 assert.equal(t.system.snapshot().participants.length,0);assert.equal(t.state.businesses['sports-aviation'].cash,0);
 const f=t.state.flies.find(f=>f.sportsInvitation);t.system.handleResident(f,{hour:8});assert.equal(f.sportsSession,undefined,'unarrived players cannot play or pay');
 t.arrive();
 for(const venue of SPORTS_ACTIVITY_VENUES)assert.ok(t.system.snapshot().venues.find(v=>v.id===venue.id).playing>=2);
 assert.equal(t.state.flies.length,originalCount);assert.ok(Math.abs(supply(t.state)-money)<1e-9);
 assert.ok(t.state.businesses['sports-aviation'].cash>0);
});

test('North has four distinct playable tennis courts and golf/football use their real field geometry',()=>{
 const t=setup({north:32});t.tick();t.arrive();
 for(const kind of ['golf','football']){
  const field=SPORTS_ACTIVITY_VENUES.find(v=>v.kind===kind),players=t.state.flies.filter(f=>f.sportsSession?.kind===kind);
  assert.ok(players.length>=2);
  for(const f of players){assert.ok(Math.abs(f.x-field.x)<field.w/2);assert.ok(Math.abs(f.z-field.z)<field.d/2);}
 }
 const tennis=t.state.flies.filter(f=>f.sportsSession?.venueId==='north-tennis');
 assert.equal(tennis.length,8);
 // Fill the remaining slots by ordinary arrival; each slot belongs to a court.
 const venue=SPORTS_ACTIVITY_VENUES.find(v=>v.id==='north-tennis');
 for(let i=0;i<8;i++){
  const f=t.state.flies.find(f=>!f.sportsSession&&!f.sportsInvitation&&countryAt(f)==='north-city');
  // Add no residents: use one existing player from another sport if needed.
  const player=f||t.state.flies.find(f=>f.sportsSession?.venueId==='north-golf'||f.sportsSession?.venueId==='north-football');
  player.sportsSession=null;player.currentLocationId='north-tennis';player.traveling=false;
  assert.equal(t.system.beginSports(player,'tennis','player','north-tennis'),true);
 }
 const players=t.state.flies.filter(f=>f.sportsSession?.venueId==='north-tennis');assert.equal(players.length,16);
 for(let court=0;court<4;court++)assert.equal(players.filter(f=>Math.floor(f.sportsSession.slot/4)===court).length,4);
 const extra=t.state.flies.find(f=>!f.sportsSession&&countryAt(f)==='north-city');extra.currentLocationId='north-tennis';
 assert.equal(t.system.beginSports(extra,'tennis','player','north-tennis'),false);assert.equal(venue.capacity,16);
});

test('playing residents move visibly, persist across restore, pay once, and earn skill/social effects after a full session',()=>{
 const t=setup();t.tick();t.arrive();
 const golf=t.state.flies.find(f=>f.sportsSession?.kind==='golf'),id=golf.id,start={x:golf.x,z:golf.z},money=supply(t.state),revenue=t.state.businesses['sports-aviation'].cash;
 t.restore();t.tick(600);const f=t.state.flies.find(f=>f.id===id);t.system.handleResident(f,{hour:9});
 assert.ok(Math.hypot(f.x-start.x,f.z-start.z)>1);assert.equal(f.indoors,false);assert.equal(t.state.businesses['sports-aviation'].cash,revenue);
 t.state.simulationAgeSeconds=f.sportsSession.until;t.system.handleResident(f,{hour:10});
 assert.equal(f.sportsSession,null);assert.ok(f.sportsProfile.golf>0);assert.ok(f.loneliness<60&&f.stress<50);assert.equal(t.system.snapshot().pickups.completed,1);
 assert.ok(Math.abs(supply(t.state)-money)<1e-9);
});

test('crisis hunger, work, construction and ambulance commitments take priority without fake food or forced attendance',()=>{
 const t=setup({north:8,hans:0});
 for(const f of t.state.flies)f.hunger=95;
 const food=t.state.flies.map(f=>f.hunger),count=t.state.flies.length;t.tick();
 assert.equal(t.journeys.length,0);assert.deepEqual(t.state.flies.map(f=>f.hunger),food);assert.equal(t.state.flies.length,count);
 assert.match(t.system.snapshot().pickups.blocked['north-golf'].reason,/healthy, fed, off-duty/);
 for(const f of t.state.flies)f.hunger=40;
 t.state.flies[0].testWorking=true;t.state.flies[1].urbanTask={id:'BUILD-1'};t.state.flies[2].ambulanceDuty={id:'CARE-1'};t.state.flies[3].nationalSupplyTask={id:'SUPPLY-1'};
 t.tick(900);assert.ok(t.journeys.length>0);
 for(const f of t.state.flies.slice(0,4))assert.equal(f.sportsInvitation,undefined);
 t.arrive();const player=t.state.flies.find(f=>f.sportsSession),before=player.sportsProfile;player.ambulanceDuty={id:'CARE-2'};
 assert.equal(t.system.handleResident(player,{hour:9}),false);assert.equal(player.sportsSession,null);assert.equal(player.sportsProfile,before);
});

test('denied travel, closed venues and night hours do not charge entry or teleport players',()=>{
 const t=setup({denied:true}),before=t.state.flies.map(f=>[f.x,f.z]);t.tick();
 assert.ok(t.journeys.length>0);assert.ok(t.state.flies.every(f=>!f.sportsInvitation&&!f.sportsSession));assert.deepEqual(t.state.flies.map(f=>[f.x,f.z]),before);assert.equal(t.state.businesses['sports-aviation'].cash,0);
 const night=setup();night.state.simulationAgeSeconds=22*3600;night.tick();assert.equal(night.journeys.length,0);
 const storm=setup();storm.state.weather={condition:'thunderstorm'};storm.tick();assert.equal(storm.journeys.length,0);
});
