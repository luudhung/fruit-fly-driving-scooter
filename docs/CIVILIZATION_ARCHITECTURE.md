# Fruit Fly Civilization Architecture

## Goal
Build an autonomous artificial fruit-fly civilization experiment around the repository's existing FlyWire/MANC/WebGPU baseline. The browser is an observer, not the source of truth.

## Scientific invariants
- Preserve FlyWire/MANC/WebGPU files, licenses, NOTICE, and limitations.
- Never replace the primary fly brain with an FSM, random walk, behavior tree, LLM, or centralized "god brain".
- Every simulated fly must have independent dynamic brain/body/sensory state.
- Synthetic sensory encoders, motor decoders, memory/plasticity extensions, economics and world mechanisms must be labelled as experimental extensions.
- No fake offline progress. If no authoritative worker is running, the UI must say so.

## Target architecture

```text
Vercel observer frontend
  ├─ fulllife.html / src/fulllife.ts
  ├─ science / diagnostics
  └─ read-only live rendering
          │ HTTPS / SSE / WebSocket
          ▼
Persistent simulation worker
  ├─ world clock / seeded RNG
  ├─ fly registry
  ├─ independent brain states
  ├─ sensory encoders
  ├─ motor decoders
  ├─ survival / resources
  ├─ reproduction / genetics
  ├─ economy / ownership / vehicles
  ├─ event stream
  └─ checkpoint scheduler
          │
          ▼
PostgreSQL
  ├─ worlds / experiments
  ├─ flies / brains / genomes / fly_states
  ├─ relationships / family_links
  ├─ births / deaths
  ├─ resources / inventory
  ├─ properties / vehicles / transactions
  ├─ world_events / interventions
  └─ snapshots
```

## Phase 1 — Persistent World
1. Add `/fulllife.html` observer entry point.
2. Add client protocol that can consume an authoritative server snapshot/event stream.
3. Add explicit connection modes: authoritative, local-development, unavailable.
4. Add a persistent worker package with seeded world clock, snapshot resume and event log.
5. Deploy worker on a long-lived process provider; Vercel remains frontend-only.
6. Add PostgreSQL persistence and restart recovery.

## Phase 2 — Multi-Fly Brain
- Benchmark 1 / 10 / 25 / 50 / 100 independent dynamic states.
- Share immutable connectome data where safe, never dynamic neural state.
- Batch neural computation on GPU when possible.
- Adaptive neural tick only for sleeping/inactive agents, preserving state.

## World model
The world exposes physical/sensory mechanisms rather than semantic commands. Examples:
- resource delivery station → token output
- token receptacle → food/access output
- vehicle controls → steering/throttle/brake sensory-motor loop
- housing door/access mechanism → token/ownership interaction

The fly is never injected with labels such as "supermarket", "job", "buy house", or "find mate".

## Persistence model
Authoritative checkpoints persist:
- simulation timestamp and time scale
- RNG seed/state
- fly identity, life state, brain state references
- positions and body state
- resources and economy
- genomes, family links, births/deaths
- ownership, property, vehicles
- relationships derived from observed interactions
- event sequence cursor

Do not store every frame forever. Use periodic snapshots plus durable events and sampled neural telemetry.

## Observer UI
Default is READ ONLY.
- city/follow/first-person/traffic cameras
- fly inspector
- causal brain telemetry: sensory activity → neural activity → motor output
- population/economy/survival dashboards
- event log, family tree, social graph, heatmaps
- explicit MODEL LIMITATIONS panel

## Server restart
On startup:
1. load latest valid snapshot
2. restore RNG/world/fly states
3. replay durable events after snapshot when needed
4. continue from persisted simulation timestamp
5. emit a server-resumed event

## Offline honesty
Until the long-lived worker + database are deployed, closing the browser does **not** count as 24/7 simulation. The frontend must never synthesize random "12 hours passed" results.

## Deployment
- Frontend: Vercel/Vite.
- Authoritative worker: Railway/Fly.io/Render/VPS persistent process.
- Database: PostgreSQL with backups.
- Networking: SSE/WebSocket deltas, not full database polling per frame.

## Version fields
Every experiment records:
- worldEngineVersion
- brainVersion
- physicsVersion
- geneticsVersion
- economicVersion
- worldSeed

## Definition of success
The environment is rich enough that independent fly brains can interact with it, while the system honestly records what they actually do — including failure to learn abstractions, collapse, or extinction.
