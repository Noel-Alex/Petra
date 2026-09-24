import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { describe, expect, it } from 'vitest'

import flagshipScenario from '../data/presets/ecoli_ciprofloxacin_v1.json'
import {
  buildCuratedMutationGraph,
  mutationEdgesForSource,
  mutationTargetsForSource,
} from '../src/sim/evolution/graph'
import {
  sampleDivisionMutations,
  sampleDivisionMutationsWithPolicy,
  type MutationTarget,
} from '../src/sim/evolution/mutation'
import { SimulationRng } from '../src/sim/rng'
import {
  SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
  samplingExecutionPolicyIdentity,
  type SamplingExecutionPolicy,
} from '../src/sim/samplingPolicy'

const EXPERIMENT_ID = 'evolution-replicate-statistics'
const SOURCE_GENOTYPE_ID = 'A'
const REPLICATE_COUNT = 4_096
const DIVISION_OPPORTUNITIES_PER_REPLICATE = 10_000_000
const SEED_BASE = 0x7400_0000
const SIGMA_MULTIPLIER = 8
const MIN_ABSOLUTE_COUNT_TOLERANCE = 8

const SAMPLING_POLICY = Object.freeze({
  schemaVersion: SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
  id: 'evolution-replicate-statistics-v1',
  exactTrialLimit: 10_000,
  acceleration: 'exact-sparse-binomial-v1',
  maximumExpectedAcceleratedDraws: 1_000,
  maximumAcceleratedDraws: 2_000,
} satisfies SamplingExecutionPolicy)

interface ReplicateAggregate {
  readonly aggregateCounts: Readonly<Record<string, number>>
  readonly replicatesWithAnyMutation: number
  readonly totalRngDraws: number
  readonly modes: readonly string[]
  readonly sequenceSha256: string
}

interface EdgeAcceptance {
  readonly fromGenotypeId: string
  readonly toGenotypeId: string
  readonly probabilityPerDivision: number
  readonly modelTargetClassification: string
  readonly provenanceClassification: string
  readonly citationKey: string
  readonly citationDoi: string
  readonly expectedAggregateCount: number
  readonly variance: number
  readonly sigma: number
  readonly tolerance: number
  readonly observedAggregateCount: number
  readonly accepted: boolean
  readonly limitation: string
}

function writeCompactResult(result: unknown): void {
  const output = process.env.PETRA_LOCAL_RESULT_JSON
  if (output === undefined || output.trim() === '') return

  mkdirSync(dirname(output), { recursive: true })
  const temporary = `${output}.tmp`
  writeFileSync(temporary, JSON.stringify(result, null, 2) + '\n', 'utf8')
  renameSync(temporary, output)
}

function deterministicSeeds(): readonly number[] {
  const seeds = Array.from(
    { length: REPLICATE_COUNT },
    (_, index) => SEED_BASE + index,
  )
  for (const seed of seeds) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
      throw new Error('evolution replicate seed range left uint32 identity')
    }
  }
  return Object.freeze(seeds)
}

function runReplicates(
  targets: readonly MutationTarget[],
  seeds: readonly number[],
): ReplicateAggregate {
  const aggregateCounts = Object.fromEntries(
    targets.map((target) => [target.genotypeId, 0]),
  ) as Record<string, number>
  const modes = new Set<string>()
  const sequenceHash = createHash('sha256')
  let replicatesWithAnyMutation = 0
  let totalRngDraws = 0

  for (const seed of seeds) {
    const sampled = sampleDivisionMutationsWithPolicy(
      DIVISION_OPPORTUNITIES_PER_REPLICATE,
      targets,
      new SimulationRng(seed),
      SAMPLING_POLICY,
    )

    modes.add(sampled.diagnostics.mode)
    totalRngDraws += sampled.diagnostics.rngDraws

    let replicateMutationCount = 0
    for (const count of sampled.counts) {
      const current = aggregateCounts[count.genotypeId]
      if (current === undefined) {
        throw new Error(
          `sampler returned unknown mutation target ${count.genotypeId}`,
        )
      }
      aggregateCounts[count.genotypeId] = current + count.count
      replicateMutationCount += count.count
    }

    if (replicateMutationCount > DIVISION_OPPORTUNITIES_PER_REPLICATE) {
      throw new Error(
        `seed ${seed} produced more mutant births than division opportunities`,
      )
    }
    if (replicateMutationCount > 0) replicatesWithAnyMutation += 1

    sequenceHash.update(
      JSON.stringify({
        seed,
        counts: sampled.counts,
        diagnostics: sampled.diagnostics,
      }) + '\n',
    )
  }

  return Object.freeze({
    aggregateCounts: Object.freeze({ ...aggregateCounts }),
    replicatesWithAnyMutation,
    totalRngDraws,
    modes: Object.freeze([...modes].sort()),
    sequenceSha256: sequenceHash.digest('hex'),
  })
}

function exactAtLeastOneProbability(
  divisions: number,
  totalMutationProbability: number,
): number {
  if (totalMutationProbability === 0) return 0
  if (totalMutationProbability === 1) return divisions === 0 ? 0 : 1
  return -Math.expm1(divisions * Math.log1p(-totalMutationProbability))
}

function scenarioEvidenceForEdge(
  fromGenotypeId: string,
  toGenotypeId: string,
): {
  readonly provenanceClassification: string
  readonly citationDoi: string
  readonly limitation: string
} {
  const transition = flagshipScenario.mutationTransitions.find(
    (candidate) =>
      candidate.from === fromGenotypeId && candidate.to === toGenotypeId,
  )
  if (transition === undefined) {
    throw new Error(
      `flagship scenario is missing mutation transition ${fromGenotypeId}->${toGenotypeId}`,
    )
  }
  const citation = flagshipScenario.citations[
    transition.citation as keyof typeof flagshipScenario.citations
  ]
  if (citation === undefined) {
    throw new Error(
      `flagship mutation transition ${fromGenotypeId}->${toGenotypeId} has no citation record`,
    )
  }

  return {
    provenanceClassification: transition.provenance.classification,
    citationDoi: citation.doi,
    limitation: transition.provenance.limitation,
  }
}

function edgeAcceptance(args: {
  readonly fromGenotypeId: string
  readonly toGenotypeId: string
  readonly probabilityPerDivision: number
  readonly modelTargetClassification: string
  readonly citationKey: string
  readonly observedAggregateCount: number
}): EdgeAcceptance {
  const totalTrials =
    DIVISION_OPPORTUNITIES_PER_REPLICATE * REPLICATE_COUNT
  if (!Number.isSafeInteger(totalTrials)) {
    throw new Error('aggregate evolution trial count exceeds safe integer range')
  }

  const expectedAggregateCount = totalTrials * args.probabilityPerDivision
  const variance =
    totalTrials *
    args.probabilityPerDivision *
    (1 - args.probabilityPerDivision)
  const sigma = Math.sqrt(variance)
  const tolerance = Math.max(
    MIN_ABSOLUTE_COUNT_TOLERANCE,
    SIGMA_MULTIPLIER * sigma,
  )
  const evidence = scenarioEvidenceForEdge(
    args.fromGenotypeId,
    args.toGenotypeId,
  )
  const accepted =
    args.observedAggregateCount >=
      Math.max(0, expectedAggregateCount - tolerance) &&
    args.observedAggregateCount <= expectedAggregateCount + tolerance

  return Object.freeze({
    fromGenotypeId: args.fromGenotypeId,
    toGenotypeId: args.toGenotypeId,
    probabilityPerDivision: args.probabilityPerDivision,
    modelTargetClassification: args.modelTargetClassification,
    provenanceClassification: evidence.provenanceClassification,
    citationKey: args.citationKey,
    citationDoi: evidence.citationDoi,
    expectedAggregateCount,
    variance,
    sigma,
    tolerance,
    observedAggregateCount: args.observedAggregateCount,
    accepted,
    limitation: evidence.limitation,
  })
}

describe.sequential('evolution replicate statistics local experiment', () => {
  it('checks the bounded exact mutation sampler against the configured multinomial law', () => {
    const startedAt = new Date().toISOString()
    const seeds = deterministicSeeds()
    let evidenceWritten = false

    try {
      const graph = buildCuratedMutationGraph(flagshipScenario)
      const targets = mutationTargetsForSource(graph, SOURCE_GENOTYPE_ID)
      const edges = mutationEdgesForSource(graph, SOURCE_GENOTYPE_ID)

      assert.ok(
        targets.length > 1,
        'statistical experiment requires a multi-target curated source genotype',
      )
      assert.equal(
        targets.length,
        edges.length,
        'curated edge and sampler target counts must match',
      )
      assert.ok(
        DIVISION_OPPORTUNITIES_PER_REPLICATE > SAMPLING_POLICY.exactTrialLimit,
        'experiment must exercise the accelerated exact sampler',
      )

      const directReference = sampleDivisionMutations(
        128,
        targets,
        new SimulationRng(SEED_BASE),
      )
      const boundedReference = sampleDivisionMutationsWithPolicy(
        128,
        targets,
        new SimulationRng(SEED_BASE),
        SAMPLING_POLICY,
      )
      assert.deepStrictEqual(
        boundedReference.counts,
        directReference,
        'bounded sampler must replay the reference path below its exact budget',
      )

      const zeroProbability = sampleDivisionMutationsWithPolicy(
        DIVISION_OPPORTUNITIES_PER_REPLICATE,
        [{ genotypeId: 'zero-probability-control', probabilityPerDivision: 0 }],
        new SimulationRng(SEED_BASE),
        SAMPLING_POLICY,
      )
      assert.equal(zeroProbability.counts[0]?.count, 0)

      const first = runReplicates(targets, seeds)
      const replay = runReplicates(targets, seeds)
      assert.deepStrictEqual(
        replay,
        first,
        'same configured seed sequence must reproduce exact compact statistics',
      )

      const policyIdentity = samplingExecutionPolicyIdentity(SAMPLING_POLICY)
      const edgeResults = edges.map((edge) =>
        edgeAcceptance({
          fromGenotypeId: edge.fromGenotypeId,
          toGenotypeId: edge.toGenotypeId,
          probabilityPerDivision: edge.probabilityPerDivision,
          modelTargetClassification: edge.mutationClass,
          citationKey: edge.citationKey,
          observedAggregateCount:
            first.aggregateCounts[edge.toGenotypeId] ?? 0,
        }),
      )

      const totalMutationProbability = targets.reduce(
        (sum, target) => sum + target.probabilityPerDivision,
        0,
      )
      const atLeastOneProbability = exactAtLeastOneProbability(
        DIVISION_OPPORTUNITIES_PER_REPLICATE,
        totalMutationProbability,
      )
      const noEventProbability = 1 - atLeastOneProbability
      const expectedReplicatesWithAnyMutation =
        REPLICATE_COUNT * atLeastOneProbability
      const anyMutationVariance =
        REPLICATE_COUNT *
        atLeastOneProbability *
        (1 - atLeastOneProbability)
      const anyMutationSigma = Math.sqrt(anyMutationVariance)
      const anyMutationTolerance = Math.max(
        MIN_ABSOLUTE_COUNT_TOLERANCE,
        SIGMA_MULTIPLIER * anyMutationSigma,
      )
      const anyMutationAccepted =
        first.replicatesWithAnyMutation >=
          Math.max(
            0,
            expectedReplicatesWithAnyMutation - anyMutationTolerance,
          ) &&
        first.replicatesWithAnyMutation <=
          expectedReplicatesWithAnyMutation + anyMutationTolerance

      const acceleratedModeOnly =
        first.modes.length === 1 &&
        first.modes[0] === 'exact-sparse-multinomial'
      const allEdgesAccepted = edgeResults.every((edge) => edge.accepted)
      const allAccepted =
        acceleratedModeOnly && allEdgesAccepted && anyMutationAccepted

      const compactResult = {
        schema_version: 1,
        experiment_id: EXPERIMENT_ID,
        status: allAccepted ? 'passed' : 'failed',
        started_at_utc: startedAt,
        completed_at_utc: new Date().toISOString(),
        local_run_id: process.env.PETRA_LOCAL_RUN_ID ?? null,
        authority: {
          scenario_id: graph.scenarioId,
          scenario_version: graph.scenarioVersion,
          source_genotype_id: SOURCE_GENOTYPE_ID,
          mutation_probability_source:
            'repository-owned curated mutation graph',
          probability_claim:
            'configured model-target / mechanistic-approximation probabilities only',
        },
        workload: {
          replicate_count: REPLICATE_COUNT,
          division_opportunities_per_replicate:
            DIVISION_OPPORTUNITIES_PER_REPLICATE,
          aggregate_division_opportunities:
            REPLICATE_COUNT * DIVISION_OPPORTUNITIES_PER_REPLICATE,
          seed_start: seeds[0],
          seed_end: seeds.at(-1),
          seed_count: seeds.length,
          note:
            'Division opportunities here are an explicit statistical workload for the sampler contract, not a measured population size or biological calibration.',
        },
        sampling_policy: {
          ...SAMPLING_POLICY,
          identity: policyIdentity,
          observed_modes: first.modes,
          total_rng_draws: first.totalRngDraws,
        },
        tolerances: {
          policy:
            'Observed marginal edge counts and replicate-level at-least-one frequency must lie within max(8 counts, 8 standard deviations) of the exact configured law.',
          sigma_multiplier: SIGMA_MULTIPLIER,
          minimum_absolute_count_tolerance:
            MIN_ABSOLUTE_COUNT_TOLERANCE,
          note:
            'This is a conservative finite-sample numerical acceptance envelope, not a biological confidence interval.',
        },
        edge_statistics: edgeResults,
        at_least_one_mutation: {
          total_mutation_probability_per_division: totalMutationProbability,
          exact_no_event_probability_per_replicate: noEventProbability,
          exact_at_least_one_probability_per_replicate:
            atLeastOneProbability,
          expected_replicates_with_any_mutation:
            expectedReplicatesWithAnyMutation,
          variance: anyMutationVariance,
          sigma: anyMutationSigma,
          tolerance: anyMutationTolerance,
          observed_replicates_with_any_mutation:
            first.replicatesWithAnyMutation,
          accepted: anyMutationAccepted,
        },
        deterministic_replay: {
          accepted: replay.sequenceSha256 === first.sequenceSha256,
          sequence_sha256: first.sequenceSha256,
        },
        guardrails: {
          reference_path_matches_bounded_sampler_below_exact_limit: true,
          zero_probability_control_produces_zero_mutations: true,
          every_replicate_mutant_count_lte_division_opportunities: true,
          accelerated_mode_only: acceleratedModeOnly,
        },
        acceptance: {
          all_edge_marginals_within_declared_envelope: allEdgesAccepted,
          at_least_one_frequency_within_declared_envelope:
            anyMutationAccepted,
          deterministic_replay_exact: replay.sequenceSha256 === first.sequenceSha256,
          accelerated_exact_sampler_exercised: acceleratedModeOnly,
          overall: allAccepted,
        },
        limitations: [
          'Agreement validates the numerical sampler against Petra\'s configured multinomial/Binomial model law; it is not biological validation of the mutation probabilities.',
          'The Huseby-derived Petra edge values are explicitly mechanistic approximations/model targets, not measured probabilities of these exact curated transitions.',
          'This prepared harness consumes explicit safe-integer division opportunities directly. It does not prove composed ecology-to-opportunity or child-lineage materialization is integrated; those remain gated on #562/#5/#37.',
          'Selected appearance-rate validation targets in the flagship preset are aggregate experimental outcomes and are deliberately not relabeled as exact edge probabilities here.',
          'The experiment-owned sampling policy is numerical work-budget configuration only and does not alter mutation biology.',
        ],
      }

      writeCompactResult(compactResult)
      evidenceWritten = true

      expect(allEdgesAccepted).toBe(true)
      expect(anyMutationAccepted).toBe(true)
      expect(acceleratedModeOnly).toBe(true)
      expect(replay.sequenceSha256).toBe(first.sequenceSha256)
    } catch (error) {
      if (!evidenceWritten) {
        writeCompactResult({
          schema_version: 1,
          experiment_id: EXPERIMENT_ID,
          status: 'failed',
          started_at_utc: startedAt,
          completed_at_utc: new Date().toISOString(),
          local_run_id: process.env.PETRA_LOCAL_RUN_ID ?? null,
          failure: {
            name: error instanceof Error ? error.name : 'UnknownError',
            message: error instanceof Error ? error.message : String(error),
          },
        })
      }
      throw error
    }
  })
})
