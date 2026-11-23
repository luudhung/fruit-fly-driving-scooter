import test from 'node:test';import assert from 'node:assert/strict';import{parseJsonFields}from'../worker/json-fields.mjs';
test('selects exact root fields around deeply nested discarded data and escaped strings',()=>{
 const value={observer:{state:{nested:true},text:'\"state\": { pretend }, [ x ] \\ end',rows:Array.from({length:10000},(_,i)=>({i}))},state:{worldId:'W',mapVersion:36,simulationAgeSeconds:0,timeScale:120},tail:null};
 assert.deepEqual(parseJsonFields(JSON.stringify(value),['state']),{state:value.state});
 assert.deepEqual(parseJsonFields(JSON.stringify(value.state),['worldId','timeScale']),{worldId:'W',timeScale:120});
 assert.deepEqual(parseJsonFields(' { "text": "a\\\"b", "age": -12.5e2, "ok":false } ',['age','ok']),{age:-1250,ok:false});
});
test('rejects truncated selected values and trailing envelope data',()=>{for(const text of ['{"state":{"a":1}','{"state":','{}garbage'])assert.throws(()=>parseJsonFields(text,['state']));});
