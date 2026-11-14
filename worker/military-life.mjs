import {clearMetroAccessSegment} from './city-map.mjs';
import {MILITARY_NAVAL_BASE} from './government-map.mjs';
const DAY=86400,clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0)),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const ranks=[{id:'captain',name:'Đại úy · Chỉ huy trưởng',level:5,count:1},{id:'lieutenant',name:'Trung úy',level:4,count:2},{id:'sergeant',name:'Trung sĩ',level:3,count:5},{id:'corporal',name:'Hạ sĩ',level:2,count:8},{id:'private',name:'Binh nhì',level:1,count:50}];

/** One shared, inexpensive river circuit for the vessel and its actual crew. */
export function militaryShipPose(now,ship){
 const berth=MILITARY_NAVAL_BASE.berths.find(b=>b.id===ship.id)||MILITARY_NAVAL_BASE.berths[0],e=ship.exercise;
 if(!e||now<e.departure||now>=e.arrival)return{x:berth.x,y:.65,z:berth.z,heading:berth.heading||0,phase:'moored'};
 const north=ship.id.endsWith('2')?-900:-820,nodes=[[0,berth.x,berth.z],[.12,430,berth.z],[.38,420,north],[.70,410,-350],[.9,430,berth.z],[1,berth.x,berth.z]],u=clamp((now-e.departure)/(e.arrival-e.departure));let i=0;while(i<nodes.length-2&&u>nodes[i+1][0])i++;const a=nodes[i],b=nodes[i+1],t=(u-a[0])/(b[0]-a[0]);
 return{x:a[1]+(b[1]-a[1])*t,y:.65,z:a[2]+(b[2]-a[2])*t,heading:Math.atan2(b[1]-a[1],b[2]-a[2]),phase:'naval-exercise'};
}

/** Both the observer and server carry the same resident along the gangway and deck. */
export function militaryCrewPose(now,ship,memberId){
 const e=ship.exercise,berth=MILITARY_NAVAL_BASE.berths.find(b=>b.id===ship.id)||MILITARY_NAVAL_BASE.berths[0],i=Math.max(0,ship.crewIds.indexOf(memberId)),pose=militaryShipPose(now,ship);
 if(e&&now<e.departure){const u=clamp((now-Number(e.boardAt??e.departure-120))/120);return{x:490+(berth.x-490)*u,y:1.1+u*3.05,z:berth.z+(i-1.5)*1.3};}
 return{x:pose.x+(i%2?1:-1)*.8,y:pose.y+3.5,z:pose.z+(Math.floor(i/2)-.5)*1.8};
}

export function createMilitaryLife({world,roster,actor,now,random=()=>.5,neuralDrive=()=>.5,remember=()=>{},note=()=>{},supply,assignDuty,releaseDuty,target,onShift,outsideCommitment,recordViolation=()=>{}}){
 const raw=()=>world(),data=()=>raw().publicServices.militaryLife||={version:1,ships:[],exercise:null,shots:[],nextShotId:1,rifles:0,issuedRifles:{},ammunition:0,spentRounds:0,lastResupplyAt:0,nextRanksAt:0,nextThreatAt:0,trainingRounds:0,liveHits:0,friendlyHits:0,casualties:0};
 function equipment(){const d=data(),army=roster('army');for(const [id]of Object.entries(d.issuedRifles))if(!army.some(f=>f.id===id))delete d.issuedRifles[id];for(const f of army){if(!d.issuedRifles[f.id]&&Object.keys(d.issuedRifles).length<d.rifles)d.issuedRifles[f.id]=true;f.militaryArmed=Boolean(d.issuedRifles[f.id]);}}
 function promote(force=false){
  const d=data(),army=roster('army');if(!force&&now()<d.nextRanksAt&&army.some(f=>f.id===d.commanderId))return;d.nextRanksAt=now()+3600;
  const score=f=>Number(f.publicServiceTrainingHours||0)*.08+Number(f.professionSkills?.armyTraining||0)*14+Number(f.professionSkills?.marksmanship||0)*5+Number(f.traits?.resilience??.5)*2+neuralDrive(f,'socialDrive')*.7-Number(f.militaryDisciplinePoints||0)*3;
  const commander=army.find(f=>f.id===d.commanderId)||[...army].sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id))[0];d.commanderId=commander?.id||null;
  const ordered=[...(commander?[commander]:[]),...army.filter(f=>f!==commander).sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id))];let index=0;
  for(const rank of ranks)for(let n=0;n<rank.count&&index<ordered.length;n++){const f=ordered[index++],old=f.militaryRank?.id;f.militaryRank={id:rank.id,name:rank.name,level:rank.level};f.militaryCommanderId=d.commanderId;if(old&&old!==rank.id)remember(f,'military_rank_changed',{rank:rank.id,commanderId:d.commanderId});}
 }
 function init(){
  const d=data();d.issuedRifles||={};d.shots||=[];d.ships||=[];if(roster('army').length&&!d.endowment){
   d.rifles=50;d.ammunition=1600;d.endowment={version:1,at:now(),source:'user-authorized external defence equipment endowment',rifles:50,rounds:1600,patrolShips:2,assetValue:33640};
   for(const berth of MILITARY_NAVAL_BASE.berths)d.ships.push({id:berth.id,owned:true,crewIds:[],exercise:null,trips:0});note('military_endowment','The army received externally endowed rifles, ammunition and two patrol boats; treasury cash was unchanged.',{...d.endowment});
  }
  equipment();promote(true);for(const f of roster('army')){target(`ARMY-RANGE-${f.id}`,rangePoint(f),'Army firing position');if(f.publicServiceDuty?.kind==='formation')target(f.publicServiceDuty.targetId,formationPoint(f),'Army parade position');}for(const ship of d.ships){const berth=MILITARY_NAVAL_BASE.berths.find(b=>b.id===ship.id);if(berth)target(`NAVAL-BOARD-${ship.id}`,{x:490,z:berth.z},'Naval vessel gangway');}return d;
 }
 function formationPoint(f){const i=Math.max(0,roster('army').findIndex(a=>a.id===f.id));return{x:683+(i%10)*6,z:-639+Math.floor(i/10)*6};}
 function rangePoint(f){const i=Math.max(0,roster('army').findIndex(a=>a.id===f.id));return{x:790,z:-598+(i%3)*8};}
 function trainPresence(f,elapsed,kind){if(!['training','formation','range'].includes(kind)||elapsed<=0)return;f.professionSkills||={};const hours=Math.min(1800,elapsed)/3600;f.professionSkills.marksmanship=clamp(Number(f.professionSkills.marksmanship||0)+hours*(kind==='range'?.025:.005)*(.6+Number(f.traits?.resilience??.5)*.4));f.militarySafetyTraining=clamp(Number(f.militarySafetyTraining||0)+hours*.012);}
 function fireAt(shooter,aim,{training=false}={}){
  const d=data();if(!shooter?.alive||shooter.publicServiceRole!=='army'||!shooter.militaryArmed||d.ammunition<1||shooter.traveling||shooter.onTrain||shooter.onPlane||shooter.indoors||outsideCommitment(shooter)||shooter.health<35||distance(shooter,aim)>90)return null;
  const skill=Number(shooter.professionSkills?.marksmanship||0),risk=Number(shooter.traits?.risk??.5),error=(1-skill)*(1.5+risk*3)+Number(shooter.stress||0)*.025+Math.max(0,50-Number(shooter.energy||0))*.03;
  const from={x:shooter.x,y:Number(shooter.y||1.1)+.7,z:shooter.z},range=Math.min(90,distance(from,aim)),angle=Math.atan2(aim.z-from.z,aim.x-from.x)+(clamp(random(shooter))*2-1)*error*Math.PI/180,to={x:from.x+Math.cos(angle)*range,y:Number(aim.y??from.y),z:from.z+Math.sin(angle)*range};
  const intended={...to},steps=Math.max(1,Math.ceil(range));let previous={...from};for(let i=1;i<=steps;i++){const q={x:from.x+(intended.x-from.x)*i/steps,y:from.y+(intended.y-from.y)*i/steps,z:from.z+(intended.z-from.z)*i/steps};if(!clearMetroAccessSegment(previous,q)){Object.assign(to,previous);break;}previous=q;}const dx=to.x-from.x,dz=to.z-from.z,length2=dx*dx+dz*dz;
  d.ammunition--;d.spentRounds++;if(training)d.trainingRounds++;
  let victim=null,nearest=Infinity;
  for(const f of raw().flies){if(!f.alive||f===shooter||f.onPlane||f.onTrain||f.indoors)continue;const t=((f.x-from.x)*dx+(f.z-from.z)*dz)/Math.max(.0001,length2);if(t<=0||t>1||t>=nearest)continue;const y=from.y+(to.y-from.y)*t;if(Math.abs(y-(Number(f.y||1.1)+.6))>1.1)continue;if(Math.hypot(f.x-from.x-dx*t,f.z-from.z-dz*t)<.58){victim=f;nearest=t;}}
  if(victim){to.x=from.x+dx*nearest;to.z=from.z+dz*nearest;const damage=38+clamp(random(shooter))*24;victim.health=Math.max(0,Number(victim.health||0)-damage);victim.stress=clamp(Number(victim.stress||0)+28,0,100);d.liveHits++;const friendly=victim.publicServiceRole==='army';if(friendly)d.friendlyHits++;
   remember(victim,'firearm_injury',{shooterId:shooter.id,damage,training,friendly});remember(shooter,'firearm_hit',{victimId:victim.id,damage,training,friendly});
   if(training||friendly){shooter.militaryDisciplinePoints=Number(shooter.militaryDisciplinePoints||0)+1;shooter.socialTrust=Math.max(0,Number(shooter.socialTrust??.5)-.1);recordViolation(shooter,'reckless firearm injury',3);const commander=actor(d.commanderId);if(commander)remember(commander,'military_safety_incident',{shooterId:shooter.id,victimId:victim.id});}
   if(victim.health<=0&&victim.alive){victim.alive=false;victim.causeOfDeath='gunshot';victim.diedAtSimulationSeconds=now();raw().deaths=Number(raw().deaths||0)+1;d.casualties++;recordViolation(shooter,training?'fatal training accident':'firearm killing',6);note('military_casualty',`${victim.id} died from a firearm injury.`,{flyId:shooter.id,victimId:victim.id,training});}
  }
  shooter.professionSkills||={};if(training)shooter.professionSkills.marksmanship=clamp(skill+.004);const shot={id:`ARMY-SHOT-${d.nextShotId++}`,at:now(),shooterId:shooter.id,from,to,hitId:victim?.id||null,training};d.shots.push(shot);d.shots=d.shots.slice(-32);return shot;
 }
 function crewPose(f,ship){return militaryCrewPose(now(),ship,f.id);}
 function navalTick(clock){
  const d=data();for(const ship of d.ships){
   if(ship.exercise){for(const id of ship.crewIds){const f=actor(id);if(f?.alive&&f.militaryShipId===ship.id){const pose=crewPose(f,ship);Object.assign(f,{x:pose.x,y:pose.y,z:pose.z,onPlane:false,onTrain:false,indoors:false,traveling:false,action:'serving aboard a naval training patrol'});}}
    if(now()>=ship.exercise.arrival){for(const id of ship.crewIds){const f=actor(id);if(f?.militaryShipId===ship.id){Object.assign(f,{militaryShipId:null,x:490,y:1.1,z:ship.id.endsWith('2')?-630:-560,currentLocationId:'military-naval-dock',action:'completed a river patrol',actionUntil:now()+600});f.professionSkills||={};f.professionSkills.seamanship=clamp(Number(f.professionSkills.seamanship||0)+.025);remember(f,'naval_exercise_completed',{shipId:ship.id});}}ship.exercise=null;ship.crewIds=[];ship.trips++;ship.lastExerciseDay=d.exercise?.day;}
    continue;
   }
   if(!d.exercise||d.exercise.phase!=='combined'||ship.lastExerciseDay===d.exercise.day)continue;
   ship.crewIds=ship.crewIds.filter(id=>{const f=actor(id);return f?.alive&&f.publicServiceRole==='army'&&!f.onPlane&&!outsideCommitment(f);});
   if(!ship.crewIds.length){ship.crewIds=roster('army').filter(f=>!f.militaryShipId&&!f.militaryFlightId&&!f.onPlane&&!f.onTrain&&!f.traveling&&!outsideCommitment(f)&&onShift(f,clock)&&!(Number(f.professionSkills?.aviation||0)>=.2&&Number(f.publicServiceTrainingHours||0)>=8)&&f.energy>40&&f.health>60&&!d.ships.some(s=>s!==ship&&s.crewIds.includes(f.id))).slice(0,4).map(f=>f.id);for(const id of ship.crewIds){const f=actor(id),berth=MILITARY_NAVAL_BASE.berths.find(b=>b.id===ship.id),point=target(`NAVAL-BOARD-${ship.id}`,{x:490,z:berth.z},'Naval vessel gangway');releaseDuty(f);assignDuty(f,'naval-transfer',point.id,7200);}}
   const crew=ship.crewIds.map(actor);if(crew.length<2||crew.some(f=>!f?.alive||f.traveling||distance(f,{x:490,z:MILITARY_NAVAL_BASE.berths.find(b=>b.id===ship.id).z})>12))continue;
   if(Number(raw().treasury?.cash||0)<18)continue;const paid=supply(18);if(paid<18)continue;ship.exercise={boardAt:now(),departure:now()+120,arrival:now()+3720,day:d.exercise.day,fuelPaid:paid};for(const f of crew){releaseDuty(f,true);f.militaryShipId=ship.id;f.currentLocationId=null;f.traveling=false;f.routeWaypoints=[];}note('naval_exercise_departure',`${ship.id} departed with its actual crew.`,{shipId:ship.id,crewIds:[...ship.crewIds],fuelPaid:paid});
  }
 }
 function tick(clock){
  const d=data();if(!d.endowment&&roster('army').length)init();equipment();promote();const hour=Number(clock.hour||0)+Number(clock.minute||0)/60,day=Number(clock.day??Math.floor(now()/DAY));
  if(hour>=8&&hour<16){const phase=hour<9?'formation':hour<11?'range':'combined';if(!d.exercise||d.exercise.day!==day)d.exercise={day,startedAt:now(),phase,endsAt:now()+(16-hour)*3600};else d.exercise.phase=phase;}else d.exercise=null;
  if(d.ammunition<320&&now()-Number(d.lastResupplyAt||0)>=3600){const units=Math.min(400,Math.floor(Math.max(0,Number(raw().treasury?.cash||0))/.4));if(units>0){const paid=supply(units*.4);d.ammunition+=Math.floor(paid/.4+1e-6);d.lastResupplyAt=now();d.resupplyPaid=Number(d.resupplyPaid||0)+paid;}}
  for(const f of roster('army')){
   if(f.militaryShipId||f.militaryFlightId||f.onPlane||f.onTrain||f.traveling||outsideCommitment(f)||!onShift(f,clock)||f.energy<30||f.health<55||f.hunger>80)continue;
   if(Number(f.professionSkills?.aviation||0)>=.2&&Number(f.publicServiceTrainingHours||0)>=8&&raw().publicServices.aircraft.some(p=>p.owned&&!p.flight)){if(['training','formation','range'].includes(f.publicServiceDuty?.kind))releaseDuty(f);continue;}
   const index=roster('army').indexOf(f),cohort=(Math.floor(hour*2)+day)%Math.max(1,Math.ceil(roster('army').length/3)),wantedKind=d.exercise?.phase==='range'&&Math.floor(index/3)===cohort?'range':'formation';
   if(d.exercise&&['training','formation','range'].includes(f.publicServiceDuty?.kind)&&f.publicServiceDuty.kind!==wantedKind)releaseDuty(f);
   if(d.exercise&&d.exercise.phase==='range'&&f.publicServiceDuty?.kind==='range'&&distance(f,rangePoint(f))<4&&now()>=Number(f.nextMilitaryShotAt||0)){f.nextMilitaryShotAt=now()+1800;const willingness=.35+neuralDrive(f,'approachDrive')*.35+Number(f.traits?.ambition??.5)*.2+Number(f.traits?.resilience??.5)*.1-Number(f.stress||0)*.0025;if(random(f)<willingness)fireAt(f,{x:810,z:f.z,y:Number(f.y||1.1)+.7},{training:true});}
   if(!f.publicServiceDuty&&d.exercise){const kind=wantedKind,point=kind==='range'?rangePoint(f):formationPoint(f),id=`ARMY-${kind.toUpperCase()}-${f.id}`;target(id,point,kind==='range'?'Army firing position':'Army parade position');assignDuty(f,kind,id,kind==='range'?1800:3600);}
  }
  navalTick(clock);d.shots=d.shots.filter(s=>now()-s.at<600).slice(-32);
 }
 return{crewPose,init,tick,trainPresence,fireAt,promote,snapshot:()=>{const d=data();return{ships:d.ships.map(s=>({...s,crewIds:[...s.crewIds],exercise:s.exercise?{...s.exercise}:null})),exercise:d.exercise?{...d.exercise}:null,shots:d.shots.map(s=>({...s})),ammunition:d.ammunition,spentRounds:d.spentRounds,rifles:d.rifles,endowment:d.endowment||null,trainingRounds:d.trainingRounds,friendlyHits:d.friendlyHits,casualties:d.casualties,commanderId:d.commanderId||null};}};
}
