# Petra ML Training Plan

## Principle

A trained model is valuable if it makes Petra faster, easier to explore or easier to understand **without becoming an uninspectable biological authority**.

Training begins only after a mechanistic engine can generate validated data.

## Use case A — aggregate outcome surrogate

### Inputs
Examples:
- scenario/version;
- initial population by genotype;
- initial resource;
- intervention schedule;
- drug geometry summary;
- environment parameters;
- selected engine parameters;
- current time/state summary.

### Outputs
At requested future horizons:
- total population;
- resistant fraction;
- genotype frequencies;
- remaining resource;
- diversity;
- probability-like summary across stochastic replicas where dataset supports it.

### First baselines
Before neural networks:
- linear/regularized regression;
- gradient-boosted trees;
- small MLP.

A neural model must beat simple baselines on held-out parameter combinations to justify complexity.

## Use case B — spatial emulator

### Inputs
Image-like channels:
- resource;
- drug;
- active lineage density channels or compressed genotype classes;
- optional environment/phage;
- time delta.

### Outputs
Same/derived fields at `t + Δt`.

Candidate families:
- U-Net;
- ConvLSTM/recurrent conv net;
- Fourier Neural Operator after sufficient dataset scale.

Start with a small U-Net because it is straightforward to train/debug and naturally maps spatial channels to spatial channels.

## Dataset generation

Every sample/run records:
- engine commit/version;
- parameter-set hash;
- scenario/version;
- seed;
- intervention timeline;
- state normalization metadata;
- snapshot interval;
- run termination reason.

Sampling strategy:
- Latin hypercube / Sobol-like parameter coverage where continuous;
- deliberate edge cases;
- multiple stochastic seeds per parameter point;
- intervention-pattern families;
- train/validation/test splits by **parameter/scenario groups**, not adjacent frames from the same run.

Avoid leakage where snapshots from one trajectory land in both training and validation.

Implementation contract: `src/ml/dataset.ts` assigns splits deterministically at the declared parameter/scenario **group** boundary, deliberately excluding snapshot time/index and seed from the split hash. `src/ml/runtime.ts` owns the optional Emulated-mode feature/promotion/OOD gate. These helpers are infrastructure only; they do not mean a surrogate has been trained or promoted.

## Targets and losses

Aggregate:
- relative/normalized trajectory losses;
- special weighting on rare but product-important outcomes if justified;
- calibration metrics if predicting distributions.

Spatial:
- per-channel normalized error;
- mass/population conservation diagnostics;
- structural metrics for fronts;
- derived-observable error, not pixels alone.

## Out-of-domain handling

The model receives explicit domain bounds.

At runtime:
- reject parameters/interventions outside the declared training envelope and fall back to Mechanistic mode;
- surface the refusal/domain violations to the UI;
- never silently extrapolate and present result as authoritative.

Warnings may supplement a refusal, but a product-promoted Petra surrogate must not silently execute OOD.

## Validation

Report:
- aggregate MAE/RMSE;
- relative error by magnitude;
- error across future horizon;
- resistant-fraction error;
- spatial mass error;
- front-position error where relevant;
- failure modes by scenario.

Compare against:
1. mechanistic simulation;
2. simple baseline;
3. model ablations.

## Product integration

Modes:
- **Mechanistic** — authoritative;
- **Turbo / Emulated** — learned approximation.

UI must show which is active.

A useful interaction:
1. user previews many scenarios with surrogate;
2. picks one;
3. runs authoritative mechanistic simulation;
4. Petra overlays emulator error for the chosen case.

This turns AI into a teachable modeling concept rather than judge-bait.

## Explanation assistant

A separate LLM/RAG assistant may consume:
- structured event log;
- active scenario/preset;
- claim ledger;
- relevant research notes.

It may answer:
- “Why did this lineage expand?”
- “What does MIC mean here?”
- “Which assumption is transferred?”

It must cite Petra's evidence layer and never create new parameter values.

## Compute strategy

Mechanistic dataset generation can run:
- local multicore workers;
- Modal/GPU only if the trained spatial model benefits;
- batch jobs partitioned by parameter block and seed.

Do not use GPU simply because one is available; the simulator itself may be CPU-bound until a GPU numerical implementation exists.

## Promotion gate

No surrogate enters the main product until:
- mechanistic engine is validated for its intended claims;
- dataset is versioned/reproducible;
- simple baseline is beaten;
- OOD policy works;
- error is visible;
- a mechanistic spot-check path remains available.
