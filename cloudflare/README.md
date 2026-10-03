# Free civilization backend on Cloudflare

This directory runs Hansdrex City on **Cloudflare Workers + a SQLite-backed Durable Object** instead of a permanently running Railway container.

## Why this stays inside the free architecture

The world is persisted inside one Durable Object named `WORLD-A`. The Worker does not burn CPU continuously while nobody is watching. Instead:

- active frontend requests advance the simulation using short sampled catch-up steps;
- a Durable Object alarm wakes the world periodically (default: every 1 minute);
- each alarm catches the simulation clock up to real elapsed time and writes one durable snapshot;
- snapshots are gzip-compressed and split into ~1.5 MB chunks so no single stored value approaches the Durable Object 2 MB value limit.

The game clock therefore keeps moving while the browser is closed without requiring a 24/7 VM.

## First deployment

From the repository root:

```bash
npx --yes wrangler login
npm run deploy:civilization:cloudflare
```

Wrangler will print the public `workers.dev` URL after a successful deploy. Verify it:

```bash
curl https://<worker-url>/health
curl https://<worker-url>/api/civilization/state
```

Then set the frontend build variable:

```
VITE_CIVILIZATION_API=https://<worker-url>
```

## Optional admin import

The Worker exposes a protected import endpoint so an old Railway checkpoint can be moved later.

Set a secret:

```bash
npx --yes wrangler secret put CIV_ADMIN_TOKEN --config cloudflare/wrangler.jsonc
```

Then POST a payload shaped like:

```json
{
  "state": {
    "worldId": "WORLD-A",
    "simulationAgeSeconds": 12345,
    "flies": []
  }
}
```

to `/api/civilization/import` with `Authorization: Bearer <token>`.

## Tuning

`CIV_ALARM_INTERVAL_MS` defaults to 60000 (1 minute).

`CIV_IDLE_MAX_STEPS` defaults to 90. Under normal one-minute alarms, the world can run roughly one engine step per elapsed real second, matching the original Railway cadence closely. If an alarm is delayed longer, it still catches the game clock up while capping CPU work. While the frontend is open and polling, catch-up is much finer grained.

The existing Node/Postgres adapter remains in `worker/civilization-server.mjs` for compatibility and data recovery.
