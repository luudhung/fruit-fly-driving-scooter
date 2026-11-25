const unsafe=new Set(['__proto__','prototype','constructor']);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const safe=key=>{if(unsafe.has(key))throw Error('unsafe delta key');};
/** A shallow projection; callers freeze their own baseline with structuredClone. */
export function projectLocalDocument(state){
 const {flies,locations,...world}=state;
 return {world,actors:Object.fromEntries(flies.map(f=>[f.id,f]))};
}
export function localDocumentState(document){return {...document.world,flies:Object.values(document.actors)};}
function equal(a,b){
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 if(Array.isArray(a)&&a.length!==b.length)return false;
 const keys=Object.keys(a).filter(k=>a[k]!==undefined),other=Object.keys(b).filter(k=>b[k]!==undefined);
 if(keys.length!==other.length)return false;
 return keys.every(k=>own(b,k)&&equal(a[k],b[k]));
}
function difference(a,b){
 if(Object.is(a,b))return null;
 if(Array.isArray(a)&&Array.isArray(b)){
  if(b.length>500000)return equal(a,b)?null:[0,b];
  const entries=[];
  for(let index=0;index<b.length;index++){
   const patch=index<a.length?difference(a[index],b[index]):[0,b[index]];
   if(patch)entries.push([index,patch]);
  }
  if(!entries.length&&a.length===b.length)return null;
  // Replacing a wholly changed primitive list is smaller than indexing every
  // element; nested visitor records retain sparse patches and shared brains.
  if(entries.length===b.length&&entries.length&&entries.every(([,patch])=>patch[0]===0))return [0,b];
  return [2,b.length,entries];
 }
 if(object(a)&&object(b)){
  const entries=[],deleted=[];
  for(const key of Object.keys(a))if(a[key]!==undefined&&(!own(b,key)||b[key]===undefined)){safe(key);deleted.push(key);}
  for(const key of Object.keys(b)){
   if(b[key]===undefined)continue;safe(key);
   const patch=own(a,key)?difference(a[key],b[key]):[0,b[key]];
   if(patch)entries.push([key,patch]);
  }
  return entries.length||deleted.length?[1,entries,deleted]:null;
 }
 return equal(a,b)?null:[0,b];
}
export function diffLocalDocument(previous,next){return difference(previous,next);}
/** Copy only changed branches, preserving large immutable private brain arrays. */
export function applyLocalDelta(document,patch){
 let nodes=0;
 function apply(value,p,depth=0){
  if(++nodes>500000||depth>64)throw Error('delta exceeds structural bounds');
  if(p===null)return value;
  if(!Array.isArray(p))throw Error('invalid delta node');
  if(p[0]===0&&p.length===2)return p[1];
  if(p[0]===2){
   if(p.length!==3||!Array.isArray(value)||!Number.isSafeInteger(p[1])||p[1]<0||p[1]>500000||!Array.isArray(p[2]))throw Error('invalid array delta');
   if(p[2].length>500000-nodes)throw Error('delta exceeds structural bounds');
   const indices=new Set();let extensions=0;
   for(const entry of p[2]){
    if(!Array.isArray(entry)||entry.length!==2||!Number.isSafeInteger(entry[0])||entry[0]<0||entry[0]>=p[1]||indices.has(entry[0]))throw Error('invalid array index');
    indices.add(entry[0]);if(entry[0]>=value.length){if(!Array.isArray(entry[1])||entry[1][0]!==0||entry[1].length!==2)throw Error('invalid array extension');extensions++;}
   }
   if(extensions!==Math.max(0,p[1]-value.length))throw Error('incomplete array extension');
   const result=value.slice(0,p[1]);result.length=p[1];
   for(const [index,child]of p[2])result[index]=apply(value[index],child,depth+1);
   return result;
  }
  if(p[0]!==1||p.length!==3||!Array.isArray(p[1])||!Array.isArray(p[2])||!object(value))throw Error('invalid object delta');
  const result={...value};
  for(const key of p[2]){if(typeof key!=='string')throw Error('invalid delta key');safe(key);delete result[key];}
  for(const entry of p[1]){
   if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string')throw Error('invalid delta entry');
   const [key,child]=entry;safe(key);result[key]=apply(value[key],child,depth+1);
  }
  return result;
 }
 const result=apply(document,patch);
 if(!object(result)||!object(result.world)||!object(result.actors))throw Error('invalid city document');
 for(const [id,f]of Object.entries(result.actors))if(!object(f)||id!==f.id)throw Error('invalid actor dictionary');
 return result;
}
