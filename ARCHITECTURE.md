# Fruit Fly Driving Scooter — Architecture

## Upstream baseline

This repository mirrors the source tree of `abgnydn/webgpu-fly` and preserves its MIT / Apache-2.0 / CC-BY attribution files. The upstream simulator remains the scientific baseline while the active experiment surfaces reuse the shared neural runtime.

### Neural pipeline retained from upstream

```
FlyWire FAFB brain.bin
  139,255 neurons
  ~15.09M signed synaptic edges
        |
        v
WebGPU LIF (src/sim.ts + src/shaders/lif.wgsl)
        |
        +--> realtime brain viewer (src/viewer.ts)
        |
        +--> named descending-neuron readout
                |
                v
MANC vnc.bin
  23,188 neurons
  ~5.24M edges
                |
                v
motor aggregation / adapter
```

The brain binary format is defined by `tools/build_csr.py`; MANC mirrors the same CSR format via `tools/build_vnc.py`.

## What upstream currently does

- `src/brain.ts` parses the full FlyWire/MANC CSR binaries.
- `src/sim.ts` owns WebGPU buffers and dispatches the fused LIF kernel.
- `src/shaders/lif.wgsl` performs presynaptic gather, alpha-synapse state update, leak, threshold, spike bitset and reset.
- `src/viewer.ts` renders the full brain point cloud and activity snapshots.
- `src/room.ts` renders the fly body/world and refreshes a forward retina.
- `src/vnc.ts` exposes the current brain/VNC motor abstraction. Its visual tracking default contains an angle bypass; the opt-in connectome path uses left/right DN cascade asymmetry and is explicitly documented upstream as unreliable.
- `src/physics.ts` owns MuJoCo flybody locomotion and upstream assists/approximations.

## Active experiment surfaces

The legacy Science Mode and motorcycle preview have been removed from this fork.

Current browser-facing experiments:
- `stock.html` — market-decision sandbox;
- `fulllife.html` — long-running civilization / life observer;
- `play.html` — the retained interactive fly-brain game.

These surfaces may reuse shared FlyWire/WebGPU brain assets and support modules,
but there is no separate Science Mode, motorbike, or Open World Vite entry anymore.

## Adapter rule

Anything outside the connectome must be labelled by provenance:

- **REAL DATA** — FlyWire/MANC topology, annotations, neuron identities, source weights.
- **SIMULATION** — LIF dynamics, spike windows.
- **ADAPTER** — environment encoding and output-to-action mappings.
- **PHYSICS** — scene/body/world dynamics.
- **HEURISTIC / ASSIST** — any stabilization or fallback. Must not be described as a brain decision.

## Performance target

Primary target: Apple Silicon Mac M1.

The full connectome is never reduced merely to improve graphics. Graphics quality may be reduced independently and the eventual UI should include a **FULL BRAIN / LOW GRAPHICS** preset.
