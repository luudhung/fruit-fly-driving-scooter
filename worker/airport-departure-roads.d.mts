export type DeparturePoint={x:number;y:number;z:number};
export type DepartureWaypoint=DeparturePoint&{mode:'car';stage:string;airportDepartureRoad:boolean};
export const AIRPORT_DEPARTURE_ROAD:{id:string;version:number;deckStartIndex:number;deckEndIndex:number;width:number;deckTop:number;baseTop:number;carOffset:number;z:number;walkY:number;entry:DeparturePoint;exit:DeparturePoint;points:DeparturePoint[]};
export const AIRPORT_DEPARTURE_DROPOFFS:Array<DeparturePoint&{id:string;terminalId:string;kind:string;w:number;d:number;heading:number;entrance:DeparturePoint;walk:DeparturePoint[]}>;
export function airportDepartureDropoff(terminalId?:string):typeof AIRPORT_DEPARTURE_DROPOFFS[number];
export function airportDepartureDrive(terminalId?:string,exiting?:boolean):DepartureWaypoint[];
export function airportDepartureRoadLevels(point:{x:number;z:number},margin?:number):number[];
