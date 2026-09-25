# Environment evidence data contract

## Purpose

This directory holds versioned source-context and calibration-gate records for physical or source-compatible environments that are not equivalent to Petra's generic engineering `model-resource` context.

## Rules

- Environment identity is scientific authority. Do not infer it from display labels such as “glucose”, “MOPS”, “minimal medium”, or “37 °C”.
- A source context may be durable even when it is **not admitted** as a spatial runtime environment.
- Keep exact organism/background, medium family, carbon source, temperature, vessel/geometry context, units, source keys, and applicability limitations.
- Distinguish source-measured context from calibrated spatial mappings.
- Never relabel `model-resource` as a physical substrate without a versioned resource bridge.
- A drug-response record conditioned on drug-free growth rate does not by itself identify resource diffusion, uptake, yield, capacity, or local resource→growth mapping.
- Liquid-culture evidence is not automatically transport evidence for an agar/dish geometry.
- Missing spatial quantities remain explicit `unbound`; do not fill them with generic defaults.
- Product support is decided by the support matrix/scenario admission layer, not by existence of an environment evidence file.

## Current record

`mg1655_mops_chloramphenicol_greulich_2015_v1.json` preserves the exact Greulich MG1655 MOPS context and the decision that source-curve validation is supported while Petra's spatial resource→`lambda0` bridge remains unbound under #938.
