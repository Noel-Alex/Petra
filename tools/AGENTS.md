# Tooling DOX contract

## Purpose
Deterministic local verification and developer/research tooling.

## Ownership
- Verification registry/orchestrator.
- Static provenance/config checks.
- Reproducible benchmark and regression helpers as they are added.

## Local contracts
- A checker must verify a meaningful invariant; do not generate checker churn for its own sake.
- Passing source checks are not browser, device, performance, or scientific experimental evidence.
- Tools must fail clearly and avoid mutating source during verification.
- Verification output must identify what ran and what remains outside the current evidence boundary.

## Work guidance
Prefer lightweight Python tools with no unnecessary dependencies for repository contract checks.

## Verification
Run `python tools/verify.py quick` for local contract validation.

Run `python tools/verify.py premerge` locally for the broader deterministic suite. With the TypeScript implementation substrate present, the premerge registry owns strict typechecking + Vitest through the `typescript-deterministic-suite` check.

## No hosted CI
- Petra currently has **no CI by project policy**. Do not add or restore GitHub Actions/workflows, hosted checks, scheduled jobs, or automated experiment uploads until Noel-Alex explicitly lifts the freeze.
- Verification commands remain useful, but agents/humans run them locally and record exact evidence in the relevant Issue/PR.
- The local experiment pipeline must refuse execution inside common CI environments; it is designed for Noel-Alex's laptop, not hosted runners.
- Any future change to this rule requires an explicit repository-wide DOX update, not an agent convenience decision.

## Local experiment handoff
- There must be one human-facing laptop entrypoint for registered benchmarks/experiments.
- Agents add registrations/metadata to that system instead of inventing separate user-facing scripts.
- Compact summaries/results are Git-tracked in a canonical evidence folder; large checkpoints/models/raw datasets/profiling dumps remain local.
- Blocked Issues should state the experiment registration/id and resume when compact evidence is pushed back to GitHub.

## Child DOX index
No child contracts yet.


## Human laptop entrypoint
The single manual experiment entrypoint is `python run_local_experiments.py`, governed by `experiments/AGENTS.md`. Register requested hardware/browser/GPU/ML/scientific runs in `experiments/local_manifest.json`; do not create alternative user-facing runbooks for Noel-Alex.
