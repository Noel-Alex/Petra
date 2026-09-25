# Fungal evidence data contract

## Purpose

This directory contains machine-readable **source evidence and validation targets** for named fungal systems. It does not itself enable a fungus in Petra simulation state.

## Authority

- `aspergillus_niger_no10_surface_agar_1997_v1.json` is the canonical machine-readable curation of the Larralde-Corona et al. 1997 *Aspergillus niger* var. *hennebergi* no. 10 agar-surface tables used by #885.
- Values marked `measured` preserve source table/context. Values marked `derived_source_model` reproduce an equation or fit reported by the source.
- Favela-Torres et al. 1998 cross-format evidence is a refusal boundary: agar-surface, submerged and solid-state kinetics must not be pooled into one universal fungal constant.

## Scientific boundaries

- Keep lawn-inoculation biomass/germ-tube evidence distinct from point-inoculation colony-front evidence.
- Do not relabel Petra's existing dimensionless `model-resource` as glucose.
- This evidence does not define a local glucose diffusion, uptake, yield or depletion law.
- Do not interpolate between source glucose rows and call the result measured. A fitted/interpolated runtime model must carry separate calibrated/engineering provenance.
- The explicit 35 °C value in the curated source context belongs to spore production; it is not a validated surface-growth temperature response.
- Filamentous/hyphal morphology does not imply a sourced stochastic branch probability, branch-angle law or anastomosis rate.
- Ciprofloxacin has no fungal-effect authority from these records.
- Renderer mass merging is presentation-only and is not biological hyphal fusion.

## Verification

Every numeric source-table row must retain its units, glucose condition, inoculation context, DOI/source key and uncertainty qualifier where reported. Missing source values stay null rather than being interpolated or guessed.
