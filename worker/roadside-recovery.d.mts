export function advanceRoadsideRecovery(world:any,person:any,headway?:(person:any,end:{x:number;z:number})=>number):boolean;
export function roadsideRecoveryView(person:any,at:number):null|{traveling:boolean;transitMode:string;motion:{at:number;speed:number;mode:string;blocked:boolean;points:any[]};routeWaypoints:any[];routeIndex:number};
