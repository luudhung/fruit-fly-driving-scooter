import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_HALF,BUILDINGS,APARTMENTS,ROADS,WATER,PARK,FERRIS_WHEEL,METRO_LINES,overlaps,entrance,pedestrianRoute,clearSegment,trainState} from '../worker/city-map.mjs';
test('all building footprints clear roads, water, park and each other',()=>{
 for(let i=0;i<BUILDINGS.length;i++){
  const b=BUILDINGS[i];
  for(const other of [...ROADS,...WATER,PARK,...BUILDINGS.slice(i+1)])assert.equal(overlaps(b,other),false,`${b.id} overlap ${other.id||JSON.stringify(other)}`);
 }
});
test('routes reach real entrances without crossing solids or water',()=>{
 const homes=BUILDINGS.filter(b=>b.kind==='house'||b.kind==='apartment');
 const destinations=BUILDINGS.filter(b=>b.kind==='destination');
 for(let i=0;i<destinations.length;i++){
  const start=entrance(homes[(i*7)%homes.length]),end=entrance(destinations[i]),route=pedestrianRoute(start,end);
  assert.ok(route.length,`no route to ${destinations[i].id}`);
  assert.deepEqual({x:route.at(-1).x,z:route.at(-1).z},end);
  for(let j=1;j<route.length;j++)assert.ok(clearSegment(route[j-1],route[j]),`unsafe route to ${destinations[i].id}`);
 }
});
test('every metro station receives a train with a usable dwell',()=>{
 for(const line of METRO_LINES){const seen=new Set();for(let s=0;s<240;s++){const t=trainState(line,s);if(t.dwelling)seen.add(t.from);}assert.equal(seen.size,line.points.length);}
});
test('large park is free of streets, buildings and elevated metro; wheel queue is reachable',async()=>{
 const {LOCATIONS,PARK_PATHS}=await import('../worker/city-map.mjs');
 assert.ok(WORLD_HALF>=600);
 assert.ok(PARK.w*PARK.d>=35000);
 assert.ok(FERRIS_WHEEL.radius>=28);
 assert.ok(FERRIS_WHEEL.x-FERRIS_WHEEL.radius>PARK.x-PARK.w/2);
 assert.ok(FERRIS_WHEEL.x+FERRIS_WHEEL.radius<PARK.x+PARK.w/2);
 assert.ok(FERRIS_WHEEL.z>PARK.z-PARK.d/2&&FERRIS_WHEEL.z<PARK.z+PARK.d/2);
 for(const r of ROADS)assert.equal(overlaps(PARK,r),false);
 for(const line of METRO_LINES)for(let i=1;i<line.points.length;i++){
  const a=line.points[i-1],b=line.points[i];
  const segment={x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,w:Math.max(1,Math.abs(b[0]-a[0])),d:Math.max(1,Math.abs(b[1]-a[1]))};
  assert.equal(overlaps(PARK,segment),false);
 }
 const queue=LOCATIONS.find(l=>l.id==='ferris-wheel'),home=entrance(BUILDINGS.find(b=>b.kind==='apartment'));
 assert.ok(pedestrianRoute(home,queue).length);
 for(const path of PARK_PATHS)for(const water of WATER)assert.equal(overlaps(path,water),false);
});

test('park-edge housing and iconic skyline survive the v10 expansion',()=>{
 const ids=new Set(BUILDINGS.filter(b=>b.kind==='landmark').map(b=>b.id));
 for(const id of ['empire','toronto','petronas','burj-khalifa','marina-bay'])assert.ok(ids.has(id),`missing landmark ${id}`);
 const west=PARK.x-PARK.w/2,east=PARK.x+PARK.w/2,north=PARK.z-PARK.d/2,south=PARK.z+PARK.d/2;
 const nearPark=APARTMENTS.filter(b=>{
   const dx=Math.max(west-b.x,b.x-east,0),dz=Math.max(north-b.z,b.z-south,0);
   return Math.hypot(dx,dz)<28;
 });
 assert.ok(nearPark.length>=12,`expected park-edge apartment wall, got ${nearPark.length}`);
});
