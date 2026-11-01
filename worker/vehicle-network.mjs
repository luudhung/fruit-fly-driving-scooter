const EPS=1e-5,LANE=1.5,DIRS=[[1,0],[0,1],[-1,0],[0,-1]];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const direction=(a,b)=>Math.abs(b.x-a.x)>=Math.abs(b.z-a.z)?(b.x>=a.x?0:2):(b.z>=a.z?1:3);
const right=dir=>({x:-DIRS[dir][1]*LANE,z:DIRS[dir][0]*LANE});
class Heap{
 a=[];
 push(value){let i=this.a.length;this.a.push(value);while(i){const p=(i-1)>>1;if(this.a[p][0]<=value[0])break;this.a[i]=this.a[p];i=p;}this.a[i]=value;}
 pop(){const result=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let j=i*2+1;if(j+1<this.a.length&&this.a[j+1][0]<this.a[j][0])j++;if(this.a[j][0]>=last[0])break;this.a[i]=this.a[j];i=j;}this.a[i]=last;}return result;}
}
/** Directed asphalt graph. Geometry is shared; cached routes contain no resident state. */
export function createVehicleRouter({roads,clearSegment=()=>true,underpasses=()=>[],roadTravelY=()=>1.1}){
 let signature='',graph=null;const routes=new Map();
 function rebuild(){
  const source=roads(),key=source.map(r=>`${r.x},${r.z},${r.w},${r.d}`).join('|');
  if(graph&&key===signature)return graph;signature=key;routes.clear();
  const groups=new Map();
  for(const r of source){if(![r.x,r.z,r.w,r.d].every(Number.isFinite)||r.w<=0||r.d<=0)continue;
   const axis=r.w>=r.d?'x':'z',coordinate=axis==='x'?r.z:r.x,center=axis==='x'?r.x:r.z,length=axis==='x'?r.w:r.d,k=`${axis}:${coordinate}`;
   if(!groups.has(k))groups.set(k,[]);groups.get(k).push({axis,coordinate,lo:center-length/2,hi:center+length/2,width:Math.min(r.w,r.d)});
  }
  const lines=[];
  for(const list of groups.values()){
   list.sort((a,b)=>a.lo-b.lo);for(const r of list){const last=lines.at(-1);if(last&&last.axis===r.axis&&last.coordinate===r.coordinate&&r.lo<=last.hi+EPS){last.hi=Math.max(last.hi,r.hi);last.width=Math.max(last.width,r.width);}else lines.push({...r});}
  }
  for(const l of lines)l.cuts=[l.lo,l.hi];
  for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
   const a=lines[i],b=lines[j];if(a.axis===b.axis)continue;const x=a.axis==='x'?b.coordinate:a.coordinate,z=a.axis==='x'?a.coordinate:b.coordinate;
   if(x+EPS<(a.axis==='x'?a:b).lo||x-EPS>(a.axis==='x'?a:b).hi||z+EPS<(a.axis==='z'?a:b).lo||z-EPS>(a.axis==='z'?a:b).hi)continue;
   a.cuts.push(a.axis==='x'?x:z);b.cuts.push(b.axis==='x'?x:z);
  }
  const nodes=[],nodeIds=new Map(),segments=[];
  function node(x,z){const key=`${x},${z}`;if(nodeIds.has(key))return nodeIds.get(key);const id=nodes.length;nodes.push({x,z,edges:[]});nodeIds.set(key,id);return id;}
  for(const line of lines){const cuts=[...new Set(line.cuts)].sort((a,b)=>a-b);for(let i=1;i<cuts.length;i++){
   const a=line.axis==='x'?{x:cuts[i-1],z:line.coordinate}:{x:line.coordinate,z:cuts[i-1]},b=line.axis==='x'?{x:cuts[i],z:line.coordinate}:{x:line.coordinate,z:cuts[i]};if(distance(a,b)<EPS)continue;
   const ai=node(a.x,a.z),bi=node(b.x,b.z),dir=direction(a,b),offset=right(dir),reverse=right((dir+2)%4);
   if(!clearSegment({x:a.x+offset.x,z:a.z+offset.z},{x:b.x+offset.x,z:b.z+offset.z})||!clearSegment({x:b.x+reverse.x,z:b.z+reverse.z},{x:a.x+reverse.x,z:a.z+reverse.z}))continue;
   const length=distance(a,b);nodes[ai].edges.push({to:bi,dir,cost:length});nodes[bi].edges.push({to:ai,dir:(dir+2)%4,cost:length});segments.push({a:ai,b:bi,dir,length,line});
  }}
  return graph={nodes,segments};
 }
 function insideRamp(p){return underpasses().some(t=>Math.abs(p.x-t.x)<t.w/2+.3&&Math.abs(p.z-t.z)<t.halfLength-.01);}
 function anchors(p,g){
  const result=[];for(const edge of g.segments){const a=g.nodes[edge.a],b=g.nodes[edge.b],dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/length2)),q={x:a.x+dx*t,z:a.z+dz*t},dist=distance(p,q);
   if(dist>16)continue;result.push({edge,q,dist});}
  result.sort((a,b)=>a.dist-b.dist);return result.slice(0,8);
 }
 function validTurn(p,from,to,degree){return from===to||!insideRamp(p)&&((from+2)%4!==to||degree===1);}
 function withHeights(path,mode){
  const out=[];
  for(let i=0;i<path.length;i++){
   const a=path[Math.max(0,i-1)],b=path[i],heading=i?{x:b.x-a.x,z:b.z-a.z}:{x:(path[1]?.x??b.x)-b.x,z:(path[1]?.z??b.z)-b.z},axis=Math.abs(heading.z)>Math.abs(heading.x)?'z':'x',cuts=[0,1];
   if(i&&axis==='z'&&Math.abs(b.z-a.z)>EPS)for(const t of underpasses())if(Math.abs((a.x+b.x)/2-t.x)<t.w/2+.3)for(const dz of [-t.halfLength,-(t.coveredHalf??10),0,t.coveredHalf??10,t.halfLength]){const u=(t.z+dz-a.z)/(b.z-a.z);if(u>EPS&&u<1-EPS)cuts.push(u);}
   cuts.sort((a,b)=>a-b);for(const u of (i?cuts.slice(1):[1])){const p={x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u};p.y=roadTravelY(p,axis);p.mode=mode;p.stage=p.y<.8?'underpass':'road';if(!out.length||distance(out.at(-1),p)>.01||Math.abs(out.at(-1).y-p.y)>.01)out.push(p);}
  }
  return out;
 }
 function lanePath(centers,firstDir,lastDir){
  if(centers.length<2)return [];
  const out=[],append=p=>{if(!out.length||distance(out.at(-1),p)>.02)out.push(p);};
  const firstOffset=right(firstDir);append({x:centers[0].x+firstOffset.x,z:centers[0].z+firstOffset.z});
  for(let i=1;i<centers.length-1;i++){
   const p=centers[i],incoming=direction(centers[i-1],p),outgoing=direction(p,centers[i+1]),a=right(incoming),b=right(outgoing);
   if(incoming===outgoing){append({x:p.x+a.x,z:p.z+a.z});continue;}
   const turn=Math.min(3,distance(centers[i-1],p)/3,distance(p,centers[i+1])/3),u=DIRS[incoming],v=DIRS[outgoing];
   const start={x:p.x-u[0]*turn+a.x,z:p.z-u[1]*turn+a.z},end={x:p.x+v[0]*turn+b.x,z:p.z+v[1]*turn+b.z},control={x:p.x+a.x+b.x,z:p.z+a.z+b.z};
   if((incoming+2)%4===outgoing){control.x=p.x-u[0]*.2;control.z=p.z-u[1]*.2;}
   append(start);for(let j=1;j<=4;j++){const t=j/4,k=1-t;append({x:k*k*start.x+2*k*t*control.x+t*t*end.x,z:k*k*start.z+2*k*t*control.z+t*t*end.z});}
  }
  const end=centers.at(-1),offset=right(lastDir);append({x:end.x+offset.x,z:end.z+offset.z});
  return out;
 }
 function route(from,to,mode='car'){
  if(!from||!to||![from.x,from.z,to.x,to.z].every(Number.isFinite))return [];
  if(distance(from,to)<.02)return [{x:to.x,z:to.z,y:Number.isFinite(to.y)?to.y:roadTravelY(to,to.axis||from.axis||'x'),mode,stage:'road'}];
  const g=rebuild(),key=`${mode}:${Math.round(from.x*10)},${Math.round(from.z*10)}:${Math.round(to.x*10)},${Math.round(to.z*10)}`;
  if(routes.has(key))return routes.get(key).map(p=>({...p}));
  const starts=anchors(from,g),ends=anchors(to,g);if(!starts.length||!ends.length)return [];
  for(const a of starts)for(const b of ends)if(a.edge===b.edge&&distance(a.q,b.q)>.02){
   const dir=direction(a.q,b.q),offset=right(dir),laneA={x:a.q.x+offset.x,z:a.q.z+offset.z},laneB={x:b.q.x+offset.x,z:b.q.z+offset.z};
   const path=[from,laneA,laneB,to];if(path.every((p,i)=>!i||clearSegment(path[i-1],p)))return withHeights(path,mode);
  }
  const best=new Map(),parent=new Map(),origin=new Map(),heap=new Heap();
  for(const s of starts)for(const [id,dir]of [[s.edge.b,s.edge.dir],[s.edge.a,(s.edge.dir+2)%4]]){
   const off=right(dir),lane={x:s.q.x+off.x,z:s.q.z+off.z};if(!clearSegment(from,lane))continue;
   const side=(from.x-s.q.x)*off.x+(from.z-s.q.z)*off.z,cost=distance(from,lane)+distance(s.q,g.nodes[id])+(side<-.1?18:0),state=id*4+dir;
   if(cost>=(best.get(state)??Infinity))continue;best.set(state,cost);origin.set(state,{q:s.q,dir});heap.push([cost+distance(g.nodes[id],to),state]);
  }
  let winner=null,winnerCost=Infinity;const processed=new Set();
  while(heap.a.length){const[,state]=heap.pop();if(processed.has(state))continue;processed.add(state);const index=Math.floor(state/4),incoming=state%4,node=g.nodes[index],cost=best.get(state);
   if(cost+distance(node,to)>winnerCost+32)continue;
   for(const e of ends){for(const [endpoint,dir]of [[e.edge.a,e.edge.dir],[e.edge.b,(e.edge.dir+2)%4]]){
    if(endpoint!==index||!validTurn(node,incoming,dir,node.edges.length))continue;const off=right(dir),lane={x:e.q.x+off.x,z:e.q.z+off.z};if(!clearSegment(lane,to))continue;
    const side=(to.x-e.q.x)*off.x+(to.z-e.q.z)*off.z,total=cost+distance(node,e.q)+distance(lane,to)+(side<-.1?18:0);if(total<winnerCost){winner={state,q:e.q,dir};winnerCost=total;}
   }}
   for(const edge of node.edges){if(!validTurn(node,incoming,edge.dir,node.edges.length))continue;const next=edge.to*4+edge.dir,value=cost+edge.cost+(edge.dir===incoming?0:2);if(value>=(best.get(next)??Infinity))continue;best.set(next,value);parent.set(next,state);origin.set(next,origin.get(state));heap.push([value+distance(g.nodes[edge.to],to),next]);}
  }
  if(!winner)return [];
  const nodePath=[];for(let state=winner.state;state!==undefined;state=parent.get(state))nodePath.push(g.nodes[Math.floor(state/4)]);nodePath.reverse();const first=origin.get(winner.state);
  const centers=[first.q,...nodePath,winner.q].filter((p,i,all)=>!i||distance(p,all[i-1])>.02),lane=lanePath(centers,first.dir,winner.dir);
  if(!lane.length)return [];
  const path=[{x:from.x,z:from.z},...lane,{x:to.x,z:to.z}].filter((p,i,all)=>!i||distance(p,all[i-1])>.02);
  if(path.some((p,i)=>i&&!clearSegment(path[i-1],p)))return [];
  const result=withHeights(path,mode);if(routes.size>=384)routes.delete(routes.keys().next().value);routes.set(key,result);return result.map(p=>({...p}));
 }
 return {route,stats:()=>({nodes:graph?.nodes.length||0,segments:graph?.segments.length||0,cachedRoutes:routes.size})};
}
