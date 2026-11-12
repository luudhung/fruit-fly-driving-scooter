import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {MetroRenderer,metroDirectionLabel} from '../src/metro-renderer.ts';
import {metroInterchangePaths} from '../src/metro-interchanges.ts';
import {METRO_LINES,metroStationGeometry,metroTrackPoints,trainStates} from '../worker/city-map.mjs';
const sign=(text:string)=>{const sprite=new THREE.Sprite();sprite.userData.text=text;return sprite;};
const write=(sprite:THREE.Sprite,text:string)=>{sprite.userData.text=text;};
const setup=()=>new MetroRenderer(new THREE.Group(),sign,write,3);

test('metro lines retain two physical trains and two separately labeled platforms per stop',()=>{
 const m=setup();assert.equal(m.trains.length,METRO_LINES.length*2);assert.equal(new Set(m.trains.map(t=>t.id)).size,METRO_LINES.length*2);
 assert.equal(m.stations.length,METRO_LINES.reduce((n,l)=>n+l.points.length*2,0));
 for(const line of METRO_LINES){assert.deepEqual(m.trains.filter(t=>METRO_LINES[t.lineIndex].id===line.id).map(t=>t.id),[line.id+'-A',line.id+'-B']);for(let index=0;index<line.points.length;index++){const platforms=m.stations.filter(s=>s.lineId===line.id&&s.index===index);assert.deepEqual(platforms.map(s=>s.direction),[1,-1]);assert.ok(platforms[0].title.includes('→'));assert.ok(platforms[1].title.includes('←'));}}
 assert.ok(m.infrastructure.children.filter(o=>o instanceof THREE.Mesh).every(o=>o instanceof THREE.InstancedMesh),'all immutable station/rail boxes should be batched');
 for(const train of m.trains)assert.equal(train.group.children.filter(o=>o instanceof THREE.InstancedMesh).length,3,'carriages/body/windows keep three batches per train');
});

test('renderer follows both fixed directional services and hides the depot turnover',()=>{
 const m=setup();for(const seconds of [0,3,4,10,25,90,180,350,600]){m.update(seconds);for(const line of METRO_LINES)for(const pose of trainStates(line,seconds)){const visual=m.trains.find(t=>t.id===pose.id)!;assert.ok(visual.group.position.distanceTo(new THREE.Vector3(pose.x,pose.y,pose.z))<1e-8);assert.equal(visual.direction,pose.direction);assert.equal(visual.group.visible,pose.active);assert.ok(visual.label.userData.text.startsWith(metroDirectionLabel(line,pose.direction)));}}
});

test('a terminal arrival retains its incoming rail heading instead of rotating a stopped train',()=>{
 const m=setup();let seen=0;
 for(const line of METRO_LINES)for(const direction of [1,-1]){
  let terminal;
  for(let seconds=0;seconds<600;seconds+=.5){const pose=trainStates(line,seconds).find(t=>t.direction===direction)!;if(pose.active&&pose.from===pose.to){terminal={pose,seconds};break;}}
  assert.ok(terminal);m.update(terminal.seconds);const a=line.points[terminal.pose.from-direction],b=line.points[terminal.pose.to],visual=m.trains.find(t=>t.id===terminal.pose.id)!;
  assert.ok(Math.abs(visual.group.rotation.y-Math.atan2(b[0]-a[0],b[1]-a[1]))<1e-8);seen++;
 }
 assert.equal(seen,METRO_LINES.length*2);
});

test('ridership is counted by physical train and waiting is counted by direction and platform',()=>{
 const m=setup(),line=METRO_LINES[0],plus=metroStationGeometry(line,0,1),minus=metroStationGeometry(line,0,-1);
 m.update(25);m.syncOccupancy([
  {alive:true,onTrain:true,metroLineId:line.id,metroTrainId:'M1-A',metroTrainDirection:1,x:0,z:0},
  {alive:true,onTrain:true,metroLineId:line.id,metroTrainId:'M1-A',metroTrainDirection:1,x:0,z:0},
  {alive:true,onTrain:true,metroLineId:line.id,metroTrainId:'M1-B',metroTrainDirection:-1,x:0,z:0},
  {alive:true,metroLineId:line.id,metroTrainDirection:1,transitStage:'platform-wait',x:plus.platform.x,z:plus.platform.z},
  {alive:true,metroLineId:line.id,metroTrainDirection:-1,transitStage:'platform-wait',x:minus.platform.x,z:minus.platform.z},
 ]);
 assert.ok(m.trains.find(t=>t.id==='M1-A')!.label.userData.text.endsWith('2 KHÁCH'));assert.ok(m.trains.find(t=>t.id==='M1-B')!.label.userData.text.endsWith('1 KHÁCH'));
 for(const station of m.stations.filter(s=>s.lineId==='M1'&&s.index===0))assert.ok(station.label.userData.text.endsWith('1 CHỜ'));
});

test('M7 rail beds align with the exact mitered station polyline in both directions',()=>{
 const line=METRO_LINES.find(l=>l.id==='M7')!,m=setup(),beam=m.infrastructure.children.find(o=>o instanceof THREE.InstancedMesh&&(o.material as THREE.MeshStandardMaterial).color.getHex()===0x6e7478) as THREE.InstancedMesh;
 const positions:THREE.Vector3[]=[];for(let i=0;i<beam.count;i++){const matrix=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();beam.getMatrixAt(i,matrix);matrix.decompose(p,q,scale);if(Math.abs(scale.y-.24)<1e-5&&Math.abs(scale.z-3.4)<1e-5)positions.push(p);}
 for(const direction of [1,-1]){const points=metroTrackPoints(line,direction);for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],middle=new THREE.Vector3((a.x+b.x)/2,line.height-.48,(a.z+b.z)/2);assert.ok(positions.some(p=>p.distanceTo(middle)<1e-4),`missing exact M7 rail bed ${direction}:${i}`);}}
});

test('interchange walkways include both source and destination directions',()=>{
 const paths=metroInterchangePaths();assert.ok(paths.length>0);for(const direction of [1,-1]){const line=METRO_LINES[0],index=line.points.findIndex(p=>p[0]===-102&&p[1]===0),platform=metroStationGeometry(line,index,direction).platform;assert.ok(paths.some(path=>Math.hypot(path[0].x-platform.x,path[0].z-platform.z,path[0].y-platform.y)<.01));}
});
