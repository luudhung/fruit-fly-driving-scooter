type TransportActor={alive?:boolean;traveling?:boolean;transitMode?:string;motion?:{mode:string;timed?:boolean}|null;indoors?:boolean;onPlane?:boolean;onTrain?:boolean;heliPassenger?:boolean;onPrivateHelicopter?:boolean;onFireEngine?:boolean;onAmbulance?:boolean;taxiPassenger?:boolean};

const passenger=(f:TransportActor)=>Boolean(f.onPlane||f.onTrain||f.heliPassenger||f.onPrivateHelicopter||f.onFireEngine||f.onAmbulance||f.taxiPassenger);

/** A road trip can use a hired vehicle without owning a permanent parked car. */
export const isCarTrip=(f:TransportActor)=>Boolean(f.alive!==false&&f.traveling&&!f.indoors&&!passenger(f)&&(f.transitMode??f.motion?.mode)==='car');
export const showResidentBody=(f:TransportActor)=>Boolean(f.alive&&(!f.indoors||f.motion?.timed&&f.motion.mode==='walk')&&!passenger(f)&&!isCarTrip(f));
