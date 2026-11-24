export type AirportPoint={x:number;z:number};
export type AirportRect=AirportPoint&{w:number;d:number};
export type HansdrexRunway=AirportRect&{id:string;taxiwayZ:number;taxiBypassX:number[];endAroundTaxi:boolean};
export type HansdrexTerminal=AirportRect&{id:string;name:string;floors:number;floorHeight:number;gate:AirportPoint;standIds:string[]};
export const HANSDREX_AIRPORT:{terminal:HansdrexTerminal;terminals:HansdrexTerminal[];gate:AirportPoint;runway:HansdrexRunway;runways:HansdrexRunway[];stands:Array<AirportPoint&{id:string;terminalId:string}>;apron:AirportRect;aprons:Array<AirportRect&{id:string;terminalId:string}>;taxiwayZ:number;taxiBypassX:number[];taxiways:Array<AirportRect&{id:string}>;controlTower:AirportRect&{h:number};hangar:AirportRect&{h:number};helipad:AirportPoint&{y:number};heliAccess:AirportPoint};
type SavedAirportBuilding=AirportRect&{h?:number;originalHeight?:number;originalBlueprint?:Partial<AirportRect>};
type SavedAirportProject={id:string;buildingId:string;stage:string;kind:string;targetHeight?:number};
type SavedAirportWorker={urbanTask?:{id:string;phase?:string;nextRouteAt?:number;routeFailures?:number}|null;onTrain?:boolean;onPlane?:boolean;traveling?:boolean;routeWaypoints?:unknown[];vx?:number;vz?:number;actionUntil?:number};
export function relocateHansdrexAirport(state:{hansdrexAirportLayoutVersion?:number;flies?:SavedAirportWorker[];urbanWorld?:{buildings?:Record<string,SavedAirportBuilding>;projects?:SavedAirportProject[]}}):boolean;
