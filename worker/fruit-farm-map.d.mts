export type FruitFarmRect={id:string;x:number;z:number;w:number;d:number;h:number};
export const HANSDREX_FRUIT_FARM:{id:string;accountId:string;name:string;countryId:string;x:number;z:number;w:number;d:number;gate:{x:number;z:number};packingHouse:FruitFarmRect;capacity:number;trees:number};
export const FRUIT_FARM_BUILDINGS:Array<FruitFarmRect&{kind:string;countryId:string}>;
export const FRUIT_FARM_ROADS:Array<{id:string;x:number;z:number;w:number;d:number}>;
export const FRUIT_FARM_LOCATIONS:Array<{id:string;name:string;type:string;x:number;z:number}>;
