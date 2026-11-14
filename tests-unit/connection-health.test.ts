import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {ConnectionHealth,requestCitySnapshot,SNAPSHOT_TIMEOUT_MS} from '../src/connection-health.ts';
import {CityClock} from '../src/city-clock.ts';

test('a fresh delayed response is retrying; repeated failures, stale data and browser offline are distinct',()=>{
 const health=new ConnectionHealth();health.accepted(100,0);health.failed();
 assert.equal(health.view(25_000).reason,'delayed');assert.equal(health.view(25_000).state,'connecting');
 assert.equal(health.view(25_000,false).reason,'offline');
 assert.equal(health.view(45_000).reason,'stale');
 health.failed();health.failed();assert.equal(health.view(30_000).reason,'offline');
 health.accepted(200,31_000);assert.equal(health.view(31_000).reason,'live');assert.equal(health.view(31_000).failures,0);
});

test('successful responses cannot conceal a clock that has stopped advancing',()=>{
 const health=new ConnectionHealth();health.accepted(100,0);health.accepted(100,44_000);
 const view=health.view(45_000);assert.equal(view.reason,'stale');assert.equal(view.responseAgeMs,1000);assert.equal(view.advanceAgeMs,45_000);
 assert.match(view.detail,/Last observed simulation advance 45s ago/);assert.match(view.detail,/100\.00s/);
 health.accepted(90,46_000);assert.equal(health.view(46_000).simulationTime,100);
 health.accepted(101,47_000);assert.equal(health.view(47_000).reason,'live');
});

test('cold cached scenes never count as a live response and expose their original age',()=>{
 const health=new ConnectionHealth();health.cached(1000);health.failed();
 assert.equal(health.view(61_000).reason,'connecting');assert.equal(health.view(61_000).simulationTime,null);
 assert.match(health.view(61_000).detail,/Cached snapshot: 60s ago/);
 health.cached(NaN);assert.match(health.view(61_000).detail,/age unknown/);
});

test('the 25 second deadline remains active while the response body is pending',async()=>{
 let expire!:()=>void,started!:()=>void,canceled=false;
 const reading=new Promise<void>(resolve=>{started=resolve;});
 const request=requestCitySnapshot('https://city.test/state',{
  fetcher:async(_url,init)=>new Response(new ReadableStream({start(controller){
   init!.signal!.addEventListener('abort',()=>controller.error(new DOMException('deadline','AbortError')));
  }})),
  read:async response=>{started();return response.json();},usable:()=>true,
  schedule:(callback,delay)=>{assert.equal(delay,25_000);assert.equal(delay,SNAPSHOT_TIMEOUT_MS);expire=callback;return 0 as unknown as ReturnType<typeof setTimeout>;},
  cancel:()=>{canceled=true;},
 });
 const rejection=assert.rejects(request,{name:'AbortError'});await reading;assert.equal(canceled,false);expire();await rejection;assert.equal(canceled,true);
});

test('a complete slow body is accepted and cancels its deadline; invalid HTTP/data still reject',async()=>{
 let finish!:(value:unknown)=>void,canceled=false;
 const request=requestCitySnapshot('https://city.test/state',{
  fetcher:async()=>new Response('{}'),read:()=>new Promise(resolve=>{finish=resolve;}),usable:()=>true,
  schedule:()=>0 as unknown as ReturnType<typeof setTimeout>,cancel:()=>{canceled=true;},
 });
 await Promise.resolve();assert.equal(canceled,false);finish({simulationAgeSeconds:100});
 assert.deepEqual(await request,{simulationAgeSeconds:100});assert.equal(canceled,true);
 await assert.rejects(requestCitySnapshot('https://city.test/state',{fetcher:async()=>new Response('',{status:503}),read:async()=>({}),usable:()=>true}),/HTTP 503/);
 await assert.rejects(requestCitySnapshot('https://city.test/state',{fetcher:async()=>new Response('{}'),read:async()=>({}),usable:()=>false}),/invalid or empty/);
});

// Execute the real polling functions with controlled browser/render boundaries.
// This catches status regressions in the caller, beyond the health model alone.
function viewer(options:Record<string,any>={}){
 const source=fs.readFileSync(new URL('../src/fulllife.ts',import.meta.url),'utf8');
 const refresh=source.slice(source.indexOf('function refreshConnectionHealth()'),source.indexOf('window.setInterval(refreshConnectionHealth'));
 const once=source.slice(source.indexOf('async function fetchSnapshotOnce()'),source.indexOf('// ---------- Three.js city ----------'));
 const poll=source.slice(source.indexOf('let snapshotFetchPending=false;'),source.indexOf('addEventListener("visibilitychange"'));
 const setup=`
 const {ConnectionHealth,CityClock,options}=deps;
 let now=1000,snapshot=options.initial||null,selectedFlyId='FLY /A',calls=0,offlineCalls=0,renderCalls=0;
 const connectionHealth=new ConnectionHealth(),presentationClock=new CityClock();
 if(snapshot){connectionHealth.accepted(snapshot.simulationAgeSeconds,now);presentationClock.accept(snapshot.simulationAgeSeconds,now,120);}
 let lastLiveConnection=snapshot?{state:'authoritative',label:'1 ALIVE · CITY LIVE',title:'City status'}:null;
 const connection={dataset:{state:snapshot?'authoritative':'connecting'},title:'City status'},connectionLabel={textContent:''};
 const apiBase='https://city.test',document={hidden:false},navigator={onLine:true},events={textContent:''};
 const Date={now:()=>now,parse:deps.parseDate};const console={error:()=>{}};
 const residentDirectory={count:1,offline:()=>{offlineCalls++;}};
 const setConnection=(state,label)=>{connection.dataset.state=state;connectionLabel.textContent=label;};
 const usableSnapshot=value=>Boolean(value?.flies?.some(f=>f.alive)&&Number.isFinite(value.simulationAgeSeconds));
 const loadCachedSnapshot=()=>options.cache||null;
 const saveCachedSnapshot=()=>{if(options.cacheError)throw Error('local storage unavailable');};
 const readCitySnapshot=async response=>response.json();
 const requestCitySnapshot=async(url,request)=>{calls++;options.urls?.push(url);if(options.request)return options.request();if(options.error)throw Error('network timeout');return options.payload;};
 const renderSnapshot=value=>{renderCalls++;if(options.renderError)throw Error('WebGL error');snapshot=value;presentationClock.accept(value.simulationAgeSeconds,now,120);setConnection(value.authoritative?'authoritative':'offline','1 ALIVE · CITY LIVE');};
 `;
 const result=`return {fetchSnapshot,refreshConnectionHealth,connection,connectionLabel,connectionHealth,presentationClock,navigator,setNow:value=>{now=value;},get snapshot(){return snapshot;},get selected(){return selectedFlyId;},get calls(){return calls;},get offlineCalls(){return offlineCalls;},get renderCalls(){return renderCalls;}};`;
 const compiled=ts.transpileModule(setup+refresh+once+poll+result,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return new Function('deps',compiled)({ConnectionHealth,CityClock,options,parseDate:Date.parse});
}
const snapshot={authoritative:true,simulationAgeSeconds:100,serverTime:'2026-11-14T00:00:00Z',flies:[{id:'FLY /A',alive:true}]};

test('first timeout retains the scene, selected resident and bounded presentation clock without marking the directory offline',async()=>{
 const v=viewer({initial:snapshot,error:true});v.setNow(20_000);await v.fetchSnapshot();
 assert.equal(v.snapshot,snapshot);assert.equal(v.selected,'FLY /A');assert.equal(v.renderCalls,0);assert.equal(v.offlineCalls,0);
 assert.match(v.connectionLabel.textContent,/SYNC DELAY · RETRYING/);assert.equal(v.connection.dataset.state,'connecting');
 assert.ok(v.presentationClock.read(20_000)>100);
 v.setNow(51_000);v.refreshConnectionHealth();assert.match(v.connectionLabel.textContent,/STALE SNAPSHOT/);
 assert.equal(v.connection.dataset.snapshotAgeSeconds,'50');assert.match(v.connection.title,/advance 50s ago/);
 assert.equal(v.presentationClock.read(51_000),v.presentationClock.read(61_000),'presentation prediction must remain bounded');
});

test('cold cache is rendered once during retry and remains explicitly unconfirmed',async()=>{
 const v=viewer({cache:snapshot,error:true});await v.fetchSnapshot();await v.fetchSnapshot();
 assert.equal(v.renderCalls,1);assert.equal(v.snapshot.authoritative,false);assert.equal(v.connection.dataset.state,'connecting');
 assert.match(v.connection.title,/No live response yet/);assert.equal(v.connection.dataset.authoritativeSimulationSeconds,'unknown');
});

test('single-flight polling preserves selection and successful reconnection clears failure counters',async()=>{
 let release!:(payload:unknown)=>void;const urls:string[]=[];
 const options:Record<string,any>={initial:snapshot,error:true,urls};const v=viewer(options);await v.fetchSnapshot();
 options.error=false;options.request=()=>new Promise(resolve=>{release=resolve;});
 const first=v.fetchSnapshot();await v.fetchSnapshot();assert.equal(v.calls,2);assert.match(urls[1],/selected=FLY%20%2FA/);
 release({...snapshot,simulationAgeSeconds:200});await first;
 assert.equal(v.selected,'FLY /A');assert.equal(v.connectionHealth.view(1000).failures,0);assert.equal(v.connection.dataset.state,'authoritative');
});

test('render and local cache failures do not become civilization network failures',async()=>{
 const v=viewer({payload:snapshot,renderError:true,cacheError:true});await v.fetchSnapshot();
 assert.equal(v.connectionHealth.view(1000).failures,0);assert.equal(v.connection.dataset.state,'authoritative');
 assert.match(v.connectionLabel.textContent,/VISUAL DEGRADED/);assert.match(v.connection.title,/Last live response 0s ago/);
});
