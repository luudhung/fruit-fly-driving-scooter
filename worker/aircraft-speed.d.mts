export const PLAYER_FLIGHT_SPEED:number;
export const AIRCRAFT_CRUISE_SPEED:number;
export const AIRCRAFT_TAXI_SPEED:number;
export const AIRCRAFT_TIME_SCALE:number;
export function aircraftPathTiming(points:number[][],taxiLeg?:(i:number)=>boolean):number[][];
export function timedAircraftPose(points:number[][],elapsed:number):{x:number;y:number;z:number;heading:number};
