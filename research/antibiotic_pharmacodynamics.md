# Antibiotic Pharmacodynamics

## Why a binary kill threshold is wrong for PETRA

Antibiotic concentration and bacterial net growth/death are continuous relationships. PETRA should therefore use a source-backed pharmacodynamic curve instead of “above X = dead.”

## Regoes four-parameter function

Regoes et al. (2004) use a Hill/Emax-style pharmacodynamic function characterized by:

- `psi_max`: drug-free maximum net growth;
- `psi_min`: minimum net growth at high concentration;
- `zMIC`: concentration where the modeled net growth is zero;
- `kappa`: Hill coefficient.

DOI: `10.1128/AAC.48.10.3670-3676.2004`.

Reference form recorded for implementation review:

`psi(a) = psi_max - ((psi_max - psi_min) * (a/zMIC)^kappa) / ((a/zMIC)^kappa - psi_min/psi_max)`

The implementation must verify units and rate convention before combining with a local natural-log/biomass growth engine.

## Spatial drug field

Minimal spatial equation:

`dA/dt = D_A * Laplacian(A) - lambda_A*A + sources`

For an MVP, decay may be zero unless a calibrated scenario requires it.

## Resistance

Resistance modifies drug-response parameters (especially effective MIC / response position). It does **not** make cells generally immortal.

## UI language

Avoid labeling arbitrary slider values as clinical doses. The most defensible representation is concentration in the scenario's experimental units or normalized `× MIC`.

PETRA is an educational evolutionary simulator, not a treatment optimizer.
