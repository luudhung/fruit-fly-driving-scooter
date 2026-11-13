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
test('a normal double Space with release timestamps enables flight, holding rises, and a new pair disables it',()=>{
 const p=new PlayerController();p.teleport(25,3,790);run(p,1);const floor=p.y;
 p.jumpDown(1000);run(p,.12);p.jumpUp(1120);p.jumpDown(1450);assert.equal(p.flying,true);
 run(p,.8,{ascend:true});assert.ok(p.y>floor+8);p.jumpDown(1650,true);assert.equal(p.flying,true);p.jumpUp(2250);
 p.jumpDown(2300);p.jumpUp(2400);assert.equal(p.flying,true,'long-held flight ascent is not the first tap of a new pair');p.jumpDown(2750);p.jumpUp(2820);assert.equal(p.flying,false);
 run(p,3);assert.ok(Math.abs(p.y-floor)<.001);
});

test('metro sidewalk stairs can actually be climbed on foot without flight',async()=>{
 const {METRO_LINES,metroStationGeometry}=await import('../worker/city-map.mjs');
 const g=metroStationGeometry(METRO_LINES[0],0),[a,b]=g.stairs,p=new PlayerController();
 p.teleport(a.x,a.y-.9+PLAYER_EYE,a.z);run(p,.2);
 const length=Math.hypot(b.x-a.x,b.z-a.z),yaw=Math.atan2(b.x-a.x,b.z-a.z);run(p,(length-.4)/4.4,{forward:1,yaw});
 assert.equal(p.flying,false);assert.ok(p.feet>b.y-.9-.6,`did not climb: ${p.feet}`);assert.ok(Math.hypot(p.x-b.x,p.z-b.z)<1);
});

test('both directional metro platforms support the player, including the opposite service',async()=>{
 const {METRO_LINES,metroStationGeometry}=await import('../worker/city-map.mjs');
 for(const direction of [1,-1]){const geo=metroStationGeometry(METRO_LINES[0],0,direction),p=new PlayerController();p.teleport(geo.platform.x,geo.platform.y-.9+PLAYER_EYE+.15,geo.platform.z);run(p,.6);assert.equal(p.flying,false);assert.equal(p.grounded,true);assert.ok(Math.abs(p.feet-(geo.platform.y-.9))<.015,`unsupported platform ${direction}: ${p.feet}`);}
});

test('the crossover lift carries a walking player to the opposite-track concourse without flight',async()=>{
 const {METRO_LINES,metroStationGeometry}=await import('../worker/city-map.mjs');const line=METRO_LINES[0],base=metroStationGeometry(line,0),geo=metroStationGeometry(line,0,-base.baseDirection),points=geo.crossover;
 const index=points.findIndex((b,i)=>i>0&&Math.hypot(b.x-points[i-1].x,b.z-points[i-1].z)<.01&&b.y>points[i-1].y+.1);assert.ok(index>0);const a=points[index-1],b=points[index],p=new PlayerController();
 p.teleport(a.x,a.y-.9+PLAYER_EYE,a.z);run(p,.1);run(p,(b.y-a.y)/3.2,{forward:1,yaw:Math.PI/2,ascend:true});
 assert.equal(p.flying,false);assert.ok(Math.abs(p.feet-(b.y-.9))<.08,`lift feet=${p.feet}, target=${b.y-.9}`);
});

test('every directional metro access can be walked to its platform and back without following another lines ramp',async()=>{
 const {METRO_LINES,metroStationGeometry}=await import('../worker/city-map.mjs');let completed=0;
 for(const line of METRO_LINES)for(let index=0;index<line.points.length;index++)for(const direction of [1,-1]){
  const geo=metroStationGeometry(line,index,direction),p=new PlayerController(),start=geo.stairs[0];p.teleport(start.x,start.y-.9+PLAYER_EYE,start.z);
  for(const [leg,points]of [['up',geo.stairs],['down',[...geo.stairs].reverse()]] as const)for(let k=1;k<points.length;k++){
   const target=points[k];let steps=0;
   while(steps++<2400&&Math.hypot(p.x-target.x,p.z-target.z,p.feet-(target.y-.9))>.2){
    const dx=target.x-p.x,dz=target.z-p.z,distance=Math.hypot(dx,dz),vertical=Math.abs(p.feet-(target.y-.9));
    p.update(1/120,{...idle,forward:distance>.05||vertical>.2?1:0,yaw:Math.atan2(dx,dz),ascend:distance<.2&&p.feet<target.y-.9-.2,descend:distance<.2&&p.feet>target.y-.9+.2});
   }
   assert.ok(Math.hypot(p.x-target.x,p.z-target.z,p.feet-(target.y-.9))<.3,`${line.id}/${index}/${direction} ${leg}:${k} feet=${p.feet} target=${target.y-.9}`);assert.equal(p.flying,false);
  }
  completed++;
 }
 assert.equal(completed,METRO_LINES.reduce((n,line)=>n+line.points.length*2,0));
});

test('walking onto or away from a metro platform does not automatically ride its lift',async()=>{
 const {METRO_LINES,metroStationGeometry}=await import('../worker/city-map.mjs'),geo=metroStationGeometry(METRO_LINES[0],0),platform=geo.platform,p=new PlayerController();
 p.teleport(platform.x,platform.y-.9+PLAYER_EYE,platform.z);run(p,.15);const feet=p.feet;
 run(p,.25,{forward:1,yaw:Math.PI/2});assert.ok(Math.abs(p.feet-feet)<.02);assert.equal(p.flying,false);
});


test('the steep North City switchback retains nearby landing support without enabling flight or midair climbing',async()=>{
 const {METRO_LINES,metroStationGeometry}=await import('../worker/city-map.mjs'),line=METRO_LINES.find(l=>l.id==='M10')!,geo=metroStationGeometry(line,3,1),landing=geo.stairs[2],target=geo.stairs[3];
 for(const fps of [30,60,120]){const p=new PlayerController();p.teleport(landing.x-.03,landing.y-.9+PLAYER_EYE+.06,landing.z-.17);p.verticalVelocity=-.9;
  const seconds=Math.hypot(target.x-p.x,target.z-p.z)/4.4;for(let i=0;i<Math.ceil(seconds*fps);i++){const dx=target.x-p.x,dz=target.z-p.z;if(Math.hypot(dx,dz)<.08)break;p.update(1/fps,{...idle,forward:1,yaw:Math.atan2(dx,dz)});}
  assert.ok(p.feet>target.y-.9-.2,`landing dropped at ${fps}fps: ${p.feet}`);assert.equal(p.flying,false);
 }
 const airborne=new PlayerController();airborne.teleport(landing.x,landing.y-.9+PLAYER_EYE+1,landing.z);airborne.verticalVelocity=-.5;airborne.update(1/120,{...idle,forward:1,yaw:Math.PI/2});assert.ok(airborne.feet>landing.y-.9+.9);assert.equal(airborne.grounded,false);
});
