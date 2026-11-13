import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildMotorway,motorwaySignPlan} from '../src/motorway.ts';
import {MOTORWAY,MOTORWAY_ACCESS_ROADS} from '../worker/motorway.mjs';
import {ROADS,BUILDINGS} from '../worker/city-map.mjs';
const eps=1e-7;

test('each real motorway connector has one numbered entry and an exit board for both directions',()=>{
 const plans=motorwaySignPlan();assert.equal(plans.length,MOTORWAY_ACCESS_ROADS.length*3);
 const numbers=[];for(const road of MOTORWAY_ACCESS_ROADS){const signs=plans.filter(s=>s.accessRoadId===road.id);assert.equal(signs.length,3);assert.equal(signs.filter(s=>s.kind==='entry').length,1);assert.equal(signs.filter(s=>s.kind==='exit').length,2);assert.equal(new Set(signs.map(s=>s.exitNumber)).size,1);numbers.push(signs[0].exitNumber);}
 assert.deepEqual(numbers.sort((a,b)=>a-b),Array.from({length:MOTORWAY_ACCESS_ROADS.length},(_,i)=>i+1));
 assert.ok(plans.every(s=>MOTORWAY_ACCESS_ROADS.some(r=>r.id===s.accessRoadId)));
 const entries=plans.filter(s=>s.kind==='entry').sort((a,b)=>a.exitNumber-b.exitNumber);
 assert.equal(entries[0].destination,'North City');assert.equal(entries.at(-1)!.destination,'West City');
 assert.deepEqual([...new Set(entries.map(s=>s.destination))].sort(),['European Quarter','Main City','North City','West City']);
 assert.ok(plans.every(s=>/^[A-Za-z0-9 /-]+$/.test(s.text)));
});

test('signs face the approaching driver, indicate the real turn and leave clear road headroom and shoulders',()=>{
 for(const p of motorwaySignPlan()){
  assert.ok(p.position.y-p.height/2>6.5,`low board ${p.exitNumber}`);
  assert.ok(Math.abs(p.facing.x*p.travel.x+p.facing.z*p.travel.z+1)<eps);
  assert.ok(Math.abs(p.junction.x)<=Math.max(Math.abs(MOTORWAY.west),Math.abs(MOTORWAY.east))&&p.junction.z>=MOTORWAY.north&&p.junction.z<=MOTORWAY.south);
  for(const r of ROADS)assert.ok(!(Math.abs(p.post.x-r.x)<r.w/2+.3&&Math.abs(p.post.z-r.z)<r.d/2+.3),`post blocks ${r.id} at exit ${p.exitNumber}`);
  for(const b of BUILDINGS)assert.ok(!(Math.abs(p.post.x-b.x)<b.w/2+.3&&Math.abs(p.post.z-b.z)<b.d/2+.3),`post enters ${b.id}`);
  if(p.kind==='exit'){
   const along=(p.junction.x-p.position.x)*p.travel.x+(p.junction.z-p.position.z)*p.travel.z;assert.ok(Math.abs(along-p.advance)<eps);
   const road=MOTORWAY_ACCESS_ROADS.find(r=>r.id===p.accessRoadId)!,city={x:road.x-p.junction.x,z:road.z-p.junction.z},right={x:-p.travel.z,z:p.travel.x};assert.equal(p.arrow,city.x*right.x+city.z*right.z>0?'right':'left');
  }else{
   const road=MOTORWAY_ACCESS_ROADS.find(r=>r.id===p.accessRoadId)!;assert.ok(Math.abs(p.position.x-road.x)<=road.w/2&&Math.abs(p.position.z-road.z)<=road.d/2);assert.equal(p.arrow,'ahead');
  }
 }
});

test('all English panels share one teal atlas and one face mesh, with no real lights or billboard sprites',()=>{
 const texts:Array<{text:string;color:string}>=[],fills:string[]=[],ctx={fillStyle:'',strokeStyle:'',lineWidth:0,font:'',textBaseline:'',textAlign:'',lineCap:'',lineJoin:'',save(){},restore(){},translate(){},fillRect(){fills.push(this.fillStyle);},strokeRect(){},measureText(text:string){return{width:text.length*15};},fillText(text:string){texts.push({text,color:this.fillStyle});},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
 const previous=(globalThis as any).document;(globalThis as any).document={createElement(){return{width:0,height:0,getContext(){return ctx;}};}};
 try{
  const root=new THREE.Group(),group=buildMotorway(root);let lights=0,sprites=0,meshCount=0;root.traverse(o=>{if(o instanceof THREE.Light)lights++;if(o instanceof THREE.Sprite)sprites++;if(o instanceof THREE.Mesh)meshCount++;});
  assert.equal(lights,0);assert.equal(sprites,0);assert.ok(meshCount<=9,`${meshCount} mesh batches`);assert.equal(group.userData.motorwaySigns.length,66);
  const face=group.getObjectByName('English motorway exit and entry boards') as THREE.Mesh;assert.ok(face);const material=face.material as THREE.MeshBasicMaterial;assert.ok(material.map instanceof THREE.CanvasTexture);assert.equal(material.toneMapped,false);assert.equal(fills[0],'#55a9a0');assert.ok(texts.length>100);assert.ok(texts.every(t=>t.color==='#ffffff'));assert.ok(texts.some(t=>t.text==='EUROPEAN QUARTER'));assert.ok(texts.some(t=>t.text==='ENTRY'));assert.ok(texts.some(t=>t.text==='EXIT 22'));
  const image=material.map.image as HTMLCanvasElement;assert.equal(image.width,1536);assert.equal(image.height,1920);
 }finally{if(previous===undefined)delete (globalThis as any).document;else(globalThis as any).document=previous;}
});
