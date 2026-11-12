export const HOUSING_CAPACITY_UNIT:'households';
export const GROUND_HOUSE_HOUSEHOLD_CAPACITY:1;
export function apartmentHouseholdCapacity(height:unknown):number;
export function occupiedHouseholdCount(block:{occupants?:string[]}):number;
export function apartmentHasVacancy(block:{h?:number;occupants?:string[]}):boolean;
export type HouseholdOccupancy={capacity:number;capacityUnit:'households';occupiedHouseholds:number;residentCount:number;overCapacityHouseholds:number};
export function normalizeHousingCapacities(housing:unknown,buildings?:Array<{id:string;h:number}>):void;
export function housingOccupancy(housing:unknown,residents?:Array<{alive:boolean;departed?:boolean;housingUnitId?:string}>):{apartments:Map<string,HouseholdOccupancy>;houses:Map<string,HouseholdOccupancy>};
