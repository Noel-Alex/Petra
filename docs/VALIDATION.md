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
- composed protocol-v6/state-v4 authority refuses non-zero ciprofloxacin exposure without explicit supported PD/MIC authority, refuses missing active-genotype MICs, and refuses off-mask concentration;
- changing the **initial** ciprofloxacin landscape or PD/MIC authority changes the composed configuration fingerprint, while accepted intervention commands mutate only checkpoint state and remain reproducible through command/checkpoint history;
- global/radial/stripe/paint ciprofloxacin commands preserve the exact composed mask, validate dense normalized geometry and finite Float32-representable `mg/L`, apply transactionally, increment accepted command position without advancing biological time, and are replay/export complete;
- a refused intervention is an exact replay no-op: checkpoint drug state, biomass/resource state, metrics, tick/time, command count, and event history remain unchanged;
- a non-zero current checkpoint landscape produces additional authoritative ecology death flux through the existing genotype-specific spatial PD composition;
- intervention geometry alone is not evidence for calibrated ciprofloxacin diffusion, decay, clearance, or physical delivery equivalence;
- zero-resource + drug behavior is tested as a declared composition policy, not reported as stationary-phase calibration;
- the whole-model zero-growth concentration is not assumed to equal Regoes zMIC until the independent ecology baseline is calibrated.

## Discrete population/event authority tests

- composed config requires either one explicit validated cell-equivalent calibration/policy or explicit `null`; omission is rejected and the bundled flagship remains `null` while no scenario-owned calibration exists;
- enabling population authority changes the composed configuration fingerprint and creates checkpointed standing-host, standing-residual, and division-residual state; disabling it permits no hidden discrete state;
- standing counts/residuals are validated against the exact committed continuous lineage biomass on direct continuation and checkpoint restore;
- per-lineage/per-cell division opportunities derive only from the ecology division-flux ledger plus prior division residual; death, spread, and net biomass change cannot manufacture mutation opportunities;
- repeated fractional division flux carries deterministically across steps and checkpoint restore reproduces the same future opportunity sequence;
- a discrete-authority refusal after ecology calculation publishes neither the continuous ecology transition nor the discrete count/residual transition;
- Worker protocol promotion rejects malformed/fractional counts, invalid residuals, lineage/dimension drift, and off-mask discrete state before snapshots become typed authority;
- experiment bundle v2 round-trips protocol-v6/state-v4 population checkpoint residuals under exact runtime compatibility; no migration from older protocol/state artifacts is implied.

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
