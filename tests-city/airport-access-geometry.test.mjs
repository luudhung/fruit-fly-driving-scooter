import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRPORT,BUILDINGS,LOCATIONS,ROADS,contains,overlaps,blocked,clearSegment,pedestrianRoute,entrance} from '../worker/city-map.mjs';
import {MIN_VISITOR_PASSENGERS,VISITOR_STANDS,INBOUND_SECONDS,visitorArrivalPath} from '../worker/visitor-aviation.mjs';

test('airport ring bypass clears the terminal, overhangs, hangar and parking while retaining real ground collisions',()=>{
 const footprints=[{...AIRPORT.terminal,id:'terminal'},{id:'roof',x:-180,z:-390,w:64,d:25},{id:'canopy',x:-180,z:-377,w:68,d:8},{id:'tower',x:-245,z:-417,w:14,d:14},{id:'hangar',x:-310,z:-441,w:46,d:32},{id:'parking',x:-245,z:-375,w:44,d:22}];
 for(const r of ROADS)for(const b of footprints)assert.equal(overlaps(r,b),false,`${JSON.stringify(r)} / ${b.id}`);
 for(const id of ['airport','airport-control-tower','airport-hangar']){const b=BUILDINGS.find(b=>b.id===id);assert.ok(b,id);assert.equal(blocked(b),true);assert.equal(ROADS.some(r=>overlaps(r,b,1.4)),false);}
 const pairs=[[{x:-420,z:-398.5},{x:40,z:-398.5}],[{x:-420,z:-398.5},{x:-210,z:0}],[{x:50,z:-600},{x:-180,z:-366}],[{x:-280,z:-360},{x:-154,z:-340}]];
 for(const [a,b]of pairs){const path=pedestrianRoute(a,b,'car');assert.ok(path.length,JSON.stringify({a,b}));assert.ok(path.some(p=>p.z> -360&&p.z< -350));assert.ok(path.every((p,i)=>!i||clearSegment(path[i-1],p)));}
});

test('airport public gate remains outside the terminal and connects immigration passengers, metro and city walks',()=>{
 assert.equal(contains(AIRPORT.terminal,AIRPORT.gate),false);assert.equal(blocked(AIRPORT.gate),false);
 for(const point of [LOCATIONS.find(l=>l.id==='bank'),{x:-216.2,z:-400},entrance(BUILDINGS.find(b=>b.kind==='apartment'))])for(const [a,b]of [[point,AIRPORT.gate],[AIRPORT.gate,point]]){const path=pedestrianRoute(a,b);assert.ok(path.length,JSON.stringify({a,b}));assert.ok(path.every((p,i)=>!i||clearSegment(path[i-1],p)));}
 const flight={standId:VISITOR_STANDS[0].id,sector:'west',direction:1,inboundAt:0,parkedAt:INBOUND_SECONDS,outboundAt:null,exitAt:null};
 for(let index=0;index<MIN_VISITOR_PASSENGERS;index++){const path=visitorArrivalPath(flight,index);assert.ok(path.length);const last=path.at(-1);assert.equal(last.x,AIRPORT.gate.x);assert.equal(last.z,AIRPORT.gate.z);}
});
