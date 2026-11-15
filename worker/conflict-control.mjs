const LIMIT=2048;
const trustedOrigin=origin=>!origin||origin==='https://fruit-fly-driving-scooter.vercel.app'||/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin);
const header=(request,name)=>request.headers?.get?.(name)??request.headers?.[name]??null;
const unavailable=()=>({status:503,body:{accepted:false,reason:'Could not confirm the request; retry with the same request ID.'}});
/** A bounded gameplay command, shared by the Node and Durable Object adapters. */
export async function handleConflictControl(request,{requestConflict,persist=async()=>{}}){
 if(!trustedOrigin(header(request,'origin')))return{status:403,body:{accepted:false,reason:'This control belongs to the city viewer.'}};
 if(Number(header(request,'content-length')||0)>LIMIT)return{status:413,body:{accepted:false,reason:'Request is too large.'}};
 let text='',bytes=0;
 try{
  const decoder=new TextDecoder(),body=request.body??(request[Symbol.asyncIterator]?request:[]);
  for await(const chunk of body){const part=typeof chunk==='string'?new TextEncoder().encode(chunk):chunk;bytes+=part.byteLength;if(bytes>LIMIT)return{status:413,body:{accepted:false,reason:'Request is too large.'}};text+=decoder.decode(part,{stream:true});}
  text+=decoder.decode();
 }catch{return unavailable();}
 let data;try{data=JSON.parse(text);}catch{return{status:400,body:{accepted:false,reason:'Invalid request.'}};}
 const id=data?.requestId;
 if(typeof id!=='string'||!/^[-A-Za-z0-9_:]{8,96}$/.test(id)||id==='prototype'||Object.prototype.hasOwnProperty.call(Object.prototype,id)||data.quick!==true)return{status:400,body:{accepted:false,reason:'A unique quick-conflict request is required.'}};
 try{
  const result=requestConflict({requestId:id,fromCountryId:'hansdrex',toCountryId:'north-city',quick:true});
  if(!result.accepted)return{status:result.reason==='conflict queue is full'?429:400,body:result};
  if(await persist()===false)return unavailable();return{status:200,body:result};
 }catch{return unavailable();}
}
