export type SportsField={x:number;z:number;w:number;d:number};
export type SportsVenue=SportsField&{id:string;name:string;kind:string;countryId:string;capacity:number;pickupPlayers:number;fee:number;courts?:SportsField[]};
export const SPORTS_ACTIVITY_VENUES:SportsVenue[];
export function sportsPlayerPose(venue:SportsVenue,slot:number,now:number,startsAt?:number,role?:string):{x:number;z:number};
