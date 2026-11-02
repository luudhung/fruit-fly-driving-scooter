import {METRO_LINES,metroStationGeometry,pedestrianRoute,onIsland} from './city-map.mjs';
export const METRO_ACCESS_VERSION=2;
const nodes=METRO_LINES.flatMap(line=>line.points.map((p,index)=>({line,index,x:p[0],z:p[1],geo:metroStationGeometry(line,index)})));
const edges=nodes.map((a,i)=>nodes.flatMap((b,j)=>{
 if(a.line.id===b.line.id&&Math.abs(a.index-b.index)===1)return[{to:j,cost:Math.hypot(a.x-b.x,a.z-b.z)*.18+2,rail:true}];
 if(a.line.id!==b.line.id&&Math.hypot(a.x-b.x,a.z-b.z)<1)return[{to:j,cost:Math.hypot(a.geo.access.x-b.geo.access.x,a.geo.access.z-b.geo.access.z)+(a.line.height+b.line.height)*.6+12,rail:false}];
 return [];
}));
export const METRO_INTERCHANGES=nodes.filter(a=>nodes.some(b=>b.line.id!==a.line.id&&a.x===b.x&&a.z===b.z)).map(a=>({lineId:a.line.id,index:a.index,x:a.x,z:a.z,lines:nodes.filter(b=>a.x===b.x&&a.z===b.z).map(b=>b.line.id)}));
function stairs(a,b,lineId,down){
 const horizontal=Math.hypot(b.x-a.x,b.z-a.z),vertical=Math.abs(b.y-a.y);
 if(horizontal<.01&&vertical<.01)return [];
 const lift=horizontal<.01,count=lift?1:7;
 return Array.from({length:count},(_,k)=>{const t=(k+1)/count;return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:a.y+(b.y-a.y)*t,mode:'walk',lineId,stage:lift?'station-lift':down?'station-stairs-down':'station-stairs-up'};});
}
function stationStairs(geo,lineId,down){const points=down?[...geo.stairs].reverse():geo.stairs;return points.slice(1).flatMap((p,i)=>stairs(points[i],p,lineId,down)).map(p=>({...p,direction:geo.direction||1,metroAccessVersion:METRO_ACCESS_VERSION}));}
export function metroTransferWaypoints(fromLine,fromIndex,toLine,toIndex,fromDirection=1,toDirection=1){
 const a=metroStationGeometry(fromLine,fromIndex,fromDirection),b=metroStationGeometry(toLine,toIndex,toDirection),[x,z]=fromLine.points[fromIndex];
 if(Math.hypot(x-toLine.points[toIndex][0],z-toLine.points[toIndex][1])>1)return null;
 const height=Math.max(...METRO_LINES.filter(l=>l.points.some(p=>p[0]===x&&p[1]===z)).map(l=>l.height))+4.2;
 const points=[{...a.platform,y:height},{x:b.platform.x,z:a.platform.z,y:height},{...b.platform,y:height},{...b.platform}];
 return points.map((p,i)=>({...p,mode:'walk',lineId:toLine.id,direction:toDirection,stage:Math.hypot(p.x-(points[i-1]||a.platform).x,p.z-(points[i-1]||a.platform).z)<.01&&Math.abs(p.y-(points[i-1]||a.platform).y)>.01?'station-lift':'interchange-walk',metroAccessVersion:METRO_ACCESS_VERSION}));
}
const lineFor=id=>METRO_LINES.find(l=>l.id===id);
const validLeg=leg=>leg.line&&Number.isInteger(leg.entry)&&Number.isInteger(leg.exit)&&leg.entry!==leg.exit&&leg.line.points[leg.entry]&&leg.line.points[leg.exit];
function itinerary(legs,dest){
 const waypoints=[];
 for(let i=0;i<legs.length;i++){
  const leg=legs[i],direction=Math.sign(leg.exit-leg.entry),a=metroStationGeometry(leg.line,leg.entry,direction),b=metroStationGeometry(leg.line,leg.exit,direction);
  if(i){const previous=legs[i-1],transfer=metroTransferWaypoints(previous.line,previous.exit,leg.line,leg.entry,Math.sign(previous.exit-previous.entry),direction);if(!transfer)return null;waypoints.push(...transfer);}
  waypoints.push({...a.platform,mode:'walk',lineId:leg.line.id,stage:'station-entry',stationIndex:leg.entry,exitIndex:leg.exit,direction,metroAccessVersion:METRO_ACCESS_VERSION});
  for(let j=leg.entry;j!==leg.exit+direction;j+=direction){const[x,z]=leg.line.points[j];waypoints.push({x,z,y:leg.line.height,mode:'metro',lineId:leg.line.id,stage:'on-train'});}
  waypoints.push({...b.platform,mode:'walk',lineId:leg.line.id,stage:'station-exit',stationIndex:leg.exit,direction,metroAccessVersion:METRO_ACCESS_VERSION});
  if(i===legs.length-1)waypoints.push(...stationStairs(b,leg.line.id,true));
 }
 const last=legs.at(-1),exit=pedestrianRoute(metroStationGeometry(last.line,last.exit,Math.sign(last.exit-last.entry)).access,dest);if(!exit.length)return null;
 return [...waypoints,...exit];
}
/** Re-encode only the remaining journey. The caller keeps the passenger's pose, fare and train. */
export function repairMetroRoute(fly,dest){
 const old=fly.routeWaypoints||[],index=Math.max(0,fly.routeIndex||0),current=old[index];
 const entryLeg=p=>({line:lineFor(p.lineId||fly.metroLineId),entry:p.stationIndex,exit:p.exitIndex});
 if(fly.onTrain){
  const line=lineFor(fly.metroLineId),exit=fly.metroExitIndex;
  if(!line?.points[exit])return null;
  const oldExit=old.findIndex((p,i)=>i>=index&&p.stage==='station-exit');
  const future=old.slice(oldExit<0?old.length:oldExit+1).filter(p=>p.stage==='station-entry').map(entryLeg).filter(leg=>leg.entry!==leg.exit);
  if(!future.every(validLeg))return null;
  const boarding=old.slice(0,index+1).reverse().find(p=>p.stage==='station-entry'),direction=fly.metroTrainDirection||boarding?.direction||1,geo=metroStationGeometry(line,exit,direction),waypoints=[{...geo.platform,mode:'walk',lineId:line.id,stage:'station-exit',stationIndex:exit,direction,metroAccessVersion:METRO_ACCESS_VERSION}];
  if(future.length){const transfer=metroTransferWaypoints(line,exit,future[0].line,future[0].entry,direction,Math.sign(future[0].exit-future[0].entry)),tail=itinerary(future,dest);if(!transfer||!tail)return null;waypoints.push(...transfer,...tail);}
  else{const tail=pedestrianRoute(geo.access,dest);if(!tail.length)return null;waypoints.push(...stationStairs(geo,line.id,true),...tail);}
  return {waypoints,exitWaypoint:0};
 }
 const nextEntry=old.findIndex((p,i)=>i>=index&&p.stage==='station-entry');
 if(nextEntry<0){
  // A resident already descending finishes that old staircase at ground level, then walks home.
  const descent=[];for(let i=index;i<old.length&&old[i].stage==='station-stairs-down';i++)descent.push({...old[i],mode:'walk',stage:'station-access-recovery'});
  if(!descent.length&&fly.y>2){
   const exit=old.slice(0,index+1).reverse().find(p=>p.stage==='station-exit'),line=lineFor(exit?.lineId||fly.metroLineId);
   const station=Number.isInteger(exit?.stationIndex)?exit.stationIndex:fly.metroExitIndex;
   if(!line?.points[station])return null;
   const geo=metroStationGeometry(line,station,exit?.direction||fly.metroTrainDirection||1);descent.push({...geo.platform,mode:'walk',stage:'station-access-recovery'},...stationStairs(geo,line.id,true));
  }
  const ground=descent.at(-1)||fly,tail=pedestrianRoute(ground,dest);return tail.length?{waypoints:[...descent,...tail]}:null;
 }
 const entries=old.slice(nextEntry).filter(p=>p.stage==='station-entry'),legs=entries.map(entryLeg).filter(leg=>leg.entry!==leg.exit);if(!legs.every(validLeg))return null;
 if(!legs.length){
  // Old planners sometimes encoded an out-and-back train loop as entryIndex === exitIndex.
  // Nobody can board a direction-zero train. Leave this station and finish on foot instead.
  const entry=entries[0],line=lineFor(entry.lineId||fly.metroLineId);if(!line?.points[entry.stationIndex])return null;
  const geo=metroStationGeometry(line,entry.stationIndex,entry.direction||1),descent=fly.y>2?[{...geo.platform,mode:'walk',stage:'station-access-recovery'},...stationStairs(geo,line.id,true)]:[];
  const walk=pedestrianRoute(descent.length?geo.access:fly,dest);return walk.length?{waypoints:[...descent,...walk]}:null;
 }
 const geo=metroStationGeometry(legs[0].line,legs[0].entry,Math.sign(legs[0].exit-legs[0].entry)),tail=itinerary(legs,dest);if(!tail)return null;
 if(fly.y>2&&current?.stage!=='station-stairs-up'){
  // Waiting or transferring passengers are already on an elevated station, so keep them upstairs.
  return {waypoints:[{...geo.platform,mode:'walk',stage:'station-access-recovery',lineId:legs[0].line.id},...tail]};
 }
 const retreat=[];
 if(fly.y>1.2&&current?.stage==='station-stairs-up'){
  let first=index;while(first>0&&old[first-1].stage==='station-stairs-up')first--;
  for(let i=index-1;i>=first;i--)retreat.push({...old[i],mode:'walk',stage:'station-access-recovery'});
  const foot=old[first-1];if(!foot)return null;retreat.push({...foot,y:1.1,mode:'walk',stage:'station-access-recovery'});
 }
 const access=pedestrianRoute(retreat.at(-1)||fly,geo.access);if(!access.length)return null;
 return {waypoints:[...retreat,...access,...stationStairs(geo,legs[0].line.id,false),...tail]};
}
/** Multi-source station search; passengers can walk between real platforms at interchanges. */
export function planNetworkMetroRoute(from,dest){
 if(onIsland(from)||onIsland(dest))return null;
 const n=nodes.length,dist=new Float64Array(n*2).fill(Infinity),parent=new Int32Array(n*2).fill(-1),done=new Uint8Array(n*2);
 for(let i=0;i<n;i++)dist[i]=Math.hypot(from.x-nodes[i].geo.access.x,from.z-nodes[i].geo.access.z);
 for(let pass=0;pass<n*2;pass++){
  let current=-1,best=Infinity;for(let i=0;i<dist.length;i++)if(!done[i]&&dist[i]<best){current=i;best=dist[i];}if(current<0)break;done[current]=1;
  const rail=current>=n,index=current%n;
  for(const e of edges[index]){const next=e.to+(rail||e.rail?n:0),cost=best+e.cost;if(cost<dist[next]){dist[next]=cost;parent[next]=current;}}
 }
 let last=-1,score=Infinity;
 for(let i=0;i<n;i++){const cost=dist[i+n]+Math.hypot(dest.x-nodes[i].geo.access.x,dest.z-nodes[i].geo.access.z);if(cost<score){score=cost;last=i+n;}}
 if(last<0)return null;
 const path=[];for(let i=last;i>=0;i=parent[i])path.push(i%n);path.reverse();
 const legs=[];for(let k=1;k<path.length;k++){
  const a=nodes[path[k-1]],b=nodes[path[k]];if(a.line.id!==b.line.id)continue;
  const previous=legs.at(-1);if(previous&&previous.line.id===a.line.id&&previous.exit===a.index)previous.exit=b.index;else legs.push({line:a.line,entry:a.index,exit:b.index});
 }
 for(let i=legs.length-1;i>=0;i--)if(legs[i].entry===legs[i].exit)legs.splice(i,1);
 if(!legs.length)return null;
 const first=legs[0],entry=metroStationGeometry(first.line,first.entry,Math.sign(first.exit-first.entry)),access=pedestrianRoute(from,entry.access);if(!access.length)return null;
 const tail=itinerary(legs,dest);if(!tail)return null;
 const waypoints=[...access,...stationStairs(entry,first.line.id,false),...tail];
 return {lineId:first.line.id,waypoints,score,entryIndex:first.entry,exitIndex:legs.at(-1).exit,transfers:legs.length-1,fare:.5,legs:legs.map(l=>({lineId:l.line.id,entryIndex:l.entry,exitIndex:l.exit}))};
}
