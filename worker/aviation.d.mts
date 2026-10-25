export const AVIATION:{seats:number;checkInSeconds:number;flightSeconds:number;heliSeats:number;heliSeconds:number};
export type Flight={id:string;from:string;to?:string;departure:number;arrival:number};
export type AircraftPose={x:number;y:number;z:number;heading:number;phase:string;from?:string;progress?:number};
export function tourismFares(level?:number):{oneWay:number;airportFee:number;roundTrip:number;resortNight:number;beachActivity:number;helicopter:number;currency:string};
export function nextFlight(now:number,from?:string,minimumLead?:number):Flight;
export function flightPose(now:number,flight:Flight):AircraftPose;
export function scheduledAircraft(now:number):AircraftPose;
export function helicopterPose(now:number,start:number,end:number):AircraftPose;
