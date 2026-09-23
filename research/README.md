# PETRA Research Index

This directory is the scientific memory of the project. The rule is simple: **if the engine presents a behavior as biology, the scientific basis, context, approximation and provenance belong here.**

## Start here

- `RESEARCH_STATUS.md` — what is strong enough to implement now, what remains a transfer/calibration, and what still needs primary-source work.
- `PRIMARY_SOURCE_AUDIT.md` — directly checked papers for the flagship *E. coli* + ciprofloxacin scenario.
- `CLAIM_LEDGER.md` — compact contract for what PETRA may and may not claim.
- `REFERENCES.md` — working bibliography.
- `LITERATURE_MAP.md` — evidence map across mechanisms.

## Topic notes

- `growth_and_resources.md` — nutrient-limited growth and spatial colony biology.
- `antibiotic_pharmacodynamics.md` — concentration-dependent drug effect.
- `mutation_and_resistance.md` — mutation supply, resistance states, fitness and interpretation.
- `spatial_evolution.md` — spatial gradients and the MEGA-plate precedent.
- `stochastic_simulation.md` — Gillespie/tau-leap rationale and cohort modeling.
- `numerical_methods.md` — bounded stochastic events, diffusion stability, update-order and validation details.
- `persistence_tolerance.md` — inherited resistance vs reversible persistence/tolerance.
- `phage_extension.md` / `phage_host_state.md` — lytic phage model and host-physiology dependence.
- `horizontal_gene_transfer.md` — plasmid conjugation, cost and density/contact cautions.
- `competition_consumer_resource.md` — mechanistic competition before arbitrary pairwise coefficients.
- `temperature.md` / `environment_temperature_ph.md` — cardinal temperature and pH modeling.
- `collateral_sensitivity.md` — multiple-drug extension evidence.
- `machine_learning.md` — scientifically legitimate ML roles.
- `frontend_rendering.md` — current engineering evidence behind worker/rendering/accessibility choices.

## Evidence tiers

- **A:** direct experimental measurement / validated submodel for the stated context.
- **B:** established mechanism or model transferred across a nearby context with an explicit caveat.
- **C:** calibration/engineering approximation needed for tractability or presentation.
- **D:** hypothesis or visual abstraction; must not be presented as established biology.

## Research rule

For every enabled quantitative mechanism, record:
1. organism/strain/background;
2. medium/environment/assay;
3. value/range and units;
4. source;
5. how PETRA uses it;
6. transfer/calibration caveat;
7. validation target.

Missing evidence is not permission to invent a biological constant. A required engineering value may be chosen, but it must be labeled as such.
