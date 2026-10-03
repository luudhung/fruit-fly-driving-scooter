import http from "node:http";
import { pathToFileURL } from "node:url";
import process from "node:process";
import pg from "pg";
import {
  freshState,
  restoreState,
  getRawState,
  getState,
  tick,
  mortalityReport,
  snapshotLooksUsable,
  subscribeEvents,
  setNeuralSyncEnabled,
  getSimulationConfig,
} from "./civilization-engine.mjs";

export * from "./civilization-engine.mjs";

const { Pool } = pg;
const PORT = Number(process.env.PORT || 3000);
const WORLD_ID = process.env.CIV_WORLD_ID || "WORLD-A";
const EXPERIMENT_ID = process.env.CIV_EXPERIMENT_ID || "EXP-0001";
const WORLD_SEED = Number(process.env.CIV_WORLD_SEED || 948291);
const DATABASE_URL = process.env.DATABASE_URL;
const CHECKPOINT_EVERY_MS = 5000;
const IS_MAIN = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

let pool = null;
let persistenceReady = false;
let persistenceConnecting = false;
let persistenceError = null;
let checkpointAt = 0;
const clients = new Set();

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(payload);
}

async function ensurePool() {
  if (pool || !DATABASE_URL) return pool;
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSLMODE === "disable" ? false : undefined,
    max: 4,
  });
  return pool;
}

async function initDb() {
  if (!DATABASE_URL) {
    if (!snapshotLooksUsable(getRawState())) freshState();
    persistenceReady = false;
    persistenceError = "DATABASE_URL missing";
    return false;
  }

  const db = await ensurePool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS civilization_worlds (
      world_id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      world_seed BIGINT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      simulation_age_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
      time_scale DOUBLE PRECISION NOT NULL DEFAULT 60,
      population INTEGER NOT NULL DEFAULT 0,
      generation INTEGER NOT NULL DEFAULT 1,
      births INTEGER NOT NULL DEFAULT 0,
      deaths INTEGER NOT NULL DEFAULT 0,
      food_reserve DOUBLE PRECISION NOT NULL DEFAULT 0,
      money_supply DOUBLE PRECISION NOT NULL DEFAULT 0,
      simulation_status TEXT NOT NULL DEFAULT 'SYNTHETIC_CIVILIZATION_LIVE',
      paused BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS civilization_events (
      id BIGSERIAL PRIMARY KEY,
      world_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL DEFAULT 'simulation',
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS civilization_state (
      world_id TEXT PRIMARY KEY,
      state_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const snapshot = await db.query("SELECT state_json FROM civilization_state WHERE world_id = $1", [WORLD_ID]);
  const persistedState = snapshot.rowCount ? snapshot.rows[0].state_json : null;
  const current = getRawState();
  if (snapshotLooksUsable(persistedState) &&
      (!snapshotLooksUsable(current) ||
       Number(persistedState.simulationAgeSeconds || 0) >= Number(current.simulationAgeSeconds || 0))) {
    restoreState(persistedState);
  } else if (!snapshotLooksUsable(current)) {
    freshState();
  }

  persistenceReady = true;
  persistenceError = null;
  await checkpoint(true);
  return true;
}

async function persistEvent(event) {
  if (!persistenceReady || !pool) return;
  try {
    await pool.query(
      `INSERT INTO civilization_events (world_id, source, event_type, message, payload)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [WORLD_ID, event.source || "simulation", event.type || "event", event.text, JSON.stringify(event.payload || {})],
    );
  } catch (error) {
    persistenceReady = false;
    persistenceError = String(error);
    console.error("[civilization] event persistence failed", error);
  }
}

async function checkpoint(force = false) {
  if (!DATABASE_URL || !persistenceReady || !pool) return;
  if (!force && Date.now() - checkpointAt < CHECKPOINT_EVERY_MS) return;
  const state = getRawState();
  if (!snapshotLooksUsable(state)) return;
  checkpointAt = Date.now();
  state.updatedAt = new Date().toISOString();
  const living = state.flies.filter((fly) => fly.alive);
  const moneySupply = Number(getState().moneySupply || 0);
  try {
    await pool.query(
      `INSERT INTO civilization_state (world_id, state_json, updated_at)
       VALUES ($1,$2::jsonb,NOW())
       ON CONFLICT (world_id)
       DO UPDATE SET state_json = EXCLUDED.state_json, updated_at = NOW()
       WHERE COALESCE((civilization_state.state_json->>'simulationAgeSeconds')::double precision,-1)
          <= COALESCE((EXCLUDED.state_json->>'simulationAgeSeconds')::double precision,-1)`,
      [WORLD_ID, JSON.stringify(state)],
    );
    await pool.query(
      `INSERT INTO civilization_worlds
        (world_id, experiment_id, world_seed, started_at, updated_at, simulation_age_seconds, time_scale, population, generation, births, deaths, food_reserve, money_supply, simulation_status, paused)
       VALUES ($1,$2,$3,NOW(),NOW(),$4,$5,$6,$7,$8,$9,$10,$11,'SYNTHETIC_CIVILIZATION_LIVE',$12)
       ON CONFLICT (world_id) DO UPDATE SET
         updated_at=NOW(),
         simulation_age_seconds=EXCLUDED.simulation_age_seconds,
         time_scale=EXCLUDED.time_scale,
         population=EXCLUDED.population,
         generation=EXCLUDED.generation,
         births=EXCLUDED.births,
         deaths=EXCLUDED.deaths,
         food_reserve=EXCLUDED.food_reserve,
         money_supply=EXCLUDED.money_supply,
         simulation_status='SYNTHETIC_CIVILIZATION_LIVE',
         paused=EXCLUDED.paused
       WHERE civilization_worlds.simulation_age_seconds <= EXCLUDED.simulation_age_seconds`,
      [
        WORLD_ID, EXPERIMENT_ID, WORLD_SEED,
        state.simulationAgeSeconds, state.timeScale, living.length, state.generation,
        state.births, state.deaths, state.foodReserve, moneySupply, state.paused,
      ],
    );
  } catch (error) {
    persistenceReady = false;
    persistenceError = String(error);
    throw error;
  }
}

async function ensurePersistence() {
  if (persistenceConnecting) return persistenceReady;
  persistenceConnecting = true;
  try {
    return await initDb();
  } catch (error) {
    persistenceReady = false;
    persistenceError = String(error);
    console.error("[civilization] persistence unavailable; continuing in memory", error);
    if (!snapshotLooksUsable(getRawState())) freshState();
    return false;
  } finally {
    persistenceConnecting = false;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    if (DATABASE_URL && persistenceReady && pool) {
      try { await pool.query("SELECT 1"); }
      catch (error) {
        persistenceReady = false;
        persistenceError = String(error);
      }
    }
    const state = getRawState();
    json(res, 200, {
      ok: Boolean(state),
      service: "fruit-fly-civilization-core",
      worldId: WORLD_ID,
      simulationStatus: state ? "SYNTHETIC_CIVILIZATION_LIVE" : "STARTING",
      population: state?.flies?.filter((fly) => fly.alive).length || 0,
      simulationAgeSeconds: Number(state?.simulationAgeSeconds || 0),
      persistence: persistenceReady ? "CONNECTED" : "DEGRADED",
      persistenceError: persistenceReady ? null : persistenceError,
      runtime: "node",
      engine: getSimulationConfig(),
    });
    return;
  }

  if (url.pathname === "/api/civilization/state") {
    try { json(res, 200, getState()); }
    catch (error) { json(res, 500, { error: String(error) }); }
    return;
  }

  if (url.pathname === "/api/civilization/mortality") {
    if (!DATABASE_URL || !persistenceReady || !pool) {
      json(res, 503, { error: "mortality_archive_unavailable", detail: persistenceError || "persistence disconnected" });
      return;
    }
    const since = url.searchParams.get("since") || new Date(Date.now() - 7 * 86400000).toISOString();
    if (!Number.isFinite(Date.parse(since))) {
      json(res, 400, { error: "invalid_since" });
      return;
    }
    try {
      const result = await pool.query(`
        SELECT COALESCE(NULLIF(payload->>'cause',''),
          CASE event_type WHEN 'homicide' THEN 'homicide' WHEN 'execution' THEN 'capital punishment' ELSE 'unrecorded' END) AS cause,
          COUNT(*)::int AS count, MIN(created_at) AS first_at, MAX(created_at) AS last_at
        FROM civilization_events
        WHERE world_id=$1 AND created_at >= $2::timestamptz
          AND (event_type IN ('death','weather_death','homicide','execution')
               OR (event_type='accident' AND message LIKE '% died %'))
        GROUP BY cause ORDER BY count DESC`, [WORLD_ID, new Date(since).toISOString()]);
      json(res, 200, { worldId: WORLD_ID, since, source: "append-only event archive", causes: result.rows });
    } catch (error) {
      json(res, 503, { error: "mortality_archive_unavailable", detail: String(error) });
    }
    return;
  }

  if (url.pathname === "/api/civilization/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "access-control-allow-origin": "*",
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ worldId: WORLD_ID })}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  json(res, 404, {
    error: "not_found",
    endpoints: ["/health", "/api/civilization/state", "/api/civilization/events", "/api/civilization/mortality"],
  });
});

if (IS_MAIN) {
  setNeuralSyncEnabled(true);
  subscribeEvents((event) => {
    for (const client of clients) {
      try { client.write(`event: world-event\ndata: ${JSON.stringify(event)}\n\n`); }
      catch { clients.delete(client); }
    }
    void persistEvent(event);
  });

  await ensurePersistence();

  setInterval(() => {
    void tick().then(() => checkpoint(false)).catch((error) => {
      console.error("[civilization] tick failed", error);
    });
  }, 1000);

  setInterval(() => {
    if (!persistenceReady) void ensurePersistence();
  }, 15000);

  server.listen(PORT, "0.0.0.0", () => {
    const state = getRawState();
    console.log(
      `[civilization] world listening on :${PORT} world=${WORLD_ID} pop=${state?.flies?.filter((fly) => fly.alive).length || 0} persistence=${persistenceReady ? "connected" : "degraded"}`
    );
  });

  async function shutdown(signal) {
    console.log(`[civilization] ${signal}; checkpointing`);
    try { await checkpoint(true); } catch {}
    server.close();
    if (pool) await pool.end();
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
