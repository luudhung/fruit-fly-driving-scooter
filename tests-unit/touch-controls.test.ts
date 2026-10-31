import test from 'node:test';import assert from 'node:assert/strict';
import {bindTouchControls,touchButtonSize,blockBrowserGestures} from '../src/touch-controls.ts';
class Button extends EventTarget{
 dataset:{key:string};active=false;classList={add:()=>{this.active=true;},remove:()=>{this.active=false;}};
 constructor(key:string){super();this.dataset={key};}setPointerCapture(_id:number){}
}
function pointer(target:EventTarget,type:string,id:number){const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:id});target.dispatchEvent(e);return e;}
function setup(){const forward=new Button('KeyW'),jump=new Button('Space'),events=new EventTarget(),visibility=Object.assign(new EventTarget(),{hidden:false}),calls:string[]=[];
 const controls=bindTouchControls([forward,jump] as unknown as HTMLButtonElement[],{down:key=>calls.push('down:'+key),up:key=>calls.push('up:'+key)},events,visibility);return {forward,jump,events,visibility,calls,controls};}
test('a player can hold forward with one finger and jump with another; release outside still stops movement',()=>{
 const s=setup();assert.ok(pointer(s.forward,'pointerdown',1).defaultPrevented);pointer(s.jump,'pointerdown',2);
 assert.deepEqual(s.calls,['down:KeyW','down:Space']);pointer(s.events,'pointerup',2);assert.ok(s.forward.active);assert.ok(!s.jump.active);
 pointer(s.events,'pointerup',1);pointer(s.forward,'lostpointercapture',1);assert.deepEqual(s.calls,['down:KeyW','down:Space','up:Space','up:KeyW']);s.controls.dispose();
});
test('overlapping fingers on one button do not release its key early; cancel and blur clear held inputs',()=>{
 const s=setup();pointer(s.forward,'pointerdown',1);pointer(s.forward,'pointerdown',2);pointer(s.events,'pointerup',1);
 assert.deepEqual(s.calls,['down:KeyW']);assert.ok(s.forward.active);pointer(s.events,'pointercancel',2);assert.equal(s.calls.at(-1),'up:KeyW');
 pointer(s.jump,'pointerdown',3);s.events.dispatchEvent(new Event('blur'));assert.equal(s.calls.at(-1),'up:Space');assert.ok(!s.jump.active);
 pointer(s.forward,'pointerdown',4);s.visibility.hidden=true;s.visibility.dispatchEvent(new Event('visibilitychange'));assert.equal(s.calls.at(-1),'up:KeyW');s.controls.dispose();
});
test('context menus and synthetic clicks are blocked; disposal removes input handlers',()=>{
 const s=setup();assert.ok(pointer(s.forward,'contextmenu',1).defaultPrevented);assert.ok(pointer(s.forward,'click',1).defaultPrevented);s.controls.dispose();pointer(s.forward,'pointerdown',1);assert.deepEqual(s.calls,[]);
});
test('button size honors the requested size and keeps the movement pad inside a narrow phone',()=>{
 assert.deepEqual(touchButtonSize(72,390),{size:72,maximum:104});assert.equal(touchButtonSize(104,320).size,88);assert.equal(touchButtonSize(NaN,390).size,72);assert.equal(touchButtonSize(5,390).size,48);
 for(const width of [240,320,360,390,430]){const {size}=touchButtonSize(104,width);assert.ok(size*3+52<=width);}
});

test('compatibility touch and WebKit gestures cannot zoom after double-tap controls, without duplicate presses',()=>{
 const s=setup();
 for(const type of ['touchstart','touchend','dblclick'])assert.ok(pointer(s.forward,type,1).defaultPrevented);
 assert.deepEqual(s.calls,[]);pointer(s.forward,'pointerdown',1);pointer(s.events,'pointerup',1);
 assert.deepEqual(s.calls,['down:KeyW','up:KeyW']);
 const unbind=blockBrowserGestures(s.events);
 for(const type of ['gesturestart','gesturechange','gestureend'])assert.ok(pointer(s.events,type,0).defaultPrevented);
 unbind();assert.equal(pointer(s.events,'gesturestart',0).defaultPrevented,false);s.controls.dispose();
});
