import test from'node:test';import assert from'node:assert/strict';
import {airportImmigrationLayout,passengerImmigrationGate,IMMIGRATION_SERVICE_SECONDS}from'../worker/airport-immigration.mjs';
import {visitorStands,visitorArrivalPath,visitorArrivalCompleteAt,visitorArrivalPose,INBOUND_SECONDS}from'../worker/visitor-aviation.mjs';
test('ten identified arrivals use shared terminal gates and finish only after their own scan and exit',()=>{
 for(const airportId of ['city','north','island']){
  const stand=visitorStands(airportId)[0],f={airportId,arrivalStand:stand,standId:stand.id,sector:'west',direction:1,inboundAt:0,parkedAt:INBOUND_SECONDS,outboundAt:null,exitAt:null};
  const ends=[];
  for(let i=0;i<10;i++){
   const gate=passengerImmigrationGate(airportId,i),path=visitorArrivalPath(f,i),scan=path.find(p=>p.stage==='scanning'),cleared=path.find(p=>p.stage==='cleared');
   assert.equal(scan.kioskId,gate.id);assert.equal(cleared.at-scan.at,IMMIGRATION_SERVICE_SECONDS);assert.equal(visitorArrivalPose(scan.at+1,f,i).indoors,true);assert.equal(visitorArrivalPose(scan.at+1,f,i).phase,'immigration');ends.push(path.at(-1).at);
  }
  assert.equal(visitorArrivalCompleteAt(f,10),Math.max(...ends));assert.equal(airportImmigrationLayout(airportId).gates.length,airportId==='city'?8:airportId==='north'?4:2);
 }
});
