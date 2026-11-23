// World units per real second; shared with the player's unsprinted flight.
export const PLAYER_FLIGHT_SPEED=22;
export const AIRCRAFT_CRUISE_SPEED=PLAYER_FLIGHT_SPEED;
export const AIRCRAFT_TAXI_SPEED=6;
export const AIRCRAFT_TIME_SCALE=120;
/** Retain every geometric waypoint and assign physical travel time to each leg. */
export function aircraftPathTiming(points,taxiLeg=()=>false){
 let at=0;return points.map((p,i)=>{if(i){const a=points[i-1];at+=Math.hypot(p[0]-a[0],p[1]-a[1],p[2]-a[2])*AIRCRAFT_TIME_SCALE/(taxiLeg(i)?AIRCRAFT_TAXI_SPEED:AIRCRAFT_CRUISE_SPEED);}return[at,...p];});
}
export function timedAircraftPose(points,elapsed){
 const next=points.findIndex(p=>p[0]>elapsed),i=next<0?points.length-1:Math.max(1,next),a=points[i-1],b=points[i],u=Math.max(0,Math.min(1,(elapsed-a[0])/Math.max(.000001,b[0]-a[0])));
 return{x:a[1]+(b[1]-a[1])*u,y:a[2]+(b[2]-a[2])*u,z:a[3]+(b[3]-a[3])*u,heading:Math.atan2(b[1]-a[1],b[3]-a[3])};
}
