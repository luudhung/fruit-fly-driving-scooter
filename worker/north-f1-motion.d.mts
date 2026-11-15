export const F1_MOTORWAY_BASELINE:number;
export const F1_TARGET_SPEED:number;
export const F1_TYRES:Record<F1Compound,{pace:number;wearPerLap:number}>;
export type F1Compound='soft'|'medium'|'hard';
export type F1MotionSegment={start:number;end:number;progressFrom:number;progressTo:number;compound:F1Compound;wear:number;pitFrom?:number;pitTo?:number;pitPhase?:'entry'|'changing tyres'|'exit'};
export function planF1Motion(circuit:{lapLength:number;pit?:{enter:number;box:number;exit:number;length:number}},options:{startAt:number;timeScale:number;laps:number;pace:number;seed:number;gridGap?:number;pitBoxProgress?:number}):{segments:F1MotionSegment[];finishedAt:number;stops:number};
export function f1MotionWindow(segments:F1MotionSegment[],at:number):F1MotionSegment[];
export function sampleF1Motion(segments:F1MotionSegment[],at:number):{progress:number;pit:number|null;pitPhase:string|null;compound:F1Compound;wear:number}|null;
