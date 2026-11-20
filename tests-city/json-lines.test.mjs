import test from'node:test';import assert from'node:assert/strict';import{readJsonLines}from'../worker/json-lines.mjs';import{readLocalHostCheckpoint}from'../worker/local-host-state.mjs';
const fragmented=(text,size)=>{const bytes=new TextEncoder().encode(text);let at=0;return new ReadableStream({pull(c){if(at>=bytes.length)return c.close();c.enqueue(bytes.subarray(at,at+=size));}});};
test('framed JSON survives tiny chunks, split Unicode, escaped newlines and several records in one chunk',async()=>{
 const lines=[JSON.stringify({name:'Hưng 🌇',text:'a\nb'}),'',JSON.stringify({alive:true})];
 for(const size of [1,3,11,1000])assert.deepEqual(await Array.fromAsync(readJsonLines(fragmented(lines.join('\n')+'\n',size))),lines);
});
test('a multi-megabyte world header is assembled once and actor framing stays separate',async()=>{
 const world={worldId:'W',tourPaths:'a'.repeat(2*1024*1024)},actor={id:'A',alive:true,brain:{id:'B'}},head=JSON.stringify({state:world});
 const parsed=await readLocalHostCheckpoint(fragmented(head.slice(0,-2)+'\n,"flies":[\n'+JSON.stringify(actor)+'\n]}}\n',1024));
 assert.equal(parsed.state.tourPaths,world.tourPaths);assert.deepEqual(parsed.state.flies,[actor]);
});
test('an incomplete final frame is rejected instead of silently losing its tail',async()=>{
 await assert.rejects(Array.fromAsync(readJsonLines(fragmented('{"id":"A"}',2))),/incomplete/);
});
