export type NorthF1TrackClosure={startsAt:number;endsAt:number};
export type NorthF1ClosurePoint={x:number;z:number;y?:number};
type ClosureEvent=NorthF1TrackClosure&{status:string};
export function northF1ClosureWindow(event?:ClosureEvent|null):NorthF1TrackClosure|null;
export function northF1ClosureActive(window:NorthF1TrackClosure|null|undefined,at:number):boolean;
export function isNorthF1TrackClosed(state?:{simulationAgeSeconds:number;northF1?:{event?:ClosureEvent|null}}|null):boolean;
export function northF1PointRestricted(point:NorthF1ClosurePoint,margin?:number):boolean;
export function northF1MovementBlocked(from:NorthF1ClosurePoint,to:NorthF1ClosurePoint,margin?:number):boolean;
