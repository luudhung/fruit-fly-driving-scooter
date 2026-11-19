import test from 'node:test';
import assert from 'node:assert/strict';
import {accidentalFireCandidates} from '../worker/fire-risk.mjs';
import {BUILDINGS} from '../worker/city-map.mjs';
import {countryAt,COUNTRY_IDS} from '../worker/country-map.mjs';

test('accidental fires include North apartments and services as well as Hansdrex and Hawaii housing',()=>{
 const pool=accidentalFireCandidates(BUILDINGS);
 for(const country of Object.values(COUNTRY_IDS))assert.ok(pool.some(b=>countryAt(b)===country),country);
 assert.ok(pool.some(b=>countryAt(b)===COUNTRY_IDS.north&&b.kind==='apartment'));
 assert.ok(pool.some(b=>countryAt(b)===COUNTRY_IDS.north&&b.kind==='country-service'));
 assert.ok(pool.some(b=>countryAt(b)===COUNTRY_IDS.hansdrex&&b.x>=900),'no arbitrary east-side immunity');
 assert.ok(!pool.some(b=>b.kind==='landmark'||b.kind==='airport'));
});
test('ruins, burning buildings and pending construction cannot ignite again and cancelled work does not protect restored homes',()=>{
 const buildings=['ready','ruin','unsafe','works','cancelled','fire'].map(id=>({id,kind:'apartment'}));
 const pool=accidentalFireCandidates(buildings,{buildings:{ruin:{stage:'collapsed'},unsafe:{stage:'unsafe'},cancelled:{stage:'operational'}},projects:[{buildingId:'works',stage:'delivery'},{buildingId:'cancelled',stage:'cancelled'}],fires:[{buildingId:'fire'}]});
 assert.deepEqual(pool.map(b=>b.id),['ready','cancelled']);
});
