# Petra deterministic verification

The repository verifier records **source/config evidence**, not browser, GPU, device, or experimental truth.

## Commands

- `python tools/verify.py quick` — repository contracts and structured-data parsing.
- `python tools/verify.py premerge` — quick checks plus deeper provenance checks as they are registered.
- `python tools/verify.py --list quick` — show selected checks.

The registry lives in `tools/verification_registry.json`. Checks should remain small, deterministic, and meaningful.

## Evidence boundary

A passing verifier means the checked repository invariants were observed locally. It does **not** mean:
- a WebGL/WASM build ran;
- performance budgets passed;
- the scientific model quantitatively matches an experiment;
- a competition demo was visually reviewed.

Record those separately in the relevant Issue/PR.
