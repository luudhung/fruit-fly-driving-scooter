export default async function handler(req:any,res:any){
  if(req.method!=="GET"){
    res.setHeader("Allow","GET");
    res.status(405).json({error:"Method not allowed"});
    return;
  }

  const raw=String(process.env.FLYBRAIN_WORKER_URL||"").trim();
  if(!raw){
    res.status(503).json({error:"24/7 worker not configured"});
    return;
  }

  const base=raw.replace(/\/+$/,"");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6000);
  try{
    const upstream=await fetch(base+"/state",{
      headers:{"Accept":"application/json"},
      cache:"no-store",
      signal:controller.signal,
    });
    const text=await upstream.text();
    res.setHeader("Cache-Control","no-store, max-age=0");
    res.setHeader("Content-Type","application/json; charset=utf-8");
    res.status(upstream.status).send(text);
  }catch(error){
    res.status(502).json({error:error instanceof Error?error.message:String(error)});
  }finally{
    clearTimeout(timer);
  }
}
