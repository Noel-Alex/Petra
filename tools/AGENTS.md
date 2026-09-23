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
Run `python tools/verify.py quick` for local contract validation. Use `premerge` for the broader deterministic suite once implementation tests exist.

## Child DOX index
No child contracts yet.
