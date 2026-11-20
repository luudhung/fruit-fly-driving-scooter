import {COUNTRY_IDS,NORTH_SPORTS_PARK} from './country-map.mjs';
import {SPORTS_VENUES} from './city-map.mjs';

/** Admissions use the mapped public entrances; play happens on the actual fields. */
export const SPORTS_ACTIVITY_VENUES=[
 {...SPORTS_VENUES.find(v=>v.id==='tennis'),kind:'tennis',countryId:COUNTRY_IDS.hansdrex,capacity:4,pickupPlayers:4,fee:2},
 {...SPORTS_VENUES.find(v=>v.id==='stadium'),kind:'stadium',countryId:COUNTRY_IDS.hansdrex,capacity:12,pickupPlayers:6,fee:0},
 {id:'north-tennis',name:'North Airport Tennis',kind:'tennis',countryId:COUNTRY_IDS.north,...NORTH_SPORTS_PARK.activities.find(v=>v.id==='north-tennis'),capacity:16,pickupPlayers:8,fee:2,courts:NORTH_SPORTS_PARK.tennis},
 {id:'north-football',name:'North Airport Football',kind:'football',countryId:COUNTRY_IDS.north,...NORTH_SPORTS_PARK.football,capacity:12,pickupPlayers:6,fee:0},
 {id:'north-golf',name:'North Airport Golf',kind:'golf',countryId:COUNTRY_IDS.north,...NORTH_SPORTS_PARK.golf,capacity:8,pickupPlayers:4,fee:5},
];

/** Deterministic movement of an existing admitted resident within the playing area. */
export function sportsPlayerPose(venue,slot,now,startsAt=now,role='player'){
 const elapsed=Math.max(0,now-startsAt),phase=elapsed/90+slot*1.7;
 if(role==='spectator')return{x:venue.x+(slot%2?18:-18),z:venue.z+Math.floor(slot/2)*2-20};
 if(venue.kind==='tennis'){
  const court=venue.courts?.[Math.floor(slot/4)]||venue;
  const x=venue.courts?court.x:(court.x+(slot<2?-10:10));
  return{x:x+Math.sin(phase)*3,z:court.z+(slot%2?8:-8)+Math.cos(phase*.7)*1.5};
 }
 if(venue.kind==='golf'){
  // A group walks a short circuit of tees/greens instead of standing at the gate.
  const t=(elapsed/2400+Math.floor(slot/4)*.14)%1,a=t*Math.PI*2;
  return{x:venue.x+Math.cos(a)*venue.w*.32+(slot%4-1.5)*2,z:venue.z+Math.sin(a)*venue.d*.32};
 }
 return{x:venue.x+(slot%3-1)*venue.w*.2+Math.sin(phase)*3,z:venue.z+(Math.floor(slot/3)%4-1.5)*venue.d*.16+Math.cos(phase*.8)*4};
}
