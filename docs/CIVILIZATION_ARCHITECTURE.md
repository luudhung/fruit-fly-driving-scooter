# Autonomous Fruit-Fly Civilization — Architecture

## Scientific rule

The project must not decide what a fly *should* do. The environment exposes physical and sensory signals; each active fly gets its own FlyWire/WebGPU LIF dynamic state; decoded neural output changes the body/world; consequences become the next sensory input.

## Checkpoint 1 — independent-brain baseline

Current branch: `feat/fulllife-civilization`

Current working page: `/fulllife.html`

Implemented in this checkpoint:

- `brain.bin` is loaded once as immutable FlyWire graph data.
- Two starting flies are created.
- Each fly receives a separate `FlySim` instance.
- Vm, refractory state, synaptic state, spike buffers and external input are therefore independent per fly.
- The environment feeds only graded physical channels into the brain adapter:
  - left/right visual salience;
  - food odor;
  - contact / boundary pressure;
  - internal energy and hunger modulation.
- DN/MBON/LHN/PN activity is decoded into continuous motor outputs:
  - turn;
  - drive;
  - lift;
  - interact.
- The body can walk, become airborne, fall under gravity, consume energy and physically contact food.
- Food quantity is finite and visibly shrinks as it is consumed.
- The world uses a seeded PRNG with `WORLD_SEED = 948291`; the civilization path intentionally avoids new `Math.random()` decisions.
- Observer UI shows population, independent brain count, energy and per-fly motor telemetry.

### Scientific limitation

The sensory and motor mapping is an experimental adapter around the FlyWire LIF model. It is not a claim that the connectome natively exposes a human-like action API.

The current initial population is deliberately only 2 full brains. Scale must be increased only after GPU/memory benchmarking proves that more independent neural states can run without replacing any fly with scripted NPC logic.

## Checkpoint 2 — physical economy

Next implementation target:

- conserved FC treasury;
- physical work objects;
- treasury → fly payment transfers;
- fly → machine/store payments;
- no money creation from arbitrary scripted rewards;
- transaction/event ledger.

## Checkpoint 3 — ownership and transport

Planned:

- houses / apartments with physical access;
- vehicles with persistent ownership;
- a fly must physically reach the asset and produce sufficient neural interaction output;
- when inside a vehicle, the same fly brain remains the controller of steering/throttle;
- collision and damage telemetry.

## Checkpoint 4 — social, reproduction and genetics

Planned:

- proximity/contact history;
- mating only from observed physical + neural interaction conditions;
- offspring genome inheritance with seeded mutation;
- a birth is accepted only when a new independent full neural state can be allocated;
- no fake-brain children;
- permanent death and lineage records.

## Checkpoint 5 — true 24/7 persistence

The current Vercel page is browser-authoritative. Closing the page stops the simulation. It performs no random or synthetic offline catch-up.

True 24/7 requires:

```text
Vercel observer frontend
        |
   WebSocket / SSE
        |
Persistent simulation worker/container
        |
    PostgreSQL
```

The backend must persist world state, each fly's neural dynamic state/checkpoint, genomes, relationships, family links, births, deaths, resources, inventory, property, vehicles, transactions, events and snapshots.

A future deployment must not claim 24/7 until this persistent worker has been implemented and verified.

## Commit discipline

Development is intentionally split into small, auditable commits. Each scientific subsystem should be independently reviewable and revertible instead of landing as one large opaque commit.
