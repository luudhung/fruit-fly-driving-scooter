import test from 'node:test';
import assert from 'node:assert/strict';
import {CityMotion,type MotionPlan} from '../src/city-motion.ts';
import {showResidentBody} from '../src/actor-transport.ts';
import {SceneViewBudget} from '../src/view-budget.ts';
import {selectResidentView} from '../src/airport-arrival-view.ts';
import {visitorStands,visitorArrivalPath,visitorArrivalMotion,visitorArrivalPose,visitorBoardingMotion,INBOUND_SECONDS} from '../worker/visitor-aviation.mjs';
const flight=(airportId:string)=>({id:'TEST-'+airportId,airportId,arrivalStand:visitorStands(airportId)[0],standId:visitorStands(airportId)[0].id,sector:'west',direction:1,inboundAt:0,parkedAt:INBOUND_SECONDS,outboundAt:null,exitAt:null});
const position=(m:CityMotion)=>({x:m.x,y:m.y,z:m.z});

test('airport pedestrians follow the exact authoritative timed walk at 20 and 120fps without waiting for another snapshot',()=>{
 for(const airport of ['city','north','island'])for(const index of [0,9]){
  const f=flight(airport),path=visitorArrivalPath(f,index),start=path[0].at+1,initial=visitorArrivalPose(start,f,index)!,plan=visitorArrivalMotion(start,f,index)!;
  const saved=JSON.stringify(f);
  for(const fps of [20,120]){
   const m=new CityMotion();m.accept(initial,plan);
   for(let now=start;now<path.at(-1)!.at+500;now+=120/fps){
    m.advance(1/fps,now);const expected=visitorArrivalPose(now,f,index)!;
    assert.ok(Math.hypot(m.x-expected.x,m.y-expected.y,m.z-expected.z)<1e-6,airport+':'+index+':'+now);
   }
   m.advance(1/fps,path.at(-1)!.at+86400);assert.deepEqual(position(m),{x:path.at(-1)!.x,y:1.1,z:path.at(-1)!.z});
  }
  assert.equal(JSON.stringify(f),saved,'render sampling cannot clear immigration or mutate the flight');
 }
});

test('scan pauses hold the actual kiosk position and refreshing a snapshot never rewinds a timed terminal walk',()=>{
 const f=flight('city'),path=visitorArrivalPath(f,0),scan=path.find(p=>p.stage==='scanning')!,cleared=path.find(p=>p.stage==='cleared')!,m=new CityMotion();
 m.accept(visitorArrivalPose(scan.at-60,f,0)!,visitorArrivalMotion(scan.at-60,f,0)!);
 for(const now of [scan.at+1,scan.at+200,cleared.at-1]){m.advance(.02,now);assert.deepEqual(position(m),{x:scan.x,y:scan.y,z:scan.z});}
 const at=cleared.at+120;m.advance(.02,at);const before=position(m);
 m.accept(visitorArrivalPose(scan.at+100,f,0)!,visitorArrivalMotion(scan.at+100,f,0)!);m.advance(.02,at);
 assert.deepEqual(position(m),before);assert.ok(m.z>scan.z,'a completed scan releases the walk to the exit');
});

test('terminal passengers remain visible and retain a body slot indoors while other indoor people and aircraft passengers stay hidden',()=>{
 const terminal={id:'terminal-1',alive:true,kind:'visitor',visitorPhase:'airport-arrival',indoors:true,onPlane:false,traveling:false,x:0,z:0,motion:{mode:'walk',timed:true}};
 assert.equal(showResidentBody(terminal),true);assert.equal(showResidentBody({...terminal,onPlane:true}),false);assert.equal(showResidentBody({...terminal,motion:null}),false);
 const residents=Array.from({length:10},(_,i)=>({id:'resident-'+i,alive:true,x:0,z:0}));
 const selected=selectResidentView([...residents,terminal],new SceneViewBudget(),f=>f,new Set(residents.map(f=>f.id)),10);
 assert.ok(selected.some(f=>f.id===terminal.id));assert.equal(selected.length,10);
});

test('boarding uses the reverse finite terminal walk and stops at the aircraft door before returning to airplane rendering',()=>{
 const f={...flight('north'),boardingStartedAt:50000},path=[...visitorArrivalPath(f,9)].reverse(),start=f.boardingStartedAt,plan=visitorBoardingMotion(start,f,9)!,m=new CityMotion();m.accept(path[0],plan);
 for(let i=1;i<path.length;i++){
  const at=start+path[0].at-path[i].at;m.advance(.02,at);assert.deepEqual(position(m),{x:path[i].x,y:path[i].y,z:path[i].z});
 }
 assert.equal(visitorBoardingMotion(plan.points.at(-1)!.at,f,9),null);
});

test('timed route validation rejects corrupt clocks and normal street movement replaces a finished terminal itinerary',()=>{
 const m=new CityMotion(),f=flight('city'),path=visitorArrivalPath(f,0),at=path[0].at;
 m.accept(path[0],visitorArrivalMotion(at,f,0)!);m.advance(.02,at+100);const before=position(m);
 const invalid={at:at+200,speed:1.8,mode:'walk',timed:true,points:[{x:0,z:0,at:20},{x:1,z:0,at:10}]} satisfies MotionPlan;
 m.accept({x:500,z:500},invalid);assert.deepEqual(position(m),before);
 m.accept({x:0,z:0},{at:at+300,speed:2,mode:'walk',points:[{x:10,z:0}]});m.advance(.1,at+312);assert.equal(m.z,0);assert.ok(m.x>0&&m.x<1);assert.equal(m.timed,false);
});
