# Petra Team Board

This is a lightweight orientation page for humans + ephemeral coding agents. **Live GitHub Issues/PRs are authoritative.** This file is a manually reconciled snapshot, not a synchronized issue database.

**Integration branch:** `main`  
**Root work contract:** `AGENTS.md`  
**Science truth:** `research/` + `data/` + `docs/science/`

## Current north star

Deliver a reproducible spatial *E. coli + ciprofloxacin* vertical slice that is simultaneously:
- scientifically defensible;
- numerically testable;
- genuinely interactive;
- visually premium;
- easy to explain to a judge;
- extensible into a larger microbial eco-evolution sandbox.

## Current queue orientation

### Umbrellas — coordinate through focused issues where possible

These remain useful product/science umbrellas, but are usually too broad to claim wholesale.

- **P0 flagship:** #3 resource-limited growth, #5 evolution/lineages, #6 living-dish renderer, #7 experiment UX.
- **P1 product/polish:** #9 counterfactual compare, #10 motion/onboarding/accessibility, #11 guided demo + judge defense.
- **P2 expansion:** #12 named phage pack, #13 mechanistic dataset + surrogate benchmark.

### Focused executable / recovery seams

This list is intentionally selective. Use the live issue search for the complete queue and re-check comments/branches immediately before editing.

- **Authoritative runtime + UX integration:** #37 composed authoritative snapshots → #42 React/runtime bridge; #158 intervention palette, #159 local-region inspector, #156 live analysis, and #58 provenance consume those authority seams.
- **Browser/expo acceptance:** #59 owns local browser visual, motion, accessibility, touch, and frame-time evidence. Source-only work must not claim that evidence.
- **Renderer/input correctness + polish:** #164 overlay transfer functions/legends; #165 atomic snapshot+overlay application; #166 cross-lineage density truth; #171 shared grid-cell coordinates; #173 dish clipping; #175 camera-interruption continuity; #187 wheel-delta normalization.
- **Motion/accessibility/product shell:** #39 owns remaining persisted-motion/onboarding shell integration; coordinate other polish through the #10 umbrella and fresh focused issues rather than reviving closed slices.
- **Counterfactual truth:** #167 binds compare surfaces to the synchronized biological time they claim to show.
- **Science focused gates:** #139 defines the authoritative phage adsorption concentration bridge.
- **ML safety/validation:** #172 binds model cards to scenario + normalization contracts; #174 makes promotion metrics trajectory/group/horizon aware.
- **Build/reproducibility:** #30 owns the canonical JavaScript lockfile/local-install reproducibility task.

## Work selection

1. Read root and scoped DOX.
2. Inspect live Issues/PRs/branches before claiming; do not rely on this snapshot alone.
3. Treat an ephemeral-agent claim as a ~35-minute lease from its latest meaningful GitHub progress signal. Recover useful expired work before duplicating it.
4. Prefer the highest-value unblocked focused issue; use umbrella issues for coordination/context rather than parallel mega-claims.
5. Claim a bounded slice with identity, branch, paths and capability limits; re-read the issue immediately after claiming for races.
6. Leave a durable checkpoint before an ephemeral session ends.

## Board maintenance rule

Before changing or relying on this queue as an orientation aid, compare its issue numbers with the live GitHub search `repo:Noel-Alex/Petra is:issue is:open`. Remove or replace any closed item encountered during the same DOX pass. When this file and GitHub disagree, **GitHub wins**.

Do not add hosted synchronization or GitHub Actions while the project-wide CI freeze is active.

## High-conflict ownership surfaces

- `docs/science/SCIENTIFIC_MODEL.md`
- `data/presets/ecoli_ciprofloxacin_v1.json`
- worker protocol and simulation state schema
- central visual design tokens / dish renderer
- `src/app/App.tsx` and other shared product/runtime shell paths
- `research/CLAIM_LEDGER.md`

Coordinate before parallel edits to these.

## Capability routing

State when remaining acceptance needs real browser/GPU profiling, visual review, biology review, model training, or human demo rehearsal. Source-only agents should not monopolize work whose only remaining gate they cannot execute.

If repository source writes are unavailable, say so explicitly, release the lease, and leave an exact recovery payload rather than implying a branch/commit exists.

## Definition of a useful handoff

Issue/PR + branch + commit SHA, changed paths, observed verification, science/provenance changes, remaining gates, conflict risk, and the next useful action.

## Project-wide CI freeze

- **No GitHub Actions / hosted CI for Petra until Noel-Alex explicitly re-enables it.**
- Do not create or restore workflow files, required hosted checks, scheduled Actions, hosted experiment jobs, or artifact-upload automation.
- Verification is local/manual; record what actually ran in the relevant Issue/PR.
- Local-only hardware/browser/GPU/ML experiments should be routed through the single laptop experiment runner/evidence inbox (`python run_local_experiments.py`), not through CI.
