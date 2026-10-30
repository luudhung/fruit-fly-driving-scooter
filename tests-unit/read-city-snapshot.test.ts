import test from 'node:test';
import assert from 'node:assert/strict';
import {readCitySnapshot} from '../src/read-city-snapshot.ts';

test('city transport reads normal JSON and legacy extra-gzip responses identically',async()=>{
 const state={simulationAgeSeconds:12345,flies:[{id:'FLY-001',alive:true}]},json=JSON.stringify(state);
 assert.deepEqual(await readCitySnapshot(new Response(json)),state);
 const compressed=new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
 assert.deepEqual(await readCitySnapshot(new Response(compressed)),state);
});
test('city transport rejects broken data so polling can retry',async()=>{
 await assert.rejects(readCitySnapshot(new Response('<html>upstream unavailable</html>')));
});
