import {visitorRunwaySlot,visitorRunwayTiming,visitorFlightDuration,visitorStandReleaseSeconds,visitorTouchdownSeconds} from './visitor-aviation.mjs';

/** Protect actual approaches and every accepted departure clearance. A not-yet-started booking cannot keep a ready aircraft at a gate
 * for days; that booking rechecks its landing slot before starting approach. */
export function airportOperatingFlights(flights,now){
 return flights.filter(f=>!f.aircraftGone).map(f=>({...f,inboundAt:Number(f.inboundAt)<=now?f.inboundAt:null}));
}
export function prioritizeGroundDeparture(state,flight,flights,readyAt){
 const now=Number(state.simulationAgeSeconds||0);
 if(Number.isFinite(flight.groundDeparturePriorityAt))return false;
 if(flight.aircraftGone||flight.taxiHold||!Number.isFinite(flight.parkedAt)||flight.parkedAt>now||!Number.isFinite(readyAt)||readyAt>now||flight.outboundAt!=null&&flight.outboundAt<=now+3600)return false;
 const budget=state.airportGroundDispatch||={at:now,counts:{}};if(budget.at!==now){budget.at=now;budget.counts={};}
 const airport=flight.airportId||'city';if(Number(budget.counts[airport]||0)>=2)return false;
 budget.counts[airport]=Number(budget.counts[airport]||0)+1;
 const timing=flight.motionVersion>=1?visitorRunwayTiming(flight,true):null;
 const at=visitorRunwaySlot(now+120,visitorFlightDuration(flight,true),airportOperatingFlights(flights,now),airport,flight.runwayId,timing);
 // Do not replace an already better clearance. The budget still bounds work.
 if(flight.outboundAt!=null&&at>=flight.outboundAt)return false;
 flight.outboundAt=at;flight.exitAt=at+visitorFlightDuration(flight,true);
 flight.expectedStandReleaseAt=flight.standReleasedAt=at+visitorStandReleaseSeconds(flight);
 flight.groundDeparturePriorityAt=now;return true;
}
export function priorityArrivalConflict(flight,flights,now){
 if(flight.taxiHold||flight.landed||flight.landedAt!=null||Number.isFinite(flight.touchdownAt)||!Number.isFinite(flight.inboundAt)||flight.inboundAt>now)return false;
 const priority=flights.filter(f=>f!==flight&&!f.aircraftGone&&Number.isFinite(f.groundDeparturePriorityAt)&&!f.taxiHold);
 if(!priority.length)return false;
 const timing=flight.motionVersion>=1?visitorRunwayTiming(flight,false):null;
 const at=visitorRunwaySlot(flight.inboundAt,visitorFlightDuration(flight,false),priority.map(f=>({...f,inboundAt:null})),flight.airportId||'city',flight.runwayId,timing);
 return at>flight.inboundAt+1e-6;
}

export function emptyAircraftDeadline(flight){
 const touchdown=Number.isFinite(flight.touchdownAt)?flight.touchdownAt:Number.isFinite(flight.inboundAt)?flight.inboundAt+visitorTouchdownSeconds(flight):Infinity;
 return touchdown+7200;
}
