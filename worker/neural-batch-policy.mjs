import {COMBINED_CAP} from './population-limits.mjs';
/** Input size follows the living-city bound; CPU work remains four checkpoints per alarm. */
export function validateNeuralBatch(batch){
 if(!Array.isArray(batch?.agents)||batch.agents.length>COMBINED_CAP||typeof batch.cycleId!=='string'||batch.cycleId.length>100)throw Error('Invalid neural batch');
 if(batch.agents.some(a=>!/^BRAIN-\d{6,}$/.test(a.brain_id)))throw Error('Invalid brain identifier');
 return batch.agents;
}
