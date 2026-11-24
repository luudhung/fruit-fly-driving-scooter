import type {HansdrexTerminal} from './hansdrex-airport-map.mjs';
export const AIRPORT_TERMINAL_RAIL:{id:string;fare:number;speed:number;dwell:number;y:number;z:number;trackOffset:number};
export const AIRPORT_TERMINAL_STATIONS:Array<{id:string;terminalId:string;x:number;z:number;y:number}>;
export function airportTerminalForStand(standOrId:string|{id?:string}|null|undefined):HansdrexTerminal;
export function airportTerminalById(id?:string):HansdrexTerminal;
export function airportTerminalAccess(id?:string):Array<{x:number;y:number;z:number}>;
export function airportTerminalTrainStates(seconds:number):Array<{id:string;direction:number;fare:number;x:number;y:number;z:number;heading:number;dwelling:boolean;stationId:string|null;visible:boolean}>;
export function airportTerminalTransfer(fromId:string,toId:string,at?:number,timeScale?:number):{fare:number;arrivalAt:number;trainId?:string;direction?:number;waypoints:Array<{x:number;y:number;z:number;at:number;mode:string;stage:string;lineId:string;fare:number}>};

export function airportDeparturePath(standOrId:string|{id?:string;x:number;z:number},terminalId?:string):Array<{x:number;y:number;z:number;stage:string}>;
export const AIRPORT_TAXI_BAYS:Array<{id:string;terminalId:string;kind:string;x:number;z:number;w:number;d:number;access:{x:number;z:number};walk:Array<{x:number;y:number;z:number}>}>;
