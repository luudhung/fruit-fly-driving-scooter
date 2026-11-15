import type {NationalAircraft,NationalDefenseHooks} from './national-defense.mjs';
import type {NationalActor,NationalAccount} from './national-services.mjs';
export function tourHelicopterFlightId(flight:{id?:string;startsAt:number;endsAt:number}):string;
export function createNationalDefenseIntegration(hooks:{world:()=>any;urbanWorld:{applyWarDamage:(details:any)=>boolean};countryAccount:(countryId:string)=>NationalAccount;remember?:(actor:NationalActor,type:string,payload:any)=>void;emit?:(type:string,text:string,payload:any)=>void}):{
 init():void;
 getAircraft():NationalAircraft[];
 crashAircraft(id:string,details:Parameters<NonNullable<NationalDefenseHooks['crashAircraft']>>[1]):boolean;
 damageBuilding(details:Parameters<NonNullable<NationalDefenseHooks['damageBuilding']>>[0]):boolean;
 injureActor(actor:NationalActor,amount:number,details:{cause?:string;projectileId:string;countryId?:string}):boolean;
};
