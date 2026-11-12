export const REGIONAL_TRUCK_LIMIT:number;
export const REGIONAL_HUBS:string[];
export function createRegionalFreight(hooks:Record<string,any>):{init():any;tick(seconds:number):void;snapshot():any};
