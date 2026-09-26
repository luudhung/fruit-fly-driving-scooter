const ALLOWED = new Set(["AAPL","NVDA","TSLA","SPY","MSFT"]);

export default async function handler(req:any,res:any){
  const raw=Array.isArray(req.query?.symbol)?req.query.symbol[0]:req.query?.symbol;
  const symbol=String(raw||"NVDA").toUpperCase().trim();
  if(!ALLOWED.has(symbol)){
    res.status(400).json({error:"Unsupported symbol",allowed:[...ALLOWED]});
    return;
  }

  const url="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+
    "?range=1d&interval=1m&includePrePost=true&events=div%2Csplits";
  try{
    const upstream=await fetch(url,{
      headers:{
        "User-Agent":"Mozilla/5.0 (compatible; FlyBrainMarketLab/1.0)",
        "Accept":"application/json,text/plain,*/*"
      }
    });
    if(!upstream.ok) throw new Error("Yahoo Finance HTTP "+upstream.status);
    const payload=await upstream.json();
    const result=payload?.chart?.result?.[0];
    if(!result) throw new Error(payload?.chart?.error?.description||"No market result");

    const timestamps:number[]=result.timestamp||[];
    const quote=result.indicators?.quote?.[0]||{};
    const closes:(number|null)[]=quote.close||[];
    const points:{t:number;p:number}[]=[];
    for(let i=0;i<timestamps.length;i++){
      const p=Number(closes[i]);
      if(Number.isFinite(p)) points.push({t:timestamps[i],p});
    }
    const meta=result.meta||{};
    const latest=points[points.length-1];
    const metaPrice=Number(meta.regularMarketPrice);
    const price=Number.isFinite(metaPrice)?metaPrice:latest?.p;
    if(!Number.isFinite(price)) throw new Error("No valid price");

    const latestTs=Math.max(
      Number(meta.regularMarketTime)||0,
      latest?.t||0
    );
    const ageSec=latestTs?Math.max(0,Math.floor(Date.now()/1000-latestTs)):null;

    res.setHeader("Cache-Control","no-store, max-age=0");
    res.setHeader("Access-Control-Allow-Origin","*");
    res.status(200).json({
      symbol,
      price,
      currency:meta.currency||"USD",
      exchangeName:meta.fullExchangeName||meta.exchangeName||"",
      exchangeTimezoneName:meta.exchangeTimezoneName||"America/New_York",
      regularMarketTime:Number(meta.regularMarketTime)||latestTs||null,
      previousClose:Number(meta.chartPreviousClose)||Number(meta.previousClose)||null,
      ageSec,
      delayed:ageSec!=null?ageSec>120:true,
      points:points.slice(-96),
      source:"Yahoo Finance chart endpoint (unofficial/best-effort)"
    });
  }catch(error){
    res.status(502).json({
      error:error instanceof Error?error.message:String(error),
      symbol,
      source:"Yahoo Finance chart endpoint (unofficial/best-effort)"
    });
  }
}
