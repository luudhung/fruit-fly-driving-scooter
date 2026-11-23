import test from'node:test';import assert from'node:assert/strict';import{trimF1RouteCaches}from'../worker/route-cache-budget.mjs';
test('only unused path cache entries are evicted; every old visitor and current itinerary remains exact',()=>{
 const guest={id:'OLD-GUEST',money:50,leg:{key:'needed',index:3},phase:'visiting'},path=[{x:1,z:2}],event={charters:[{guests:[guest]}],tourPaths:{needed:path,finished:[{x:5,z:6}]}},state={northF1:{event:structuredClone(event),previousTours:[event]}};
 const people=JSON.stringify(state.northF1.previousTours[0].charters);assert.equal(trimF1RouteCaches(state),2);assert.deepEqual(Object.keys(event.tourPaths),['needed']);assert.equal(event.tourPaths.needed,path);assert.equal(JSON.stringify(event.charters),people);assert.equal(trimF1RouteCaches(state),0);
});
