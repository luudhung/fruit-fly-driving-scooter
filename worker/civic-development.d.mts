export type CivicFacilityType='workshop'|'factory'|'warehouse'|'power-plant'|'clinic'|'school';
export type CivicFunding='resident'|'treasury'|'power-grid';
export interface CivicFacilitySpec {readonly id:CivicFacilityType;readonly name:string;readonly usage:CivicFacilityType;readonly funding:CivicFunding;readonly w:number;readonly d:number;readonly h:number;readonly capacity:number;readonly serviceCapacity?:number;readonly industrySector?:'garments'|'food-production'|'building-materials'|'freight-logistics';readonly staff?:number;readonly shifts?:readonly number[];readonly hours?:number;readonly wage?:number;readonly skill?:string;readonly minimumSkill?:number;}
export interface CivicFacilityRecord {id:string;x:number;z:number;w:number;d:number;h:number;kind:string;name:string;stage:string;facilityType:CivicFacilityType;usage:CivicFacilityType;capacity:number;serviceCapacity:number;district:'north'|'west'|'europe';ownerId:string|null;frontage:{x:number;z:number};fundingAccountId:'treasury'|'power-grid'|null;industrySector?:string;createdAt:number;commissionedAt?:number;wagesPaid?:number;serviceSpending?:number;serviceVisits?:number;health:number;progress:number;}
export interface CivicFacilityEmployment {buildingId:string;shiftStart:number;wage:number;joinedAt:number;lastAt:number;wasPresent:boolean;lastPaidAt:number;suspended?:boolean;wageArrears?:number;nextRouteAt?:number;}
export interface CivicDemand {type:CivicFacilityType;score:number;reason:string;unmet:number;}
export interface CivicDevelopmentState {version:number;nextReviewAt:number;reviews:number;lastReviewedAt?:number;lastDemand:CivicDemand[];lastResult?:string;decisions:Array<{projectId:string;buildingId:string;type:CivicFacilityType;at:number;unmet:number;ownerId:string|null}>;}
export interface CivicServiceCapacity {power:number;clinic:number;school:number;staffedFacilities:number;}
export const CIVIC_FACILITY_CATALOG:Readonly<Record<CivicFacilityType,CivicFacilitySpec>>;
export function facilitySpec(id:string):CivicFacilitySpec|null;
export function isNonResidentialUsage(usage:unknown):boolean;
export function civicFacilities(state:any,options?:{includePlanned?:boolean}):CivicFacilityRecord[];
export function nationalDevelopmentDemand(state:any):CivicDemand[];
export function civicServiceCapacity(state:any,clock?:{hour:number;minute?:number}):CivicServiceCapacity;
export const DEVELOPMENT_REVIEW_INTERVAL:number;
