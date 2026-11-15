// Civilian West City launch campus, kept clear of both airport flight grounds.
export const SPACEPORT = {
 id:'spaceworks',name:'Hansdrex Spaceworks',x:-740,z:-468,w:240,d:110,
 pad:{x:-831,z:-478,radius:19},
 apron:{x:-758,z:-450,w:149,d:18},
};
export const SPACEPORT_BUILDINGS = [
 {id:'spaceworks-control',name:'Hansdrex Spaceworks · Mission Control',x:-670,z:-459,w:44,d:24,h:13,kind:'spaceport'},
 {id:'spaceworks-assembly',name:'Vehicle Assembly Hall',x:-743,z:-481,w:55,d:33,h:24,kind:'spaceport'},
 {id:'spaceworks-workshop',name:'Satellite Integration Lab',x:-680,z:-502,w:32,d:18,h:10,kind:'spaceport'},
 {id:'spaceworks-tower',name:'Launch Service Tower',x:-810,z:-478,w:5,d:6,h:34,kind:'spaceport'},
];
export const SPACEPORT_LOCATIONS = SPACEPORT_BUILDINGS.filter(b=>b.id!=='spaceworks-tower')
 .map(({id,name,x,z})=>({id,name,x,z,type:'job'}));
export const SPACEPORT_ROADS = [
 {id:'SPACEWORKS-ACCESS-ROAD',x:-760,z:-413.5,w:9,d:27},
 {id:'SPACEWORKS-CAMPUS-ROAD',x:-736,z:-427,w:174,d:9},
];

/** A bounded artist-authored flight path in game coordinates. */
export function spaceflightPose(age,mission){
 const base=SPACEPORT.pad;
 if(!mission||age<=mission.departure)return{x:base.x,y:.36,z:base.z,tilt:0,visible:true,firing:false};
 const t=Math.max(0,(age-mission.departure)/(mission.arrival-mission.departure));
 return{x:base.x-200*t*t,y:.36+1700*t*t,z:base.z+420*t*t,tilt:Math.min(1.12,t*1.3),visible:t<.88,firing:t<.88};
}
