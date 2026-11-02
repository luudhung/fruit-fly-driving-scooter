import test from 'node:test';
import assert from 'node:assert/strict';
import {RenderTimings} from '../src/render-timings.ts';
test('GPU time is read only after an asynchronous result is ready; disjoint samples are discarded',()=>{
 let available=false,disjoint=false,reads=0,begins=0,ends=0;const query={},ext={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2};
 const gl={QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,getExtension:()=>ext,isContextLost:()=>false,createQuery:()=>query,beginQuery:()=>begins++,endQuery:()=>ends++,getQueryParameter:(_q:unknown,p:number)=>{if(p===3)return available;reads++;return 7500000;},getParameter:()=>disjoint,deleteQuery:()=>{}} as unknown as WebGL2RenderingContext;
 const timer=new RenderTimings(gl);timer.begin(1);timer.end(2);assert.equal(begins,1);assert.equal(ends,1);timer.begin(20);timer.end(4);assert.equal(reads,0);assert.equal(timer.gpuMs,null);
 available=true;timer.begin(30);timer.end(3);assert.equal(timer.gpuMs,7.5);assert.equal(reads,1);assert.equal(begins,1);assert.equal(timer.sampleCPU(),3);
 timer.begin(1100);timer.end(1);disjoint=true;timer.begin(1200);timer.end(1);assert.equal(timer.gpuMs,null);assert.equal(reads,1);
});
test('an unsupported GPU timer leaves rendering and CPU measurements available',()=>{
 const timer=new RenderTimings({getExtension:()=>null} as unknown as WebGL2RenderingContext);timer.begin(0);timer.end(4);timer.begin(1000);timer.end(8);assert.equal(timer.gpuMs,null);assert.equal(timer.sampleCPU(),6);
});
