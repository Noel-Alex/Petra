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

1. prioritize #37 and every concrete prerequisite/blocker needed for a real composed worker-owned flagship loop;
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

- **P0 flagship:** #3 resource-limited growth, #5 evolution/lineages, #6 living-dish renderer, #7 experiment UX.
- **P1 product/polish:** #9 counterfactual compare, #10 motion/onboarding/accessibility, #11 guided demo + judge defense.
- **P2 expansion:** #12 named phage pack, #13 mechanistic dataset + surrogate benchmark.

### Focused executable / recovery seams

This list is intentionally selective. Use the live issue search for the complete queue and re-check comments/branches immediately before editing.

- **Authoritative runtime + UX integration:** #37 owns migration from the synthetic worker scaffold; #42 is the React/runtime umbrella consuming that authority. #158 needs the real intervention command schema, #159 owns authoritative local-region inspection, #274 owns causal narration once explicit causal-event identity exists, and #317 exposes the already-typed Step/Reset/Replay/Seed controls in the shell.
- **Browser/expo acceptance:** #59 owns real browser visual, motion, keyboard, touch, screen-reader, and frame-time evidence. Source-only work must not claim that evidence.
- **Renderer/input + accessibility:** #241 owns the live semantic-zoom guide bridge; #253 owns one visual-demo snapshot transaction; #300 owns overview touch scroll chaining; #313 separates renderer-failure narration from retry control; #314 routes retry through shared Petra action motion. Coordinate these shared Pixi/DishViewport paths before editing.
- **Shell keyboard/motion:** #276 owns conflict-safe playback shortcut wiring. Coordinate broader interaction/onboarding polish through #39 and the #10 umbrella rather than creating competing App-level keyboard or motion authority.
- **Provenance + judge drill-down:** #278 makes only explicitly supplied DOI/URL locators actionable. #11 remains the integrated demo/judge-defense completion gate; do not turn presentation cues into scientific authority.
- **Replay + scientific identity:** #222 binds composed lineage channels to genotype identity; #302 makes run-seed identity injective with the uint32 RNG stream; #227 owns the flagship limiting-resource identity gate.
- **Numerical/runtime safety:** #224 remains open for the authoritative sampling-policy fingerprint hook after its bounded accelerated-sampling core landed. Preserve exact-reference paths and replay-critical sampler identity.
- **Phage:** #12 remains the named T4/MG1655 implementation umbrella; #283 owns discrete burst-count/lysis bookkeeping. Unbound phage loss/other calibration gaps stay visibly unbound.
- **ML:** #13 remains the mechanistic-dataset/surrogate umbrella. Real model training/evidence stays downstream of authoritative mechanistic trajectories from #37; do not reopen completed safety-policy work merely to make an ML demo.
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
