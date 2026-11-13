/** Ground-plane rectangle, expressed with center coordinates and positive dimensions. */
export type Rect=Readonly<{x:number;z:number;w:number;d:number}>;
type Bounds={left:number;right:number;bottom:number;top:number};
type Span={lo:number;hi:number};
// Canonical nanounit edges remove arithmetic slivers from center/size conversion.
const coordinate=(n:number)=>Number.isFinite(n*1e9)?Math.round(n*1e9)/1e9:n;
const valid=(r:Rect)=>[r.x,r.z,r.w,r.d].every(Number.isFinite)&&r.w>0&&r.d>0;
const bounds=(r:Rect):Bounds=>({left:coordinate(r.x-r.w/2),right:coordinate(r.x+r.w/2),bottom:coordinate(r.z-r.d/2),top:coordinate(r.z+r.d/2)});
const rect=(b:Bounds):Rect=>Object.freeze({x:(b.left+b.right)/2,z:(b.bottom+b.top)/2,w:b.right-b.left,d:b.top-b.bottom});
const freeze=(rs:Rect[]):readonly Rect[]=>Object.freeze(rs);

/** Touching edges have zero area and therefore no intersection. Inputs stay untouched. */
export function intersection(a:Rect,b:Rect):Rect|null{
 if(!valid(a)||!valid(b))return null;const aa=bounds(a),bb=bounds(b),cut={left:Math.max(aa.left,bb.left),right:Math.min(aa.right,bb.right),bottom:Math.max(aa.bottom,bb.bottom),top:Math.min(aa.top,bb.top)};
 return cut.right>cut.left&&cut.top>cut.bottom?rect(cut):null;
}
/** Up to four disjoint pieces, with no zero-area edge slivers. */
export function subtractRect(a:Rect,b:Rect):readonly Rect[]{
 if(!valid(a))return freeze([]);const aa=bounds(a);if(aa.right<=aa.left||aa.top<=aa.bottom)return freeze([]);const hit=intersection(a,b);if(!hit)return freeze([rect(aa)]);
 const cut=bounds(hit),out:Rect[]=[];
 if(aa.left<cut.left)out.push(rect({...aa,right:cut.left}));
 if(cut.right<aa.right)out.push(rect({...aa,left:cut.right}));
 if(aa.bottom<cut.bottom)out.push(rect({left:cut.left,right:cut.right,bottom:aa.bottom,top:cut.bottom}));
 if(cut.top<aa.top)out.push(rect({left:cut.left,right:cut.right,bottom:cut.top,top:aa.top}));
 return freeze(out);
}
function mergeSpans(spans:Span[]):Span[]{
 spans.sort((a,b)=>a.lo-b.lo||a.hi-b.hi);const result:Span[]=[];
 for(const span of spans){const last=result.at(-1);if(last&&span.lo<=last.hi)last.hi=Math.max(last.hi,span.hi);else result.push({...span});}return result;
}
function subtractSpans(source:Span[],cuts:Span[]):Span[]{
 if(!cuts.length)return source;const result:Span[]=[];let first=0;
 for(const s of source){let from=s.lo;while(first<cuts.length&&cuts[first].hi<=from)first++;
  for(let j=first;j<cuts.length&&cuts[j].lo<s.hi;j++){const c=cuts[j];if(c.lo>from)result.push({lo:from,hi:Math.min(s.hi,c.lo)});from=Math.max(from,c.hi);if(from>=s.hi)break;}
  if(from<s.hi)result.push({lo:from,hi:s.hi});
 }return result;
}
/** A sweep avoids allocating a full X/Z grid or repeatedly fragmenting every road. */
function differenceUnion(sources:readonly Rect[],cuts:readonly Rect[]):readonly Rect[]{
 const source=sources.filter(valid).map(bounds).filter(b=>b.right>b.left&&b.top>b.bottom);if(!source.length)return freeze([]);const mask=cuts.filter(valid).map(bounds).filter(b=>b.right>b.left&&b.top>b.bottom);
 type Event={sourceAdd:number[];sourceRemove:number[];cutAdd:number[];cutRemove:number[]};
 const events=new Map<number,Event>();
 const event=(x:number)=>{let e=events.get(x);if(!e){e={sourceAdd:[],sourceRemove:[],cutAdd:[],cutRemove:[]};events.set(x,e);}return e;};
 for(const [i,b]of source.entries()){event(b.left).sourceAdd.push(i);event(b.right).sourceRemove.push(i);}
 for(const [i,b]of mask.entries()){event(b.left).cutAdd.push(i);event(b.right).cutRemove.push(i);}
 const xs=[...events.keys()].sort((a,b)=>a-b),active=new Set<number>(),activeCuts=new Set<number>(),result:Bounds[]=[];let extending=new Map<string,Bounds>();
 for(let i=0;i<xs.length-1;i++){
  const x=xs[i],next=xs[i+1],e=events.get(x)!;for(const index of e.sourceRemove)active.delete(index);for(const index of e.sourceAdd)active.add(index);for(const index of e.cutRemove)activeCuts.delete(index);for(const index of e.cutAdd)activeCuts.add(index);
  if(next<=x)continue;
  const coverage=mergeSpans([...active].map(index=>({lo:source[index].bottom,hi:source[index].top}))),holes=mergeSpans([...activeCuts].map(index=>({lo:mask[index].bottom,hi:mask[index].top}))),spans=subtractSpans(coverage,holes),following=new Map<string,Bounds>();
  for(const span of spans){if(!(span.hi>span.lo))continue;const key=`${span.lo}:${span.hi}`,last=extending.get(key);if(last&&last.right===x){last.right=next;following.set(key,last);}else{const b={left:x,right:next,bottom:span.lo,top:span.hi};result.push(b);following.set(key,b);}}
  extending=following;
 }
 result.sort((a,b)=>a.left-b.left||a.bottom-b.bottom||a.right-b.right||a.top-b.top);return freeze(result.filter(b=>b.right>b.left&&b.top>b.bottom).map(rect));
}
/** Canonical disjoint positive-area union, independent of input order and duplication. */
export function unionRects(rects:readonly Rect[]):readonly Rect[]{return differenceUnion(rects,[]);}
/** The union of all sources minus all cutters; output pieces are also mutually disjoint. */
export function subtractRects(rects:readonly Rect[],cuts:readonly Rect[]):readonly Rect[]{return differenceUnion(rects,cuts);}
