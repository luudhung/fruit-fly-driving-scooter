export {FlyWireBrainShard,FlyWireNeuralCoordinator} from "./neural/objects.mjs";
import { DurableObject } from "cloudflare:workers";
import {
  freshState,
  restoreState,
  getRawState,
  getState,
  tick,
  mortalityReport,
  snapshotLooksUsable,
  setNeuralSyncEnabled,
  getSimulationConfig,
  getNeuralAgents,applyNeuralOutputs,getNeuralStatus,markNeuralCycleFailed,
} from "../../worker/civilization-engine.mjs";

const SNAPSHOT_META_KEY = "snapshot:meta";
const CHUNK_PREFIX = "snapshot:chunk:";
const CHUNK_SIZE = 1_500_000;
const DEFAULT_WORLD_ID = "WORLD-A";
const DEFAULT_ALARM_INTERVAL_MS = 60_000;
const DEFAULT_IDLE_MAX_STEPS = 90;
const ACTIVE_PERSIST_INTERVAL_MS = 60_000;

setNeuralSyncEnabled(false);

function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "cache-control": "no-store",
    ...extra,
  };
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders({
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    }),
  });
}

async function gzipJson(value) {
  const source = new Blob([JSON.stringify(value)]).stream();
  const compressed = source.pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

async function gunzipJson(bytes) {
  const source = new Blob([bytes]).stream();
  const decompressed = source.pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(decompressed).text();
  return JSON.parse(text);
}

async function loadSnapshot(storage) {
  const meta = await storage.get(SNAPSHOT_META_KEY);
  if (!meta?.chunks) return null;
  const count = Number(meta.chunks);
  if (!Number.isInteger(count) || count < 1 || count > 128) return null;

  const keys = Array.from({ length: count }, (_, index) => `${CHUNK_PREFIX}${index}`);
  const parts = await storage.get(keys);
  let total = 0;
  const ordered = [];
  for (const key of keys) {
    const part = parts.get(key);
    if (!(part instanceof ArrayBuffer) && !ArrayBuffer.isView(part)) return null;
    const bytes = part instanceof ArrayBuffer
      ? new Uint8Array(part)
      : new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
    ordered.push(bytes);
    total += bytes.byteLength;
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const part of ordered) {
    combined.set(part, offset);
    offset += part.byteLength;
  }

  const state = await gunzipJson(combined);
  return snapshotLooksUsable(state)
    ? {
        state,
        lastWallClockMs: Number(meta.lastWallClockMs || Date.now()),
        savedAtMs: Number(meta.savedAtMs || 0),
      }
    : null;
}

async function saveSnapshot(storage, state, lastWallClockMs) {
  const compressed = await gzipJson(state);
  const chunkCount = Math.max(1, Math.ceil(compressed.byteLength / CHUNK_SIZE));
  if (chunkCount > 128) {
    throw new Error(`compressed civilization snapshot needs ${chunkCount} chunks; maximum supported is 128`);
  }

  const oldMeta = await storage.get(SNAPSHOT_META_KEY);
  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * CHUNK_SIZE;
    const end = Math.min(compressed.byteLength, start + CHUNK_SIZE);
    const chunk = compressed.slice(start, end);
    await storage.put(`${CHUNK_PREFIX}${index}`, chunk.buffer);
  }

  const oldCount = Number(oldMeta?.chunks || 0);
  if (oldCount > chunkCount) {
    const stale = Array.from(
      { length: oldCount - chunkCount },
      (_, index) => `${CHUNK_PREFIX}${chunkCount + index}`,
    );
    if (stale.length) await storage.delete(stale);
  }

  await storage.put(SNAPSHOT_META_KEY, {
    version: 1,
    codec: "gzip-json",
    chunks: chunkCount,
    compressedBytes: compressed.byteLength,
    simulationAgeSeconds: Number(state.simulationAgeSeconds || 0),
    lastWallClockMs,
    savedAtMs: Date.now(),
  });

  return {
    chunks: chunkCount,
    compressedBytes: compressed.byteLength,
  };
}

export class CivilizationWorld extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.lastWallClockMs = Date.now();
    this.lastPersistMs = 0;
    this.storageStats = null;
    this.queue = Promise.resolve();

    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      const saved = await loadSnapshot(this.ctx.storage);
      if (saved) {
        restoreState(saved.state);
        this.lastWallClockMs = saved.lastWallClockMs;
        this.lastPersistMs = saved.savedAtMs;
      } else {
        freshState();
        this.lastWallClockMs = Date.now();
        this.storageStats = await saveSnapshot(
          this.ctx.storage,
          getRawState(),
          this.lastWallClockMs,
        );
        this.lastPersistMs = Date.now();
      }
      await this.ensureAlarm();
    });
    if(env.NEURAL_ENABLED==='1'&&env.NEURAL_COORDINATOR){
      ctx.waitUntil(this.ready.then(()=>env.NEURAL_COORDINATOR.getByName(env.CIV_WORLD_ID||DEFAULT_WORLD_ID).ensureRunning()).catch(error=>console.error(JSON.stringify({event:'neural_start_failed',error:String(error)}))));
    }
  }

  withLock(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  alarmIntervalMs() {
    const configured = Number(this.env.CIV_ALARM_INTERVAL_MS || DEFAULT_ALARM_INTERVAL_MS);
    return Math.max(60_000, Math.min(3_600_000, configured));
  }

  idleMaxSteps() {
    const configured = Number(this.env.CIV_IDLE_MAX_STEPS || DEFAULT_IDLE_MAX_STEPS);
    return Math.max(10, Math.min(600, Math.floor(configured)));
  }

  async ensureAlarm() {
    const current = await this.ctx.storage.getAlarm();
    if (current == null) {
      await this.ctx.storage.setAlarm(Date.now() + this.alarmIntervalMs());
    }
  }

  async advanceTo(nowMs, reason = "request") {
    await this.ready;
    const elapsedRealSeconds = Math.max(0, (nowMs - this.lastWallClockMs) / 1000);
    if (elapsedRealSeconds < 0.75) return { elapsedRealSeconds, steps: 0 };

    const raw = getRawState();
    if (!snapshotLooksUsable(raw)) freshState();

    // Preserve elapsed game time while bounding decision samples as the city grows.
    const population = getRawState().flies.filter(fly=>fly.alive).length;
    const decisionBudget = Math.max(4, Math.min(24, Math.floor(6000/Math.max(1,population))));
    const maxSteps = reason === "alarm" ? Math.min(this.idleMaxSteps(),decisionBudget) : decisionBudget;
    const steps = Math.min(
      maxSteps,
      Math.max(1, Math.ceil(elapsedRealSeconds)),
    );
    const timeScale = Number(getRawState()?.timeScale || getSimulationConfig().gameSecondsPerRealSecond || 120);
    const totalGameSeconds = elapsedRealSeconds * timeScale;
    const gameSecondsPerStep = Math.max(1, totalGameSeconds / steps);

    const ageBefore=Number(getRawState().simulationAgeSeconds||0);
    for (let index = 0; index < steps; index += 1) {
      await tick({ gameSeconds: gameSecondsPerStep, syncBrain: false,serialized:true });
    }

    this.lastWallClockMs = nowMs;
    getRawState().updatedAt = new Date(nowMs).toISOString();
    return { elapsedRealSeconds, steps, gameSecondsPerStep,advancedGameSeconds:Number(getRawState().simulationAgeSeconds||0)-ageBefore };
  }

  async persistIfDue(force = false) {
    const now = Date.now();
    if (!force && now - this.lastPersistMs < ACTIVE_PERSIST_INTERVAL_MS) return this.storageStats;
    this.storageStats = await saveSnapshot(
      this.ctx.storage,
      getRawState(),
      this.lastWallClockMs,
    );
    this.lastPersistMs = now;
    return this.storageStats;
  }

  async alarm() {
    return this.withLock(async () => {
      await this.advanceTo(Date.now(), "alarm");
      await this.persistIfDue(true);
      await this.ctx.storage.setAlarm(Date.now() + this.alarmIntervalMs());
    });
  }

  async getNeuralInputs(){
    await this.ready;
    return this.withLock(async()=>({worldId:this.env.CIV_WORLD_ID||DEFAULT_WORLD_ID,agents:getNeuralAgents()}));
  }
  async applyNeuralBatch(batch){
    await this.ready;
    return this.withLock(async()=>{const status=applyNeuralOutputs(batch.outputs,batch);await this.persistIfDue(true);return status;});
  }
  async neuralCycleFailed(details){
    await this.ready;
    return this.withLock(async()=>{markNeuralCycleFailed(details);return getNeuralStatus();});
  }

  async fetch(request) {
    return this.withLock(async () => {
      await this.ready;

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      const url = new URL(request.url);
      // Observing checkpoints does not force additional city decision work.
      if(url.pathname==='/api/civilization/neural'){
        const status=getNeuralStatus(),freshFor=Math.max(120000,Number(status.intervalMs||1000)*3);
        return json({...status,brains:getRawState().flies.filter(f=>f.alive).map(f=>{
          const fc=f.brain?.fullConnectome;
          return {id:f.id,brainId:f.brain?.id,connected:Boolean(fc?.connected&&Date.now()-Number(fc.lastSyncAt||0)<=freshFor),neurons:fc?.neurons||0,edges:fc?.edges||0,steps:fc?.neuralStepsTotal||0,spikesThisBatch:fc?.spikesThisBatch||0,lastSyncAt:fc?.lastSyncAt||0};
        })});
      }

      const advance = await this.advanceTo(Date.now(), "request");

      if (url.pathname === "/health") {
        await this.persistIfDue(false);
        const state = getRawState();
        return json({
          ok: snapshotLooksUsable(state),
          service: "fruit-fly-civilization-cloudflare",
          runtime: "cloudflare-durable-object",
          worldId: this.env.CIV_WORLD_ID || DEFAULT_WORLD_ID,
          simulationStatus: state ? "SYNTHETIC_CIVILIZATION_LIVE" : "STARTING",
          population: state?.flies?.filter((fly) => fly.alive).length || 0,
          simulationAgeSeconds: Number(state?.simulationAgeSeconds || 0),
          persistence: "DURABLE_OBJECT_SQLITE",
          alarmIntervalMs: this.alarmIntervalMs(),
          sampledCatchup: advance,
          storage: this.storageStats,
          neural:getNeuralStatus(),
        });
      }

      if (url.pathname === "/api/civilization/state") {
        await this.persistIfDue(false);
        const payload = getState();
        payload.runtime = {
          platform: "cloudflare-durable-object",
          persistence: "sqlite-gzip-chunks",
          alarmIntervalMs: this.alarmIntervalMs(),
          sampledCatchup: advance,
        };
        if(url.searchParams.get('view')==='observer'){
          // The map needs recent motion, not the complete movement history of 500 residents.
          payload.flies=payload.flies.map(f=>({...f,movementTrace:(f.movementTrace||[]).slice(-8)}));
          // The Workers HTTP layer negotiates compression once for the client.
        }
        return json(payload);
      }

      if (url.pathname === "/api/civilization/mortality") {
        const report = mortalityReport();
        return json({
          worldId: this.env.CIV_WORLD_ID || DEFAULT_WORLD_ID,
          source: "durable civilization snapshot",
          recordedDeaths: report.recordedDeaths,
          causes: Object.entries(report.byCause || {})
            .map(([cause, count]) => ({ cause, count }))
            .sort((a, b) => b.count - a.count),
          riskAtDeath: report.riskAtDeath,
          note: report.note,
        });
      }

      if (url.pathname === "/api/civilization/events") {
        const state = getRawState();
        const body = [
          `event: connected\ndata: ${JSON.stringify({ worldId: this.env.CIV_WORLD_ID || DEFAULT_WORLD_ID })}\n`,
          `event: recent-events\ndata: ${JSON.stringify({ events: state?.events?.slice(-40) || [] })}\n`,
        ].join("\n");
        return new Response(body, {
          status: 200,
          headers: corsHeaders({
            "content-type": "text/event-stream; charset=utf-8",
          }),
        });
      }

      if (url.pathname === "/api/civilization/export") {
        await this.persistIfDue(true);
        return json({
          exportedAt: new Date().toISOString(),
          worldId: this.env.CIV_WORLD_ID || DEFAULT_WORLD_ID,
          state: getRawState(),
        });
      }

      if (url.pathname === "/api/civilization/import" && request.method === "POST") {
        const adminToken = String(this.env.CIV_ADMIN_TOKEN || "");
        const auth = request.headers.get("authorization") || "";
        if (!adminToken || auth !== `Bearer ${adminToken}`) {
          return json({ error: "unauthorized" }, 401);
        }
        const body = await request.json();
        if (!snapshotLooksUsable(body?.state)) {
          return json({ error: "invalid_snapshot" }, 400);
        }
        restoreState(body.state);
        this.lastWallClockMs = Date.now();
        await this.persistIfDue(true);
        return json({
          ok: true,
          importedSimulationAgeSeconds: Number(getRawState().simulationAgeSeconds || 0),
          population: getRawState().flies.filter((fly) => fly.alive).length,
        });
      }

      return json({
        error: "not_found",
        endpoints: [
          "/health",
          "/api/civilization/state",
          "/api/civilization/mortality",
          "/api/civilization/events",
          "/api/civilization/export",
        ],
      }, 404);
    });
  }
}

export default {
  fetch(request, env) {
    const worldId = env.CIV_WORLD_ID || DEFAULT_WORLD_ID;
    const id = env.CIVILIZATION.idFromName(worldId);
    return env.CIVILIZATION.get(id).fetch(request);
  },
};
