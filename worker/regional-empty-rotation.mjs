import {BUILDINGS,urbanGeometryRevision} from './city-map.mjs';
import {airportById,nextRegionalFlight,regionalRunwayWindow} from './aviation.mjs';
import {aircraftPathTiming,timedAircraftPose} from './aircraft-speed.mjs';
const days=new Map(),geometry=new Map(),GAP=120;
const key=f=>[f.from,f.to,f.departure,f.arrival].join('|');
function departureGeometry(id){
 const geometryKey=id+'|'+urbanGeometryRevision;if(geometry.has(geometryKey))return geometry.get(geometryKey);
 const p=airportById(id),stand=p.stands.at(-1),strips=p.runways?.length?p.runways:[p.runway];let best;
 for(const r of strips){const vertical=r.d>r.w,half=(vertical?r.d:r.w)/2-24,along=vertical?r.z:r.x,cross=vertical?r.x:r.z,taxi=vertical?cross+26:(p.taxiwayZ??cross+46),s=vertical?stand.z:stand.x;
  for(const sign of [-1,1]){const start=along-sign*half,end=along+sign*half,world=(a,c,y=3)=>vertical?[c,y,a]:[a,y,c],cost=Math.abs(s-start)+Math.abs((vertical?stand.x:stand.z)-taxi)+Math.abs(taxi-cross);
   if(best&&best.cost<=cost)continue;
   const altitude=Math.max(260,...BUILDINGS.map(b=>Math.max(Number(b.originalHeight)||0,Number(b.h)||0)))+60;
   const points=[[stand.x,3,stand.z],world(s,taxi),world(start,taxi),world(start,cross),world(end,cross,4),world(end+sign*190,cross,altitude),world(end+sign*2600,cross,altitude)];
   const timing=aircraftPathTiming(points,i=>i<=3);best={cost,points,timing,runwayId:r.id||`${id}-RUNWAY-1`,airportId:id};
  }
 }
 if(geometry.size>=24)geometry.clear();geometry.set(geometryKey,best);return best;
}
function fit(f,operations){
 const g=departureGeometry(f.to),window=[g.timing[3][0],g.timing[4][0]],owner=key(f);let at=f.arrival+900;
 for(let i=0;i<256;i++){let next=at;for(const op of operations){if(op.owner===owner||op.runwayId!==g.runwayId)continue;if(at+window[1]+GAP>op.start&&at+window[0]<op.end+GAP)next=Math.max(next,op.end+GAP-window[0]);}if(next===at)break;at=next;}
 return {...g,departure:at,exitAt:at+g.timing.at(-1)[0],start:at+window[0],end:at+window[1],owner};
}
function daySchedule(id,day){
 const cacheKey=id+'|'+day+'|'+urbanGeometryRevision;if(days.has(cacheKey))return days.get(cacheKey);
 const operations=[],arrivals=[];
 for(const from of ['city','north','island'])for(const to of ['city','north','island']){
  if(from===to||from!==id&&to!==id)continue;let f=nextRegionalFlight((day-1)*86400,from,to,0);
  for(let count=0;f&&f.departure<(day+2)*86400&&count<128;count++,f=nextRegionalFlight(f.departure+1,from,to,0)){
   const port=airportById(id),r=port.runways?.[0]||port.runway,w=regionalRunwayWindow(f,id);operations.push({start:w[0],end:w[1],runwayId:r.id||`${id}-RUNWAY-1`});
   if(to===id&&f.arrival>=(day-1)*86400&&f.arrival<(day+1)*86400)arrivals.push(f);
  }
 }
 const plans=new Map();for(const f of arrivals.sort((a,b)=>a.arrival-b.arrival||a.id.localeCompare(b.id))){const plan=fit(f,operations);plans.set(key(f),plan);operations.push(plan);}
 const result={plans,operations};if(days.size>=32)days.delete(days.keys().next().value);days.set(cacheKey,result);return result;
}
export function regionalEmptyRotation(flight){
 if(!flight.to)flight={...flight,to:flight.from==='city'?'island':'city'};
 const schedule=daySchedule(flight.to,Math.floor(flight.arrival/86400));return schedule.plans.get(key(flight))||fit(flight,schedule.operations);
}
export function regionalAircraftVisibleUntil(flight){return regionalEmptyRotation(flight).exitAt;}
export function regionalEmptyPose(now,flight){
 const p=regionalEmptyRotation(flight);if(now<p.departure)return null;
 return {...timedAircraftPose(p.timing,now-p.departure),phase:now>=p.exitAt?'ferry-departed':now<p.departure+p.timing[4][0]?'ferry-taxi':'ferry-flight'};
}
