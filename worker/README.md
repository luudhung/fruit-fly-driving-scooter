# Civilization Node adapter

`civilization-server.mjs` exposes the persistent city engine over HTTP. Run it with `npm install --prefix worker` followed by `npm start --prefix worker`.

- `DATABASE_URL` selects the PostgreSQL store for city checkpoints and the event archive.
- `PORT` defaults to 3000.
- `CIV_WORLD_ID`, `CIV_EXPERIMENT_ID`, and `CIV_WORLD_SEED` identify the existing world.
- `FLYWIRE_BRAIN_URL` connects the optional CPU civilization neural service in `worker24/`.

The production Cloudflare adapter uses the same `civilization-engine.mjs`; its durable city state and neural checkpoints are documented in [`cloudflare/README.md`](../cloudflare/README.md).
