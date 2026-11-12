// Authoritative road surfaces shared by traffic, the observer and player physics.
export const MOTORWAY={west:-1080,east:1120,north:-1100,south:440,width:34,lanesPerDirection:4,laneWidth:3.2,medianWidth:2};
export const MOTORWAY_LANE_OFFSETS=[2.6,5.8,9,12.2];
export const MOTORWAY_LANE_MULTIPLIERS=[3,8/3,7/3,2];
const {west,east,north,south,width}=MOTORWAY;
const main=(id,x,z,w,d)=>({id,x,z,w,d,motorway:true,lanes:8,median:2});
const access=(id,x,z,w,d)=>({id,x,z,w,d,motorwayAccess:true});
export const MOTORWAY_ACCESS_ROADS=[
 ...[-260,0,260].map(z=>access(`RING-WEST-${z}`,(west-1000)/2,z,-1000-west,12)),
 ...[-430,50].map(x=>access(`RING-NORTH-${x}`,x,(north-1060)/2,12,-1060-north)),
 access('RING-EAST-160',(860+east)/2,160,east-860,12),
 access('RING-SOUTH-WEST',-430,420,12,40),
 access('RING-SOUTH-CENTRAL',122,420,12,40),
 access('RING-SOUTH-EAST',500,340,12,200),
];
export const MOTORWAY_ROADS=[
 main('RING-NORTH',(west+east)/2,north,east-west+width,width),
 main('RING-SOUTH',(west+east)/2,south,east-west+width,width),
 main('RING-WEST',west,(north+south)/2,width,south-north+width),
 main('RING-EAST',east,(north+south)/2,width,south-north+width),
 ...MOTORWAY_ACCESS_ROADS,
];
export const MOTORWAY_DECKS=[
 {id:'RING-NORTH-RIVER',x:430,z:north,w:160,d:width+4},
 {id:'RING-SOUTH-RIVER',x:430,z:south,w:160,d:width+4},
 {id:'RING-SOUTH-HARBOR',x:120,z:south,w:568,d:width+4},
 {id:'RING-SOUTH-CENTRAL-DECK',x:122,z:420,w:16,d:48},
];
const inside=(r,p,margin=0)=>Math.abs(p.x-r.x)<=r.w/2+margin&&Math.abs(p.z-r.z)<=r.d/2+margin;
export function motorwaySegmentAt(p,axis){
 return MOTORWAY_ROADS.find(r=>r.motorway&&(!axis||(r.w>r.d?'x':'z')===axis)&&inside(r,p));
}
/** Index zero is the inner passing lane; index three is the slower outer lane. */
export function motorwayLaneAt(p,axis){
 const road=motorwaySegmentAt(p,axis);if(!road)return null;
 const along=road.w>road.d?'x':'z',offset=along==='x'?p.z-road.z:p.x-road.x;
 let lane=0;for(let i=1;i<4;i++)if(Math.abs(Math.abs(offset)-MOTORWAY_LANE_OFFSETS[i])<Math.abs(Math.abs(offset)-MOTORWAY_LANE_OFFSETS[lane]))lane=i;
 return {roadId:road.id,axis:along,lane,offset,side:Math.sign(offset)||1,speedMultiplier:MOTORWAY_LANE_MULTIPLIERS[lane]};
}
export function motorwaySpeedMultiplier(p,mode='car'){
 if(mode!=='car')return 1;
 const heading=Number(p.heading),vx=Number(p.vx||0),vz=Number(p.vz||0);
 const axis=Number.isFinite(heading)?(Math.abs(Math.sin(heading))>Math.abs(Math.cos(heading))?'x':'z'):
  Math.hypot(vx,vz)>.05?(Math.abs(vx)>Math.abs(vz)?'x':'z'):undefined;
 return (motorwayLaneAt(p,axis)||motorwayLaneAt(p))?.speedMultiplier||1;
}
/** Painted merge boxes and ring corners are openings in the physical median. */
export function motorwayMedianBlocked(p){
 const road=motorwaySegmentAt(p);if(!road)return false;
 const horizontal=road.w>road.d,coordinate=horizontal?p.z-road.z:p.x-road.x,along=horizontal?p.x:p.z;
 if(Math.abs(coordinate)>MOTORWAY.medianWidth/2+.05)return false;
 const lo=horizontal?west:north,hi=horizontal?east:south;
 if(along<lo+42||along>hi-42)return false;
 return !MOTORWAY_ACCESS_ROADS.some(r=>{
  if(!inside(r,{x:horizontal?r.x:road.x,z:horizontal?road.z:r.z},28))return false;
  return Math.abs(along-(horizontal?r.x:r.z))<28;
 });
}
export function motorwayLaneOffset(lane=3){return MOTORWAY_LANE_OFFSETS[Math.max(0,Math.min(3,Math.floor(Number(lane)||0)))];}
/** Stable individual preference; the persisted route keeps the selected lane. */
export function chooseMotorwayLane(actor){
 const remembered=actor?.brain?.driving?.motorwayLane;
 if(Number.isInteger(remembered)&&remembered>=0&&remembered<4)return remembered;
 let hash=2166136261;for(const c of String(actor?.id||''))hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 const traits=actor?.traits||{},jitter=((hash%1000)/999-.5)*.36;
 const preference=Math.max(0,Math.min(.999,Number(traits.risk??.5)*.45+Number(traits.ambition??.5)*.25+(1-Number(traits.thrift??.5))*.30+jitter));
 return 3-Math.floor(preference*4);
}
