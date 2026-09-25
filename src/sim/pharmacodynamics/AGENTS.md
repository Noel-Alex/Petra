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
- `chloramphenicol.ts` implements only the Greulich et al. 2015 equation-7 MG1655 **growth-inhibition** authority bound by `data/pharmacodynamics/chloramphenicol_mg1655_v1.json`. Callers must name an exact source-compatible MOPS glucose/glycerol family and pass `uM` concentration plus `h^-1` drug-free growth explicitly. The physical cubic branch must be finite, unique in `[0, 1]`, and continuous from the exact zero-drug solution; ambiguity fails closed. Its effect is a division/growth multiplier with zero authorized chloramphenicol incremental-loss hazard. Do not map Petra `model-resource` to either MOPS family, MIC-shift the WT curve for CAT genotypes, infer transport/synergy/mutation, or route chloramphenicol through the ciprofloxacin loss policy. Product enablement remains gated on #928.

## Provenance
Every versioned composition policy must expose a stable ID, classification, source keys, and limitation text suitable for the later Why?/Sources/Assumptions UI.

## Verification
Run `python tools/verify.py premerge`. Tests must cover reference points, unit conversion, genotype shifting, finite asymptotes, zero-drug incremental loss, spatial masking, invalid input rejection, and resource×drug integration.

## Child DOX index
No child contracts yet.
