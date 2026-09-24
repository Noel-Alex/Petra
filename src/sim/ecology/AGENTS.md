# Ecology simulation DOX contract

## Purpose
`src/sim/ecology/` owns deterministic resource-limited continuous biomass fluxes, caller-supplied loss hazards, and coarse colony-front spread.

## Authority contracts
- Lineage channels are aggregate continuous biomass/density unless a higher layer explicitly defines a different population unit.
- `divisionBiomass` is a continuous growth flux, **not** an integer division-event count. Never pass it directly to the exact mutation sampler or silently round it into births.
- Relative-fitness multipliers, Monod parameters, yield, capacity, spread, and death hazards are scenario/composition inputs. Do not add hidden E. coli or antibiotic defaults here.
- A death hazard is a mechanism-owned first-order loss input. This subtree must not infer ciprofloxacin killing from concentration; the pharmacodynamic composition layer owns that derivation.
- Shared resource/capacity allocation must remain independent of lineage iteration order.
- `stepEcology()` must preflight all in-mask resource/biomass values before its first mutation. Malformed caller state fails atomically: no partial resource consumption or lineage change is allowed on validation failure.
- Growth and death fluxes are computed from the same pre-step biomass. Same-step deaths do not create new capacity until the next ecology step. Changing that operator order is a numerical/model change requiring tests and replay/version review.
- Coarse spread is an effective colony-front approximation, not literal single-cell motility.
- No renderer/UI state may feed back into ecology authority.

## Provenance
Biological rates and relative fitness require source/provenance at scenario composition time. Capacity/spread may be calibrated or engineering values but must remain labeled. Unbound flagship parameters must stay visibly unbound rather than receiving convenient source-looking constants.

## Verification
Run `python tools/verify.py premerge`. Ecology tests must cover Monod identities, resource/yield/capacity limits, lineage-order independence, nutrient-depletion slowdown, relative-fitness scaling, bounded death, spatial death fields, finite/non-negative state, atomic malformed-state rejection, and spread conservation.

## Child DOX index
No child contracts yet.
