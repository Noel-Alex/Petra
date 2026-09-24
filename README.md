# PETRA — Petri Evolution & Trait Response Arena

> **Project Petra** — a living microbial eco-evolution laboratory in the browser.

PETRA is an interactive Petri-dish sandbox designed to **feel like a game while behaving like a scientific model**.

Users alter environmental pressures—nutrients, antimicrobials, and later phage, competitors, temperature/pH, or horizontal gene transfer—and watch populations expand, collapse, diversify, and evolve. Outcomes come from a seeded mechanistic/stochastic simulation, not pre-rendered videos or an LLM deciding what should happen.

## Flagship scenario

The first authoritative scenario is a spatially structured *Escherichia coli* population exposed to ciprofloxacin.

It combines:
- a 2D limiting-resource field with diffusion and local consumption;
- resource-limited growth;
- concentration-dependent ciprofloxacin pharmacodynamics;
- reproduction-linked stochastic mutation;
- curated resistance genotypes with literature-backed MIC and relative-fitness data;
- spatial lineage competition/front access;
- deterministic seeds and replay;
- lineage ancestry, local inspection, plots and provenance.

The flagship is deliberately a **composed educational model**, not a claim that one paper measured the entire system or that PETRA is a digital twin.

## Product principles

- **Emergent, not scripted.** A saved demo seed is fine; a hidden “spawn resistance now” rule is not.
- **Mechanistic engine first.** Rendering explains simulation state; it does not decide biology.
- **Provenance is part of the UI.** Users can see sources, assumptions and transferred/calibrated values.
- **Reproducible stochasticity.** Scenario + version + seed + interventions identify a run.
- **Game feel without fake science.** Interaction, challenges, forks and polished animation sit on real model state.
- **Original premium visual identity.** High-end science-edutainment clarity and motion are an inspiration; PETRA does not copy another studio's characters, assets, exact palette or compositions.
- **Not clinical guidance.** PETRA is an educational/research simulation framework.

## Start here

For humans and coding agents:

1. [`AGENTS.md`](AGENTS.md) — binding collaboration/DOX contract.
2. [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) — complete product/science vision.
3. [`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md) — phased build order.
4. [`docs/science/SCIENTIFIC_MODEL.md`](docs/science/SCIENTIFIC_MODEL.md) — authoritative engine equations/semantics.
5. [`docs/science/FLAGSHIP_ECOLI_CIPRO.md`](docs/science/FLAGSHIP_ECOLI_CIPRO.md) — flagship evidence/composition.
6. [`research/RESEARCH_STATUS.md`](research/RESEARCH_STATUS.md) — what is grounded now vs still needs research.
7. GitHub Issues — canonical executable work queue.

## Run locally

Prerequisites: a current LTS release of Node.js with npm.

```bash
git clone https://github.com/Noel-Alex/Petra.git
cd Petra
npm ci
npm run dev
```

Open the local URL printed by Vite (typically `http://localhost:5173`).

Before submitting changes, run the repository verification suite:

```bash
npm run verify
```

Useful individual commands are `npm test` for the deterministic Vitest suite, `npm run typecheck` for strict TypeScript checking, `npm run build` for a production build, and `npm run preview` to serve that production build locally.

## Repository map

### Scientific evidence
- [`research/CLAIM_LEDGER.md`](research/CLAIM_LEDGER.md) — compact audit of claims and non-claims.
- [`research/PRIMARY_SOURCE_AUDIT.md`](research/PRIMARY_SOURCE_AUDIT.md) — source quality/transfer audit.
- [`research/REFERENCES.md`](research/REFERENCES.md) — working bibliography.
- [`research/LITERATURE_MAP.md`](research/LITERATURE_MAP.md) — evidence map.
- Topic notes cover growth, pharmacodynamics, mutation, stochastic methods, spatial evolution, persistence, phage, HGT, temperature/pH, competition, ML and frontend/rendering engineering.

### Scientific specification
- [`docs/science/SCIENTIFIC_MODEL.md`](docs/science/SCIENTIFIC_MODEL.md)
- [`docs/science/FLAGSHIP_ECOLI_CIPRO.md`](docs/science/FLAGSHIP_ECOLI_CIPRO.md)
- [`docs/science/PARAMETER_PROVENANCE.md`](docs/science/PARAMETER_PROVENANCE.md)
- [`docs/science/MODEL_LIMITATIONS.md`](docs/science/MODEL_LIMITATIONS.md)
- [`docs/science/EXTENSIONS.md`](docs/science/EXTENSIONS.md)

### Architecture / implementation
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — concise browser architecture.
- [`docs/GROWTH_ARCHITECTURE.md`](docs/GROWTH_ARCHITECTURE.md) — growth-ready system contracts.
- [`docs/TECH_STACK.md`](docs/TECH_STACK.md) — React/Worker/Pixi/WebGL stack and performance reasoning.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — durable architectural/product decisions.
- [`docs/VALIDATION.md`](docs/VALIDATION.md) — numerical/science validation matrix.
- [`tools/`](tools/) — repository verification framework.

### Product / visual
- [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md)
- [`docs/VISUAL_SYSTEM.md`](docs/VISUAL_SYSTEM.md)
- [`docs/MOTION_AND_INTERACTION.md`](docs/MOTION_AND_INTERACTION.md)
- [`docs/DEMO_AND_JUDGE_DEFENSE.md`](docs/DEMO_AND_JUDGE_DEFENSE.md)

### ML
- [`docs/ML_TRAINING_PLAN.md`](docs/ML_TRAINING_PLAN.md)
- [`docs/ML_SURROGATE.md`](docs/ML_SURROGATE.md)
- [`research/machine_learning.md`](research/machine_learning.md)

### Collaboration
- [`docs/TEAM_BOARD.md`](docs/TEAM_BOARD.md)
- [`docs/ORCHESTRATOR_COMMUNICATION.md`](docs/ORCHESTRATOR_COMMUNICATION.md)
- `.github/ISSUE_TEMPLATE/` and `.github/PULL_REQUEST_TEMPLATE.md`
- Scoped `AGENTS.md` contracts under `docs/`, `docs/science/`, `research/`, `data/`, `src/`, and `tools/`.

## Current engineering direction

The first authoritative backend is TypeScript in a Web Worker, with typed arrays and a deterministic RNG. The worker/UI/render protocol stays narrow enough that stable hot kernels can later move to Rust/WASM if profiling or native batch-sweep needs justify it.

The live dish is primarily a 2D/2.5D scientific visualization, so PixiJS/WebGL is the preferred rendering path. Three.js is optional for genuinely informative 3D explanatory scenes—not a requirement for the main simulator.

## Machine-readable science

- [`data/presets/ecoli_ciprofloxacin_v1.json`](data/presets/ecoli_ciprofloxacin_v1.json) — research-stage flagship preset.
- [`data/schemas/scenario.schema.json`](data/schemas/scenario.schema.json) — scenario schema.
- [`data/parameter_registry.example.json`](data/parameter_registry.example.json) — provenance-first parameter shape.

Biological numbers must carry source/context or an explicit engineering/calibration classification.

## Collaboration model

PETRA is set up for multiple humans and ephemeral ChatGPT/coding-agent sessions.

- Issues are the live work queue.
- Agents claim a bounded slice before edits.
- Disposable claims use an approximately 35-minute meaningful-progress lease.
- Expired useful work is recovered instead of duplicated.
- Cross-agent decisions are checkpointed in `docs/ORCHESTRATOR_COMMUNICATION.md`.
- Every meaningful change gets a DOX/docs pass and evidence report.

## Design rule

> **The spectacle must come from the science, not replace it.**
