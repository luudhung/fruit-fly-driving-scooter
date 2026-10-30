import {METRO_LINES,metroStationGeometry,pedestrianRoute,onIsland} from './city-map.mjs';
const nodes=METRO_LINES.flatMap(line=>line.points.map((p,index)=>({line,index,x:p[0],z:p[1],geo:metroStationGeometry(line,index)})));
const edges=nodes.map((a,i)=>nodes.flatMap((b,j)=>{
 if(a.line.id===b.line.id&&Math.abs(a.index-b.index)===1)return[{to:j,cost:Math.hypot(a.x-b.x,a.z-b.z)*.18+2,rail:true}];
 if(a.line.id!==b.line.id&&Math.hypot(a.x-b.x,a.z-b.z)<1)return[{to:j,cost:Math.hypot(a.geo.access.x-b.geo.access.x,a.geo.access.z-b.geo.access.z)+(a.line.height+b.line.height)*.6+12,rail:false}];
 return [];
}));
export const METRO_INTERCHANGES=nodes.filter(a=>nodes.some(b=>b.line.id!==a.line.id&&a.x===b.x&&a.z===b.z)).map(a=>({lineId:a.line.id,index:a.index,x:a.x,z:a.z,lines:nodes.filter(b=>a.x===b.x&&a.z===b.z).map(b=>b.line.id)}));
function stairs(a,b,lineId,down){return Array.from({length:7},(_,k)=>{const t=(k+1)/7;return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:a.y+(b.y-a.y)*t,mode:'walk',lineId,stage:down?'station-stairs-down':'station-stairs-up'};});}
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
 if(!legs.length)return null;
 const first=legs[0],entry=metroStationGeometry(first.line,first.entry),access=pedestrianRoute(from,entry.access);if(!access.length)return null;
 const waypoints=[...access];let previousAccess=null;
 for(const leg of legs){
  const a=metroStationGeometry(leg.line,leg.entry),b=metroStationGeometry(leg.line,leg.exit),direction=Math.sign(leg.exit-leg.entry);
  if(previousAccess){const link=pedestrianRoute(previousAccess,a.access);if(!link.length)return null;waypoints.push(...link.map(p=>({...p,lineId:leg.line.id,stage:'interchange-walk'})));}
  waypoints.push(...stairs(a.access,a.platform,leg.line.id,false));
  waypoints.push({...a.platform,mode:'walk',lineId:leg.line.id,stage:'station-entry',stationIndex:leg.entry,exitIndex:leg.exit,direction});
  for(let i=leg.entry;i!==leg.exit+direction;i+=direction){const[x,z]=leg.line.points[i];waypoints.push({x,z,y:leg.line.height,mode:'metro',lineId:leg.line.id,stage:'on-train'});}
  waypoints.push({...b.platform,mode:'walk',lineId:leg.line.id,stage:'station-exit'},...stairs(b.platform,b.access,leg.line.id,true));previousAccess=b.access;
 }
 const exit=pedestrianRoute(previousAccess,dest);if(!exit.length)return null;waypoints.push(...exit);
 return {lineId:first.line.id,waypoints,score,entryIndex:first.entry,exitIndex:legs.at(-1).exit,transfers:legs.length-1,fare:legs.length*.5,legs:legs.map(l=>({lineId:l.line.id,entryIndex:l.entry,exitIndex:l.exit}))};
}
