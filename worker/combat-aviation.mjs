const HANS='hansdrex',NORTH='north-city';
export const COMBAT_AIRCRAFT_PRICE=900,COMBAT_BOMB_PRICE=35,COMBAT_SORTIE_FUEL=20;
export const COMBAT_AIRCRAFT_PADS=Object.freeze([
 {id:'HANS-UAV-WEST',countryId:HANS,facilityId:'military-base',x:625,y:1.1,z:-700},
 {id:'HANS-UAV-EAST',countryId:HANS,facilityId:'military-base',x:795,y:1.1,z:-700},
 {id:'NORTH-UAV-1',countryId:NORTH,facilityId:'north-army',x:330,y:1.1,z:-1040},
].map(Object.freeze));
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0)),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),live=f=>f?.alive&&!f.departed;
const blend=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
/** Exact persisted flight times and the same piecewise trajectory on server/viewer. */
export function combatAircraftPose(now,aircraft){
 const pad=COMBAT_AIRCRAFT_PADS.find(p=>p.id===aircraft.padId)||aircraft.pad,flight=aircraft.flight;
 if(!pad)return null;
 if(!flight)return{x:pad.x,y:pad.y,z:pad.z,heading:0,phase:aircraft.destroyed?'destroyed':'parked',airborne:false};
 if(flight.returning){const r=flight.returning,u=clamp((now-r.at)/Math.max(1,r.arrivesAt-r.at)),mid={x:pad.x,y:Math.max(12,r.from.y),z:pad.z};const p=u<.72?blend(r.from,mid,u/.72):blend(mid,pad,(u-.72)/.28);return{...p,heading:Math.atan2(pad.x-r.from.x,pad.z-r.from.z),phase:u>=1?'parked':'returning',airborne:u<1&&p.y>pad.y+1};}
 const target=flight.target,cruise=flight.cruiseHeight||130,up={x:pad.x,y:cruise,z:pad.z},above={x:target.x,y:cruise,z:target.z},back={x:pad.x,y:cruise,z:pad.z};
 const points=[{at:flight.departure,p:pad,phase:'prepared'},{at:flight.liftAt,p:up,phase:'takeoff'},{at:flight.releaseAt,p:above,phase:'ingress'},{at:flight.returnAt,p:{x:target.x+20,y:cruise,z:target.z+15},phase:'bombing-run'},{at:flight.approachAt,p:back,phase:'returning'},{at:flight.arrival,p:pad,phase:'landing'}];
 if(now<flight.departure)return{...pad,heading:Math.atan2(target.x-pad.x,target.z-pad.z),phase:'prepared',airborne:false};
 if(now>=flight.arrival)return{...pad,heading:0,phase:'parked',airborne:false};
 const index=points.findIndex((p,i)=>i>0&&now<p.at),a=points[index-1],b=points[index],u=clamp((now-a.at)/Math.max(1,b.at-a.at)),p=blend(a.p,b.p,u),heading=Math.atan2(b.p.x-a.p.x,b.p.z-a.p.z);
 return{...p,heading:Number.isFinite(heading)?heading:0,phase:b.phase,airborne:p.y>pad.y+1};
}

/** Uncrewed aircraft have actual paid assets and an existing on-site army
 * operator. The operator stays on the ground and is never a phantom pilot. */
export function createCombatAviation({world,international,actors,buildings,countryAt,event=()=>{},remember=()=>{},random=()=>.5,releaseBomb=()=>false}){
 const now=()=>Number(world().simulationAgeSeconds||0),scale=()=>Math.max(1,Number(world().timeScale||120)),data=()=>{const d=world().nationalDefense;d.combatAircraft||=[];d.nextCombatFlightId||=1;d.combatSorties||=0;d.bombsReleased||=0;d.combatProcurementPaid||=0;return d;};
 const supplier=()=>{world().businesses||={};return world().businesses['national-defense-supplies']||={cash:0,inventory:0,sector:'defense-equipment'};};
 function pay(country,amount){const a=international.countryAccount(country);if(Number(a?.cash||0)<amount)return false;a.cash-=amount;supplier().cash+=amount;world().totalTransactions=Number(world().totalTransactions||0)+1;data().combatProcurementPaid+=amount;return true;}
 function operatorReady(f,country){if(!live(f)||f.publicServiceRole!=='army'||(f.publicServiceCountryId||f.citizenshipCountryId)!==country||f.traveling||f.onTrain||f.onPlane||f.onPrivateHelicopter||f.heliPassenger||f.health<=35||f.energy<=15)return false;
  const site=buildings().find(b=>b.id===(country===HANS?'military-base':'north-army'));
  const inside=site&&Math.abs(f.x-site.x)<=site.w/2+6&&Math.abs(f.z-site.z)<=site.d/2+6;
  const drill=country===HANS?{x:710,z:-625}:{x:270,z:-995};return Boolean(inside||distance(f,drill)<85||COMBAT_AIRCRAFT_PADS.some(p=>p.countryId===country&&distance(f,p)<32));
 }
 function operator(country,except=[]){return actors().filter(f=>operatorReady(f,country)&&!except.includes(f.id)).sort((a,b)=>Number(b.professionSkills?.droneControl||0)-Number(a.professionSkills?.droneControl||0)||a.id.localeCompare(b.id))[0];}
 function targets(country){return buildings().filter(b=>countryAt(b)===country&&!['collapsed','cleared','construction'].includes(b.stage)&&(/military|north-army|north-police/.test(b.id))).sort((a,b)=>((a.id.includes('hangar')?-3:a.id==='north-army'?-2:a.id==='military-base'?-1:0)-(b.id.includes('hangar')?-3:b.id==='north-army'?-2:b.id==='military-base'?-1:0))||a.id.localeCompare(b.id));}
 function beginReturn(frame,reason){const f=frame.flight;if(!f||f.returning)return;const pose=combatAircraftPose(now(),frame);if(!pose?.airborne&&now()<f.departure){frame.flight=null;event('combat_sortie_cancelled',{aircraftId:frame.id,flightId:f.id,reason});return;}
  f.returning={at:now(),from:{x:pose.x,y:pose.y,z:pose.z},arrivesAt:now()+10*scale(),reason};
  international.requestAirClearance?.({flightId:f.id,operatorCountryId:frame.countryId,countries:[HANS,NORTH],kind:'military-return'});event('combat_return',{aircraftId:frame.id,flightId:f.id,reason,x:pose.x,y:pose.y,z:pose.z});
 }
 function tick(conflict){const d=data();
  for(const frame of d.combatAircraft){const f=frame.flight;if(!f||frame.destroyed)continue;const pilot=actors().find(a=>a.id===f.operatorId);
   if((!conflict||conflict.id!==f.conflictId||!operatorReady(pilot,frame.countryId))&&!f.returning)beginReturn(frame,!conflict?'ceasefire':'ground operator unavailable');
   const current=frame.flight;if(!current)continue;
   if(!current.returning&&conflict?.id===current.conflictId){for(let index=0;index<current.bombLoad;index++){
     const at=current.releaseAt+index*2*scale();if(current.released.includes(index)||now()<at||frame.bombs<1)continue;
     const pose=combatAircraftPose(at,frame),skill=Number(pilot?.professionSkills?.droneControl||0),hit=clamp(random(pilot))<.68+Math.min(.2,skill*.2),angle=clamp(random(pilot))*Math.PI*2,offset=hit?0:24+clamp(random(pilot))*36,to={x:current.target.x+Math.cos(angle)*offset,y:1.1,z:current.target.z+Math.sin(angle)*offset};
     const roof=buildings().find(b=>Math.abs(to.x-b.x)<=b.w/2&&Math.abs(to.z-b.z)<=b.d/2);if(roof)to.y=Math.min(pose.y-1,Math.max(1.1,Number(roof.h||1)));
     const bomb={aircraftId:frame.id,flightId:current.id,conflictId:current.conflictId,countryId:frame.countryId,operatorId:current.operatorId,from:{x:pose.x,y:pose.y-1,z:pose.z},to,releasedAt:at,fallSeconds:clamp(Math.sqrt(Math.max(1,pose.y-to.y)*2/9.81),3,6),plannedHit:hit,targetBuildingId:current.target.id};
     if(!releaseBomb(bomb))continue;frame.bombs--;current.released.push(index);d.bombsReleased++;pilot.professionSkills||={};pilot.professionSkills.droneControl=clamp(skill+.015);remember(pilot,'combat_uav_release',{aircraftId:frame.id,flightId:current.id,targetBuildingId:current.target.id,plannedHit:hit});event('bomb_release',{...bomb,x:bomb.from.x,y:bomb.from.y,z:bomb.from.z});
   }}
   const arrived=current.returning?now()>=current.returning.arrivesAt:now()>=current.arrival;
   if(arrived){frame.flight=null;frame.sorties++;event('combat_landing',{aircraftId:frame.id,flightId:current.id,operatorId:current.operatorId,x:frame.pad.x,y:frame.pad.y,z:frame.pad.z});}
  }
  if(!conflict)return;
  for(const [index,pad]of COMBAT_AIRCRAFT_PADS.entries()){
   if(![conflict.fromCountryId,conflict.toCountryId].includes(pad.countryId))continue;
   let frame=d.combatAircraft.find(a=>a.padId===pad.id);if(frame?.destroyed||frame?.flight||frame?.lastConflictId===conflict.id)continue;
   const occupied=d.combatAircraft.filter(a=>a.flight).map(a=>a.flight.operatorId),control=operator(pad.countryId,occupied);if(!control)continue;
   const enemy=pad.countryId===conflict.fromCountryId?conflict.toCountryId:conflict.fromCountryId,candidates=targets(enemy);if(!candidates.length)continue;
   const target=candidates[index%candidates.length],bombsNeeded=Math.max(0,2-Number(frame?.bombs||0)),due=(frame?0:COMBAT_AIRCRAFT_PRICE)+bombsNeeded*COMBAT_BOMB_PRICE+COMBAT_SORTIE_FUEL;
   if(!pay(pad.countryId,due))continue;
   if(!frame){frame={id:`COMBAT-${pad.id}`,padId:pad.id,pad:{x:pad.x,y:pad.y,z:pad.z},countryId:pad.countryId,owned:true,bombs:0,sorties:0,procurementPaid:COMBAT_AIRCRAFT_PRICE,destroyed:false,flight:null};d.combatAircraft.push(frame);}
   frame.bombs+=bombsNeeded;frame.procurementPaid+=bombsNeeded*COMBAT_BOMB_PRICE+COMBAT_SORTIE_FUEL;frame.lastConflictId=conflict.id;
   const departure=now()+(index%2)*2*scale(),id=`COMBAT-FLIGHT-${d.nextCombatFlightId++}`;
   frame.flight={id,conflictId:conflict.id,operatorId:control.id,departure,liftAt:departure+4*scale(),releaseAt:departure+14*scale(),returnAt:departure+18*scale(),approachAt:departure+29*scale(),arrival:departure+33*scale(),cruiseHeight:130+(index%2)*16,bombLoad:Math.min(2,frame.bombs),released:[],target:{id:target.id,x:target.x,z:target.z}};
   d.combatSorties++;remember(control,'combat_uav_control',{aircraftId:frame.id,flightId:id,padId:pad.id,targetBuildingId:target.id});event('combat_takeoff',{aircraftId:frame.id,flightId:id,operatorId:control.id,countryId:pad.countryId,x:pad.x,y:pad.y,z:pad.z});
  }
 }
 function getAircraft(){return data().combatAircraft.filter(a=>!a.destroyed&&a.flight).flatMap(frame=>{const pose=combatAircraftPose(now(),frame);return pose?.airborne?[{...pose,id:frame.id,flightId:frame.flight.id,kind:'plane',militaryCombat:true,conflictId:frame.flight.conflictId,ownerCountryId:frame.countryId,occupantIds:[],operatorIds:[frame.flight.operatorId],airborne:true}]:[];});}
 function crash(id,details){const frame=data().combatAircraft.find(a=>a.id===id&&!a.destroyed&&a.flight?.id===details.flightId);if(!frame)return false;const pose=combatAircraftPose(now(),frame);frame.destroyed=true;frame.destroyedAt=now();frame.crashPoint={x:pose.x,y:pose.y,z:pose.z};frame.flight=null;frame.bombs=0;event('combat_uav_destroyed',{aircraftId:id,flightId:details.flightId,operatorIds:details.operatorIds||[],x:pose.x,y:pose.y,z:pose.z});return true;}
 function onPeace(){for(const a of data().combatAircraft)if(a.flight&&!a.destroyed)beginReturn(a,'ceasefire');}
 function predict(id,at){const frame=data().combatAircraft.find(a=>a.id===id);return frame?combatAircraftPose(at,frame):null;}
 function snapshot(){const d=data();return{aircraft:d.combatAircraft.filter(a=>a.owned).slice(0,3).map(a=>({...a,pad:{...a.pad},flight:a.flight?{...a.flight,target:{...a.flight.target},released:[...a.flight.released],returning:a.flight.returning?{...a.flight.returning,from:{...a.flight.returning.from}}:undefined}:null,pose:combatAircraftPose(now(),a)})),sorties:d.combatSorties,bombsReleased:d.bombsReleased,procurementPaid:d.combatProcurementPaid};}
 return{tick,getAircraft,crash,onPeace,predict,snapshot};
}
