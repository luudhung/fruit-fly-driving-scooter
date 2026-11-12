import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,restoreState,moveFly,tickFly,gameClock,getSimulationConfig} from '../worker/civilization-engine.mjs';
import {METRO_LINES,BUILDINGS,entrance,metroStationGeometry,pedestrianRoute,trainState} from '../worker/city-map.mjs';
import {planNetworkMetroRoute,METRO_ACCESS_VERSION} from '../worker/metro-planner.mjs';
const destination=()=>entrance(BUILDINGS.find(b=>b.id==='garage'));
function oldGeometry(line,index){
 const p=line.points[index],a=line.points[Math.max(0,index-1)],b=line.points[Math.min(line.points.length-1,index+1)],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz)||1,side=index%2===0?1:-1;
 return {platform:{x:p[0]-dz/length*3.4*side,z:p[1]+dx/length*3.4*side,y:line.height+.25},access:{x:p[0]-dz/length*8.2*side,z:p[1]+dx/length*8.2*side,y:1.1}};
}
function legacyRoute(){
 const plan=planNetworkMetroRoute({x:-310,z:10},destination()),waypoints=[];
 for(const [i,leg] of plan.legs.entries()){
  const line=METRO_LINES.find(l=>l.id===leg.lineId),a=oldGeometry(line,leg.entryIndex),b=oldGeometry(line,leg.exitIndex),direction=Math.sign(leg.exitIndex-leg.entryIndex);
  if(i===0){waypoints.push(...pedestrianRoute({x:-310,z:10},a.access));for(let j=1;j<=7;j++)waypoints.push({x:a.access.x+(a.platform.x-a.access.x)*j/7,z:a.access.z+(a.platform.z-a.access.z)*j/7,y:1.1+(a.platform.y-1.1)*j/7,mode:'walk',lineId:line.id,stage:'station-stairs-up'});}
  else waypoints.push({...a.platform,mode:'walk',lineId:line.id,stage:'interchange-walk'});
  waypoints.push({...a.platform,mode:'walk',lineId:line.id,stage:'station-entry',stationIndex:leg.entryIndex,exitIndex:leg.exitIndex,direction});
  for(let j=leg.entryIndex;j!==leg.exitIndex+direction;j+=direction){const[x,z]=line.points[j];waypoints.push({x,z,y:line.height,mode:'metro',lineId:line.id,stage:'on-train'});}
  waypoints.push({...b.platform,mode:'walk',lineId:line.id,stage:'station-exit'});
  if(i===plan.legs.length-1){for(let j=1;j<=7;j++)waypoints.push({x:b.platform.x+(b.access.x-b.platform.x)*j/7,z:b.platform.z+(b.access.z-b.platform.z)*j/7,y:b.platform.y+(1.1-b.platform.y)*j/7,mode:'walk',lineId:line.id,stage:'station-stairs-down'});waypoints.push(...pedestrianRoute(b.access,destination()));}
 }
 return {plan,waypoints};
}
function fixture(){
 const state=freshState(),f=state.flies[0],old=legacyRoute();delete state.metroAccessVersion;state.mapVersion=19;
 Object.assign(f,{x:-310,y:1.1,z:10,alive:true,indoors:false,sleeping:false,traveling:true,onTrain:false,money:27,savings:100,transitPass:false,energy:95,health:100,hunger:10,vehicle:null,targetLocationId:'garage',finalTargetX:destination().x,finalTargetZ:destination().z,routeWaypoints:old.waypoints,routeIndex:0,metroLineId:old.plan.lineId,metroBoardingsThisTrip:0,transitMode:'walk',targetX:old.waypoints[0].x,targetZ:old.waypoints[0].z});
 return {state,f,...old};
}
function atWaypoint(f,index){const p=f.routeWaypoints[index];Object.assign(f,{x:p.x,y:p.y??1.1,z:p.z,routeIndex:index,targetX:p.x,targetZ:p.z,transitMode:p.mode,transitStage:p.stage});}
const protectedState=f=>({x:f.x,y:f.y,z:f.z,onTrain:f.onTrain,metroLineId:f.metroLineId,metroExitIndex:f.metroExitIndex,metroBoardingsThisTrip:f.metroBoardingsThisTrip,money:f.money,savings:f.savings,targetLocationId:f.targetLocationId,finalTargetX:f.finalTargetX,finalTargetZ:f.finalTargetZ,brainId:f.brain.id});
function restoreFixture(state,f){const before=protectedState(f),restored=restoreState(JSON.parse(JSON.stringify(state))),resident=restored.flies.find(x=>x.id===f.id);assert.deepEqual(protectedState(resident),before);assert.equal(restored.metroAccessVersion,METRO_ACCESS_VERSION);return {state:restored,f:resident};}
function assertPlatforms(f){for(const p of f.routeWaypoints.filter(p=>p.stage==='station-entry'||p.stage==='station-exit')){const line=METRO_LINES.find(l=>l.id===p.lineId);assert.deepEqual({x:p.x,y:p.y,z:p.z},metroStationGeometry(line,p.stationIndex,p.direction).platform);assert.equal(p.metroAccessVersion,METRO_ACCESS_VERSION);}}
function runToArrival(state,f){for(let i=0;i<2500&&f.traveling;i++){state.simulationAgeSeconds+=getSimulationConfig().gameSecondsPerRealSecond*.5;moveFly(f);}assert.equal(f.traveling,false,`journey stopped at ${f.transitStage}: ${f.action}`);assert.equal(f.currentLocationId,'garage');}

test('v19 ground and mid-stair saves migrate through the actual sidewalk access without teleporting or resetting fares',()=>{
 for(const climbing of [false,true]){
  let {state,f}=fixture();if(climbing){const index=f.routeWaypoints.findIndex(p=>p.stage==='station-stairs-up')+3;atWaypoint(f,index);}
  ({state,f}=restoreFixture(state,f));assertPlatforms(f);
  const firstEntry=f.routeWaypoints.find(p=>p.stage==='station-entry'),line=METRO_LINES.find(l=>l.id===firstEntry.lineId),access=metroStationGeometry(line,firstEntry.stationIndex).access;
  const stairIndex=f.routeWaypoints.findIndex(p=>p.stage==='station-stairs-up');assert.ok(stairIndex>0);assert.ok(f.routeWaypoints.slice(0,stairIndex).some(p=>Math.hypot(p.x-access.x,p.z-access.z)<.01));
  if(climbing)assert.equal(f.routeWaypoints[0].stage,'station-access-recovery');
  const encoded=JSON.stringify(f.routeWaypoints);({state,f}=restoreFixture(state,f));assert.equal(JSON.stringify(f.routeWaypoints),encoded,'second restore must not change the itinerary');
  runToArrival(state,f);assert.ok(f.metroBoardingsThisTrip>=2);assert.equal(f.money,26.5);assert.equal(f.savings,100);
 }
});

test('a saved platform waiter walks to the new platform before boarding the matching scheduled train',()=>{
 let {state,f}=fixture();atWaypoint(f,f.routeWaypoints.findIndex(p=>p.stage==='station-entry'));f.transitStage='platform-wait';
 ({state,f}=restoreFixture(state,f));assertPlatforms(f);assert.equal(f.onTrain,false);assert.equal(f.routeWaypoints[0].stage,'station-access-recovery');
 const entry=f.routeWaypoints.find(p=>p.stage==='station-entry');let boarded=false;
 for(let i=0;i<1000&&!boarded;i++){
  state.simulationAgeSeconds+=getSimulationConfig().gameSecondsPerRealSecond*.5;
  const before={x:f.x,y:f.y,z:f.z},line=METRO_LINES.find(l=>l.id===entry.lineId),train=trainState(line,state.simulationAgeSeconds/getSimulationConfig().gameSecondsPerRealSecond,entry.direction);moveFly(f);
  if(f.onTrain){boarded=true;assert.ok(Math.hypot(before.x-entry.x,before.z-entry.z,before.y-entry.y)<=.85);assert.equal(train.dwelling,true);assert.equal(train.from,entry.stationIndex);assert.equal(train.direction,entry.direction);}
 }
 assert.equal(boarded,true);assert.equal(f.metroBoardingsThisTrip,1);assert.equal(f.money,26.5);
});

test('an onboard save retains its train and paid fare while replacing the exit stairs and future interchange',()=>{
 let {state,f}=fixture();const entryIndex=f.routeWaypoints.findIndex(p=>p.stage==='station-entry'),entry=f.routeWaypoints[entryIndex],line=METRO_LINES.find(l=>l.id===entry.lineId),train=trainState(line,0);
 Object.assign(f,{onTrain:true,x:train.x,y:train.y,z:train.z,routeIndex:entryIndex,metroExitIndex:entry.exitIndex,metroExitWaypoint:f.routeWaypoints.findIndex(p=>p.stage==='station-exit'),transitStage:'on-train',metroBoardingsThisTrip:1,money:26.5});
 ({state,f}=restoreFixture(state,f));assertPlatforms(f);assert.equal(f.onTrain,true);assert.equal(f.metroExitWaypoint,0);assert.equal(f.routeWaypoints[0].stage,'station-exit');assert.equal(f.routeWaypoints[0].stationIndex,entry.exitIndex);
 runToArrival(state,f);assert.equal(f.metroBoardingsThisTrip,2);assert.equal(f.money,26.5);assert.equal(f.savings,100);
});

test('boarding guard repairs a stale road-center entry even when the global migration version is already current',()=>{
 const {state,f}=fixture();state.metroAccessVersion=METRO_ACCESS_VERSION;const index=f.routeWaypoints.findIndex(p=>p.stage==='station-entry');atWaypoint(f,index);const before=protectedState(f);
 moveFly(f);assert.deepEqual(protectedState(f),before);assert.equal(f.onTrain,false);assertPlatforms(f);assert.equal(f.routeWaypoints[0].stage,'station-access-recovery');
});

test('a last-line onboard save alights through the rendered switchback stairs without paying again',()=>{
 let {state,f}=fixture();const entryIndex=f.routeWaypoints.findLastIndex(p=>p.stage==='station-entry'),entry=f.routeWaypoints[entryIndex],line=METRO_LINES.find(l=>l.id===entry.lineId),train=trainState(line,0);
 Object.assign(f,{onTrain:true,x:train.x,y:train.y,z:train.z,routeIndex:entryIndex,metroLineId:line.id,metroExitIndex:entry.exitIndex,metroExitWaypoint:f.routeWaypoints.findIndex((p,i)=>i>entryIndex&&p.stage==='station-exit'),transitStage:'on-train',metroBoardingsThisTrip:2,money:26.5});
 ({state,f}=restoreFixture(state,f));assertPlatforms(f);const geometry=metroStationGeometry(line,entry.exitIndex,f.metroTrainDirection||entry.direction),stairs=f.routeWaypoints.filter(p=>p.stage==='station-stairs-down');
 for(const landing of geometry.stairs.slice(0,-1))assert.ok(stairs.some(p=>Math.hypot(p.x-landing.x,p.z-landing.z,p.y-landing.y)<.01),'exit route must visit every physical staircase landing');
 runToArrival(state,f);assert.equal(f.metroBoardingsThisTrip,2);assert.equal(f.money,26.5);
});

test('nearby Riverside journeys never encode an impossible direction-zero train',async()=>{
 const {LOCATIONS}=await import('../worker/city-map.mjs');
 for(const [a,b]of[['riverside-market','riverside-cafe'],['riverside-cafe','riverside-market'],['riverside-clinic','riverside-school']]){
  const plan=planNetworkMetroRoute(entrance(LOCATIONS.find(l=>l.id===a)),entrance(LOCATIONS.find(l=>l.id===b)));
  assert.ok(!plan||plan.legs.every(l=>l.entryIndex!==l.exitIndex));
  assert.ok(!plan||plan.waypoints.filter(p=>p.stage==='station-entry').every(p=>Math.abs(p.direction)===1));
 }
});

test('a deployed direction-zero platform queue exits once and reaches its destination without paying',()=>{
 const state=freshState(),f=state.flies[0],line=METRO_LINES[0],station=8,geo=metroStationGeometry(line,station),dest=destination();state.metroAccessVersion=1;
 const entry={...geo.platform,mode:'walk',lineId:line.id,stage:'station-entry',stationIndex:station,exitIndex:station,direction:0,metroAccessVersion:1};
 Object.assign(f,{...geo.platform,alive:true,indoors:false,traveling:true,onTrain:false,transitMode:'walk',routeWaypoints:[entry,{...geo.platform,mode:'walk',lineId:line.id,stage:'station-exit'},{...dest,mode:'walk',stage:'sidewalk'}],routeIndex:0,metroLineId:line.id,metroBoardingsThisTrip:0,money:27,savings:100,targetX:entry.x,targetZ:entry.z,targetLocationId:'garage',finalTargetX:dest.x,finalTargetZ:dest.z});
 const restored=restoreFixture(state,f);assert.ok(!restored.f.routeWaypoints.some(p=>p.stage==='station-entry'));runToArrival(restored.state,restored.f);assert.equal(restored.f.money,27);assert.equal(restored.f.metroBoardingsThisTrip,0);
});

test('3D progress survives a long vertical concourse climb in severe weather without replanning from the street',()=>{
 const s=freshState(),f=s.flies[0];Object.assign(s.weather,{condition:'thunderstorm',precipitation:1,wind:1,cloudCover:1});
 const route=[{x:2,z:0,y:40,mode:'walk',stage:'interchange-walk'},{x:2,z:0,y:40,mode:'walk',lineId:'M1',stage:'station-access-recovery'}];
 Object.assign(f,{x:2,z:0,y:10,traveling:true,onTrain:false,energy:0,transitMode:'walk',metroLineId:'M1',routeWaypoints:route,routeIndex:0,targetX:2,targetZ:0,travelLastDistance:30,travelStuckTicks:0,targetLocationId:'garage'});
 for(let i=0;i<12;i++)moveFly(f);
 assert.equal(f.routeWaypoints,route);assert.ok(f.y>20);assert.equal(f.travelStuckTicks,0);assert.equal(f.routeIndex,0);
});

test('all lines board residents in both directions, keep their physical train, and finish in bad weather',()=>{
 const s=freshState();Object.assign(s.weather,{condition:'heavy rain',precipitation:1,wind:.9,cloudCover:1});const actors=[];
 for(const line of METRO_LINES)for(const direction of [1,-1]){
  const f=s.flies[actors.length],entryIndex=direction===1?0:line.points.length-1,exitIndex=direction===1?line.points.length-1:0,a=metroStationGeometry(line,entryIndex,direction),b=metroStationGeometry(line,exitIndex,direction);
  const waypoints=[...a.stairs.map(p=>({...p,mode:'walk',stage:'station-stairs-up',lineId:line.id,direction})),{...a.platform,mode:'walk',stage:'station-entry',lineId:line.id,stationIndex:entryIndex,exitIndex,direction,metroAccessVersion:METRO_ACCESS_VERSION},{...a.track,mode:'metro',stage:'on-train',lineId:line.id},{...b.platform,mode:'walk',stage:'station-exit',lineId:line.id,stationIndex:exitIndex,direction,metroAccessVersion:METRO_ACCESS_VERSION},...[...b.stairs].reverse().map(p=>({...p,mode:'walk',stage:'station-stairs-down',lineId:line.id,direction})),{...b.access,mode:'walk',stage:'sidewalk'}];
  Object.assign(f,{...a.access,alive:true,indoors:false,sleeping:false,energy:12,health:95,traveling:true,onTrain:false,routeWaypoints:waypoints,routeIndex:0,targetX:waypoints[0].x,targetZ:waypoints[0].z,transitMode:'walk',transitStage:waypoints[0].stage,metroLineId:line.id,metroTrainId:null,metroTrainDirection:null,metroBoardingsThisTrip:0,targetLocationId:'garage',finalTargetX:b.access.x,finalTargetZ:b.access.z,money:10,savings:100,transitPass:false,vehicle:null,travelLastDistance:null,travelStuckTicks:0});actors.push(f);
 }
 const pinned=new Map(),boarded=new Set();
 for(let i=0;i<5000&&actors.some(f=>f.traveling);i++){
  s.simulationAgeSeconds+=getSimulationConfig().gameSecondsPerRealSecond*.5;
  for(const f of actors){const was=f.onTrain,id=f.metroTrainId;moveFly(f);if(f.onTrain){boarded.add(f.id);assert.ok(f.metroTrainId);if(was)assert.equal(f.metroTrainId,id);pinned.set(f.id,f.metroTrainId);}}
 }
 assert.equal(boarded.size,METRO_LINES.length*2);assert.equal(new Set(pinned.values()).size,METRO_LINES.length*2,'each line/direction boards a separate physical shuttle');
 for(const f of actors){assert.equal(f.traveling,false,`${f.id} stuck at ${f.transitStage}: ${f.action}`);assert.equal(f.metroBoardingsThisTrip,1);assert.equal(f.money,9.5);}
});

test('coarse background ticks catch a missed platform visit and destination on the same pinned train',()=>{
 const s=freshState(),f=s.flies[0],line=METRO_LINES[0],a=metroStationGeometry(line,0,1),b=metroStationGeometry(line,2,1);
 s.simulationAgeSeconds=(trainState(line,0,1).cycleSeconds-15)*getSimulationConfig().gameSecondsPerRealSecond;const entry={...a.platform,mode:'walk',stage:'station-entry',lineId:line.id,stationIndex:0,exitIndex:2,direction:1,metroAccessVersion:METRO_ACCESS_VERSION},route=[entry,{...a.track,mode:'metro',stage:'on-train',lineId:line.id},{...b.platform,mode:'walk',stage:'station-exit',lineId:line.id,stationIndex:2,direction:1,metroAccessVersion:METRO_ACCESS_VERSION},{...b.platform,mode:'walk',stage:'station-access-recovery'}];
 Object.assign(f,{...a.platform,traveling:true,onTrain:false,indoors:false,routeWaypoints:route,routeIndex:0,targetX:entry.x,targetZ:entry.z,metroLineId:line.id,metroTrainId:null,metroTrainDirection:null,metroPlatformCheckedAt:null,metroTrainCheckedAt:null,metroBoardingsThisTrip:0,transitMode:'walk',money:10,savings:100,transitPass:false,targetLocationId:'garage'});
 moveFly(f);assert.equal(f.onTrain,false);assert.equal(f.transitStage,'platform-wait');
 s.simulationAgeSeconds+=31*getSimulationConfig().gameSecondsPerRealSecond;moveFly(f);assert.equal(f.onTrain,true,'must board the visit between samples even though the train already departed');const id=f.metroTrainId;
 for(let i=0;i<100&&f.traveling;i++){s.simulationAgeSeconds+=31*getSimulationConfig().gameSecondsPerRealSecond;moveFly(f);assert.equal(f.metroTrainId,id);}
 assert.equal(f.traveling,false);assert.equal(f.metroBoardingsThisTrip,1);assert.equal(f.money,9.5);
});

test('the actual resident tick keeps a committed metro staircase during heavy rain instead of restarting a shelter route',()=>{
 const s=freshState(),f=s.flies[0],plan=planNetworkMetroRoute({x:-310,z:10},destination()),route=plan.waypoints,index=route.findIndex(p=>p.stage==='station-stairs-up');
 Object.assign(s.weather,{condition:'thunderstorm',precipitation:1,wind:1,cloudCover:1});
 Object.assign(f,{alive:true,traveling:true,onTrain:false,indoors:false,sleeping:false,routeWaypoints:route,metroLineId:plan.lineId,transitMode:'walk',metroBoardingsThisTrip:0,targetLocationId:'garage',pendingAction:'commuting to work',action:'climbing metro stairs',energy:95,health:100,hunger:10,thirst:10,vehicle:null,urbanTask:null,socialTask:null,arrestedUntil:0,wantedUntil:0});atWaypoint(f,index);
 const startY=f.y;
 for(let i=0;i<25;i++){s.simulationAgeSeconds+=60;tickFly(f,gameClock());assert.equal(f.routeWaypoints,route,'routine rain sheltering must not replace the committed metro route');assert.equal(f.targetLocationId,'garage');assert.notEqual(f.pendingAction,'sheltering from bad weather');}
 assert.ok(f.y>startY);assert.ok(f.routeIndex>index);
});
