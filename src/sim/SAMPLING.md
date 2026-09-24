# Bounded stochastic count sampling

## Purpose

Petra keeps small-count trial-by-trial samplers as deterministic scientific
reference paths while preventing product/runtime composition from accidentally
performing unbounded work for externally supplied safe-integer counts.

This is **numerical execution policy**, not biology. Sampling budgets must never
be interpreted as population thresholds, mutation-rate changes, adsorption
limits, or scientific regime boundaries.

## Policy identity

`src/sim/samplingPolicy.ts` owns the versioned caller-supplied
`SamplingExecutionPolicy`.

Its canonical identity includes:

- schema version and caller-owned policy id;
- maximum trial count permitted on the reference path;
- enabled acceleration algorithm;
- conservative expected accelerated-draw budget;
- absolute accelerated RNG-draw budget;
- accelerated algorithm version.

Changing any of those fields changes stochastic RNG consumption and therefore
changes replay/configuration identity. Before a bounded sampler is enabled in a
checkpointed authoritative composition, its exact
`samplingExecutionPolicyIdentity(...)` must be included in that composition's
configuration fingerprint. Do not restore a checkpoint under a different
sampling-policy identity.

## Exact reference paths

The existing public reference functions remain intentionally simple:

- `sampleDivisionMutations(...)` — one categorical draw per reviewed discrete
  division opportunity;
- `sampleExactAdsorbedPfu(...)` — one Bernoulli draw per free PFU.

They are useful for deterministic fixtures and distribution validation. Runtime
composition must not call them for arbitrary large counts; use their
policy-bounded wrappers instead.

## Accelerated algorithm

`exact-sparse-binomial-v1` is **exact**, not Poisson/normal/tau-leap
approximation.

For `Binomial(n, p)`, it samples the rarer of success/failure outcomes by
geometrically skipping Bernoulli failures. Expected work is proportional to
`n * min(p, 1-p)`, not `n`. For `p > 0.5`, Petra samples failures and
returns the complement.

Mutation classes use sequential conditional exact-binomial draws. This is the
standard exact multinomial factorization, so target classes remain mutually
exclusive and total mutant births cannot exceed supplied division
opportunities.

## Bounded work and refusal

Before accelerated sampling starts, Petra checks a conservative expected-draw
budget. During sampling, every RNG draw consumes one operation-local hard
budget slot. Exceeding either budget throws `SamplingPolicyRefusalError` with
`code = "sampling-policy-refusal"` and numerical diagnostics.

Accelerated operations run on a cloned `SimulationRng` and commit the cloned
state only after the entire operation succeeds. A policy refusal therefore
cannot half-consume the caller's authoritative RNG stream.

A refusal is a numerical/execution-policy outcome. It must not be re-labelled
as biological OOD, extinction, failed adsorption, or zero mutation.

## Validation

Any new accelerated algorithm/version must be compared against the exact
reference law over deterministic many-seed fixtures, including:

- zero and one probability limits;
- representative small/moderate counts;
- rare-event tails;
- class/exclusivity and count bounds;
- deterministic replay for a fixed policy and RNG state;
- refusal with caller RNG rollback.

Do not introduce renderer/UI random draws into these paths.
