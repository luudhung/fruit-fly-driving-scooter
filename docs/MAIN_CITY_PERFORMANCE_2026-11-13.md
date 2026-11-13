# Main City rendering audit — 13 November 2026

## Target and measurement

Target: 80–100 FPS at Ultra in the dense Main City, without changing the permanent building/window patterns or resident simulation.

Test machine: Apple M1, 8 GB RAM, built-in display operating at 60 Hz. Chrome renders a 1932×1138 framebuffer (about 2.2 million pixels) at Ultra. The renderer has no application FPS cap. Display-synchronised requestAnimationFrame limits directly observable presentation to approximately 60 FPS on this display. A 10–12.5 ms CPU/GPU frame budget is evidence of headroom, not a measurement or guarantee of 80–100 presented FPS. No iPad hardware benchmark was performed.

Cameras are reproducible using `?perf=nyc-street` and `?perf=nyc-overview`. Measurements are warmed-up five-second windows. The city stays live, so resident/car counts vary. The street sample includes approximately 100 resident and 100 car visuals; the elevated overview naturally streams out small distant actors and must not substitute for the street test. Startup compilation, background system load and occasional photo captures can cause additional outliers.

Before-change street samples: 52–56.6 FPS, CPU 17.1–17.4 ms, GPU 12.5–13.7 ms, approximately 1.45 million submitted triangles and 810–846 draw calls. Initial GPU reporting used the latest asynchronous sample, rather than the window mean.

Optimized warmed-up street sample: 60 FPS, CPU 4.1 ms, GPU 8.3 ms, 748 thousand submitted triangles and 558 draw calls. Optimized overview sample: 59.6 FPS, CPU 8.5 ms, GPU 10.9 ms and 1001 draw calls. GPU reporting now averages completed timer queries over the reporting window. These are representative measurements on a running city, not a controlled replay or a guarantee at every camera angle.

## Research applied

- [Unity GPU instancing](https://docs.unity.com/en-us/engine/6000.7/manual/analysis/graphics-performance-profiling/reduce-draw-calls/gpuinstancing): reuse geometry/materials across repeated surfaces.
- [Three.js — Optimize Lots of Objects](https://threejs.org/manual/pages/optimize-lots-of-objects.html): merge immutable surfaces and reduce scene/draw overhead.
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html): capability-based reversed depth, asynchronous render statistics and complete accounting across output passes. The installed r184 renderer documents that logarithmic gl_FragDepth disables early fragment rejection.
- [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame): callback frequency generally follows display refresh.

Implementation choices:

1. Keep ordinary facades permanently resident in a few citywide style batches. Baked window grids never change with distance. Include ordinary destination facades in this batching after all shopfront details have been constructed. Independent damage/reconstruction still updates each building.
2. Split the much heavier New York ironwork, traffic signal geometry, crossings and trees into immutable spatial cells. Native frustum rejection can omit off-screen cells without loading/unloading detail. Signal phases and collider positions remain authoritative and unchanged.
3. Merge exact opaque Tower, Empire, airport and power-plant surfaces by shared material. Preserve glass, signs and existing instancing. Moving aircraft/rotors are separate branches.
4. Share mansion finish materials with per-instance diffuse and emissive colors, preserving all room surfaces and glass transparency.
5. Fade metro text between 160–220 metres, where it becomes unreadable, while retaining the physical rail/station/train geometry and simulation.
6. On devices supporting EXT_clip_control and EXT_color_buffer_float, use reversed-Z with explicit 32-bit floating depth, a full-resolution HDR/MSAA target and a color output pass. Avoid the unused MSAA depth resolve. Devices lacking those extensions retain the direct logarithmic path. The read-only `?depth=log` diagnostic forces that fallback.
7. Preserve resident photo capture through the same output pipeline and update actor frustum calculations for reversed-Z. Count the full frame, including the output pass, rather than reporting only the final fullscreen triangle.

A separate facade depth prepass was tried and removed: its extra work did not justify enabling another full-resolution pass in the street case. Larger metro geometry cells were also rejected because they degraded the existing distant-infrastructure culling test.

## Verification and limits

Production build and focused rendering/interaction checks pass. The full unit suite reports 160 passing tests and two pre-existing failures, reproduced from unchanged commit 63c0eee: the exhaustive player stair traversal at M10 stop 3 and a metro-column fixture still expecting 139 colliders while the expanded map has 416. This graphics change does not modify those routes or colliders.

Only the viewer changes. There are no Worker changes, simulation resets, resident/brain ID changes, property or wallet mutations, added server rendering, paid hosting requirements or new lighting sources.
