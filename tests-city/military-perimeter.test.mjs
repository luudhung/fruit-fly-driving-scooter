import test from 'node:test';import assert from 'node:assert/strict';
import {MILITARY_COMPOUND,MILITARY_PERIMETER_WALLS,MILITARY_GATES,MILITARY_AIRFIELD,militaryPerimeterBlocked,militaryAircraftPose} from '../worker/government-map.mjs';
import {blocked,pedestrianRoute,clearSegment,clearMetroAccessSegment,BUILDINGS,overlaps} from '../worker/city-map.mjs';

test('the complete garrison and airfield have one physical perimeter with explicit land/naval gates',()=>{
 assert.equal(MILITARY_COMPOUND.height,3.2);assert.equal(MILITARY_PERIMETER_WALLS.length,7);
 for(const wall of MILITARY_PERIMETER_WALLS){assert.ok(blocked(wall));assert.equal(clearMetroAccessSegment({...wall,y:1.1},{...wall,y:3}),false);assert.ok(BUILDINGS.every(b=>!overlaps(b,wall)),`${wall.id} preserves existing buildings`);}
 for(const gate of MILITARY_GATES){assert.equal(blocked(gate),false);assert.equal(militaryPerimeterBlocked(gate),false);}
 for(const p of [{x:580,z:-700},{x:840,z:-600},{x:700,z:-760},{x:600,z:-515}])assert.ok(blocked(p),'all four perimeter edges are physical');
});

test('quarters still reach actual formation, range, aircraft stands, public avenue and both naval gangways through real gates',()=>{
 const quarters={x:710,z:-579.2},targets=[{x:680,z:-505},{x:710,z:-625},{x:790,z:-590},{x:660,z:-684},{x:750,z:-684},{x:490,z:-560},{x:490,z:-630}];
 for(const target of targets){const route=pedestrianRoute(quarters,target);assert.ok(route.length>1,JSON.stringify(target));for(let i=1;i<route.length;i++)assert.ok(clearSegment(route[i-1],route[i]));}
});

test('the enclosing airside fence never intersects either actual aircraft taxi, takeoff, training or landing trajectory',()=>{
 for(const stand of MILITARY_AIRFIELD.stands){const plane={standId:stand.id,flight:{departure:100,arrival:2500}};
  for(let now=99;now<=2500;now+=2){const pose=militaryAircraftPose(now,plane);assert.equal(militaryPerimeterBlocked(pose,1),false,`${stand.id} at ${now}`);}
 }
});
