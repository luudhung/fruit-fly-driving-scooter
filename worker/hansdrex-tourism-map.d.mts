export type TourismPoint={x:number;z:number};
type Area=TourismPoint&{w:number;d:number};
export type HansdrexStorefront=TourismPoint&{id:string;buildingId:string;name:string;type:string;kind:'food'|'retail'|'entertainment'|'experience';price:number;color:number;axis:'x'|'z';side:number;span:number;depth:number;buildingX:number;buildingZ:number;europe:boolean};
export type TowerObservation=TourismPoint&{id:string;type:string;name:string;deck:TourismPoint&{y:number}};
export function buildHansdrexTourismMap(buildings:Array<Area&{id:string;kind:string;h:number}>,roads:Array<Area&{motorway?:boolean;motorwayAccess?:boolean}>,water:Area[],tower:TourismPoint):{storefronts:HansdrexStorefront[];observation:TowerObservation};
