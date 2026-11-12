// Synthetic city policy, expressed in simulation units rather than medical claims.
export const DISTRICT_PROFILES={
 main:{id:'main',name:'Main city',focus:'finance and company offices',wage:1.30,housing:1.35,property:1.40,food:1.20,living:1.20,pollution:.16,amenities:.96},
 europe:{id:'europe',name:'Tiểu khu châu Âu',focus:'public administration and military',wage:1.05,housing:1,property:1.08,food:1,living:1,pollution:.12,amenities:.87},
 north:{id:'north',name:'Thành phố phía Bắc',focus:'middle-income homes and high amenities',wage:1.06,housing:1.18,property:1.15,food:1.06,living:1.05,pollution:.10,amenities:.93},
 west:{id:'west',name:'Thành phố phía Tây',focus:'manufacturing, skilled trades and logistics',wage:.82,housing:.62,property:.62,food:.68,living:.72,pollution:.52,amenities:.70},
};
export function districtAt(point={}){
 const x=Number(point.x??point.homeX??0),z=Number(point.z??point.homeZ??0);
 if(z< -440&&x>=-470&&x<=100)return 'north';
 if(x< -440)return 'west';
 if(x>480)return 'europe';
 return 'main';
}
export function districtProfile(point){return DISTRICT_PROFILES[typeof point==='string'?point:districtAt(point)]||DISTRICT_PROFILES.main;}
export function districtPollution(point,state){
 const profile=districtProfile(point);if(profile.id!=='west')return profile.pollution;
 const plants=Object.values(state?.enterprises||{});
 const producing=plants.filter(p=>p.industrial&&p.industrialZone==='west'&&p.status==='operating'&&Number(p.lastProducedAt||0)>Number(state?.simulationAgeSeconds||0)-21600&&Number(p.productionUnits||0)>0).length;
 return Math.min(.82,profile.pollution+producing*.025);
}
/** A clocked dose avoids duplicated damage when several services process one actor. */
export function applyDistrictExposure(actor,state,daysPerYear=12){
 const now=Number(state.simulationAgeSeconds||0),previous=Number(actor.environmentSampleAt??now);
 actor.environmentSampleAt=now;if(!actor.alive||actor.visitor||now<=previous)return;
 const seconds=Math.min(21600,now-previous),years=seconds/(86400*daysPerYear);
 const home={x:actor.homeX,z:actor.homeZ},local={x:actor.x,z:actor.z};
 const dose=districtPollution(local,state)*(actor.indoors ? .65 : 1),residential=districtPollution(home,state);
 actor.pollutionExposureYears=Number(actor.pollutionExposureYears||0)+dose*years;
 actor.westResidenceYears=Number(actor.westResidenceYears||0)+(districtAt(home)==='west'?years:0);
 // Long exposure adds at most three model-years of age-related risk; moving reduces
 // the accumulating dose and gradually restores the avoidable component.
 const target=Math.min(3,Math.max(0,residential-.2)*8);
 const old=Number(actor.environmentalAgePenalty||0),rate=(target>old ? .20 : .10)*years;
 actor.environmentalAgePenalty=Math.max(0,Math.min(3,old+(target>old?Math.min(target-old,rate):-Math.min(old-target,rate))));
 actor.health=Math.max(0,Math.min(100,Number(actor.health||0)-Math.max(0,dose-.25)*years*1.2));
 actor.localAirQuality=Math.round((1-districtPollution(local,state))*100);
}
/** Individual housing preferences balance health, rent, commute and amenities. */
export function districtHousingUtility(actor,target,workplace){
 const current=districtProfile({x:actor.homeX,z:actor.homeZ}),next=districtProfile(target),t=actor.traits||{};
 const funds=Math.max(0,Number(actor.money||0)+Number(actor.savings||0));
 const healthConcern=(1-Number(t.risk??.5))*.5+Number(t.ambition??.5)*.3+Math.max(0,85-Number(actor.health||85))/100;
 const cleaner=(current.pollution-next.pollution)*healthConcern*85;
 const amenities=(next.amenities-current.amenities)*(18+Number(t.ambition??.5)*30);
 const expense=(next.housing-current.housing)*(funds<1000?45:funds<4000?23:8)*(0.7+Number(t.thrift??.5));
 const commute=workplace?(Math.hypot(actor.homeX-workplace.x,actor.homeZ-workplace.z)-Math.hypot(target.x-workplace.x,target.z-workplace.z))*.025:0;
 return cleaner+amenities-expense+commute;
}
