export type VisitorAircraft = {
 terminalId?:string; motionVersion?:number; id:string; standId:string; sector:string; direction:number; inboundAt:number; parkedAt:number;airportId?:string;arrivalStand?:{id:string;x:number;z:number};
 outboundAt:number|null; exitAt:number|null; boardAt?:number|null; boardingStartedAt?:number; arrivingGuests?:number; passengerIds?:string[]; hold?:{x:number;y:number;z:number;at:number};
 kind?:'passenger'|'ferry'|'positioning'; runwayId?:string; aircraftGone?:boolean; standReleasedAt?:number; expectedStandReleaseAt?:number; arrivalPassengerIds?:string[]; arrivalCompleteAt?:number; landedAt?:number; disembarkAt?:number;
};
export type VisitorAircraftPose = {x:number;y:number;z:number;heading:number;phase:string};
export const VISITOR_STANDS:ReadonlyArray<{id:string;x:number;z:number}>;
export const VISITOR_TAXIWAY_Z:number;
export function visitorStands(airportId?:string):Array<{id:string;x:number;z:number}>;
export function visitorAirport(flight:VisitorAircraft):import('./country-map.mjs').CountryAirport;
export function visitorRunwaySlot(earliest:number,duration:number,flights:VisitorAircraft[],airportId?:string,runwayId?:string):number;
export const INBOUND_SECONDS:number;
export const MIN_VISITOR_PASSENGERS:number;
export const VISITOR_ARRIVAL_STAGGER:number;
export type VisitorArrivalPoint = {at:number;x:number;y:number;z:number;phase:string;kioskId?:string;queueIndex?:number;stage?:string};
export function visitorArrivalPath(flight:VisitorAircraft,index?:number,timeScale?:number):VisitorArrivalPoint[];
export function visitorArrivalPose(now:number,flight:VisitorAircraft,index?:number,timeScale?:number):null|{x:number;y:number;z:number;phase:string;indoors:boolean;onPlane:boolean;next?:VisitorArrivalPoint};
export function visitorAircraftPose(now:number,flight:VisitorAircraft):VisitorAircraftPose|null;

export function visitorRunways(airportId?:string):Array<import('./country-map.mjs').CountryAirport['runway'] & {id:string}>;
export function visitorFlightRunway(flight:VisitorAircraft):ReturnType<typeof visitorRunways>[number];
export function legacyVisitorStand(flight:VisitorAircraft):null|{id:string;x:number;z:number};
export function visitorStandReleaseAt(flight:VisitorAircraft):number;
export function visitorRunwayReservation(earliest:number,duration:number,flights:VisitorAircraft[],airportId?:string):{at:number;runwayId:string};
export function visitorStandReservation(earliest:number,flights:VisitorAircraft[],airportId?:string,groundStay?:number):null|{at:number;runwayId:string;stand:{id:string;x:number;z:number}};

export function resolveVisitorTaxiStand(flight:VisitorAircraft,flights:VisitorAircraft[],now:number):boolean;

export function visitorArrivalCompleteAt(flight:VisitorAircraft,count?:number,timeScale?:number):number;
export function visitorStairsClearAt(flight:VisitorAircraft,count?:number,timeScale?:number):number;

export type AirportArrivalMotion={at:number;speed:number;mode:'walk';timed:true;points:Array<{x:number;y:number;z:number;at:number}>};
export function visitorArrivalMotion(now:number,flight:VisitorAircraft,index?:number,timeScale?:number):AirportArrivalMotion|null;

export function visitorBoardingMotion(now:number,flight:VisitorAircraft,index?:number,timeScale?:number):AirportArrivalMotion|null;

export function visitorRunwayTiming(flight:VisitorAircraft,outbound?:boolean):{path:number[][];duration:number;touchdown:number;clear:number;release:number;runwayEnter:number;ground:number[]};
export function visitorFlightDuration(flight:VisitorAircraft,outbound?:boolean):number;
export function visitorTouchdownSeconds(flight:VisitorAircraft):number;
export function visitorRunwayClearSeconds(flight:VisitorAircraft):number;
export function visitorStandReleaseSeconds(flight:VisitorAircraft):number;

export function visitorDeparturePath(flight:VisitorAircraft,index?:number,timeScale?:number):VisitorArrivalPoint[];
export function visitorDepartureCompleteAt(flight:VisitorAircraft,count?:number,timeScale?:number):number;
export function visitorBoardingPose(now:number,flight:VisitorAircraft,index?:number,timeScale?:number):null|{x:number;y:number;z:number;onPlane:boolean};
