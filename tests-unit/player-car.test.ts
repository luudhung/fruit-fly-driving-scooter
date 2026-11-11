import test from 'node:test';
import assert from 'node:assert/strict';
import {PlayerCar,PLAYER_CAR_WORLD,playerCarClear,playerCarGround,PLAYER_CAR_PARKING,CAR_HALF_LENGTH,cityCarClear,cityCarGround,carExitPosition,type CarInput,type CarWorld} from '../src/player-car.ts';
import {PlayerController} from '../src/player-controller.ts';
import {BRIDGES,ROADS,contains,blocked,clearSegment,pedestrianRoute,roadTravelY,WORLD_HALF,BUILDINGS,effectiveBuildingHeight} from '../worker/city-map.mjs';
const open:CarWorld={clear:()=>true,ground:()=>.2};
function run(car:PlayerCar,seconds:number,input:CarInput){for(let i=0;i<Math.round(seconds*120);i++)car.update(1/120,input);}

test('a fresh page starts by the bridge, while re-entry keeps the parked location',()=>{
 const car=new PlayerCar();car.enter();
 assert.equal(cityCarClear(car.x,car.z,car.heading),true);
 assert.ok(car.x<BRIDGES[1].x-BRIDGES[1].w/2);
 assert.ok(BRIDGES[1].x-BRIDGES[1].w/2-car.x<12);
 assert.equal(car.heading,Math.PI/2);assert.equal(car.active,true);
 run(car,5,{throttle:1,steer:0});assert.ok(car.x>380);
 const parked={x:car.x,z:car.z,heading:car.heading,ground:car.ground,pitch:car.pitch};
 car.stop();run(car,3,{throttle:1,steer:1});car.enter();
 assert.deepEqual({x:car.x,z:car.z,heading:car.heading,ground:car.ground,pitch:car.pitch},parked);assert.equal(car.speed,0);
 const reloaded=new PlayerCar();reloaded.enter();assert.equal(reloaded.x,PLAYER_CAR_PARKING.x);assert.equal(reloaded.z,PLAYER_CAR_PARKING.z);
});
test('exiting and re-entering on an underpass ramp preserves height, slope and direction',()=>{
 const car=new PlayerCar(PLAYER_CAR_WORLD);car.enter();car.x=372;car.z=50;car.heading=Math.PI;
 run(car,3,{throttle:1,steer:0});assert.ok(car.ground<-.5);assert.ok(Math.abs(car.pitch)>.05);
 const parked={x:car.x,z:car.z,heading:car.heading,ground:car.ground,pitch:car.pitch};
 car.stop();car.enter();assert.deepEqual({x:car.x,z:car.z,heading:car.heading,ground:car.ground,pitch:car.pitch},parked);
});
test('throttle accelerates smoothly, reverse first brakes forward movement, and the brake stops',()=>{
 const car=new PlayerCar(open);car.enter();run(car,1,{throttle:1,steer:0});
 assert.ok(car.speed>3&&car.speed<5);const position=car.x;
 run(car,.2,{throttle:-1,steer:0});assert.ok(car.speed>0&&car.speed<3);assert.ok(car.x>position);
 run(car,2,{throttle:-1,steer:0});assert.ok(car.speed<0&&car.speed>=-5);
 run(car,1,{throttle:0,steer:0,brake:true});assert.equal(car.speed,0);
 run(car,10,{throttle:1,steer:0});assert.equal(car.speed,15);
});
test('right steering turns right, reverse steering reverses, and turning while stopped is stable',()=>{
 const car=new PlayerCar(open);car.enter();const start=car.heading;
 run(car,.5,{throttle:0,steer:1});assert.equal(car.heading,start);
 run(car,1.5,{throttle:1,steer:1});assert.ok(car.heading<start);assert.ok(car.z>PLAYER_CAR_PARKING.z);
 const reverse=new PlayerCar(open);reverse.enter();run(reverse,1.5,{throttle:-1,steer:1});assert.ok(reverse.heading>start);
});
test('swept substeps stop at a thin obstacle without position or rotation tunneling',()=>{
 const wall=348,car=new PlayerCar({clear:x=>x+CAR_HALF_LENGTH<wall,ground:()=>.2});car.enter();
 for(let i=0;i<30;i++)car.update(.1,{throttle:1,steer:0});
 assert.ok(car.x>343&&car.x+CAR_HALF_LENGTH<wall);assert.equal(car.speed,0);
 const before={x:car.x,z:car.z};car.update(10,{throttle:1,steer:0});assert.ok(car.x+CAR_HALF_LENGTH<wall);assert.ok(car.x-before.x<.1);assert.equal(car.z,before.z);
});
test('the first-person seat remains inside the car and follows heading rather than camera look',()=>{
 const car=new PlayerCar(open);car.enter();const a=car.driverPosition();
 assert.ok(Math.hypot(a.x-car.x,a.z-car.z)<.5);assert.ok(Math.abs(a.y-car.ground-1.45)<.001);
 car.heading+=Math.PI;const b=car.driverPosition();assert.ok(Math.abs(a.x+b.x-2*car.x)<.001);assert.ok(Math.abs(a.z+b.z-2*car.z)<.001);
});
test('one second of driving agrees at 30, 60 and 120 frames per second, including curbs, ramps and poles',()=>{
 const scenarios=[
  {world:open,x:342,z:3.25,heading:Math.PI/2,ground:.2,steer:.6},
  {world:PLAYER_CAR_WORLD,x:342,z:3.25,heading:0,ground:.2,steer:0},
  {world:PLAYER_CAR_WORLD,x:372,z:40,heading:Math.PI,ground:.2-6.2*2/32,steer:0},
  {world:PLAYER_CAR_WORLD,x:346,z:7.35,heading:Math.PI/2,ground:.3,steer:0},
 ];
 for(const scenario of scenarios){
  const cars=[30,60,120].map(fps=>{
   const car=new PlayerCar(scenario.world);car.enter();Object.assign(car,{x:scenario.x,z:scenario.z,heading:scenario.heading,ground:scenario.ground});
   for(let i=0;i<fps;i++)car.update(1/fps,{throttle:1,steer:scenario.steer});
   return car;
  });
  const reference=cars[2];
  for(const car of cars.slice(0,2)){
   assert.ok(Math.hypot(car.x-reference.x,car.z-reference.z)<.03);
   assert.ok(Math.abs(car.heading-reference.heading)<.003);
   assert.ok(Math.abs(car.speed-reference.speed)<.03);
   assert.ok(Math.abs(car.ground-reference.ground)<.01);
   assert.ok(Math.abs(car.pitch-reference.pitch)<.006);
  }
 }
});
test('a curb eases the seat pitch while wheels immediately retain their physical height',()=>{
 const car=new PlayerCar({clear:()=>true,ground:x=>x>342.4?.3:.2});car.enter();
 car.update(1/60,{throttle:0,steer:0});
 const target=Math.atan2(.1,1.4),initialPitch=car.pitch;
 assert.equal(car.ground,.2);assert.ok(initialPitch>0&&initialPitch<target/3,'avoid an instant camera tilt at a curb');
 for(let i=0;i<59;i++)car.update(1/60,{throttle:0,steer:0});
 assert.ok(Math.abs(car.pitch-target)<.00001,'suspension settles to the measured slope');
 const before=car.driverPosition();car.stop();car.enter();assert.deepEqual(car.driverPosition(),before,'re-entry retains suspension and eye height');
});
test('the car crosses the complete central bridge on its deck and never snaps into the underpasses',()=>{
 const car=new PlayerCar();car.enter();for(let i=0;i<13*120;i++){car.update(1/120,{throttle:1,steer:0});assert.ok(Math.abs(car.ground-.2)<.001);}
 assert.ok(car.x>505,`bridge not crossed: ${car.x}`);
 assert.equal(cityCarGround(372,0,.2),.2);assert.ok(Math.abs(cityCarGround(372,0,-6)!+6)<.001);
 assert.equal(cityCarGround(372,8.1,.2),null,'bridge edge cannot drop directly onto the tunnel floor');
});
test('the south harbor road and its city approaches support drivers and pedestrians',()=>{
 const car=new PlayerCar(PLAYER_CAR_WORLD);car.enter();Object.assign(car,{x:-172,z:400,heading:Math.PI/2});
 run(car,36,{throttle:1,steer:0});assert.ok(car.x>335,`stopped on the harbor deck at ${car.x}`);
 assert.ok(Math.abs(car.ground-.2)<.01);
 const exit=carExitPosition(car.x,car.z,car.ground);assert.ok(exit&&Math.abs(exit.z-400)>5);
 const walker=new PlayerController();walker.teleport(exit.x,exit.y,exit.z);
 for(let i=0;i<120;i++)walker.update(1/120,{forward:1,strafe:0,yaw:Math.PI/2,sprint:1,ascend:false,descend:false});
 assert.ok(walker.x>exit.x+1);assert.equal(walker.swimming,false);
 assert.equal(playerCarClear(0,411,Math.PI/2),false,'water beside the causeway blocks the car');
 for(const x of [-102,122,310,372]){
  const town={x,z:350},deck={x:0,z:400};
  for(const mode of ['walk','car','scooter'])for(const [start,end] of [[town,deck],[deck,town]]){
   const route=pedestrianRoute(start,end,mode);
   assert.ok(route.length>2,`missing ${mode} route at ${x}`);
   assert.ok(route.every((p,i)=>!i||clearSegment(route[i-1],p)),`unsafe ${mode} route at ${x}`);
   assert.deepEqual({x:route.at(-1)!.x,z:route.at(-1)!.z},end);
  }
 }
});
test('both riverbank roads descend into and emerge from every bridge underpass continuously',()=>{
 for(const x of [372,500])for(const z of [-180,0,180]){
  const car=new PlayerCar();car.enter();car.x=x;car.z=z+50;car.heading=Math.PI;let low=.2,previous=.2;
  for(let i=0;i<11*120;i++){car.update(1/120,{throttle:1,steer:0});assert.ok(Math.abs(car.ground-previous)<.05);previous=car.ground;low=Math.min(low,car.ground);}
  assert.ok(low< -5.9,`never entered ${x}/${z}: ${low}`);assert.ok(car.z<z-45,`did not emerge ${x}/${z}: ${car.z}`);assert.ok(Math.abs(car.ground-.2)<.01);
 }
});
test('pavement, river, building and world boundaries block the full car footprint',()=>{
 assert.equal(cityCarClear(430,50,0),false,'river');assert.equal(cityCarClear(360,50,0),false,'off road');
 assert.equal(cityCarClear(WORLD_HALF-2,0,0),false,'world edge');
 const b=BUILDINGS.find(b=>effectiveBuildingHeight(b)>0)!;assert.equal(cityCarClear(b.x,b.z,0),false,'building');
 assert.equal(cityCarClear(430,0,Math.PI/2),true,'central bridge deck');
});
test('player wheels climb the sidewalk without losing solid buildings or river boundaries',()=>{
 const car=new PlayerCar(PLAYER_CAR_WORLD);car.enter();car.heading=0;
 let highest=car.ground;for(let i=0;i<192;i++){car.update(1/120,{throttle:1,steer:0});highest=Math.max(highest,car.ground);}
 assert.ok(car.z>6,`stuck at curb: ${car.z}`);assert.ok(car.speed>3);assert.ok(highest>=.29,'wheels must step onto the raised sidewalk');
 const b=BUILDINGS.find(b=>effectiveBuildingHeight(b)>0)!;
 assert.equal(playerCarClear(b.x,b.z,0),false);assert.equal(playerCarClear(430,50,0),false);
 assert.equal(cityCarClear(342,7,0),false,'ordinary road-only clearance still rejects sidewalk');
 assert.equal(playerCarClear(342,7,0,.3),true,'player can use that sidewalk');
});
test('street posts and bridge piers are solid at car height, with separated tunnel levels',()=>{
 assert.equal(playerCarClear(350,7.35,Math.PI/2,.4),false,'bridge lamp');
 assert.equal(playerCarClear(346,10.9,Math.PI/2,.2),false,'bridge concrete pier');
 assert.equal(playerCarClear(350,7.35,Math.PI/2,-6),true,'a lamp above the tunnel must not block the underground car');
 assert.equal(playerCarClear(430,0,Math.PI/2,.2),true,'bridge carriageway stays open');
});
test('hitting a real bridge lamp stops the player car and reverse releases it',()=>{
 const car=new PlayerCar(PLAYER_CAR_WORLD);car.enter();car.z=7.35;
 run(car,4,{throttle:1,steer:0});const contact=car.x;
 assert.ok(contact>343&&contact+CAR_HALF_LENGTH<350,'car must stop before the lamp rather than pass through it');
 run(car,2,{throttle:-1,steer:0});assert.ok(car.x<contact-1,'driver can back away from a real pole');
});
test('underpass retaining walls stop sideways driving below ground and allow backing out',()=>{
 const car=new PlayerCar(PLAYER_CAR_WORLD);car.enter();car.x=372;car.z=0;car.ground=-6;
 run(car,3,{throttle:1,steer:0});const contact=car.x;
 assert.ok(contact>373&&contact+CAR_HALF_LENGTH<378.8,'must stop at the actual excavation wall');
 run(car,2,{throttle:-1,steer:0});assert.ok(car.x<contact-1);
 assert.equal(playerCarClear(378.8,0,0,.2),true,'upper promenade is above the retaining wall');
});
test('glancing contact slides along the free direction and permits reversing away',()=>{
 const wall=348,car=new PlayerCar({clear:x=>x+CAR_HALF_LENGTH<wall,ground:()=>.2});car.enter();car.heading=Math.PI/4;
 run(car,3,{throttle:1,steer:0});const atWall={x:car.x,z:car.z};
 assert.ok(car.x+CAR_HALF_LENGTH<wall);assert.ok(car.z>PLAYER_CAR_PARKING.z+4,'must move along wall rather than lock entirely');
 run(car,2,{throttle:-1,steer:0});assert.ok(car.x<atWall.x-.5,'reverse must release contact');
});
test('leaving the edge of an underpass recovers the surface height without a permanent stop',()=>{
 let floor=-6;for(let i=0;i<100;i++)floor=playerCarGround(360,50,floor);assert.ok(Math.abs(floor-.3)<.11);
});
test('exiting at the curb and bridge produces a dry sidewalk supported by the walking controller',()=>{
 for(const [x,z,ground]of [[342,3.25,.2],[430,3.25,.2],[372,0,-6],[500,0,-6]]){
  const exit=carExitPosition(x,z,ground);assert.ok(exit,`no exit ${x}/${z}/${ground}`);assert.equal(blocked(exit),false);
  assert.equal(ROADS.some(r=>contains(r,exit,.35)&&!(ground<-.5&&r.w>r.d&&BRIDGES.some(b=>contains(b,exit)))),false,'must leave onto sidewalk at the current level');assert.ok(Math.hypot(exit.x-x,exit.z-z)<10);
  const walker=new PlayerController();walker.teleport(exit.x,exit.y,exit.z);
  for(let i=0;i<120;i++)walker.update(1/120,{forward:0,strafe:0,yaw:0,sprint:1,ascend:false,descend:false});
  assert.equal(walker.flying,false);assert.equal(walker.swimming,false);assert.ok(Math.abs(walker.y-exit.y)<.2,`unsupported exit ${x}: ${walker.y} vs ${exit.y}`);
 }
});

 test('dry below-sea-level underpasses are walking surfaces while river and sea still require swimming',()=>{
  const walker=new PlayerController();
  for(const [x,z]of [[372,0],[500,-180],[372,180]]){walker.teleport(x,roadTravelY({x,z})-.9+1.7,z);assert.equal(walker.swimming,false);}
  for(const [x,z]of [[430,50],[15,-112],[500,600]]){walker.teleport(x,1.05,z);assert.equal(walker.swimming,true);}
  walker.teleport(430,1.05,50,true);assert.equal(walker.swimming,false);
 });
