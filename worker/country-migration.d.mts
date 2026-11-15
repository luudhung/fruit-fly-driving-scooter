export function residenceCountry(state:any,person:any):string;
export function ownsCountryHome(state:any,person:any,country:string):null|{unitId:string;householdId:string;title:string};
export function nationalResidencePlan(state:any,options?:{targetNorth?:number;targetTotal?:number;enforceDistrictRanking?:boolean;minDistrictGap?:number}):any;
export function applyNationalResidences(state:any,options?:{housingHomeLocation?:(home:any)=>string;remember?:(actor:any,event:string,data:any)=>void;targetNorth?:number;targetTotal?:number;enforceDistrictRanking?:boolean;minDistrictGap?:number}):any;
export function initializeNationality(state:any,person:any):void;
