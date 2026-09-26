# FlyBrain 24/7 worker

Always-on CPU port of the same full FlyWire LIF graph used by the browser experiment.

## What is actually simulated

- Full `brain.bin` FlyWire connectome: every neuron and every CSR edge is stepped by the worker.
- BTCUSDT public trade stream runs continuously.
- Cash, margin, position, stress, drawdown discipline, smoke/break state, and trade history are kept server-side.
- The browser can close or reload without resetting the worker state.
- MANC/VNC is **not** part of this stock worker yet.

The worker deliberately throttles biological LIF steps with `BRAIN_STEPS_PER_CYCLE` / `SIM_INTERVAL_MS` so a full 15M-edge graph can run continuously without pretending server wall-clock equals biological real-time.

## Railway

Deploy from the repository root. The root `Dockerfile` builds this worker.

Recommended environment:

```
STATE_PATH=/data/flybrain-state.json
BRAIN_URL=https://fruit-fly-driving-scooter.vercel.app/brain.bin
BRAIN_STEPS_PER_CYCLE=4
SIM_INTERVAL_MS=1000
```

Attach a persistent Railway volume mounted at `/data` so state survives service restarts/redeploys.

Endpoints:

- `GET /health`
- `GET /state`

The service is paper trading only. It never sends real-money orders.
