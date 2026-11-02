import test from 'node:test';import assert from 'node:assert/strict';
import {IdleSnapshotCache} from '../src/idle-snapshot-cache.ts';
function setup(){let allowed=true,time=0;const jobs:Array<()=>void>=[],writes:number[]=[];const cache=new IdleSnapshotCache<number>({write:v=>writes.push(v),canWrite:()=>allowed,schedule:job=>jobs.push(job),now:()=>time});return{cache,jobs,writes,allow:(v:boolean)=>allowed=v,at:(v:number)=>time=v};}
test('recovery writes are deferred and coalesce to the newest observer snapshot',()=>{
 const h=setup();h.cache.offer(1);h.cache.offer(2);assert.deepEqual(h.writes,[]);assert.equal(h.jobs.length,1);h.jobs.shift()!();assert.deepEqual(h.writes,[2]);
});
test('driving blocks both scheduling and an already queued storage job',()=>{
 const h=setup();h.cache.offer(1);h.allow(false);h.jobs.shift()!();h.cache.offer(2);assert.deepEqual(h.writes,[]);assert.equal(h.jobs.length,0);
 h.allow(true);h.cache.offer(3);h.jobs.shift()!();assert.deepEqual(h.writes,[3]);
});
test('the recovery cache limits write frequency while keeping the latest value',()=>{
 const h=setup();h.cache.offer(1);h.jobs.shift()!();h.at(5000);h.cache.offer(2);h.at(29999);h.cache.offer(3);assert.equal(h.jobs.length,0);h.at(30000);h.cache.offer(4);h.jobs.shift()!();assert.deepEqual(h.writes,[1,4]);
});
test('blocked browser storage is retried later without throwing or retrying each poll',()=>{
 let now=0,attempts=0;const jobs:Array<()=>void>=[];const cache=new IdleSnapshotCache({write:()=>{attempts++;throw Error('quota');},canWrite:()=>true,schedule:job=>jobs.push(job),now:()=>now});
 cache.offer(1);assert.doesNotThrow(()=>jobs.shift()!());cache.offer(2);assert.equal(jobs.length,0);now=30000;cache.offer(3);jobs.shift()!();assert.equal(attempts,2);
});
