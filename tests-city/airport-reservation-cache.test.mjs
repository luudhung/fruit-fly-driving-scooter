import test from 'node:test';
import assert from 'node:assert/strict';
import {visitorRunwayTiming,visitorStandReservation,visitorRunways,visitorStands} from '../worker/visitor-aviation.mjs';

test('viewing outbound movement does not evict the accepted inbound path or retain obsolete coordinates',()=>{
 const stand=visitorStands('city')[0],flight={airportId:'city',motionVersion:2,arrivalStand:stand,standId:stand.id,runwayId:visitorRunways('city')[0].id,sector:'west',direction:1};
 const inbound=visitorRunwayTiming(flight),outbound=visitorRunwayTiming(flight,true);
 for(let i=0;i<100;i++){assert.equal(visitorRunwayTiming(flight),inbound);assert.equal(visitorRunwayTiming(flight,true),outbound);}
 flight.inboundAt=100000;assert.equal(visitorRunwayTiming(flight),inbound,'absolute schedule changes do not change the relative geometric path');
 flight.arrivalStand={...stand,x:stand.x+30};const moved=visitorRunwayTiming(flight);assert.notEqual(moved,inbound);assert.equal(moved.path.at(-1)[1],stand.x+30);
 assert.equal(inbound.path.at(-1)[1],stand.x,'accepted old geometry is not mutated');
});

test('an available eastern stand selects a nearby eastern runway when slots are equally free',()=>{
 const stands=visitorStands('city'),target=stands.find(s=>s.id==='INTL-9'),occupied=stands.filter(s=>s!==target).map((stand,i)=>({id:'PARKED-'+i,airportId:'city',standId:stand.id,arrivalStand:stand,inboundAt:-100000,parkedAt:-99000,outboundAt:null,exitAt:null}));
 const reservation=visitorStandReservation(10000,occupied,'city',1000,{motionVersion:2,sector:'east',direction:1});
 assert.ok(reservation);assert.equal(reservation.stand.id,target.id);
 const runway=visitorRunways('city').find(r=>r.id===reservation.runwayId);assert.ok(runway.x>0,'the east apron does not make an unnecessary taxi trip across the entire airport');
});

test('rescheduling a held aircraft invalidates only its inbound geometric start',()=>{
 const stand=visitorStands('city')[0],flight={airportId:'city',motionVersion:2,arrivalStand:stand,standId:stand.id,runwayId:visitorRunways('city')[0].id,sector:'west',direction:1,inboundAt:1000,hold:{at:0,x:-1100,y:280,z:-640}};
 const before=visitorRunwayTiming(flight),outbound=visitorRunwayTiming(flight,true);flight.inboundAt+=1800;
 const after=visitorRunwayTiming(flight);assert.notEqual(after,before);assert.notDeepEqual(after.path[0].slice(1,4),before.path[0].slice(1,4));assert.equal(visitorRunwayTiming(flight,true),outbound);
});
