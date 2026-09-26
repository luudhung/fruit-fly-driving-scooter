# Autonomous Fruit-Fly Civilization — Architecture

## Scientific rule

The project must not decide what a fly *should* do. The environment exposes physical/sensory signals; each active fly has its own FlyWire/WebGPU LIF dynamic state; motor output changes the body/world; consequences become the next sensory input.

## Current milestone: `fulllife.html`

This first deploy establishes a truthful browser prototype for the future server-authoritative civilization.

### Brain
- `brain.bin` is loaded once as immutable FlyWire graph data.
- Each active fly receives a separate `FlySim` instance, so Vm, refractory state, synaptic state, spikes and external input are not shared.
- Initial full-brain population is deliberately 2, with capacity for one offspring (3 concurrent full brains) until benchmark data justifies more. This follows scientific validity over fake scale.
- MANC is loaded as model metadata; current motor control still uses the FlyWire-derived adapter already used elsewhere in the repo.

### Sensory encoding
No semantic strings such as “shop”, “house” or “vehicle” are injected into the brain. The adapter provides graded physical channels:
- left/right visual salience;
- forward visual salience;
- food odor;
- nearby-fly/pheromone-like left/right cues;
- contact/collision;
- ground contact;
- internal energy/hunger modulation.

### Motor decoding
Observed FlyWire activity is decoded from DN/GF/MBON/LHN/PN groups into continuous values:
- turn;
- drive;
- lift;
- interact/proboscis-like output;
- escape/activity telemetry.

These are experimental adapters, not claims that FlyWire already implements a human-level action API.

### Body / physics
The body can walk, become airborne, fall under gravity, expend more energy while airborne, contact resources, carry a physical crate, enter a purchased vehicle and then steer/throttle that vehicle from the same neural motor output.

### World
The map contains road grids, districts, buildings, a park, water, vegetation, a warehouse/work station, food sources, a token-operated food machine, houses and vehicles. Day/light cycles are deterministic from simulation time.

### Economy
`FC` is conserved inside the current world ledger. It begins in a treasury and moves through explicit physical interactions:
- treasury → fly for crate delivery;
- fly → store machine for food release;
- fly → treasury for house/vehicle access.

No per-fly infinite money faucet is used.

### Property and vehicles
Ownership is persistent for the lifetime of the current browser experiment. A fly can only activate property/vehicle access when physically close, producing sufficient neural interaction output, and carrying enough FC. A fly that owns a vehicle can enter it; steering and throttle remain brain-derived.

### Reproduction / genetics
Repeated close contact plus interaction output from both opposite-sex adults can accumulate into a mating event. Offspring inherits averaged genome parameters with seeded mutation. A birth is only accepted if a new independent full FlySim can be allocated; otherwise the event is blocked rather than spawning a fake-brain fly.

### Death
Energy, hydration and age can produce permanent death. Dead individuals are not respawned.

### Analytics
The UI reports observed population, generations, births/deaths, food, money supply, ownership, energy/stress, individual motor signals and an event stream. Analytics does not feed stories or labels back into the brain.

## Determinism
World mechanisms use seeded PRNG (`WORLD_SEED = 948291`). New `Math.random()` calls are intentionally avoided in the civilization implementation.

## Important limitation: not yet 24/7
The current Vercel deployment is a Vite/browser app. Vercel serverless is not used to pretend that a long-running simulation process exists. When the browser closes, this milestone stops. It performs no random or synthetic “offline progress”.

## Phase 1 infrastructure required for true 24/7
A persistent worker/container plus PostgreSQL is required:

```text
Web frontend (Vercel, read-only observer)
          |
       WebSocket/SSE
          |
Persistent simulation worker
          |
      PostgreSQL
```

Minimum persistent tables:
- worlds
- experiments
- flies
- brains / brain snapshots
- genomes
- fly_states
- relationships
- family_links
- births
- deaths
- resources
- inventory
- properties
- vehicles
- transactions
- world_events
- snapshots
- interventions

The worker must checkpoint brain/world state and resume from the last checkpoint after restart. A future deploy should not claim 24/7 until that backend exists and is verified.

## Performance path
Before scaling to 40–100 flies, benchmark 1 / 2 / 3 / 10 / 25 / 50 / 100 independent neural states. The next optimization target is a shared-device/shared-immutable-connectome GPU runtime so graph buffers are not duplicated for every fly. Rendering LOD must never replace neural state with scripted NPC logic.
