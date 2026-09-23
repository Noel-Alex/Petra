# PETRA Scientific Specification

## Scope

The flagship scenario simulates a spatially structured *E. coli* population on a 2D agar-like dish with a limiting nutrient and spatial ciprofloxacin exposure. Populations can diversify into curated heritable resistance states through stochastic mutation.

The engine demonstrates biological principles. It does not predict arbitrary real cultures or clinical outcomes.

## State

For each grid site `i`:

### Environmental fields

- `S[i]`: limiting nutrient.
- `A[i]`: ciprofloxacin concentration.
- later: `P[i]` for phage.

### Lineage state

Each active lineage has:

- stable ID and parent ID;
- genotype label;
- MIC / drug response metadata;
- relative drug-free fitness;
- local density array;
- birth time and origin location;
- source/provenance keys.

## Resource-limited growth

`f_S(S) = S / (K_S + S)`

`mu_local = mu_max * f_S(S) * f_T(T) * fitness`

If a local crowding/packing term is required for numerical/physical reasons, it is an explicit coarse-graining approximation rather than the main explanation for stationary growth.

## Nutrient consumption

Growth consumes nutrient through a yield term:

`delta_S = -delta_biomass_growth / Y`

Growth must be capped if local nutrient is insufficient so the simulation cannot create biomass from missing substrate.

## Antibiotic pharmacodynamics

Use the Regoes et al. four-parameter Hill/Emax-style function or a mathematically verified equivalent.

Reference source: DOI `10.1128/AAC.48.10.3670-3676.2004`.

Implementation invariants:

- zero drug recovers untreated behavior;
- drug response is continuous;
- near `zMIC`, isolated reference net growth crosses approximately zero under the source convention;
- high drug approaches finite `psi_min`;
- a resistant genotype shifts response but is not universally invulnerable.

Because the Regoes reference parameters and Marcusson genotype data are from different experimental systems, combining them is a documented transfer approximation. The UI/source panel must disclose it.

## Mutation

Mutations are sampled from divisions:

`M_edge ~ Binomial(births_parent, p_edge)`

or a Poisson approximation for rare events.

A mutant child is subtracted from parent newborns and added to a child lineage.

No rule may increase mutation probability merely because a drug has been applied unless a separately researched stress-induced mutagenesis module is intentionally implemented.

## Curated genotype graph

MVP path:

- WT
- `gyrA S83L`
- `gyrA S83L + parC S80I`
- optional third-step/branch states after transition probabilities are audited.

MIC and fitness anchors come from Marcusson et al. 2009 where applicable.

## Diffusion

For each scalar field `F`:

`dF/dt = D * Laplacian(F) - decay*F + source`

Use a five-point stencil and no-flux dish boundary.

Explicit diffusion must obey a stability-safe substep. Clamping negative values is only a last guard, not the stability method.

## Population spread

Use effective nearest-neighbor dispersal / colony-front expansion for the MVP. This is a coarse-grained spatial process, not literal Brownian motion of rods.

## Competition

Multiple lineages/strains consume the same local nutrient. Pure exploitative competition emerges from shared-resource depletion rather than arbitrary pairwise damage.

## Reproducibility

Every run stores:

- scenario and parameter-registry version;
- engine version/commit;
- random seed;
- initial state;
- intervention events with simulated timestamps.

Same version + seed + action timeline must reproduce the trajectory.

## Science-mode rule

A parameter cannot be presented as validated unless its record contains value, units, source, organism/strain, experimental context and confidence tier.
