# Numerical methods research

## Problem

Petra combines processes at radically different scales:
- huge numbers of ordinary divisions;
- rare mutations;
- continuous nutrient/drug diffusion;
- delayed infection events;
- sparse lineages.

A fully exact event-by-event stochastic simulation would waste computation on ordinary births; a fully deterministic ODE/PDE model would erase the rare-event stochasticity that makes evolution interesting.

## Exact stochastic baseline

Gillespie SSA is the reference conceptual model for a continuous-time Markov jump process. Use exact or exact-like sampling where counts are low and event discreteness materially affects outcomes.

## Tau-leaping

Tau-leaping accelerates many reaction firings over a time interval by sampling counts rather than each event separately.

A critical implementation problem is impossible negative populations when a Poisson draw requests more destructive events than available reactants/population.

Cao, Gillespie & Petzold (2005), DOI `10.1063/1.1992473`, specifically address avoiding negative populations in explicit Poisson tau-leaping. Later post-leap methods likewise enforce leap conditions and reject/adjust unsafe steps.

## Petra hybrid policy

### Low count / rare transition
Use exact/binomial/hazard sampling.

Examples:
- mutation events;
- lineage extinction boundary;
- very small founder population;
- low-count phage infection where discreteness matters.

### High-frequency birth/death
Use a bounded aggregate method:
- binomial sampling for events that remove from a finite population;
- Poisson where event count is not intrinsically capped, followed by a mathematically justified cap only if the channel formulation permits it;
- or adaptive tau reduction when expected destructive events become too large.

Never “fix” negative counts after the fact by simply maxing state with zero without recording/avoiding the invalid leap. That biases the model.

## Mutations conditioned on births

If `B` births occurred and transition probability is `u`:

```
M ~ Binomial(B, u)
```

For very small `u` and large `B`, Poisson(`B*u`) approximates the event count, but Petra must ensure `M <= B`.

For multiple mutually exclusive mutation targets:
- use a multinomial draw from the birth count;
- or sequential conditional binomials with stable probability accounting.

Do not independently Poisson-sample multiple large transition classes from the same divisions without checking that total mutant births cannot exceed total births.

## Diffusion

For a standard explicit 2D five-point Laplacian:

```
C_new = C + D*dt/dx^2 * (N+S+E+W - 4C)
```

The timestep must satisfy the appropriate stability condition. Use diffusion substeps if the ecological timestep is larger.

No-flux dish rim:
- only flux between valid neighboring dish cells;
- mirror/zero-normal-flux treatment at the boundary;
- diffusion-only test must conserve field mass within floating-point tolerance.

## Resource consumption

Avoid order-dependent lineage bias.

Bad:
1. lineage A consumes;
2. lineage B sees whatever remains.

Better:
1. compute all potential local growth/resource demand from the same pre-update state;
2. if demand exceeds available substrate, scale/allocate consistently;
3. apply growth and consumption together.

This makes results independent of array iteration order.

## Drug + ecological rates

Keep unit conventions explicit. If a published pharmacodynamic function is a slope in log10 density per hour, convert before combining with natural-exponential population updates.

Write tests at:
- concentration 0;
- zMIC / zero-growth point;
- high concentration;
- genotype MIC shift;
- no-resource condition.

## Delayed lysis

Two browser-friendly options:

### Event queue
Each infection schedules lysis at `t + latent_period`. Accurate for fixed delays but many events may be costly.

### Transit chain
`I1 -> I2 -> ... -> In -> lysis`.

An Erlang-distributed delay can approximate infection-stage progression with compact aggregate compartments and avoids a full per-infection object history.

Choose per phage model and validate delay distribution.

## Determinism

- one documented PRNG algorithm;
- no `Math.random()` in authoritative engine;
- stable iteration order;
- stochastic substreams keyed by subsystem/step if this reduces refactor-induced replay drift;
- record engine version because floating-point/order changes can alter trajectories.

## Validation

For every accelerated channel:
1. construct a small case feasible under exact SSA/small dt;
2. run many seeds;
3. compare distributions/summary statistics;
4. establish acceptable error;
5. document the regime switch.

The purpose is not “exact microscopic truth.” It is to preserve the relevant stochastic behavior while making a browser-scale educational simulation practical.
