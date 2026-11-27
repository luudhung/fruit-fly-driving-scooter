import type {Flight,AircraftPose} from './aviation.mjs';
export function regionalEmptyRotation(flight:Flight):{departure:number;exitAt:number;start:number;end:number;airportId:string;runwayId:string;timing:number[][];points:number[][]};
export function regionalAircraftVisibleUntil(flight:Flight):number;
export function regionalEmptyPose(now:number,flight:Flight):AircraftPose|null;
