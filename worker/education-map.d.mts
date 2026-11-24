export type MainSchoolCampus={id:string;name:string;x:number;z:number;w:number;d:number;h:number;kind:'education';usage:'school';facilityType:'school';countryId:'hansdrex';district:'main';capacity:number};
export const MAIN_SCHOOL_CAMPUSES:readonly MainSchoolCampus[];
export const MAIN_SCHOOL_IDS:readonly string[];
export function relocateGatewaySchool(state:any):{moved:boolean;interiors?:number;journeys?:number};
