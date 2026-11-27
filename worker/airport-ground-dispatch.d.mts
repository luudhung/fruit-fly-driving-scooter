import type {VisitorAircraft} from './visitor-aviation.mjs';
export function airportOperatingFlights(flights:VisitorAircraft[],now:number):VisitorAircraft[];
export function prioritizeGroundDeparture(state:any,flight:VisitorAircraft,flights:VisitorAircraft[],readyAt:number):boolean;
export function priorityArrivalConflict(flight:VisitorAircraft,flights:VisitorAircraft[],now:number):boolean;

export function emptyAircraftDeadline(flight:VisitorAircraft):number;
