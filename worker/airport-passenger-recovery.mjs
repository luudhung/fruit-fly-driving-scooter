import {airportById} from './aviation.mjs';
import {airportTerminalForStand} from './airport-campus.mjs';
import {airportTerminalPassengerLayout} from './airport-terminal-layout.mjs';
import {visitorStands,visitorDeparturePath} from './visitor-aviation.mjs';
import {fundHansdrexRepatriation} from './hansdrex-airline.mjs';
export function recoverAirportPassenger(state,f,flight){
  const now=()=>Number(state.simulationAgeSeconds||0),scale=()=>Math.max(1,Number(state.timeScale||120)),HOUR=3600;
  if(f.alive===false||!['stranded','repatriation-walk','repatriation-funding'].includes(f.phase))return false;
  const port=airportById(f.departureAirportId||f.entryAirportId||flight.airportId||'city');
  if(!f.repatriationWalk&&f.phase!=='repatriation-funding'){
   f.missedReturnFlightId||=flight.returnLeg?.id;
   const stand=visitorStands(port.id).sort((a,b)=>Math.hypot(f.x-a.x,f.z-a.z)-Math.hypot(f.x-b.x,f.z-b.z))[0];if(!stand)return true;
   const t=port.id==='city'?airportTerminalForStand(stand):null,upper=t&&airportTerminalPassengerLayout(t).landside.upperEntrance;
   const plan={airportId:port.id,arrivalStand:stand,standId:stand.id,terminalId:t?.id,boardingStartedAt:0,parkedAt:0,inboundAt:0,sector:'west',direction:1,departurePathVersion:2,
    ...(upper?{departureEntrances:{0:{terminalId:t.id,...upper}}}:{} )};
   const path=visitorDeparturePath(plan,0,scale());if(!path.length)return true;
   let nearest={distance:Infinity,index:0,point:path[0]};
   for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length=dx*dx+dy*dy+dz*dz;if(length<1e-8)continue;const u=Math.max(0,Math.min(1,((f.x-a.x)*dx+((f.y??1.1)-a.y)*dy+(f.z-a.z)*dz)/length)),point={x:a.x+dx*u,y:a.y+dy*u,z:a.z+dz*u},distance=Math.hypot(f.x-point.x,(f.y??1.1)-point.y,f.z-point.z);if(distance<nearest.distance)nearest={distance,index:i-1,point};}
   const points=[{x:f.x,y:f.y??1.1,z:f.z},nearest.point,...path.slice(0,nearest.index+1).reverse()];let at=now();
   f.repatriationWalk={terminalId:t?.id,points:points.map((p,i)=>{if(i)at+=Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y,p.z-points[i-1].z)/1.8*scale();return{x:p.x,y:p.y,z:p.z,at};})};
   f.phase='repatriation-walk';f.onPlane=false;f.traveling=false;f.currentLocationId=null;
  }
  const walk=f.repatriationWalk;
  if(walk){
   const path=walk.points,end=path.at(-1),i=path.findIndex(p=>p.at>now());let pose=end;
   if(i===0)pose=path[0];else if(i>0){const a=path[i-1],b=path[i],u=(now()-a.at)/Math.max(1,b.at-a.at);pose={x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u};}
   Object.assign(f,{x:pose.x,y:pose.y,z:pose.z,onPlane:false,indoors:pose.y>4,traveling:now()<end.at,motion:now()<end.at?{at:now(),speed:1.8,mode:'walk',timed:true,points:path}:null,action:'walking back to the terminal for a replacement return ticket'});
   if(now()<end.at)return true;
   f.currentLocationId=port.locationId;f.phase='repatriation-funding';f.traveling=false;
   if(walk.terminalId)f.airportDepartureEntrance={terminalId:walk.terminalId,x:f.x,y:f.y,z:f.z};delete f.repatriationWalk;
  }
  if(now()<Number(f.repatriationRetryAt||0))return true;
  if(f.legacyAirlineContract||fundHansdrexRepatriation(state,f)){f.phase='airport-ready';f.action='waiting for a replacement return flight';delete f.repatriationRetryAt;}
  else{f.repatriationRetryAt=now()+HOUR;f.action='waiting safely inside the terminal for repatriation funding';}
  return true;
 }

/** A late change of a prepared aircraft's bay changes only the remaining
 * airside walk, starting at the person's actual coordinates. */
export function rerouteAirportBoarding(state,plane,oldStand,people){
 if(!plane.preboarding||!oldStand||oldStand.id===plane.arrivalStand?.id)return;
 const port=airportById(plane.airportId||'city'),stand=plane.arrivalStand;if(!stand)return;
 const now=Number(state.simulationAgeSeconds||0),scale=Math.max(1,Number(state.timeScale||120));
 const terminal=port.id==='city'?airportTerminalForStand(stand):null,front=terminal?airportTerminalPassengerLayout(terminal).airside.apron.z:port.terminal.z;
 for(const [index,id] of (plane.boardingGuestIds||plane.passengerIds||[]).entries()){
  const f=people.find(p=>p.id===id);if(!f||f.onPlane||f.y>4||f.z>port.terminal.z-port.terminal.d/2)continue;
  const points=[{x:f.x,y:f.y??1.1,z:f.z,stage:'departure-reassigned-bay'}];
  if((f.y??1.1)>1.2)points.push({x:oldStand.x-6,y:1.1,z:oldStand.z+4,stage:'departure-boarding-stairs'});
  points.push({x:points.at(-1).x,y:1.1,z:front,stage:'departure-apron'},
   {x:stand.x-6,y:1.1,z:front,stage:'departure-apron'},
   {x:stand.x-6,y:1.1,z:stand.z+4,stage:'departure-boarding-stairs'},
   {x:stand.x-1.4,y:3.4,z:stand.z+4,stage:'departure-aircraft-door'});
  let at=now;const path=points.map((p,i)=>{if(i)at+=Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y,p.z-points[i-1].z)/1.8*scale;return{...p,at};});
  (plane.boardingReroutes||={})[index]=path;
 }
 plane.boardingRerouteVersion=Number(plane.boardingRerouteVersion||0)+1;
}
