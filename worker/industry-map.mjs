// Append-only industrial leases outside the financial core. No city-map imports.
export const INDUSTRIAL_SECTORS=['garments','food-production','building-materials','freight-logistics'];
const labels={'garments':'Xưởng may','food-production':'Nhà máy thực phẩm','building-materials':'Xưởng vật liệu','freight-logistics':'Kho vận'};
export const INDUSTRIAL_ZONES={
 north:{id:'north',name:'Khu công nghiệp phía Bắc',gateway:{x:50,z:-1087.8}},
 west:{id:'west',name:'Khu công nghiệp phía Tây',gateway:{x:-1067.8,z:400}},
 europe:{id:'europe',name:'Khu công nghiệp châu Âu',gateway:{x:1107.8,z:-400}},
};
const plant=(zone,index,x,z,w,d,h,front)=>({id:`INDUSTRY-${zone}-${index+1}`,name:`${labels[INDUSTRIAL_SECTORS[index%4]]} ${index+1}`,zone,district:zone,sector:INDUSTRIAL_SECTORS[index%4],x,z,w,d,h,kind:'industrial',frontage:{x,z:front},capacity:zone==='west'?10:7});
export const INDUSTRIAL_PLANTS=[
 ...[-375,-260,-145,-30].map((x,i)=>plant('north',i,x,-567,60,28,18+i*2,-586)),
 ...[-960,-800,-640,-475].flatMap((x,i)=>[plant('west',i,x,378,54,24,17+i*2,393),plant('west',i+4,x,-378,54,24,20+i*2,-393)]),
 ...[800,885,970,1055].map((x,i)=>plant('europe',i,x,-430,52,34,19+i*2,-409)),
];
export const INDUSTRIAL_DEPOT={id:'industrial-raw-depot',name:'Trung tâm nguyên liệu phía Tây',x:-1040,z:378,w:32,d:24,h:13,kind:'industrial',frontage:{x:-1040,z:393},zone:'west'};
export const INDUSTRIAL_BUILDINGS=[...INDUSTRIAL_PLANTS,INDUSTRIAL_DEPOT];
export const INDUSTRIAL_LOCATIONS=INDUSTRIAL_BUILDINGS.map(b=>({id:b.id,name:b.name,type:'industrial',x:b.frontage.x,z:b.frontage.z}));
export const INDUSTRIAL_ROADS=[
 ...[-400,400].map(z=>({id:`INDUSTRY-WEST-STREET-${z}`,x:-735,z,w:610,d:10})),
 ...[-1000,-920,-840,-760,-680,-600,-520,-430].flatMap(x=>[-370,370].map(z=>({id:`INDUSTRY-WEST-AVENUE-${x}-${z}`,x,z,w:10,d:60}))),
 {id:'INDUSTRY-EUROPE-STREET',x:900,z:-400,w:440,d:10},
];
export const INDUSTRIAL_RESERVED=INDUSTRIAL_BUILDINGS.map(b=>({id:`${b.id}-lease`,x:b.x,z:b.z,w:b.w+4,d:b.d+4}));
export const MAX_FREIGHT_TRUCKS=16;
// Dedicated loading bays lie on real service streets, outside intersections and homes.
export const INDUSTRIAL_LOADING_BAYS=Object.fromEntries(INDUSTRIAL_BUILDINGS.map(b=>{
 const x=b.zone==='north'?({'INDUSTRY-north-1':-390,'INDUSTRY-north-2':-280,'INDUSTRY-north-3':-145,'INDUSTRY-north-4':-40}[b.id]):b.id===INDUSTRIAL_DEPOT.id?-1025:b.x;
 const z=b.zone==='north'?-596.3:b.zone==='europe'?-403.7:b.z>0?396.3:-396.3;
 return[b.id,{x,z,y:1.1,heading:Math.PI/2}];
}));
