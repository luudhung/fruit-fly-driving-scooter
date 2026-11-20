import {COUNTRY_IDS,countryAt,NORTH_FARM,NORTH_MATERIALS_YARD} from './country-map.mjs';
import {LOCATIONS} from './city-map.mjs';

const VENDORS=['market','grocery','bakery','restaurant','night-market','riverside-market','north-market','north-restaurant','island-market','island-restaurant'];
export const DUTY_CANTEENS=Object.freeze([
 {accountId:'emergency-operations',locationId:'firestation',countryId:'hansdrex',target:40},
 {accountId:'north-emergency-operations',locationId:'north-firestation',countryId:'north-city',target:30},
 {accountId:'civic-recovery',locationId:'construction',countryId:'hansdrex',target:60},
 {accountId:'north-civic-recovery',locationId:NORTH_MATERIALS_YARD.id,countryId:'north-city',target:60},
]);
/** A paid canteen/field-catering meal. Call only after the worker physically
 * reports for duty. A meal consumes finite domestic stock; an empty pantry or
 * unfunded national budget cannot clear the hunger eligibility check. */
export function provisionDutyMeal(world,person,countryId){
 if(!person?.alive||person.traveling||person.onTrain||person.onPlane||countryAt(person)!==countryId||Number(person.hunger||0)<=45)return false;
 const budget=countryId===COUNTRY_IDS.hansdrex?world.treasury:world.businesses?.[`treasury:${countryId}`];
 if(Number(budget?.cash||0)<4)return false;
 let vendor,stock,key='inventory',vendorId,ingredients;
 const sources=[...DUTY_CANTEENS.filter(c=>c.countryId===countryId).map(c=>({id:c.accountId,siteId:c.locationId})),...VENDORS.map(id=>({id,siteId:id}))];
 for(const {id,siteId}of sources){const site=LOCATIONS.find(l=>l.id===siteId),candidate=world.businesses?.[id],stage=world.urbanWorld?.buildings?.[siteId]?.stage;if(site&&countryAt(site)===countryId&&(!stage||stage==='operational')&&Number(candidate?.inventory||0)>=1){vendor=candidate;stock=candidate;vendorId=id;break;}}
 // Farm staff can cook the cooperative's own produce on site. This is not
 // access to another country's reserves and leaves seed grain unconsumed.
 if(!vendor&&countryId===COUNTRY_IDS.north&&person.internationalWork?.employerId==='farm:north-city'&&Math.hypot(person.x-NORTH_FARM.x,person.z-NORTH_FARM.z)<220){
  const crops=world.internationalEconomy?.stock;
  const vegetables=Math.max(0,Number(crops?.vegetables||0)),rice=Math.max(0,Number(crops?.rice||0));
  // Harvests are fractional: a combined rice-and-vegetable meal must not
  // strand hungry farmers when neither ingredient alone reaches one unit.
  if(vegetables+rice>=1){vendor=world.businesses?.['farm:north-city'];stock=crops;vendorId='farm:north-city';ingredients=[['vegetables',Math.min(1,vegetables)],['rice',Math.max(0,1-vegetables)]];}
 }
 if(!vendor||!stock)return false;
 budget.cash-=4;budget.spending=Number(budget.spending||0)+4;vendor.cash=Number(vendor.cash||0)+4;if(ingredients){for(const [ingredient,amount]of ingredients)stock[ingredient]=Math.max(0,Number(stock[ingredient]||0)-amount);}else stock[key]-=1;
 world.totalTransactions=Number(world.totalTransactions||0)+1;
 person.hunger=Math.max(0,Number(person.hunger||0)-60);person.thirst=Math.max(0,Number(person.thirst||0)-30);
 person.lastDutyMeal={at:Number(world.simulationAgeSeconds||0),countryId,vendorId,price:4};
 return true;
}
