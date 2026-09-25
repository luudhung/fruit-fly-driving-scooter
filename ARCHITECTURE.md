# Fruit Fly Driving Scooter — Architecture

## Upstream baseline

This repository mirrors the source tree of `abgnydn/webgpu-fly` and preserves its MIT / Apache-2.0 / CC-BY attribution files. The upstream simulator remains the scientific baseline while the motorcycle embodiment is developed alongside it.

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
- `src/main.ts` lateralizes optic stimulation and runs the real MANC readout.
- `src/vnc.ts` exposes the current brain/VNC motor abstraction. Its visual tracking default contains an angle bypass; the opt-in connectome path uses left/right DN cascade asymmetry and is explicitly documented upstream as unreliable.
- `src/physics.ts` owns MuJoCo flybody locomotion and upstream assists/approximations.

## Motorcycle development phases

### Phase A — upstream baseline

Status: source mirror complete; upstream CI build/typecheck passed after the mirror.

Heavy neural/body assets are intentionally not committed. Upstream expects:
- `brain.bin` (~120 MB)
- `vnc.bin` (~43 MB)
- flybody bundle / OBJ assets
- walking policy assets

These are generated/downloaded with upstream tools or served from an external asset host.

### Phase B — motorcycle world

Status: implemented as an isolated preview.

Files:
- `motorbike.html`
- `src/motorbike.ts`
- `src/motorbike-world.ts`

Current features:
- primitive Three.js motorcycle;
- straight two-lane road;
- barriers;
- static obstacles;
- low-speed bicycle-model steering;
- collision detection;
- speed/position/heading/steering/throttle/brake telemetry;
- manual temporary controls.

The Phase B control source is deliberately labelled **MANUAL / NOT BRAIN-CONTROLLED**.

### Phase C — brain steering

Next adapter boundary:

```
rolling brain rate
   -> named DN / descending population activity
   -> normalized left/right motor signal
   -> steering [-1, +1]
   -> MotorbikeWorld
```

No obstacle geometry may directly set steering in Honest Mode.

### Phase D — closed loop

Target loop:

```
motorcycle rider camera
  -> offscreen 64x16 retinal sample
  -> optic neuron external input
  -> full FlyWire WebGPU LIF
  -> descending-neuron activity
  -> motorcycle steering adapter
  -> world/body state
  -> new rider-camera image
  -> repeat
```

## Adapter rule

Anything outside the connectome must be labelled by provenance:

- **REAL DATA** — FlyWire/MANC topology, annotations, neuron identities, source weights.
- **SIMULATION** — LIF dynamics, spike windows.
- **ADAPTER** — retina encoding and DN-to-motorcycle control mapping.
- **PHYSICS** — motorcycle kinematics/collisions.
- **HEURISTIC / ASSIST** — any stabilization or fallback. Must not be described as a brain decision.

## Performance target

Primary target: Apple Silicon Mac M1.

The full connectome is never reduced merely to improve graphics. Graphics quality may be reduced independently and the eventual UI should include a **FULL BRAIN / LOW GRAPHICS** preset.
