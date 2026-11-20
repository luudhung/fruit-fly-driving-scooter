export type ImmigrationGate={id:string;airportId:string;index:number;x:number;z:number;axis:string;width:number;depth:number;queue:{x:number;z:number};exit:{x:number;z:number}};
export const IMMIGRATION_SERVICE_SECONDS:number;
export function airportImmigrationLayout(airportId?:string):null|{airportId:string;terminal:{x:number;z:number;w:number;d:number};entry:{x:number;z:number};serviceSeconds:number;gates:ImmigrationGate[]};
export function passengerImmigrationGate(airportId:string,index?:number):null|ImmigrationGate&{queueIndex:number;serviceSeconds:number;gateCount:number;entry:{x:number;z:number}};
