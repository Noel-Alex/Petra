# Petra Technology Stack

## Recommendation

### Application
- React + TypeScript + Vite
- state orchestration with small explicit stores/hooks; avoid a global-state framework until complexity earns it
- Motion for React for UI/story transitions
- lightweight chart layer (uPlot, Observable Plot, or custom canvas where needed)

### Simulation
- TypeScript numerical kernel in a dedicated Web Worker
- typed arrays for hot numeric state
- seeded PRNG with deterministic tests
- schema-validated JSON for scientific presets
- optional Rust/WASM only after profiling a stable kernel

### Live dish renderer
**PixiJS v8 / WebGL-first** is the recommended default.

Why:
- the live scene is fundamentally a dense 2D/2.5D scientific visualization;
- efficient sprites/particles/textures are a better match than a full 3D scene graph;
- Pixi's `ParticleContainer` is explicitly optimized for very large lightweight particle counts;
- custom shaders can render fields, masks, rims, glow and contour-like effects.

Pixi v8's current particle API is marked stable-but-experimental, so wrap particle usage behind Petra-owned renderer adapters rather than coupling domain code to its API.

### Optional 3D
Use Three.js only where 3D adds explanatory value:
- landing/hero dish;
- representative-cell cutaway;
- phage close-up;
- optional cinematic transitions.

Do **not** make the whole simulator Three.js merely because it looks technologically impressive. The scientific state is 2D and a 2D renderer is simpler, faster and easier to make crisp.

Three.js now offers WebGPU-capable rendering with a WebGL 2 fallback, but Petra should not require WebGPU for baseline functionality.

## Worker architecture

The main UI thread should never execute the heavy ecological loop.

```text
React UI
  │ commands
  ▼
Simulation Worker
  │ snapshots / events / metrics
  ▼
Renderer + charts
```

Use transferables for large buffers where it materially reduces copy cost. MDN documents transferable `ArrayBuffer` ownership transfer as a high-performance/zero-copy mechanism.

A double- or triple-buffer scheme avoids sending a buffer back before the worker can reuse it.

Potential protocol:
- worker owns authoritative state;
- every N simulation ticks, create/downsample render buffers;
- transfer render buffer to main;
- main renders and returns recyclable buffer or receives next pool buffer.

Do not introduce SharedArrayBuffer until profiling justifies the added deployment/security complexity.

## Offscreen rendering

`OffscreenCanvas` is widely available and can render in a Worker, but Petra should treat it as an optimization path rather than a baseline architectural dependency.

Potential future modes:
1. simulation worker + main-thread Pixi renderer — simplest baseline;
2. simulation worker + render worker via OffscreenCanvas — useful if rendering blocks UI;
3. separate sim and render workers — only if measurements justify messaging overhead.

## Data-oriented engine layout

### Dense fields
`Float32Array(N*N)`:
- nutrient;
- each drug;
- phage;
- derived visualization scalar fields if cached.

### Populations
Prefer sparse local records or compact lineage-density arrays depending active lineage count.

For the first flagship with few active lineages, one typed array per active lineage is simple and efficient. Add sparse packing only when profiling shows lineage count/memory becoming material.

## Diffusion

Start with an explicit finite-difference stencil under a no-flux circular boundary.

Requirements:
- stable timestep condition;
- mass-conservation test under diffusion-only/no-flux case;
- substepping independent from ecological tick;
- reusable double buffers;
- no allocation in hot loop.

GPU diffusion is a possible future optimization, but keeping scientific state authoritative on CPU is simpler for reproducibility and debugging.

## Styling

- CSS variables/design tokens for Petra semantic colors, spacing, radii and typography;
- SVG for crisp original icons/illustrations;
- WebGL/canvas for the dish;
- ordinary semantic HTML for controls/provenance where possible.

Do not draw all text/UI into WebGL. DOM is better for accessibility, selection, focus and responsive layout.

## Motion

Use Motion for React for DOM transitions and intro storytelling.

Repository rule:
- configure reduced-motion globally;
- replace large transform/parallax movement with opacity/minimal transitions when reduced motion is requested;
- do not tie biological clocks to UI animation timing.

## Browser compatibility target

Baseline:
- current Chromium;
- current Safari/WebKit;
- current Firefox where practical.

Competition demo can target a known modern browser, but architectural choices should avoid needless lock-in.

## Performance instrumentation

Collect in development:
- simulation ms/tick;
- diffusion substep count;
- active lineages;
- transfer payload bytes/sec;
- render FPS/frame time;
- particle count;
- draw calls;
- GPU memory proxies where renderer provides them;
- event queue length;
- garbage collection/jank symptoms.

Performance decisions should cite measurements, not intuition.

## Deployment

Static frontend hosting is enough for core Petra.

The authoritative simulator runs locally in-browser; this is valuable because:
- demo does not depend on network;
- reproducibility is easier;
- no server compute cost;
- no biological state leaves the device.

Optional later services:
- run sharing;
- model-training dataset storage;
- LLM explanation endpoint;
- telemetry.

Core simulation must remain usable offline after assets load.

## Library research notes

Current official documentation supports:
- PixiJS v8 `ParticleContainer` for high-volume lightweight particle rendering;
- Web Workers + transferable ArrayBuffers for moving large data efficiently;
- `OffscreenCanvas` in workers as a possible render offload;
- Motion's `useReducedMotion` / `MotionConfig` for accessibility;
- Three.js WebGPU renderer with fallback, if a future 3D explanatory scene justifies it.

Exact dependency versions should be pinned when implementation begins, not copied blindly from this planning document.
