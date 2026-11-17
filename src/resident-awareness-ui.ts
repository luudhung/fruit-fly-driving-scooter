import {isCarTrip} from './actor-transport.ts';
export type ResidentVision={heading:number;lastObservedAt:number;available?:boolean;unavailableReason?:string|null;observations:Array<{id:string;kind:string;name?:string;x:number;y:number;z:number;distance:number;confidence:number;source:'seen';observedAt:number}>};
export type ResidentAwareness={
 version?:number;algorithmOnly?:boolean;
 identity?:{id:string;name?:string;homeId?:string|null;householdId?:string|null;familyIds?:string[];workplaceId?:string|null};
 knownPlaces?:Array<{id:string;name?:string;source:string;lastSeenAt?:number;confidence?:number}>;
 seenPeople?:Array<{id:string;name?:string;lastSeenAt?:number;confidence?:number}>;
 milestones?:Array<{kind:string;at:number;locationId?:string;otherId?:string;outcome?:string}>;
 goals?:Array<{kind:string;priority:number}>;
 modeledAffect?:{fear:number;comfort:number;grief?:number;source?:string};lastObservedAt?:number;
};
export type AwareResident={id:string;name?:string;alive:boolean;x:number;y:number;z:number;vision?:ResidentVision|null;awareness?:ResidentAwareness|null;selfModel?:ResidentAwareness|null;residentSelf?:ResidentAwareness|null;indoors?:boolean;sleeping?:boolean;eyesClosed?:boolean;onTrain?:boolean;onPlane?:boolean;heliPassenger?:boolean;onPrivateHelicopter?:boolean;onFireEngine?:boolean;onAmbulance?:boolean;taxiPassenger?:boolean;traveling?:boolean;transitMode?:string};
const percent=(v:number)=>`${Math.round(Math.max(0,Math.min(1,Number(v)||0))*100)}%`;
const goalNames:Record<string,string>={safety:'An toàn',food:'Ăn uống',home:'Nhà ở',family:'Gia đình',work:'Công việc'};
const dayTime=(at:number)=>{if(!Number.isFinite(at))return 'Chưa ghi thời gian';const seconds=Math.max(0,at),day=Math.floor(seconds/86400)+1,h=Math.floor(seconds%86400/3600),m=Math.floor(seconds%3600/60);return `Ngày ${day} ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;};
/** Only formats recorded simulation fields; it never generates an inner monologue. */
export function residentAwarenessRows(actor:AwareResident|null,now:number){
 if(!actor)return {status:'Chọn một cư dân để xem.',rows:[] as Array<[string,string]>};
 const candidate=actor.awareness||actor.selfModel||actor.residentSelf,awareness=candidate?.identity&&candidate.identity.id!==actor.id?null:candidate,vision=actor.vision;
 const observations=(vision?.available===false||actor.sleeping||actor.eyesClosed?[]:vision?.observations||[]).filter(o=>o.source==='seen').slice(0,8);
 const unavailable=vision?.available===false||actor.sleeping||actor.eyesClosed;
 const reason=actor.sleeping||actor.eyesClosed||vision?.unavailableReason==='eyes_closed'?'đang nhắm mắt':vision?.unavailableReason==='inside_vehicle'?'đang ở trong phương tiện':'thị giác chưa sẵn sàng';
 const rows:Array<[string,string]>=[['Đang nhìn thấy',unavailable?`Không có quan sát hiện tại · ${reason}.`:observations.length?observations.map(o=>`${o.name||(o.kind==='resident'?'Người chưa quen':o.id)} · ${o.kind} · ${Math.round(o.distance)} m · ${percent(o.confidence)}`).join('\n'):'Chưa có quan sát được ghi nhận.']];
 if(vision&&Number.isFinite(vision.lastObservedAt))rows.push([unavailable?'Cập nhật thị giác':'Lần nhìn gần nhất',`${dayTime(vision.lastObservedAt)} · ${Math.max(0,Math.floor(now-vision.lastObservedAt))} giây mô phỏng trước`]);
 if(awareness){
  const identity=awareness.identity;
  if(identity)rows.push(['Thông tin bản thân',[identity.name||identity.id,identity.homeId&&`Nhà: ${identity.homeId}`,identity.workplaceId&&`Nơi làm: ${identity.workplaceId}`,identity.familyIds?.length&&`Gia đình: ${identity.familyIds.join(', ')}`].filter(Boolean).join('\n')]);
  rows.push(['Ưu tiên hiện tại',(awareness.goals||[]).slice(0,5).map(g=>`${goalNames[g.kind]||g.kind} ${percent(g.priority)}`).join(' · ')||'Chưa ghi nhận.']);
  if(awareness.modeledAffect)rows.push(['Cảm xúc mô phỏng',`Sợ hãi ${percent(awareness.modeledAffect.fear)} · Thoải mái ${percent(awareness.modeledAffect.comfort)}${awareness.modeledAffect.grief!==undefined?` · Buồn sau mất mát (mô phỏng) ${percent(awareness.modeledAffect.grief)}`:''}`]);
  rows.push(['Địa điểm đã biết',(awareness.knownPlaces||[]).slice(0,12).map(p=>`${p.name||p.id} · ${p.source}`).join('\n')||'Chưa ghi nhận.']);
  rows.push(['Người đã nhìn thấy',(awareness.seenPeople||[]).slice(0,8).map(p=>`${p.name||'Người chưa quen'}${p.confidence!==undefined?` · ${percent(p.confidence)}`:''}`).join('\n')||'Chưa ghi nhận.']);
  rows.push(['Dấu mốc đã trải qua',(awareness.milestones||[]).slice(-12).reverse().map(m=>`${dayTime(m.at)} · ${m.kind}${m.locationId?` · ${m.locationId}`:''}${m.otherId?` · ${m.otherId}`:''}${m.outcome?` · ${m.outcome}`:''}`).join('\n')||'Chưa có dấu mốc được ghi nhận.']);
 }
 return {status:actor.alive?'Mô hình nhận biết và ký ức dựa trên trạng thái, sự kiện và vật thực sự nhìn thấy.':'Cư dân đã mất · dữ liệu cuối cùng được ghi nhận.',rows};
}
export function residentEyeAvailable(actor:AwareResident|null|undefined){
 return Boolean(actor?.alive&&actor.vision&&actor.vision.available!==false&&[actor.x,actor.y,actor.z,actor.vision.heading,actor.vision.lastObservedAt].every(Number.isFinite)&&!actor.indoors&&!actor.sleeping&&!actor.eyesClosed&&!actor.onTrain&&!actor.onPlane&&!actor.heliPassenger&&!actor.onPrivateHelicopter&&!actor.onFireEngine&&!actor.onAmbulance&&!actor.taxiPassenger&&!isCarTrip(actor));
}
export type ViewerCameraState={x:number;y:number;z:number;yaw:number;pitch:number;fov:number;following:boolean};
export function residentEyeVerticalFov(aspect:number){return Math.min(80,2*Math.atan(Math.tan(55*Math.PI/180)/Math.max(.1,Number.isFinite(aspect)?aspect:1))*180/Math.PI);}
/** Holds one user-camera bookmark; resident viewing never changes the simulation/player. */
export class ResidentEyeSession{
 actorId:string|null=null;
 private previous:ViewerCameraState|null=null;
 begin(actor:AwareResident,state:ViewerCameraState){if(this.actorId||!residentEyeAvailable(actor))return false;this.previous={...state};this.actorId=actor.id;return true;}
 end(){const state=this.previous;this.actorId=null;this.previous=null;return state;}
 pose(actor:AwareResident|null|undefined,connected=true,position?:{x:number;y:number;z:number}){
  if(!this.actorId||actor?.id!==this.actorId||!connected||!residentEyeAvailable(actor))return null;
  const p=position||actor!;return {x:p.x,y:p.y+.55,z:p.z,yaw:actor!.vision!.heading,pitch:0};
 }
}
export class ResidentAwarenessUI{
 readonly root:HTMLElement;
 private readonly status:HTMLElement;
 private readonly fields:HTMLElement;
 private readonly button:HTMLButtonElement;
 private lastRows='';
 constructor(host:HTMLElement,onToggle:()=>void){
  this.root=document.createElement('section');this.root.id='resident-awareness';this.root.style.cssText='grid-column:1 / -1;padding:0 0 12px;border-bottom:1px solid #ffffff18;font-size:12px;line-height:1.55';
  const title=document.createElement('b');title.textContent='Góc nhìn & đời sống cư dân';this.root.append(title);
  this.status=document.createElement('p');this.status.style.cssText='opacity:.7;margin:5px 0 9px';this.root.append(this.status);
  this.button=document.createElement('button');this.button.type='button';this.button.style.cssText='min-height:42px;padding:8px 12px;border:1px solid #ffffff35;border-radius:8px;background:#19332b;color:inherit;font:inherit;cursor:pointer';this.button.addEventListener('click',onToggle);this.root.append(this.button);
  this.fields=document.createElement('div');this.fields.style.cssText='margin-top:10px;white-space:pre-wrap;overflow-wrap:anywhere';this.root.append(this.fields);
  host.prepend(this.root);this.sync(null,0,false);
 }
 sync(actor:AwareResident|null,now:number,viewing:boolean){
  const data=residentAwarenessRows(actor,now),key=JSON.stringify(data);
  if(key!==this.lastRows){
   const previousOpen=new Set([...this.fields.querySelectorAll('details[open]')].map(details=>details.querySelector('summary')?.textContent));
   const firstRender=!this.fields.childElementCount;
   this.lastRows=key;this.status.textContent=data.status;
   this.fields.replaceChildren(...data.rows.map(([label,value])=>{const details=document.createElement('details');details.style.margin='7px 0';details.open=previousOpen.has(label)||firstRender&&label==='Đang nhìn thấy';const summary=document.createElement('summary');summary.textContent=label;summary.style.cursor='pointer';const content=document.createElement('div');content.style.cssText='opacity:.85;padding:5px 0 5px 9px';content.textContent=value;details.append(summary,content);return details;}));
  }
  this.syncViewing(actor,viewing);
 }
 syncViewing(actor:AwareResident|null|undefined,viewing:boolean,allowView=true){
  const disabled=!viewing&&(!allowView||!residentEyeAvailable(actor)),text=viewing?'Trở lại góc nhìn của tôi':'Mắt cư dân';
  if(this.button.disabled!==disabled)this.button.disabled=disabled;
  if(this.button.textContent!==text)this.button.textContent=text;
  if(this.button.getAttribute('aria-pressed')!==String(viewing))this.button.setAttribute('aria-pressed',String(viewing));
  const title=disabled?'Cần cư dân còn sống, thức, ở ngoài trời và phiên mô phỏng đang chạy; hãy rời xe trước.':'Dùng góc nhìn và hướng mắt đã ghi nhận của cư dân.';
  if(this.button.title!==title)this.button.title=title;
 }
}
