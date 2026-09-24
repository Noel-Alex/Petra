# Parameter provenance and evidence policy

## Why this exists
Combining real papers can still create fake precision. Petra therefore treats provenance as runtime data, not a bibliography added after implementation.

## Required parameter metadata
Every simulation-authority parameter should carry, where applicable:
- stable key and version;
- value/range/distribution;
- units;
- mechanism/model;
- organism, strain/background;
- medium/substrate;
- temperature/pH/oxygen state;
- assay/endpoint;
- source DOI/URL/table/figure;
- evidence class: measured / derived / transferred / approximation / engineering;
- uncertainty/confidence;
- transformation used by Petra;
- compatibility group;
- notes/limitations.

## Compatibility rule
Values from different assays are not automatically interoperable. Example: an MIC measured in Marcusson and an MIC measured in Huseby remain separate records even if the genotype label matches. The scenario explicitly selects one.

## Cross-study composition
A composed model can use multiple papers, but every seam must be declared. Flagship seam:
- Regoes: CAB1/LB pharmacodynamic curve;
- Marcusson: MG1655 genotype MIC/fitness;
- Huseby: mutation supply/evolutionary path;
- Shao/Baym: spatial mechanism/qualitative targets.

The combined model is therefore **mechanistically grounded but not one experimentally calibrated system**.

### Versioned resource × drug policy

For the flagship research scenario, the active composition policy is
`reference_pd_decrement_as_first_order_loss_v1`. It maps the MIC-shifted Regoes
decrement relative to the source drug-free state into an ecology first-order loss
hazard:

`h_drug = ln(10) * (psi_max - psi_g(a))`.

This policy is **transferred/mechanistic**, not a newly measured parameter.
Its ID, classification, equation, zero-drug invariant, and stationary-phase
calibration limitation are stored in the scenario preset so the future inspector
can display the seam directly. Regoes `psi_max` and Petra's separately
provenance-owned Monod `mu_max` must not be silently treated as the same value.

## Engineering parameters
Grid resolution, display scale, LOD thresholds, normalized diffusion CFL coefficients, and visual particle counts can be engineering parameters. They must be kept separate from physical measurements and must not be shown in the UI as “real bacterial constants.”

## Uncertainty
Where papers provide uncertainty, preserve it. Petra can later support ensemble runs that sample parameter distributions. A single pretty run must not imply certainty.

## Science-mode gate
A module can be enabled as a curated Science Mode preset when:
1. mechanism has primary literature support;
2. decisive parameters have provenance or are transparently calibrated;
3. cross-study transfers are listed;
4. at least one qualitative/quantitative validation target exists;
5. limitations are visible in the UI.

Otherwise label it experimental/sandbox.
