# Chloramphenicol / MG1655 first post-ciprofloxacin drug pack

Issue: #874  
Status: **candidate/model selection complete; implementation contract ready; product enablement still context-gated**  
Primary quantitative PD source: Greulich et al. 2015, DOI `10.15252/MSB.20145949`  
Resistance-identity source: Graf et al. 2024, DOI `10.1038/s41467-024-53391-2`

## Decision

Petra's first post-ciprofloxacin antibiotic pack should be **chloramphenicol acting on
Escherichia coli K-12 MG1655**.

This choice is not permission to reuse the ciprofloxacin/Regoes loss curve. The source-backed
chloramphenicol mechanism is a **growth-inhibition / ribosome-transport-and-binding** model.
Its authoritative output is a reduction of the drug-free growth rate. This pack does not
establish a chloramphenicol-induced first-order death hazard.

The current flagship remains an engineering `model-resource` ecology with no physical
medium/resource binding. Therefore this pack is ready for a versioned numerical authority
and source-curve validation, but it must remain **not product-selectable as grounded
Science Mode** until a scenario binds a compatible growth/medium context. A UI card may
not silently treat the current dimensionless resource field as glucose or glycerol.

## Why chloramphenicol first

Greulich et al. directly measure MG1655 growth-inhibition curves for four ribosome-targeting
antibiotics across nutrient conditions and fit one mechanistic family.

- Chloramphenicol and tetracycline are in the reversible-binding/transport regime and the
  full model fits them quantitatively well.
- Streptomycin and kanamycin are in the irreversible regime; the same paper reports only
  qualitative rather than good quantitative agreement for those drugs and predicts a
  threshold/bistable regime that needs additional execution semantics.
- Tetracycline remains a valid future candidate, but the source explicitly calls out
  degradation/handling precautions, while chloramphenicol also has a clean modern MG1655
  genotype-to-resistance companion source (Graf et al. 2024).

The choice therefore minimizes new model families without pretending all antibiotics share
one PD equation.

## Quantitative source context

Greulich et al. use:

- organism/background: *E. coli* K-12 MG1655;
- temperature: **37 °C**;
- vessel: 3 mL culture in 20-mm tubes, 250 rpm;
- medium family: modified Neidhardt potassium-MOPS defined medium;
- carbon-source baselines:
  - glycerol **0.2% v/v**;
  - glucose **0.2% w/v**;
- richer conditions: the same base media plus casamino acids, or nucleotides + all amino
  acids, to alter the drug-free growth rate;
- growth readout: OD600 exponential growth rate, with viability corroborated by plating;
- adaptation: at least three drug-free exponential generations before transfer, then four
  generations of adapted exponential growth under antibiotic before rate measurement.

These details are part of the applicability envelope, not decorative citation metadata.

## Full source-backed response model

Let

- `lambda0 > 0` be the measured/calibrated **drug-free exponential growth rate** in h^-1
  for the source-compatible environmental condition;
- `lambda` be growth under chloramphenicol;
- `x = lambda / lambda0`;
- `a_ex >= 0` be extracellular chloramphenicol concentration in **µM**;
- `lambda0_star` be the fitted reversibility-rate scale in h^-1;
- `IC50_star` be the fitted concentration scale in µM.

Greulich et al. equation 7 gives the steady-state cubic

```text
0 =
  x^3
  - x^2
  + x * [
      0.25 * (lambda0_star / lambda0)^2
      + (a_ex / (2 * IC50_star)) * (lambda0_star / lambda0)
    ]
  - 0.25 * (lambda0_star / lambda0)^2
```

The two fitted parameter combinations are source-derived fit estimates, not raw physical
constants:

| Carbon-source family | lambda0_star (h^-1) | IC50_star (µM) |
|---|---:|---:|
| glycerol | 1.83 ± 0.06 | 2.49 ± 0.05 |
| glucose | 1.28 ± 0.02 | 4.50 ± 0.05 |

Greulich et al. fit all growth curves for one carbon-source family simultaneously with one
pair of these parameters. Petra must not average the glucose and glycerol fits or select one
from an unlabeled generic resource field.

### Root-selection contract

A numerical implementation must not choose an arbitrary cubic root. For this reversible
chloramphenicol pack it must select the real physical branch satisfying `0 <= x <= 1`,
continuous from `x = 1` at `a_ex = 0`, and must be regression-tested against the
published response family. Ambiguous/no-valid-root results fail closed.

A robust implementation may solve the cubic directly or use a reviewed stable polynomial
root algorithm; the numerical method is engineering, while equation 7 and the physical
branch are the scientific contract.

### Reversible-limit diagnostic

In the fully reversible limiting regime, the paper gives

```text
lambda / lambda0 = 1 / (1 + a_ex / IC50)

IC50 = IC50_star * lambda0_star / (2 * lambda0)
```

This is useful as a diagnostic and limiting-case test. It must **not** replace the full
chloramphenicol fit by default because the paper reports that the full cubic gives better
quantitative agreement and notes that chloramphenicol can sit near the crossover where
susceptibility versus nutrient quality is not globally monotone.

## Effect semantics in Petra

A reusable antimicrobial authority must separate at least these two axes:

```text
AntimicrobialEffect {
  divisionMultiplier: [0, 1]          // growth suppression
  incrementalLossHazardPerHour: >= 0 // drug-associated killing/loss
}
```

For this chloramphenicol pack:

```text
divisionMultiplier = lambda / lambda0
incrementalLossHazardPerHour = 0
```

The zero loss component means **"no chloramphenicol killing law is authorized by this
pack"**, not "chloramphenicol can never kill under any condition."

For the current ciprofloxacin flagship, the existing Regoes composition remains a distinct
authority that supplies an incremental loss hazard. Do not force both drugs into a single
Hill/loss abstraction merely for UI uniformity.

A future versioned interface should discriminate response models, for example:

```text
kind: "growth-inhibition"
model: "greulich-ribosome-cubic-v1"
concentrationUnit: "uM"
environmentBinding: "mops-glycerol" | "mops-glucose"
```

versus the existing ciprofloxacin loss policy. Scenario composition owns which authority is
legal; the equation module does not choose biology from a drug name.

## Susceptible and resistant identity boundary

Greulich's quantitative response authority is for MG1655 in the stated MOPS contexts. A
separate source, Graf et al. 2024, supplies an exact MG1655 chloramphenicol-resistance
phenotype control:

- clean MG1655 carrying the pEB1-sfGFP control: chloramphenicol MIC **8 µg/mL**;
- MG1655 with constitutively expressed `catA1`, `catA2`, or `catB3` in the same pEB1
  framework: MIC **>512 µg/mL**;
- `catB4` in that same framework: MIC **8 µg/mL**, identical to control.

This is strong evidence that functional chloramphenicol acetyltransferase variants can create
high-level resistance and that the mere presence/name of a `cat` gene is not sufficient to
infer resistance.

### What Petra may *not* do with that resistance evidence

- Do not MIC-shift the Greulich wild-type cubic to create a `catA1` dose-response curve.
  Graf et al. do not measure that curve and the two studies use different assay contexts.
- Do not assign a `catA1` fitness cost from its MIC.
- Do not create a spontaneous mutation rate or transition into `catA1`; the cited
  resistance construct is engineered/plasmid expression evidence, not a measured de-novo
  MG1655 evolutionary edge.
- Do not treat `catB4` as resistant merely because its identifier contains `cat`.
- Do not infer clinical treatment outcomes or dose recommendations.

The first implementation may therefore expose `catA1` as a **source-backed resistance
phenotype identity with response curve unbound**. Product simulation of that genotype under
chloramphenicol remains disabled until a separately sourced response/composition rule exists.

## Concentration/unit contract

Greulich's fitted chloramphenicol response uses **µM**. Keep that unit explicit.

The existing ciprofloxacin intervention field is in `mg/L`. A generic drug-field refactor
must carry a unit in the versioned authority and reject mismatches; it must not reinterpret
a numeric `mg/L` field as `µM` or silently convert without a scenario-owned molecular
mass/provenance rule.

The current global/radial/stripe/paint geometry may be reused only as **engineering
concentration-field geometry** once the command/protocol becomes drug+unit aware. Geometry
reuse does not imply a calibrated physical delivery/diffusion law.

## Interaction and evolution boundaries

This first pack is deliberately single-drug.

- chloramphenicol × ciprofloxacin synergy/antagonism: **UNBOUND**;
- chloramphenicol × other antibiotics: **UNBOUND**;
- cross-resistance: **UNBOUND** unless a named source/allele pair is curated;
- mutation supply into chloramphenicol resistance: **UNBOUND**;
- physical chloramphenicol diffusion/decay in agar/dish: **UNBOUND**.

Selection may act on already-authorized phenotype states only after those states have a
source-backed response rule. Drug exposure must never directly instruct a useful mutation.

## Deterministic validation contract

The implementation issue should require all of the following before this authority is
product-facing:

1. **Zero drug:** `a_ex = 0` returns `divisionMultiplier = 1` exactly within the selected
   numerical policy and adds zero loss.
2. **Equation residual:** returned physical roots satisfy the source cubic within an explicit
   deterministic tolerance across a fixed test grid.
3. **Physical branch:** results remain finite and in `[0, 1]`; branch selection is continuous
   from the drug-free solution.
4. **Concentration response:** for fixed source-compatible `lambda0`, increasing
   chloramphenicol across the tested validation grid cannot increase the chosen growth branch.
5. **Medium identity:** glycerol and glucose fitted parameter sets are distinct versioned
   records; missing/unknown medium identity fails closed.
6. **Growth-context identity:** non-positive/non-finite `lambda0`, negative/non-finite
   concentration, or unit mismatch fails closed.
7. **Limiting-case check:** high-reversibility fixtures approach the published Langmuir
   diagnostic without promoting that limit to the full model.
8. **No cipro alias:** chloramphenicol never routes through
   `reference_pd_decrement_as_first_order_loss_v1`.
9. **Resistance fail-closed:** `catA1/catA2/catB3` may not acquire a fabricated response by
   MIC-ratio shifting; `catB4` may not be labeled resistant from its name.
10. **Replay:** when a future protocol adds a chloramphenicol field command, drug identity,
    concentration unit, parameter-record version, field state, and ordered command must join
    replay/checkpoint identity before product use.

These are cheap deterministic checks; no long local-only experiment is required for the
equation module itself. A later calibration against a physical dish/medium may require a
registered local sweep and must remain reachable through `python run_local_experiments.py`.

## Product language

Allowed once the scenario/context gate is satisfied:

> Chloramphenicol suppresses MG1655 growth through a source-backed, growth-rate-dependent
> ribosome-inhibition model. The response depends on the nutrient/growth context.

Required limitation:

> This is a mechanistic research model tied to defined MOPS growth contexts, not a clinical
> dosing model. Petra does not infer resistance, interactions, or physical drug transport
> beyond explicitly sourced/versioned authority.

## Research switch

**RESEARCH_NEEDED: OFF** for:

- first post-ciprofloxacin candidate selection;
- the wild-type MG1655 chloramphenicol response model/equation;
- the glucose/glycerol fitted parameter pairs above;
- the proof that named functional CAT variants can confer high resistance in clean MG1655.

Research remains **ON only for new claims**, including:

- a calibrated Petra physical medium/resource bridge for product enablement;
- a source-backed chloramphenicol response curve for a resistant MG1655 genotype;
- mutation/fitness authority for resistance evolution;
- multi-drug interactions;
- physical drug transport.

Those are implementation/calibration or separately scoped evidence tasks, not reasons to keep
collecting literature for this completed model-family decision.
