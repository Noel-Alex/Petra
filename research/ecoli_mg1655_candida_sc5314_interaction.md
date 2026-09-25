# E. coli MG1655 -> Candida albicans SC5314 soluble antifungal interaction

Issue: #647  
Research decision: named interaction identified; **quantitative spatial implementation deferred** pending mechanism/kinetic authority.

## Why this pair

Cabral et al. (2018), DOI `10.15698/mic2018.05.631`, directly studies the same bacterial background already central to Petra's flagship, **Escherichia coli K-12 MG1655**, against **Candida albicans SC5314**.

This makes the system useful as a future named bacteria-fungus interaction pack. It does **not** make a generic bacteria-versus-fungus attack law valid.

## Exact source context

Primary source:
- Cabral, Penumutchu, Norris, Morones-Ramirez & Belenky (2018), *Microbial competition between Escherichia coli and Candida albicans reveals a soluble fungicidal factor*, Microbial Cell 5(5):249-255, DOI `10.15698/mic2018.05.631`.

Experimental context used for the co-culture result:
- bacterial strain: *E. coli* MG1655;
- fungal strain: *C. albicans* SC5314;
- medium: YPD liquid medium;
- temperature: 37 °C;
- mixing: vigorous shaking, 300 rpm;
- vessel: 25 mL culture in 250 mL flasks;
- initial co-culture inoculation reported as *C. albicans* OD600 0.1 and *E. coli* OD600 0.001 after pre-growth;
- readout: viable CFU over approximately 16-20 h.

These conditions are part of the evidence identity. Petra must not relabel the result as a static-agar, biofilm, clinical, or arbitrary spatial-dish measurement.

## What is measured

The source reports:
- MG1655 growth was not detectably impaired by the presence of SC5314 in the assayed co-culture.
- SC5314 growth was inhibited by approximately six hours.
- Viable Candida then declined strongly; the paper reports an approximately 5000-fold reduction by 16 h relative to the six-hour time point.
- Cell-free conditioned medium retained fungicidal activity, supporting a **soluble** factor.
- The activity was concentration-dependent under dilution and was heat-labile.
- Magnesium availability modulated the effect. Adding magnesium could abolish fungicidal activity and restore fungal growth.
- Magnesium depletion by itself was **not sufficient** to explain killing: Candida monoculture could deplete magnesium without producing the same toxicity.
- The authors therefore conclude that a soluble E. coli-produced activity is responsible for killing and that low magnesium is required for efficient toxicity.

## What is not identified

The paper does not provide an engine-ready spatial mechanism for Petra:
- the molecular identity of the soluble fungicidal factor is unresolved;
- production rate per E. coli biomass/cell is not measured as a reusable parameter;
- factor concentration is not mapped to a quantitative Candida death-hazard function;
- secretion onset/cessation kinetics are not parameterized for arbitrary states;
- diffusion coefficient, spatial transport, adsorption, degradation/clearance, and boundary behavior are not measured for a Petra-like dish;
- magnesium uptake/transport and a reusable magnesium-dependent kill surface are not jointly calibrated;
- the YPD result does not define how Petra's current dimensionless `model-resource` field maps to YPD nutrients or magnesium;
- the result does not establish an interaction with Aspergillus or any other fungus.

A renderer overlap, lineage color, density contour, or colony contact therefore cannot stand in for this mechanism.

## Minimum truthful future authority

A quantitative #647 implementation for this exact interaction would need a versioned mechanism contract with, at minimum:

1. **Named pair identity**
   - `E. coli K-12 MG1655`
   - `Candida albicans SC5314`

2. **Environment identity**
   - medium/resource context and temperature;
   - an explicit statement whether a spatial scenario transfers from the source's shaken-liquid YPD assay;
   - magnesium state in a physical unit if magnesium dependence is modeled quantitatively.

3. **Secreted-factor state**
   - a distinct factor field or other explicit causal state, never a generic pairwise damage coefficient;
   - source/calibration for production, transport and loss;
   - no renderer ownership of that field.

4. **Candida effect law**
   - a source- or calibration-backed factor-exposure -> death/growth-effect relation;
   - explicit interaction with magnesium availability;
   - out-of-domain behavior and uncertainty.

5. **Replay/checkpoint authority**
   - every causal field/state included where required for deterministic continuation;
   - fixed update order relative to resource growth and other mortality.

Until those values exist, the quantitative secreted-factor mechanism remains **UNBOUND**.

## Controls and validation targets

When a future calibrated implementation exists, it should include:
- **zero-factor control:** no direct fungicidal term when the factor mechanism is disabled;
- **magnesium rescue control:** source-compatible magnesium availability should suppress the named fungicidal effect according to the calibrated law;
- **magnesium-depletion-only control:** low magnesium alone must not automatically be treated as fungicidal, because the source separates growth limitation from the E. coli-associated toxicity;
- **no-E.-coli control:** Candida should not receive the E. coli-secreted-factor death term without the source organism/mechanism present;
- **pair specificity:** do not apply the MG1655/SC5314 interaction to unrelated fungi or bacteria;
- **source-context validation:** any reproduction of the paper's time-course phenotype must be explicitly labelled as validation in the source-like context, not proof of arbitrary spatial-dish realism.

The reported six-hour onset and strong 16-hour viability loss can be validation targets only after the source-context state and missing kinetics have been bound. They are **not** parameters to back-solve into an arbitrary first-order death constant.

## Petra decision

Research is **OFF for the narrow decision of whether a generic direct-attack interaction can be implemented now**: it cannot.

The source establishes a named biological interaction and a useful future validation system, but not enough quantitative state/kinetics to enable a scientifically labelled spatial fungicidal mechanism. #647 should keep that mechanism disabled/fail-closed until a source-compatible calibration supplies the missing factor and magnesium authority.

This does not block:
- shared-resource competition abstractions under their own provenance;
- the independently selected first fungal pack under #556/#615;
- future research that identifies/calibrates the soluble factor or a different named interaction.
