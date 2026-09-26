# Stock Trader 24/7 — implementation checkpoint

Updated: 2026-09-26

## Completed

### Live full-connectome brain monitor
Commit lineage includes `184c3afe`.

- Browser WebGPU simulation loads the full FlyWire `brain.bin`.
- UI reports simulated neuron/edge coverage.
- Point-cloud brain map uses real connectome coordinates.
- Brightness comes from real rolling LIF firing rate.
- Activity is grouped by FlyWire superclass: sensory, ascending, intrinsic, central, descending, motor, endocrine, visual centrifugal, visual projection, optic.
- MANC/VNC is explicitly labeled metadata-only for stock trading.

### Full FlyWire 24/7 CPU worker
Source: `worker24/`

- Rust CPU port of the full LIF graph.
- Loads every FlyWire neuron and CSR edge from `brain.bin`.
- BTCUSDT market stream runs continuously.
- Server owns persistent cash, margin, position, PnL, stress, smoke/break state, drawdown discipline, trade history and brain-region activity.
- Existing position remains open during stress/city breaks.
- Worker exposes `GET /health` and `GET /state`.
- Root `Dockerfile` and `railway.json` target this worker.
- Recommended persistent volume mount: `/data`.

Important: `worker/` is a separate lightweight Node fallback added by another workstream. It must not be described as full-FlyWire when the browser is closed. The full-brain 24/7 implementation is `worker24/`.

### Vercel spectator integration
Commit `36225791`.

- Added `/api/worker-state` proxy.
- `stock.html` polls the worker and hydrates account/position/stress/brain state from the server.
- When full 24/7 worker is online, browser becomes spectator and no longer mutates the authoritative trading account.
- Browser WebGPU can still render the detailed neuron point-cloud while open.
- UI distinguishes `FULL · 24/7 CPU` from local browser simulation.
- If worker is unavailable, page falls back to the browser experiment.

### Worker CI
Commit `b60d423f`.

- Added `.github/workflows/worker24.yml`.
- Runs `cargo check` on worker24 changes.

## Deployment steps still required

1. Railway:
   - Create a service from this GitHub repository.
   - Build using root `Dockerfile`.
   - Add a persistent volume mounted at `/data`.
   - Environment:
     - `STATE_PATH=/data/flybrain-state.json`
     - `BRAIN_URL=https://fruit-fly-driving-scooter.vercel.app/brain.bin`
     - `BRAIN_STEPS_PER_CYCLE=4`
     - `SIM_INTERVAL_MS=1000`
   - Generate a public Railway domain.
   - Verify `/health` returns `mode: full-flywire-cpu-24x7`.

2. Vercel:
   - Set `FLYBRAIN_WORKER_URL` to the Railway public service URL.
   - Redeploy.
   - Verify `/api/worker-state` returns the Railway worker state.
   - Reloading/closing `stock.html` must not reset cash, position, stress, PnL, or trade history.

## Honesty / scientific invariant

Do not label a lightweight fallback algorithm as the fly's full brain.

The server may say `FULL · 24/7 CPU` only when `worker24` has loaded the full `brain.bin` and is stepping the whole neuron/edge graph. Biological simulated time is intentionally throttled relative to wall-clock to keep continuous full-graph CPU compute practical.
