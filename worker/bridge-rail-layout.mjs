const intersection=(a,b)=>{const loX=Math.max(a.x-a.w/2,b.x-b.w/2),hiX=Math.min(a.x+a.w/2,b.x+b.w/2),loZ=Math.max(a.z-a.d/2,b.z-b.d/2),hiZ=Math.min(a.z+a.d/2,b.z+b.d/2);return hiX>loX&&hiZ>loZ?{x:(loX+hiX)/2,z:(loZ+hiZ)/2,w:hiX-loX,d:hiZ-loZ}:null;};
/** Ground corridors retain their true direction even for short sidewalk ends. */
export function bridgeAccessCorridors(roads,walks,walkWidth=2.4){
 const result=roads.map(r=>({...r,axis:r.w>=r.d?'x':'z',kind:'road'}));
 for(const {a,b}of walks){const dx=Math.abs(b.x-a.x),dz=Math.abs(b.z-a.z);if(dx+dz<.01)continue;const axis=dx>=dz?'x':'z';result.push({x:(a.x+b.x)/2,z:(a.z+b.z)/2,w:axis==='x'?dx+walkWidth:walkWidth,d:axis==='z'?dz+walkWidth:walkWidth,axis,kind:'walk'});}
 return result;
}
/** Underpass traffic does not enter this deck; a walkway needs legal ground on
 * both sides of its opening, rather than an imaginary path through water. */
export function bridgeAccessAtGrade(access,point,roadHeight,clearWalk){
 if(access.kind==='road')return roadHeight(point,access.axis)>=.7;
 const delta=2.6,a={...point},b={...point};a[access.axis]-=delta;b[access.axis]+=delta;return clearWalk(a,b);
}
/** Subtract whole transverse openings, preserving parallel footway protection. */
export function bridgeRailPieces(rail,axis,accesses,{clearance=.45,accept}={}){
 const length=axis==='x'?rail.w:rail.d,start=rail[axis]-length/2,end=rail[axis]+length/2,cuts=[];
 for(const a of accesses){if(a.axis===axis)continue;const expanded={x:a.x,z:a.z,w:a.w+clearance*2,d:a.d+clearance*2};if(!intersection(rail,expanded))continue;
  const point=axis==='x'?{x:a.x,z:rail.z}:{x:rail.x,z:a.z};if(accept&&!accept(a,point))continue;const span=axis==='x'?expanded.w:expanded.d;cuts.push({lo:Math.max(start,expanded[axis]-span/2),hi:Math.min(end,expanded[axis]+span/2)});
 }
 cuts.sort((a,b)=>a.lo-b.lo||a.hi-b.hi);const spans=[];let cursor=start;
 for(const cut of cuts){if(cut.hi<=cursor)continue;if(cut.lo>cursor)spans.push({lo:cursor,hi:cut.lo});cursor=Math.max(cursor,cut.hi);}if(cursor<end)spans.push({lo:cursor,hi:end});
 return spans.filter(p=>p.hi-p.lo>.05).map(p=>axis==='x'?{x:(p.lo+p.hi)/2,z:rail.z,w:p.hi-p.lo,d:rail.d}:{x:rail.x,z:(p.lo+p.hi)/2,w:rail.w,d:p.hi-p.lo});
}
export function bridgeRailPosts(pieces,axis,spacing=5,inset=.16){
 const points=[];for(const p of pieces){const length=axis==='x'?p.w:p.d,lo=p[axis]-length/2+Math.min(inset,length/3),hi=p[axis]+length/2-Math.min(inset,length/3),positions=[];
  for(let at=lo;at<=hi;at+=spacing)positions.push(at);if(!positions.length||hi-positions.at(-1)>.3)positions.push(hi);
  for(const at of positions)points.push(axis==='x'?{x:at,z:p.z}:{x:p.x,z:at});
 }return points;
}
/** Supplying the rail axis ignores its own parallel footway, while transverse
 * entrances still exclude lamps or posts. Piers may opt into every corridor. */
export function bridgeAccessOverlaps(rect,accesses,accept,clearance=.25,parallelAxis){
 return accesses.some(a=>{if(a.axis===parallelAxis)return false;const hit=intersection(rect,{x:a.x,z:a.z,w:a.w+clearance*2,d:a.d+clearance*2});return Boolean(hit&&(!accept||accept(a,{x:hit.x,z:hit.z})));});
}
/** One immutable-base construction plan feeds both rendered bridge furniture
 * and the player collision registry. No renderer-specific coordinate formulas. */
export function bridgeFurnitureLayout({bridges,districtBridges,roads,walks,roadHeight,clearWalk}){
 const accesses=bridgeAccessCorridors(roads,walks),accept=(a,p)=>bridgeAccessAtGrade(a,p,roadHeight,clearWalk),layout={districtRails:[],districtPosts:[],archRails:[],archCurbs:[],archHangers:[],archPiers:[],archLamps:[]};
 for(const b of districtBridges){if(b.motorway)continue;const horizontal=b.axis==='x',length=horizontal?b.w:b.d,span=horizontal?b.d:b.w;
  for(const side of [-1,1]){const edge=side*(span/2-.25),pieces=bridgeRailPieces({x:b.x+(horizontal?0:edge),z:b.z+(horizontal?edge:0),w:horizontal?length:.12,d:horizontal?.12:length},b.axis,accesses,{accept});
   pieces.forEach((p,index)=>layout.districtRails.push({...p,id:`district-bridge-rail:${b.id}:${side}:${index}`,bridgeId:b.id,side,axis:b.axis,minY:.28,maxY:1.58}));
   bridgeRailPosts(pieces,b.axis).forEach((p,index)=>layout.districtPosts.push({...p,id:`district-bridge-post:${b.id}:${side}:${index}`,bridgeId:b.id,side}));
  }
 }
 for(const b of bridges){const main=b.z===0,steps=main?32:20,half=b.w/2,side=b.d/2-.6,rise=main?36:14;
  for(const sign of [-1,1]){
   const z=b.z+sign*side,rails=bridgeRailPieces({x:b.x,z,w:b.w,d:.6},'x',accesses,{accept});
   rails.forEach((p,index)=>layout.archRails.push({...p,id:`bridge-rail:${b.z}:${sign}:${index}`,bridgeZ:b.z,side:sign,minY:.9,maxY:1.5}));
   for(const p of bridgeRailPieces({x:b.x,z:b.z+sign*4.65,w:b.w,d:.16},'x',accesses,{accept}))layout.archCurbs.push({...p,bridgeZ:b.z});
   for(let i=0;i<steps;i+=2){const x=b.x-half+b.w*i/steps,top=2.6+rise*Math.sin(Math.PI*i/steps),bottom=rails.some(p=>x>=p.x-p.w/2-1e-6&&x<=p.x+p.w/2+1e-6)?1.2:6.5;
    if(top>bottom+.05)layout.archHangers.push({id:`bridge-suspender:${b.z}:${sign}:${i}`,bridgeZ:b.z,side:sign,index:i,x,z,radius:.12,minY:bottom,maxY:top});
   }
   for(const end of [-1,1]){let x=b.x+end*(half+4);const width=main?5:3,pierZ=z+sign*3.5;
    for(let step=0;step<6&&bridgeAccessOverlaps({x,z:pierZ,w:width,d:4},accesses,accept);step++)x+=end*2;
    layout.archPiers.push({id:`bridge-pier:${b.z}:${sign}:${end}`,bridgeZ:b.z,side:sign,x,z:pierZ,w:width,d:4,minY:0,maxY:main?12:5});
   }
  }
  for(let i=0;i<=Math.floor(b.w/20);i++)for(const sign of [-1,1]){const x=b.x-half+i*20,z=b.z+sign*7.35;if(bridgeAccessOverlaps({x,z,w:.18,d:.18},accesses,accept,0,'x'))continue;
   layout.archLamps.push({id:`bridge-lamp:${b.z}:${i}:${sign}`,bridgeZ:b.z,index:i,side:sign,x,z,radius:.09,minY:.3,maxY:3.1});
  }
 }
 return layout;
}
