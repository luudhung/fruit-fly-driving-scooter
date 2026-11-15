// Circuit pace uses world distance, the ordinary motorway baseline, and the
// current city clock ratio. All segment timestamps are in game seconds.
export const F1_MOTORWAY_BASELINE=36;
export const F1_TARGET_SPEED=6*F1_MOTORWAY_BASELINE;
export const F1_TYRES={
 soft:{pace:1.045,wearPerLap:.071},
 medium:{pace:1,wearPerLap:.043},
 hard:{pace:.968,wearPerLap:.027},
};

function strategy(seed,laps){
 if(seed<.33)return [{lap:0,compound:'soft'},{lap:Math.floor(laps*.25),compound:'medium'},{lap:Math.floor(laps*.65),compound:'hard'}];
 if(seed<.67)return [{lap:0,compound:'medium'},{lap:Math.floor(laps*.43),compound:'hard'}];
 return [{lap:0,compound:'hard'},{lap:Math.floor(laps*.52),compound:'medium'},{lap:Math.floor(laps*.84),compound:'soft'}];
}

export function planF1Motion(circuit,{startAt,timeScale,laps,pace,seed,gridGap=0}){
 const segments=[],pit=circuit.pit,stints=pit?strategy(seed,laps):[{lap:0,compound:'medium'}];
 const startProgress=-gridGap/circuit.lapLength;
 let time=startAt,compound=stints[0].compound,age=0,stops=0;
 function add(duration,progressFrom,progressTo,wear,extra){
  const end=time+duration;
  segments.push({start:time,end,progressFrom,progressTo,compound,wear,...extra});time=end;
 }
 function road(from,to,wear){
  const speed=F1_TARGET_SPEED*pace*F1_TYRES[compound].pace*(1-Math.min(.18,wear*.105));
  add((to-from)*circuit.lapLength*timeScale/speed,from,to,wear);
 }
 if(startProgress<0)road(startProgress,0,0);
 for(let lap=0;lap<laps;lap++){
  let wear=Math.min(1,age*F1_TYRES[compound].wearPerLap);
  const stop=stints[stops+1];
  if(!pit||stop?.lap!==lap){road(lap,lap+1,wear);age++;continue;}
  const enter=lap+pit.enter,exit=lap+pit.exit;
  road(lap,enter,wear);
  const pitTime=pit.length*timeScale/(F1_TARGET_SPEED*.24);
  add(pitTime*pit.box,enter,enter,wear,{pitFrom:0,pitTo:pit.box,pitPhase:'entry'});
  add(timeScale*(2.1+seed*1.2),enter,enter,wear,{pitFrom:pit.box,pitTo:pit.box,pitPhase:'changing tyres'});
  compound=stop.compound;age=0;wear=0;stops++;
  add(pitTime*(1-pit.box),enter,exit,wear,{pitFrom:pit.box,pitTo:1,pitPhase:'exit'});
  road(exit,lap+1,wear);age++;
 }
 return {segments,finishedAt:time,stops};
}

export function f1MotionWindow(segments,at){
 let low=0,high=segments.length-1;
 while(low<high){const mid=(low+high)>>1;if(segments[mid].end<=at)low=mid+1;else high=mid;}
 return segments.slice(low,low+4);
}

export function sampleF1Motion(segments,at){
 const segment=segments.find(s=>at<s.end)||segments.at(-1);
 if(!segment)return null;
 const fraction=Math.max(0,Math.min(1,(at-segment.start)/Math.max(1e-6,segment.end-segment.start)));
 const progress=segment.progressFrom+(segment.progressTo-segment.progressFrom)*fraction;
 const pit=segment.pitFrom==null?null:segment.pitFrom+(segment.pitTo-segment.pitFrom)*fraction;
 return {progress,pit,pitPhase:segment.pitPhase||null,compound:segment.compound,wear:segment.wear};
}
