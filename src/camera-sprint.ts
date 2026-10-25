// Shared by physical keys and touch controls. Browser key-repeat is never a second tap.
export class CameraSprint {
  readonly pressed=new Set<string>();
  private lastForwardDown=-Infinity;
  private sprinting=false;
  down(code:string,now:number,repeat=false){
    const forward=code==='KeyW'||code==='ArrowUp';
    const alreadyForward=this.pressed.has('KeyW')||this.pressed.has('ArrowUp');
    if(forward&&!repeat&&!alreadyForward){
      this.sprinting=now-this.lastForwardDown<=280;
      this.lastForwardDown=now;
    }
    this.pressed.add(code);
  }
  up(code:string){
    this.pressed.delete(code);
    if(!this.pressed.has('KeyW')&&!this.pressed.has('ArrowUp'))this.sprinting=false;
  }
  reset(){this.pressed.clear();this.lastForwardDown=-Infinity;this.sprinting=false;}
  get multiplier(){return this.sprinting||this.pressed.has('ShiftLeft')||this.pressed.has('ShiftRight')?2:1;}
}
