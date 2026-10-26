import test from 'node:test';
import assert from 'node:assert/strict';
import {CameraSprint} from '../src/camera-sprint.ts';
test('double forward press gives exactly 2x while held; release, blur, and slow taps stop it',()=>{
 const c=new CameraSprint();c.down('KeyW',0);assert.equal(c.multiplier,1);c.down('KeyW',100,true);assert.equal(c.multiplier,1);
 c.up('KeyW');c.down('KeyW',180);assert.equal(c.multiplier,2);c.up('KeyW');assert.equal(c.multiplier,1);
 c.down('ArrowUp',1000);assert.equal(c.multiplier,1);c.up('ArrowUp');c.down('ArrowUp',1150);assert.equal(c.multiplier,2);
 c.reset();assert.equal(c.pressed.size,0);assert.equal(c.multiplier,1);c.down('KeyW',1200);assert.equal(c.multiplier,1);
 c.up('KeyW');c.down('KeyW',1700);assert.equal(c.multiplier,1);
});
test('simultaneous forward bindings and control never stack speed beyond 2x',()=>{
 const c=new CameraSprint();c.down('KeyW',0);c.down('ArrowUp',50);assert.equal(c.multiplier,1);c.down('ControlLeft',60);assert.equal(c.multiplier,2);
 c.down('ControlRight',65);assert.equal(c.multiplier,2);c.up('ControlLeft');assert.equal(c.multiplier,2);c.up('ControlRight');assert.equal(c.multiplier,1);
});
