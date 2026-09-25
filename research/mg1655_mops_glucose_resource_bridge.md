# MG1655 MOPS-glucose resource-to-growth bridge

Issue: #938  
Parents: #928 / #657 / #874  
Status: **well-mixed calibration target identified; physical spatial bridge remains gated**  
RESEARCH_NEEDED: **OFF for model-family/evidence selection; ON only for the unresolved physical spatial transport/context claim**

## Decision

Petra now has enough primary-source evidence to prepare a **well-mixed** MG1655
D-glucose → drug-free growth-rate calibration without inventing a nutrient law:

- Knapp et al. 2025 measure *E. coli* K-12 MG1655 liquid-culture maximum growth rate
  in MOPS minimal medium across D-glucose concentrations from 0.17 to 11 mM at
  37 °C, with three biological replicate growth curves per concentration, and fit the
  concentration response with a weighted Monod/Michaelis-Menten relation.
- Baumler et al. 2011 measure MG1655 aerobic batch biomass and extracellular glucose
  time courses in MOPS minimal medium with 0.2% glucose and report strain-specific
  uptake/growth/yield quantities.
- Greulich et al. 2015 require a drug-free exponential growth rate `lambda0` for the
  exact glucose-family chloramphenicol response, using MG1655 at 37 °C in a **modified
  Neidhardt supplemented MOPS-defined medium** (Teknova M2101) with 0.2% w/v glucose.

This is enough to define a bounded calibration target and source-extraction task. It is
**not** enough to claim that Petra has a physical 2-D MOPS/glucose dish.

## Critical compatibility boundary

The three sources are related but not one identical experiment.

| Source | MG1655 | 37 °C | Carbon context | Medium / geometry | Petra use |
|---|---|---:|---|---|---|
| Knapp 2025 | yes | yes | D-glucose 0.17–11 mM | MOPS minimal; liquid growth curves | measured concentration→growth target + Monod model family |
| Baumler 2011 | yes | yes | 0.2% glucose | MOPS minimal; aerobic liquid batch with sparging | measured biomass/glucose time-course, uptake/yield constraint |
| Greulich 2015 | yes | yes | 0.2% w/v glucose family | modified Neidhardt supplemented MOPS-defined medium, Teknova M2101; aerated liquid | exact drug-free `lambda0` context required by chloramphenicol PD |

The common organism, temperature, MOPS family and glucose substrate make Knapp/Baumler
useful **near-context calibration evidence**. The medium formulations, culture protocols and
readouts are not automatically interchangeable. Petra must therefore validate the 0.2%
endpoint/context seam rather than declaring the Knapp fit to be the Greulich environment.

This is especially important because Greulich fits distinct antibiotic-response families for
glucose and glycerol media. A generic or dimensionless resource value cannot choose that
family.

## First-stage calibration contract: well-mixed only

The first promotable object should be a versioned well-mixed environment bridge of the form

```text
physical glucose concentration (mM)
        ↓ source-fit / calibrated relation
drug-free MG1655 growth capacity lambda0 (1/h)
```

with the following rules.

1. **Targets.** Fit/extract against the Knapp 37 °C glucose concentration series, preserving
   replicate uncertainty and the source's weighted Monod/Michaelis-Menten model family.
2. **Independent constraint.** Use Baumler's 0.2% glucose biomass/glucose time course and
   reported strain-specific uptake/yield quantities as a compatibility/consistency target,
   not as permission to copy gDW/g-glucose numbers into Petra's dimensionless
   `biomassYield`.
3. **Greulich seam.** Compare the candidate 0.2% glucose drug-free growth state with the
   exact Greulich glucose-family context before the bridge may supply `lambda0` to the
   chloramphenicol authority.
4. **Classification.** Knapp/Baumler values stay measured in their own contexts. Any
   cross-source parameter used for the Greulich scenario is classified transferred or
   calibrated, never re-labeled measured.
5. **Bounds/objective.** #657 owns the fitting discipline: versioned objective, explicit
   parameter bounds, fit/hold-out split, residual reporting, sensitivity/identifiability,
   and preservation of multiple acceptable fits where the data do not identify one answer.
6. **No drug fitting.** Do not tune nutrient/resource parameters against chloramphenicol
   inhibition curves. Environment calibration must stand on drug-free data first.

The durable machine-readable source envelope is
`data/environments/ecoli_mg1655_mops_glucose_37c_v1.json`.

## Why this does not yet authorize spatial glucose

A liquid concentration→growth curve does not determine a 2-D dish transport model. A physical
spatial scenario still needs, at minimum:

- named matrix/medium and geometry;
- glucose diffusion or other transport authority for that matrix and temperature;
- agar/liquid thickness or an explicitly reviewed 2-D reduction;
- boundary/initial conditions in physical concentration units;
- biomass/resource unit bridge and consumption law compatible with the chosen geometry;
- oxygen/aeration treatment adequate for the intended claim.

Knapp and Baumler do not identify those spatial quantities. Baumler's continuous-sparging
batch culture is particularly unsuitable as a silent proxy for an agar dish.

Therefore the current flagship `model-resource` remains dimensionless and must **not** be
renamed glucose. A future physical environment must use a new versioned scenario/resource
context and pass the #227 compatibility boundary.

## Local experiment preparation

Stable experiment ID: `mops-glucose-resource-calibration`.

It is registered through `python run_local_experiments.py` now so the expensive local/source
work has one durable entry point. Until #938 finishes exact source-table extraction and the
physical spatial decision, the registration intentionally uses the repository's blocked-result
helper. The stable ID must be preserved when a real calibration helper replaces that gate.

When activated, the compact result should contain at least:

- exact source/data record versions and hashes;
- fitted parameter names, units, bounds and evidence class;
- objective version and weighted residual summary;
- fit vs hold-out target IDs and errors;
- sensitivity/identifiability summary and alternate acceptable fits;
- 0.2% glucose context-comparison result for Greulich compatibility;
- an explicit `spatialPromotionAuthorized: false|true` plus the evidence IDs that justify it.

Raw source tables, calibration traces and large sweep outputs remain local.

## Acceptance before any Science Mode promotion

A candidate bridge may advance only when all of these are true:

- exact MG1655/background, temperature, medium and glucose units are versioned;
- source-table extraction is reproducible and uncertainty is retained;
- the well-mixed drug-free growth relation has fit and hold-out evidence;
- the Greulich 0.2% glucose seam is explicitly validated or classified as a bounded transfer;
- physical spatial transport has an independent named authority/calibration;
- zero glucose/resource produces no fabricated biomass production under the promoted
  physical model;
- mass/resource accounting closes in compatible physical units;
- unsupported transport, oxygen and antibiotic-delivery claims remain unavailable.

## Explicit non-claims

This evidence does **not** establish:

- that Knapp MOPS minimal medium is identical to Greulich Teknova M2101;
- that 11 mM and 0.2% w/v glucose are interchangeable without a documented conversion and
  medium context;
- an agar/dish glucose diffusion coefficient;
- a physical carrying capacity;
- a physical cell-density conversion for every renderer pixel;
- chloramphenicol diffusion/decay or clinical dosing;
- that the existing flagship `model-resource` is glucose.

## Primary sources

- Knapp, B.D. et al. (2025). *Metabolic rearrangement enables adaptation of microbial
  growth rate to temperature shifts.* Nature Microbiology 10, 185–201.
  DOI `10.1038/s41564-024-01841-4`. Replication data:
  `doi:10.7910/DVN/SC2KXZ`.
- Baumler, D.J. et al. (2011). *The evolution of metabolic networks of E. coli.*
  BMC Systems Biology 5:182. DOI `10.1186/1752-0509-5-182`.
- Greulich, P. et al. (2015). *Growth-dependent bacterial susceptibility to
  ribosome-targeting antibiotics.* Molecular Systems Biology 11.
  DOI `10.15252/MSB.20145949`.

## Research switch

The evidence search is **OFF** for choosing the first well-mixed model family and calibration
targets. More literature should be collected only if it resolves one of the named remaining
physical spatial quantities or demonstrates that the cross-source MOPS contexts are
incompatible.

The physical **spatial** promotion gate remains open. Missing transport evidence is a blocker,
not permission to tune an attractive-looking nutrient field.
