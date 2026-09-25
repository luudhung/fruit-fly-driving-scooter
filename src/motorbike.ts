import { MotorbikeWorld } from "./motorbike-world";

const worldEl = document.getElementById("world") as HTMLDivElement;
const world = new MotorbikeWorld(worldEl);

const start = document.getElementById("start") as HTMLButtonElement;
const pause = document.getElementById("pause") as HTMLButtonElement;
const reset = document.getElementById("reset") as HTMLButtonElement;
const telemetry = document.getElementById("telemetry") as HTMLPreElement;

start.addEventListener("click", () => world.start());
pause.addEventListener("click", () => world.pause());
reset.addEventListener("click", () => world.reset());

function tickHud() {
  const t = world.getTelemetry();
  telemetry.textContent = [
    "CONTROL SOURCE  MANUAL (PHASE B — NOT BRAIN)",
    `speed           ${t.speedKmh.toFixed(1)} km/h`,
    `position        x=${t.positionX.toFixed(2)}  z=${t.positionZ.toFixed(2)}`,
    `heading         ${(t.headingRad * 180 / Math.PI).toFixed(1)}°`,
    `steering        ${t.steering.toFixed(2)}`,
    `throttle        ${t.throttle.toFixed(2)}`,
    `brake           ${t.brake.toFixed(2)}`,
    `collisions      ${t.collisionCount}`,
  ].join("\n");
  requestAnimationFrame(tickHud);
}
tickHud();
