export type TouchControlHandlers={down:(key:string,now:number)=>void;up:(key:string)=>void};
/** Each finger owns its press until release/cancel, including releases outside its button. */
export function bindTouchControls(buttons:Iterable<HTMLButtonElement>,handlers:TouchControlHandlers,events:EventTarget=window,visibility:EventTarget&{hidden?:boolean}=document){
 const presses=new Map<number,{key:string;button:HTMLButtonElement}>(),cleanup:Array<()=>void>=[];
 const listen=(target:EventTarget,type:string,fn:EventListener,options?:AddEventListenerOptions|boolean)=>{target.addEventListener(type,fn,options);cleanup.push(()=>target.removeEventListener(type,fn,options));};
 const release=(id:number)=>{
  const press=presses.get(id);if(!press)return;presses.delete(id);
  if(![...presses.values()].some(p=>p.key===press.key))handlers.up(press.key);
  if(![...presses.values()].some(p=>p.button===press.button))press.button.classList.remove('active');
 };
 const releaseAll=()=>{for(const id of [...presses.keys()])release(id);};
 const up:EventListener=e=>release((e as PointerEvent).pointerId);
 for(const button of buttons){
  const key=button.dataset.key;if(!key)continue;
  const down:EventListener=e=>{
   const p=e as PointerEvent;if(presses.has(p.pointerId))return;
   if(p.cancelable)p.preventDefault();p.stopPropagation();
   const first=![...presses.values()].some(v=>v.key===key);
   presses.set(p.pointerId,{key,button});button.classList.add('active');
   if(first)handlers.down(key,performance.now());
   try{button.setPointerCapture(p.pointerId);}catch{/* Window release is the fallback. */}
  };
  listen(button,'pointerdown',down,{passive:false});listen(button,'pointerup',up);listen(button,'pointercancel',up);listen(button,'lostpointercapture',up);
  listen(button,'contextmenu',e=>e.preventDefault());
  // Safari's compatibility touch/double-click defaults can otherwise zoom after a double jump.
  for(const type of ['touchstart','touchend','dblclick'])listen(button,type,e=>{if(e.cancelable)e.preventDefault();e.stopPropagation();},{passive:false});
  listen(button,'click',e=>{e.preventDefault();e.stopPropagation();});
 }
 listen(events,'pointerup',up,true);listen(events,'pointercancel',up,true);listen(events,'blur',releaseAll);
 listen(visibility,'visibilitychange',()=>{if(visibility.hidden)releaseAll();});
 return {releaseAll,dispose(){releaseAll();for(const fn of cleanup)fn();}};
}
export function touchButtonSize(preferred:number,viewportWidth:number){
 const maximum=Math.max(48,Math.min(104,48+4*Math.floor(((viewportWidth-52)/3-48)/4)));
 return {size:Math.min(maximum,Math.max(48,Number.isFinite(preferred)?Math.round(preferred/4)*4:72)),maximum};
}

/** WebKit gesture events are separate from Pointer Events and must be cancelled explicitly. */
export function blockBrowserGestures(target:EventTarget=document){
 const stop=(e:Event)=>{if(e.cancelable)e.preventDefault();};
 for(const type of ['gesturestart','gesturechange','gestureend'])target.addEventListener(type,stop,{passive:false});
 return ()=>{for(const type of ['gesturestart','gesturechange','gestureend'])target.removeEventListener(type,stop);};
}
