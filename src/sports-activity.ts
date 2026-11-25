import {SPORTS_ACTIVITY_VENUES,sportsPlayerPose,type SportsField,type SportsVenue} from '../worker/sports-venues.mjs';
import type {SportParticipant} from '../worker/sports-luxury.mjs';

export type SportsActivity={kind:string;venue:SportsVenue;field:SportsField;players:SportParticipant[]};
const venues=new Map(SPORTS_ACTIVITY_VENUES.map(v=>[v.id,v]));

/** Build once per snapshot; the frame loop only visits the nine mapped playing areas. */
export function sportsActivities(participants:readonly SportParticipant[]):SportsActivity[]{
 const groups=new Map<string,SportsActivity>(),seen=new Set<string>();
 for(const p of participants){
  if(p.role!=='player'||seen.has(p.id)||!Number.isFinite(p.startsAt)||!Number.isFinite(p.until)||p.until<=p.startsAt)continue;
  const venue=venues.get(p.venueId||(p.kind==='tennis'?'tennis':`north-${p.kind}`));
  if(!venue||venue.kind!==p.kind||!['tennis','golf','football'].includes(p.kind))continue;
  const slot=p.slot??0;if(!Number.isInteger(slot)||slot<0||slot>=venue.capacity)continue;
  const court=p.kind==='tennis'?Math.floor(slot/(venue.courts?4:2)):p.kind==='golf'?Math.floor(slot/4):0;
  const field=p.kind==='tennis'?(venue.courts?.[court]||{...venue,x:venue.x+(court?10:-10),w:17,d:34}):venue;
  const key=`${venue.id}:${court}`;
  let activity=groups.get(key);if(!activity){activity={kind:p.kind,venue,field,players:[]};groups.set(key,activity);}
  activity.players.push(p);seen.add(p.id);
 }
 return [...groups.values()];
}

export function sportsBallPose(activity:SportsActivity,now:number):{x:number;y:number;z:number}|null{
 const players=activity.players.filter(p=>now>=p.startsAt&&now<p.until);
 if(players.length<(activity.kind==='golf'?1:2))return null;
 const first=players[0],elapsed=now-Math.min(...players.map(p=>p.startsAt)),field=activity.field;
 if(activity.kind==='tennis'){
  if(!players.some(p=>(p.slot??0)%2!==((first.slot??0)%2)))return null;
  const phase=elapsed/28;
  return{x:field.x+Math.sin(phase*.7)*field.w*.22,y:.35+Math.abs(Math.cos(phase))*2,z:field.z+Math.sin(phase)*field.d*.34};
 }
 if(activity.kind==='golf'){
  const pose=sportsPlayerPose(activity.venue,first.slot??0,now,first.startsAt),stroke=(elapsed%480)/480;
  const travel=Math.min(1,stroke/.18),arc=stroke<.18?Math.sin(travel*Math.PI)*2:0;
  return{x:Math.max(field.x-field.w*.46,Math.min(field.x+field.w*.46,pose.x+travel*8)),y:.16+arc,z:pose.z};
 }
 return{x:field.x+Math.sin(elapsed/95)*field.w*.2,y:.4+Math.abs(Math.sin(elapsed/48))*.6,z:field.z+Math.sin(elapsed/150)*field.d*.25};
}
