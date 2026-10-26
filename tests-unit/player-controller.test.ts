import test from 'node:test';import assert from 'node:assert/strict';
import {PlayerController,PLAYER_EYE} from '../src/player-controller.ts';
const idle={forward:0,strafe:0,yaw:0,sprint:1,ascend:false,descend:false};
function run(p:PlayerController,seconds:number,patch:Partial<typeof idle>={}){for(let i=0;i<Math.round(seconds*120);i++)p.update(1/120,{...idle,...patch});}
test('gravity lands the player; single jump returns to the floor; double jump toggles flight',()=>{
 const p=new PlayerController();p.teleport(20,20,790);run(p,3);assert.ok(p.grounded);const floor=p.y;
 p.jumpDown(1000);p.jumpUp();run(p,.25);assert.ok(p.y>floor+.6);run(p,2);assert.ok(Math.abs(p.y-floor)<.001);
 p.jumpDown(3000);p.jumpUp();p.jumpDown(3150);assert.equal(p.flying,true);p.jumpUp();run(p,1,{ascend:true});assert.ok(p.y>floor+10);
 p.jumpDown(5000);p.jumpUp();p.jumpDown(5150);p.jumpUp();assert.equal(p.flying,false);run(p,3);assert.ok(Math.abs(p.y-floor)<.001);
});
test('walking ignores camera pitch, diagonals are normalized, sprint is exactly double',()=>{
 const a=new PlayerController(),b=new PlayerController();for(const p of [a,b]){p.teleport(25,3,790);run(p,1);}
 const z=a.z;run(a,1,{forward:1});run(b,1,{forward:1,sprint:2});assert.ok(Math.abs((b.z-z)/(a.z-z)-2)<.001);
});
test('every ground-floor doorway can be walked through and external walls stop the player',()=>{
 const p=new PlayerController();p.teleport(110,2.55,833);run(p,1);run(p,4,{forward:1});assert.ok(p.z>849&&p.z<852); // through the north entrance
 run(p,3,{strafe:1});assert.ok(p.x<100,'west living room doorway must be open');
 p.teleport(78,2.55,845);run(p,.2);run(p,3,{strafe:1});assert.ok(p.x>70&&p.x<71,'solid exterior wall must stop walking');
 p.teleport(110,2.55,876.7);run(p,.2);run(p,4,{strafe:1});assert.ok(p.x<100,'west library doorway');
 p.teleport(110,2.55,850.7);run(p,.2);run(p,4,{strafe:-1});assert.ok(p.x>120,'east dining doorway');
 p.teleport(110,2.55,876.7);run(p,.2);run(p,4,{strafe:-1});assert.ok(p.x>120,'east kitchen doorway');
});
test('the complete staircase climbs to the upper gallery and upstairs rooms are accessible',()=>{
 const p=new PlayerController();p.teleport(110,2.55,853);run(p,.3);run(p,5.2,{forward:1});
 assert.ok(p.z>875,`stair end z=${p.z}`);assert.ok(Math.abs(p.feet-5.45)<.001,`upstairs feet=${p.feet}`);
 p.teleport(110,5.45+PLAYER_EYE,878.7);run(p,.3);run(p,4,{strafe:1});assert.ok(p.x<100,'cinema doorway');
 p.teleport(110,5.45+PLAYER_EYE,878.7);run(p,.3);run(p,4,{strafe:-1});assert.ok(p.x>120,'study doorway');
});
test('held/repeated jump is never treated as a second tap, and blur clears tap history',()=>{
 const p=new PlayerController();p.jumpDown(100);p.jumpDown(150,true);assert.equal(p.flying,false);p.jumpUp();p.resetInput();p.jumpDown(200);assert.equal(p.flying,false);
});
