# Petra Growth Architecture

## Goal

Petra should be able to grow from one excellent `E. coli + ciprofloxacin` experiment into a reusable microbial eco-evolution sandbox without turning every new species, drug, phage, or scenario into custom spaghetti.

The architecture is deliberately **mechanism-first and data-driven**. New content should normally compose existing mechanisms with new parameter/provenance data. New code is justified when the biology itself introduces a new mechanism.

## Layer model

```text
UI / interaction
      │ commands + snapshots
      ▼
Simulation coordinator
      ├─ spatial fields
      ├─ population/lineage state
      ├─ intervention scheduler
      ├─ metrics/event extraction
      └─ mechanism modules
            ├─ resource growth
            ├─ pharmacodynamics
            ├─ mutation/evolution
            ├─ persistence
            ├─ phage
            ├─ HGT/plasmids
            └─ competition/cross-feeding (later)
      │
      ▼
Versioned parameter/scenario registry
      │
      ▼
Research provenance / claim ledger
```

## Canonical boundaries

### Simulation core

Pure TypeScript at first. It owns biology and numerical state. No React, DOM, PixiJS, animation timeline, or LLM calls.

Canonical inputs:
- initial world state;
- parameter-set version;
- explicit RNG seed;
- ordered interventions.

Canonical outputs:
- state snapshots;
- metrics;
- scientific event records;
- deterministic replay metadata.

### Rendering

Rendering owns visual representation only:
- dish glass/refraction approximation;
- scalar-field textures;
- colony sprites/particles;
- lineage highlights;
- camera/zoom;
- transitions between aggregation levels.

A renderer can smooth between two snapshots but cannot create a lineage, kill bacteria, change concentrations, or decide mutation.

### Product/UI

UI translates user intent into typed simulator commands:
- inoculate;
- dose;
- paint/add nutrient;
- introduce phage/competitor;
- change environment;
- pause/speed/reset/replay.

It also owns explanations, provenance surfaces and charts.

### Data/provenance

Biological presets are versioned data. A preset references source IDs and contains confidence/transfer metadata. Science code should avoid hard-coded strain/drug constants.

## Mechanism extension interfaces

A mechanism should define conceptually:

```ts
interface Mechanism<State, Params> {
  id: string
  version: string
  validate(params: Params): ValidationResult
  step(ctx: StepContext, state: State, params: Params): void
  metrics?(ctx: StepContext): MetricRecord[]
}
```

Do not implement this exact generic abstraction until it is useful. The contract matters more than the class shape: each mechanism must have explicit state, parameters, update order, invariants and tests.

## State ownership

### Continuous grid fields
Use dense typed arrays for fields that exist at almost every cell:
- nutrient(s);
- antibiotics;
- free phage when enabled;
- optional environmental fields.

### Populations
Use sparse local population records keyed by grid cell + lineage/genotype. Do not allocate a large lineage array for every grid cell.

### Lineage registry
Global ancestry metadata:
- lineage ID;
- parent;
- genotype;
- creation time/event;
- phenotype modifiers;
- source mutation/HGT event.

### Delayed events
Use queues/buckets for phage lysis and other delayed transitions. Avoid per-cell timers as objects.

## Update order contract

A default ecological tick:

1. apply scheduled interventions;
2. diffuse/decay continuous fields using stable numerical substeps;
3. compute local environment response;
4. compute potential resource-limited growth;
5. compute drug-mediated net effect;
6. sample high-frequency births/deaths safely;
7. allocate resource consumption/yield;
8. sample rare mutation/HGT events;
9. process phenotype switching;
10. process infection and delayed lysis;
11. perform local dispersal/occupancy redistribution;
12. compact/merge equivalent sparse records;
13. extract metrics/events;
14. publish render snapshot when due.

Changing this order is a model change and must be documented/tested.

## Numerical scale separation

Do not force every process to use the same `dt`.

- diffusion may substep to satisfy stability;
- ecological birth/death may use a coarser step;
- rare events may use exact/hazard sampling;
- rendering may run at 60 FPS while the simulator publishes at 10–30 Hz;
- charts can sample still more slowly.

## Content registry

A future content pack can contain:
- organism/strain definition;
- one or more drug-pair PD definitions;
- genotype graph;
- phage-host pairs;
- environment/cardinal response;
- scenarios;
- citations.

A content pack must not silently add executable code. A new mechanism is a reviewed engine change.

## Scientific feature maturity

Each mechanism has a maturity state:

- `experimental` — research/implementation exists but UI should label it.
- `validated-educational` — numerical fixtures + provenance support intended claim.
- `reference` — flagship scenario with especially strong source coverage.

Maturity is about evidence, not code completeness alone.

## Performance targets

Initial engineering budget for a normal laptop:
- 128×128 flagship grid at >= 30 visual FPS;
- simulator worker should usually consume < 8 ms of main-equivalent CPU per published frame on a modern laptop;
- interaction latency < 100 ms for ordinary controls;
- avoid unbounded lineage growth;
- memory stable across long runs/reset cycles.

After profiling, support quality tiers:
- Low: 96² grid, reduced particles/effects;
- Standard: 128²;
- High: 192² or richer rendering if device allows.

## Serialization and replay

A saved experiment must include:
- scenario/preset IDs + versions;
- engine version;
- seed;
- initial state;
- interventions with simulation times;
- user-facing annotations if any.

Do not depend on serializing every transient object if replay can reconstruct the state deterministically.

## Growth rules

- Prefer extending data before adding branches.
- Prefer one shared implementation of a mechanism to scenario-specific copies.
- Do not create generic framework layers without at least two real consumers.
- A new mechanism must identify its state owner, parameter schema, update stage, invariants, fixtures and UI explanation.
- Refactors should make the next science feature easier without weakening reproducibility or provenance.
