# Petra DOX framework

Petra uses a hierarchical **DOX / AGENTS.md** system so humans and short-lived coding agents can work in parallel without relying on chat memory.

## Core contract

- `AGENTS.md` files are binding work contracts for their subtrees.
- Before editing, read this root file and every nearer `AGENTS.md` on the path to files you will touch.
- GitHub Issues and Pull Requests are the canonical shared state. Chat context is disposable.
- Scientific behavior must remain traceable to `research/`, the claim ledger, and parameter provenance. Never invent a biological constant because it makes a demo look better.
- Rendering may interpolate or explain simulation state; it must never secretly determine biological outcomes.
- Petra is an educational/research simulator, not a clinical dosing or treatment tool.

## Work selection and claims

1. Read open Issues/PRs and `docs/TEAM_BOARD.md`.
2. Recover useful abandoned executable work before duplicating it.
3. Claim an Issue or a bounded slice before editing. State session identity, branch, scope, expected paths, and capability limits.
4. Re-read the Issue after claiming. If another still-valid claim reached overlapping scope first, yield or coordinate.
5. Prefer one active implementation branch per contributor; target `main`.
6. Shared/high-conflict files require coordination before parallel edits.

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
- **Do not use GitHub Actions or any other hosted CI for Petra until Noel-Alex explicitly lifts this rule.**
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

When work is blocked on Noel-Alex's local machine, the handoff must also name the local experiment id/registration, expected compact evidence, and the blocked Issue(s). Agents must not create ad-hoc "run these five scripts" instructions; use the repository's single local experiment entrypoint once available. Large models/checkpoints/raw datasets stay local unless explicitly approved; only compact results/metadata should be committed.

## DOX update rule

After meaningful changes, perform a DOX pass. Update the nearest owning `AGENTS.md` when scope, contracts, workflows, evidence requirements, extension points, or durable quality rules change. Keep Child DOX indexes current and remove stale rules rather than accumulating contradictions.

## Child DOX index

- [`research/AGENTS.md`](research/AGENTS.md) — literature, provenance, claims, and parameter evidence.
- [`docs/AGENTS.md`](docs/AGENTS.md) — product/science specifications, architecture, visual language, and coordination.
- [`data/AGENTS.md`](data/AGENTS.md) — schemas, parameter packs, and reproducible scenarios.
- [`src/AGENTS.md`](src/AGENTS.md) — simulator/frontend implementation boundaries.
- [`tools/AGENTS.md`](tools/AGENTS.md) — deterministic verification and repository tooling.
