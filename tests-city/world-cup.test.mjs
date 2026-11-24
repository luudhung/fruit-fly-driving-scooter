import test from'node:test';import assert from'node:assert/strict';import{createWorldCup,WORLD_CUP_RULES}from'../worker/world-cup.mjs';import{SPORTS_VENUES,entrance}from'../worker/city-map.mjs';
const DAY=86400;
function fixture(){let s={simulationAgeSeconds:8*DAY,timeScale:120,flies:[],treasury:{cash:100},businesses:{},weather:{condition:'clear'},northF1:{nextAt:10*DAY+19*3600,previousTours:[]}};const system=()=>createWorldCup({world:()=>s,lawfulPresence:()=>true});let w=system();return{get s(){return s;},get w(){return w;},restore(){s=structuredClone(s);w=system();}};}
const wallet=s=>s.treasury.cash+Object.values(s.businesses).reduce((a,b)=>a+Number(b.cash||0),0)+s.flies.reduce((a,f)=>a+f.money+f.savings,0);
test('World Cup follows F1 by two days in a four-day alternating calendar and books foreign squads without training residents',()=>{const t=fixture();assert.equal(WORLD_CUP_RULES.cadenceDays,4);assert.equal(WORLD_CUP_RULES.hostingFee,1000);assert.equal(t.w.snapshot().nextAt,t.s.northF1.nextAt+2*DAY);t.s.simulationAgeSeconds=t.w.snapshot().nextAt-3*DAY;t.w.tick();const e=t.s.worldCup.event,guests=e.charters.flatMap(f=>f.guests);assert.equal(e.charterDemand,350);assert.equal(guests.length,380);assert.equal(guests.filter(f=>f.eventRole==='football-player').length,30);assert.equal(guests.filter(f=>f.eventRole==='spectator').length,350);assert.equal(new Set(guests.map(f=>f.id)).size,380);assert.ok(guests.every(f=>f.citizenshipCountryId==='outside'&&f.phase==='inbound'));assert.ok(e.charters.every(f=>f.guests.length===10&&f.airportId==='city'));assert.equal(t.s.flies.length,0);const next=e.startsAt+4*DAY;e.charters=[];e.endsAt=t.s.simulationAgeSeconds;t.w.tick();assert.equal(t.w.snapshot().nextAt,next);});
test('only actual stadium admission collects foreign ticket money, Hansdrex residents enter free and hosting payment is once across restore',()=>{const t=fixture();t.s.simulationAgeSeconds=t.w.snapshot().nextAt-3*DAY;t.w.tick();const e=t.s.worldCup.event;e.charters=[];t.s.simulationAgeSeconds=e.startsAt;const v=SPORTS_VENUES.find(v=>v.id==='stadium'),gate=entrance(v),foreign={id:'FOREIGN-FAN',kind:'visitor',alive:true,citizenshipCountryId:'outside',money:1000,savings:0,...gate,x:0,z:0,currentLocationId:'stadium'},local={...foreign,id:'LOCAL-FAN',kind:'resident',citizenshipCountryId:'hansdrex',...gate};t.s.flies.push(foreign,local);assert.equal(t.w.attend(foreign),false);const total=wallet(t.s);Object.assign(foreign,gate);assert.ok(t.w.attend(foreign));assert.equal(foreign.money,900);assert.ok(t.w.attend(foreign));assert.equal(foreign.money,900);assert.equal(t.s.treasury.cash,200);assert.ok(t.w.attend(local));assert.equal(local.money,1000);assert.equal(wallet(t.s),total);
 for(let i=0;i<22;i++){const player={...foreign,id:'FOREIGN-PLAYER-'+i,eventRole:'football-player',lastWorldCupTicket:null,...gate};assert.ok(t.w.attend(player));}t.w.tick();assert.equal(t.s.worldCup.hostingRevenue,1000);assert.equal(t.s.worldCup.externalInflow,1000);assert.equal(t.s.treasury.cash,1200);t.restore();t.w.tick();assert.equal(t.s.treasury.cash,1200);assert.equal(t.s.worldCup.hostingRevenue,1000);assert.equal(t.s.worldCup.revenue,100);});

test('scheduled foreign squads physically clear Hansdrex immigration and reach the stadium before kickoff',async()=>{
 const {createInternationalLife}=await import('../worker/international-life.mjs');
 const {createCityVisitors}=await import('../worker/city-visitors.mjs');
 const s={simulationAgeSeconds:8*DAY,timeScale:120,flies:[],treasury:{cash:100000},businesses:{},housing:{households:{},apartmentBlocks:[],houseLots:[]},weather:{condition:'clear'},northF1:{nextAt:10*DAY+19*3600,previousTours:[]}};
 const countries=createInternationalLife({world:()=>s,redistribute:false,nationalEconomy:false});countries.init();
 const visitors=createCityVisitors({world:()=>s});visitors.init();
 const w=createWorldCup({world:()=>s,lawfulPresence:countries.lawfulPresence,aviationAdmission:countries.aviationAdmission,interceptMovement:countries.interceptMovement,bookEventHotel:visitors.reserveEventRoom,releaseEventHotel:visitors.releaseEventRoom});
 s.simulationAgeSeconds=w.snapshot().nextAt-3*DAY;w.tick();const e=s.worldCup.event;
 for(let at=s.simulationAgeSeconds+180;at<=e.startsAt;at+=180){s.simulationAgeSeconds=at;w.tick();}
 assert.equal(s.worldCup.charterArrivals,380);assert.equal(e.players.length,30);assert.ok(e.foreignFans.length>0);assert.ok(e.foreignFans.length<=350);
 assert.equal(s.worldCup.revenue,e.foreignFans.length*100);assert.equal(s.worldCup.hostingRevenue,1000);assert.equal(e.status,'playing');
 const all=e.charters.flatMap(f=>f.guests);assert.ok(all.every(g=>g.immigrationClearedAt<=e.startsAt));assert.ok(all.filter(g=>g.lastWorldCupTicket===e.id).every(g=>g.currentLocationId==='stadium'));
 const revenue=s.worldCup.revenue;w.tick();assert.equal(s.worldCup.revenue,revenue);
});

test('all 350 paying visitors fund Hansdrex directly while 150 Hansdrex residents pay nothing',()=>{
 const t=fixture();t.s.simulationAgeSeconds=t.w.snapshot().nextAt-3*DAY;t.w.tick();const e=t.s.worldCup.event;e.charters=[];t.s.simulationAgeSeconds=e.startsAt;
 const gate=entrance(SPORTS_VENUES.find(v=>v.id==='stadium'));
 for(let i=0;i<500;i++)t.s.flies.push({id:'TICKET-'+i,kind:i<350?'visitor':'resident',alive:true,citizenshipCountryId:i<350?'outside':'hansdrex',money:100,savings:0,x:gate.x,z:gate.z,currentLocationId:'stadium'});
 const total=wallet(t.s);for(const f of t.s.flies)assert.ok(t.w.attend(f));
 assert.equal(e.foreignFans.length,350);assert.equal(e.localFans.length,150);assert.equal(e.revenue,35000);assert.equal(t.s.treasury.cash,35100);assert.equal(wallet(t.s),total);
 t.restore();for(const f of t.s.flies)assert.ok(t.w.attend(f));assert.equal(t.s.treasury.cash,35100);assert.equal(t.s.worldCup.revenue,35000);assert.equal(wallet(t.s),total);
});
