# Optional ML Surrogate

Start only after the mechanistic MVP passes validation.

## Phase 1 — aggregate emulator

Generate thousands of mechanistic runs across the validated parameter domain.

Features can include:

- initial nutrient;
- drug geometry/schedule;
- inoculum;
- genotype parameters;
- time;
- current aggregate state.

Targets:

- total population;
- resistant fraction;
- resource remaining;
- lineage diversity.

Use a small model that is easy to validate. Split by **unseen parameter combinations**, not random rows from the same trajectories.

## Phase 2 — spatial emulator

Input channels:

- nutrient;
- drug;
- WT density;
- one or more resistant density channels.

Output: fields `K` mechanistic steps later.

Candidate: compact U-Net / ConvLSTM.

## Product behavior

- Mechanistic mode is authoritative.
- ML mode is called **Turbo / Emulated**.
- Display held-out error metrics.
- Warn/refuse outside training domain.
- One-click comparison runs the same state through mechanistic and surrogate paths.

The ML story is strongest when it accelerates a validated model instead of replacing causal biology.
