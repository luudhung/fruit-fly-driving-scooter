import test from 'node:test';
import assert from 'node:assert/strict';
import {FlightDoubleTap,FLIGHT_DOUBLE_TAP_MS} from '../src/flight-double-tap.ts';

test('double tap tolerates real key duration and a natural pause after key release',()=>{
 const tap=new FlightDoubleTap();assert.equal(tap.down(1000),'first');tap.up(1120);
 assert.equal(tap.down(1450),'double','450 ms between key downs is a valid 330 ms pause after release');tap.up(1530);
 assert.equal(tap.down(1640),'first','the second tap must not arm a third tap');tap.up(1710);
 assert.equal(tap.down(1710+FLIGHT_DOUBLE_TAP_MS),'double');
});
test('holding, key repeat and duplicate keydown never toggle or arm a false double tap',()=>{
 const tap=new FlightDoubleTap();assert.equal(tap.down(0),'first');assert.equal(tap.down(20),'ignored');assert.equal(tap.down(220,true),'ignored');tap.up(250);
 assert.equal(tap.down(300),'first','repeated held key is not a short tap');tap.up(700);
 assert.equal(tap.down(710),'first','long press without repeats is not a short tap');
 tap.reset();assert.equal(tap.down(1000,true),'ignored');tap.up(1010);assert.equal(tap.down(1100),'first');
});
test('slow taps, blur/reset and backwards event clocks start a fresh pair',()=>{
 const tap=new FlightDoubleTap();tap.down(0);tap.up(70);assert.equal(tap.down(471),'first');tap.up(500);
 tap.reset();assert.equal(tap.down(550),'first');tap.up(600);assert.equal(tap.down(590),'first');tap.up(580);
 assert.equal(tap.down(620),'first');
});
