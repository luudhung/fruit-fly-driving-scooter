import test from 'node:test';
import assert from 'node:assert/strict';
import {PlayerCar,playerCarClear,type CarWorld} from '../src/player-car.ts';
import {MOTORWAY,MOTORWAY_LANE_OFFSETS} from '../worker/motorway.mjs';
const flat:CarWorld={clear:()=>true,ground:()=>.2};
test('the player car accelerates to each motorway lane limit and eases back to city speed',()=>{
 for(const [lane,limit]of [[0,45],[3,30]]){
  const car=new PlayerCar(flat);car.enter();Object.assign(car,{x:-900,z:MOTORWAY.north+MOTORWAY_LANE_OFFSETS[lane],heading:Math.PI/2});
  for(let i=0;i<12*120;i++)car.update(1/120,{throttle:1,steer:0});
  assert.ok(Math.abs(car.speed-limit)<.01,`${car.speed} vs ${limit}`);
  car.x=0;car.z=0;const previous=car.speed;car.update(1/60,{throttle:1,steer:0});
  assert.ok(car.speed<previous&&car.speed>15,'exiting slows smoothly instead of snapping the camera speed');
 }
});
test('a player cannot drive through the median between the two carriageways',()=>{
 assert.equal(playerCarClear(-600,MOTORWAY.north,Math.PI/2),false);
 for(const side of [-1,1])assert.equal(playerCarClear(-600,MOTORWAY.north+side*12.2,Math.PI/2),true);
});
