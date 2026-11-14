import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SceneViewBudget,selectViewBudget} from '../src/view-budget.ts';
import {PersonalCars} from '../src/personal-cars.ts';
import {batchStaticBoxes} from '../src/static-box-batches.ts';

function camera(x=0,z=0,targetZ=-100){const c=new THREE.PerspectiveCamera(70,1,.1,2000);c.position.set(x,2,z);c.lookAt(x,2,targetZ);c.updateMatrixWorld();return c;}
test('view interests exclude distant/behind actors while hysteresis retains a boundary actor',()=>{
 const view=new SceneViewBudget({enterDistance:100,leaveDistance:120,frustumMargin:1,retainedMargin:4});view.setCamera(camera());
 assert.equal(view.visible({x:0,y:2,z:-90}),true);assert.equal(view.visible({x:0,y:2,z:30}),false);
 assert.equal(view.visible({x:0,y:2,z:-110}),false);assert.equal(view.visible({x:0,y:2,z:-110},true),true);
 assert.equal(view.visible({x:0,y:2,z:-125},true),false);
 assert.equal(view.visible({x:0,y:2,z:-125},false,30),true,'a visible tall/wide bound can intersect the range');
});
test('selection retains complete source data and bounds dense visible candidates deterministically',()=>{
 const view=new SceneViewBudget();view.setCamera(camera());
 const items=Array.from({length:1000},(_,i)=>({id:String(i),x:i%7,y:2,z:-40-Math.floor(i/7)})),original=JSON.stringify(items);
 const first=selectViewBudget(items,view,p=>p,p=>p.id,new Set(),24);
 assert.equal(first.length,24);assert.equal(JSON.stringify(items),original);
 const second=selectViewBudget([...items].reverse(),view,p=>p,p=>p.id,new Set(first.map(p=>p.id)),24);
 assert.deepEqual(second.map(p=>p.id),first.map(p=>p.id));
});
test('dense interest selection gives retained IDs a distance-sized hysteresis band',()=>{
 const view=new SceneViewBudget();view.setCamera(camera());
 const held={id:'held',x:0,y:2,z:-300},near={id:'new',x:0,y:2,z:-299};
 assert.deepEqual(selectViewBudget([near,held],view,p=>p,p=>p.id,new Set(['held']),1).map(p=>p.id),['held']);
 near.z=-290;
 assert.deepEqual(selectViewBudget([near,held],view,p=>p,p=>p.id,new Set(['held']),1).map(p=>p.id),['new'],'a substantially nearer candidate still replaces a retained actor');
});
const driver=(id:string,x:number,z:number)=>({id,alive:true,vehicle:'car',x,y:1.1,z,vx:0,vz:0,traveling:false,transitMode:'walk',parkedCar:{x,z,heading:0}});
test('camera motion and delayed snapshots retain a moving car at its displayed position',()=>{
 const scene=new THREE.Scene(),renderer=new PersonalCars(scene),c=camera(0,-100,-200);renderer.setView(c);
 const actor={...driver('FLY-1',0,-560),traveling:true,transitMode:'car',vz:20,trafficSignalPermit:true,motion:{at:0,speed:20,mode:'car',signalPermit:true,points:[{x:0,y:1.1,z:-250}]}};
 renderer.sync([actor]);for(let i=0;i<4*60;i++)renderer.update(1/60);
 assert.equal(renderer.stats.cached,1);
 const bodies=scene.children.find((m):m is THREE.InstancedMesh=>m instanceof THREE.InstancedMesh&&m.geometry instanceof THREE.BoxGeometry)!;
 const before=new THREE.Matrix4();bodies.getMatrixAt(0,before);assert.ok(before.elements[14]>-490);
 c.position.z=0;c.lookAt(0,2,-100);
 renderer.sync([{...actor,motion:{...actor.motion,at:120}}]);renderer.update(.13);
 assert.equal(renderer.stats.cached,1,'authoritative position behind the displayed car must not evict it');
 assert.equal(renderer.stats.created,1,'retained moving ID must keep its motion object');assert.equal(renderer.stats.reused,0);
 const after=new THREE.Matrix4();bodies.getMatrixAt(0,after);assert.ok(after.elements[14]>=before.elements[14],'refresh must not reset the car backward');
 c.position.x=2000;c.lookAt(2000,2,-100);renderer.update(.13);assert.equal(renderer.stats.cached,0,'a truly offscreen moving car still releases its visual');
});
test('parking and driving transitions use their new location and release removed IDs',()=>{
 const renderer=new PersonalCars(new THREE.Scene());renderer.setView(camera());
 const parked=driver('FLY-1',0,-40);renderer.sync([parked]);renderer.update(.13);assert.equal(renderer.stats.cached,1);
 renderer.sync([{...parked,traveling:true,transitMode:'car',x:2000,z:-40}]);renderer.update(.13);assert.equal(renderer.stats.cached,0,'departing car cannot keep an obsolete visible parking point');
 const moving={...parked,traveling:true,transitMode:'car'};renderer.sync([moving]);renderer.update(.13);assert.equal(renderer.stats.cached,1);
 renderer.sync([{...parked,parkedCar:{x:2000,z:-40,heading:0}}]);renderer.update(.13);assert.equal(renderer.stats.cached,0,'parking away from view releases the old driving visual');
 renderer.sync([moving]);renderer.update(.13);assert.equal(renderer.stats.cached,1);
 renderer.sync([]);renderer.update(.13);assert.equal(renderer.stats.cached,0,'missing authoritative actors must not become ghosts');
});
test('a car leaving interest does not repeatedly restart from the same visible snapshot',()=>{
 const scene=new THREE.Scene(),renderer=new PersonalCars(scene),c=camera();renderer.setView(c);
 const actor={...driver('FLY-1',0,-470),traveling:true,transitMode:'car',vz:-20,trafficSignalPermit:true,motion:{at:0,speed:20,mode:'car',signalPermit:true,points:[{x:0,y:1.1,z:-800}]}};
 renderer.sync([actor]);let left=false;
 for(let i=0;i<8*60;i++){renderer.update(1/60);if(!renderer.stats.cached)left=true;if(left)assert.equal(renderer.stats.cached,0,'same stale snapshot must not restart an offscreen car');}
 assert.equal(left,true);assert.equal(renderer.stats.created,1);assert.equal(renderer.stats.reused,0);
 assert.equal(renderer.stats.dormant,1);assert.equal(renderer.stats.bodies,0);
 c.position.z=-250;c.lookAt(0,2,-600);renderer.update(.13);assert.equal(renderer.stats.cached,1);assert.equal(renderer.stats.dormant,0);
 const body=scene.children.find((m):m is THREE.InstancedMesh=>m instanceof THREE.InstancedMesh&&m.geometry instanceof THREE.BoxGeometry)!,matrix=new THREE.Matrix4();body.getMatrixAt(0,matrix);
 assert.ok(matrix.elements[14]<-540,'returning camera resumes the retained prediction, not the old snapshot');
 c.position.x=2000;c.lookAt(2000,2,-600);renderer.update(.13);assert.equal(renderer.stats.dormant,1);
 renderer.sync([]);renderer.update(.13);assert.equal(renderer.stats.dormant,0,'removed authoritative IDs release dormant CPU state too');
});
test('vehicle streaming creates a bounded gradual cache, actually releases a distant view, and pools reused visuals',()=>{
 const scene=new THREE.Scene(),renderer=new PersonalCars(scene),c=camera();renderer.setView(c);
 const actors=Array.from({length:700},(_,i)=>driver(`FLY-${i}`,i%12-6,-45-Math.floor(i/12)*2)),before=JSON.stringify(actors);
 renderer.sync(actors);renderer.update(1/60);assert.equal(renderer.stats.cached,12);
 for(let i=0;i<14;i++)renderer.update(.13);
 assert.equal(renderer.stats.cached,120);assert.equal(renderer.stats.bodies,120);assert.equal(JSON.stringify(actors),before);
 const created=renderer.stats.created;c.position.x=2000;c.lookAt(2000,2,-100);renderer.update(.13);
 assert.equal(renderer.stats.cached,0);assert.equal(renderer.stats.bodies,0);assert.equal(renderer.stats.wheels,0);
 c.position.x=0;c.lookAt(0,2,-100);renderer.update(.13);assert.equal(renderer.stats.cached,12);assert.equal(renderer.stats.created,created);assert.ok(renderer.stats.reused>=12);
});
test('near vehicles keep full detail while mid/far vehicles omit wheel and cabin geometry',()=>{
 const renderer=new PersonalCars(new THREE.Scene());renderer.setView(camera());
 renderer.sync([driver('FLY-1',0,-40),driver('FLY-2',0,-180),driver('FLY-3',0,-390),driver('FLY-4',0,-800),driver('FLY-5',0,80)]);
 renderer.update(.13);
 assert.deepEqual({body:renderer.stats.bodies,cabin:renderer.stats.cabins,wheel:renderer.stats.wheels},{body:3,cabin:2,wheel:4});
 assert.equal(renderer.stats.triangles,108);
});

test('spatial infrastructure batches preserve all transforms while giving distant cells separate cullable bounds',()=>{
 const group=new THREE.Group(),material=new THREE.MeshBasicMaterial();
 for(const x of [0,500]){const m=new THREE.Mesh(new THREE.BoxGeometry(4,2,6),material);m.position.set(x,8,20);group.add(m);}
 const batches=batchStaticBoxes(group,160);assert.equal(batches.length,2);assert.ok(batches.every(m=>m.count===1&&m.frustumCulled&&m.boundingSphere!.radius<10));
 const matrix=new THREE.Matrix4();batches[1].getMatrixAt(0,matrix);assert.equal(matrix.elements[12],500);assert.equal(matrix.elements[13],8);assert.equal(matrix.elements[0],4);assert.equal(matrix.elements[5],2);assert.equal(matrix.elements[10],6);
});

test('actor interests preserve front, rear and distance decisions under reversed-Z projection',()=>{
 const regular=camera(),reverse=camera();
 // WebGLRenderer enables this camera flag after detecting EXT_clip_control.
 Reflect.set(reverse,'_reversedDepth',true);reverse.updateProjectionMatrix();
 const normalView=new SceneViewBudget({enterDistance:100,leaveDistance:120}),reverseView=new SceneViewBudget({enterDistance:100,leaveDistance:120});
 normalView.setCamera(regular);reverseView.setCamera(reverse);
 for(const position of [{x:0,y:2,z:-60},{x:0,y:2,z:30},{x:95,y:2,z:-30},{x:0,y:2,z:-125}]){
  assert.equal(reverseView.visible(position),normalView.visible(position),JSON.stringify(position));
 }
 assert.equal(reverseView.visible({x:0,y:2,z:-60}),true);
 assert.equal(reverseView.visible({x:0,y:2,z:30}),false);
});

test('landmark merging retains exact surfaces, shared night materials, glass and existing instancing',async()=>{
 const{batchStaticMeshes}=await import('../src/static-box-batches.ts'),root=new THREE.Group(),material=new THREE.MeshStandardMaterial({emissive:0x2244ff});
 const a=new THREE.Mesh(new THREE.BoxGeometry(2,4,6),material),b=new THREE.Mesh(new THREE.CylinderGeometry(1,2,3,8),material);a.position.set(2,5,7);b.position.set(-8,9,-3);b.rotation.z=.3;root.add(a,b);
 const glass=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({transparent:true,opacity:.3})),instances=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,4);root.add(glass,instances);
 const expected=[a,b].flatMap(m=>{m.updateMatrix();const geo=m.geometry.toNonIndexed().applyMatrix4(m.matrix);const positions=[...geo.getAttribute('position').array];geo.dispose();return positions;});
 const merged=batchStaticMeshes(root);assert.equal(merged.length,1);assert.deepEqual([...merged[0].geometry.getAttribute('position').array],expected);assert.equal(merged[0].material,material);
 material.emissiveIntensity=2;assert.equal((merged[0].material as THREE.MeshStandardMaterial).emissiveIntensity,2);assert.ok(root.children.includes(glass)&&root.children.includes(instances));assert.equal(instances.count,4);
 assert.equal(a.parent,null);assert.equal(b.parent,null);assert.equal(root.children.length,3);
});
