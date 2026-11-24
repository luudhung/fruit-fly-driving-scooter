import test from'node:test';import assert from'node:assert/strict';import{restoreInitialFireDamage}from'../worker/urban-restoration.mjs';
test('restore the present unstarted damage once while protecting every working repair and its progress',()=>{
 const buildings=Object.fromEntries(['orphan','queued','working'].map(id=>[id,{id,health:0,stage:'collapsed',lastDamageAt:100,h:20}])),queue={id:'Q',buildingId:'queued',kind:'rebuild',stage:'queued',progress:0,spent:0,workerIds:[],budget:500},work={id:'W',buildingId:'working',kind:'repair',stage:'construction',progress:.4,spent:100,workerIds:['B']},state={simulationAgeSeconds:1000,urbanWorld:{ownerRestoration:{version:1,pending:[]},buildings,projects:[queue,work],fires:[]}},before=JSON.stringify(work);let refunded=0;
 const hooks={reopen:b=>Object.assign(b,{health:100,stage:'operational'}),cancelUnstartedProject:p=>{refunded+=p.budget-p.spent;p.stage='cancelled';}};
 restoreInitialFireDamage(state,hooks);assert.equal(buildings.orphan.health,100);assert.equal(buildings.queued.health,100);assert.equal(refunded,500);assert.equal(JSON.stringify(work),before);assert.equal(buildings.working.health,0);
 buildings.orphan.health=50;buildings.orphan.stage='damaged';restoreInitialFireDamage(state,hooks);assert.equal(buildings.orphan.health,50);assert.equal(refunded,500,'no second refund on reload or future ticks');
});
test('a captured burning building waits for containment and is restored once, unless its repair has already started',()=>{
 const a={id:'A',health:20,stage:'unsafe',lastDamageAt:100},b={id:'B',health:20,stage:'unsafe',lastDamageAt:100},fires=[{buildingId:'A'},{buildingId:'B'}],state={simulationAgeSeconds:1000,urbanWorld:{buildings:{A:a,B:b},fires,projects:[]}};
 const hooks={reopen:building=>Object.assign(building,{health:100,stage:'operational'})};
 restoreInitialFireDamage(state,hooks);assert.equal(a.health,20);assert.deepEqual(state.urbanWorld.ownerRestoration.pending,['A','B']);
 fires.forEach(f=>f.containedAt=1100);state.urbanWorld.projects.push({buildingId:'B',kind:'repair',stage:'queued',progress:.1,workerIds:[]});
 restoreInitialFireDamage(state,hooks);assert.equal(a.health,100);assert.equal(b.health,20);assert.deepEqual(state.urbanWorld.ownerRestoration.untouched,['B']);
 assert.deepEqual(state.urbanWorld.ownerRestoration.pending,[]);
});
