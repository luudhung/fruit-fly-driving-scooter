export const HANSDREX_AIRLINE:Readonly<{id:string;name:string;countryId:string;seats:number;oneWayFare:number;roundTripFare:number;arrivalVisa:number;currency:string}>;
export function hansdrexAirlineAccount(state:any):any;
export function hansdrexReturnFare(person:any):number;
export function chargeHansdrexFare(state:any,person:any,direction:'inbound'|'outbound',options?:{reference?:string|null}):boolean;
export function hansdrexAirlineSummary(state:any):typeof HANSDREX_AIRLINE&{revenue:number;cash:number;inboundPassengers:number;outboundPassengers:number};

export function fundHansdrexRepatriation(state:any,person:any):boolean;
