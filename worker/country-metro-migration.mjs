import {METRO_LINES,metroStationGeometry,pedestrianRoute,LOCATIONS,entrance} from './city-map.mjs';
import {countryAt} from './country-map.mjs';
export const COUNTRY_METRO_MIGRATION_VERSION=30;
export const LEGACY_INTERNATIONAL_METRO={
 M8:{height:27,points:[[-260,-1000],[-260,-950],[-260,-830],[-260,-710],[-430,-710],[-430,-600],[-430,-400],[-210,-400],[-210,-340]],northLineId:'M8',mainLineId:'M12',splitIndex:6},
 M10:{height:35,points:[[-80,-1000],[-80,-950],[-80,-830],[-80,-710],[50,-710],[50,-600],[50,-400],[122,-400],[122,-340]],northLineId:'M10',mainLineId:'M13',splitIndex:6},
};
export function mapLegacyMetroStation(lineId,index){const legacy=LEGACY_INTERNATIONAL_METRO[lineId];return legacy&&Number.isInteger(index)&&legacy.points[index]?{lineId:index<legacy.splitIndex?legacy.northLineId:legacy.mainLineId,index:index<legacy.splitIndex?index:index-legacy.splitIndex}:null;}

/** A cancelled international rail service alights passengers at a real retained
 * station in their present country. No visa or bank transfer is synthesized. */
export function migrateCountryMetroJourneys(state,{replanResident}={}){
 const result={replanned:0,alighted:0,unresolved:[]};
 if(Number(state.countryMetroMigrationVersion||0)>=COUNTRY_METRO_MIGRATION_VERSION)return result;
 for(const f of [...(state.flies||[]),...(state.cityVisitors?.visitors||[])]){
  if(f.alive===false||f.departed||f.onPlane||f.onPrivateHelicopter||f.heliPassenger||f.privateFlight||f.airTrip||f.militaryShipId||f.militaryFlightId||f.indoors&&!f.onTrain)continue;
  const remaining=(f.routeWaypoints||[]).slice(f.routeIndex||0),legacy=LEGACY_INTERNATIONAL_METRO[f.metroLineId]||remaining.map(p=>LEGACY_INTERNATIONAL_METRO[p.lineId]).find(Boolean);
  if(!legacy)continue;
  const destination=Number.isFinite(f.finalTargetX)&&Number.isFinite(f.finalTargetZ)?{x:f.finalTargetX,z:f.finalTargetZ}:entrance(LOCATIONS.find(l=>l.id===f.targetLocationId)||{x:f.homeX??f.x,z:f.homeZ??f.z});
  if(f.onTrain||Number(f.y||1.1)>2){
   const country=countryAt(f),lines=METRO_LINES.filter(l=>[legacy.northLineId,legacy.mainLineId].includes(l.id)&&l.countryId===country);
   const stations=lines.flatMap(line=>line.points.map((_,index)=>({line,index,geo:metroStationGeometry(line,index,f.metroTrainDirection||1)}))).sort((a,b)=>Math.hypot(a.geo.platform.x-f.x,a.geo.platform.z-f.z)-Math.hypot(b.geo.platform.x-f.x,b.geo.platform.z-f.z));
   if(!stations.length){result.unresolved.push(f.id);continue;}
   Object.assign(f,stations[0].geo.access,{y:1.1,vx:0,vz:0,movementTrace:[]});result.alighted++;
  }
  const boardings=f.metroBoardingsThisTrip,chosen={id:f.targetLocationId||f.travelGoalId||f.homeId,action:f.pendingAction||f.action||'continuing after a rail service change'};
  Object.assign(f,{onTrain:false,metroTrainId:null,metroTrainDirection:null,metroExitWaypoint:null,metroExitIndex:null,metroLineId:null,metroPlatformCheckedAt:null,metroTrainCheckedAt:null,routeIndex:0,routeWaypoints:[],transitMode:'walk',transitStage:'sidewalk',travelStuckTicks:0});
  if(replanResident&&chosen.id)replanResident(f,chosen);
  else{const route=pedestrianRoute(f,destination);f.routeWaypoints=route;f.traveling=Boolean(route.length);f.targetX=route[0]?.x??f.x;f.targetZ=route[0]?.z??f.z;}
  if(boardings!==undefined)f.metroBoardingsThisTrip=boardings;
  result.replanned++;
 }
 if(!result.unresolved.length)state.countryMetroMigrationVersion=COUNTRY_METRO_MIGRATION_VERSION;
 return result;
}
