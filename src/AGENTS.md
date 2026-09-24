# Source DOX contract

## Purpose
Implementation of Petra's simulation, workers, rendering, UI, analysis, and application shell.

## Ownership
- Simulation kernel and deterministic RNG.
- Browser worker/WASM interface.
- Rendering/LOD and interaction.
- Charts, timelines, lineage inspection, experiment branching, exports, and explanation UI.

## Local contracts
- Simulation core owns biological state; renderer/UI owns presentation only.
- No React component or shader may mutate biological state except by issuing a typed simulation command.
- Seed + scenario + engine version must be sufficient for reproducible replay.
- Keep science configuration data-driven.
- Avoid one-agent-per-bacterium designs; use spatial demes/lineage aggregates and explicit LOD.
- Use exact/rare-event sampling where discreteness matters and accelerated aggregate methods where counts are high.
- Add deterministic tests whenever an algorithmic approximation changes.
- UI should remain responsive while simulation runs; heavy simulation belongs off the main thread.
- ML output is advisory/accelerative unless a separately validated contract explicitly gives it authority.

## Work guidance
Start the authoritative core in TypeScript inside a Web Worker so the scientific vertical slice stays inspectable and iteration remains fast. Keep the worker protocol and simulation state independent from React/rendering so a stable hot kernel can later move to Rust/WASM and share a native sweep/test target **only when profiling or batch-sweep needs justify the migration**. The live dish should use a 2D/WebGL-oriented renderer (PixiJS or equivalent); Three.js is reserved for genuinely useful 3D explanatory scenes rather than being the default.

## Verification
Unit/determinism tests for the core, reference-vs-accelerated numerical comparisons, browser interaction tests, and measured performance budgets. Never claim device/browser acceptance without running it.

## Child DOX index
- [`design/AGENTS.md`](design/AGENTS.md) — shared domain-neutral visual token authority for CSS and renderer presentation.
- [`sim/AGENTS.md`](sim/AGENTS.md) — authoritative simulation state, deterministic RNG, replay/checkpoint, and mechanism-core contracts.
- [`scenarios/AGENTS.md`](scenarios/AGENTS.md) — bundled scenario discovery and fail-closed Science-Mode maturity/admission authority.
- [`ui/AGENTS.md`](ui/AGENTS.md) — accessible motion, experiment controls, keyboard semantics, replay planning, and scientific timeline presentation.
- [`app/AGENTS.md`](app/AGENTS.md) — React/browser orchestration, worker-session lifecycle, request correlation, and runtime integration boundaries.
- [`render/AGENTS.md`](render/AGENTS.md) — presentation-only render snapshots, semantic zoom, LOD, and renderer authority boundaries.
- [`ml/AGENTS.md`](ml/AGENTS.md) — leakage-safe mechanistic datasets, surrogate promotion/OOD gates, and emulated-mode authority boundaries.
