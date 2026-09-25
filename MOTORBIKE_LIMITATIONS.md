# Motorcycle-specific limitations

This file supplements the upstream `LIMITATIONS.md`; it does not replace it.

## Current Phase B

The motorcycle preview is **not connected to the brain yet**.

- Steering is manual keyboard input.
- Cruise speed is a simple kinematic target.
- Motorcycle dynamics use a bicycle-model approximation, not MuJoCo.
- Collision is simple circle-vs-box / road-boundary collision.
- The displayed motorcycle camera marker is not yet the neural retina source.
- No claim should be made that the connectome is currently driving the motorcycle.

## Planned Phase C/D scientific boundary

The goal is to connect the motorcycle only through:

```
camera -> retinal encoding -> optic neurons -> full FlyWire LIF
       -> descending activity -> steering adapter -> motorcycle
```

An obstacle's world coordinates must never directly cause a left/right turn in Honest Mode.

## Important upstream caveat

Upstream `src/vnc.ts` currently includes a reliable visual-angle bypass and an opt-in brain-cascade visual path whose sign/reliability is explicitly documented as poor under the current window. This project must not silently reuse the bypass and call it connectome control.

If the connectome steers badly, collides, oscillates or does nothing, that behavior should be shown rather than repaired by a hidden heuristic.
