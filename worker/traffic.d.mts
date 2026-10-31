export type Junction={id:string;x:number;z:number};
export const INTERSECTIONS:Junction[];
export function signalState(seconds:number,axis:'ns'|'ew'):'green'|'yellow'|'red';
export function signalBarrier(start:{x:number;z:number},end:{x:number;z:number},seconds:number):null|{distance:number;id:string;axis:'ns'|'ew';x:number;z:number};
export function createVehicleIndex(drivers:Array<{id:string;alive:boolean;traveling?:boolean;transitMode?:string;x:number;z:number;targetX?:number;targetZ?:number}>):(f:{id:string;x:number;z:number},end:{x:number;z:number})=>number;
