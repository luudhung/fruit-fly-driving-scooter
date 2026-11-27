export type TerminalPassengerPoint={x:number;y:number;z:number};
export function airportTerminalPassengerLayout(terminal:{x:number;z:number;w:number;d:number}):{
 groundY:number;upperY:number;upperFloor:number;stairWidth:number;
 landside:{approach:TerminalPassengerPoint;entry:TerminalPassengerPoint;foot:TerminalPassengerPoint;top:TerminalPassengerPoint;turn:TerminalPassengerPoint;door:TerminalPassengerPoint;inside:TerminalPassengerPoint;corridor:TerminalPassengerPoint;upperEntrance:TerminalPassengerPoint};
 airside:{door:TerminalPassengerPoint;landing:TerminalPassengerPoint;foot:TerminalPassengerPoint;apron:TerminalPassengerPoint};
 departureControls:Array<TerminalPassengerPoint&{stage:string}>;
};
