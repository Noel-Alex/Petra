# Ecology simulation DOX contract

## Purpose
`src/sim/ecology/` owns deterministic resource-limited continuous biomass fluxes, caller-supplied loss hazards, and coarse colony-front spread.

## Authority contracts
- Lineage channels are aggregate continuous biomass/density unless a higher layer explicitly defines a different population unit.
- `divisionBiomass` is a continuous growth flux, **not** an integer division-event count. Never pass it directly to the exact mutation sampler or silently round it into births.
- Relative-fitness multipliers, Monod parameters, yield, capacity, spread, and death hazards are scenario/composition inputs. Do not add hidden E. coli or antibiotic defaults here.
- `executionProfile.ts` is the strict model-unit bridge for explicit engineering ecology profiles. It rejects unknown fields/physical-unit relabeling, enforces the spread-step stability bound, preserves profile/scenario/resource-context identity, and projects only caller-selected kernel inputs. It is not a source of hidden defaults and does not upgrade engineering values into biological evidence.
- `calibration.ts` is a bounded fitting contract for those explicit engineering profiles, not a source of biological truth. Every run must bind the exact source-profile identity, dataset identity, model-unit/dimensionless targets with context, fit-vs-validation roles, parameter bounds/candidate values, an explicit candidate budget, and an acceptance loss. It evaluates only through a caller-supplied mechanistic forward model; held-out validation loss is reported but never used to select the training-loss minimum. A returned `calibrated` value record is provenance for the explicit fit only, does not mutate science records, and cannot promote model-resource/model-biomass values into physical Science-Mode parameters.
- A death hazard is a mechanism-owned first-order loss input. This subtree must not infer ciprofloxacin killing from concentration; the pharmacodynamic composition layer owns that derivation.
- Shared resource/capacity allocation must remain independent of lineage iteration order.
- `localCapacity` is a hard scientific-state invariant, not only a growth/spread limiter. `capacity.ts` owns the shared numerical validity rule: materially over-capacity in-mask biomass is rejected rather than clipped, while one IEEE-754 binary32 relative spacing (plus the minimum-subnormal envelope) is allowed solely for Float32 storage/round-trip representation. That tolerance is engineering/numerical, never biological slack.
- `stepEcology()` must preflight the entire scientific domain before its first mutation. The raw dish mask is authoritative and must contain only exact `0 | 1` bytes; resource and every lineage-biomass channel must be exactly zero where `mask === 0`. In-mask values remain finite/non-negative. Malformed caller state fails atomically: no partial resource consumption, hidden off-mask science, or lineage change is allowed on validation failure.
- Growth and death fluxes are computed from the same pre-step biomass. Same-step deaths do not create new capacity until the next ecology step. Changing that operator order is a numerical/model change requiring tests and replay/version review.
- The current ecology tick is deliberately fixed-step. `stepEcology()` refuses `spreadRate * dt > 0.25`, which is the conservative four-neighbour explicit spread bound; first-order loss uses exact exponential survival `1 - exp(-h dt)` and therefore does not need a linearized event-probability cap. Any future stochastic event/tau-leap integration needs its own versioned probability/substep policy before it can share this tick.
- Coarse spread is an effective colony-front approximation, not literal single-cell motility.
- No renderer/UI state may feed back into ecology authority.

## Provenance
Biological rates and relative fitness require source/provenance at scenario composition time. Capacity/spread may be calibrated or engineering values but must remain labeled. Unbound flagship parameters must stay visibly unbound rather than receiving convenient source-looking constants.

## Verification
Run `python tools/verify.py premerge`. Ecology tests must cover Monod identities, resource/yield/capacity limits, materially over-capacity refusal, Float32 capacity-boundary round trips, lineage-order independence, nutrient-depletion slowdown, relative-fitness scaling, bounded death, spatial death fields, finite/non-negative state, exact binary-mask/off-mask domain invariants, atomic malformed-state rejection, exact spread-step boundary/refusal, and spread conservation.

## Child DOX index
No child contracts yet.
