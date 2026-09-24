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

## 2026-09-24 — ecology flux boundary and flagship PD composition

- PR #24 merged continuous per-lineage/per-cell **division-biomass** and **death-biomass** ledgers. These are aggregate fluxes, not integer mutation events; #5 must use a reviewed event bridge rather than rounding biomass.
- Flagship growth/resource parameters (`mu_max`, `K_s`, yield, capacity/spread) remain explicitly **UNBOUND** in machine-readable provenance. Do not invent values merely to make the dish animate.
- Issue #4 is standardizing resource×ciprofloxacin composition as `reference_pd_decrement_as_first_order_loss_v1`: `h_drug = ln(10) * (psi_max - psi_g(a))` after the existing MIC-ratio shift.
- The Regoes source `psi_max` is **not** automatically Petra's Monod `mu_max`. The Regoes zMIC is therefore the transferred PD-curve zero crossing, not by itself a guarantee of the whole composed model's zero-growth concentration.
- Spatial drug loss fields consume authoritative concentration arrays and may feed ecology; renderer/UI remain presentation-only. Starvation interaction is a disclosed composition policy, not source-matched stationary-phase calibration.


## 2026-09-24 — CI disabled; local evidence pipeline becomes project policy

- Noel-Alex explicitly disabled hosted CI for Petra to avoid spending GitHub Actions minutes during active swarm development.
- `.github/workflows/premerge.yml` was removed from `main`. Agents must not restore GitHub Actions, required hosted checks, scheduled workflows, hosted benchmarks, or CI experiment jobs until Noel-Alex explicitly lifts the freeze.
- Earlier Actions runs remain valid historical evidence for the commits they tested, but they are not a standing workflow recommendation.
- Deterministic verification remains available as local commands (for example `python tools/verify.py premerge` / `npm run verify`) and should be run manually where the current environment supports it.
- Hardware/browser/GPU/model-training/scientific experiments that agents cannot execute should be registered into one laptop-facing experiment runner (#41). Noel-Alex can pull the repo, run one entrypoint locally, and push compact result summaries back so blocked Issues resume.
- Large models, checkpoints, raw datasets, and bulky profiling outputs must stay local by default; Git should receive compact versioned metadata/results only.

## 2026-09-24 — Noel-Alex priority directive: functional flagship first

- The project scheduling priority is now explicit: **end-to-end functionality is P0**. Current `main` has substantial isolated science kernels, worker/replay infrastructure, renderer/UI systems, research, and tests, but these must not be treated as a finished product while the authoritative composed flagship browser loop is incomplete.
- #37 is the central integration seam. Concrete prerequisites/blockers for scenario initialization, composed ecology/evolution authority, worker commands, interventions, checkpoints/replay, real snapshots/events/metrics, parameter binding, numerical validation, and local evidence inherit top priority.
- UI/design/motion remains important and may proceed in parallel on spare/non-conflicting capacity or while functional work is blocked. It should not consume scarce ownership that could close an available P0 functional blocker.
- Research, datasets, calibration, and experiments are priority work when they unblock the mechanistic runtime. ML training is not a shortcut around missing authority: learned models stay downstream of authoritative mechanistic trajectories plus explicit validation/promotion gates.
- Architecture remains evidence-driven. WASM, hosted backends, GPU services, or other complexity should be adopted only when profiling/batch/data/experiment requirements justify them.
- This scheduling change does **not** lower Petra's expo visual-quality target; it changes order of operations so showcase polish sits on a real scientific system.

Contributor: Noel-Alex

## 2026-09-24 — localized intervention preview boundary

- #458 establishes a reusable presentation-only localized placement state: direct dish pointer/touch target + keyboard-equivalent X/Y controls, with circular coordinates tied to the renderer aperture authority.
- Inoculation, fungi, antibiotic, and nutrient are available as **placement-preview vocabulary** without claiming that protocol-v4 composed authority can already apply them. The current command union still has no real typed flagship intervention command; the target ring is cursor affordance, not a modeled biological footprint.
- Scientific Apply remains fail-closed until #37/#158 supplies authoritative intervention command schema plus parameter labels/units/bounds. Do not translate these previews into `synthetic-pulse`.
- Placement survives transient pending requests, cancels on Escape/explicit Cancel, and is cleared when runtime authority is unavailable/starting/failed.
- The implementation was rebased onto the shared calm visual-token foundation and consumes those tokens without taking ownership of the central theme.


## 2026-09-24 — composed provenance binding + research-stage flagship composition

- #564 / PR #588 moved composed worker identity to protocol v4: a product-facing parameter-set ID/version must be bound to the exact deterministic composed-configuration fingerprint rather than acting as an unverified friendly label. Ad-hoc test configs use an explicit `fixture:` namespace.
- #227 remains intentionally open for a future source-compatible physical limiting-resource/Monod binding. Do not close it by mixing incompatible literature values or renaming model-resource as glucose.
- #494 introduced a separate engineering execution profile so ecology can run without weakening #227. The current scenario is `ecoli-ciprofloxacin-spatial@1.4.0-research`; it selects `ecoli-ciprofloxacin-ecology-engineering@1.1.0`.
- The scenario now also owns `ecoli-ciprofloxacin-baseline-composed@1.0.0`: model-grid geometry, founder `WT` channel identity, and the declared resource×drug loss policy are versioned mechanism authority. Baseline `deathHazardPerHour = 0` means the incremental ciprofloxacin-loss channel is inactive before drug exposure; it is not a measured MG1655 background-death constant.
- Initial model-resource level, founder placement/biomass, and seed remain explicit run-state inputs and do not silently become mechanism constants. The product-facing `flagshipComposition.ts` builder consumes only bundled scenario authority, constructs the circular mask/state, and mints the protocol-v4 provenance binding from the resulting composed configuration fingerprint.
- The execution profile remains `engineering` and uses only `hour`, `model-resource`, and `model-biomass`. Its normalized values are judged against kernel behavior targets, not a claim of measured MG1655 glucose/CFU calibration.
- Continuous model-biomass division flux is still not discrete cell/division-event authority. #562 owns that bridge; do not use the new runnable baseline as permission to round biomass into mutation events.
- A later physical/calibrated resource profile is a new scenario/profile/parameter-set identity and must satisfy the #227 evidence compatibility gate.

Contributor: Noel-Alex
