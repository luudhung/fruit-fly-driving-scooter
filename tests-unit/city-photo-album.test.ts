import test from 'node:test';
import assert from 'node:assert/strict';
import {ResidentPhotoAlbum,type ResidentPhotoRecord} from '../src/city-photo-album.ts';

class Element {
 style={cssText:''};textContent='';children:Element[]=[];open=false;tag:string;listeners=new Map<string,()=>void>();
 constructor(tag:string){this.tag=tag;}
 append(...items:Element[]){this.children.push(...items);}
 replaceChildren(){this.children=[];}
 addEventListener(name:string,fn:()=>void){this.listeners.set(name,fn);}
 showModal(){this.open=true;}
 close(){this.open=false;this.listeners.get('close')?.();}
}
function environment(t:any){
 const originals=new Map(['document','window','indexedDB'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const body=new Element('body'),jobs=new Map<number,()=>void>();let id=0;
 Object.defineProperties(globalThis,{
  document:{configurable:true,value:{body,createElement:(tag:string)=>new Element(tag),getElementById:()=>null}},
  window:{configurable:true,value:{requestIdleCallback:(fn:()=>void)=>{jobs.set(++id,fn);return id;},cancelIdleCallback:(handle:number)=>jobs.delete(handle)}},
  indexedDB:{configurable:true,value:{open:()=>{throw Error('storage blocked');}}},
 });
 t.after(()=>{for(const [key,original] of originals)if(original)Object.defineProperty(globalThis,key,original);else Reflect.deleteProperty(globalThis,key);});
 return {body,jobs,run:async()=>{const first=jobs.entries().next().value;if(first){jobs.delete(first[0]);first[1]();}await flush();},dialog:()=>body.children[0],gallery:()=>body.children[0].children[3]};
}
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const photo=(id:string,x=1):ResidentPhotoRecord=>({id,at:Number(id)||1,photographerId:'resident',subjectId:'rooftop',camera:{x,y:5,z:2}});
const blob=()=>new Blob(['photo'],{type:'image/jpeg'});

test('driving defers captures and later sync captures queued poses, coalescing their latest metadata',async t=>{
 const env=environment(t),captured:ResidentPhotoRecord[]=[];let allowed=false;
 const album=new ResidentPhotoAlbum(async p=>{captured.push(p);return blob();},()=>allowed);
 album.sync();album.sync([photo('1'),photo('2'),photo('3')]);
 assert.equal(env.jobs.size,0);assert.equal(captured.length,0);
 album.sync([photo('1',9),photo('2'),photo('3')]);allowed=true;album.sync([photo('1',9),photo('2'),photo('3')]);
 assert.equal(captured.length,0,'sync must not capture synchronously or in a microtask');
 await env.run();assert.equal(captured.length,1);assert.equal(captured[0].camera.x,9);
 await env.run();assert.equal(captured.length,2);assert.equal(env.jobs.size,0,'only two auto photos per sync');
 album.sync([photo('1',9),photo('2'),photo('3')]);await env.run();assert.equal(captured[2].id,'3');
});

test('eligibility is checked again at idle time and stops the rest of an in-flight batch',async t=>{
 const env=environment(t);let allowed=true,captures=0,finish:((value:Blob)=>void)|undefined;
 const album=new ResidentPhotoAlbum(()=>{captures++;return new Promise(resolve=>finish=resolve);},()=>allowed);
 album.sync();album.sync([photo('1'),photo('2')]);allowed=false;await env.run();assert.equal(captures,0);
 allowed=true;album.sync([photo('1'),photo('2')]);await env.run();assert.equal(captures,1);
 allowed=false;album.sync([photo('1'),photo('2')]);finish!(blob());await flush();assert.equal(env.jobs.size,0);assert.equal(captures,1);
});

test('opening while blocked shows stored images and truthful metadata without rendering missing images',async t=>{
 const env=environment(t);let allowed=true,captures=0;
 const album=new ResidentPhotoAlbum(async()=>{captures++;return blob();},()=>allowed);
 album.sync();album.sync([photo('1')]);await env.run();allowed=false;album.sync([photo('1'),photo('2')]);
 album.open();await flush();
 assert.equal(env.gallery().children.length,2);assert.equal(env.jobs.size,0);assert.equal(captures,1);
 const [missing,stored]=env.gallery().children;
 assert.ok(missing.children[0].textContent.includes('Chỉ có dữ liệu góc máy'));
 assert.equal(stored.children[0].tag,'img');
 env.dialog().close();
});

test('closing cancels an idle reconstruction and an in-flight photo cannot restart the batch',async t=>{
 const env=environment(t);let captures=0,finish:((value:Blob)=>void)|undefined;
 const album=new ResidentPhotoAlbum(()=>{captures++;return new Promise(resolve=>finish=resolve);});
 album.sync([photo('1'),photo('2')]);album.open();await flush();assert.equal(env.jobs.size,1);
 env.dialog().close();assert.equal(env.jobs.size,0);
 album.open();await flush();await env.run();assert.equal(captures,1);
 env.dialog().close();finish!(blob());await flush();assert.equal(env.jobs.size,0);assert.equal(captures,1);
});

test('pending poses are bounded while driving and a later image is labelled as reconstructed',async t=>{
 const env=environment(t),captured:string[]=[];let allowed=false;
 const album=new ResidentPhotoAlbum(async p=>{captured.push(p.id);return blob();},()=>allowed);
 album.sync();for(let i=1;i<=100;i++)album.sync([photo(String(i))]);
 allowed=true;album.sync([photo('100')]);await env.run();await env.run();
 assert.deepEqual(captured,['37','38']);
 allowed=false;album.open();await flush();
 const rendered=env.gallery().children.filter(figure=>figure.children[0]?.tag==='img');
 assert.equal(rendered.length,2);assert.ok(rendered.every(figure=>figure.children.at(-1)!.textContent.includes('Dựng lại')));
 env.dialog().close();
});

test('reconstructing a pending pose consumes it so later observer updates do not capture it again',async t=>{
 const env=environment(t);let allowed=false,captures=0;
 const album=new ResidentPhotoAlbum(async()=>{captures++;return blob();},()=>allowed);
 album.sync();album.sync([photo('1'),photo('2'),photo('3')]);album.open();await flush();
 allowed=true;album.open();await flush();
 await env.run();await env.run();await env.run();assert.equal(captures,3);
 env.dialog().close();album.sync([photo('1'),photo('2'),photo('3')]);await flush();assert.equal(env.jobs.size,0);
});
