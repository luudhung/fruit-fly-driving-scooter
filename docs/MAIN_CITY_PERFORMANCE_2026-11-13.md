# Main City rendering audit — 13 November 2026

## Target and measurement

Target: 80–100 FPS at Ultra in the dense Main City, without changing the permanent building/window patterns or resident simulation.

Test machine: Apple M1, 8 GB RAM, built-in display operating at 60 Hz. Chrome renders a 1932×1138 framebuffer (about 2.2 million pixels) at Ultra. The renderer has no application FPS cap. Display-synchronised requestAnimationFrame limits directly observable presentation to approximately 60 FPS on this display. A 10–12.5 ms CPU/GPU frame budget is evidence of headroom, not a measurement or guarantee of 80–100 presented FPS. No iPad hardware benchmark was performed.

Cameras are reproducible using `?perf=nyc-street` and `?perf=nyc-overview`. Measurements are warmed-up five-second windows. The city stays live, so resident/car counts vary. The street sample includes approximately 100 resident and 100 car visuals; the elevated overview naturally streams out small distant actors and must not substitute for the street test. Startup compilation, background system load and occasional photo captures can cause additional outliers.

Before-change street samples: 52–56.6 FPS, CPU 17.1–17.4 ms, GPU 12.5–13.7 ms, approximately 1.45 million submitted triangles and 810–846 draw calls. Initial GPU reporting used the latest asynchronous sample, rather than the window mean.

Earlier browser-controlled diagnostic samples reached 60 FPS, CPU 4.1 ms and GPU 8.3 ms in the street, and 59.6 FPS, CPU 8.5 ms and GPU 10.9 ms in the overview. These were not a reliable native foreground test: the Chrome window was still showing another tab. After explicitly selecting the city in the native Chrome window, the final packed-HDR street samples reached 59.6 FPS with CPU 6.7–6.8 ms, GPU 13.7–15.1 ms, approximately 759 thousand submitted triangles and 537–540 draw calls. The framebuffer was 1997×1101, still about 2.2 million pixels. The sampled renderer retained 155–161 resident visuals, 113 cars and 4–5 visible trains. Other foreground windows fell to approximately 47–53 FPS under background system load. Sustained 80–100 FPS or a consistent 10–12.5 ms GPU budget has not been achieved or certified. GPU reporting now averages completed timer queries over the reporting window. These are representative measurements on a running city, not a controlled replay or a guarantee at every camera angle.

## Research applied

- [Unity GPU instancing](https://docs.unity.com/en-us/engine/6000.7/manual/analysis/graphics-performance-profiling/reduce-draw-calls/gpuinstancing): reuse geometry/materials across repeated surfaces.
- [Three.js — Optimize Lots of Objects](https://threejs.org/manual/pages/optimize-lots-of-objects.html): merge immutable surfaces and reduce scene/draw overhead.
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html): capability-based reversed depth, asynchronous render statistics and complete accounting across output passes. The installed r184 renderer documents that logarithmic gl_FragDepth disables early fragment rejection.
- [Unity HDR buffer precision](https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@14.0/api/UnityEngine.Rendering.Universal.HDRColorBufferPrecision.html): packed 32-bit HDR versus 64-bit HDR, including the precision/bandwidth tradeoff.
- [MDN floating color buffers](https://developer.mozilla.org/en-US/docs/Web/API/EXT_color_buffer_float): renderable packed floating formats.
- [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame): callback frequency generally follows display refresh.

Implementation choices:

1. Keep ordinary facades permanently resident in a few citywide style batches. Baked window grids never change with distance. Include ordinary destination facades in this batching after all shopfront details have been constructed. Independent damage/reconstruction still updates each building.
2. Split the much heavier New York ironwork, traffic signal geometry, crossings and trees into immutable spatial cells. Native frustum rejection can omit off-screen cells without loading/unloading detail. Signal phases and collider positions remain authoritative and unchanged.
3. Merge exact opaque Tower, Empire, airport and power-plant surfaces by shared material. Preserve glass, signs and existing instancing. Moving aircraft/rotors are separate branches.
4. Share mansion finish materials with per-instance diffuse and emissive colors, preserving all room surfaces and glass transparency.
5. Fade metro text between 160–220 metres, where it becomes unreadable, while retaining the physical rail/station/train geometry and simulation.
6. On devices supporting EXT_clip_control and EXT_color_buffer_float, use reversed-Z with explicit 32-bit floating depth, a full-resolution HDR/MSAA target and a color output pass. Avoid the unused MSAA depth resolve. Use packed R11G11B10 floating HDR when the driver supports its multisampling, with RGBA16F fallback; opaque output needs no alpha, so the packed target halves color-buffer storage/bandwidth. Packed blue has lower precision and can exhibit subtle banding in rare gradients, so this is a precision tradeoff rather than an identical buffer format. Keep scene MSAA at four samples, while the fullscreen output uses a single-sample, depthless default framebuffer instead of allocating and resolving antialiasing twice. Devices lacking those extensions retain the direct logarithmic path. The read-only `?depth=log` diagnostic forces that fallback.
7. Preserve resident photo capture through the same output pipeline and update actor frustum calculations for reversed-Z. Count the full frame, including the output pass, rather than reporting only the final fullscreen triangle. Update position diagnostics at most five times per second and only when changed; camera/vehicle motion still updates every frame. Building visibility lookups use a fixed ID map.

A separate facade depth prepass was tried and removed: its extra work did not justify enabling another full-resolution pass in the street case. Larger metro geometry cells were also rejected because they degraded the existing distant-infrastructure culling test.

## Verification and limits

Production build and focused rendering/interaction checks pass. During the initial rendering audit the full unit suite reported 161 passing tests and two pre-existing failures, reproduced from unchanged commit 63c0eee: player stair traversal at M10 stop 3 and a metro-column fixture expecting 139 colliders while the expanded map has 416. Subsequent integration fixes retain ground support at switchback landings and compare colliders with the actual rendered supports; all 110 directional station up/down paths now pass. Current release test totals are recorded with the civic development release evidence.

The rendering optimizations run only in the viewer and add no server rendering, paid hosting requirement or real lighting source. The subsequent civic/industry release also updates Worker simulation and map version; see CIVIC_DEVELOPMENT_2026-11-13.md. No production reset or test-state import is part of that deployment.
