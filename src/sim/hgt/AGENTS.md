# HGT / conjugation DOX contract

## Scope
This directory owns horizontal-gene-transfer numerical/state primitives. Named biological transfer laws, host/plasmid evidence, physical population/area calibration, authoritative composed-state integration, and product presentation remain separate authorities.

## Conjugation sampling boundary
- `conjugationSampling.ts` samples only an already-defined batch of **distinct eligible recipients** under one caller-supplied transfer probability.
- `eligibleRecipientCount` is biological opportunity authority supplied by a future source-law/state adapter. The sampler never derives eligibility from grid distance, renderer glyph proximity, density fields, lineage color, or visual overlap.
- `transferProbabilityPerEligibleRecipient` is caller/source-law authority. This module supplies no R388/default probability, density-to-probability conversion, contact law, antibiotic effect, plasmid fitness cost, segregational loss, or acquisition cost.
- The reference path uses one Bernoulli draw per eligible recipient and exists for bounded fixtures/distribution validation.
- The policy-bounded path must use the repository `SamplingExecutionPolicy`; large counts use exact sparse-binomial sampling, not Poisson/normal approximation. Sampling-policy identity is replay/configuration authority before checkpointed composition.
- Sampling refusal is numerical execution-policy refusal, not zero biological transfer. Accelerated refusal must leave the caller RNG unchanged.
- A transfer count can never exceed the supplied eligible-recipient count. Later composition must additionally guarantee that one physical recipient is not counted in multiple competing transfer batches.
- HGT acquisition is not mutation ancestry. This sampler returns a count only; it does not create lineage/genotype/plasmid state or choose ancestry semantics.

## Current science gates
- #551 owns the exact named host/plasmid transfer-law pack.
- #914 owns physical area/count calibration for production spatial HGT; the source-assay validation geometry is not a universal Petra grid scale.
- #552 remains open for authoritative acquisition state, exact opportunity construction, RNG/config/checkpoint/replay integration, and HGT event semantics.
- #983 owns local experiment activation/evidence and must stay fail-closed until those authorities exist.

## Verification
Synthetic probabilities in tests are numerical fixtures only and must never be promoted into scenario data. No HGT sampler output is product/science evidence until bound to the exact named source law and authoritative recipient opportunity state.
