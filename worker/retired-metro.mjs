import {METRO_LINES,LOCATIONS,entrance,metroStationGeometry,pedestrianRoute,blocked} from './city-map.mjs';
import {repairMetroRoute} from './metro-planner.mjs';
const VERSION=1;
const retired={id:'M13',countryId:'hansdrex',height:35,points:[[50,-400],[122,-400],[122,-340]]};
/** Retire the airport spur without discarding residents, paid fares or an
 * occupied, unrelated train. A removed-line passenger leaves at its public exit. */
export function retireAirportMetro(state,{replanResident}={}){
 const result={replanned:0,alighted:0,unresolved:[]};if(state.airportSpurRetiredVersion>=VERSION)return result;
 for(const f of [...(state.flies||[]),...(state.cityVisitors?.visitors||[])]){
  if(f.alive===false||f.departed||f.onPlane||f.airTrip||f.countryAirTrip||f.privateFlight||f.heliPassenger||f.onPrivateHelicopter)continue;
  const old=f.routeWaypoints||[],index=Math.max(0,f.routeIndex||0);
  if(f.metroLineId!=='M13'&&!old.slice(index).some(p=>p.lineId==='M13'))continue;
  const site=LOCATIONS.find(l=>l.id===(f.targetLocationId||f.travelGoalId||f.homeId));
  const destination=Number.isFinite(f.finalTargetX)&&Number.isFinite(f.finalTargetZ)?{x:f.finalTargetX,z:f.finalTargetZ}:site?entrance(site):{x:f.homeX??f.x,z:f.homeZ??f.z};
  if(f.metroLineId!=='M13'&&(f.onTrain||Number(f.y??1.1)>2)){
   const exit=old.findIndex((p,i)=>i>=index&&p.stage==='station-exit'),repaired=exit<0?null:repairMetroRoute({...f,routeWaypoints:old.slice(0,exit+1)},destination);
   if(!repaired){result.unresolved.push(f.id);continue;}
   f.routeWaypoints=repaired.waypoints;f.routeIndex=0;if(f.onTrain)f.metroExitWaypoint=repaired.exitWaypoint;
   else{const p=repaired.waypoints[0];f.targetX=p.x;f.targetZ=p.z;f.transitMode=p.mode;f.transitStage=p.stage;}
   result.replanned++;continue;
  }
  if(f.onTrain||Number(f.y??1.1)>2){
   // The southern station is on public pavement. The other two were airside.
   const access=metroStationGeometry(retired,2,f.metroTrainDirection||1).access;
   if(blocked(access)){result.unresolved.push(f.id);continue;}
   Object.assign(f,access,{y:1.1,vx:0,vz:0,movementTrace:[]});result.alighted++;
  }
  const boardings=f.metroBoardingsThisTrip,chosen={id:f.targetLocationId||f.travelGoalId||f.homeId,action:f.pendingAction||'continuing after the airport spur closed'};
  Object.assign(f,{onTrain:false,metroLineId:null,metroTrainId:null,metroTrainDirection:null,metroExitWaypoint:null,metroExitIndex:null,metroPlatformCheckedAt:null,metroTrainCheckedAt:null,routeIndex:0,routeWaypoints:[],transitMode:'walk',transitStage:'sidewalk',traveling:false,indoors:false,currentLocationId:null,travelStuckTicks:0});
  if(replanResident&&chosen.id)replanResident(f,chosen);
  else{const route=pedestrianRoute(f,destination);f.routeWaypoints=route;f.traveling=Boolean(route.length);f.targetX=route[0]?.x??f.x;f.targetZ=route[0]?.z??f.z;}
  if(boardings!==undefined)f.metroBoardingsThisTrip=boardings;result.replanned++;
 }
 if(!result.unresolved.length)state.airportSpurRetiredVersion=VERSION;return result;
}
