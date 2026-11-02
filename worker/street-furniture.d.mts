export type StreetCollider=Readonly<{id:string;x:number;z:number;minY:number;maxY:number}&({radius:number;w?:never;d?:never}|{radius?:never;w:number;d:number})>;
/** Immutable base-city furniture in actual renderer world coordinates. */
export const STREET_COLLIDERS:readonly StreetCollider[];
/** Broad phase only; intersect vertical ranges with the vehicle's actual world Y. */
export function streetCollidersNear(x:number,z:number,radius?:number):StreetCollider[];

/** Shared cached pole pose for the base city's signal renderer and colliders. */
export function signalPolePose(junction:{x:number;z:number},axis:'ns'|'ew'):Readonly<{x:number;z:number}>;
export const SIGNAL_POLE_PLACEMENT_ISSUES:readonly string[];
