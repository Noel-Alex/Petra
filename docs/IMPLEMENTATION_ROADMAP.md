# Petra Implementation Roadmap

This roadmap describes the **best version of Petra**, then sequences it so the project can ship useful vertical slices continuously. The competition deadline affects order, not the long-term design ceiling.

## Phase 0 — repository contracts and scientific foundation

Status: substantially prepared.

Deliverables:
- DOX agent hierarchy;
- source/claim ledger;
- flagship scenario definition;
- parameter schema/preset;
- validation plan;
- visual system;
- master architecture;
- Issue queue.

Exit gate:
A fresh agent can enter from GitHub alone and explain what Petra is, what is scientifically authoritative, how to claim work, and what the flagship requires.

## Phase 1 — executable simulation substrate

### 1A. Project shell
- Vite React TypeScript;
- lint/type/test;
- worker entrypoint;
- message protocol;
- deterministic RNG;
- basic run metadata.

### 1B. Grid and fields
- circular mask;
- scalar-field abstraction;
- no-flux neighbor/stencil handling;
- diffusion;
- intervention writing;
- snapshot/downsample helpers.

### 1C. Population state
- genotype/lineage registry;
- density storage;
- metrics;
- pruning without losing ancestry.

Exit gate:
Seeded empty/nutrient/population state replays byte-for-byte/within defined deterministic numeric rules and diffusion passes conservation tests.

## Phase 2 — ecological growth

- Monod resource response;
- division/death bookkeeping;
- nutrient yield/consumption;
- local capacity;
- effective neighboring spread;
- early growth/depletion fixtures.

Exit gate:
A seeded colony grows, depletes resource, slows as expected and remains numerically stable over long accelerated runs.

## Phase 3 — ciprofloxacin pharmacodynamics

- Regoes reference function;
- unit convention conversion;
- spatial drug field;
- dose/gradient interventions;
- MIC-ratio genotype composition policy;
- PD plots/fixtures.

Exit gate:
Reference curve is reproduced, zero-drug behavior matches ecological baseline, and concentration monotonically changes response over the supported region.

## Phase 4 — stochastic evolution

- curated genotype graph;
- division-conditioned mutation;
- rare-event strategy;
- child lineages;
- ancestry;
- fitness modifiers;
- deterministic event records;
- replicate-distribution tests.

Exit gate:
Mutations only arise from divisions, seed replay is stable, drug alters selection rather than mutation generation, and genotype states have traceable parameters.

## Phase 5 — visual vertical slice

- Pixi dish renderer;
- density-to-colony visual mapping;
- nutrient/drug overlays;
- glass/rim/lighting treatment;
- pan/semantic zoom;
- event highlights;
- lineage colors/patterns.

Exit gate:
Dish reads as a premium interactive object at overview and colony scale with no renderer-to-biology feedback.

## Phase 6 — control and analysis experience

- scenario selector;
- inoculation/dose tools;
- play/pause/speed;
- timeline;
- live plots;
- local inspector;
- lineage tree;
- Why?/Sources/Assumptions panel;
- seed/reset/replay.

Exit gate:
A new user can complete a 90-second causal experiment without developer explanation.

## Phase 7 — branch/fork experiments

- snapshot at time;
- fork run with a new branch identity;
- apply different intervention;
- compare trajectories;
- synchronized camera/time;
- difference metrics.

This feature is a major product differentiator and should arrive early after the flagship.

## Phase 8 — guided experiment pack

At least:
1. Selection is not mutation.
2. Cost of survival.
3. Spatial contingency.
4. Gradient adaptation.

Each guided experiment includes:
- question;
- setup;
- user choice;
- observable;
- explanation;
- sources;
- no hidden outcome forcing.

## Phase 9 — persistence/tolerance

- N/Q phenotype states;
- switching;
- phenotype-specific growth/drug death;
- visual distinction;
- conceptual lesson.

Exit gate:
Regrown population remains genotype-sensitive unless mutation separately occurred.

## Phase 10 — phage module

Start with a named `E. coli` / T4 or T7 preset only after exact parameter curation.

- free phage field;
- adsorption;
- infection stages;
- host-state-dependent development;
- lysis/burst;
- decay;
- phage-resistant host transition if sourced.

Exit gate:
Zero-phage/zero-adsorption/no-host controls and latency/burst fixtures pass.

## Phase 11 — HGT and multi-species ecology

- named plasmid transfer;
- transfer cost;
- recipient/contact model;
- multi-resource support;
- second microbial species only with an actual biology pack.

## Phase 12 — model training

### Dataset generator
Run broad mechanistic sweeps with:
- parameter-set hash;
- scenario;
- seed;
- interventions;
- snapshots;
- aggregate metrics.

### Aggregate surrogate
Small baseline before deep model.

### Spatial surrogate
Only if product benefit is clear.

### Explanation model/RAG
Structured event log + repository evidence, never free-form biological authority.

## Phase 13 — production hardening

- visual QA matrix;
- accessibility;
- responsive layout;
- offline cache;
- performance tiers;
- long-run soak;
- replay compatibility;
- error boundaries;
- invalid preset handling;
- scientific disclaimer and citation UX;
- export/share.

## Parallelization strategy

Workstreams can proceed in parallel once protocol contracts land:

- core numerical engine;
- scientific fixtures/provenance;
- renderer;
- UI shell;
- visual asset system;
- validation harness.

The worker protocol, scenario schema and central design tokens are integration boundaries; changes need coordination.

## Release quality gate

Do not call a version “competition ready” or “release ready” from source code alone.

It needs:
- build/test evidence;
- real browser run;
- a recorded flagship experiment;
- visual review;
- performance measurement;
- provenance review;
- science explanation rehearsal;
- no known misleading representation.
