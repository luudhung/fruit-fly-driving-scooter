import http from "node:http";
import net from "node:net";

const PORT=Number(process.env.PORT||3000);
const REDIS_HOST=process.env.REDIS_HOST||"redis";
const REDIS_PORT=Number(process.env.REDIS_PORT||6379);
const STATE_KEY="flybrain:stock:state:v1";
const STARTING_CASH=100000;
const MAX_HISTORY=120;
const TRADE_NOTIONAL=85000;

const defaultState=()=>({
  version:1,updatedAt:Date.now(),startedAt:Date.now(),symbol:"BTCUSDT",price:0,prices:[],
  cash:STARTING_CASH,marginLocked:0,realizedPnL:0,position:null,wins:0,losses:0,stress:18,
  peakEquity:STARTING_CASH,totalCashIn:STARTING_CASH,totalCashOut:0,lastAction:"BOOT",lastDecisionAt:0,
  mode:"AUTONOMOUS_SERVER",
  fullBrain:{online:false,lastSeen:0,neurons:0,edges:0,signal:0,activity:0,regions:{}},
  tape:["24/7 worker booted"]
});

function encode(parts){
  let out="*"+parts.length+"\r\n";
  for(const p of parts){const s=String(p);out+="$"+Buffer.byteLength(s)+"\r\n"+s+"\r\n";}
  return out;
}
function parseBulk(buf){
  const s=buf.toString();
  if(s.startsWith("$-1"))return null;
  if(s.startsWith("+"))return s.slice(1,s.indexOf("\r\n"));
  if(s.startsWith("-"))throw new Error(s.slice(1,s.indexOf("\r\n")));
  const first=s.indexOf("\r\n");
  const len=Number(s.slice(1,first));
  return s.slice(first+2,first+2+len);
}
function redisCommand(parts){
  return new Promise((resolve,reject)=>{
    const sock=net.createConnection({host:REDIS_HOST,port:REDIS_PORT});
    const chunks=[];sock.setTimeout(4000);
    sock.on("connect",()=>sock.write(encode(parts)));
    sock.on("data",c=>chunks.push(c));
    sock.on("end",()=>{try{resolve(parseBulk(Buffer.concat(chunks)));}catch(e){reject(e);}});
    sock.on("error",reject);sock.on("timeout",()=>sock.destroy(new Error("redis timeout")));
  });
}
async function loadState(){
  try{const raw=await redisCommand(["GET",STATE_KEY]);return raw?{...defaultState(),...JSON.parse(raw)}:defaultState();}
  catch(e){console.error("redis load failed",e);return defaultState();}
}
async function saveState(s){s.updatedAt=Date.now();await redisCommand(["SET",STATE_KEY,JSON.stringify(s)]);}
function addTape(s,line){s.tape.unshift(new Date().toISOString()+" · "+line);s.tape=s.tape.slice(0,40);}
function unrealized(s){if(!s.position||!s.price)return 0;const d=s.position.side==="LONG"?1:-1;return(s.price-s.position.entry)*s.position.qty*d;}
function equity(s){return s.cash+unrealized(s);}
function freeCash(s){return s.cash-s.marginLocked;}
function closePosition(s,reason){
  if(!s.position||!s.price)return;
  const p=s.position,d=p.side==="LONG"?1:-1,pnl=(s.price-p.entry)*p.qty*d;
  s.cash+=pnl;s.realizedPnL+=pnl;s.marginLocked=Math.max(0,s.marginLocked-p.margin);
  s.totalCashIn+=p.margin+Math.max(0,pnl);if(pnl<0)s.totalCashOut+=Math.abs(pnl);
  if(pnl>=0){s.wins++;s.stress=Math.max(0,s.stress-6);}
  else{s.losses++;s.stress=Math.min(100,s.stress+16+Math.min(24,Math.abs(pnl)/300));}
  addTape(s,(pnl>=0?"WIN ":"LOSS ")+p.side+" "+pnl.toFixed(2)+" · "+reason);s.position=null;
}
function openPosition(s,side,confidence=.55){
  if(!s.price)return;
  const notional=Math.max(12000,Math.min(Math.abs(equity(s))*1.25,TRADE_NOTIONAL)),margin=notional/4;
  s.position={side,entry:s.price,qty:notional/s.price,notional,margin,openedAt:Date.now()};
  s.marginLocked+=margin;s.totalCashOut+=margin;s.stress=Math.min(100,s.stress+5+confidence*8);
  addTape(s,"OPEN "+side+" @ "+s.price.toFixed(2)+" · "+notional.toFixed(2)+" notional");
}
function applyDecision(s,side,confidence,source){
  if(side==="WAIT"){s.lastAction="HOLD";return;}
  const desired=side==="UP"?"LONG":"SHORT";
  if(s.position?.side===desired){s.lastAction="KEEP "+desired;return;}
  if(s.position)closePosition(s,"reversal");
  openPosition(s,desired,confidence);s.lastAction=desired+" · "+source;s.lastDecisionAt=Date.now();
}
function serverDecision(s){
  if(s.prices.length<12)return{side:"WAIT",confidence:0};
  const a=s.prices.at(-1),b=s.prices.at(-8),c=s.prices.at(-12);
  const score=((a-b)/b)*.65+((a-c)/c)*.35,threshold=.00018+Math.min(.0004,s.stress/100*.0002);
  if(Math.abs(score)<threshold)return{side:"WAIT",confidence:.5};
  return{side:score>0?"UP":"DOWN",confidence:Math.min(.92,.55+Math.abs(score)*260)};
}
function brainFresh(s){return Date.now()-(s.fullBrain?.lastSeen||0)<30000;}

let state=await loadState(),loopBusy=false;
async function marketTick(){
  if(loopBusy)return;loopBusy=true;
  try{
    const r=await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",{signal:AbortSignal.timeout(5000)});
    if(!r.ok)throw new Error("binance "+r.status);
    const px=Number((await r.json()).price);
    if(Number.isFinite(px)&&px>0){
      const prev=state.price||px;state.price=px;state.prices.push(px);if(state.prices.length>MAX_HISTORY)state.prices.shift();
      state.stress=Math.min(100,state.stress+Math.min(2.5,Math.abs((px-prev)/prev)*5000));
      state.peakEquity=Math.max(state.peakEquity||STARTING_CASH,equity(state));
      if(state.position&&unrealized(state)<0)state.stress=Math.min(100,state.stress+Math.min(2,Math.abs(unrealized(state))/1800));
      if(brainFresh(state)){state.mode="FULL_BRAIN_CLIENT";state.fullBrain.online=true;}
      else{
        state.mode="AUTONOMOUS_SERVER";state.fullBrain.online=false;
        if(!state.resting&&Date.now()-state.lastDecisionAt>8000){const d=serverDecision(state);applyDecision(state,d.side,d.confidence,"server");}
      }
      if(state.stress>=78)state.resting=true;
      if(state.resting){state.stress=Math.max(0,state.stress-.9);if(state.stress<=28)state.resting=false;}
      else state.stress=Math.max(0,state.stress-.05);
      await saveState(state);
    }
  }catch(e){console.error("market tick",e);}finally{loopBusy=false;}
}
setInterval(marketTick,2000);void marketTick();

function json(res,status,payload){
  const body=JSON.stringify(payload);res.writeHead(status,{
    "content-type":"application/json; charset=utf-8","access-control-allow-origin":"*",
    "access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type","cache-control":"no-store"
  });res.end(body);
}
async function body(req){const chunks=[];for await(const c of req)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString()||"{}");}

http.createServer(async(req,res)=>{
  if(req.method==="OPTIONS")return json(res,204,{});
  const url=new URL(req.url||"/","http://localhost");
  if(url.pathname==="/health")return json(res,200,{ok:true,mode:state.mode});
  if(url.pathname==="/state"&&req.method==="GET")return json(res,200,{...state,unrealizedPnL:unrealized(state),equity:equity(state),freeCash:freeCash(state),workerNow:Date.now()});
  if(url.pathname==="/brain/telemetry"&&req.method==="POST"){
    try{const d=await body(req);state.fullBrain={online:true,lastSeen:Date.now(),neurons:Number(d.neurons||0),edges:Number(d.edges||0),signal:Number(d.signal||0),activity:Number(d.activity||0),regions:d.regions||{}};state.mode="FULL_BRAIN_CLIENT";await saveState(state);return json(res,200,{ok:true});}
    catch(e){return json(res,400,{error:String(e)});}
  }
  if(url.pathname==="/brain/decision"&&req.method==="POST"){
    try{const d=await body(req);state.fullBrain.lastSeen=Date.now();state.fullBrain.online=true;state.mode="FULL_BRAIN_CLIENT";if(!state.resting)applyDecision(state,d.side,Number(d.confidence||0),"full-brain");await saveState(state);return json(res,200,{ok:true,equity:equity(state)});}
    catch(e){return json(res,400,{error:String(e)});}
  }
  if(url.pathname==="/reset"&&req.method==="POST"){state=defaultState();await saveState(state);return json(res,200,{ok:true});}
  return json(res,404,{error:"not found"});
}).listen(PORT,"0.0.0.0",()=>console.log("flybrain worker listening",PORT));
