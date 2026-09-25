import { MotorbikeWorld } from "./motorbike-world";
import { BrainDrive, type BrainStatus } from "./motorbike-brain";

const worldEl = document.getElementById("world") as HTMLDivElement;
const telemetry = document.getElementById("telemetry") as HTMLDivElement;
const brainStatusEl = document.getElementById("brain-status") as HTMLDivElement;
const brainDetailEl = document.getElementById("brain-detail") as HTMLDivElement;
const retinaCanvas = document.getElementById("retina") as HTMLCanvasElement;
const retinaCtx = retinaCanvas.getContext("2d")!;
const retinaImage = retinaCtx.createImageData(64, 16);

const world = new MotorbikeWorld(worldEl);
world.start();

let latestBrain: BrainStatus = {
  stage: "loading",
  message: "Starting full FlyWire brain…",
};

const brain = new BrainDrive(world, {
  onStatus(status) {
    latestBrain = { ...latestBrain, ...status };
    brainStatusEl.dataset.state = status.stage;
    brainStatusEl.textContent =
      status.stage === "running" ? "FULL BRAIN ONLINE"
      : status.stage === "error" ? "BRAIN LOAD ERROR"
      : "LOADING FULL BRAIN";
    brainDetailEl.textContent = status.message;
  },
  onRetina(pixels, w, h) {
    const dst = retinaImage.data;
    for (let y = 0; y < h; y++) {
      const srcRow = (h - 1 - y) * w * 4;
      const dstRow = y * w * 4;
      for (let i = 0; i < w * 4; i++) dst[dstRow + i] = pixels[srcRow + i];
    }
    retinaCtx.putImageData(retinaImage, 0, 0);
  },
});

void brain.start();

function fmt(n: number | undefined) {
  return n == null ? "—" : n.toLocaleString();
}

function tickHud() {
  const t = world.getTelemetry();
  telemetry.innerHTML = [
    '<div class="metric"><span>street</span><b>' + t.street + '</b></div>',
    '<div class="metric"><span>speed</span><b>' + t.speedKmh.toFixed(1) + ' km/h</b></div>',
    '<div class="metric"><span>steering</span><b>' + t.steering.toFixed(2) + '</b></div>',
    '<div class="metric"><span>brain steer</span><b>' + t.brainSteer.toFixed(2) + '</b></div>',
    '<div class="metric"><span>DN activity</span><b>' + t.brainActivity.toFixed(4) + '</b></div>',
    '<div class="metric"><span>collisions</span><b>' + t.collisionCount + '</b></div>',
    '<div class="metric wide"><span>FlyWire</span><b>' + fmt(latestBrain.neurons) + ' neurons · ' + fmt(latestBrain.edges) + ' edges</b></div>',
    '<div class="metric wide"><span>MANC</span><b>' + fmt(latestBrain.vncNeurons) + ' neurons · ' + fmt(latestBrain.vncEdges) + ' edges</b></div>',
  ].join("");
  requestAnimationFrame(tickHud);
}

tickHud();
