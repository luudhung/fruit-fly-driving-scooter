import test from 'node:test';
import assert from 'node:assert/strict';
import {ResidentEyeSession,residentEyeAvailable,residentAwarenessRows,residentEyeVerticalFov,type AwareResident,type ViewerCameraState} from '../src/resident-awareness-ui.ts';
const actor=():AwareResident=>({id:'FLY-1',name:'Mai',alive:true,x:10,y:1.2,z:30,vision:{heading:Math.PI/2,lastObservedAt:86420,available:true,observations:[{id:'CAFE-2',kind:'cafe',name:'Café du Pont',x:15,y:1,z:30,distance:5,confidence:.9,source:'seen',observedAt:86420}]}});
const bookmark:ViewerCameraState={x:400,y:120,z:-300,yaw:-2,pitch:-.5,fov:62,following:true};

test('resident eye field stays within modeled horizontal and vertical bounds on portrait and landscape screens',()=>{
 for(const aspect of [.5,1,16/9,3]){const vertical=residentEyeVerticalFov(aspect),horizontal=2*Math.atan(Math.tan(vertical*Math.PI/360)*aspect)*180/Math.PI;assert.ok(vertical<=80);assert.ok(horizontal<=110+1e-8);}
});

test('resident eye viewing bookmarks the user camera once and uses the observed heading with body-center eye height',()=>{
 const session=new ResidentEyeSession(),fly=actor(),saved={...bookmark};
 assert.equal(session.begin(fly,saved),true);saved.x=999;
 assert.equal(session.begin({...fly,id:'OTHER'},{...bookmark,x:999}),false,'an active view must not overwrite the original camera bookmark');
 assert.deepEqual(session.pose(fly,true,{x:11,y:2,z:31}),{x:11,y:2.55,z:31,yaw:Math.PI/2,pitch:0});
 assert.deepEqual(session.end(),bookmark);assert.equal(session.actorId,null);assert.equal(session.end(),null);
 assert.deepEqual(fly,actor(),'viewing is read-only and never changes the resident or its observed world');
});

test('a lost selection, dead resident or disconnected simulation cannot retain a resident eye pose',()=>{
 const session=new ResidentEyeSession(),fly=actor();session.begin(fly,bookmark);
 for(const candidate of [null,{...fly,id:'OTHER'},{...fly,alive:false},{...fly,indoors:true},{...fly,sleeping:true},{...fly,onTrain:true},{...fly,onPlane:true},{...fly,taxiPassenger:true},{...fly,traveling:true,transitMode:'car'}])assert.equal(session.pose(candidate),null);
 assert.equal(session.pose(fly,false),null);assert.deepEqual(session.end(),bookmark,'invalid viewing can still restore every user camera field');
 assert.equal(residentEyeAvailable({...fly,vision:undefined}),false);
 assert.equal(residentEyeAvailable({...fly,vision:{...fly.vision!,available:undefined}}),true,'legacy vision without the optional availability flag remains compatible');
 assert.equal(residentEyeAvailable({...fly,vision:{...fly.vision!,available:false,unavailableReason:'eyes_closed'}}),false);
 assert.equal(residentEyeAvailable({...fly,vision:{...fly.vision!,heading:NaN}}),false);
 assert.equal(residentEyeAvailable({...fly,x:Infinity}),false);
});

test('unknown people stay unnamed, unavailable eyes hide stale observations and grief is explicitly modeled',()=>{
 const fly=actor();fly.vision!.observations=[{...fly.vision!.observations[0],id:'FLY-SECRET',kind:'resident',name:undefined}];
 fly.awareness={identity:{id:fly.id},seenPeople:[{id:'FLY-SECRET',confidence:.7}],modeledAffect:{fear:.2,comfort:.3,grief:.8}};
 const rows=new Map(residentAwarenessRows(fly,86430).rows);
 assert.match(rows.get('Đang nhìn thấy')!,/Người chưa quen/);assert.doesNotMatch(rows.get('Đang nhìn thấy')!,/FLY-SECRET/);
 assert.equal(rows.get('Người đã nhìn thấy'),'Người chưa quen · 70%');
 assert.match(rows.get('Cảm xúc mô phỏng')!,/Buồn sau mất mát \(mô phỏng\) 80%/);
 fly.vision!.available=false;fly.vision!.unavailableReason='eyes_closed';
 assert.equal(new Map(residentAwarenessRows(fly,86430).rows).get('Đang nhìn thấy'),'Không có quan sát hiện tại · đang nhắm mắt.');
 fly.awareness.identity!.id='OTHER-RESIDENT';
 assert.equal(new Map(residentAwarenessRows(fly,86430).rows).has('Cảm xúc mô phỏng'),false,'a stale selection payload must never show another resident’s feelings');
});

test('awareness card reports real bounded observations, modeled goals and recorded events without inventing experiences',()=>{
 const fly=actor();fly.awareness={algorithmOnly:true,identity:{id:fly.id,name:'Mai',homeId:'HOME-5',familyIds:['CHILD-1']},goals:[{kind:'safety',priority:.8},{kind:'food',priority:.4}],modeledAffect:{fear:.35,comfort:.65,source:'needs-and-observed-events'},milestones:[{kind:'moved-home',at:86400,locationId:'HOME-5'},{kind:'met-person',at:86410,otherId:'FLY-2'}],knownPlaces:[{id:'HOME-5',source:'own-assignment'},{id:'CAFE-2',name:'Café du Pont',source:'seen'}]};
 const data=residentAwarenessRows(fly,86430),rows=new Map(data.rows);
 assert.match(data.status,/Mô hình/);assert.match(rows.get('Đang nhìn thấy')!,/Café du Pont · cafe · 5 m · 90%/);
 assert.equal(rows.get('Ưu tiên hiện tại'),'An toàn 80% · Ăn uống 40%');
 assert.match(rows.get('Cảm xúc mô phỏng')!,/Sợ hãi 35% · Thoải mái 65%/);
 assert.match(rows.get('Dấu mốc đã trải qua')!,/met-person · FLY-2\nNgày 2 00:00 · moved-home · HOME-5/);
 assert.match(rows.get('Lần nhìn gần nhất')!,/10 giây mô phỏng trước/);
 fly.vision!.observations=[];fly.awareness.milestones=[];
 const empty=new Map(residentAwarenessRows(fly,86430).rows);
 assert.equal(empty.get('Đang nhìn thấy'),'Chưa có quan sát được ghi nhận.');assert.equal(empty.get('Dấu mốc đã trải qua'),'Chưa có dấu mốc được ghi nhận.');
});

test('awareness presentation stays bounded even if a legacy snapshot contains oversized lists',()=>{
 const fly=actor(),observation=fly.vision!.observations[0];fly.vision!.observations=Array.from({length:40},(_,i)=>({...observation,id:String(i),name:String(i)}));
 fly.awareness={milestones:Array.from({length:40},(_,i)=>({kind:'event-'+i,at:i})),knownPlaces:Array.from({length:40},(_,i)=>({id:String(i),source:'seen'}))};
 const rows=new Map(residentAwarenessRows(fly,100).rows);
 assert.equal(rows.get('Đang nhìn thấy')!.split('\n').length,8);assert.equal(rows.get('Địa điểm đã biết')!.split('\n').length,12);assert.equal(rows.get('Dấu mốc đã trải qua')!.split('\n').length,12);
 assert.equal(residentAwarenessRows(null,0).rows.length,0);
});
