const onShift=(now,start,hours)=>Number.isFinite(start)&&((now%86400/3600-start+24)%24)<hours;
/** Active physical work and travel, independent of permanent job ownership. */
export function hasCountryCommitment(f,now,includeServiceShift=true){
 if(!f)return false;
 if(f.f1Duty?.role==='driver'&&Number(f.f1Duty.until||0)>now)return true;
 if(f.countryAirTrip||f.countryFlightPlan||f.internationalFreightDuty||f.nationalServiceDuty||f.nationalSupplyTask||f.nationalTrainingFlightId||f.nationalServiceResting||f.warResponse?.active)return true;
 const work=f.internationalWork;
 if(work&&(onShift(now,Number(work.shiftStart),Number(work.hours||8))||f.traveling&&f.targetLocationId===work.locationId))return true;
 return Boolean(includeServiceShift&&f.publicServiceRole&&onShift(now,Number(f.preferredWorkStart),Number(f.preferredWorkHours||8)));
}
