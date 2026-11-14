import test from 'node:test';import assert from 'node:assert/strict';
import {cityFogRange,citySkyPalette,skyLight} from '../src/city-sky.ts';
const fogAmount=(distance:number,range:{near:number;far:number})=>{const t=Math.max(0,Math.min(1,(distance-range.near)/(range.far-range.near)));return t*t*(3-2*t);};

test('clear mornings and sunny city views retain distant atmosphere without covering nearby streets or landmarks',()=>{
 const clear=cityFogRange();assert.equal(fogAmount(1000,clear),0);assert.ok(fogAmount(2000,clear)<.025);assert.ok(fogAmount(5000,clear)>.5);
 const sunny=cityFogRange(0,.04);assert.ok(fogAmount(2000,sunny)<.025);
 for(const hour of [6,8,12,16,18,20,23]){const palette=citySkyPalette(hour,0,3);assert.ok(Number.isFinite(palette.fog.r));assert.ok(palette.daylight>0);}
 assert.ok(skyLight(18).dusk>.9,'the long colorful sunset remains active');
});

test('rain gently shortens distant visibility and clearing the weather immediately restores the clear range',()=>{
 const clear=cityFogRange(),rain=cityFogRange(.6,.78),storm=cityFogRange(1,1);
 assert.ok(rain.near<clear.near&&rain.far<clear.far);assert.equal(fogAmount(900,storm),0);assert.ok(fogAmount(2000,storm)<.25);
 assert.deepEqual(cityFogRange(0,0),clear);assert.deepEqual(cityFogRange(-1,-1),clear);assert.deepEqual(cityFogRange(NaN,NaN),clear);assert.deepEqual(cityFogRange(9,9),storm);
});
