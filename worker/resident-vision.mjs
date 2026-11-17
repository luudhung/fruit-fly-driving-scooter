import {BUILDINGS} from './city-map.mjs';

export const RESIDENT_VISION_RULES=Object.freeze({range:100,indoorRange:12,horizontalFovDegrees:110,verticalFovDegrees:80,eyeHeight:.55,maxObservations:8,maxCandidates:64,maxNodeVisits:256,maxOcclusionTests:192,cellSize:32,refreshSeconds:120});
const finite=Number.isFinite,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),pos=p=>p&&finite(p.x)&&finite(p.z)&&finite(p.y??1.1);
const validId=id=>typeof id==='string'&&id.length>0;
const distance2=(p,b)=>Math.max(b.minX-p.x,0,p.x-b.maxX)**2+Math.max(b.minY-p.y,0,p.y-b.maxY)**2+Math.max(b.minZ-p.z,0,p.z-b.maxZ)**2;
const pointBounds=p=>({minX:p.x,maxX:p.x,minY:p.y,maxY:p.y,minZ:p.z,maxZ:p.z});
function tree(items,depth=0){
 if(!items.length)return null;
 const axis=depth%2?'z':'x';items.sort((a,b)=>a[axis]-b[axis]||a.id.localeCompare(b.id));
 const middle=items.length>>1,item=items[middle],left=tree(items.slice(0,middle),depth+1),right=tree(items.slice(middle+1),depth+1),bounds={...item.bounds};
 for(const child of [left,right])if(child)for(const axis of ['X','Y','Z']){bounds['min'+axis]=Math.min(bounds['min'+axis],child.bounds['min'+axis]);bounds['max'+axis]=Math.max(bounds['max'+axis],child.bounds['max'+axis]);}
 return{item,left,right,bounds};
}
function nearest(root,eye,accept,stats){
 const result=[];let visited=0,limit=RESIDENT_VISION_RULES.range**2;
 const walk=node=>{
  if(!node||visited>=RESIDENT_VISION_RULES.maxNodeVisits||distance2(eye,node.bounds)>limit)return;
  visited++;const item=node.item,d2=distance2(eye,item.bounds);
  if(d2<=limit&&accept(item)){
   result.push({item,d2});result.sort((a,b)=>a.d2-b.d2||a.item.id.localeCompare(b.item.id));
   if(result.length>RESIDENT_VISION_RULES.maxCandidates)result.pop();
   if(result.length===RESIDENT_VISION_RULES.maxCandidates)limit=result.at(-1).d2;
  }
  const children=[node.left,node.right].filter(Boolean).sort((a,b)=>distance2(eye,a.bounds)-distance2(eye,b.bounds));
  for(const child of children)walk(child);
 };
 walk(root);stats.nodeVisits+=visited;return result;
}
// Slab intersection respects the vertical ray, so roofs do not hide an airborne
// observer's view and ground observers cannot look through tall solid facades.
function rayBox(from,to,b){
 let near=0,far=1;
 for(const [axis,min,max]of [['x','minX','maxX'],['y','minY','maxY'],['z','minZ','maxZ']]){
  const delta=to[axis]-from[axis];
  if(Math.abs(delta)<1e-8){if(from[axis]<b[min]||from[axis]>b[max])return false;continue;}
  let a=(b[min]-from[axis])/delta,c=(b[max]-from[axis])/delta;if(a>c)[a,c]=[c,a];
  near=Math.max(near,a);far=Math.min(far,c);if(near>far)return false;
 }
 return far>1e-5&&near<1-1e-5;
}
const cell=(x,z)=>Math.floor(x/RESIDENT_VISION_RULES.cellSize)+':'+Math.floor(z/RESIDENT_VISION_RULES.cellSize);
function sightPoint(item,eye){
 const b=item.bounds;
 return{x:clamp(eye.x,b.minX,b.maxX),y:clamp(eye.y,b.minY,b.maxY),z:clamp(eye.z,b.minZ,b.maxZ)};
}
function inFov(eye,target,heading){
 const dx=target.x-eye.x,dy=target.y-eye.y,dz=target.z-eye.z,horizontal=Math.hypot(dx,dz);
 if(horizontal<1e-5)return Math.abs(dy)<2;
 const cosine=(dx*Math.sin(heading)+dz*Math.cos(heading))/horizontal;
 return cosine>=Math.cos(RESIDENT_VISION_RULES.horizontalFovDegrees*Math.PI/360)&&Math.abs(Math.atan2(dy,horizontal))<=RESIDENT_VISION_RULES.verticalFovDegrees*Math.PI/360;
}
/** Semantic physical perception only: no pixels, player camera, remote APIs or
 * invisible resident attributes are passed to the decision model. */
export function createResidentVision({world,buildings=BUILDINGS,clock}={}){
 if(typeof world!=='function')throw TypeError('Resident vision requires a world getter');
 let indexedWorld,indexedAt,root=null,blockers=new Map();
 const stats={indexBuilds:0,nodeVisits:0,candidateChecks:0,occlusionTests:0,cacheHits:0,observations:0,budgetExhaustions:0};
 const now=(s,c)=>{const value=c??(typeof clock==='function'?clock():clock);return finite(value)?value:finite(value?.at)?value.at:finite(value?.simulationAgeSeconds)?value.simulationAgeSeconds:Number(s.simulationAgeSeconds||0);};
 function index(s,at){
  if(indexedWorld===s&&indexedAt===at)return;
  indexedWorld=s;indexedAt=at;blockers=new Map();const entities=[],identities=new Set(),current=s.urbanWorld?.buildings||{},base=typeof buildings==='function'?buildings(s):buildings,merged=new Map();
  for(const b of base||[])if(validId(b.id))merged.set(b.id,{...b,...current[b.id]});
  for(const b of Object.values(current))if(validId(b.id)&&!merged.has(b.id))merged.set(b.id,b);
  const add=record=>{if(validId(record.id)&&pos(record)&&!identities.has(record.kind+':'+record.id)){identities.add(record.kind+':'+record.id);entities.push(record);}};
  for(const b of merged.values()){
   if(!pos(b)||!(b.w>0&&b.d>0)||b.stage==='cleared'||b.stage==='demolished'||b.stage==='planned')continue;
   const height=Math.max(.2,Number(b.h||1))*(b.stage==='collapsed'?.12:b.stage==='construction'?Math.max(.1,Number(b.progress||.1)):1),floor=Number(b.y||0);
   const bounds={minX:b.x-b.w/2,maxX:b.x+b.w/2,minY:floor,maxY:floor+height,minZ:b.z-b.d/2,maxZ:b.z+b.d/2};
   const item={kind:b.kind==='landmark'?'landmark':'building',id:b.id,name:b.name,x:b.x,y:floor+height/2,z:b.z,bounds};add(item);
   // Extremely large parcels are still conservatively indexed, without millions
   // of empty grid cells from a malformed width/depth.
   const minX=Math.floor(bounds.minX/32),maxX=Math.floor(bounds.maxX/32),minZ=Math.floor(bounds.minZ/32),maxZ=Math.floor(bounds.maxZ/32);
   if((maxX-minX+1)*(maxZ-minZ+1)>4096){const list=blockers.get('*')||[];list.push(item);blockers.set('*',list);continue;}
   for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){const key=x+':'+z,list=blockers.get(key)||[];list.push(item);blockers.set(key,list);}
  }
  const raceGuests=[s.northF1?.event,...(s.northF1?.previousTours||[])].filter(Boolean).flatMap(event=>(event.charters||[]).filter(flight=>!flight.departed&&(flight.landed||finite(flight.inboundAt)&&flight.inboundAt<=at)).flatMap(flight=>(flight.guests||[]).filter(guest=>!['departed','denied','cancelled'].includes(guest.phase))));
  const people=[...(s.flies||[]),...(s.cityVisitors?.visitors||[]),...raceGuests];
  for(const f of people){
   if(!f?.alive||f.departed||!validId(f.id)||!pos(f))continue;
   if(f.transitMode==='car'&&f.traveling&&!f.onTrain&&!f.onPlane){const p={x:f.x,y:(f.y??1.1)+.3,z:f.z};add({kind:'vehicle',id:'vehicle:'+f.id,...p,indoors:Boolean(f.indoors),bounds:pointBounds(p)});continue;}
   if(f.onPlane||f.onTrain||f.onPrivateHelicopter||f.heliPassenger||f.taxiPassenger||f.onFireEngine||f.onAmbulance)continue;
   const p={x:f.x,y:(f.y??1.1)+.35,z:f.z};
   add({kind:'resident',id:f.id,name:f.name,...p,indoors:Boolean(f.indoors),householdId:f.householdId,currentLocationId:f.currentLocationId,bounds:pointBounds(p)});
  }
  const fleet=[...(s.industrialEconomy?.trucks||[]),...(s.regionalFreight?.trucks||[]),...(s.urbanWorld?.fireService?.engines||[]),...(s.urbanWorld?.fireService?.ambulances||[])];
  for(const v of fleet)if(pos(v)&&!v.destroyed&&!v.retired){const p={x:v.x,y:(v.y??1.1)+.4,z:v.z};add({kind:'vehicle',id:v.id,...p,indoors:Boolean(v.indoors),bounds:pointBounds(p)});}
  for(const fire of s.urbanWorld?.fires||[]){
   if(fire.containedAt||fire.intensity<=0)continue;const b=merged.get(fire.buildingId);if(!b||!pos(b))continue;
   const p={x:b.x,y:Number(b.y||0)+Math.max(1,Number(b.h||1))+.8,z:b.z};
   add({kind:'fire',id:fire.id,buildingId:b.id,...p,bounds:{minX:b.x-b.w/2,maxX:b.x+b.w/2,minY:Number(b.y||0)+.5,maxY:p.y,minZ:b.z-b.d/2,maxZ:b.z+b.d/2}});
  }
  root=tree(entities);stats.indexBuilds++;
 }
 function occluded(eye,to,target,budget){
  const seen=new Set(),candidates=[];
  const add=key=>{for(const b of blockers.get(key)||[])if(!seen.has(b.id)&&b.id!==target.id&&b.id!==target.buildingId){seen.add(b.id);candidates.push(b);}};
  add('*');
  const size=RESIDENT_VISION_RULES.cellSize,dx=to.x-eye.x,dz=to.z-eye.z;
  let x=Math.floor(eye.x/size),z=Math.floor(eye.z/size),endX=Math.floor(to.x/size),endZ=Math.floor(to.z/size);
  const sx=Math.sign(dx),sz=Math.sign(dz),stepX=sx?size/Math.abs(dx):Infinity,stepZ=sz?size/Math.abs(dz):Infinity;
  let nextX=sx?((sx>0?(x+1)*size:x*size)-eye.x)/dx:Infinity,nextZ=sz?((sz>0?(z+1)*size:z*size)-eye.z)/dz:Infinity;
  for(let steps=0;steps<32;steps++){
   add(x+':'+z);if(x===endX&&z===endZ)break;
   if(nextX<nextZ){x+=sx;nextX+=stepX;}
   else if(nextZ<nextX){z+=sz;nextZ+=stepZ;}
   else{add((x+sx)+':'+z);add(x+':'+(z+sz));x+=sx;z+=sz;nextX+=stepX;nextZ+=stepZ;}
  }
  candidates.sort((a,b)=>distance2(eye,a.bounds)-distance2(eye,b.bounds));
  for(const b of candidates){
   if(budget.tests>=RESIDENT_VISION_RULES.maxOcclusionTests){stats.budgetExhaustions++;return true;}
   budget.tests++;stats.occlusionTests++;if(rayBox(eye,to,b.bounds))return true;
  }
  return false;
 }
 function observe(f,c){
  const s=world(),at=now(s,c),old=f?.vision;
  if(!f||!f.alive)return [];
  const unavailable=!pos(f)?'invalid_position':f.sleeping||f.eyesClosed?'eyes_closed':f.onPlane||f.onTrain||f.heliPassenger||f.onPrivateHelicopter?'inside_vehicle':null;
  if(unavailable){
   f.vision={heading:finite(old?.heading)?old.heading:finite(f.heading)?f.heading:0,lastObservedAt:at,observations:[],available:false,unavailableReason:unavailable,eyeHeight:RESIDENT_VISION_RULES.eyeHeight,range:0,horizontalFovDegrees:RESIDENT_VISION_RULES.horizontalFovDegrees,verticalFovDegrees:RESIDENT_VISION_RULES.verticalFovDegrees};
   return f.vision.observations;
  }
  const speed=Math.hypot(Number(f.vx||0),Number(f.vz||0)),heading=speed>.08?Math.atan2(f.vx,f.vz):finite(old?.heading)?old.heading:finite(f.heading)?f.heading:0;
  const eye={x:f.x,y:(f.y??1.1)+RESIDENT_VISION_RULES.eyeHeight,z:f.z};
  if(old&&old.available!==false&&old.lastObservedAt<=at&&at-old.lastObservedAt<RESIDENT_VISION_RULES.refreshSeconds&&Math.hypot(f.x-old.eyeX,eye.y-(old.eyeY??eye.y),f.z-old.eyeZ)<2&&Math.abs(Math.atan2(Math.sin(heading-old.heading),Math.cos(heading-old.heading)))<.15&&old.indoors===Boolean(f.indoors)){
   stats.cacheHits++;return old.observations;
  }
  index(s,at);const indoors=Boolean(f.indoors),range=indoors?RESIDENT_VISION_RULES.indoorRange:RESIDENT_VISION_RULES.range;
  const candidates=nearest(root,eye,item=>{
   if(item.id===f.id||item.id==='vehicle:'+f.id)return false;
   const point=sightPoint(item,eye);if(Math.hypot(point.x-eye.x,point.y-eye.y,point.z-eye.z)>range||!inFov(eye,point,heading))return false;
   if(indoors)return item.kind==='resident'&&item.indoors&&f.householdId&&item.householdId===f.householdId&&f.currentLocationId&&item.currentLocationId===f.currentLocationId;
   return !item.indoors;
  },stats),observations=[],budget={tests:0};
  candidates.sort((a,b)=>(a.item.kind==='fire'?0:1)-(b.item.kind==='fire'?0:1)||a.d2-b.d2);
  for(const {item}of candidates){
   stats.candidateChecks++;const target=sightPoint(item,eye),distance=Math.hypot(target.x-eye.x,target.y-eye.y,target.z-eye.z);
   if(distance>range||!inFov(eye,target,heading)||!indoors&&occluded(eye,target,item,budget))continue;
   const confidence=Math.round(clamp(1-distance/range*.48,.45,1)*100)/100;
   const known=item.kind!=='resident'||item.id===f.partnerId||(f.parents||[]).includes(item.id)||(f.children||[]).includes(item.id)||(f.friends||[]).includes(item.id)||Object.hasOwn(f.socialTies||{},item.id)||Boolean(f.selfModel?.seenPeople?.some(p=>p.id===item.id&&p.name))||f.householdId&&item.householdId===f.householdId;
   observations.push({kind:item.kind,id:item.id,...(known&&item.name?{name:String(item.name)}:{}),x:target.x,y:target.y,z:target.z,distance:Math.round(distance*100)/100,confidence,source:'seen',observedAt:at});
   if(observations.length>=RESIDENT_VISION_RULES.maxObservations)break;
  }
  f.vision={heading,lastObservedAt:at,observations,available:true,unavailableReason:null,eyeHeight:RESIDENT_VISION_RULES.eyeHeight,range,horizontalFovDegrees:RESIDENT_VISION_RULES.horizontalFovDegrees,verticalFovDegrees:RESIDENT_VISION_RULES.verticalFovDegrees,eyeX:eye.x,eyeY:eye.y,eyeZ:eye.z,indoors};
  stats.observations+=observations.length;return observations;
 }
 return{observe,stats:()=>({...stats})};
}
