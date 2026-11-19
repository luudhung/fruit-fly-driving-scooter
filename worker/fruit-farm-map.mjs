export const HANSDREX_FRUIT_FARM=Object.freeze({id:'hansdrex-fruit-farm',accountId:'farm:hansdrex-fruit',name:'Hansdrex Fruit Cooperative',countryId:'hansdrex',x:970,z:-660,w:120,d:140,gate:{x:1042,z:-660},packingHouse:{id:'hansdrex-fruit-packing',x:1008,z:-746,w:38,d:22,h:9},capacity:24,trees:100});
export const FRUIT_FARM_BUILDINGS=[{...HANSDREX_FRUIT_FARM.packingHouse,kind:'farm-service',countryId:'hansdrex'}];
export const FRUIT_FARM_ROADS=[{id:'FRUIT-FARM-ACCESS',x:1090,z:-580,w:10,d:360},{id:'FRUIT-FARM-GATE-ROAD',x:1066,z:-660,w:48,d:8}];
export const FRUIT_FARM_LOCATIONS=[{id:HANSDREX_FRUIT_FARM.id,name:HANSDREX_FRUIT_FARM.name,type:'country-work',...HANSDREX_FRUIT_FARM.gate},{id:'HANSDREX-FRUIT-FIELD',name:'Hansdrex fruit orchard work site',type:'country-work',x:1022,z:-660}];
