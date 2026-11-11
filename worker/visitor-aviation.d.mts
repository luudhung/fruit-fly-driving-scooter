export type VisitorAircraft = {
 id:string; standId:string; sector:string; direction:number; inboundAt:number; parkedAt:number;
 outboundAt:number|null; exitAt:number|null; boardAt?:number|null; arrivingGuests?:number; passengerIds?:string[]; hold?:{x:number;y:number;z:number;at:number};
};
export type VisitorAircraftPose = {x:number;y:number;z:number;heading:number;phase:string};
export const VISITOR_STANDS:ReadonlyArray<{id:string;x:number;z:number}>;
export const VISITOR_TAXIWAY_Z:number;
export function visitorAircraftPose(now:number,flight:VisitorAircraft):VisitorAircraftPose|null;
