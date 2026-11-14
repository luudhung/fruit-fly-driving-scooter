export const THOUSAND_SETTLEMENT_VERSION:1;
export const SETTLEMENT_FURNISHINGS:Readonly<Record<string,number>>;
export function thousandSettlementPlan(state:any):null|{living:number;target:number;needed:number;militaryNeeded:number;groups:Array<{id:string;district:string;homes:Array<{type:string;id:string}>}>};
export function settleThousandResidents(state:any,hooks:{createResident:(options?:{militaryCadre?:boolean;ageYears?:number})=>any;releaseHousingUnit:(household:any)=>void;liquidMoneySupply:()=>number;parkingPoint?:(actor:any)=>any;remember?:(actor:any,event:string,data:any)=>void;emit?:(event:string,text:string,data:any)=>void}):number;
