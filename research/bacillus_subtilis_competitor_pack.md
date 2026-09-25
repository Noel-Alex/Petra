# Bacillus subtilis 168 sigE− competitor evidence pack

## Status

**Selected first bacterial competitor:** *Bacillus subtilis* 168 `trp+ sigE-`.

**Research flag:** OFF for candidate selection and first shared-resource mechanism choice.

This pack does not bind Petra's current dimensionless `model-resource` or
`model-biomass` to physical glucose, cell dry weight, CFU, or cell count.
Physical resource/biomass binding remains a separate scenario-calibration
problem.

## Why this is the first competitor

Petra's first multi-species extension should exercise a real second bacterial
identity without requiring an unsupported direct-interaction coefficient.

The selected strain is useful because:

- it is a named, genetically specified laboratory derivative of
  *B. subtilis* 168;
- Tännler, Decasper & Sauer measured its growth physiology in one internally
  consistent glucose-minimal, 37 °C experiment;
- `sigE-` blocks progression into later sporulation while avoiding the broad
  pleiotropic carbon-metabolism change observed for a `spo0A-` strain in the
  same source;
- it therefore removes a major model mismatch that would arise if Petra used
  wild-type *B. subtilis* under starvation while owning no spore/developmental
  state;
- the first interaction can remain the already-reviewed shared-resource +
  local-capacity competition mechanism.

This is a deliberate laboratory-model competitor. It must not be presented as
a general model of wild-type *B. subtilis* ecology.

## Primary source

Tännler S, Decasper S, Sauer U. Maintenance metabolism and carbon fluxes in
*Bacillus* species. *Microbial Cell Factories* 7, 19 (2008).

DOI: `10.1186/1475-2859-7-19`

### Source strain and growth context

The source identifies:

- *B. subtilis* 168, cured of tryptophan auxotrophy: `trp+`;
- an otherwise-isogenic sporulation mutant: `trp+ sigE-`;
- M9 minimal medium;
- glucose as the carbon source;
- aerobic cultivation;
- 37 °C;
- batch cultures in baffled shake flasks for the physiological table.

The paper uses the `sigE` mutant specifically as the downstream sporulation
block control. It states that the `sigE` mutation is phenotypically silent
under the reported unrestricted glucose-growth condition, unlike the
`spo0A` mutant, which shows increased glucose use and acetate overflow.

### Measured batch physiology for B. subtilis 168 trp+ sigE−

| Quantity | Reported value | Petra classification |
| --- | ---: | --- |
| Specific growth rate | `0.67 ± 0.01 h^-1` | measured, source-context target |
| Biomass yield | `0.48 ± 0.06 gCDW/g glucose` | measured physical yield |
| Glucose consumption rate | `7.90 ± 0.74 mmol gCDW^-1 h^-1` | measured |
| Acetate production rate | `3.60 ± 0.08 mmol gCDW^-1 h^-1` | measured |

The reported error for Table 2 values is standard deviation from at least two
independent experiments.

The same paper reports a `sigE-` glucose-limited maintenance coefficient of
`0.33 ± 0.09 mmol gCDW^-1 h^-1` from weighted least-squares regression.
Petra does not currently own a maintenance-metabolism mechanism, so this value
is evidence/context rather than a simulator parameter.

## E. coli comparison target

For the first cross-species calibration reference, use:

LaCroix RA et al. Use of Adaptive Laboratory Evolution To Discover Key
Mutations Enabling Rapid Growth of *Escherichia coli* K-12 MG1655 on Glucose
Minimal Medium. *Applied and Environmental Microbiology* (2015).

DOI: `10.1128/AEM.02246-14`

The source reports wild-type K-12 MG1655:

- population growth rate: `0.69 ± 0.02 h^-1`;
- glucose uptake rate: `8.59 ± 1.42 mmol gDW^-1 h^-1`;
- acetate production rate: `3.91 ± 1.14 mmol gDW^-1 h^-1`;
- biomass yield: `0.44 ± 0.07 gDW/g glucose`.

These E. coli and Bacillus measurements come from separate studies. Their
similar values make them useful calibration/consistency targets, but they are
**not** a directly measured co-culture competition experiment and must not be
converted into a measured pairwise interaction coefficient.


## Presentation-only morphology evidence

Petra may use a **coarse rod-shaped representative silhouette** for the exact
selected `B. subtilis` 168 `trp+ sigE-` pack, but this is a transferred
presentation claim rather than a simulator parameter.

Juillot et al. 2021 (DOI `10.1128/mSystems.01017-21`) directly studies the
parental strain-168 background during exponential growth and treats/observes
wild-type `B. subtilis` as a rod-shaped model using microscopy. Tännler,
Decasper & Sauer 2008 (DOI `10.1186/1475-2859-7-19`) supplies the exact
selected `168 trp+ sigE-` physiology identity and reports `sigE-` as
phenotypically silent under its unrestricted glucose-growth condition while
blocking later sporulation. Together these records support transferring only
the **coarse `bacterium + rod` silhouette class** to the selected pack.

The transfer does **not** authorize physical cell length/width/aspect ratio,
chain length, orientation or division dynamics, one-glyph-per-cell identity or
counts, motility, colony shape, sporulation morphology, or any simulation
parameter. Exact runtime use must still resolve through the presentation
catalog's biological `taxonId + contentVersion` join; taxon names or
`microbialGroup` alone are never morphology authority.

## Petra mechanism mapping

### Authorized first interaction

The first implementation uses only:

1. shared local resource depletion;
2. order-independent resource allocation;
3. shared local carrying/capacity constraint;
4. existing coarse conservative colony-front spread;
5. distinct authoritative organism identity.

No direct attack, toxin, cooperation bonus, cross-feeding, contact killing, or
quorum mechanism is implied.

### Values that are not legal drop-in constants

Petra's current flagship resource profile is explicitly
`model-resource` / `model-biomass`, not physical glucose / gCDW.

Therefore:

- `0.67 h^-1` is a measured source target for a future compatible physical
  glucose scenario. It is not automatically the current engineering
  `GrowthParameters.maxDivisionRate`.
- `0.48 gCDW/g glucose` is a measured physical yield. It must not be assigned
  directly to the dimensionless `GrowthParameters.biomassYield` and labelled
  measured.
- Tännler 2008 does not establish a source-compatible Monod half-saturation
  constant for Petra. `halfSaturation` remains unbound for a physical pack.
- `localCapacity` remains calibrated/engineering unless a spatially
  compatible source and unit mapping are selected.
- `spreadRate` remains the existing calibrated/engineering coarse
  colony-front approximation; it is not motility.
- baseline non-drug death hazard is not supplied by this evidence pack.
- physical cell count / cell-equivalent scale is not supplied by this pack.

A runnable first two-species scenario may use a versioned
**calibrated/engineering execution profile** with the source quantities as
validation targets. It must preserve the model-unit limitation in scenario
provenance.

## Unsupported mechanisms

The following remain OFF/fail-closed until separately sourced:

- wild-type Bacillus sporulation and germination;
- Bacillus antibiotic susceptibility, including ciprofloxacin;
- Bacillus resistance mutation/evolution graph;
- direct E. coli↔Bacillus antagonism;
- metabolite cross-feeding;
- acetate toxicity or acetate as a second authoritative resource;
- biofilm matrix production;
- motility, swarming, or chemotaxis;
- physical cell size/orientation dynamics;
- physical glucose diffusion/agar concentration claims;
- stationary-phase physiology beyond the current coarse resource ecology.

## Candidate rejection notes

### Wild-type B. subtilis 168

Rejected as the first executable competitor because nutrient limitation can
activate sporulation while Petra currently has no authoritative spore state.
Suppressing that biology silently would create a misleading model.

### B. subtilis 168 spo0A−

Rejected for the first pack. Tännler 2008 reports that the `spo0A` mutant has
higher glucose consumption and acetate production with lower biomass yield,
consistent with broad pleiotropic effects. It is not a clean way to remove only
the unsupported sporulation behavior.

### B. licheniformis T380B

The same source reports usable growth physiology and a sporulation-deficient
phenotype, but T380B is a classically mutagenized industrial descendant rather
than a simple named causal genotype. That makes its first-pass biological
identity less transparent than 168 `sigE-`.

Other species remain valid future candidates after their own named packs.

## Validation contract

A future implementation should include:

- isolated *E. coli* control;
- isolated *B. subtilis* control;
- zero-resource → zero new biomass;
- order-independent shared-resource allocation;
- identical-trait symmetry fixture independent of species names;
- resource and biomass accounting across mixed channels;
- deterministic checkpoint/restore/replay;
- exact organism identity preserved independently of lineage/genotype identity;
- unsupported Bacillus drug/evolution commands visibly refused;
- compact calibration evidence reporting the distance from source-isolated
  growth/yield targets rather than judging quality by visual colony size.

If a future scenario binds physical glucose/gCDW units, validation may directly
target the measured `0.67 ± 0.01 h^-1` growth and
`0.48 ± 0.06 gCDW/g glucose` yield in a compatible context. Until then, those
values remain provenance-bearing calibration targets, not dimensionless
simulation constants.

## Implementation owner

GitHub issue #890 owns the first authoritative E. coli MG1655 +
*B. subtilis* 168 `sigE-` shared-resource scenario.

Direct sourced interaction mechanisms remain under #647, and per-lineage
presentation morphology for mixed-species rendering remains under #866.
