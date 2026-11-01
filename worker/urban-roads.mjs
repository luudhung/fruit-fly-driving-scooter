const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const MIN_ALLEY=3;
export const ACCESS_ROAD_WIDTH=6;
const overlaps=(a,b,margin=0)=>Math.abs(a.x-b.x)<(a.w+b.w)/2+margin&&Math.abs(a.z-b.z)<(a.d+b.d)/2+margin;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const inside=(r,p)=>p.x>=r.minX&&p.x<=r.maxX&&p.z>=r.minZ&&p.z<=r.maxZ;
export function validDevelopmentLot(lot,{bounds,buildings=[],roads=[],water=[],parks=[],reserved=[]}){
 if(!lot||![lot.x,lot.z,lot.w,lot.d,lot.h].every(Number.isFinite)||lot.w<8||lot.d<8||lot.h<6||lot.h>160)return false;
 for(const dx of [-lot.w/2,lot.w/2])for(const dz of [-lot.d/2,lot.d/2])if(!inside(bounds,{x:lot.x+dx,z:lot.z+dz}))return false;
 return !buildings.some(b=>b.id!==lot.id&&overlaps(b,lot,MIN_ALLEY))&&!roads.some(r=>overlaps(r,lot,MIN_ALLEY))&&!water.some(r=>overlaps(r,lot,1))&&!parks.some(r=>overlaps(r,lot,MIN_ALLEY))&&!reserved.some(r=>overlaps(r,lot,MIN_ALLEY));
}
function roadRect(a,b){const dx=Math.abs(a.x-b.x),dz=Math.abs(a.z-b.z);if(dx<.1&&dz<.1)return null;const horizontal=dx>=dz;return {x:(a.x+b.x)/2,z:(a.z+b.z)/2,w:horizontal?Math.max(ACCESS_ROAD_WIDTH+.01,dx):ACCESS_ROAD_WIDTH,d:horizontal?ACCESS_ROAD_WIDTH:Math.max(ACCESS_ROAD_WIDTH+.01,dz)};}
/** Select a real orthogonal connection to the existing network, never across a river, building or park. */
export function planAccessRoad(lot,{bounds,roads=[],buildings=[],water=[],parks=[],reserved=[],underpasses=[]}){
 const offset=MIN_ALLEY+ACCESS_ROAD_WIDTH/2;
 const starts=[{x:lot.x-lot.w/2-offset,z:lot.z},{x:lot.x+lot.w/2+offset,z:lot.z},{x:lot.x,z:lot.z-lot.d/2-offset},{x:lot.x,z:lot.z+lot.d/2+offset}];
 const candidates=[];
 for(const start of starts)for(const road of roads){
  const horizontal=road.w>road.d;
  const end=horizontal?{x:clamp(start.x,road.x-road.w/2+1,road.x+road.w/2-1),z:road.z}:{x:road.x,z:clamp(start.z,road.z-road.d/2+1,road.z+road.d/2-1)};
  if(!inside(bounds,start)||!inside(bounds,end))continue;
  if(distance(start,end)<ACCESS_ROAD_WIDTH/2+.5){candidates.push({roads:[],length:0,frontage:start});continue;}
  for(const bend of [{x:start.x,z:end.z},{x:end.x,z:start.z}]){
   const segments=[roadRect(start,bend),roadRect(bend,end)].filter(Boolean);
   if(!segments.length)continue;
   const valid=segments.every(r=>{
    for(const dx of [-r.w/2,r.w/2])for(const dz of [-r.d/2,r.d/2])if(!inside(bounds,{x:r.x+dx,z:r.z+dz}))return false;
    return !buildings.some(b=>b.id!==lot.id&&overlaps(r,b,.8))&&!overlaps(r,lot,MIN_ALLEY-.01)&&!water.some(w=>overlaps(r,w,.5))&&!parks.some(p=>overlaps(r,p,1))&&!reserved.some(p=>overlaps(r,p,.6))&&!underpasses.some(p=>overlaps(r,{x:p.x,z:p.z,w:p.w+4,d:(p.halfLength||42)*2},1));
   });
   if(valid)candidates.push({roads:segments,length:segments.reduce((n,r)=>n+Math.max(r.w,r.d),0),frontage:start});
  }
 }
 candidates.sort((a,b)=>a.length-b.length);return candidates[0]||null;
}
