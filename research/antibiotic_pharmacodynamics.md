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

## Resource × drug composition boundary

The Regoes curve is a **net** population response in its source context, while Petra separately models resource-limited positive division. To avoid double-counting the drug-free baseline, the flagship composition uses only the drug-associated decrement from the reference state:

`delta_drug,g(a) = ln(10) * [psi_g(a) - psi_max]`

and supplies the non-negative loss hazard

`h_drug,g(a) = ln(10) * [psi_max - psi_g(a)]`

to the ecology loss channel.

This is a Petra **transferred mechanistic composition rule**, not an additional measured ciprofloxacin parameter. The MIC-shifted `psi_g` still combines Regoes CAB1/LB shape with Marcusson MG1655 MICs. The resource-limited growth baseline remains separately provenance-owned; do not assume its `mu_max` equals the Regoes drug-free slope unless that seam is explicitly calibrated.

At zero concentration the incremental loss is exactly zero. Under zero resource the current composition can still apply PD-derived loss, but that behavior is a declared modeling choice and must not be presented as quantitatively validated stationary-phase fluoroquinolone action.

## Spatial drug field

Minimal spatial equation:

`dA/dt = D_A * Laplacian(A) - lambda_A*A + sources`

For an MVP, decay may be zero unless a calibrated scenario requires it.

## Resistance

Resistance modifies drug-response parameters (especially effective MIC / response position). It does **not** make cells generally immortal.

## UI language

Avoid labeling arbitrary slider values as clinical doses. The most defensible representation is concentration in the scenario's experimental units or normalized `× MIC`.

PETRA is an educational evolutionary simulator, not a treatment optimizer.
