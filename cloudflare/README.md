# Free civilization backend on Cloudflare

This directory runs Hansdrex City on **Cloudflare Workers + a SQLite-backed Durable Object** instead of a permanently running Railway container.

## Why this stays inside the free architecture

The world is persisted inside one Durable Object named `WORLD-A`. The Worker does not burn CPU continuously while nobody is watching. Instead:

- active frontend requests advance the simulation using short sampled catch-up steps;
- a Durable Object alarm wakes the world periodically (default: every 5 minutes);
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

`CIV_ALARM_INTERVAL_MS` defaults to 300000 (5 minutes).

`CIV_IDLE_MAX_STEPS` defaults to 120. When the world has been idle for five minutes, it advances the full elapsed game time in up to 120 sampled engine steps rather than running 300 one-second invocations. While the frontend is open and polling, catch-up is much finer grained.

The existing Node/Postgres adapter remains in `worker/civilization-server.mjs` for compatibility and data recovery.
