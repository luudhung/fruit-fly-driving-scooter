import test from 'node:test';import assert from 'node:assert/strict';
import {createVehicleRouter} from '../worker/vehicle-network.mjs';
const road=(x,z,w,d)=>({x,z,w,d});
const router=(roads,extra={})=>createVehicleRouter({roads:()=>roads,...extra});
function edges(path){return path.slice(1).map((p,i)=>[path[i],p]);}
test('directed lanes keep opposite traffic on distinct right-hand sides',()=>{
 const r=router([road(0,0,100,9.5)]),east=r.route({x:-30,z:3.5},{x:30,z:3.5}),west=r.route({x:30,z:-3.5},{x:-30,z:-3.5});
 assert.ok(east.length>=4&&west.length>=4);assert.ok(east.slice(1,-1).every(p=>p.z===1.5));assert.ok(west.slice(1,-1).every(p=>p.z===-1.5));
});
test('a right turn uses a short junction connector, never drifts across an entire road width',()=>{
 const r=router([road(0,0,100,9.5),road(0,0,9.5,100)]),p=r.route({x:-30,z:3.5},{x:-3.5,z:30});assert.ok(p.length>=7);
 assert.ok(p.some(p=>p.x<0&&p.z>0&&Math.abs(p.x)<4&&Math.abs(p.z)<4));
 for(const q of p)assert.ok(Math.abs(q.x)<=4.75||Math.abs(q.z)<=4.75,'route stays within actual asphalt');
});
test('grade-separated crossings do not allow a turn between tunnel and bridge decks',()=>{
 const roads=[road(0,0,9.5,220),road(0,0,220,9.5)],underpasses=()=>[{x:0,z:0,w:9.5,halfLength:42,coveredHalf:10}],r=router(roads,{underpasses,roadTravelY:(p,axis)=>axis==='z'&&Math.abs(p.x)<5&&Math.abs(p.z)<42?1.1-6.2*Math.min(1,(42-Math.abs(p.z))/32):1.1});
 assert.equal(r.route({x:1.5,z:-80},{x:80,z:1.5}).length,0,'no impossible at-grade tunnel turn');
 const p=r.route({x:1.5,z:-80},{x:1.5,z:80});assert.ok(p.some(q=>q.y<-5));assert.ok(p.some(q=>Math.abs(q.z-42)<.01));assert.ok(p.some(q=>Math.abs(q.z+42)<.01));
 const bridge=r.route({x:-80,z:1.5},{x:80,z:1.5});assert.ok(bridge.every(q=>q.y===1.1));
});
test('routes use an actual surface interchange outside the tunnel to change direction',()=>{
 const roads=[road(0,0,9.5,220),road(0,0,220,9.5),road(0,70,220,9.5),road(70,35,9.5,70)],r=router(roads,{underpasses:()=>[{x:0,z:0,w:9.5,halfLength:42}]});
 const p=r.route({x:1.5,z:-80},{x:90,z:1.5});assert.ok(p.length);assert.ok(p.some(q=>q.z>60));
});
test('road additions rebuild the graph, while route storage stays bounded',()=>{
 const roads=[road(0,0,100,9.5)],r=router(roads);assert.equal(r.route({x:-30,z:1.5},{x:80,z:50}).length,0);
 roads.push(road(40,30,9.5,60),road(60,60,40,9.5));assert.ok(r.route({x:-30,z:1.5},{x:70,z:60}).length);
 for(let i=0;i<450;i++)r.route({x:-30+i*.01,z:1.5},{x:70,z:60});assert.ok(r.stats().cachedRoutes<=384);
});
test('actual city routes remain on roads and clear every building and the river',async()=>{
 const {ROADS,PARKING_SPACES,clearSegment,UNDERPASSES,roadTravelY}=await import('../worker/city-map.mjs');
 const r=createVehicleRouter({roads:()=>ROADS,clearSegment,underpasses:()=>UNDERPASSES,roadTravelY});let found=0;
 for(let i=0;i<20;i++){
  const a=PARKING_SPACES[(i*41)%PARKING_SPACES.length],b=PARKING_SPACES[(i*73+700)%PARKING_SPACES.length],p=r.route(a,b);if(!p.length)continue;found++;
  for(const [a,b]of edges(p))assert.ok(clearSegment(a,b));
 }
 assert.ok(found>=17,`only ${found}/20 sampled city parking pairs are connected`);
});

test('a driver already at the pickup has a valid stationary road waypoint',()=>{
 const r=router([road(0,0,100,9.5)]),p=r.route({x:20,z:3.5},{x:20,z:3.5});
 assert.equal(p.length,1);assert.equal(p[0].mode,'car');assert.equal(p[0].x,20);
});

test('a flood invalidates cached city driving routes without changing the roads',async()=>{
 const {applyUrbanGeometry,clearSegment,pedestrianRoute}=await import('../worker/city-map.mjs');
 applyUrbanGeometry();
 const start={x:110,z:1.5},goal={x:150,z:1.5},first=pedestrianRoute(start,goal,'car');
 assert.ok(first.length);
 try{
  applyUrbanGeometry({floods:[{id:'route-test-flood',x:130,z:0,w:8,d:10,depth:.6}]});
  assert.ok(edges(first).some(([a,b])=>!clearSegment(a,b)),'the original lane is now flooded');
  const changed=pedestrianRoute(start,goal,'car');
  assert.ok(edges(changed).every(([a,b])=>clearSegment(a,b)),'cached route may not return a flooded segment');
 }finally{applyUrbanGeometry();}
 assert.ok(pedestrianRoute(start,goal,'car').length,'receded water opens the original approach');
});
