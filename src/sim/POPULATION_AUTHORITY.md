# Discrete population / event authority

## Purpose

Petra keeps resource-limited ecology as **continuous model biomass**. Some downstream mechanisms, however, require discrete biological opportunities:

- evolution samples mutation outcomes from integer division opportunities;
- phage infection allocates adsorbed PFU against an integer susceptible-host pool;
- lysis/removal must consume whole host opportunities exactly once.

`populationAuthority.ts` is the shared numerical boundary between those two representations. It is simulation authority, not renderer state.

## Versioned policy

The first policy is `petra-population-authority/fractional-carry-v1`.

Its classification is **numerical-policy**. It is not a measured biological law.

The policy requires one explicit `CellEquivalentCalibration`:

- `modelBiomassPerCellEquivalent > 0`;
- canonical calibration id;
- evidence class `transferred | calibrated | engineering`;
- source keys for non-engineering values;
- a non-empty limitation.

There is no default conversion. #139's phage spatial-unit bridge can project its exact biomass-per-cell parameter into this shared calibration through
`cellEquivalentCalibrationFromPhageSpatialUnitBridge(...)`.

The composed runtime therefore requires `populationAuthority` to be either one explicit `{calibration, policy}` record or explicit `null`. The bundled flagship currently uses `null`: no scenario-owned biomass↔cell-equivalent calibration has been curated, so standing-host/division-event authority is not silently invented for that scenario.

## Standing host authority

For every authoritative lineage × simulation cell, committed continuous biomass is decomposed as:

`cellEquivalents = integerStandingHosts + standingResidual`

where:

- `integerStandingHosts = floor(cellEquivalents)`;
- `standingResidual ∈ [0, 1)`.

The floor is not a convenience call made by downstream features. It is the explicit, versioned v1 discretization policy and the residual is retained as checkpoint-critical authority.

Standing counts are recomputed only when a new authoritative continuous state is committed. Re-reading one state does not consume or create hosts. Spatial redistribution therefore changes local standing counts through the committed continuous state without being misclassified as division.

## Division-event authority

Mutation opportunity supply is intentionally separate from standing population.

For each lineage × cell:

`accumulated = priorDivisionResidual + divisionBiomass / modelBiomassPerCellEquivalent`

The emitted integer division opportunities are the whole-cell-equivalent part of that accumulated value; the fractional remainder is persisted to the next step.

Consequences:

- repeated fractional growth is not silently lost;
- death and spread cannot become fake mutation opportunities;
- zero division flux emits zero opportunity;
- the exact opportunity sequence is deterministic for the same flux/state/config history;
- mutation samplers receive integers and never round `divisionBiomass` themselves.

No RNG is used by v1 discretization. If a future stochastic discretization is introduced, its policy id, RNG draw order, transactional semantics, and checkpoint state require a new version.

## Explicit host removal

`planDiscreteHostRemoval(...)` is for whole-host removal such as an eventual lysis commit.

It:

1. rejects any removal larger than the authoritative standing count;
2. decrements the discrete count exactly once;
3. returns the exact continuous model-biomass decrement:
   `removedHosts × modelBiomassPerCellEquivalent`;
4. leaves fractional residual and division-event residual untouched.

The caller must apply the returned biomass decrement to the same authoritative lineage/cell channel **in the same higher-level transaction**. Publishing only one side is invalid.

Productive infection is not a removal: an infected host remains biological biomass. Phage composition must separately track infected/non-susceptible host authority and derive susceptible opportunities from total standing host authority without double-counting.

## Replay / checkpoint contract

`DiscretePopulationAuthorityState` persists:

- schema version;
- exact configuration identity;
- monotone safe-integer revision;
- dimensions + ordered lineage ids;
- per-lineage/per-cell standing host counts;
- standing fractional residuals;
- division-opportunity fractional residuals.

Restore validates all containers/counts/residuals and verifies:

`standingHostCount + standingResidual == currentBiomass / scale`

within the repository's deterministic floating comparison tolerance.

Malformed counts, residuals, lineage order, mask use, biomass mismatch, or calibration/policy mismatch fail closed before state is returned.

The full `discretePopulationConfigurationIdentity(...)` is replay-critical for the **static** population authority only: grid geometry/mask, cell-equivalent calibration, and discretization policy. Ordered lineage membership is checkpoint state, not static configuration identity, so a mutation-created lineage does not rewrite the run's calibration/policy identity. `DiscretePopulationAuthorityState.lineageIds` remains exact ordered replay authority and is validated independently against the caller's current lineage channels.

`extendDiscretePopulationAuthorityLineages(...)` is the append-only channel-expansion primitive for higher-level evolution composition. Existing lineage order must remain an exact prefix; standing authority is recomputed from the newly committed continuous biomass, prior division residuals are preserved for existing channels, and newly created lineage channels start with zero historical division residual. Static authority drift, reordering, or removal fails closed.

Protocol v7 / composed-state v5 bind the static population identity into `composedConfigurationFingerprint(...)` whenever `ComposedSimulationConfig.populationAuthority` is enabled, and checkpoint the full discrete state beside continuous ecology state. `validateComposedStateAgainstConfig(...)` revalidates standing count/residual consistency against the exact committed lineage biomass on direct continuation and restore. `stepComposedStateDetailed(...)` advances residual/count authority from the ecology kernel's spatial division-flux ledger only after the continuous ecology transition succeeds, then publishes continuous and discrete state together; a refusal publishes neither. `stepComposedState(...)` remains the compatibility metrics wrapper.

## Authority boundaries

- No React, Pixi, glyph count, renderer density, CSS pixel, or visual LOD may provide host/division counts.
- Do not rewrite ecology into integers. Continuous biomass remains the mechanistic growth substrate.
- Do not independently `round`, `floor`, or `ceil` biomass inside evolution or phage.
- Downstream mutation and infection policies consume the integer outputs from this shared seam.
- A cell-equivalent calibration is an explicit scenario/calibration assumption, not an inferred universal bacterial mass.

## Verification

Focused deterministic fixtures cover:

- zero opportunity;
- fractional carry across repeated steps;
- exact integer boundary;
- typed ecology flux channels;
- spatial standing-count redistribution without fake divisions;
- bounded whole-host removal and double-removal refusal;
- restore/corruption/config mismatch;
- off-mask rejection;
- direct handoff into mutation and productive-infection integer APIs.
