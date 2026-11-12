export type DistrictProfile={id:string;name:string;focus:string;wage:number;housing:number;property:number;food:number;living:number;pollution:number;amenities:number};
export const DISTRICT_PROFILES:Record<string,DistrictProfile>;
export function districtAt(point?:{x?:number;z?:number;homeX?:number;homeZ?:number}):string;
export function districtProfile(point:string|{x?:number;z?:number;homeX?:number;homeZ?:number}):DistrictProfile;
export function districtPollution(point:unknown,state:unknown):number;
export function applyDistrictExposure(actor:any,state:any,daysPerYear?:number):void;
export function districtHousingUtility(actor:any,target:{x:number;z:number},workplace?:{x:number;z:number}):number;
