import {SceneViewBudget,selectViewBudget,type ViewPoint} from './view-budget.ts';
type ArrivalActor={id:string;kind?:string;visitorPhase?:string;onPlane?:boolean;indoors?:boolean;motion?:{mode:string;timed?:boolean}|null};
/** Reserve part of the existing body budget for visible disembarking passengers. */
export function selectResidentView<T extends ArrivalActor>(actors:readonly T[],view:SceneViewBudget,point:(actor:T)=>ViewPoint|null,retained:ReadonlySet<string>,limit:number){
 const arrivals=actors.filter(f=>f.kind==='visitor'&&!f.onPlane&&(!f.indoors||f.motion?.timed&&f.motion.mode==='walk')&&['inbound','airport-arrival'].includes(f.visitorPhase||''));
 const selected=selectViewBudget(arrivals,view,point,f=>f.id,retained,Math.min(32,limit));
 const ids=new Set(selected.map(f=>f.id));
 return [...selected,...selectViewBudget(actors.filter(f=>!ids.has(f.id)),view,point,f=>f.id,retained,limit-selected.length)];
}
