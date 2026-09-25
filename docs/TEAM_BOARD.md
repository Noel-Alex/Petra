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

## Immediate execution priority — functionality first

The current project scheduling directive is to make the **working flagship simulation/runtime the number-one priority**. The repository has many strong isolated pieces, but current `main` is still not one complete authoritative browser experiment. Until that changes:

1. prioritize #37 and every concrete prerequisite/blocker needed to finish the product-facing protocol-v5 composed worker flagship loop;
2. prioritize numerical/scientific validation, parameter binding, local experiments, data generation, and tooling when they unblock that loop;
3. keep UI, visual-system, and motion work moving only on spare/non-conflicting capacity or when the functional path is blocked;
4. keep learned-model authority downstream of authoritative mechanistic trajectories and explicit promotion/validation gates, while preparing batch/dataset/training/benchmark infrastructure early enough that local compute can start immediately once those trajectories exist.

This is a scheduling rule, not a reduction in the visual-quality bar. Petra still needs premium dish-first interaction and motion; it simply must not become a beautiful interface around synthetic or incomplete authority.

## Latency-adjusted queue policy

Use live GitHub state as a scheduler, not merely a catalog.

1. **PR recovery first:** before opening new implementation, inspect stale/non-mergeable/duplicate PRs and recover useful work. A nearly-finished integration often outranks a fresh ticket.
2. **Long-lead first when delay is expensive:** #542 and related calibration/dataset/training/profiling/soak/rehearsal work should be prepared before its final prerequisite lands whenever that preparation can be truthful.
3. **Balance lanes:** avoid sending multiple uncoordinated agents into cosmetic UI refinement while authoritative runtime/science, experiment/ML, or release-hardening blockers are unclaimed.
4. **Finish means integrated:** a bounded branch should be kept fresh, verified as far as the environment allows, made mergeable, and merged or handed off precisely. Large private deltas and duplicate PRs are schedule debt.
5. **No global phase serialization:** #517 governs parallel roadmap execution. A later-phase task may proceed when its own dependencies are stable even if another phase remains incomplete.

## Current queue orientation

### Umbrellas — coordinate through focused issues where possible

These remain useful product/science umbrellas, but are usually too broad to claim wholesale.

- **P0 flagship:** #5 evolution/lineages, #6 living-dish renderer, #7 experiment UX. The original ecology implementation gate #3 is complete; further ecology calibration/physical-resource work is tracked by focused issues rather than reopening it.
- **P1 product/polish:** #9 counterfactual compare, #10 motion/onboarding/accessibility, #11 guided demo + judge defense.
- **P2 expansion:** #12 named phage pack, #13 mechanistic dataset + surrogate benchmark.

### Focused executable / recovery seams

This list is intentionally selective and contains **open owners only** as of this reconciliation. Use live issue search for the complete queue and re-check comments/branches immediately before editing.

- **Authoritative flagship + intervention path:** #37 owns the remaining composed flagship integration; #42 owns default React/runtime activation; #626 owns the remaining typed intervention vocabulary; #158 owns authoritative intervention metadata/palette/runtime binding. Source-level region inspection is complete; real inspector/pointer/touch/browser evidence is part of #59.
- **Replay, analysis, and export:** #512 owns runtime history-generation / `runBranchIdentity`; #625 owns synchronized historical scrubbing; #602 owns live authoritative chart wiring; #604 owns remaining lineage-analysis runtime/selection integration; #681 owns safe browser-local experiment-bundle save/load and fresh-runtime replacement.
- **Scientific and numerical authority:** #562 owns composed integration of the shared discrete population/event authority; #629 owns remaining authoritative metric-contract consumers/cadence hardening; #651 owns production parameter-compatibility integration; #628 owns replay-safe compaction only after protocol and soak evidence justify it.
- **Provenance + release truth:** #579 owns the broader product provenance/judge audit; #627 owns binding real per-scenario validation evidence; #561 owns the eventual exact release scientific-identity freeze; #11 remains the integrated demo/judge-defense gate.
- **Browser, offline, soak, and performance evidence:** #59 owns browser/device/a11y/frame-time acceptance; #557 offline/no-network evidence; #558 long-soak evidence; #630 Worker transport measurement; #642 renderer/runtime performance instrumentation evidence; #716 the decisive Windows local-runner rerun. Do not choose an architecture from source instrumentation alone.
- **Phage:** #12 remains the named T4/MG1655 umbrella; #751 is the focused owner for composed free-phage/infection/lysis/checkpoint/replay integration. Pure burst/lysis bookkeeping #283 is complete and should not be reclaimed.
- **ML long-lead path:** #13 remains the umbrella; #682 owns exact run-condition identity, #685 execution-schedule/resume identity, #594 the generic laptop worker/CLI after those identities settle, and #544 the first authoritative held-out sweep/evidence.
- **Build/reproducibility:** #30 owns the canonical JavaScript lockfile/local-install reproducibility task and requires real npm-registry access; do not hand-write lockfile integrity metadata.


## Work selection

1. Read root and scoped DOX.
2. Inspect live PRs first, then Issues/branches before claiming; do not rely on this snapshot alone.
3. Treat an ephemeral-agent claim as a ~35-minute lease from its latest meaningful GitHub progress signal. Recover useful expired work before duplicating it, including stale PRs that can be repaired or transplanted.
4. Prefer the highest latency-adjusted-value unblocked focused issue; **while the functional flagship is incomplete, functional/runtime/science-validation blockers and ready-to-prepare long-lead experiments outrank cosmetic/UI polish of comparable scope**. Use umbrella issues for coordination/context rather than parallel mega-claims.
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

- **No GitHub Actions / hosted CI for Petra until repository maintainers explicitly re-enable it in durable project DOX.**
- Do not create or restore workflow files, required hosted checks, scheduled Actions, hosted experiment jobs, or artifact-upload automation.
- Verification is local/manual; record what actually ran in the relevant Issue/PR.
- Local-only hardware/browser/GPU/ML experiments should be routed through the single laptop experiment runner/evidence inbox (`python run_local_experiments.py`), not through CI.
