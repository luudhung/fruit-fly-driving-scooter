# Changelog

## 2026-09-25

### Phase A — baseline import
- Mirrored the complete 98-file source tree from `abgnydn/webgpu-fly` into `luudhung/fruit-fly-driving-scooter`.
- Preserved `LICENSE`, `LICENSE-FLYBODY`, `NOTICE`, `LIMITATIONS.md`, citation and build/download tooling.
- Kept large generated neural/body binaries out of Git, matching upstream architecture.
- Confirmed GitHub Actions CI passed for the imported baseline.

### Phase B — motorcycle world
- Added `motorbike.html` as a separate Vite entry.
- Added a primitive Three.js motorcycle, two-lane road, barriers and obstacles.
- Added low-speed kinematic steering, collision detection and telemetry.
- Added temporary manual controls with an explicit "NOT BRAIN" label.
- The original science/game app remains untouched as the neural baseline.

### Next
- Replace temporary steering with a DN-derived adapter.
- Render rider-camera retina into the same optic stimulation path used by the full FlyWire simulation.
- Build split-view world + full brain + retina + neural telemetry UI.
