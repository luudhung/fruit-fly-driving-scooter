export type Junction={id:string;x:number;z:number};
export const INTERSECTIONS:Junction[];
export function signalState(seconds:number,axis:'ns'|'ew'):'green'|'yellow'|'red';
export function signalBarrier(start:{x:number;z:number;y?:number;emergency?:boolean},end:{x:number;z:number},seconds:number):null|{distance:number;id:string;axis:'ns'|'ew';x:number;z:number};
export type TrafficActor={id:string;alive:boolean;traveling?:boolean;transitMode?:string;x:number;y?:number;z:number;targetX?:number;targetZ?:number;vx?:number;vz?:number;emergency?:boolean;routeIndex?:number;routeWaypoints?:Array<{x:number;z:number}>};
export function createVehicleIndex(drivers:TrafficActor[]):(f:{id:string;x:number;y?:number;z:number},end:{x:number;z:number})=>number;
