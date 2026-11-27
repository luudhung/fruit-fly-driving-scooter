import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceRoadsideRecovery,roadsideRecoveryView} from '../worker/roadside-recovery.mjs';
import {createVehicleIndex} from '../worker/traffic.mjs';
import {motorwaySegmentAt,motorwayMedianBlocked} from '../worker/motorway.mjs';
import {countryAt,COUNTRY_IDS} from '../worker/country-map.mjs';
import {pedestrianRoute,clearSegment} from '../worker/city-map.mjs';
import {f1VisitorTravel,createF1Charters} from '../worker/north-f1-charters.mjs';
import {freshState,countries} from '../worker/civilization-engine.mjs';
const legacy=(id='LEGACY')=>({id,alive:true,kind:'visitor',x:-116.2,y:1.1,z:-1105.8,traveling:false,transitMode:'walk',rentalCar:true,vehicleHeading:-Math.PI/2,parkedCar:{id:'OWN-CURB',spaceId:'OWN-CURB',x:-114,z:-1063.45,heading:Math.PI/2},money:1446,savings:123,brain:{id:'KEEP-BRAIN'},leg:{key:'abandoned',index:0,needsRecoveryRoute:true,blocked:true,at:1}});

test('an abandoned charter car leg cannot project a phantom vehicle after the real car has been recovered',()=>{
 const f=legacy(),event={tourPaths:{abandoned:[{x:-260,y:1.1,z:-1105.8,mode:'car'}]}};
 const view=f1VisitorTravel(event,f,1000);assert.equal(view.traveling,false);assert.equal(view.transitMode,'walk');assert.equal(view.motion,null);assert.deepEqual(view.routeWaypoints,[]);
});

test('a stranded motorway owner follows a finite physical escort to a legal sidewalk, retaining its actual parked car and wallet through reload',()=>{
 let f=legacy(),s={simulationAgeSeconds:1000,timeScale:120},last={x:f.x,z:f.z};const identity=[f.id,f.brain.id,f.money,f.savings],car=structuredClone(f.parkedCar);
 assert.equal(advanceRoadsideRecovery(s,f),true);assert.deepEqual({x:f.x,z:f.z},last);assert.ok(roadsideRecoveryView(f,s.simulationAgeSeconds));
 let distance=0;
 for(let i=0;i<500&&f.roadsideRecovery;i++){
  s.simulationAgeSeconds+=120;advanceRoadsideRecovery(s,f,createVehicleIndex([f]));
  const step=Math.hypot(f.x-last.x,f.z-last.z);assert.ok(step<=1.800001);assert.equal(clearSegment(last,f),true);assert.equal(motorwayMedianBlocked(f),false);assert.equal(countryAt(f),COUNTRY_IDS.north);distance+=step;last={x:f.x,z:f.z};
  if(i===8)f=structuredClone(f);
 }
 assert.equal(f.roadsideRecovery,undefined);assert.ok(distance>30);assert.equal(motorwaySegmentAt(f),undefined);assert.ok(pedestrianRoute(f,f.parkedCar).length);
 assert.deepEqual([f.id,f.brain.id,f.money,f.savings],identity);assert.deepEqual(f.parkedCar,car);assert.equal(f.leg.needsRecoveryRoute,true);
});

test('twenty-one colocated motorway rescue guests drain with real headway while every recovered car keeps its own curb',()=>{
 const people=Array.from({length:21},(_,i)=>({...legacy('QUEUE-'+String(i).padStart(2,'0')),parkedCar:{id:'CAR-'+i,spaceId:'CAR-'+i,x:-180+i*6,z:-1063.45,heading:Math.PI/2}}));
 const s={simulationAgeSeconds:1000,timeScale:120};for(const f of people)advanceRoadsideRecovery(s,f);
 let ticks=0;const moved=new Set();
 for(;ticks<2000&&people.some(f=>f.roadsideRecovery);ticks++){
  s.simulationAgeSeconds+=120;const index=createVehicleIndex(people);
  for(const f of people){if(!f.roadsideRecovery)continue;const old={x:f.x,z:f.z};advanceRoadsideRecovery(s,f,index);if(Math.hypot(f.x-old.x,f.z-old.z)>.01)moved.add(f.id);}
 }
 assert.equal(moved.size,21);assert.ok(ticks<2000);assert.ok(people.every(f=>!f.roadsideRecovery));
 for(const [i,f]of people.entries()){assert.equal(f.parkedCar.x,-180+i*6);assert.equal(f.parkedCar.z,-1063.45);assert.equal(f.money,1446);assert.equal(f.savings,123);}
});

test('an escorted pedestrian blocks crossing vehicles while the owner’s separate parked car remains solid',()=>{
 const f={...legacy(),x:0,z:0,traveling:true,transitMode:'walk',roadsideRecovery:{points:[],index:0},targetX:0,targetZ:10,parkedCar:{x:50,z:0,heading:0}},index=createVehicleIndex([f]);
 const car={id:'PASSING',alive:true,x:-10,y:1.1,z:0,heading:Math.PI/2,vehicleHeading:Math.PI/2};
 assert.ok(index(car,{x:10,z:0})<10);assert.ok(index({...car,x:40},{x:60,z:0})<10);
});

test('legacy sideways overlapping motorway guests release one pedestrian at a time',()=>{
 const people=[legacy('SIDE-A'),legacy('SIDE-B')];people[1].x+=.5844;
 const s={simulationAgeSeconds:1000,timeScale:120};for(const f of people)advanceRoadsideRecovery(s,f);
 let ticks=0;
 for(;ticks<1000&&people.some(f=>f.roadsideRecovery);ticks++){
  s.simulationAgeSeconds+=120;const index=createVehicleIndex(people);
  for(const f of people)if(f.roadsideRecovery)advanceRoadsideRecovery(s,f,index);
 }
 assert.ok(ticks<1000);assert.ok(people.every(f=>!f.roadsideRecovery));
});

test('an old North motorway guest resumes its actual trip across a lawful checkpoint and reaches the Hansdrex terminal',()=>{
 const s=freshState(),brain=s.flies[0].brain;s.flies=[];s.simulationAgeSeconds=10*86400;
 const f={...legacy('REAL-RETURN'),brain,money:2000,savings:0,phase:'visiting',entryAirportId:'city',citizenshipCountryId:'outside',originCountryId:'outside',countryPresence:{countryId:'north-city',enteredAt:1,entryId:'OLD-NORTH-VISA'},arrivalFarePaid:200,departAt:1,touringUntil:1,checkedIn:true,currentLocationId:null};
 const plane={id:'OLD-COHORT',airportId:'city',landed:true,aircraftGone:true,inboundAt:1,parkedAt:1000,outboundAt:2000,exitAt:3000,guests:[f]};
 const e={id:'OLD-EVENT',format:2,status:'complete',tenPassengerVersion:1,airportItineraryVersion:1,startsAt:1,endsAt:2,charters:[plane],tourPaths:{abandoned:[{x:-260,y:1.1,z:-1105.8,mode:'car'}]}};
 s.northF1={event:e,previousTours:[],charterDepartures:0};const originalCar=structuredClone(f.parkedCar),id=brain.id;
 const svc=createF1Charters({world:()=>s,signature:()=>.5,weatherClosed:()=>false,movementBlocked:()=>false,intercept:(p,a,b,o)=>countries.interceptMovement(p,a,b,o),account:id=>s.businesses[id]||={cash:0}});
 let escaped=false,crossed=false;
 for(let i=0;i<4000&&!['airport-ready','boarding','return-flight'].includes(f.phase);i++){
  s.simulationAgeSeconds+=120;svc.tick(e);if(!motorwaySegmentAt(f))escaped=true;if(countryAt(f)==='hansdrex')crossed=true;
 }
 assert.ok(escaped);assert.ok(crossed);assert.ok(['airport-ready','boarding','return-flight'].includes(f.phase));assert.equal(f.brain.id,id);assert.equal(f.id,'REAL-RETURN');assert.ok(f.money>0);assert.deepEqual(f.parkedCar,null);
 assert.equal(originalCar.x,-114);assert.equal(originalCar.z,-1063.45);
 assert.ok(f.countryEntryReceipts?.some(r=>r.countryId==='hansdrex'||r.toCountryId==='hansdrex'),'the border was actually admitted instead of crossed invisibly: '+JSON.stringify(f.countryEntryReceipts));
});
