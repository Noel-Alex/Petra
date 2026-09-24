# Orchestrator communication

Dense asynchronous notes for cross-agent decisions/discoveries. Issues/PRs are the canonical claim/review surfaces; this file preserves high-value context that should survive disposable chats.

## 2026-09-24 — project foundation

- Petra is a **hybrid spatial stochastic eco-evolution simulator** presented as a polished interactive Petri-dish experience. It is not a scripted mutation video and not a digital twin.
- Flagship evidence stack is *E. coli* + ciprofloxacin: Regoes-style concentration-response pharmacodynamics; Marcusson genotype-specific MIC/fitness; Huseby mutation-supply/evolution results; Shao spatial resource-limited colonies; Baym MEGA-plate as qualitative spatial-evolution precedent.
- Cross-study composition is explicitly an approximation. Regoes' CAB1/LB pharmacodynamic shape and Marcusson's MG1655 genotype MICs are not treated as one measured experiment.
- Long-term architecture should not be constrained by the Saturday build. Current decision: TypeScript authoritative core in a browser Worker first, with a backend-neutral protocol; move stable hot kernels to Rust/WASM/native sweeps only when profiling or batch requirements justify it. Pixi/WebGL is the default live-dish path, with 3D reserved for information-rich explanatory scenes.
- DOX/Issue lease workflow adapted for Petra so friends and ephemeral ChatGPT/coding-agent sessions can collaborate through GitHub rather than shared chat memory.
- Visual direction: original premium editorial science animation; bold geometric organisms, cinematic zoom/progressive disclosure, strong causal motion. Inspiration may include the clarity/playfulness associated with science-animation studios, but assets/palette/compositions must remain Petra's own.
- ML is optional and useful for surrogate acceleration, parameter calibration, regression detection, and source-grounded explanation. It should not secretly replace mechanistic authority in Science Mode.

## 2026-09-24 — planning/research consolidation and executable queue

- Added master plan, growth-ready architecture, technology stack, implementation roadmap, ML training plan, visual system, motion/interaction spec, demo/judge defense, research-gap tracker, numerical methods, temperature/pH research, and frontend-rendering research.
- Durable decision log now explicitly chooses **TypeScript Worker first; Rust/WASM is earned by profiling**, removing the earlier over-prescriptive backend assumption.
- Current official/browser-engine research supports PixiJS v8 particle rendering, Worker transferable buffers, optional OffscreenCanvas, Motion reduced-motion support, and optional Three.js/WebGPU explanatory scenes.
- Environmental research now records Ratkowsky full-range temperature modeling and Rosso cardinal pH/temperature modeling; flagship remains fixed-temperature until compatible parameters are curated.
- Numerical plan now explicitly rejects post-hoc negative-population clamping as a stochastic algorithm and calls for bounded/binomial/adaptive leap handling.
- Research gaps are visible rather than hidden: flagship is implementation-ready with disclosed cross-study transfers; phage, persistence, HGT and environmental controls need named quantitative presets before full Science-Mode promotion.
- Created Issues #1–#13 as the canonical executable roadmap. P0 covers engine/fields/growth/PD/evolution/renderer/UX/validation; P1 covers fork/polish/demo; P2 covers phage and ML.
- README is now the project navigation page. New agents should enter through README → AGENTS → MASTER_PLAN/ROADMAP → relevant Issue and scoped DOX.

## 2026-09-24 — continuous development loop

- An hourly autonomous Petra worker is scheduled to reconstruct live GitHub state, obey DOX/lease rules, claim the highest-value executable work, research when needed, implement/test/checkpoint through GitHub, and leave durable handoffs. Treat its claims exactly like any other ephemeral-agent lease; live Issue/PR/commit activity remains authoritative.

## 2026-09-24 — deterministic implementation stack enters executable CI

- Bootstrapped `.github/workflows/premerge.yml` onto `main` via PR #21 so pull requests can produce repository-owned execution evidence instead of relying on source review.
- GitHub Actions run 35953433816 executed the complete #14→#18 stack on Ubuntu 24.04 / Python 3.13.15 / Node 24.20.0: repository/data/provenance checks passed, strict TypeScript passed, and Vitest reported **6 files / 32 tests passed**.
- That evidence covered the deterministic worker/replay substrate, no-flux spatial fields, resource-limited ecology kernel, ciprofloxacin PD/MIC composition, bounded mutation sampler, and lineage bookkeeping. It does **not** establish browser-worker, GPU, frame-time/device, or experimental validation.
- PRs #14, #15, #16, #17, and #18 were then merged to `main` in dependency-preserving order. Future work should build from live `main` rather than the old stacked branches.
- Issue #8 is converting `python tools/verify.py premerge` into the canonical executable source gate and adding scenario/provenance contract checks plus a deterministic synthetic soak. Keep external/browser evidence as separate named gates.

