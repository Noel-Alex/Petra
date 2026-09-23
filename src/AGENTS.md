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
The intended long-term core is Rust with a native test/sweep target and WebAssembly browser target, hosted in a Web Worker. The presentation layer is TypeScript/React with WebGL/Three.js or an equivalent GPU path. A temporary TypeScript reference implementation is acceptable if it obeys the same interface.

## Verification
Unit/determinism tests for the core, reference-vs-accelerated numerical comparisons, browser interaction tests, and measured performance budgets. Never claim device/browser acceptance without running it.

## Child DOX index
Create child contracts when `sim/`, `render/`, or `ui/` becomes an active durable boundary.
