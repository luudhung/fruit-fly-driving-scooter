import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function fixture(){
 const workers:Array<{sent:unknown[];onmessage:((event:{data:unknown})=>void)|null;onerror:((event:{message:string})=>void)|null;terminate:()=>void;postMessage:(data:unknown)=>void}>=[];
 const beacons:Array<{url:string;body:Blob}>=[],fallbacks:unknown[]=[],snapshots:unknown[]=[];
 const document={hidden:false},storage=new Map<string,string>();let now=1000,beaconAccepted=true;
 class WorkerMock{
  sent:unknown[]=[];onmessage:((event:{data:unknown})=>void)|null=null;onerror:((event:{message:string})=>void)|null=null;
  constructor(){workers.push(this);}postMessage(data:unknown){this.sent.push(data);}terminate(){}
 }
 const source=fs.readFileSync(new URL('../src/local-city-session.ts',import.meta.url),'utf8').replace('export class LocalCitySession','class LocalCitySession').replace("new URL('../worker/local-city-host.mjs',import.meta.url)","new URL('https://city.test/local-worker.js')");
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const Class=new Function('Worker','document','navigator','fetch','Date','console','sessionStorage',js+'\nreturn LocalCitySession;')(
  WorkerMock,document,{sendBeacon:(url:string,body:Blob)=>{beacons.push({url,body});return beaconAccepted;}},
  async(input:unknown,init:unknown)=>{fallbacks.push({input,init});return new Response('{}');},
  class extends Date{static now(){return now;}},{error:()=>{}},
  {getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)},
 );
 const session=new Class('https://city.test',(snapshot:unknown)=>snapshots.push(snapshot));
 return {session,workers,beacons,fallbacks,snapshots,document,storage,reload:()=>new Class('https://city.test',(snapshot:unknown)=>snapshots.push(snapshot)),setNow:(value:number)=>{now=value;},rejectBeacon:()=>{beaconAccepted=false;},
  emit:(data:unknown)=>workers.at(-1)!.onmessage!({data})};
}

test('a heartbeat contact never clears SAVE PENDING; only a durable progress receipt clears it',()=>{
 const t=fixture();t.session.start(null);t.emit({type:'started',lease:{token:'A',epoch:1}});
 t.emit({type:'sync-pending',message:'save failed'});assert.equal(t.session.syncing,true);
 t.emit({type:'contact'});assert.equal(t.session.syncing,true);assert.equal(t.session.lastSavedAt,0);
 t.setNow(6000);t.emit({type:'saved',savedAge:12000});
 assert.equal(t.session.syncing,false);assert.equal(t.session.lastSavedAt,6000);assert.equal(t.session.lastSavedGameAge,12000);
});

test('hiding during the initial world download sends only the lease in a small leave beacon',async()=>{
 const t=fixture();t.session.start('FLY-A');t.document.hidden=true;
 t.emit({type:'lease',lease:{token:'A',epoch:1}});
 assert.equal(t.beacons.length,1);assert.equal(t.beacons[0].url,'https://city.test/api/civilization/local/leave');
 assert.deepEqual(JSON.parse(await t.beacons[0].body.text()),{token:'A',epoch:1});
 assert.ok(t.beacons[0].body.size<128);assert.deepEqual(t.workers[0].sent.at(-1),{type:'release'});assert.equal(t.session.active,false);
});

test('an active owner receives snapshots while a released or fenced session ignores late frames',()=>{
 const t=fixture();t.session.start(null);t.emit({type:'started',lease:{token:'A',epoch:1}});
 const first={simulationAgeSeconds:100};t.emit({type:'snapshot',snapshot:first});assert.deepEqual(t.snapshots,[first]);
 t.emit({type:'fenced'});t.emit({type:'snapshot',snapshot:{simulationAgeSeconds:200}});assert.deepEqual(t.snapshots,[first]);
 assert.equal(t.session.active,false);t.session.start(null);assert.equal(t.workers[0].sent.length,1,'fenced owners back off before reclaiming');
 t.setNow(12000);t.session.start(null);assert.equal(t.workers[0].sent.length,2);
});

test('a rejected leave beacon falls back to a small keepalive request without blocking exit',async()=>{
 const t=fixture();t.session.start(null);t.emit({type:'started',lease:{token:'A',epoch:1}});t.rejectBeacon();
 t.session.release();assert.equal(t.session.active,false);
 assert.equal(t.fallbacks.length,1);const sent=t.fallbacks[0] as {input:string;init:{keepalive:boolean;body:Blob}};
 assert.equal(sent.init.keepalive,true);assert.deepEqual(JSON.parse(await sent.init.body.text()),{token:'A',epoch:1});
 assert.deepEqual(t.workers[0].sent.at(-1),{type:'release'});
});

test('reload retains only the same-tab resume credential and a closing worker cannot receive a second start',()=>{
 const t=fixture();t.session.start(null);t.emit({type:'started',lease:{token:'A',epoch:1}});
 t.session.release();t.session.release();t.session.start(null);
 assert.equal(t.beacons.length,1);assert.equal(t.workers[0].sent.length,2,'one start, one release; no start may be lost while the worker is closing');
 const next=t.reload();next.start(null);
 assert.deepEqual((t.workers[1].sent[0] as {resume:unknown}).resume,{token:'A',epoch:1});
 t.emit({type:'started',lease:{token:'B',epoch:2}});
 t.workers[0].onmessage!({data:{type:'released'}});
 assert.equal(JSON.parse([...t.storage.values()][0]).token,'B','a late old-tab cleanup cannot delete the new owner credential');
});

test('hiding before the initial download completes stays inactive even when started arrives after release',()=>{
 const t=fixture();t.session.start(null);t.document.hidden=true;
 t.emit({type:'lease',lease:{token:'A',epoch:1}});t.emit({type:'started',lease:{token:'A',epoch:1}});
 assert.equal(t.session.active,false);assert.equal(t.beacons.length,1);
});
