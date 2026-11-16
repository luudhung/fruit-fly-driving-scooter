export const LOCAL_HOST_TTL_MS=120000;
export const LOCAL_HOST_HEARTBEAT_MS=5000;
export const LOCAL_HOST_CHECKPOINT_MS=20000;

/** Archived residents remain on the server. The browser receives every living
 * resident and the current simulation state required for deterministic ticks. */
export function localHostSnapshot(state){
 const projected={...state,flies:state.flies.filter(f=>f.alive),locations:undefined};
 return projected;
}
export function mergeLocalHostCheckpoint(current,incoming,lease,now){
 if(!incoming||!Array.isArray(incoming.flies)||incoming.flies.length===0||incoming.worldId!==current.worldId||incoming.mapVersion!==current.mapVersion)throw Error('incompatible local world');
 const age=Number(incoming.simulationAgeSeconds),base=Number(current.simulationAgeSeconds);
 const maximum=lease.baseAge+Math.max(1,(now-lease.startedAt)/1000+30)*Math.max(1,Number(current.timeScale||120));
 if(!Number.isFinite(age)||age<base||age>maximum)throw Error('local clock outside session bounds');
 const records=new Map(incoming.flies.map(f=>[f.id,f]));
 if(records.size!==incoming.flies.length||incoming.flies.some(f=>typeof f.id!=='string'||!Number.isFinite(f.x)||!Number.isFinite(f.z)||!Number.isFinite(f.health)))throw Error('invalid local residents');
 if(current.flies.some(f=>f.alive&&!records.has(f.id)))throw Error('missing living resident');
 const prior=new Map(current.flies.map(f=>[f.id,f]));
 for(const f of incoming.flies){
  const old=prior.get(f.id);
  if(old&&old.brain?.id!==f.brain?.id)throw Error('resident brain identity changed');
 }
 const flies=current.flies.map(f=>records.get(f.id)||f);
 for(const f of incoming.flies)if(!prior.has(f.id))flies.push(f);
 return {...incoming,flies,locations:current.locations};
}
