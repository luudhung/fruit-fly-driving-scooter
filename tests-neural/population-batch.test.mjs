import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNeuralBatch} from '../worker/neural-batch-policy.mjs';
import {COMBINED_CAP} from '../worker/population-limits.mjs';
test('a thousand living resident brains plus visitors can retain complete uneven shard memberships',()=>{
 const groups=Array.from({length:16},()=>[]);
 for(let i=0;i<1040;i++){const id=i<900?i:i+16;groups[id%16].push({brain_id:`BRAIN-${String(id+100000).padStart(6,'0')}`});}
 assert.ok(groups.some(g=>g.length>64));
 for(const agents of groups)assert.equal(validateNeuralBatch({agents,cycleId:'same-checkpoint-cycle'}),agents);
 assert.equal(groups.flat().length,1040);
});
test('neural batch guard still rejects unbounded sensor input and malformed identities',()=>{
 assert.throws(()=>validateNeuralBatch({agents:Array(COMBINED_CAP+1).fill({brain_id:'BRAIN-000001'}),cycleId:'x'}),/Invalid neural batch/);
 assert.throws(()=>validateNeuralBatch({agents:[{brain_id:'wrong'}],cycleId:'x'}),/Invalid brain identifier/);
 assert.throws(()=>validateNeuralBatch({agents:[],cycleId:'x'.repeat(101)}),/Invalid neural batch/);
});
