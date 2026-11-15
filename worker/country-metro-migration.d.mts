export const COUNTRY_METRO_MIGRATION_VERSION:number;
export const NORTH_AIRPORT_METRO_MIGRATION_VERSION:number;
export const LEGACY_INTERNATIONAL_METRO:Record<string,{height:number;points:number[][];northLineId:string;mainLineId:string;splitIndex:number}>;
export function mapLegacyMetroStation(lineId:string,index:number):{lineId:string;index:number}|null;
export function migrateCountryMetroJourneys(state:any,hooks?:{replanResident?:(resident:any,chosen:{id:string;action:string})=>void}):{replanned:number;alighted:number;unresolved:string[]};

export function migrateNorthAirportMetroJourneys(state:any,hooks?:{replanResident?:(resident:any,chosen:{id:string;action:string})=>void}):{replanned:number;alighted:number;unresolved:string[]};
