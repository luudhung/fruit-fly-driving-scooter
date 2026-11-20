import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {gzipSync} from "node:zlib";
import {exportSnapshot, exportSnapshotMapped, loadSnapshot, saveSnapshot, saveSnapshotMapped, archiveRecordStream} from "../cloudflare/src/civilization-snapshot.mjs";

class SnapshotStorage {
  entries = new Map();

  async get(key) {
    if (Array.isArray(key)) return new Map(key.map(name => [name, this.entries.get(name)]));
    return this.entries.get(key);
  }

  async put(key, value) {
    this.entries.set(key, value);
  }

  async delete(key) {
    this.entries.delete(key);
  }

  async transaction(write) {
    await write(this);
  }
}

test("legacy checkpoints remain readable and export the original city", async () => {
  const storage = new SnapshotStorage();
  const state = {worldId: "WORLD-A", simulationAgeSeconds: 345600, flies: [{id: "FLY-1", brain: {id: "BRAIN-1"}}]};
  await storage.put("snapshot:meta", {version: 1, chunks: 1, lastWallClockMs: 1234});
  await storage.put("snapshot:chunk:0", gzipSync(JSON.stringify(state)));
  assert.deepEqual((await loadSnapshot(storage)).state, state);
  assert.deepEqual((await new Response(await exportSnapshot(storage, state.worldId)).json()).state, state);
  await storage.delete("snapshot:chunk:0");
  await assert.rejects(loadSnapshot(storage), /Missing civilization snapshot chunk/);
});

test("large checkpoints preserve active and archived residents across chunks and export ordinary JSON", async () => {
  const storage = new SnapshotStorage();
  const state = {
    worldId: "WORLD-A",
    simulationAgeSeconds: 201638319.7190038,
    flies: Array.from({length: 110}, (_, i) => ({
      id: `FLY-${i}`,
      alive: i % 2 === 0,
      brain: {id: `BRAIN-${i}`, memory: randomBytes(22_000).toString("base64") + " tiếng Việt\n🪰"},
    })),
  };
  const stats = await saveSnapshot(storage, state, 7890);
  assert.ok(stats.chunks > 1);
  const saved = await loadSnapshot(storage);
  assert.equal(saved.lastWallClockMs, 7890);
  assert.deepEqual(saved.state, state);
  assert.deepEqual((await new Response(await exportSnapshot(storage, state.worldId)).json()).state, state);
});


test('resident mapping can skip historical models and substitute current living brains during streamed parsing',async()=>{
 const storage=new SnapshotStorage();
 const state={worldId:'W',simulationAgeSeconds:100,flies:[{id:'D',alive:false,brain:{id:'BD',memory:'old private archive'}},{id:'A',alive:true,brain:{id:'BA',memory:'old living'}}]};
 await saveSnapshot(storage,state,1);
 const live=await loadSnapshot(storage,{mapResident:f=>f.alive?f:null});assert.deepEqual(live.state.flies,[state.flies[1]]);
 const current={id:'A',alive:true,x:12,brain:{id:'BA',memory:'current private living'}};
 const restored=await loadSnapshot(storage,{mapResident:f=>f.id==='A'?current:f});
 assert.equal(restored.state.flies[1],current);assert.deepEqual(restored.state.flies[0],state.flies[0]);
 assert.deepEqual((await loadSnapshot(storage)).state,state,'mapping must never change the durable base');
});

test('mapped exports retain every untouched archived model and merge acknowledged living/death/birth records',async()=>{
 const storage=new SnapshotStorage(),archived={id:'D',alive:false,brain:{id:'BD',memory:randomBytes(40000).toString('base64')}};
 const state={worldId:'W',simulationAgeSeconds:100,flies:[archived,{id:'A',alive:true,brain:{id:'BA'}}]};await saveSnapshot(storage,state,1);
 const a={id:'A',alive:false,health:0,brain:{id:'BA',memory:'actual final memory'}},c={id:'C',alive:true,brain:{id:'BC'}};
 const doc={world:{worldId:'W',simulationAgeSeconds:700},actors:{A:a,C:c}};
 const exported=await new Response(await exportSnapshotMapped(storage,'W',doc)).json();
 assert.equal(exported.state.simulationAgeSeconds,700);assert.deepEqual(exported.state.flies,[archived,a,c]);
 assert.deepEqual((await loadSnapshot(storage)).state,state,'export does not rewrite archives');
});

test('mapped compaction streams a multichunk archive and preserves old brains, current deaths and new births exactly once',async()=>{
 const storage=new SnapshotStorage();
 const archive=Array.from({length:64},(_,i)=>({id:`HIST-${i}`,alive:i>=60,brain:{id:`BRAIN-${i}`,privateMemory:randomBytes(36000).toString('base64')+' 🪰\n'}}));
 archive.push({id:'constructor',alive:false,brain:{id:'OLD-CONSTRUCTOR',privateMemory:'historical identity'}});
 const old={worldId:'W',simulationAgeSeconds:100,policy:{currency:'H$'},flies:archive};
 await saveSnapshot(storage,old,111);
 const deceased={...archive[60],alive:false,health:0,causeOfDeath:'old age',brain:{id:'BRAIN-60',privateMemory:'actual final memories'}};
 const newborn={id:'NEW-BABY',alive:true,parents:['HIST-61'],brain:{id:'NEW-BRAIN',privateMemory:'new independent brain'}};
 const special={id:'__proto__',alive:true,brain:{id:'SPECIAL-BRAIN'}};
 const doc={world:{worldId:'W',simulationAgeSeconds:999,policy:{currency:'H$',name:'North & Hansdrex 🪰'}},actors:Object.fromEntries([[deceased.id,deceased],[newborn.id,newborn],[special.id,special]])};
 const stats=await saveSnapshotMapped(storage,doc,222);
 assert.ok(stats.chunks>1);
 const loaded=await loadSnapshot(storage);
 assert.equal(loaded.lastWallClockMs,222);assert.equal(loaded.state.simulationAgeSeconds,999);
 assert.deepEqual(loaded.state.policy,doc.world.policy);
 const expected=[...archive.slice(0,60),deceased,...archive.slice(61),newborn,special];
 assert.deepEqual(loaded.state.flies,expected);
 assert.equal(new Set(loaded.state.flies.map(f=>f.id)).size,expected.length);
 assert.deepEqual((await new Response(await exportSnapshot(storage,'W')).json()).state,loaded.state);
 await saveSnapshotMapped(storage,doc,333);
 assert.deepEqual((await loadSnapshot(storage)).state.flies,expected,'repeated compaction does not duplicate births or archived deaths');
 let records=0;
 for await(const record of archiveRecordStream(storage)){assert.deepEqual(record,expected[records++]);}
 assert.equal(records,expected.length);
});

test('failed mapped snapshot publication atomically retains the last complete archive and clock',async()=>{
 class AtomicStorage extends SnapshotStorage{
  failKey=null;
  async transaction(write){
   const draft=new SnapshotStorage();draft.entries=new Map(this.entries);
   const parent=this,put=draft.put.bind(draft);
   draft.put=async(key,value)=>{if(key===parent.failKey)throw Error('injected durable write failure');return put(key,value);};
   await write(draft);this.entries=draft.entries;
  }
 }
 const storage=new AtomicStorage(),dead={id:'D',alive:false,brain:{id:'BD',memory:'do not lose this archive'}},a={id:'A',alive:true,brain:{id:'BA'}};
 const old={simulationAgeSeconds:100,flies:[dead,a]};await saveSnapshot(storage,old,111);
 const meta=structuredClone(storage.entries.get('snapshot:meta'));
 const doc={world:{simulationAgeSeconds:200},actors:{A:{...a,alive:false},B:{id:'B',alive:true,brain:{id:'BB'}}}};
 storage.failKey='snapshot:meta';await assert.rejects(saveSnapshotMapped(storage,doc,222),/injected durable write failure/);
 assert.deepEqual(storage.entries.get('snapshot:meta'),meta);
 assert.deepEqual((await loadSnapshot(storage)).state,old);
 assert.equal((await loadSnapshot(storage)).lastWallClockMs,111);
 storage.failKey=null;await saveSnapshotMapped(storage,doc,222);
 assert.deepEqual((await loadSnapshot(storage)).state.flies,[dead,doc.actors.A,doc.actors.B]);
});

test('mapped compaction upgrades legacy JSON and can create an empty or first current base',async()=>{
 const storage=new SnapshotStorage(),old={simulationAgeSeconds:10,flies:[{id:'D',alive:false,brain:{id:'BD'}},{id:'A',alive:true,brain:{id:'BA'}}]};
 await storage.put('snapshot:meta',{version:1,chunks:1,lastWallClockMs:1});
 await storage.put('snapshot:chunk:0',gzipSync(JSON.stringify(old)));
 const doc={world:{simulationAgeSeconds:20},actors:{A:{id:'A',alive:true,x:15,brain:{id:'BA'}}}};
 await saveSnapshotMapped(storage,doc,2);assert.equal(storage.entries.get('snapshot:meta').version,2);
 assert.deepEqual((await loadSnapshot(storage)).state.flies,[old.flies[0],doc.actors.A]);
 const first=new SnapshotStorage();await saveSnapshotMapped(first,{world:{simulationAgeSeconds:0},actors:{}},3);
 assert.deepEqual((await loadSnapshot(first)).state,{simulationAgeSeconds:0,flies:[]});
});

test('cold journal boot can read just the base header without parsing historical brain records',async()=>{
 const {loadSnapshotHeader}=await import('../cloudflare/src/civilization-snapshot.mjs');
 const storage=new SnapshotStorage(),header={worldId:'WORLD-A',mapVersion:36,simulationAgeSeconds:100,timeScale:120};
 // A malformed archive record deliberately proves the header reader never
 // parses resident history. The ordinary archive loader still rejects it.
 await storage.put('snapshot:meta',{version:2,chunks:1,lastWallClockMs:1234,savedAtMs:2345});
 await storage.put('snapshot:chunk:0',gzipSync(JSON.stringify(header).slice(0,-1)+'\n,"flies":[\nINVALID ARCHIVE RECORD\n]}\n'));
 const saved=await loadSnapshotHeader(storage);assert.deepEqual(saved.state,{...header,flies:[]});assert.equal(saved.lastWallClockMs,1234);assert.equal(saved.savedAtMs,2345);
 await assert.rejects(loadSnapshot(storage));
});

test('living-only cold boot skips large archived brains without changing the durable archive or confusing nested liveness',async()=>{
 const storage=new SnapshotStorage(),dead={id:'D',name:'old',alive:false,brain:{memory:'old memories '.repeat(10000)}},nested={id:'LIVE',traits:{alive:false},alive:true,brain:{id:'B'}};
 const state={worldId:'W',simulationAgeSeconds:123,flies:[dead,nested]};await saveSnapshot(storage,state,1);
 const mapped=[];const current=await loadSnapshot(storage,{livingOnly:true,mapResident:f=>{mapped.push(f.id);return f;}});
 assert.deepEqual(mapped,['LIVE']);assert.deepEqual(current.state.flies,[nested]);assert.deepEqual((await loadSnapshot(storage)).state,state);
 const journalHeader=await import('../cloudflare/src/civilization-snapshot.mjs');assert.equal((await journalHeader.loadSnapshotHeader(storage)).state.flies.length,0);
});
