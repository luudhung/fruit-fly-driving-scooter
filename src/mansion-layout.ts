import {MANSION} from '../worker/city-map.mjs';
export type MansionBox={x:number;y:number;z:number;w:number;h:number;d:number;color:number;finish?:'glass'|'gold'|'water'|'glow';solid?:boolean};
export type FloorSurface={x:number;z:number;w:number;d:number;y:number};
export const mansionBoxes:MansionBox[]=[];
export const mansionFloors:FloorSurface[]=[];
const add=(x:number,y:number,z:number,w:number,h:number,d:number,color=0xeee7d6,solid=true,finish?:MansionBox['finish'])=>{const b={x,y,z,w,h,d,color,solid,finish};mansionBoxes.push(b);return b;};
const floor=(x:number,z:number,w:number,d:number,y:number,color:number)=>{mansionFloors.push({x,z,w,d,y});add(x,y-.12,z,w,.24,d,color,true);};
export const MANSION_FLOOR=.85,MANSION_UPPER=5.45;
export const mansionSpawn={x:110,y:2.55,z:819};
export const mansionRooms=[
 {name:'Grand foyer & staircase',x:110,z:857,w:20,d:34,floor:0},
 {name:'Ocean drawing room',x:85,z:853,w:30,d:26,floor:0},
 {name:'Private library',x:85,z:877,w:30,d:22,floor:0},
 {name:'Grand dining room',x:135,z:853,w:30,d:26,floor:0},
 {name:'Chef’s kitchen',x:135,z:877,w:30,d:22,floor:0},
 {name:'Master suite & spa bath',x:85,z:853,w:30,d:26,floor:1},
 {name:'Private cinema',x:85,z:877,w:30,d:22,floor:1},
 {name:'Guest suite',x:135,z:853,w:30,d:26,floor:1},
 {name:'Ocean study & music room',x:135,z:877,w:30,d:22,floor:1},
 {name:'Upper gallery',x:110,z:881,w:20,d:14,floor:1},
];
export function mansionRoomAt(x:number,z:number,feet:number){
 return mansionRooms.find(r=>r.floor===(feet>3?1:0)&&Math.abs(x-r.x)<r.w/2&&Math.abs(z-r.z)<r.d/2)?.name||(Math.abs(x-MANSION.x)<60&&Math.abs(z-MANSION.z)<55?(z<840&&feet>3?'North balcony':z>888?'Pool terrace & gardens':'Mansion arrival garden'):undefined);
}
floor(110,864,80,48,MANSION_FLOOR,0xddd4bb);
floor(85,864,30,48,MANSION_UPPER,0xb99971);floor(135,864,30,48,MANSION_UPPER,0xb99971);
floor(110,881,20,14,MANSION_UPPER,0xddd4bb);floor(110,837,84,6,MANSION_UPPER,0xddd4bb);
floor(110,894,88,12,MANSION_FLOOR,0xd3c9ae);
// Low approach steps fit the same character step height as the internal staircase.
for(let i=0;i<3;i++)floor(110,837.2+i*.85,14,.85,.72+i*.065,0xd7cdb5);
function windowX(from:number,to:number,z:number,y:number){
 const n=Math.ceil((to-from)/6),w=(to-from)/n;
 for(let i=0;i<n;i++){const x=from+(i+.5)*w;add(x,y+.4,z,w,.8,.38);add(x,y+3.85,z,w,1.5,.38);add(x,y+2,z,w-.55,2.4,.12,0x88b8c0,true,'glass');add(x-w/2,y+2.3,z,.4,4.6,.5);add(x,y+2,z,.1,2.4,.2,0xc9aa69,true,'gold');}
}
function windowZ(x:number,from:number,to:number,y:number){
 const n=Math.ceil((to-from)/6),d=(to-from)/n;
 for(let i=0;i<n;i++){const z=from+(i+.5)*d;add(x,y+.4,z,.38,.8,d);add(x,y+3.85,z,.38,1.5,d);add(x,y+2,z,.12,2.4,d-.55,0x88b8c0,true,'glass');add(x,y+2.3,z-d/2,.5,4.6,.4);add(x,y+2,z,.2,2.4,.1,0xc9aa69,true,'gold');}
}
for(const y of [MANSION_FLOOR,MANSION_UPPER]){
 if(y===MANSION_FLOOR){windowX(70,106.5,840,y);windowX(113.5,150,840,y);}
 else{windowX(70,83.5,840,y);windowX(87,133,840,y);windowX(136.5,150,840,y);}
 windowX(70,106,888,y);windowX(114,150,888,y);windowZ(70,840,888,y);windowZ(150,840,888,y);
 for(const x of [70,100,120,150])add(x,y+2.3,840,.8,4.6,.8,0xe9dfc7);
 for(const z of [840,888])add(110,y+4.43,z,81,.32,.9,0xc6ac77);
}
// Interior partitions have real open doorways; their boxes are also collision geometry.
for(const y of [MANSION_FLOOR,MANSION_UPPER]){
 for(const x of [100,120]){
  const spans=y===MANSION_FLOOR?[[840,849],[852.4,875],[878.4,888]]:[[840,877],[880.4,888]];
  for(const [a,b]of spans)add(x,y+2.15,(a+b)/2,.3,4.3,b-a);
  for(const z of (y===MANSION_FLOOR?[850.7,876.7]:[878.7]))add(x,y+3.8,z,.48,.9,3.4,0xa47e4c);
 }
 for(const [a,b]of [[70,83.4],[86.6,100],[120,133.4],[136.6,150]])add((a+b)/2,y+2.15,866,b-a,4.3,.3);
}
// Twenty physically climbable steps lead to the upper gallery, with an open atrium above.
for(let i=0;i<20;i++){
 const top=MANSION_FLOOR+(i+1)*.23,z=854.5+i;
 mansionFloors.push({x:110,z,w:6,d:1,y:top});add(110,(MANSION_FLOOR+top)/2,z,6,top-MANSION_FLOOR,1,0xd7c9af,false);
 for(const x of [106.6,113.4]){add(x,top+.5,z,.12,1,.12,0xb49761,false,'gold');add(x,top+1.03,z,.2,.1,1.03,0x5c4631,false);}
}
for(const x of [100.5,119.5]){add(x,MANSION_UPPER+.5,856,.12,1,32,0xb49761,true,'gold');add(x,MANSION_UPPER+1.04,856,.26,.12,32,0x695539);}
add(110,10.17,864,84,.45,52,0xf2eada);add(110,10.45,864,80,.15,48,0xb7a582,false);
for(const x of [103,117]){add(x,3.1,836,.9,5,.9);add(x,5.7,836,1.5,.3,1.5,0xc9aa69,false,'gold');}
add(110,5.9,836,17,.45,8);add(110,5.48,836,12,.12,5,0xe5ca7f,false,'glow');
// Balcony balustrade, rear terrace and a private turquoise pool.
for(const z of [834,900])for(let x=69;x<=151;x+=2.5)add(x,(z===834?MANSION_UPPER:MANSION_FLOOR)+.5,z,.14,1,.14,0xc5ab79);
for(const z of [834,900])add(110,(z===834?MANSION_UPPER:MANSION_FLOOR)+1.05,z,84,.16,.22,0xb7a17a);
add(87,.68,910,30,.35,14,0xf2e6c9,false);add(87,.88,910,27,.12,11,0x3ea7b5,false,'water');
// Rugs and furniture use warm stone, walnut and deep green upholstery.
function rug(x:number,z:number,w:number,d:number,y:number,color=0x526e62){add(x,y+.027,z,w,.045,d,color,false);}
function sofa(x:number,z:number,w:number,d:number,y:number){add(x,y+.4,z,w,.8,d,0x326459);add(x,y+.9,z+d/2-.22,w,1,.42,0x28564b);for(const a of [-1,1])add(x+a*(w/2-.18),y+.65,z,.36,1.3,d,0x28564b);}
function table(x:number,z:number,w:number,d:number,y:number,color=0x664b35){add(x,y+.85,z,w,.18,d,color);for(const a of [-1,1])for(const b of [-1,1])add(x+a*(w/2-.2),y+.42,z+b*(d/2-.2),.17,.84,.17,0x9b825a);}
function bed(x:number,z:number,y:number){add(x,y+.34,z,4.5,.68,5.8,0x624c37);add(x,y+.8,z,4.35,.3,5.65,0xf1e5d0);add(x,y+1,z-.9,4.4,.12,3.7,0xb8b1a4);add(x,y+1.15,z+2.6,4.5,1.8,.25,0x476859);for(const a of [-1,1]){add(x+a*1.1,y+1.03,z+1.7,1.6,.25,.9,0xf8f1e5);table(x+a*3.2,z+1.8,1.4,1.2,y);add(x+a*3.2,y+1.5,z+1.8,.7,.8,.7,0xeed7a3,false,'glow');}}
function plant(x:number,z:number,y:number){add(x,y+.5,z,1,1,1,0xb9a386);add(x,y+1.5,z,1.6,1.5,1.6,0x46724f,false);add(x,y+2.2,z,1.1,.9,1.1,0x577e56,false);}
const g=MANSION_FLOOR,u=MANSION_UPPER;
rug(85,852,18,15,g);sofa(85,847,8,2.4,g);sofa(76,853,2.4,7,g);sofa(94,853,2.4,7,g);table(85,853,4,2.6,g);add(85,g+1.5,863,9,2.5,.45,0xb1a484);add(85,g+.8,862.6,6,.6,.2,0xe7a85d,false,'glow');
rug(135,853,18,15,g,0xa39c7a);table(135,853,10,4,g);for(let i=0;i<5;i++)for(const a of [-1,1])sofa(131+i*2,853+a*3.1,1.4,1.3,g);
for(let x=73;x<99;x+=2.2){add(x,g+1.9,886,2,3.8,.7,0x624a34);for(let k=0;k<5;k++)add(x,g+.4+k*.67,885.55,1.7,.5,.18,k%2?0x71826b:0x95724f,false);}
rug(85,877,16,13,g,0x746052);table(84,877,6,3,g);sofa(91,877,2,5,g);plant(74,870,g);
add(143,g+.65,885,11,1.3,2,0xded8c6);add(148,g+.65,879,2,1.3,10,0xded8c6);add(143,g+1.36,885,11,.12,2.1,0x5e6a67);add(148,g+1.36,879,2.1,.12,10,0x5e6a67);add(125,g+1.7,885,3,3.4,2.1,0x9ca9a5);table(135,876,7,3,g);for(const x of [132,135,138])add(x,g+.95,873.6,1.2,1.9,1.2,0x5a6757);add(147.5,g+1.46,881,1.5,.12,2,0x252b2a);
rug(110,847,12,7,g,0x60796a);table(104,845,3.5,1.8,g);plant(103,843,g);plant(117,843,g);
bed(83,851,u);rug(83,851,14,14,u,0xaaa68e);sofa(77,861,6,2,u);table(89,861,3,2,u);
// Ensuite spa: a freestanding tub, walk-in shower and vanity, all inside the master suite.
add(96,u+1.25,855,.22,2.5,15,0x9fc5c5,true,'glass');add(97.5,u+.5,845,3,.9,5,0xf6efe0);add(97.5,u+.96,845,2.5,.08,4.4,0x82b6ba,false,'water');add(97.5,u+.8,863,3,1.6,2,0x9a8062);add(97.5,u+2.3,864.5,3,1.8,.1,0xa9cbd0,false,'glass');
bed(135,852,u);rug(135,852,15,15,u,0xa4adba);table(144,861,4,2,u);sofa(126,860,3,2,u);
rug(85,877,24,15,u,0x3b4146);add(85,u+2.1,887.4,17,3.4,.18,0x203b4d,false,'glow');for(const z of [873,879])for(const x of [78,85,92])sofa(x,z,5.5,2.3,u);
rug(135,877,22,15,u,0x78857a);table(136,883,7,3,u);sofa(129,882,2,4,u);add(145,u+.8,872,5,1.6,4,0x282e2d);add(145,u+1.65,869.8,5,.1,.7,0xede4d3);sofa(126,870,5,2,u);
for(const x of [76,144]){plant(x,843,g);plant(x,884,g);plant(x,842,u);plant(x,885,u);}for(const x of [73,100,125,147])plant(x,896,g);
for(const x of [107,113]){add(x,7,846,.18,3,.18,0xbfa365,false,'gold');add(x,5.5,846,2,.12,2,0xffe8a6,false,'glow');}
for(const z of [905,915]){sofa(109,z,6,2,g);table(116,z,2,2,g);}
// Marble inlays and panelled ceilings supply depth cues without animated textures.
for(const f of mansionFloors.slice(0,6))for(let x=f.x-f.w/2+2;x<f.x+f.w/2;x+=4)for(let z=f.z-f.d/2+2;z<f.z+f.d/2;z+=4)add(x,f.y+.006,z,3.95,.008,3.95,Math.round(x+z)%3?0xe1d8c3:0xd9cfb8,false);

// Framed landscape panels face the atrium; shared materials keep them inexpensive.
for(const y of [g,u])for(const x of [100.22,119.78])for(const z of [858,866,883]){
 add(x,y+2.5,z,.12,2.5,3.8,0xbca06c,false,'gold');
 add(x+(x<110?.08:-.08),y+2.5,z,.04,2.1,3.4,0x81a8b1,false);
 add(x+(x<110?.11:-.11),y+1.9,z,.04,.8,3.4,0x547963,false);
}
for(const z of [843,850])add(110,g+.058,z,12,.025,.08,0xb99d61,false,'gold');
for(const y of [7.8,8.25]){for(const x of [107,113])add(x,y,846,.15,.12,4,0xd2b572,false,'gold');for(const z of [844,848])add(110,y,z,6,.12,.15,0xd2b572,false,'gold');}
for(const x of [107,113])for(const z of [844,848]){add(x,8.7,z,.09,2.7,.09,0xbfa365,false,'gold');add(x,7.55,z,.35,.5,.35,0xffdf99,false,'glow');}
