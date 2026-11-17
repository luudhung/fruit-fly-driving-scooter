export type SelfModelClock={simulationAgeSeconds?:number;at?:number;day?:number;hour?:number};
export type SelfModelPlace={id:string;name?:string;x?:number;z?:number;source:'seen'|'own-assignment'|'experienced';lastSeenAt:number;confidence:number;danger?:number;dangerAt?:number};
export type SelfModelMilestone={kind:string;at:number;importance?:number;locationId?:string;otherId?:string;outcome?:number};
export type SelfModelSnapshot={version:1;algorithmOnly:true;identity:{id:string|null;name:string|null;homeId:string|null;householdId:string|null;familyIds:string[];workplaceId:string|null};knownPlaces:SelfModelPlace[];seenPeople:SelfModelPlace[];milestones:SelfModelMilestone[];goals:Array<{kind:'safety'|'food'|'home'|'family'|'work';priority:number}>;modeledAffect:{fear:number;grief:number;comfort:number;source:'needs-and-observed-events'};lastObservedAt:number|null};
export const SELF_MODEL_LIMITS:Readonly<{places:12;people:8;milestones:12;bias:24}>;
export function createResidentSelfModel(hooks?:{world?:()=>any;remember?:(resident:any,kind:string,payload:Record<string,unknown>)=>void;workplaceFor?:(resident:any)=>{id:string;x?:number;z?:number}|null}):{
 observe(resident:any,vision:unknown[]|{observations:unknown[]},clock?:SelfModelClock):SelfModelSnapshot;
 remember(resident:any,kind:string,payload?:Record<string,any>,clock?:SelfModelClock):boolean;
 bias(resident:any,site:string|{id:string},action?:string):number;
 snapshot(resident:any):SelfModelSnapshot;
};
