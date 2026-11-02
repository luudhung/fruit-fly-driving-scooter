# Civilization CPU neural worker

Optional CPU adapter for the city's full FlyWire brains. The root `Dockerfile` and `railway.json` package this service. The production Cloudflare neural runtime is documented in [`cloudflare/NEURAL_RUNTIME.md`](../cloudflare/NEURAL_RUNTIME.md).

The service loads every neuron and CSR edge from `brain.bin`, shares immutable topology, and maintains separate dynamic LIF state for each registered resident. Sensory inputs and behavioral drives use the city interface in `src/multi_brain.rs`. Neural states in this CPU adapter are in memory; the Cloudflare adapter supplies durable checkpoints.

Configuration:

```text
BRAIN_URL=https://fruit-fly-driving-scooter.vercel.app/brain.bin
BRAIN_CACHE_PATH=/data/brain.bin
MULTI_BRAIN_STEPS_PER_SYNC=1
MULTI_BRAIN_MAX_PER_SYNC=2
PORT=3000
```

`BRAIN_PATH` can select an existing local full-connectome file. A volume mounted at `/data` caches the immutable graph. The service also reconstructs the graph from its chunk manifest when the monolithic URL is unavailable.

Endpoints:

- `GET /` and `GET /health`: loaded graph dimensions and service status.
- `POST /civilization/brains/sync`: step a bounded batch of independent resident brains.

Biological LIF time advances only through synchronization requests and is bounded by the per-sync budget; it does not equal wall-clock time.
