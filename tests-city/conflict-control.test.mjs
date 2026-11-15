import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {handleConflictControl} from '../worker/conflict-control.mjs';
import {createInternationalLife} from '../worker/international-life.mjs';

const command=id=>({requestId:id,quick:true});
const request=(value,headers={})=>new Request('https://city/api/civilization/conflict',{method:'POST',headers:{origin:'https://fruit-fly-driving-scooter.vercel.app',...headers},body:typeof value==='string'?value:JSON.stringify(value)});
function fixture(){
 const state={simulationAgeSeconds:10,timeScale:120,flies:[],treasury:{cash:10000},businesses:{},housing:{households:{},apartmentBlocks:[],houseLots:[]}};
 const service=createInternationalLife({world:()=>state,redistribute:false,nationalEconomy:false});service.init();
 return {state,service,submit:(req,persist=async()=>{})=>handleConflictControl(req,{requestConflict:value=>service.requestConflict(value),persist})};
}

test('shared command waits for durable confirmation; response-loss retry retains one canonical conflict',async()=>{
 const t=fixture();let release,started=false;const saved=new Promise(resolve=>{release=resolve;});
 let completed=false;const pending=t.submit(request(command('click-durable-1')),async()=>{started=true;await saved;}).then(r=>{completed=true;return r;});
 for(let i=0;i<10&&!started;i++)await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(started,true);assert.equal(completed,false);assert.equal(t.service.snapshot().conflicts.requested,1);
 release();const first=await pending;assert.equal(first.status,200);assert.equal(first.body.duplicate,false);
 const retry=await t.submit(request(command('click-durable-1')));assert.equal(retry.status,200);assert.equal(retry.body.duplicate,true);assert.equal(retry.body.id,first.body.id);assert.equal(t.service.snapshot().conflicts.requested,1);
});

test('failed or unconfirmed persistence returns retryable 503 without inventing a second command',async()=>{
 const t=fixture();
 for(const persist of [async()=>{throw Error('SQLite unavailable');},async()=>false]){
  const result=await t.submit(request(command('click-persist-1')),persist);assert.equal(result.status,503);assert.equal(result.body.accepted,false);assert.match(result.body.reason,/same request ID/);
 }
 const result=await t.submit(request(command('click-persist-1')));assert.equal(result.status,200);assert.equal(result.body.duplicate,true);assert.equal(t.service.snapshot().conflicts.requested,1);
});

test('invalid origins, IDs, malformed JSON, empty bodies and oversized streamed payloads never mutate the world',async()=>{
 const t=fixture();
 for(const id of ['', 'short','__proto__','constructor','prototype','toString','hasOwnProperty','a'.repeat(97),'contains space'])assert.equal((await t.submit(request(command(id)))).status,400,id);
 for(const value of ['{','null','[]',JSON.stringify({requestId:'click-missing-quick'})])assert.equal((await t.submit(request(value))).status,400);
 assert.equal((await t.submit(new Request('https://city/api/civilization/conflict',{method:'POST'}))).status,400);
 assert.equal((await t.submit(request(command('click-origin-1'),{origin:'https://unrelated.example'}))).status,403);
 assert.equal((await t.submit(request('x'.repeat(2049)))).status,413);
 assert.equal((await t.submit(request(command('click-size-1'),{'content-length':'2049'}))).status,413);
 const broken={headers:new Headers(),body:{async *[Symbol.asyncIterator](){throw Error('socket closed');}}};assert.equal((await t.submit(broken)).status,503);
 assert.equal(t.service.snapshot().conflicts.requested,0);
});

test('API fixes the mainland conflict pair and bounded queue retains duplicate receipts when full',async()=>{
 const t=fixture();
 for(let i=0;i<32;i++)assert.equal((await t.submit(request({...command(`click-queue-${i}`),fromCountryId:'hawaii',toCountryId:'hawaii'}))).status,200);
 assert.equal(t.state.internationalLife.conflictQueue.length,32);assert.ok(Object.values(t.state.internationalLife.conflictRequests).every(r=>r.fromCountryId==='hansdrex'&&r.toCountryId==='north-city'));
 const full=await t.submit(request(command('click-queue-full')));assert.equal(full.status,429);assert.equal(full.body.reason,'conflict queue is full');
 const retry=await t.submit(request(command('click-queue-0')));assert.equal(retry.status,200);assert.equal(retry.body.duplicate,true);assert.equal(t.service.snapshot().conflicts.requested,32);
 assert.equal(t.service.requestConflict({...command('direct-hawaii'),toCountryId:'hawaii'}).accepted,false);
});

// Load the real legacy Node adapter with engine/database boundaries injected.
// No PostgreSQL dependency, listening process or production world is required.
function nodeAdapter(){
 let source=fs.readFileSync(new URL('../worker/civilization-server.mjs',import.meta.url),'utf8');source=source.slice(0,source.indexOf('\nconst server ='));
 source=source.replace(/^import[\s\S]*?;\n/gm,'').replace(/^export \*[^\n]*\n/gm,'').replace(/^export function /gm,'function ').replace(/^const IS_MAIN =[^\n]*$/m,'const IS_MAIN = false;');
 const state={simulationAgeSeconds:10,timeScale:120,flies:[{id:'A',alive:true}],generation:1,births:0,deaths:0,foodReserve:5};
 const deps={process:{env:{DATABASE_URL:'local-test'},argv:[]},pg:{Pool:class{}},handleConflictControl,countries:{requestConflict:()=>{throw Error('No production mutation');}},getRawState:()=>state,snapshotLooksUsable:s=>!!s?.flies,getState:()=>({moneySupply:100}),getSimulationConfig:()=>({}),pathToFileURL:()=>({href:''})};
 const adapter=new Function(...Object.keys(deps),source+'\nreturn {createCivilizationRequestHandler,checkpoint,persistConflict,setPersistence:(db,ready=true)=>{pool=db;persistenceReady=ready;}};')(...Object.values(deps));return adapter;
}

test('real Node route supports streamed POST, CORS and method checks with the same canonical retry contract',async()=>{
 const t=fixture(),adapter=nodeAdapter();let saves=0;
 const server=http.createServer(adapter.createCivilizationRequestHandler({requestConflict:c=>t.service.requestConflict(c),persist:async()=>{saves++;}}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/api/civilization/conflict`;
 try{
  const options=await fetch(base,{method:'OPTIONS'});assert.equal(options.status,204);assert.match(options.headers.get('access-control-allow-methods'),/POST/);
  const get=await fetch(base);assert.equal(get.status,405);assert.match(get.headers.get('allow'),/POST/);
  for(let i=0;i<2;i++){const result=await fetch(base,{method:'POST',headers:{origin:'http://localhost:8766','content-type':'application/json'},body:JSON.stringify(command('click-node-1'))});assert.equal(result.status,200);assert.equal((await result.json()).duplicate,i===1);}
  assert.equal(saves,2);assert.equal(t.service.snapshot().conflicts.requested,1);
  const invalid=await fetch(base,{method:'POST',body:'{'});assert.equal(invalid.status,400);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('Node durability cannot confirm a queued forced save after an earlier checkpoint disconnects the database',async()=>{
 const adapter=nodeAdapter();let release,queries=0;const pending=new Promise(resolve=>{release=resolve;});
 adapter.setPersistence({query:async()=>{queries++;await pending;throw Error('database disconnected');}});
 const first=adapter.checkpoint(true);const firstFailure=assert.rejects(first,/database disconnected/);
 const commandPersistence=adapter.persistConflict();const secondFailure=assert.rejects(commandPersistence,/became unavailable/);
 release();await Promise.all([firstFailure,secondFailure]);assert.equal(queries,1);
});
