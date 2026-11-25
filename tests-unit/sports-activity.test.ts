import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SPORTS_ACTIVITY_VENUES} from '../worker/sports-venues.mjs';
import type {SportParticipant,SportsLuxurySnapshot} from '../worker/sports-luxury.mjs';
import {sportsActivities,sportsBallPose} from '../src/sports-activity.ts';
import {SportsLuxuryRenderer} from '../src/sports-luxury-renderer.ts';

const player=(id:string,venueId:string,slot:number,kind='tennis'):SportParticipant=>({id,venueId,slot,kind,role:'player',startsAt:100,until:2000});
const snapshot=(participants:SportParticipant[])=>({participants,pads:[],helicopters:[],match:null} as unknown as SportsLuxurySnapshot);
const position=(mesh:THREE.InstancedMesh,i:number)=>{const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);return new THREE.Vector3().setFromMatrixPosition(matrix);};

test('six tennis courts keep their own rallies in the real country and never turn spectators into players',()=>{
 const participants=[...Array.from({length:4},(_,i)=>player(`EU-${i}`,'tennis',i)),...Array.from({length:16},(_,i)=>player(`N-${i}`,'north-tennis',i))];
 const groups=sportsActivities([...participants,{...player('AUDIENCE','north-tennis',0),role:'spectator'},participants[0]]);
 assert.equal(groups.length,6);assert.equal(groups.reduce((n,g)=>n+g.players.length,0),20);
 const north=SPORTS_ACTIVITY_VENUES.find(v=>v.id==='north-tennis')!;
 for(let now=100;now<2000;now+=23)for(const group of groups){
  const pose=sportsBallPose(group,now)!;assert.ok(pose);
  assert.ok(Math.abs(pose.x-group.field.x)<group.field.w/2);assert.ok(Math.abs(pose.z-group.field.z)<group.field.d/2);
  if(group.venue.id==='north-tennis')assert.ok(north.courts!.some(c=>Math.abs(pose.x-c.x)<c.w/2&&Math.abs(pose.z-c.z)<c.d/2));
 }
 for(const group of groups){assert.equal(sportsBallPose(group,99),null);assert.equal(sportsBallPose(group,2000),null);}
 const sameSide=sportsActivities([player('A','north-tennis',0),player('B','north-tennis',2)])[0];assert.equal(sportsBallPose(sameSide,200),null);
});

test('North golf and football balls remain on their fields and require actual current participants',()=>{
 const participants=[player('G','north-golf',0,'golf'),player('F1','north-football',0,'football'),player('F2','north-football',1,'football')];
 const groups=sportsActivities(participants);assert.equal(groups.length,2);
 for(let now=100;now<2000;now+=13)for(const group of groups){const pose=sportsBallPose(group,now)!;assert.ok(pose);assert.ok(Math.abs(pose.x-group.field.x)<group.field.w/2);assert.ok(Math.abs(pose.z-group.field.z)<group.field.d/2);}
 const football=groups.find(g=>g.kind==='football')!;football.players[1].until=500;assert.equal(sportsBallPose(football,500),null);
 assert.equal(sportsActivities([{...participants[0],slot:1000},{...participants[1],venueId:'missing'}, {...participants[2],role:'spectator'}]).length,0);
});

test('renderer draws North activity in one bounded batch, culls distant balls and resumes casual football after a World Cup',()=>{
 const scene=new THREE.Group(),renderer=new SportsLuxuryRenderer(scene);
 const players=[player('A','north-tennis',0),player('B','north-tennis',1),player('G','north-golf',0,'golf')];
 renderer.sync(snapshot(players));renderer.update(.016,200);
 const balls=scene.getObjectByName('sports-activity-balls') as THREE.InstancedMesh;assert.equal(balls.count,2);
 const before=position(balls,0);assert.ok(before.x<0&&before.z<0);renderer.update(.016,220);assert.ok(before.distanceTo(position(balls,0))>1);
 renderer.update(.016,2000);assert.equal(balls.count,0);
 renderer.sync(snapshot(players));renderer.update(.016,200);assert.equal(balls.count,2,'a repeated empty helipad signature must not skip new sports data');
 const camera=new THREE.PerspectiveCamera(60,1,.1,3000);camera.position.set(10000,100,10000);camera.lookAt(10100,0,10000);renderer.setView(camera);renderer.update(.016,200);assert.equal(balls.count,0);
 renderer.syncWorldCup({id:'past-cup',startsAt:0,endsAt:100,status:'finished',score:[1,0],players:22});
 renderer.sync({...snapshot([]),match:{id:'local-match',startsAt:150,endsAt:500,players:['P1','P2'],spectators:[],score:[0,0]}});renderer.update(.016,200);
 const football=(renderer as unknown as {ball:THREE.Mesh}).ball;assert.equal(football.visible,true);
 let lights=0;scene.traverse(o=>{if(o instanceof THREE.Light)lights++;});assert.equal(lights,0);assert.equal(balls.instanceMatrix.count,9);
});
