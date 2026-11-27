/** Passenger routes and fixed terminal architecture share these exact doors,
 * exterior stairs and upper-floor border-control lanes. No simulation state. */
export function airportTerminalPassengerLayout(t){
 const groundY=1.1,upperY=6.52,upperFloor=5.42,stairWidth=3.4;
 const point=(x,z,y=upperY)=>({x,y,z});
 const right=t.x+t.w/2,airsideX=t.x-26,back=t.z-t.d/2;
 const landside={
  approach:point(t.x,t.z+15.2,groundY),
  entry:point(right+3.5,t.z+15.2,groundY),
  foot:point(right+3.5,t.z+14,groundY),
  top:point(right+3.5,t.z+2),
  turn:point(right+3.5,t.z+.8),
  door:point(right,t.z+2),
  inside:point(right-4,t.z+2),
  corridor:point(right-4,t.z+6),
  upperEntrance:point(t.x,t.z+6),
 };
 const airside={door:point(airsideX,back),landing:point(airsideX,back-1.8),
  foot:point(airsideX,back-13.8,groundY),apron:point(airsideX,back-16,groundY)};
 const departureControls=[
  {...point(t.x-8,t.z+6),stage:'departure-check-in'},
  {...point(t.x-14,t.z+6),stage:'departure-security-queue'},
  {...point(t.x-20,t.z+6),stage:'departure-security'},
  {...point(t.x-26,t.z+4),stage:'departure-emigration-queue'},
  {...point(t.x-26,t.z+1),stage:'departure-emigration'},
  {...point(t.x-26,t.z-6),stage:'departure-concourse'},
 ];
 return {groundY,upperY,upperFloor,stairWidth,landside,airside,departureControls};
}
