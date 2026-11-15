export type VisitorAircraft = {
 id:string; standId:string; sector:string; direction:number; inboundAt:number; parkedAt:number;airportId?:string;arrivalStand?:{id:string;x:number;z:number};
 outboundAt:number|null; exitAt:number|null; boardAt?:number|null; arrivingGuests?:number; passengerIds?:string[]; hold?:{x:number;y:number;z:number;at:number};
 kind?:'passenger'|'ferry'; arrivalPassengerIds?:string[]; arrivalCompleteAt?:number; landedAt?:number; disembarkAt?:number;
};
export type VisitorAircraftPose = {x:number;y:number;z:number;heading:number;phase:string};
export const VISITOR_STANDS:ReadonlyArray<{id:string;x:number;z:number}>;
export const VISITOR_TAXIWAY_Z:number;
export function visitorStands(airportId?:string):Array<{id:string;x:number;z:number}>;
export function visitorAirport(flight:VisitorAircraft):import('./country-map.mjs').CountryAirport;
export function visitorRunwaySlot(earliest:number,duration:number,flights:VisitorAircraft[],airportId?:string):number;
export const MIN_VISITOR_PASSENGERS:number;
export const VISITOR_ARRIVAL_STAGGER:number;
export type VisitorArrivalPoint = {at:number;x:number;y:number;z:number;phase:string};
export function visitorArrivalPath(flight:VisitorAircraft,index?:number,timeScale?:number):VisitorArrivalPoint[];
export function visitorArrivalPose(now:number,flight:VisitorAircraft,index?:number,timeScale?:number):null|{x:number;y:number;z:number;phase:string;indoors:boolean;onPlane:boolean;next?:VisitorArrivalPoint};
export function visitorAircraftPose(now:number,flight:VisitorAircraft):VisitorAircraftPose|null;
