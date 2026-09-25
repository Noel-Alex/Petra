import assert from 'node:assert/strict'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { performance } from 'node:perf_hooks'

import { describe, expect, it } from 'vitest'

import {
  createComposedState,
  stepComposedStateDetailed,
  type ComposedSimulationConfig,
  type ComposedSimulationState,
} from '../src/sim/authoritative'
import { CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION } from '../src/sim/ciprofloxacinIntervention'
import { ComposedSimulationEngine } from '../src/sim/composedEngine'
import { PROTOCOL_VERSION } from '../src/sim/protocol'
import { parseWorkerRequest } from '../src/sim/protocolRuntime'
import {
  buildTwoBacteriumSharedResourceRunPlan,
  type TwoBacteriumComposedRunPlan,
  type TwoBacteriumFounderInoculum,
} from '../src/sim/twoBacteriumComposition'
import {
  assessTwoBacteriumSharedResourceValidationEvidence,
  REQUIRED_TWO_BACTERIUM_LIMITATIONS,
  TWO_BACTERIUM_CONTENT_PACK_ID,
  TWO_BACTERIUM_CONTENT_PACK_VERSION,
  TWO_BACTERIUM_MECHANISM_SCOPE,
  TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_EXPERIMENT_ID,
  TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_SCHEMA_VERSION,
  type TwoBacteriumSharedResourceValidationEvidence,
  type TwoBacteriumTaxonEvidenceIdentity,
  type TwoBacteriumValidationControl,
} from './two_bacterium_shared_resource_validation'

const DEFAULT_SEEDS = [0, 20260925, 0xffffffff] as const
const HORIZON_TICKS = 16
const SAMPLING_CADENCE_TICKS = 4
const INITIAL_RESOURCE_LEVEL = 8
const FOUNDER_BIOMASS = 1

const ECOLI_FOUNDER = Object.freeze({
  lineageId: 'ecoli-founder',
  x: 76,
  y: 80,
  biomass: FOUNDER_BIOMASS,
})
const BACILLUS_FOUNDER = Object.freeze({
  lineageId: 'bsubtilis-founder',
  x: 84,
  y: 80,
  biomass: FOUNDER_BIOMASS,
})

interface IsolatedGrowthMeasurement {
  readonly lineageId: string
  readonly sourceTargetPerHour: number
  readonly observedModelRatePerHour: number
  readonly absoluteTargetDistancePerHour: number
  readonly finalModelBiomass: number
}

function writeCompactResult(result: unknown): void {
  const output = process.env.PETRA_LOCAL_RESULT_JSON
  if (output === undefined || output.trim() === '') return

  mkdirSync(dirname(output), { recursive: true })
  const temporary = `${output}.tmp`
  writeFileSync(temporary, JSON.stringify(result, null, 2) + '\n', 'utf8')
  renameSync(temporary, output)
}

function total(values: readonly number[]): number {
  let result = 0
  for (const value of values) result += value
  return result
}

function totalBiomass(state: ComposedSimulationState): number {
  let result = 0
  for (const channel of state.lineageBiomass) result += total(channel)
  return result
}

function totalResource(state: ComposedSimulationState): number {
  let result = 0
  for (let index = 0; index < state.mask.length; index += 1) {
    if (state.mask[index] === 1) result += state.resource[index]!
  }
  return result
}

function resourceConsumption(
  initial: ComposedSimulationState,
  final: ComposedSimulationState,
): number {
  assert.equal(final.mask.length, initial.mask.length)
  let result = 0
  for (let index = 0; index < initial.mask.length; index += 1) {
    if (initial.mask[index] !== 1) continue
    result += initial.resource[index]! - final.resource[index]!
  }
  return result
}

function founderInocula(kind: 'mixed' | 'ecoli' | 'bacillus'): readonly TwoBacteriumFounderInoculum[] {
  if (kind === 'ecoli') return [ECOLI_FOUNDER]
  if (kind === 'bacillus') return [BACILLUS_FOUNDER]
  return [ECOLI_FOUNDER, BACILLUS_FOUNDER]
}

function planFor(args?: {
  readonly seed?: number
  readonly initialResourceLevel?: number
  readonly kind?: 'mixed' | 'ecoli' | 'bacillus'
  readonly colocated?: boolean
}): TwoBacteriumComposedRunPlan {
  const kind = args?.kind ?? 'mixed'
  const inocula = founderInocula(kind).map((inoculum) => ({
    ...inoculum,
    ...(args?.colocated ? { x: 80, y: 80 } : {}),
  }))
  return buildTwoBacteriumSharedResourceRunPlan({
    seed: args?.seed ?? DEFAULT_SEEDS[1],
    initialResourceLevel: args?.initialResourceLevel ?? INITIAL_RESOURCE_LEVEL,
    inocula,
  })
}

function finalAfter(
  plan: TwoBacteriumComposedRunPlan,
  ticks: number,
  commandId: string,
) {
  const engine = new ComposedSimulationEngine(plan.identity, plan.config)
  const initial = engine.snapshot()
  const final = engine.execute({ id: commandId, type: 'advance', ticks })
  return { initial, final }
}

function isolatedGrowth(
  kind: 'ecoli' | 'bacillus',
): IsolatedGrowthMeasurement {
  const plan = planFor({ kind })
  const channelIndex = kind === 'ecoli' ? 0 : 1
  const founderId =
    kind === 'ecoli' ? ECOLI_FOUNDER.lineageId : BACILLUS_FOUNDER.lineageId
  const sourceTarget = plan.growthCalibration.targets.find(
    (target) => target.lineageId === founderId,
  )
  assert.ok(sourceTarget, `missing source growth target for ${founderId}`)

  const { initial, final } = finalAfter(
    plan,
    HORIZON_TICKS,
    `isolated-${kind}-advance`,
  )
  const initialBiomass = total(
    initial.checkpoint.composedState.lineageBiomass[channelIndex]!,
  )
  const finalBiomass = total(
    final.checkpoint.composedState.lineageBiomass[channelIndex]!,
  )
  const absentBiomass = total(
    final.checkpoint.composedState.lineageBiomass[channelIndex === 0 ? 1 : 0]!,
  )
  const horizonHours = HORIZON_TICKS * plan.config.hoursPerTick

  assert.ok(finalBiomass > initialBiomass, `${kind} must grow with model-resource present`)
  assert.equal(absentBiomass, 0, `${kind} isolated control must not create the absent taxon`)
  assert.ok(horizonHours > 0)

  const observedModelRatePerHour =
    Math.log(finalBiomass / initialBiomass) / horizonHours
  assert.ok(
    Number.isFinite(observedModelRatePerHour) && observedModelRatePerHour >= 0,
    'observed isolated model growth rate must be finite and non-negative',
  )

  return {
    lineageId: founderId,
    sourceTargetPerHour: sourceTarget.valuePerHour,
    observedModelRatePerHour,
    absoluteTargetDistancePerHour: Math.abs(
      observedModelRatePerHour - sourceTarget.valuePerHour,
    ),
    finalModelBiomass: finalBiomass,
  }
}

function reversedConfig(
  config: ComposedSimulationConfig,
): ComposedSimulationConfig {
  return {
    ...config,
    lineages: [config.lineages[1]!, config.lineages[0]!],
    initialLineageBiomass: [
      config.initialLineageBiomass[1]!,
      config.initialLineageBiomass[0]!,
    ],
  }
}

function evidenceTaxa(
  plan: TwoBacteriumComposedRunPlan,
): readonly TwoBacteriumTaxonEvidenceIdentity[] {
  const ecoli = plan.taxonRegistry.taxa.find(
    (taxon) => taxon.id === 'ecoli-k12-mg1655',
  )
  const bacillus = plan.taxonRegistry.taxa.find(
    (taxon) => taxon.id === 'bsubtilis-168-trp-plus-sige-minus',
  )
  assert.ok(ecoli, 'exact E. coli taxon revision is required')
  assert.ok(bacillus, 'exact Bacillus taxon revision is required')

  return [
    {
      role: 'ecoli-mg1655',
      taxonId: ecoli.id,
      taxonContentVersion: ecoli.contentVersion,
      scientificName: ecoli.scientificName,
      background: ecoli.background,
    },
    {
      role: 'bacillus-168-trp-plus-sigE-minus',
      taxonId: bacillus.id,
      taxonContentVersion: bacillus.contentVersion,
      scientificName: bacillus.scientificName,
      background: bacillus.background,
    },
  ]
}

function recordControl(
  controls: TwoBacteriumValidationControl[],
  id: TwoBacteriumValidationControl['id'],
  check: () => string,
): void {
  try {
    controls.push({ id, status: 'passed', detail: check() })
  } catch (error) {
    controls.push({
      id,
      status: 'failed',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}

describe.sequential('two-bacterium shared-resource local validation', () => {
  it('records the complete real-engine validation contract', () => {
    const startedAtUtc = new Date().toISOString()
    const startedAt = performance.now()
    const rssStartBytes = process.memoryUsage().rss
    const controls: TwoBacteriumValidationControl[] = []
    const measurements: Record<string, unknown> = {}

    try {
      const referencePlan = planFor()
      const referenceSnapshot = new ComposedSimulationEngine(
        referencePlan.identity,
        referencePlan.config,
      ).snapshot()

      recordControl(controls, 'isolated-ecoli-growth', () => {
        const result = isolatedGrowth('ecoli')
        measurements.isolated_ecoli = result
        return (
          'E. coli MG1655 increased from its engineering founder biomass while ' +
          'the Bacillus channel remained exactly zero; values remain model-biomass.'
        )
      })

      recordControl(controls, 'isolated-bacillus-growth', () => {
        const result = isolatedGrowth('bacillus')
        measurements.isolated_bacillus = result
        return (
          'B. subtilis 168 trp+ sigE- increased from its engineering founder biomass ' +
          'while the E. coli channel remained exactly zero; values remain model-biomass.'
        )
      })

      recordControl(controls, 'zero-resource-no-biomass-production', () => {
        const plan = planFor({ initialResourceLevel: 0 })
        const { initial, final } = finalAfter(
          plan,
          HORIZON_TICKS,
          'zero-resource-advance',
        )
        assert.equal(final.checkpoint.metrics.totalResource, 0)
        assert.equal(final.checkpoint.metrics.divisionBiomass, 0)
        assert.ok(
          Math.abs(
            totalBiomass(final.checkpoint.composedState) -
              totalBiomass(initial.checkpoint.composedState),
          ) <= 1e-9,
          'zero model-resource must not create biomass',
        )
        return 'Zero model-resource produced zero division biomass and conserved founder biomass.'
      })

      recordControl(controls, 'identical-trait-symmetry', () => {
        const plan = planFor({ colocated: true })
        const symmetricConfig: ComposedSimulationConfig = {
          ...plan.config,
          lineages: plan.config.lineages.map((lineage) => ({
            ...lineage,
            baselineGrowthRateScale: 1,
          })),
        }
        const state = createComposedState(symmetricConfig)
        for (let tick = 0; tick < HORIZON_TICKS; tick += 1) {
          stepComposedStateDetailed(state, symmetricConfig)
        }
        const first = total(state.lineageBiomass[0]!)
        const second = total(state.lineageBiomass[1]!)
        assert.ok(
          Math.abs(first - second) <= 1e-6,
          'equal-trait colocated founders must remain symmetric',
        )
        return 'Equal-trait colocated founders remained symmetric under the shared ecology mechanism.'
      })

      recordControl(
        controls,
        'lineage-species-iteration-order-invariance',
        () => {
          const plan = planFor()
          const forward = createComposedState(plan.config)
          const reverseConfig = reversedConfig(plan.config)
          const reverse = createComposedState(reverseConfig)
          stepComposedStateDetailed(forward, plan.config)
          stepComposedStateDetailed(reverse, reverseConfig)

          assert.deepStrictEqual(reverse.resource, forward.resource)
          assert.deepStrictEqual(
            reverse.lineageBiomass[1],
            forward.lineageBiomass[0],
          )
          assert.deepStrictEqual(
            reverse.lineageBiomass[0],
            forward.lineageBiomass[1],
          )
          return 'One authoritative ecology step was invariant to reversing the configured lineage/species order.'
        },
      )

      recordControl(controls, 'shared-resource-local-capacity-coherence', () => {
        const plan = planFor()
        const { initial, final } = finalAfter(
          plan,
          HORIZON_TICKS,
          'mixed-resource-coherence-advance',
        )
        const initialResource = totalResource(initial.checkpoint.composedState)
        const finalResource = totalResource(final.checkpoint.composedState)
        const initialBiomass = totalBiomass(initial.checkpoint.composedState)
        const finalBiomass = totalBiomass(final.checkpoint.composedState)
        const resourceConsumed = resourceConsumption(
          initial.checkpoint.composedState,
          final.checkpoint.composedState,
        )
        const biomassProduced = finalBiomass - initialBiomass
        const expectedBiomassProduced =
          resourceConsumed * plan.config.growth.biomassYield

        assert.ok(finalResource >= 0 && finalResource <= initialResource)
        assert.ok(finalBiomass >= initialBiomass)
        assert.ok(resourceConsumed >= 0)
        assert.ok(
          Math.abs(expectedBiomassProduced - biomassProduced) <=
            Math.max(1e-5, Math.abs(expectedBiomassProduced) * 1e-5),
          'mixed growth must preserve the configured model-resource-to-model-biomass yield accounting',
        )

        let maximumLocalBiomass = 0
        const state = final.checkpoint.composedState
        for (let cell = 0; cell < state.mask.length; cell += 1) {
          if (state.mask[cell] !== 1) continue
          let local = 0
          for (const channel of state.lineageBiomass) local += channel[cell]!
          maximumLocalBiomass = Math.max(maximumLocalBiomass, local)
          assert.ok(
            local <= plan.config.growth.localCapacity + 1e-5,
            'local biomass must remain within configured model capacity',
          )
        }

        measurements.mixed_resource_coherence = {
          initial_model_resource: initialResource,
          final_model_resource: finalResource,
          model_resource_consumed: resourceConsumed,
          initial_model_biomass: initialBiomass,
          final_model_biomass: finalBiomass,
          model_biomass_produced: biomassProduced,
          expected_model_biomass_from_configured_yield:
            expectedBiomassProduced,
          configured_model_biomass_yield:
            plan.config.growth.biomassYield,
          maximum_local_model_biomass: maximumLocalBiomass,
          configured_local_capacity: plan.config.growth.localCapacity,
        }
        return 'Mixed growth depleted shared model-resource, respected local capacity, and matched the configured engineering yield accounting.'
      })

      recordControl(controls, 'same-seed-replay', () => {
        const replayResults = DEFAULT_SEEDS.map((seed) => {
          const plan = planFor({ seed })
          const commands = Array.from(
            { length: HORIZON_TICKS / SAMPLING_CADENCE_TICKS },
            (_, index) => ({
              id: `replay-${seed}-advance-${index}`,
              type: 'advance' as const,
              ticks: SAMPLING_CADENCE_TICKS,
            }),
          )
          const a = new ComposedSimulationEngine(plan.identity, plan.config)
          const b = new ComposedSimulationEngine(plan.identity, plan.config)
          for (const command of commands) {
            a.execute(command)
            b.execute(structuredClone(command))
          }
          const aFinal = a.snapshot()
          const bFinal = b.snapshot()
          assert.deepStrictEqual(bFinal, aFinal)
          return { seed, final_trace_hash: aFinal.traceHash }
        })
        measurements.replay = replayResults
        return `Exact same-seed replay matched for ${DEFAULT_SEEDS.length} canonical uint32 seeds.`
      })

      recordControl(controls, 'checkpoint-restore-continuation', () => {
        const plan = planFor()
        const direct = new ComposedSimulationEngine(plan.identity, plan.config)
        const midpoint = direct.execute({
          id: 'checkpoint-prefix',
          type: 'advance',
          ticks: HORIZON_TICKS / 2,
        }).checkpoint
        const expected = direct.execute({
          id: 'checkpoint-suffix',
          type: 'advance',
          ticks: HORIZON_TICKS / 2,
        }).checkpoint

        const restored = new ComposedSimulationEngine(
          plan.identity,
          plan.config,
        )
        restored.execute({
          id: 'checkpoint-restore',
          type: 'restore',
          checkpoint: structuredClone(midpoint),
        })
        const continued = restored.execute({
          id: 'checkpoint-suffix',
          type: 'advance',
          ticks: HORIZON_TICKS / 2,
        }).checkpoint
        assert.deepStrictEqual(continued, expected)
        return 'Checkpoint restore plus the identical suffix reproduced the exact final authoritative checkpoint.'
      })

      recordControl(controls, 'exact-lineage-taxon-identity', () => {
        const map = referenceSnapshot.checkpoint.composedState.lineageTaxonMap
        assert.ok(map, 'runtime lineage-to-taxon map is required')
        assert.deepStrictEqual(map.lineageIds, ['L1', 'L2'])
        assert.deepStrictEqual(map.taxonIds, [
          'ecoli-k12-mg1655',
          'bsubtilis-168-trp-plus-sige-minus',
        ])
        assert.deepStrictEqual(map.taxonContentVersions, [
          'lacroix-2015-growth-context-v1',
          'tannler-2008-growth-context-v1',
        ])
        return 'Runtime L1/L2 channels carry the exact E. coli and Bacillus taxon content revisions from the scenario.'
      })

      recordControl(
        controls,
        'isolated-growth-target-distance-reported',
        () => {
          const ecoli =
            (measurements.isolated_ecoli as IsolatedGrowthMeasurement | undefined) ??
            isolatedGrowth('ecoli')
          const bacillus =
            (measurements.isolated_bacillus as IsolatedGrowthMeasurement | undefined) ??
            isolatedGrowth('bacillus')
          measurements.isolated_growth_target_distance = {
            classification: 'calibration-distance-only',
            source_unit: '1/hour',
            model_unit: '1/hour',
            ecoli,
            bacillus,
            limitation:
              'Distances compare source-isolated growth targets with this dimensionless engineering execution profile. They do not promote model-resource/model-biomass to physical glucose/gCDW or constitute co-culture validation.',
          }
          assert.ok(Number.isFinite(ecoli.absoluteTargetDistancePerHour))
          assert.ok(Number.isFinite(bacillus.absoluteTargetDistancePerHour))
          return 'Finite source-target distances were reported without imposing a physical-calibration pass threshold.'
        },
      )

      recordControl(controls, 'bacillus-ciprofloxacin-refusal', () => {
        const plan = planFor()
        const engine = new ComposedSimulationEngine(plan.identity, plan.config)
        const before = engine.snapshot()
        assert.throws(
          () =>
            engine.execute({
              id: 'unsupported-bacillus-ciprofloxacin',
              type: 'apply-ciprofloxacin',
              intervention: {
                schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
                concentrationMgPerL: 0.1,
                concentrationUnit: 'mg/L',
                blendMode: 'set',
                geometry: { kind: 'global' },
              },
            }),
          /requires explicit pharmacodynamic authority/i,
        )
        assert.deepStrictEqual(engine.snapshot(), before)
        return 'A non-zero ciprofloxacin refusal sentinel was rejected atomically because the mixed scenario has no Bacillus pharmacodynamic authority.'
      })

      recordControl(controls, 'bacillus-evolution-refusal', () => {
        assert.equal(referencePlan.config.evolutionGraph.transitions.length, 0)
        const parsed = parseWorkerRequest({
          protocolVersion: PROTOCOL_VERSION,
          type: 'command',
          command: {
            id: 'unsupported-bacillus-evolution',
            type: 'evolve-bacillus',
          },
        })
        assert.equal(parsed.ok, false)
        if (parsed.ok) throw new Error('unsupported Bacillus evolution command was accepted')
        assert.equal(parsed.commandId, 'unsupported-bacillus-evolution')
        return 'The scenario contains no mutation transitions and the current protocol refuses an untyped Bacillus evolution command before engine dispatch.'
      })

      const lineageTaxonMap =
        referenceSnapshot.checkpoint.composedState.lineageTaxonMap
      assert.ok(lineageTaxonMap, 'reference runtime taxon map is required')

      const failures = controls
        .filter((control) => control.status === 'failed')
        .map((control) => `${control.id}: ${control.detail}`)
      const durationSeconds = (performance.now() - startedAt) / 1000
      const evidence: TwoBacteriumSharedResourceValidationEvidence = {
        schemaVersion: TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_SCHEMA_VERSION,
        experimentId: TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_EXPERIMENT_ID,
        mechanismScope: TWO_BACTERIUM_MECHANISM_SCOPE,
        scenario: {
          id: referencePlan.identity.scenarioId,
          version: referencePlan.identity.scenarioVersion,
        },
        contentPack: {
          id: TWO_BACTERIUM_CONTENT_PACK_ID,
          version: TWO_BACTERIUM_CONTENT_PACK_VERSION,
        },
        contentPackBinding: {
          status: 'bound',
          limitation: null,
        },
        configurationFingerprint:
          referencePlan.parameterSetBinding.configurationFingerprint,
        taxa: evidenceTaxa(referencePlan),
        lineageTaxonAssignments: lineageTaxonMap.lineageIds.map(
          (lineageId, index) => ({
            lineageId,
            taxonId: lineageTaxonMap.taxonIds[index]!,
            taxonContentVersion:
              lineageTaxonMap.taxonContentVersions[index]!,
          }),
        ),
        units: {
          resource: 'model-resource',
          biomass: 'model-biomass',
        },
        seeds: [...DEFAULT_SEEDS],
        horizonTicks: HORIZON_TICKS,
        samplingCadenceTicks: SAMPLING_CADENCE_TICKS,
        controls,
        limitations: [...REQUIRED_TWO_BACTERIUM_LIMITATIONS],
        runtime: {
          status: failures.length === 0 ? 'completed' : 'failed',
          durationSeconds,
          peakRssBytes: null,
          failures,
        },
      }

      const assessment =
        assessTwoBacteriumSharedResourceValidationEvidence(evidence)
      const compactResult = {
        ...evidence,
        assessment,
        startedAtUtc,
        completedAtUtc: new Date().toISOString(),
        localRunId: process.env.PETRA_LOCAL_RUN_ID ?? null,
        contentPackIdentityNote:
          `Exact inert content pack ${TWO_BACTERIUM_CONTENT_PACK_ID}@${TWO_BACTERIUM_CONTENT_PACK_VERSION} is bound independently of scenario identity.`,
        runtimeMemory: {
          rssStartBytes,
          rssEndBytes: process.memoryUsage().rss,
          peakRssBytes: null,
          note:
            'RSS endpoints are observational only. No continuous sampler ran, so this experiment does not relabel either endpoint as peak RSS.',
        },
        measurements,
      }
      writeCompactResult(compactResult)

      assert.equal(
        assessment.mechanisticAccepted,
        true,
        [
          ...assessment.structuralErrors,
          ...assessment.rejectionReasons,
        ].join('; '),
      )
      assert.equal(assessment.provenanceComplete, true)
      assert.equal(
        assessment.accepted,
        true,
        assessment.promotionBlockers.join('; '),
      )
      assert.deepStrictEqual(assessment.promotionBlockers, [])
      expect(controls).toHaveLength(12)
    } catch (error) {
      writeCompactResult({
        schemaVersion: TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_SCHEMA_VERSION,
        experimentId: TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_EXPERIMENT_ID,
        status: 'failed',
        startedAtUtc,
        completedAtUtc: new Date().toISOString(),
        localRunId: process.env.PETRA_LOCAL_RUN_ID ?? null,
        controls,
        failure: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
        },
        runtimeMemory: {
          rssStartBytes,
          rssEndBytes: process.memoryUsage().rss,
          peakRssBytes: null,
        },
      })
      throw error
    }
  })
})
