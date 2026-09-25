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

## Exact-MG1655 response-shape evidence

Issue #632 found two complementary exact-background evidence sets that support a shared response structure with a genotype-specific potency/concentration shift rather than separate response-shape parameters.

Khan et al. (2015), DOI `10.1093/jac/dkv233`, modeled viable-count ciprofloxacin time-kill data for MG1655 WT plus six isogenic resistance mutants. A common multi-state PKPD structure fit all strains while antibacterial potency (`EC50`) varied by strain; mutant-specific `EC50` was highly correlated with measured MIC (`r^2 = 0.99`). Nielsen et al. (2017), DOI `10.1093/jac/dkx269`, externally predicted additional MG1655-derived mutants from MIC alone in MHII time-kill experiments.

Das et al. (2020), DOI `10.7554/eLife.55155`, independently measured MG1655 growth-rate dose-response curves across the exact five resistance loci used by Petra. After rescaling by each strain's null fitness and `IC50`, WT, all five singles and eight doubles collapsed onto a common normalized inhibition shape.

These sources strengthen the **shared-shape / potency-shift concept**, but they do not make Petra's current curve a direct MG1655 measurement. Khan/Nielsen use a different multi-state MHII PKPD model, while Das measures growth inhibition rather than viable-count killing. Petra therefore keeps the Regoes CAB1 curve + Marcusson MG1655 MIC composition explicitly transferred and does not invent genotype-specific `psi_min` or `kappa`. See `ciprofloxacin_mg1655_response_scaling.md`.

## Spatial drug field

Minimal spatial equation:

`dA/dt = D_A * Laplacian(A) - lambda_A*A + sources`

For an MVP, decay may be zero unless a calibrated scenario requires it.

### Current composed-runtime authority boundary

Protocol-v6 / composed-state-v4 runs carry the **current** full-grid
ciprofloxacin landscape in `mg/L` as replay-critical checkpoint state. The
configuration still binds the initial landscape plus the supported source-backed
PD/MIC authority. Current concentrations must remain finite/non-negative and
exactly zero outside the dish mask. Composed stepping reuses the reviewed
spatial loss composition to derive genotype-specific loss hazards from the
checkpoint concentration array.

The typed `apply-ciprofloxacin` command may set or add `mg/L` concentration
using validated global, radial, stripe, or paint geometry. Command acceptance is
recorded at the exact current biological time and does not itself advance the
simulation clock. This is an implementation of the existing Regoes + Marcusson
transfer policy, not new biological evidence.

Critically, this command changes the authoritative concentration **landscape**;
it does not add or validate concentration transport. Petra still has no
source-calibrated ciprofloxacin diffusion coefficient, decay/clearance process,
plate-medium mapping, or claim that command geometry reproduces physical drug
delivery. The bundled flagship begins at exactly zero exposure. A later
transport mechanism must be separately calibrated/versioned rather than being
implied by the existence of mutable intervention state.

## Resistance

Resistance modifies drug-response parameters (especially effective MIC / response position). It does **not** make cells generally immortal.

## UI language

Avoid labeling arbitrary slider values as clinical doses. The most defensible representation is concentration in the scenario's experimental units or normalized `× MIC`.

PETRA is an educational evolutionary simulator, not a treatment optimizer.
