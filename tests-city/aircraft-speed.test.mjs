import test from'node:test';import assert from'node:assert/strict';import{PLAYER_FLIGHT_SPEED,AIRCRAFT_TIME_SCALE,aircraftPathTiming,timedAircraftPose}from'../worker/aircraft-speed.mjs';import{nextRegionalFlight,regionalFlightTiming,flightPose,scheduledAircraftFlights}from'../worker/aviation.mjs';import{visitorStands,visitorRunways,visitorRunwayTiming,visitorAircraftPose}from'../worker/visitor-aviation.mjs';
test('every newly planned commercial leg accelerates from player 1x speed toward 1.5x with slower ground movement',()=>{
 assert.equal(PLAYER_FLIGHT_SPEED,22);
 for(const from of ['city','north','island'])for(const to of ['city','north','island']){
  if(from===to)continue;const f=nextRegionalFlight(0,from,to,0);if(!f)continue;const path=regionalFlightTiming(f);
  for(let i=1;i<path.length;i++){const start=f.departure+path[i-1][0],end=f.departure+path[i][0],a=flightPose(start+(end-start)*.3,f),b=flightPose(start+(end-start)*.7,f),speed=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/(end-start)/.4*AIRCRAFT_TIME_SCALE;assert.ok(speed<=33.00001,`${from}-${to} leg ${i}: ${speed}`);if(i===6)assert.ok(Math.abs(speed-33)<1e-5);}
 }
 for(const airportId of ['city','north','island'])for(const sector of ['west','north','east'])for(const direction of [-1,1]){
  const stand=visitorStands(airportId)[0],f={motionVersion:2,airportId,arrivalStand:stand,standId:stand.id,sector,direction,runwayId:visitorRunways(airportId)[0].id,inboundAt:0,outboundAt:null,exitAt:null};const inbound=visitorRunwayTiming(f);f.parkedAt=inbound.duration;
  for(const outbound of [false,true]){if(outbound){f.outboundAt=f.parkedAt+3600;f.exitAt=f.outboundAt+visitorRunwayTiming(f,true).duration;}const path=visitorRunwayTiming(f,outbound).path,origin=outbound?f.outboundAt:0;
   for(let i=1;i<path.length;i++){const start=origin+path[i-1][0],end=origin+path[i][0];if(end-start<.001)continue;const a=visitorAircraftPose(start+(end-start)*.25,f),b=visitorAircraftPose(start+(end-start)*.75,f),speed=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/(end-start)*2*120;assert.ok(speed<=33.00001,`${airportId} ${sector} ${outbound} leg${i}: ${speed}`);}
  }
 }
});
test('slower overlapping Hawaii services keep all airborne aircraft visible until their actual arrival',()=>{
 const now=8*3600+8000,flights=scheduledAircraftFlights(now);assert.ok(flights.length>1);assert.ok(flights.every(f=>f.departure<=now&&f.arrival+900>now));assert.equal(new Set(flights.map(f=>f.id)).size,flights.length);
});

test('takeoff acceleration is continuous from22 toward33 rather than a speed jump',()=>{const p=aircraftPathTiming([[0,100,0],[1000,100,0]]),velocity=t=>{const a=timedAircraftPose(p,t*120),b=timedAircraftPose(p,(t+.01)*120);return(b.x-a.x)/.01;};assert.ok(velocity(0)>=22&&velocity(0)<22.1);assert.ok(velocity(6)>27&&velocity(6)<28);assert.ok(Math.abs(velocity(14)-33)<.001);});
