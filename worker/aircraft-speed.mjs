// World units per real second; shared with the player's unsprinted flight.
export const PLAYER_FLIGHT_SPEED=22;
export const AIRCRAFT_CRUISE_SPEED=PLAYER_FLIGHT_SPEED*1.5;
export const AIRCRAFT_TAXI_SPEED=6;
export const AIRCRAFT_TIME_SCALE=120;
/** Retain every geometric waypoint and assign physical travel time to each leg. */
export function aircraftPathTiming(points,taxiLeg=()=>false,{cruiseSpeed=AIRCRAFT_CRUISE_SPEED,accelerate=true}={}){
 let at=0,cruiseTime=0;const acceleration=accelerate?(cruiseSpeed-PLAYER_FLIGHT_SPEED)/12:0;
 return points.map((p,i)=>{
  if(!i)return[0,...p,0,0,0,0];
  const a=points[i-1],distance=Math.hypot(p[0]-a[0],p[1]-a[1],p[2]-a[2]),taxi=taxiLeg(i),v0=taxi?AIRCRAFT_TAXI_SPEED:Math.min(cruiseSpeed,accelerate?PLAYER_FLIGHT_SPEED+acceleration*cruiseTime:cruiseSpeed),gain=taxi?0:acceleration;
  const rampTime=gain>0?Math.max(0,(cruiseSpeed-v0)/gain):0,rampDistance=v0*rampTime+.5*gain*rampTime*rampTime;
  const seconds=distance<=rampDistance&&gain>0?(Math.sqrt(v0*v0+2*gain*distance)-v0)/gain:rampTime+(distance-rampDistance)/(taxi?AIRCRAFT_TAXI_SPEED:cruiseSpeed);
  if(!taxi)cruiseTime+=seconds;at+=seconds*AIRCRAFT_TIME_SCALE;
  return[at,...p,v0,gain,Math.min(seconds,rampTime),taxi?AIRCRAFT_TAXI_SPEED:cruiseSpeed];
 });
}
export function timedAircraftPose(points,elapsed){
 const next=points.findIndex(p=>p[0]>elapsed),i=next<0?points.length-1:Math.max(1,next),a=points[i-1],b=points[i],duration=b[0]-a[0],time=Math.max(0,Math.min(duration,elapsed-a[0])),distance=Math.hypot(b[1]-a[1],b[2]-a[2],b[3]-a[3]);
 const seconds=time/AIRCRAFT_TIME_SCALE,ramp=Math.min(seconds,b[6]||0),travel=b.length>4?b[4]*ramp+.5*b[5]*ramp*ramp+b[7]*(seconds-ramp):distance*time/Math.max(.000001,duration),u=distance?Math.max(0,Math.min(1,travel/distance)):1;
 return{x:a[1]+(b[1]-a[1])*u,y:a[2]+(b[2]-a[2])*u,z:a[3]+(b[3]-a[3])*u,heading:Math.atan2(b[1]-a[1],b[3]-a[3])};
}
