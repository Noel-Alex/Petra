# Petra — Master Product & Scientific Plan

## 0. Vision

Petra is a **living Petri-dish laboratory** in the browser: part simulation, part interactive science story, part strategy sandbox.

A user should be able to change the environment, watch populations respond, inspect *why* a lineage succeeded or failed, replay the exact run, and trace the active model back to scientific sources.

The target experience is not “an educational website with animations.” It is a real mechanistic simulation whose presentation is polished enough to feel playful and cinematic.

## 1. Non-negotiable product pillars

### 1.1 Emergent, not scripted
The system generates outcomes from state + equations + stochastic events. A demo seed may be curated because it produces an instructive run, but the engine may never special-case that seed to force an outcome.

### 1.2 Scientific provenance is visible
The user can always answer:
- what equation is active?
- what parameter matters here?
- where did it come from?
- what was measured vs transferred vs calibrated?
- what does Petra explicitly *not* claim?

### 1.3 The dish is the product
The central Petri dish is not a decorative background around controls. It is the world, the primary visualization, and the main interaction surface.

### 1.4 Game feel without fake biology
The user gets agency, challenges, branching experiments, event highlights, replay and discovery. “Game” means meaningful choices and feedback—not arbitrary buffs, XP-driven science or fixed cinematic outcomes.

### 1.5 Original premium science-edutainment aesthetic
Use vibrant geometric illustration, excellent information hierarchy and causal motion at a level associated with high-end science animation. Remain visually original to Petra; do not copy another studio's assets, characters, exact palettes or compositions.

## 2. Product modes

### 2.1 Sandbox
Start from a scenario, alter interventions and environment, and explore.

### 2.2 Guided experiments
Short challenges teaching one causal idea:
- selection ≠ mutation;
- resistance can carry context-dependent fitness effects;
- spatial position changes evolutionary opportunity;
- persistence ≠ resistance;
- phage life history depends on host physiology.

### 2.3 Compare / fork
Pause at time `t`, fork the state and apply different interventions. Present both outcomes side-by-side or as synchronized replays.

This is one of Petra's strongest features because it turns causal questions into interaction.

### 2.4 Replay / provenance
Open a run from:
`scenario + engine version + parameter version + seed + intervention timeline`.

## 3. Flagship experiment

### Organism
*Escherichia coli*, curated MG1655 resistance genotype states.

### Pressure
Ciprofloxacin.

### Scientific stack
- resource-limited growth;
- nutrient diffusion/consumption;
- spatial local population cohorts;
- concentration-dependent antibiotic pharmacodynamics;
- division-linked mutation;
- genotype-specific MIC and relative fitness;
- local competition and expansion;
- deterministic seeded stochasticity.

### Why this scenario
It has an unusually strong literature stack spanning:
- pharmacodynamics;
- genotype/fitness measurements;
- mutation-supply/evolution experiments;
- spatial colony growth;
- spatial antibiotic evolution.

See `docs/science/FLAGSHIP_ECOLI_CIPRO.md`.

## 4. Core simulation architecture

### 4.1 Space
A circular mask over a dense 2D grid.

Default research target: 128×128. Higher quality tiers can increase resolution after profiling.

### 4.2 Continuous fields
Typed-array scalar fields:
- nutrient;
- antibiotic(s);
- optional free phage;
- optional environmental/metabolite fields.

### 4.3 Populations
Sparse **lineage × cell** cohorts rather than one JavaScript object per bacterium.

Each lineage carries:
- ancestry;
- genotype;
- phenotype settings;
- MIC / PD transformation;
- baseline fitness modifier;
- creation event;
- display identity.

### 4.4 Time-scale separation
- field diffusion can substep;
- ecological events run on simulation ticks;
- rare events can use exact/hazard/binomial sampling;
- renderer interpolates independently;
- metrics sample independently.

### 4.5 Seeded reproducibility
All stochastic engine paths use one deterministic PRNG stream strategy with explicit stream ownership/substreams where needed.

Reordering purely visual code must not alter biological RNG sequences.

## 5. Biological mechanisms

### 5.1 Resource growth
Monod-style response:
`f(S)=S/(K_S+S)`.

A scenario may later use another validated substrate model, but the active equation is explicit.

### 5.2 Antibiotic pharmacodynamics
Use a continuous concentration-response function. For the flagship, Regoes-style PD governs the reference shape; genotype MICs shift the reference under a clearly disclosed transfer assumption.

### 5.3 Birth / death
Do not infer separate biology from a single net-rate number when the mechanism needs birth-linked mutation. Track/sample potential divisions and losses so mutation can be conditioned on divisions.

### 5.4 Mutation
Curated genotype graph. Mutations occur with division. Large mutational-target classes are represented as classes, not mislabeled as a single nucleotide edge.

### 5.5 Spatial spread
Effective local displacement/colony-front expansion on neighboring cells. This is a coarse mechanical approximation and should be calibrated/validated qualitatively, not called single-cell motility.

### 5.6 Persistence/tolerance
Reversible phenotype compartments inside a genotype. Surviving a drug pulse does not rewrite genotype.

### 5.7 Phage
Named host/phage preset:
- adsorption;
- infected stages or delayed queue;
- host-state-dependent latent/eclipsed development where supported;
- burst;
- decay/diffusion;
- optional host resistance.

### 5.8 Horizontal transfer
Named plasmid/host pair, contact/density-dependent conjugation, plasmid cost and optional acquisition cost.

### 5.9 Environment
Temperature and pH are admitted only with a species/scenario-specific response model and validated domain.

## 6. Scientific truth taxonomy

Every user-visible science claim belongs to one class:

- **Measured** — directly reported in compatible experiment.
- **Derived** — calculated from measured data.
- **Transferred** — defensible parameter/model carried across nearby context.
- **Calibrated** — fitted/selected to match a target behavior.
- **Engineering** — numerical/rendering choice, not biology.
- **Hypothesis** — future/experimental mechanism.

The UI can display a compact badge and expand to full provenance.

## 7. Visual experience

### 7.1 Three semantic zoom levels
**Dish** — whole-ecosystem structure and interventions.  
**Colony** — local lineages, contours, local rates and events.  
**Representative cell** — stylized explanatory biology, explicitly not a literal molecular simulation.

### 7.2 Overlays
- nutrient;
- antibiotic;
- growth/death;
- lineages;
- resistance phenotype;
- phage;
- event markers;
- uncertainty/provenance if useful.

### 7.3 Story events
Significant simulator events can produce restrained narrative cards derived from actual state:
- first resistant lineage;
- lineage extinction;
- breakthrough into drug zone;
- population crash/recovery;
- phage wave;
- fork divergence.

### 7.4 Original art rule
High-level inspiration from premium editorial science animation is welcome. Direct reproduction of recognizable assets/characters/compositions is not.

## 8. Interaction system

### Primary actions
- inoculate;
- dose/paint pressure;
- add resource;
- introduce competitor/phage when enabled;
- inspect;
- pause/speed;
- reset/replay;
- fork experiment.

Every intervention:
- previews spatial footprint;
- displays a numeric meaning;
- lands on the experiment timeline;
- becomes part of replay identity.

## 9. Data and analytics

Live panels:
- total population;
- lineage frequencies;
- resistant fraction;
- resource amount;
- diversity;
- spatially averaged/selected local metrics.

Inspector:
- local concentrations;
- local growth/death;
- lineage composition;
- genotype/phenotype;
- ancestry;
- source/assumption card.

## 10. Model training strategy

Training is optional and only begins after the mechanistic engine has a validated dataset generator.

### 10.1 Best first model: aggregate surrogate
Predict future aggregate observables from initial/intervention state.

Useful for:
- fast parameter exploration;
- instant previews;
- regression detection;
- uncertainty maps.

### 10.2 Spatial surrogate
Compact U-Net/FNO/ConvLSTM-style model may predict future state channels over a bounded domain.

### 10.3 Surrogate safety contract
- train on mechanistic runs;
- split by parameter combinations/scenarios, not random adjacent trajectory frames;
- report held-out error;
- OOD detector/range gate;
- output visibly labeled **Emulated**;
- always retain mechanistic mode;
- compare surrogate vs authoritative run.

### 10.4 LLM role
An LLM can explain a structured event log and retrieve provenance. It cannot invent parameters or decide stochastic biological events.

## 11. Validation hierarchy

### Level A — numerical
Conservation, non-negativity, convergence, deterministic replay.

### Level B — component science
Monod relation, PD curve, mutation distributions, phage delay, cardinal environment curves.

### Level C — composed scenario
Check expected qualitative and bounded quantitative behavior under curated conditions.

### Level D — product
Browser interaction, rendering, accessibility, performance, explanation accuracy.

### Level E — demonstration
A new viewer can understand the causal story and a technically informed judge can inspect assumptions.

## 12. Extension roadmap

### P0 — flagship vertical slice
Core nutrient + cipro + mutation + lineage + renderer + provenance.

### P1 — product depth
Fork/compare, better semantic zoom, guided experiments, replay browser, richer analysis.

### P2 — persistence + phage
Strong biological extension that reuses existing state/event infrastructure.

### P3 — multi-species / HGT / environmental axes
Only with named parameterized systems.

### P4 — learned emulator
Train after an authoritative dataset generator exists.

### P5 — richer biological packs
Different bacteria/drugs/phages as independent, provenance-complete content packs.

## 13. What Petra should never become

- an LLM wrapper with a Petri animation;
- a pre-rendered mutation chooser;
- a fake “AI predicts evolution” black box;
- a cellular/molecular visualization that implies unsupported precision;
- a clinical antibiotic dosing recommender;
- a collection of arbitrary sliders whose values have no scientific meaning;
- a beautiful UI whose renderer secretly decides biological state.

## 14. Definition of “high quality”

Petra is high quality when:
- a biology student can explain the mechanism;
- a CS student can explain the algorithm;
- a judge can inspect evidence;
- the same seed replays;
- performance remains smooth;
- the UI makes causality understandable;
- visual polish survives close inspection;
- uncertainty is visible rather than hidden;
- adding the next real mechanism is easier, not harder.
