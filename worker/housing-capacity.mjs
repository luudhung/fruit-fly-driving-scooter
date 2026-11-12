export const HOUSING_CAPACITY_UNIT='households';
export const GROUND_HOUSE_HOUSEHOLD_CAPACITY=1;

/** Apartment capacity is a count of independently rented households, not people.
 * A household may be one resident or an entire family. */
export function apartmentHouseholdCapacity(height){
 const value=Number(height),finiteHeight=Number.isFinite(value)?value:24;
 return Math.max(10,Math.min(30,10+Math.floor(Math.max(0,finiteHeight-24)/4.8)));
}

export function occupiedHouseholdCount(block){
 return new Set((block?.occupants||[]).filter(Boolean)).size;
}

export function apartmentHasVacancy(block){
 return occupiedHouseholdCount(block)<apartmentHouseholdCapacity(block?.h);
}

/** Reprice only the admission limit. Never alter existing occupants or titles. */
export function normalizeHousingCapacities(housing,buildings=[]){
 if(!housing)return;
 const heights=new Map(buildings.map(b=>[b.id,b.h]));
 for(const block of housing.apartmentBlocks||[]){
  const height=heights.get(block.id)??block.h;
  if(Number.isFinite(Number(height)))block.h=Number(height);
  block.capacity=apartmentHouseholdCapacity(height);block.capacityUnit=HOUSING_CAPACITY_UNIT;
 }
 for(const lot of housing.houseLots||[]){lot.capacity=GROUND_HOUSE_HOUSEHOLD_CAPACITY;lot.capacityUnit=HOUSING_CAPACITY_UNIT;}
 housing.capacityUnit=HOUSING_CAPACITY_UNIT;housing.capacityPolicyVersion=1;
}

/** Occupancy counts live residents by their durable home assignment, including
 * residents temporarily away or displaced during a repair. */
export function housingOccupancy(housing,residents=[]){
 const counts=new Map();
 for(const person of residents)if(person.alive&&!person.departed&&person.housingUnitId)
  counts.set(person.housingUnitId,(counts.get(person.housingUnitId)||0)+1);
 const apartments=new Map((housing?.apartmentBlocks||[]).map(block=>{
  const capacity=apartmentHouseholdCapacity(block.h),occupiedHouseholds=occupiedHouseholdCount(block);
  return [block.id,{capacity,capacityUnit:HOUSING_CAPACITY_UNIT,occupiedHouseholds,residentCount:counts.get(block.id)||0,
   overCapacityHouseholds:Math.max(0,occupiedHouseholds-capacity)}];
 }));
 const houses=new Map((housing?.houseLots||[]).map(lot=>[lot.id,{
  capacity:GROUND_HOUSE_HOUSEHOLD_CAPACITY,capacityUnit:HOUSING_CAPACITY_UNIT,
  occupiedHouseholds:lot.ownerHouseholdId?1:0,residentCount:counts.get(lot.id)||0,overCapacityHouseholds:0,
 }]));
 return {apartments,houses};
}
