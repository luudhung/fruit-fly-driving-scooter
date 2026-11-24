import test from'node:test';import assert from'node:assert/strict';
import {airportImmigrationLayout,passengerImmigrationGate,IMMIGRATION_SERVICE_SECONDS}from'../worker/airport-immigration.mjs';
import {visitorStands,visitorArrivalPath,visitorArrivalCompleteAt,visitorArrivalPose,visitorDeparturePath,visitorDepartureCompleteAt,visitorBoardingPose,INBOUND_SECONDS}from'../worker/visitor-aviation.mjs';
test('ten identified arrivals use shared terminal gates and finish only after their own scan and exit',()=>{
 for(const airportId of ['city','north','island']){
  const stand=visitorStands(airportId)[0],f={airportId,arrivalStand:stand,standId:stand.id,sector:'west',direction:1,inboundAt:0,parkedAt:INBOUND_SECONDS,outboundAt:null,exitAt:null};
  const ends=[];
  for(let i=0;i<10;i++){
   const gate=passengerImmigrationGate(airportId,i),path=visitorArrivalPath(f,i),scan=path.find(p=>p.stage==='scanning'),cleared=path.find(p=>p.stage==='cleared');
   assert.equal(scan.kioskId,gate.id);assert.ok(Math.abs(cleared.at-scan.at-IMMIGRATION_SERVICE_SECONDS)<1e-6);assert.equal(visitorArrivalPose(scan.at+1,f,i).indoors,true);assert.equal(visitorArrivalPose(scan.at+1,f,i).phase,'immigration');ends.push(path.at(-1).at);
  }
  assert.equal(visitorArrivalCompleteAt(f,10),Math.max(...ends));assert.equal(airportImmigrationLayout(airportId).gates.length,airportId==='city'?8:airportId==='north'?4:2);
 }
});

test('open immigration lanes admit the first passenger without artificial pauses; later passengers never overlap a scan',()=>{
 for(const airportId of ['city','north','island']){
  const stand=visitorStands(airportId)[0],f={airportId,arrivalStand:stand,standId:stand.id,parkedAt:INBOUND_SECONDS};
  const lanes=new Map();
  for(let i=0;i<30;i++){
   const path=visitorArrivalPath(f,i),scan=path.find(p=>p.stage==='scanning'),clear=path.find(p=>p.stage==='cleared'),queues=path.filter(p=>p.stage==='queue');
   if(i<airportImmigrationLayout(airportId).gates.length)assert.equal(queues.length,1,'an empty lane has no invented waiting period');
   const previous=lanes.get(scan.kioskId);if(previous)assert.ok(scan.at>=previous.at-1e-6,'one person per scan lane');lanes.set(scan.kioskId,clear);
  }
 }
});


test('all four terminals admit arrivals downstairs, transfer free to T1, and board departures through upstairs check-in',()=>{
 for(const terminalId of ['T1','T2','T3','T4']){
  const stand=visitorStands('city').find(s=>s.terminalId===terminalId),flight={airportId:'city',terminalId,motionVersion:2,arrivalStand:stand,standId:stand.id,parkedAt:100000,inboundAt:0,boardingStartedAt:200000,outboundAt:null,exitAt:null};
  assert.ok(stand,terminalId);const saved=JSON.stringify(flight),ends=[];
  for(let i=0;i<10;i++){
   const gate=passengerImmigrationGate('city',i,terminalId),arrivals=visitorArrivalPath(flight,i),departure=visitorDeparturePath(flight,i);
   assert.equal(arrivals.find(p=>p.stage==='scanning').kioskId,gate.id);
   assert.ok(arrivals.filter(p=>p.phase==='immigration').every(p=>p.y===1.1),'all arrivals processing stays on floor 1');
   assert.ok(departure.some(p=>p.stage==='departure-check-in'&&p.y===6.52),'departures check in on floor 2');
   assert.ok(departure.some(p=>p.stage==='departure-security'&&p.y===6.52));
   assert.equal(departure[0].x,-180);assert.equal(departure[0].z,-378);
   const door=departure.at(-1);assert.equal(door.x,stand.x-1.4);assert.equal(door.z,stand.z+4);assert.equal(door.y,3.4);
   for(const path of [arrivals,departure])assert.ok(path.every((p,j)=>!j||p.at>=path[j-1].at),'durable itinerary times never reverse');
   assert.equal(visitorBoardingPose(door.at-1,flight,i).onPlane,false);assert.equal(visitorBoardingPose(door.at+1,flight,i).onPlane,true);ends.push(door.at);
   if(terminalId!=='T1')for(const path of [arrivals,departure]){assert.ok(path.some(p=>p.stage==='terminal-train-board'));assert.ok(path.filter(p=>p.lineId==='HCA-FREE').every(p=>p.fare===0));}
  }
  assert.equal(visitorDepartureCompleteAt(flight,10),Math.max(...ends));assert.equal(JSON.stringify(flight),saved,'render/itinerary lookup cannot mutate paid flights');
 }
});

test('saved flights without a terminal assignment retain the original T1 ground-floor itinerary',()=>{
 const stand=visitorStands('city')[0],flight={airportId:'city',arrivalStand:stand,standId:stand.id,parkedAt:100000,boardingStartedAt:200000};
 const arrival=visitorArrivalPath(flight),departure=visitorDeparturePath(flight);
 assert.ok(arrival.every(p=>p.y===1.1||p.y===3.4));assert.ok(departure.every(p=>p.y===1.1||p.y===3.4));assert.equal(arrival.at(-1).x,-180);assert.equal(arrival.at(-1).z,-378);
});
