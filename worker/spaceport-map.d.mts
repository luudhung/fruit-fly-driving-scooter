type Rect={x:number;z:number;w:number;d:number};
export const SPACEPORT:Rect&{id:string;name:string;pad:{x:number;z:number;radius:number};apron:Rect};
export const SPACEPORT_BUILDINGS:Array<Rect&{id:string;name:string;h:number;kind:string}>;
export const SPACEPORT_LOCATIONS:Array<{id:string;name:string;x:number;z:number;type:string}>;
export const SPACEPORT_ROADS:Array<Rect&{id:string}>;
export type SpaceMission={id:string;label:string;departure:number;arrival:number};
export function spaceflightPose(age:number,mission:SpaceMission|null):{x:number;y:number;z:number;tilt:number;visible:boolean;firing:boolean};
