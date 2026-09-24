# Petra DOX framework

Petra uses a hierarchical **DOX / AGENTS.md** system so humans and short-lived coding agents can work in parallel without relying on chat memory.

## Core contract

- `AGENTS.md` files are binding work contracts for their subtrees.
- Before editing, read this root file and every nearer `AGENTS.md` on the path to files you will touch.
- GitHub Issues and Pull Requests are the canonical shared state. Chat context is disposable.
- Contributor identity comes from the authenticated account/session actually doing the work. Never copy the repository owner's name or a historical `Contributor:` label into claims, branches, commits, PRs, or handoffs unless that is genuinely your authenticated identity.
- Scientific behavior must remain traceable to `research/`, the claim ledger, and parameter provenance. Never invent a biological constant because it makes a demo look better.
- Rendering may interpolate or explain simulation state; it must never secretly determine biological outcomes.
- Petra is an educational/research simulator, not a clinical dosing or treatment tool.

## Current execution priority — functional flagship first

Petra's immediate project priority is **a genuinely working authoritative flagship simulation**, not further surface polish in isolation. Current `main` contains substantial mechanism kernels, infrastructure, renderer/UI systems, tests, and research, but those pieces must not be mistaken for an end-to-end functional product while the composed flagship runtime remains incomplete.

- **P0 functionality:** prefer work that closes the authoritative path from scenario/configuration → composed simulation state → worker/runtime commands → checkpoints/replay → real snapshots/events/metrics → product adapters. Issue #37 is the central integration seam; its prerequisites and blockers inherit this priority.
- **Dependencies count as functionality work:** numerical correctness, missing science contracts, parameter binding/calibration, deterministic tooling, local experiments, datasets, and validation are P0 when they directly unblock the working flagship.
- **UI/design/motion remains a core quality requirement, but is secondary in scheduling:** continue it in parallel when spare/non-conflicting agent capacity exists, or when functional work is blocked. Do not let cosmetic polish consume ownership needed by an available P0 functional blocker.
- **ML authority is downstream, ML preparation is not:** model training/promotion requires authoritative mechanistic trajectories and validation gates, but batch runners, dataset schemas, experiment registrations, baseline/evaluation tooling, checkpoint policy, and OOD/promotion contracts should be prepared as soon as stable prerequisites permit. Never use a learned model to hide a missing functional simulation path.
- **Architecture stays evidence-driven:** do not introduce WASM, a hosted backend, GPU services, or other complexity merely to appear advanced. Adopt them only when profiling, batch-workload, data, or validation needs justify them.

When choosing between an unblocked functional blocker and a cosmetic improvement of similar scope, take the functional blocker first. A polished shell is not completion until the science/runtime underneath it actually works.

## Latency-adjusted swarm scheduling

Optimize for **project wall-clock progress**, not local code volume or visual activity.

- **Recover/integrate before duplicating:** inspect open PRs before starting new implementation. Rebase, repair, merge, supersede, or explicitly abandon useful stale work before creating another branch for the same slice.
- **Long-lead work is a critical path:** prepare local experiments, calibration/statistical sweeps, mechanistic datasets, model-training/benchmark commands, profiling, soak runs, browser acceptance, and offline/demo rehearsal as early as their real prerequisites allow. If a run is blocked, prepare the runner/registration/output contract now and name the exact blocker.
- **Balance swarm lanes:** when several agents already occupy presentation-only work, prefer an unclaimed simulation/science/integration, experiment/ML, or hardening blocker. UI/render/motion remains essential, but parallelism should reduce schedule risk rather than amplify the currently fashionable file.
- **Integration is the completion unit:** code on a private or stale branch is inventory, not progress. Prefer bounded changes that can be reviewed, verified, rebased, and merged quickly. Lines changed, number of issues touched, and visual polish are not success metrics.
- **Phase numbers are not global gates:** any truthful, non-conflicting later-phase preparation may begin once its own prerequisites are stable. Do not idle the swarm behind one blocked phase.

## Work selection and claims

1. Inspect open Pull Requests first, then open Issues and `docs/TEAM_BOARD.md`; stale integration work can dominate the schedule even when the issue queue looks busy.
2. Recover useful abandoned executable work before duplicating it. Do not open a competing implementation/PR for the same bounded slice while an active or recoverable one exists without documenting why recovery is unsafe or slower.
3. Claim an Issue or a bounded slice before editing. State session identity, branch, scope, expected paths, and capability limits.
4. Re-read the Issue after claiming. If another still-valid claim reached overlapping scope first, yield or coordinate.
5. Prefer one active implementation branch per contributor; target `main`.
6. Shared/high-conflict files require coordination before parallel edits.
7. Completing one feature or bounded slice is a checkpoint, **not** a stopping condition. After merge/handoff, re-read the live board and continue with the next useful non-conflicting slice; switch workstreams when necessary rather than idling behind an active lease or blocker.
8. Stop only when the session/environment/tool permissions genuinely prevent further useful work, no actionable non-conflicting work remains, or continuing would violate a capability, safety, scientific-integrity, or evidence boundary. Checkpoint and merge bounded work regularly so an unexpected shutdown does not strand a large private delta.

### Disposable-agent lease

Ephemeral ChatGPT/coding-agent claims are leases, not permanent ownership.

- Treat a claim as active for about **35 minutes** from its latest meaningful GitHub progress signal: a detailed claim, substantive checkpoint, relevant commit, or PR activity.
- A vague “still working” message does not renew ownership.
- About **2 hours** without meaningful progress is the hard abandonment ceiling for ambiguous/non-ephemeral ownership.
- Before recovering work, inspect the Issue, PRs, branch, commits, changed paths, and current `main`. Preserve useful checkpoints rather than restarting blindly.

## Scientific integrity

Every behavior/parameter must be classified as one of:

- **measured** — directly sourced from an experiment;
- **derived** — computed from measured values with a documented equation;
- **transferred** — sourced from another strain/medium/system and explicitly caveated;
- **mechanistic approximation** — literature-backed form requiring scenario calibration;
- **visual-only** — no causal authority over simulation;
- **hypothesis/experimental** — not presented as established biology.

Rules:

- Mutation is sampled from reproduction/molecular events; antibiotics select variants rather than instructing useful mutations.
- Resistance and tolerance/persistence are distinct unless a source supports a linkage.
- Genotype fitness is not a generic penalty per mutation.
- Never average incompatible cross-study parameters simply to obtain one convenient value.
- Preserve units, strain/background, medium, temperature, assay, source DOI/URL, and uncertainty/transfer notes.
- Update `research/CLAIM_LEDGER.md` and parameter provenance whenever scientific behavior changes.
- Do not label qualitative agreement as quantitative validation.

## Product and visual quality

Petra should feel like a premium interactive science animation, not a dashboard wrapped around equations.

- The Petri dish is the primary world; controls, charts, and prose support it rather than dominate it.
- Use an **original** visual language inspired by high-quality editorial science animation: bold geometry, friendly stylized organisms, saturated controlled palettes, strong hierarchy, and purposeful motion. Do not copy another studio's exact assets, characters, compositions, or palette.
- Zoom levels reveal progressively richer information: ecosystem → colonies/lineages → representative cells/molecular explanation.
- Representative rendered cells are visual proxies unless explicitly bound to simulated individuals.
- Motion communicates causality and state changes; decorative motion must not obscure them.
- Accessibility, readable contrast, reduced-motion support, and keyboard/touch operation are release requirements.

## Architecture

- Fixed scenario + seed + engine version must produce a reproducible trace.
- Simulation authority is separate from rendering/UI.
- Prefer data-driven species, genotypes, interventions, and scenarios over hard-coded special cases.
- Numerical approximations need validation against a slower/reference path where practical.
- Do not place ML in the biological authority path without an explicit validation envelope, uncertainty signal, and deterministic fallback. Preferred ML roles are surrogate acceleration, parameter fitting, regression/anomaly detection, and source-grounded explanation.
- Large visual populations use aggregation/LOD. Never imply every drawn bacterium equals one simulated bacterium when it does not.

## Verification and evidence

### CI freeze — binding project policy
- **Do not use GitHub Actions or any other hosted CI for Petra until the repository maintainers explicitly lift this rule in durable project DOX.**
- Do not add, restore, enable, schedule, or depend on `.github/workflows/**`, required checks, hosted benchmark jobs, hosted GPU jobs, automated experiment jobs, or CI artifact uploads.
- Pull requests must not be blocked on CI. Verification is local/manual for now.
- Existing historical Actions results are evidence from past runs only; they do not authorize future CI use.
- Lightweight deterministic checks should be run locally by capable agents/humans and recorded in Issues/PRs.
- Hardware/browser/GPU/scientific experiments that cannot run in the agent environment must be registered for the single local laptop experiment pipeline and marked as waiting on local evidence.

- Run the nearest deterministic checks available in the current environment and record what actually ran.
- Never fabricate browser, GPU, device, performance, or scientific-validation evidence.
- Source checks do not prove runtime behavior; screenshots do not prove scientific correctness.
- Completion requires the relevant scientific, numerical, product, and runtime acceptance criteria, or an explicit capability gate.

## Communication and handoff

Maintain `docs/ORCHESTRATOR_COMMUNICATION.md` as a dense asynchronous science/engineering log for substantial cross-agent discoveries and decisions. Issues/PRs remain the canonical work queue and review surface.

A durable handoff includes: Issue/PR and branch, commit SHA/checkpoint, changed paths, completed work, verification actually run, scientific claims/parameters changed, limitations/capability gates, conflict risk, and next useful action.

When work is blocked on the maintainer/local experiment machine, the handoff must also name the local experiment id/registration, expected compact evidence, and the blocked Issue(s). Agents must not create ad-hoc "run these five scripts" instructions; use the repository's single local experiment entrypoint once available. Large models/checkpoints/raw datasets stay local unless explicitly approved; only compact results/metadata should be committed.

## DOX update rule

After meaningful changes, perform a DOX pass. Update the nearest owning `AGENTS.md` when scope, contracts, workflows, evidence requirements, extension points, or durable quality rules change. Keep Child DOX indexes current and remove stale rules rather than accumulating contradictions.

## Child DOX index

- [`research/AGENTS.md`](research/AGENTS.md) — literature, provenance, claims, and parameter evidence.
- [`docs/AGENTS.md`](docs/AGENTS.md) — product/science specifications, architecture, visual language, and coordination.
- [`data/AGENTS.md`](data/AGENTS.md) — schemas, parameter packs, and reproducible scenarios.
- [`src/AGENTS.md`](src/AGENTS.md) — simulator/frontend implementation boundaries.
- [`tools/AGENTS.md`](tools/AGENTS.md) — deterministic verification and repository tooling.
- [`experiments/AGENTS.md`](experiments/AGENTS.md) — manual laptop-only experiment registrations, compact evidence, and bulky-artifact policy.
