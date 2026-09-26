import http from "node:http";
import process from "node:process";
import pg from "pg";
const { Pool } = pg;

const PORT = Number(process.env.PORT || 3000);
const WORLD_ID = process.env.CIV_WORLD_ID || "WORLD-A";
const EXPERIMENT_ID = process.env.CIV_EXPERIMENT_ID || "EXP-0001";
const WORLD_SEED = Number(process.env.CIV_WORLD_SEED || 948291);
const TIME_SCALE = Number(process.env.CIV_TIME_SCALE || 1);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("[civilization] DATABASE_URL is required. Refusing to fake persistence.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : undefined,
  max: 4,
});

const VERSION = {
  worldEngineVersion: "civilization-core-0.1.0",
  brainVersion: "FlyWire/MANC browser baseline — server brain runtime not connected",
  physicsVersion: "not-connected",
  geneticsVersion: "not-enabled",
  economicVersion: "not-enabled",
};

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

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS civilization_worlds (
      world_id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      world_seed BIGINT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      simulation_age_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
      time_scale DOUBLE PRECISION NOT NULL DEFAULT 1,
      population INTEGER NOT NULL DEFAULT 0,
      generation INTEGER NOT NULL DEFAULT 0,
      births INTEGER NOT NULL DEFAULT 0,
      deaths INTEGER NOT NULL DEFAULT 0,
      food_reserve DOUBLE PRECISION NOT NULL DEFAULT 0,
      money_supply DOUBLE PRECISION NOT NULL DEFAULT 0,
      simulation_status TEXT NOT NULL DEFAULT 'WAITING_FOR_BRAIN_RUNTIME',
      paused BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  await pool.query(`
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

  const existing = await pool.query(
    "SELECT world_id FROM civilization_worlds WHERE world_id = $1",
    [WORLD_ID],
  );

  if (!existing.rowCount) {
    await pool.query(
      `INSERT INTO civilization_worlds
       (world_id, experiment_id, world_seed, started_at, updated_at, time_scale, simulation_status)
       VALUES ($1,$2,$3,NOW(),NOW(),$4,'WAITING_FOR_BRAIN_RUNTIME')`,
      [WORLD_ID, EXPERIMENT_ID, WORLD_SEED, TIME_SCALE],
    );
    await appendEvent(
      "world_created",
      "Persistent civilization core created. No fly behavior has been fabricated; server brain runtime is not connected yet.",
      "simulation",
      { seed: WORLD_SEED },
    );
  } else {
    await appendEvent(
      "server_resumed",
      "Persistent civilization core resumed from PostgreSQL.",
      "simulation",
      {},
    );
  }
}

async function appendEvent(eventType, message, source = "simulation", payload = {}) {
  const result = await pool.query(
    `INSERT INTO civilization_events (world_id, source, event_type, message, payload)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     RETURNING id, created_at, source, event_type, message, payload`,
    [WORLD_ID, source, eventType, message, JSON.stringify(payload)],
  );
  const event = result.rows[0];
  const packet = `event: world-event\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    try { client.write(packet); } catch { clients.delete(client); }
  }
  return event;
}

async function tick() {
  try {
    await pool.query(
      `UPDATE civilization_worlds
       SET simulation_age_seconds = simulation_age_seconds + CASE WHEN paused THEN 0 ELSE $2 END,
           updated_at = NOW()
       WHERE world_id = $1`,
      [WORLD_ID, TIME_SCALE],
    );
  } catch (error) {
    console.error("[civilization] tick failed", error);
  }
}

async function getState() {
  const worldResult = await pool.query(
    "SELECT * FROM civilization_worlds WHERE world_id = $1",
    [WORLD_ID],
  );
  if (!worldResult.rowCount) throw new Error("world missing");
  const w = worldResult.rows[0];

  const eventResult = await pool.query(
    `SELECT id, created_at, source, event_type, message, payload
     FROM civilization_events
     WHERE world_id = $1
     ORDER BY id DESC
     LIMIT 30`,
    [WORLD_ID],
  );

  return {
    authoritative: true,
    simulationStatus: w.simulation_status,
    worldId: w.world_id,
    experimentId: w.experiment_id,
    worldSeed: String(w.world_seed),
    serverTime: new Date().toISOString(),
    simulationTime: Number(w.simulation_age_seconds),
    simulationAgeSeconds: Number(w.simulation_age_seconds),
    timeScale: Number(w.time_scale),
    population: Number(w.population),
    generation: Number(w.generation),
    births: Number(w.births),
    deaths: Number(w.deaths),
    foodReserve: Number(w.food_reserve),
    moneySupply: Number(w.money_supply),
    selectedFly: null,
    events: eventResult.rows.reverse().map((e) => ({
      id: String(e.id),
      time: new Date(e.created_at).toISOString(),
      text: e.message,
      source: e.source,
      type: e.event_type,
      payload: e.payload,
    })),
    versions: VERSION,
  };
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
    try {
      await pool.query("SELECT 1");
      json(res, 200, {
        ok: true,
        service: "fruit-fly-civilization-core",
        worldId: WORLD_ID,
        simulationStatus: "WAITING_FOR_BRAIN_RUNTIME",
      });
    } catch (error) {
      json(res, 503, { ok: false, error: String(error) });
    }
    return;
  }

  if (url.pathname === "/api/civilization/state") {
    try {
      json(res, 200, await getState());
    } catch (error) {
      json(res, 500, { error: String(error) });
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
    endpoints: ["/health", "/api/civilization/state", "/api/civilization/events"],
  });
});

await initDb();
setInterval(tick, 1000).unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[civilization] persistent core listening on :${PORT} world=${WORLD_ID}`);
});

async function shutdown(signal) {
  console.log(`[civilization] ${signal}; closing gracefully`);
  server.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
