// Fixed public campuses, each within walking distance of an existing station.
const school=(id,name,x,z,w,d,h)=>Object.freeze({
 id,name,x,z,w,d,h,kind:'education',usage:'school',facilityType:'school',
 countryId:'hansdrex',district:'main',capacity:30,
});
export const MAIN_SCHOOL_CAMPUSES=Object.freeze([
 school('north-gateway-school','Gateway International School',121,-415,22,16,13),
 school('quayside-school','Quayside Community School',-335,14,22,16,12),
 school('south-science-school','South City Science School',-123,242,24,18,14),
 school('east-arts-school','East City Arts School',101,278,24,18,14),
]);
export const MAIN_SCHOOL_IDS=Object.freeze(['school',...MAIN_SCHOOL_CAMPUSES.map(b=>b.id)]);
