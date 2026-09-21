# Performance and architecture notes

## Root causes addressed

- Full-map canvas blur, full-canvas clipped infection gradients, inset polygon
  construction and animated redraws ran every display frame (even when paused).
- Formatting, trait affordability checks, HUD writes and WebAudio automation also
  ran every display frame. The sidebar was rebuilt on a timer even when unchanged.
- The router never called screen `destroy()`. Each return to the game leaked another
  global keyboard handler; map resize listeners also had no cleanup.
- Music kept a scheduler, drones, detuned pads, FM bells, pulses and a convolution
  reverb alive; old delayed cleanup could stop newly started audio.

## Current rendering model

Natural Earth geometry is projected at **build time**, not at startup or each frame.
A map instance compiles reusable `Path2D`s and keeps a single viewport-sized raster
cache. Geometry is repainted only when displayed colours, patterns, camera or size
change. Markers, selection, labels and bounded travel effects compose on top. With
no state change or animation, the canvas is not repainted. Hit testing uses bounds
before ring containment, including holes and antimeridian-split islands.

The cached base layer is a composed cartographic scene: a vertical ocean gradient, a
pre-projected 10° graticule and globe rim (both shipped in `earth.js`, one batched path
each), continental-shelf halos (wide faint strokes that only survive along coastlines),
and cased borders (dark casing under a hairline) instead of flat single strokes. Shelf
and graticule are skipped at Low quality.

The transmission layer composites over the cache while the sim runs: additive heat
bloom and hot cores scaled by prevalence, dash-crawled flow arcs on open corridors,
comet travellers with fading tails (amber = air, cyan = sea), and one-shot transmission
beams for every new-country infection — a comet riding the arc from the source nation,
flashing on impact, tinted by travel mode. Every glow is a **pre-rendered radial
sprite** blitted with `globalCompositeOperation = 'lighter'`: no per-frame gradients,
no canvas blur, no shadow passes. When paused (or with Map effects off) the layer
freezes or disappears and the cache resumes skipping unchanged frames; beams and
pulses still animate to completion after an autopause so events stay readable.

No canvas blurs, bevel construction, live full-screen radial gradients or live map
backdrop filters remain — the only radial gradients are baked into tiny sprites once,
and the map vignette is a static CSS overlay paid by the compositor, not the frame loop.
DPR is capped at 1 / 1.25 / 1.5 for Low / Medium / High. Presentation is capped at
20 / 30 / 30 Hz independently of simulation speed. Sidebar refreshes are at most 2 Hz;
HUD changes are keyed to game state. Background tabs and non-game screens do not tick.
Hidden time is discarded, not simulated on return. This also avoids surprise losses.

Audio has four sustained sine voices, no music scheduler and no reverb. Unchanged
tension does not schedule more automation. Music at zero or disabled releases its
nodes; UI/event sounds obey only the SFX bus. Visibility changes suspend the context.

## Validation (sandbox Chromium, 1440 × 900, software rendering)

- Engine suite: roughly **18 ms for 1,000 days** (~0.018 ms/day).
- Same immediate 120-call paused presentation loop, seed 123, India, STRAND-7:
  old mean **3.23 ms**, old p95 **10.3 ms** of CPU submission time; new cached calls
  are typically **below 0.1 ms**. This isolates redundant work, not display FPS.
- Regression tests assert **zero geography repaints across 120 unchanged draws**,
  correct invalidation after displayed colour, mode and camera changes, and no DOM
  rebuilding during an unchanged paused HUD.
- Real-browser tests exercise an **active** 8× run (not a finished-game overlay),
  navigation eight times, keyboard controls, video decode/seeking, mobile skip,
  both localizations, reduced motion and video-error fallback.
- Headless CPU draw timings (node + `@napi-rs/canvas` software raster, 1500 × 820,
  day-103 peak-pandemic state, not a browser): an **active** presentation frame with
  the transmission layer costs a mean of **2.9 ms** (p95 3.4 ms) against **2.0 ms**
  (p95 2.4 ms) before it — far inside the 33 ms 30 Hz budget; **paused unchanged**
  draws stay at ~0.02 ms in both builds, i.e. the repaint cache still skips everything.
- `npm test` covers deterministic saves/balance, geography point hits, relative area,
  islands/dateline geometry and audio node lifecycle in addition to UI flows.

Browser CPU submission timings exclude raster/compositor work. Software-rendered
sandbox throughput is variable and is **not a 30/60 FPS guarantee on user hardware**.
The browser script logs active-run p95 and frame counts for comparison. Profile on
actual target devices before claiming a universal fix. For low-powered devices,
select Low graphics quality and disable map effects/animations.

## Why keep the browser engine?

The 63-country aggregate model is already very small; it is not simulating billions
of individual agents. A native rewrite or moving that model to a worker would not
remove the rendering, DOM and leaked-listener work identified above. Rewriting would
also risk existing save compatibility, determinism and distribution convenience.
The current changes target those bottlenecks directly without runtime dependencies.

If device profiling still finds raster/compositor stalls, the next rendering step is
static SVG or GPU-batched geometry behind the existing map interface. If future model
complexity pushes daily updates above the frame budget, the existing pure simulation
can move to a Web Worker with snapshot messages. Native packaging is a separate product
choice, not required by the measured simulation workload today.
