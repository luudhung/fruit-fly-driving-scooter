import test from 'node:test';import assert from 'node:assert/strict';
import {projectLocalDocument,diffLocalDocument,applyLocalDelta} from '../worker/local-host-delta.mjs';
import {saveLocalHostBase,appendLocalHostDelta,loadLocalHostJournal,clearLocalHostJournal} from '../cloudflare/src/local-host-journal.mjs';
function storage(){
 const map=new Map();let fail=false,writes=0;
 const api={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>{writes++;map.set(k,structuredClone(v));},delete:async k=>map.delete(k)};
 api.transaction=async fn=>{const copy=new Map([...map].map(([k,v])=>[k,structuredClone(v)]));const tx={get:async k=>structuredClone(copy.get(k)),put:async(k,v)=>{if(fail){fail=false;throw Error('disk unavailable');}writes++;copy.set(k,structuredClone(v));},delete:async k=>copy.delete(k)};const r=await fn(tx);map.clear();for(const [k,v]of copy)map.set(k,v);return r;};
 return{...api,map,failNext:()=>{fail=true;},get writes(){return writes;}};
}
const base=()=>({worldId:'W',mapVersion:36,simulationAgeSeconds:100,timeScale:120,totalTransactions:0,flies:[{id:'A',alive:true,x:0,z:0,health:100,money:50,brain:{id:'B'}},{id:'OLD',alive:false,x:1,z:1,health:0,brain:{id:'ARCHIVE'}}]});
const owner=()=>({protocol:3,token:'T',epoch:4,sequence:0,startedAt:Date.now(),baseAge:100,expiresAt:Date.now()+120000});
const aliveDoc=s=>projectLocalDocument({...s,flies:s.flies.filter(f=>f.alive)});
function change(document,sequence){const next=structuredClone(document);next.world.simulationAgeSeconds+=600;next.actors.A.x=sequence;next.actors.A.money+=2;next.world.totalTransactions++;return next;}
test('a five-real-second delta is durable before acknowledgement and cold restore retains archives, deaths, births and money',async()=>{
 const db=storage(),s=base(),lease=owner();let doc=aliveDoc(s);
 await saveLocalHostBase(db,doc,lease,{observer:{simulationAgeSeconds:100}});
 const next=change(doc,1);next.actors.A.alive=false;next.actors.A.health=0;next.actors.C={id:'C',alive:true,x:2,z:3,health:100,money:10,brain:{id:'CHILD',parents:['B']}};
 const body={epoch:lease.epoch,sequence:1,baseSequence:0,patch:diffLocalDocument(doc,next)};
 await appendLocalHostDelta(db,next,body,{...lease,sequence:1},{simulationAgeSeconds:700});
 const cold=await loadLocalHostJournal(db,s);
 assert.deepEqual(cold.document,next);assert.equal(cold.state.flies.length,3);assert.equal(cold.state.flies.find(f=>f.id==='OLD').brain.id,'ARCHIVE');
 assert.equal(cold.state.flies.find(f=>f.id==='A').alive,false);assert.equal(cold.state.flies.find(f=>f.id==='C').brain.id,'CHILD');assert.equal(cold.state.totalTransactions,1);
 assert.equal((await db.get('localHostLease')).sequence,1);assert.equal(cold.observer.simulationAgeSeconds,700);
});
test('a rejected atomic write leaves the previous complete save and lease visible after a crash',async()=>{
 const db=storage(),s=base(),lease=owner(),doc=aliveDoc(s);await saveLocalHostBase(db,doc,lease);
 const next=change(doc,1),body={epoch:4,sequence:1,baseSequence:0,patch:diffLocalDocument(doc,next)};db.failNext();
 await assert.rejects(appendLocalHostDelta(db,next,body,{...lease,sequence:1},null),/disk/);
 const cold=await loadLocalHostJournal(db,s);assert.equal(cold.document.world.simulationAgeSeconds,100);assert.equal(cold.document.actors.A.money,50);assert.equal((await db.get('localHostLease')).sequence,0);
 await appendLocalHostDelta(db,next,body,{...lease,sequence:1},null);assert.equal((await loadLocalHostJournal(db,s)).state.simulationAgeSeconds,700);
});
test('rolling living overlays bound journal rows and preserve the exact latest save across many compactions',async()=>{
 const db=storage(),s=base(),lease=owner();let doc=aliveDoc(s);await saveLocalHostBase(db,doc,lease);
 for(let sequence=1;sequence<=40;sequence++){
  const next=change(doc,sequence),patch=diffLocalDocument(doc,next);
  await appendLocalHostDelta(db,next,{epoch:4,sequence,baseSequence:sequence-1,patch},{...lease,sequence},{simulationAgeSeconds:next.world.simulationAgeSeconds});doc=next;
  assert.ok(db.map.size<=18,'old generations and deltas must be reclaimed');
 }
 const cold=await loadLocalHostJournal(db,s);assert.deepEqual(cold.document,doc);assert.equal(cold.meta.sequence,40);assert.equal(cold.state.totalTransactions,40);
 await clearLocalHostJournal(db);assert.equal(await db.get('local-save:meta'),undefined);assert.equal([...db.map.keys()].filter(k=>k.startsWith('local-save:')).length,0);
});

test('capture time survives both delta writes and rolling compaction independently of receipt time',async()=>{
 const db=storage(),s=base(),lease=owner(),at=Date.now()-10000;let doc=aliveDoc(s);
 await saveLocalHostBase(db,doc,lease,{lastWallClockMs:at});
 for(let sequence=1;sequence<=13;sequence++){
  const next=change(doc,sequence),stateAtMs=at+sequence*100;
  await appendLocalHostDelta(db,next,{epoch:4,sequence,baseSequence:sequence-1,stateAtMs,patch:diffLocalDocument(doc,next)},{...lease,sequence},null);
  const cold=await loadLocalHostJournal(db,s);assert.equal(cold.lastWallClockMs,stateAtMs);assert.ok(cold.savedAtMs>=at+10000);doc=next;
 }
 assert.equal((await loadLocalHostJournal(db,s)).meta.entries.length,0,'the thirteenth write exercised compaction');
});
test('a final release checkpoint compacts with its actual sequence and clears ownership atomically',async()=>{
 const db=storage(),s=base(),lease=owner();let doc=aliveDoc(s);await saveLocalHostBase(db,doc,lease);
 for(let sequence=1;sequence<=13;sequence++){const next=change(doc,sequence);await appendLocalHostDelta(db,next,{epoch:4,sequence,baseSequence:sequence-1,patch:diffLocalDocument(doc,next)},sequence===13?null:{...lease,sequence},null);doc=next;}
 assert.equal(await db.get('localHostLease'),undefined);const cold=await loadLocalHostJournal(db,s);assert.equal(cold.meta.sequence,13);assert.equal(cold.document.actors.A.money,76);
});

test('header-only cold resume retains current money, deaths and births while archival compaction preserves every historical brain',async()=>{
 const {loadSnapshotHeader,saveSnapshot,saveSnapshotMapped,loadSnapshot}=await import('../cloudflare/src/civilization-snapshot.mjs');
 const db=storage(),singleGet=db.get;db.get=async keys=>Array.isArray(keys)?new Map(await Promise.all(keys.map(async k=>[k,await singleGet(k)]))):singleGet(keys);
 const original=base();await saveSnapshot(db,original,1234);
 const lease=owner(),document=aliveDoc(original);document.world.simulationAgeSeconds=700;
 document.actors.A.alive=false;document.actors.A.money=72;document.actors.CHILD={id:'CHILD',alive:true,x:1,z:2,health:99,money:15,brain:{id:'NEW-BRAIN',memory:{episodes:['birth']}}};
 await saveLocalHostBase(db,document,lease,{lastWallClockMs:5678});
 const header=await loadSnapshotHeader(db);assert.equal(header.state.flies.length,0);
 const resumed=await loadLocalHostJournal(db,header.state,header.savedAtMs);
 assert.equal(resumed.state.simulationAgeSeconds,700);assert.equal(resumed.state.flies.find(f=>f.id==='A').money,72);assert.equal(resumed.state.flies.find(f=>f.id==='A').alive,false);assert.equal(resumed.state.flies.find(f=>f.id==='CHILD').brain.id,'NEW-BRAIN');
 assert.equal(resumed.state.flies.some(f=>f.id==='OLD'),false,'history is not hydrated into the current engine');
 await saveSnapshotMapped(db,resumed.document,resumed.lastWallClockMs);
 const complete=await loadSnapshot(db);assert.equal(complete.state.flies.length,3);assert.deepEqual(complete.state.flies.find(f=>f.id==='OLD'),original.flies.find(f=>f.id==='OLD'));assert.equal(complete.state.flies.find(f=>f.id==='A').money,72);assert.equal(complete.state.flies.find(f=>f.id==='CHILD').brain.id,'NEW-BRAIN');assert.equal(complete.lastWallClockMs,5678);
});

test('background cold resume omits the duplicate observer graph without losing the accepted world or its actors',async()=>{
 const db=storage(),s=base(),lease=owner(),doc=aliveDoc(s),observer={simulationAgeSeconds:100,large:Array.from({length:3000},(_,i)=>({id:i,label:'state, braces { \\" }'}))};
 await saveLocalHostBase(db,doc,lease,{observer});
 const cold=await loadLocalHostJournal(db,s,0,()=>{},{includeObserver:false});
 assert.equal(cold.observer,null);assert.deepEqual(cold.document,{...doc,world:{...doc.world,historyCleanupVersion:1}});assert.equal(cold.state.flies.find(f=>f.id==='OLD').brain.id,'ARCHIVE');
 assert.deepEqual((await loadLocalHostJournal(db,s)).observer,observer,'an active owner can still resume its exact observer baseline');
});

test('background restart replays accepted deltas before pruning past tour caches, visitor indices or settled deaths',async()=>{
 const db=storage(),s=base(),lease=owner(),doc=aliveDoc(s);
 doc.world.northF1={previousTours:[{id:'FINISHED',charters:[{id:'OLD-FLIGHT',departed:true,guests:[]}]}],event:{tourPaths:{finished:{points:[{x:1,z:2}],seconds:20}},charters:[]}};
 doc.world.cityVisitors={visitors:[{id:'DEPARTED',departed:true,money:40,brain:{id:'VISITOR-OLD'}},{id:'STAYING',departed:false,money:100,brain:{id:'VISITOR-LIVE'}}]};
 doc.actors.SETTLED={id:'SETTLED',name:'Ancestor',alive:false,estateSettled:true,parents:['P'],brain:{id:'PRIVATE-OLD'}};
 await saveLocalHostBase(db,doc,lease,{observer:{privateView:'omitted'}});
 const next=change(doc,1);next.world.northF1.event.tourPaths.finished.seconds=19;
 next.world.cityVisitors.visitors[1].money=75;next.actors.SETTLED.finalReceipt={id:'ESTATE',amount:50};
 await appendLocalHostDelta(db,next,{epoch:4,sequence:1,baseSequence:0,patch:diffLocalDocument(doc,next)},null,null);
 const exact=await loadLocalHostJournal(db,s);assert.deepEqual(exact.document,next);
 const cold=await loadLocalHostJournal(db,s,0,()=>{},{includeObserver:false});
 assert.equal(cold.meta.sequence,1);assert.equal(cold.state.simulationAgeSeconds,700);assert.equal(cold.observer,null);
 assert.deepEqual(cold.state.northF1.event.tourPaths,{});assert.deepEqual(cold.state.northF1.previousTours,[]);
 assert.deepEqual(cold.state.cityVisitors.visitors,[next.world.cityVisitors.visitors[1]]);
 assert.equal(cold.state.cityVisitors.visitors[0].id,'STAYING');assert.equal(cold.state.cityVisitors.visitors[0].money,75);assert.equal(cold.state.cityVisitors.visitors[0].brain.id,'VISITOR-LIVE');
 assert.equal(cold.document.actors.SETTLED,undefined);assert.deepEqual(cold.state.ancestors.SETTLED,{name:'Ancestor',parents:['P']});
 assert.equal(cold.document.actors.A.money,next.actors.A.money);assert.equal(cold.state.totalTransactions,next.world.totalTransactions);
 assert.deepEqual((await loadLocalHostJournal(db,s)).document,next,'cleanup must never rewrite the saved journal or a live owner baseline');
});

test('a newer acknowledged map overlay cold-resumes over the older archive without discarding progress, money or brain identities',async()=>{
 const db=storage(),s=base(),lease=owner(),doc=aliveDoc(s);doc.world.mapVersion=37;doc.world.simulationAgeSeconds=700;doc.world.totalTransactions=19;doc.actors.A.x=27;doc.actors.A.money=321;doc.world.airportSpurRetiredVersion=1;
 await saveLocalHostBase(db,doc,lease,{lastWallClockMs:12345});
 const cold=await loadLocalHostJournal(db,s);assert.equal(cold.state.mapVersion,37);assert.equal(cold.state.simulationAgeSeconds,700);assert.equal(cold.state.totalTransactions,19);assert.equal(cold.state.airportSpurRetiredVersion,1);assert.equal(cold.state.flies.find(f=>f.id==='A').money,321);assert.equal(cold.state.flies.find(f=>f.id==='A').brain.id,'B');assert.deepEqual(cold.state.flies.find(f=>f.id==='OLD'),s.flies.find(f=>f.id==='OLD'));assert.equal(cold.lastWallClockMs,12345);assert.deepEqual(cold.document,doc);
 const again=await loadLocalHostJournal(db,s);assert.deepEqual(again.state,cold.state);assert.equal((await db.get('local-save:meta')).mapVersion,37);
});

test('map compatibility still rejects an unacknowledged older schema or inconsistent overlay metadata',async()=>{
 const db=storage(),s=base(),lease=owner(),doc=aliveDoc(s);doc.world.simulationAgeSeconds=700;await saveLocalHostBase(db,doc,lease);
 await assert.rejects(loadLocalHostJournal(db,{...s,mapVersion:37}),/incompatible local save journal/);
 const meta=await db.get('local-save:meta');meta.mapVersion=37;await db.put('local-save:meta',meta);await assert.rejects(loadLocalHostJournal(db,s),/overlay schema mismatch/);
});
