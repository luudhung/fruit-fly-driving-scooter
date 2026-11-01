import type {Point,MetroLine} from './city-map.mjs';
export type MetroWaypoint=Point&{y?:number;mode:string;lineId?:string;stage:string;stationIndex?:number;exitIndex?:number;direction?:number};
export const METRO_INTERCHANGES:Array<Point&{lineId:string;index:number;lines:string[]}>;
export function metroTransferWaypoints(a:MetroLine,ai:number,b:MetroLine,bi:number):MetroWaypoint[]|null;
export function planNetworkMetroRoute(a:Point,b:Point):null|{lineId:string;waypoints:MetroWaypoint[];score:number;entryIndex:number;exitIndex:number;transfers:number;fare:number;legs:Array<{lineId:string;entryIndex:number;exitIndex:number}>};
