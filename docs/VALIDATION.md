# Validation Plan

A scientific validation suite is a major differentiator between PETRA and a polished toy.

## Executable premerge entrypoint

Run:

```bash
python tools/verify.py premerge
```

That registry command is the canonical **local/manual** source-level premerge gate. With the TypeScript implementation substrate present it runs repository/provenance checks, strict TypeScript typechecking, and the deterministic Vitest suite. Under Petra's current hosted-CI freeze, agents and humans run this contract locally and record the evidence they actually observed.

A green source-test run is **not** browser, GPU, frame-time/device, or experimental validation. Record those evidence classes separately and only after they are actually measured.

## Numerical invariants

- same seed + same actions -> identical checkpoint hashes;
- no NaN/Inf;
- non-negative populations and concentrations;
- passive no-flux diffusion conserves total mass within tolerance;
- mutation events never exceed births;
- destructive stochastic events never exceed available cells.

## Growth tests

- high nutrient / no drug -> approximately exponential early growth;
- nutrient depletion slows growth;
- `S = K_s` -> Monod multiplier approximately 0.5;
- increasing local nutrient cannot decrease the Monod growth term;
- measured/curated relative-fitness ordering is preserved in a controlled resource-rich comparison;
- finite non-negative first-order death hazards never remove more than available pre-step biomass;
- continuous division-biomass flux is never mislabeled or implicitly rounded into integer mutation opportunities.

## Temperature tests

If enabled:

- maximum near source-defined optimum;
- near-zero growth at source-defined limits;
- suboptimal branch matches the chosen Ratkowsky/cardinal relation.

## Pharmacodynamic tests

- `A = 0` recovers untreated behavior;
- net growth decreases with concentration over calibrated range;
- reference curve crosses approximately zero near `zMIC`;
- high concentration asymptotes toward finite `psi_min`;
- resistant phenotype shifts the response rather than giving absolute immunity;
- zero drug produces zero incremental PD-derived loss;
- at the reference zMIC, the incremental loss equals the converted reference drug-free PD rate while the transferred PD response itself crosses zero;
- the spatial loss field follows the authoritative drug mask/concentration state and remains finite/non-negative;
- zero-resource + drug behavior is tested as a declared composition policy, not reported as stationary-phase calibration;
- the whole-model zero-growth concentration is not assumed to equal Regoes zMIC until the independent ecology baseline is calibrated.

## Mutation and selection tests

- mutation probability zero -> no new lineages;
- mutations arise from division events;
- changing drug concentration does not directly create mutations;
- replicate seeds show variable emergence timing;
- under selective conditions, resistant frequency can rise;
- without drug, a genotype with measured lower fitness loses in a controlled pairwise test.

## Spatial tests

- radially symmetric initial conditions remain statistically symmetric without asymmetric interventions;
- a drug band produces a spatial response only where concentration is present;
- nutrient gradients alter local growth;
- no-flux rim prevents field leakage.

## Competition tests

- identical strains remain symmetric on replicate average;
- resource sharing couples competitors even without pairwise “attack” terms.

## Phage tests

When enabled:

- no host -> decay/diffusion only;
- no phage -> normal host model;
- zero adsorption -> zero new infections;
- infection precedes lysis by the transit-chain delay;
- lysis releases burst phage.

## Literature validation

For curated scenarios, compare selected normalized trajectories/relationships against the relevant paper's submodel or qualitative result. Do not claim whole-system validation from one matching curve.

## Provenance test

The local/manual premerge gate should fail Science-Mode scenario validation if a required parameter has no value, unit, source, context or evidence tier.
