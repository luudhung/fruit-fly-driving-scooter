export type MilitaryRank={id:string;name:string;level:number};
export type MilitaryShip={id:string;owned:boolean;crewIds:string[];exercise:null|{departure:number;arrival:number;boardAt?:number;day?:number;fuelPaid?:number};trips?:number};
export type MilitaryShot={id:string;at:number;shooterId:string;from:{x:number;y:number;z:number};to:{x:number;y:number;z:number};hitId:string|null;training:boolean};
export type MilitaryLifeSnapshot={ships:MilitaryShip[];exercise:null|{day:number;startedAt:number;phase:'formation'|'range'|'combined';endsAt:number};shots:MilitaryShot[];ammunition:number;spentRounds:number;rifles:number;endowment:any;trainingRounds:number;friendlyHits:number;casualties:number;commanderId:string|null};
export function militaryShipPose(now:number,ship:MilitaryShip):{x:number;y:number;z:number;heading:number;phase:string};
export function militaryCrewPose(now:number,ship:MilitaryShip,memberId:string):{x:number;y:number;z:number};
export function createMilitaryLife(hooks:Record<string,any>):{init():any;tick(clock:{hour:number;minute?:number;day?:number}):void;trainPresence(actor:any,elapsed:number,kind:string):void;fireAt(actor:any,aim:{x:number;z:number;y?:number},options?:{training?:boolean}):MilitaryShot|null;promote(force?:boolean):void;crewPose(actor:any,ship:MilitaryShip):{x:number;y:number;z:number};snapshot():MilitaryLifeSnapshot};
