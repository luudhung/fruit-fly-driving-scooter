import test from 'node:test';import assert from 'node:assert/strict';import {CityClock,CITY_VIEW_PREDICTION_SECONDS}from'../src/city-clock.ts';
test('repeated and out-of-order snapshots never restart the train animation',()=>{const c=new CityClock();c.accept(1000,0,120);assert.equal(c.read(2500),1300);c.accept(1000,2500,120);assert.equal(c.read(3000),1360);assert.equal(c.accept(900,3000,120),false);assert.equal(c.read(3500),1420);c.accept(1400,3500,120);assert.equal(c.read(3500),1420);assert.equal(c.read(4000),1480);});
test('a tab returning from a long absence accepts fresh server time; prediction is bounded',()=>{const c=new CityClock();c.accept(100,0,120);assert.equal(c.read(3600000),3700);c.accept(10000,3600000,120);assert.equal(c.read(3601000),10120);});

test('the city viewer can cover normal slow alarm intervals without growing an unlimited lead',()=>{
 const clock=new CityClock(CITY_VIEW_PREDICTION_SECONDS);clock.accept(100,0,120);
 assert.ok(clock.read(60_000)>clock.read(50_000));
 assert.equal(clock.read(90_000),clock.read(180_000));
 for(let i=1;i<8;i++){
  const now=i*60_000,source=100+i*1_200;clock.accept(source,now,120);
  assert.ok(clock.read(now+60_000)<=source+120*CITY_VIEW_PREDICTION_SECONDS);
 }
});
