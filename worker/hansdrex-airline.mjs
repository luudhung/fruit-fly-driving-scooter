export const HANSDREX_AIRLINE=Object.freeze({id:'hansdrex-airline',name:'Hansdrex Airline',countryId:'hansdrex',seats:10,oneWayFare:200,roundTripFare:400,arrivalVisa:50,currency:'H$'});

export function hansdrexAirlineAccount(state){
 const accounts=state.businesses||={};
 const airline=accounts[HANSDREX_AIRLINE.id]||={cash:0,inventory:0,revenue:0,inboundPassengers:0,outboundPassengers:0};
 Object.assign(airline,{id:HANSDREX_AIRLINE.id,name:HANSDREX_AIRLINE.name,sector:'aviation',countryId:'hansdrex',ownerCountryId:'hansdrex'});
 return airline;
}

export function hansdrexReturnFare(person){
 const legacy=Number(person.arrivalFarePaid||0);
 return legacy>0&&legacy<HANSDREX_AIRLINE.oneWayFare&&!person.hansdrexAirlineReceipts?.inbound?legacy:HANSDREX_AIRLINE.oneWayFare;
}

/** Each foreign visitor owns one durable return ticket. A changed flight number
 * after bad weather or a checkpoint restore cannot charge the same leg again. */
export function chargeHansdrexFare(state,person,direction,{reference=null}={}){
 if(!['inbound','outbound'].includes(direction))throw new Error('Unknown airline ticket direction');
 const field=direction==='inbound'?'arrivalFarePaid':'returnFarePaid';
 const receipt=person.hansdrexAirlineReceipts?.[direction];
 if(receipt?.carrierId===HANSDREX_AIRLINE.id&&Number(receipt.amount)>0){person[field]=Number(receipt.amount);if(direction==='outbound')person.returnFareReserve=0;return true;}
 if(Number(person[field]||0)>0)return true; // Honor tickets bought before this tariff.
 const fare=direction==='outbound'?hansdrexReturnFare(person):HANSDREX_AIRLINE.oneWayFare,cash=Math.max(0,Number(person.money||0)),savings=Math.max(0,Number(person.savings||0));
 if(cash+savings+1e-7<fare)return false;
 const paidCash=Math.min(cash,fare),airline=hansdrexAirlineAccount(state);
 person.money=cash-paidCash;person.savings=Math.max(0,savings-(fare-paidCash));
 person.expensesLifetime=Number(person.expensesLifetime||0)+fare;
 person[field]=fare;person.returnFareReserve=direction==='outbound'?0:fare;
 person.hansdrexAirlineReceipts||={};
 person.hansdrexAirlineReceipts[direction]={carrierId:HANSDREX_AIRLINE.id,amount:fare,at:Number(state.simulationAgeSeconds||0),reference};
 airline.cash=Number(airline.cash||0)+fare;airline.revenue=Number(airline.revenue||0)+fare;
 const counter=direction==='inbound'?'inboundPassengers':'outboundPassengers';airline[counter]=Number(airline[counter]||0)+1;
 state.totalTransactions=Number(state.totalTransactions||0)+1;
 return true;
}

export function hansdrexAirlineSummary(state){
 const account=state.businesses?.[HANSDREX_AIRLINE.id];
 return {...HANSDREX_AIRLINE,revenue:Number(account?.revenue||0),cash:Number(account?.cash||0),inboundPassengers:Number(account?.inboundPassengers||0),outboundPassengers:Number(account?.outboundPassengers||0)};
}

/** A stranded foreign guest may borrow only the missing return fare from real
 * carrier cash. The durable receivable makes retries and later rebooking free
 * of duplicate advances; no new money or replacement person is created. */
export function fundHansdrexRepatriation(state,person){
 if(Number(person.returnFarePaid)>0||person.hansdrexAirlineReceipts?.outbound?.carrierId===HANSDREX_AIRLINE.id&&Number(person.hansdrexAirlineReceipts.outbound.amount)>0)return chargeHansdrexFare(state,person,'outbound',{reference:'repatriation'});
 const fare=hansdrexReturnFare(person),available=Math.max(0,Number(person.money||0))+Math.max(0,Number(person.savings||0)),missing=Math.max(0,fare-available);
 const airline=hansdrexAirlineAccount(state);
 if(missing){
  if(Number(airline.cash||0)+1e-7<missing)return false;
  airline.repatriationLoans||={};
  if(airline.repatriationLoans[person.id])return false;
  const loan={personId:person.id,amount:missing,outstanding:missing,at:Number(state.simulationAgeSeconds||0)};
  airline.cash-=missing;person.money=Math.max(0,Number(person.money||0))+missing;
  airline.repatriationLoans[person.id]=loan;airline.repatriationCreditOutstanding=Number(airline.repatriationCreditOutstanding||0)+missing;
  person.repatriationLoan={...loan};
 }
 return chargeHansdrexFare(state,person,'outbound',{reference:'repatriation'});
}
