# Pharmacodynamics simulation DOX contract

## Purpose
`src/sim/pharmacodynamics/` owns deterministic source-backed concentration-response equations and explicitly versioned transformations from those responses into simulator mechanism inputs.

## Authority contracts
- Biological parameter values and source context remain scenario/provenance-owned; do not add hidden antibiotic or genotype defaults here.
- Preserve rate conventions. Regoes source slopes are log10-density/time values and must be explicitly converted before composition with natural-log population dynamics.
- The CAB1 reference PD shape → MG1655 MIC shift is a transferred mechanistic approximation, not a genotype-specific measured time-kill curve.
- Flagship resource×drug policy `reference_pd_decrement_as_first_order_loss_v1` supplies only the PD decrement relative to the source no-drug state:
  `h_drug = ln(10) * (psi_max - psi_g(a))`.
- Do not silently identify the independent ecology `mu_max` with Regoes `psi_max`; that seam requires scenario calibration.
- Spatial concentration input must come from authoritative simulation state. Renderer/UI state cannot influence PD output.
- Drug concentration/PD may alter survival or growth, but must never directly instruct mutation generation.
- Prepared/hot-loop evaluators must be numerically equivalent to the validated reference function.
- Generic antimicrobial composition keeps growth/division suppression and incremental loss as independent effect axes. Never force a bacteriostatic/source growth-inhibition model through a death-hazard API merely for drug UI uniformity.
- The Greulich chloramphenicol authority is the exact versioned `data/pharmacodynamics/chloramphenicol_mg1655_greulich_v1.json` record plus `chloramphenicol.ts`. It is restricted to wild-type E. coli K-12 MG1655 in the reviewed MOPS glucose/glycerol families, uses explicit `uM`, and must fail closed on unknown environment/background/unit identity. The current `model-resource` flagship is not either family; product/runtime binding remains blocked on #928.

## Provenance
Every versioned composition policy must expose a stable ID, classification, source keys, and limitation text suitable for the later Why?/Sources/Assumptions UI.

## Verification
Run `python tools/verify.py premerge`. Tests must cover reference points, unit conversion, genotype shifting, finite asymptotes, zero-drug incremental loss, spatial masking, invalid input rejection, and resource×drug integration.

## Child DOX index
No child contracts yet.
