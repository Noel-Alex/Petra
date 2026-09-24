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

Run `python tools/verify.py premerge` for the broader deterministic suite. With the TypeScript implementation substrate present, the premerge registry owns strict typechecking + Vitest through the `typescript-deterministic-suite` check. GitHub Actions is an execution environment for these same source checks; a green run is not browser, GPU, device, performance, or experimental validation.

When a branch has `package.json` but not yet a committed lockfile, CI may use `npm install` to make the verification gate executable. Treat a committed lockfile as follow-up reproducibility hardening rather than silently claiming dependency resolution is fully pinned.

## Child DOX index
No child contracts yet.
