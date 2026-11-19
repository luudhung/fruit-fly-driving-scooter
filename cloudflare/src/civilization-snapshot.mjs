const META_KEY = "snapshot:meta";
const CHUNK_SIZE = 1_500_000;
const MAX_CHUNKS = 128;
const chunkKey = index => `snapshot:chunk:${index}`;
const encoder = new TextEncoder();

function streamFrom(iterator) {
  return new ReadableStream({
    async pull(controller) {
      const {value, done} = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

// Version 2 is still standard JSON. Line breaks allow a cold start to parse
// one resident at a time instead of holding the entire JSON document in memory.
function* snapshotJson(state) {
  const {flies, ...world} = state;
  const header = JSON.stringify(world);
  yield encoder.encode(header.slice(0, -1) + '\n');
  yield encoder.encode((header.length > 2 ? ',' : '') + '"flies":[\n');
  for (const [index, fly] of flies.entries()) {
    yield encoder.encode((index ? ',' : '') + JSON.stringify(fly) + '\n');
  }
  yield encoder.encode(']}\n');
}

async function readStoredSnapshot(storage) {
  const meta = await storage.get(META_KEY);
  if (meta == null) return null;
  const count = Number(meta.chunks);
  if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) {
    throw new Error("Invalid civilization snapshot metadata");
  }
  const keys = Array.from({length: count}, (_, index) => chunkKey(index));
  const stored = await storage.get(keys, {noCache: true});
  const parts = keys.map(key => {
    const part = stored.get(key);
    if (part instanceof ArrayBuffer) return new Uint8Array(part);
    if (ArrayBuffer.isView(part)) return new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
    throw new Error(`Missing civilization snapshot chunk: ${key}`);
  });
  return {meta, json: streamFrom(parts.values()).pipeThrough(new DecompressionStream("gzip"))};
}

async function readFramedJson(stream, mapResident = null) {
  let state, opened = false, closed = false, buffer = "";
  for await (const text of stream.pipeThrough(new TextDecoderStream())) {
    buffer += text;
    let end;
    while ((end = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (closed) throw new Error("Unexpected data after civilization snapshot");
      if (state === undefined) {
        state = JSON.parse(line + '}');
        state.flies = [];
      } else if (!opened) {
        if (line !== ',"flies":[' && line !== '"flies":[') throw new Error("Invalid resident list");
        opened = true;
      } else if (line === ']}') {
        closed = true;
      } else {
        const resident=JSON.parse(line.startsWith(',')?line.slice(1):line);
        const mapped=mapResident?mapResident(resident):resident;
        if(mapped!=null)state.flies.push(mapped);
      }
    }
  }
  if (!closed || buffer) throw new Error("Incomplete civilization snapshot");
  return state;
}

/** An accepted living journal is complete on its own. Read only the framed
 * base header to validate its generation; historical private brains stay in
 * storage until an explicit export/compaction streams them. */
export async function loadSnapshotHeader(storage){
  const saved=await readStoredSnapshot(storage);if(!saved)return null;
  if(saved.meta.version!==2)return loadSnapshot(storage,{mapResident:f=>f.alive?f:null});
  let buffer='',state;
  for await(const text of saved.json.pipeThrough(new TextDecoderStream())){
    buffer+=text;const end=buffer.indexOf('\n');if(end===-1)continue;
    state=JSON.parse(buffer.slice(0,end)+'}');state.flies=[];break;
  }
  if(!state)throw Error('Missing civilization snapshot header');
  return {state,lastWallClockMs:Number(saved.meta.lastWallClockMs||Date.now()),savedAtMs:Number(saved.meta.savedAtMs||0),stats:{chunks:saved.meta.chunks,compressedBytes:saved.meta.compressedBytes}};
}

export async function loadSnapshot(storage, {mapResident=null}={}) {
  const saved = await readStoredSnapshot(storage);
  if (!saved) return null;
  const {meta, json} = saved;
  const state = meta.version === 2 ? await readFramedJson(json,mapResident) : await new Response(json).json();
  if(meta.version!==2&&mapResident)state.flies=state.flies.map(mapResident).filter(f=>f!=null);
  return {
    state,
    lastWallClockMs: Number(meta.lastWallClockMs || Date.now()),
    savedAtMs: Number(meta.savedAtMs || 0),
    stats: {chunks: meta.chunks, compressedBytes: meta.compressedBytes},
  };
}

async function saveSnapshotStream(storage,json,world,lastWallClockMs){
  const stream=json.pipeThrough(new CompressionStream("gzip"));
  const compressed=new Uint8Array(await new Response(stream).arrayBuffer());
  const chunks=Math.ceil(compressed.byteLength/CHUNK_SIZE);
  if(chunks>MAX_CHUNKS)throw new Error(`Civilization snapshot needs ${chunks} chunks`);
  const stats={chunks,compressedBytes:compressed.byteLength};
  // Compression completes before any base chunks are replaced. Transactional
  // publication keeps either complete generation readable after a failed write.
  await storage.transaction(async transaction=>{
    const oldMeta=await transaction.get(META_KEY);
    for(let index=0;index<chunks;index++){
      const start=index*CHUNK_SIZE;
      await transaction.put(chunkKey(index),compressed.slice(start,start+CHUNK_SIZE).buffer,{noCache:true});
    }
    for(let index=chunks;index<Number(oldMeta?.chunks||0);index++)await transaction.delete(chunkKey(index));
    await transaction.put(META_KEY,{version:2,codec:"gzip-json",...stats,
      simulationAgeSeconds:world.simulationAgeSeconds,lastWallClockMs,savedAtMs:Date.now()});
  });
  return stats;
}

export async function saveSnapshot(storage,state,lastWallClockMs){
  return saveSnapshotStream(storage,streamFrom(snapshotJson(state)),state,lastWallClockMs);
}

/** The v2 archive decoder retains only its header, one framed resident and the
 * decompression buffer. Consumers must not collect historical brain records. */
async function* storedResidentRecords(saved){
  if(saved.meta.version!==2){
    // Read compatibility for pre-framed checkpoints. Every newly written base
    // is v2, including a mapped compaction of this legacy format.
    const legacy=await new Response(saved.json).json();
    for(const resident of legacy.flies)yield resident;
    return;
  }
  let buffer='',lineIndex=0,finished=false;
  for await(const text of saved.json.pipeThrough(new TextDecoderStream())){
    buffer+=text;let end;
    while((end=buffer.indexOf('\n'))!==-1){
      const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
      if(finished)throw Error('Unexpected archived snapshot data');
      if(lineIndex===0){JSON.parse(line+'}');lineIndex++;continue;}
      if(lineIndex===1){
        if(line!==',"flies":['&&line!=='"flies":[')throw Error('Invalid resident list');
        lineIndex++;continue;
      }
      if(line===']}'){finished=true;continue;}
      yield JSON.parse(line.startsWith(',')?line.slice(1):line);
    }
  }
  if(!finished||buffer)throw Error('Incomplete archived snapshot');
}

export async function* archiveRecordStream(storage){
  const saved=await readStoredSnapshot(storage);
  if(saved)yield* storedResidentRecords(saved);
}

async function* mappedResidentRecords(saved,actors){
  const seen=new Set();
  if(saved)for await(const old of storedResidentRecords(saved)){
    if(seen.has(old.id))throw Error(`Duplicate archived resident: ${old.id}`);
    seen.add(old.id);
    yield Object.hasOwn(actors,old.id)?actors[old.id]:old;
  }
  for(const [id,actor]of Object.entries(actors))if(!seen.has(id))yield actor;
}

async function* mappedSnapshotJson(saved,document){
  const {flies,...world}=document.world,header=JSON.stringify(world);
  yield encoder.encode(header.slice(0,-1)+'\n');
  yield encoder.encode((header.length>2?',':'')+'"flies":[\n');
  let count=0;
  for await(const resident of mappedResidentRecords(saved,document.actors)){
    yield encoder.encode((count++?',':'')+JSON.stringify(resident)+'\n');
  }
  yield encoder.encode(']}\n');
}

/** Compact a current live document over the archived base without hydrating
 * historical models into the engine. Deaths/births replace or append by stable
 * ID; every omitted historical resident and private brain remains untouched. */
export async function saveSnapshotMapped(storage,document,lastWallClockMs){
  const saved=await readStoredSnapshot(storage);
  return saveSnapshotStream(storage,streamFrom(mappedSnapshotJson(saved,document)),document.world,lastWallClockMs);
}

export async function exportSnapshot(storage, worldId) {
  const saved = await readStoredSnapshot(storage);
  if (!saved) throw new Error("No saved civilization snapshot");
  return streamFrom((async function* () {
    const header = JSON.stringify({exportedAt: new Date().toISOString(), worldId});
    yield encoder.encode(header.slice(0, -1) + ',"state":');
    yield* saved.json;
    yield encoder.encode('}');
  })());
}


/** Stream a consistent accepted living document over the untouched archived base.
 * Resident replacement happens one record at a time; old living brains are never
 * retained alongside their already-loaded current replacements. */
export async function exportSnapshotMapped(storage,worldId,document){
  const saved=await readStoredSnapshot(storage);
  if(!saved)throw Error('No saved civilization snapshot');
  const head=JSON.stringify({exportedAt:new Date().toISOString(),worldId});
  return streamFrom((async function*(){
    yield encoder.encode(head.slice(0,-1)+',"state":');
    yield* mappedSnapshotJson(saved,document);
    yield encoder.encode('}');
  })());
}
