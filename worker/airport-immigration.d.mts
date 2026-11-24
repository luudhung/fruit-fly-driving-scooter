export type ImmigrationGate={id:string;airportId:string;index:number;x:number;z:number;axis:string;width:number;depth:number;queue:{x:number;z:number};exit:{x:number;z:number}};
export const IMMIGRATION_SERVICE_SECONDS:number;
export function airportImmigrationLayout(airportId?:string,terminalId?:string):null|{airportId:string;terminalId:string|null;gate:{x:number;z:number};terminal:{x:number;z:number;w:number;d:number};entry:{x:number;z:number};serviceSeconds:number;gates:ImmigrationGate[]};
export function passengerImmigrationGate(airportId:string,index?:number,terminalId?:string):null|ImmigrationGate&{queueIndex:number;serviceSeconds:number;gateCount:number;entry:{x:number;z:number};terminal:{x:number;z:number;w:number;d:number};terminalId:string|null;publicGate:{x:number;z:number}};
