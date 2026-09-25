import assert from 'node:assert/strict'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createComposedState,
  stepComposedStateDetailed,
  type ComposedSimulationConfig,
} from '../src/sim/authoritative'
import { CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION } from '../src/sim/ciprofloxacinIntervention'
import { ComposedSimulationEngine } from '../src/sim/composedEngine'
import {
  buildTwoBacteriumSharedResourceRunPlan,
  type TwoBacteriumComposedRunPlan,
  type TwoBacteriumFounderInoculum,
} from '../src/sim/twoBacteriumComposition'
import {
  REQUIRED_TWO_BACTERIUM_CONTROL_IDS,
  REQUIRED_TWO_BACTERIUM_LIMITATIONS,
  TWO_BACTERIUM_MECHANISM_SCOPE,
  TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_EXPERIMENT_ID,
  TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_SCHEMA_VERSION,
  UNBOUND_TWO_BACTERIUM_CONTENT_PACK_LIMITATION,
  assessTwoBacteriumSharedResourceValidationEvidence,
  type TwoBacteriumSharedResourceValidationEvidence,
  type TwoBacteriumTaxonRole,
  type TwoBacteriumValidationControl,
} from './two_bacterium_shared_resource_validation'

const SEEDS = Object.freeze([0x5eed0907, 0x5eed0908, 0x5eed0909])
const HORIZON_TICKS = 32
const SAMPLING_CADENCE_TICKS = 8
const ISOLATED_GROWTH_TICKS = 8
const ENGINEERING_INITIAL_RESOURCE = 8
const ENGINEERING_FOUNDER_BIOMASS = 1

const ECOLI_FOUNDER = 'ecoli-founder'
const BACILLUS_FOUNDER = 'bsubtilis-founder'
const ECOLI_TAXON_ID = 'ecoli-k12-mg1655'
const BACILLUS_TAXON_ID = 'bsubtilis-168-trp-plus-sige-minus'

interface IsolatedGrowthMeasurement {
  readonly founderLineageId: string
  readonly runtimeLineageId: string
  readonly sourceTargetPerHour: number
  readonly observedLogGrowthPerHour: number
  readonly absoluteTargetDistancePerHour: number
}

interface TrajectorySummary {
  readonly seed: number
  readonly finalTick: number
  readonly simulationTimeHours: number
  readonly totalBiomass: number
  readonly totalResource: number
  readonly traceHash: string
}

interface CompactTwoBacteriumEvidence
  extends TwoBacteriumSharedResourceValidationEvidence {
  readonly runMetadata: {
    readonly classification: 'local-mechanistic-validation'
    readonly localRunId: string | null
    readonly startedAtUtc: string
    readonly completedAtUtc: string
    readonly standaloneContentPackIssue: 992
  }
  readonly engineeringRunState: {
    readonly initialResourceLevel: number
    readonly founderBiomass: number
    readonly note: string
  }
  readonly measurements: {
    readonly isolatedGrowth: readonly IsolatedGrowthMeasurement[]
    readonly sourceTargetRatioBacillusToEcoli: number
    readonly observedRatioBacillusToEcoli: number
    readonly ratioAbsoluteDistance: number
    readonly trajectories: readonly TrajectorySummary[]
  }
  readonly assessment: ReturnType<
    typeof assessTwoBacteriumSharedResourceValidationEvidence
  >
}

function writeCompactResult(result: unknown): void {
  const output = process.env.PETRA_LOCAL_RESULT_JSON
  if (output === undefined || output.trim() === '') return

  mkdirSync(dirname(output), { recursive: true })
  const temporary = `${output}.tmp`
  writeFileSync(temporary, JSON.stringify(result, null, 2) + '\n', 'utf8')
  renameSync(temporary, output)
}

function samplePeakRss(previous: number): number {
  return Math.max(previous, process.memoryUsage().rss)
}

function total(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0)
}

function assertNear(
  actual: number,
  expected: number,
  label: string,
  relativeTolerance = 1e-6,
): void {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected))
  assert.ok(
    Math.abs(actual - expected) <= relativeTolerance * scale,
    `${label}: expected ${expected}, received ${actual}`,
  )
}

function mixedInocula(): readonly TwoBacteriumFounderInoculum[] {
  return Object.freeze([
    Object.freeze({
      lineageId: ECOLI_FOUNDER,
      x: 76,
      y: 80,
      biomass: ENGINEERING_FOUNDER_BIOMASS,
    }),
    Object.freeze({
      lineageId: BACILLUS_FOUNDER,
      x: 84,
      y: 80,
      biomass: ENGINEERING_FOUNDER_BIOMASS,
    }),
  ])
}

function plan(
  seed = SEEDS[0]!,
  initialResourceLevel = ENGINEERING_INITIAL_RESOURCE,
  inocula: readonly TwoBacteriumFounderInoculum[] = mixedInocula(),
): TwoBacteriumComposedRunPlan {
  return buildTwoBacteriumSharedResourceRunPlan({
    seed,
    initialResourceLevel,
    inocula,
  })
}

function runtimeLineageIndex(
  runPlan: TwoBacteriumComposedRunPlan,
  founderLineageId: string,
): number {
  const index = runPlan.config.lineages.findIndex(
    (lineage) => lineage.id === founderLineageId,
  )
  assert.notEqual(index, -1, `missing configured founder ${founderLineageId}`)
  return index
}

function isolatedGrowth(
  founderLineageId: string,
): IsolatedGrowthMeasurement {
  const runPlan = plan(SEEDS[0], ENGINEERING_INITIAL_RESOURCE, [
    {
      lineageId: founderLineageId,
      x: 80,
      y: 80,
      biomass: ENGINEERING_FOUNDER_BIOMASS,
    },
  ])
  const engine = new ComposedSimulationEngine(runPlan.identity, runPlan.config)
  const initial = engine.snapshot()
  const founderIndex = runtimeLineageIndex(runPlan, founderLineageId)
  const runtimeLineageId =
    initial.checkpoint.composedState.lineageIds[founderIndex]!
  const initialBiomass =
    initial.checkpoint.metrics.lineageBiomass[runtimeLineageId]!

  const final = engine.execute({
    id: `isolated-${founderLineageId}-advance`,
    type: 'advance',
    ticks: ISOLATED_GROWTH_TICKS,
  })
  const finalBiomass =
    final.checkpoint.metrics.lineageBiomass[runtimeLineageId]!
  const durationHours =
    ISOLATED_GROWTH_TICKS * runPlan.config.hoursPerTick

  assert.ok(initialBiomass > 0)
  assert.ok(finalBiomass > initialBiomass)
  const observedLogGrowthPerHour =
    Math.log(finalBiomass / initialBiomass) / durationHours
  assert.ok(
    Number.isFinite(observedLogGrowthPerHour) &&
      observedLogGrowthPerHour > 0,
  )

  runPlan.config.lineages.forEach((_lineage, index) => {
    if (index === founderIndex) return
    const inactiveRuntimeId =
      final.checkpoint.composedState.lineageIds[index]!
    assert.equal(
      final.checkpoint.metrics.lineageBiomass[inactiveRuntimeId],
      0,
      'isolated control must not create the absent species',
    )
  })

  const target = runPlan.growthCalibration.targets.find(
    (candidate) => candidate.lineageId === founderLineageId,
  )
  assert.ok(target !== undefined)

  return Object.freeze({
    founderLineageId,
    runtimeLineageId,
    sourceTargetPerHour: target.valuePerHour,
    observedLogGrowthPerHour,
    absoluteTargetDistancePerHour: Math.abs(
      observedLogGrowthPerHour - target.valuePerHour,
    ),
  })
}

function reverseFounderOrder(
  config: ComposedSimulationConfig,
): ComposedSimulationConfig {
  return {
    ...structuredClone(config),
    lineages: [config.lineages[1]!, config.lineages[0]!],
    initialLineageBiomass: [
      [...config.initialLineageBiomass[1]!],
      [...config.initialLineageBiomass[0]!],
    ],
  }
}

function roleForTaxonId(taxonId: string): TwoBacteriumTaxonRole {
  if (taxonId === ECOLI_TAXON_ID) return 'ecoli-mg1655'
  if (taxonId === BACILLUS_TAXON_ID) {
    return 'bacillus-168-trp-plus-sigE-minus'
  }
  throw new Error(`unexpected two-bacterium taxon id ${taxonId}`)
}

function runTrajectory(seed: number): TrajectorySummary {
  const runPlan = plan(seed)
  const engine = new ComposedSimulationEngine(runPlan.identity, runPlan.config)
  let snapshot = engine.snapshot()

  for (
    let tick = SAMPLING_CADENCE_TICKS;
    tick <= HORIZON_TICKS;
    tick += SAMPLING_CADENCE_TICKS
  ) {
    snapshot = engine.execute({
      id: `validation-${seed}-advance-${tick}`,
      type: 'advance',
      ticks: SAMPLING_CADENCE_TICKS,
    })
  }

  assert.equal(snapshot.checkpoint.tick, HORIZON_TICKS)
  return Object.freeze({
    seed,
    finalTick: snapshot.checkpoint.tick,
    simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
    totalBiomass: snapshot.checkpoint.metrics.totalBiomass,
    totalResource: snapshot.checkpoint.metrics.totalResource,
    traceHash: snapshot.traceHash,
  })
}

describe.sequential('two-bacterium shared-resource validation', () => {
  it('validates the real named mixed-species authority and writes compact evidence', () => {
    const startedAtUtc = new Date().toISOString()
    const startedAt = performance.now()
    const controls: TwoBacteriumValidationControl[] = []
    let peakRssBytes = process.memoryUsage().rss
    const isolatedMeasurements: IsolatedGrowthMeasurement[] = []

    const runControl = (
      id: (typeof REQUIRED_TWO_BACTERIUM_CONTROL_IDS)[number],
      execute: () => string,
    ): void => {
      try {
        const detail = execute()
        controls.push({ id, status: 'passed', detail })
      } catch (error) {
        controls.push({
          id,
          status: 'failed',
          detail:
            error instanceof Error
              ? `${error.name}: ${error.message}`
              : String(error),
        })
      } finally {
        peakRssBytes = samplePeakRss(peakRssBytes)
      }
    }

    try {
      runControl('isolated-ecoli-growth', () => {
        const measurement = isolatedGrowth(ECOLI_FOUNDER)
        isolatedMeasurements.push(measurement)
        return `E. coli-only biomass increased over ${ISOLATED_GROWTH_TICKS} authoritative ticks; observed log-growth rate ${measurement.observedLogGrowthPerHour.toPrecision(8)} 1/hour in engineering model-resource conditions.`
      })

      runControl('isolated-bacillus-growth', () => {
        const measurement = isolatedGrowth(BACILLUS_FOUNDER)
        isolatedMeasurements.push(measurement)
        return `Bacillus-only biomass increased over ${ISOLATED_GROWTH_TICKS} authoritative ticks; observed log-growth rate ${measurement.observedLogGrowthPerHour.toPrecision(8)} 1/hour in engineering model-resource conditions.`
      })

      runControl('zero-resource-no-biomass-production', () => {
        const runPlan = plan(SEEDS[0], 0)
        const engine = new ComposedSimulationEngine(
          runPlan.identity,
          runPlan.config,
        )
        const initial = engine.snapshot()
        const final = engine.execute({
          id: 'zero-resource-advance',
          type: 'advance',
          ticks: SAMPLING_CADENCE_TICKS,
        })
        assert.equal(final.checkpoint.metrics.totalResource, 0)
        assert.equal(final.checkpoint.metrics.divisionBiomass, 0)
        assertNear(
          final.checkpoint.metrics.totalBiomass,
          initial.checkpoint.metrics.totalBiomass,
          'zero-resource total biomass',
        )
        return 'Zero authoritative model-resource produced zero division biomass and conserved existing biomass with zero configured baseline loss.'
      })

      runControl('identical-trait-symmetry', () => {
        const runPlan = plan(SEEDS[0], ENGINEERING_INITIAL_RESOURCE, [
          {
            lineageId: ECOLI_FOUNDER,
            x: 80,
            y: 80,
            biomass: ENGINEERING_FOUNDER_BIOMASS,
          },
          {
            lineageId: BACILLUS_FOUNDER,
            x: 80,
            y: 80,
            biomass: ENGINEERING_FOUNDER_BIOMASS,
          },
        ])
        const symmetricConfig: ComposedSimulationConfig = {
          ...structuredClone(runPlan.config),
          lineages: runPlan.config.lineages.map((lineage) => ({
            ...lineage,
            baselineGrowthRateScale: 1,
          })),
        }
        const state = createComposedState(symmetricConfig)
        stepComposedStateDetailed(state, symmetricConfig)
        assert.deepStrictEqual(
          state.lineageBiomass[0],
          state.lineageBiomass[1],
        )
        return 'A source-independent neutral-scale fixture with identical starting fields remained exactly symmetric after one ecology step.'
      })

      runControl('lineage-species-iteration-order-invariance', () => {
        const runPlan = plan()
        const forward = createComposedState(runPlan.config)
        const reversedConfig = reverseFounderOrder(runPlan.config)
        const reversed = createComposedState(reversedConfig)
        stepComposedStateDetailed(forward, runPlan.config)
        stepComposedStateDetailed(reversed, reversedConfig)
        assert.deepStrictEqual(reversed.resource, forward.resource)
        assert.deepStrictEqual(
          reversed.lineageBiomass[1],
          forward.lineageBiomass[0],
        )
        assert.deepStrictEqual(
          reversed.lineageBiomass[0],
          forward.lineageBiomass[1],
        )
        return 'Reversing founder/species channel order preserved the exact resource field and the corresponding per-founder biomass fields.'
      })

      runControl('shared-resource-local-capacity-coherence', () => {
        const runPlan = plan()
        const state = createComposedState(runPlan.config)
        const resourceBefore = total(state.resource)
        const biomassBefore = state.lineageBiomass.reduce(
          (sum, channel) => sum + total(channel),
          0,
        )
        const step = stepComposedStateDetailed(state, runPlan.config)
        const resourceAfter = total(state.resource)
        const biomassAfter = state.lineageBiomass.reduce(
          (sum, channel) => sum + total(channel),
          0,
        )
        assertNear(
          resourceBefore - resourceAfter,
          step.metrics.resourceConsumed,
          'resource-consumption ledger',
        )
        assertNear(
          biomassAfter - biomassBefore,
          step.metrics.divisionBiomass - step.metrics.deathBiomass,
          'biomass flux ledger',
        )
        for (let cell = 0; cell < state.mask.length; cell += 1) {
          if (state.mask[cell] !== 1) continue
          const localBiomass = state.lineageBiomass.reduce(
            (sum, channel) => sum + channel[cell]!,
            0,
          )
          assert.ok(
            localBiomass <= runPlan.config.growth.localCapacity + 1e-5,
            'local biomass exceeded configured model capacity',
          )
        }
        return 'One mixed authoritative step reconciled resource-consumption and biomass-flux ledgers and respected the configured local model-biomass capacity.'
      })

      runControl('same-seed-replay', () => {
        const runPlan = plan(SEEDS[0])
        const first = new ComposedSimulationEngine(
          runPlan.identity,
          runPlan.config,
        )
        const second = new ComposedSimulationEngine(
          runPlan.identity,
          runPlan.config,
        )
        assert.deepStrictEqual(first.snapshot(), second.snapshot())
        for (
          let tick = SAMPLING_CADENCE_TICKS;
          tick <= HORIZON_TICKS;
          tick += SAMPLING_CADENCE_TICKS
        ) {
          const command = {
            id: `same-seed-advance-${tick}`,
            type: 'advance' as const,
            ticks: SAMPLING_CADENCE_TICKS,
          }
          assert.deepStrictEqual(
            first.execute(command),
            second.execute(structuredClone(command)),
          )
        }
        return `Identical seed/config and ${HORIZON_TICKS}-tick command trace replayed byte-for-byte at the typed snapshot level.`
      })

      runControl('checkpoint-restore-continuation', () => {
        const runPlan = plan(SEEDS[1])
        const direct = new ComposedSimulationEngine(
          runPlan.identity,
          runPlan.config,
        )
        const checkpoint = direct.execute({
          id: 'checkpoint-prefix',
          type: 'advance',
          ticks: SAMPLING_CADENCE_TICKS,
        }).checkpoint
        const expected = direct.execute({
          id: 'checkpoint-suffix',
          type: 'advance',
          ticks: SAMPLING_CADENCE_TICKS,
        }).checkpoint

        const restored = new ComposedSimulationEngine(
          runPlan.identity,
          runPlan.config,
        )
        restored.execute({
          id: 'restore-mixed-checkpoint',
          type: 'restore',
          checkpoint: structuredClone(checkpoint),
        })
        const actual = restored.execute({
          id: 'checkpoint-suffix',
          type: 'advance',
          ticks: SAMPLING_CADENCE_TICKS,
        }).checkpoint
        assert.deepStrictEqual(actual, expected)
        return 'Restoring the mixed-species checkpoint and applying the same suffix reproduced the exact authoritative continuation.'
      })

      runControl('exact-lineage-taxon-identity', () => {
        const runPlan = plan()
        const snapshot = new ComposedSimulationEngine(
          runPlan.identity,
          runPlan.config,
        ).snapshot()
        const mapping = snapshot.checkpoint.composedState.lineageTaxonMap
        assert.ok(mapping !== undefined)
        assert.deepStrictEqual(
          mapping.taxonIds,
          runPlan.config.lineages.map((lineage) => lineage.taxonId),
        )
        assert.deepStrictEqual(
          mapping.taxonContentVersions,
          runPlan.config.lineages.map(
            (lineage) => lineage.taxonContentVersion,
          ),
        )
        assert.deepStrictEqual(mapping.lineageIds, ['L1', 'L2'])
        return 'Initial checkpoint carries exact runtime L1/L2 to taxon id+contentVersion authority matching founder order.'
      })

      runControl('isolated-growth-target-distance-reported', () => {
        const ecoli = isolatedMeasurements.find(
          (entry) => entry.founderLineageId === ECOLI_FOUNDER,
        )
        const bacillus = isolatedMeasurements.find(
          (entry) => entry.founderLineageId === BACILLUS_FOUNDER,
        )
        assert.ok(ecoli !== undefined && bacillus !== undefined)
        const sourceRatio =
          bacillus.sourceTargetPerHour / ecoli.sourceTargetPerHour
        const observedRatio =
          bacillus.observedLogGrowthPerHour /
          ecoli.observedLogGrowthPerHour
        assert.ok(Number.isFinite(sourceRatio) && sourceRatio > 0)
        assert.ok(Number.isFinite(observedRatio) && observedRatio > 0)
        return `Reported, not promoted: E. coli absolute target distance=${ecoli.absoluteTargetDistancePerHour.toPrecision(8)} 1/hour; Bacillus absolute target distance=${bacillus.absoluteTargetDistancePerHour.toPrecision(8)} 1/hour; observed Bacillus/E. coli ratio distance=${Math.abs(observedRatio - sourceRatio).toPrecision(8)}.`
      })

      runControl('bacillus-ciprofloxacin-refusal', () => {
        const runPlan = plan()
        const engine = new ComposedSimulationEngine(
          runPlan.identity,
          runPlan.config,
        )
        const before = engine.snapshot()
        assert.throws(
          () =>
            engine.execute({
              id: 'unsupported-bacillus-ciprofloxacin',
              type: 'apply-ciprofloxacin',
              intervention: {
                schemaVersion:
                  CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
                concentrationMgPerL: 0.1,
                concentrationUnit: 'mg/L',
                blendMode: 'set',
                geometry: { kind: 'global' },
              },
            }),
          /requires explicit pharmacodynamic authority/,
        )
        assert.deepStrictEqual(engine.snapshot(), before)
        return 'A Bacillus-containing run refused a validly shaped ciprofloxacin command because no mixed-species PD authority exists, with state unchanged.'
      })

      runControl('bacillus-evolution-refusal', () => {
        const runPlan = plan()
        assert.deepStrictEqual(runPlan.config.evolutionGraph.transitions, [])
        assert.equal(runPlan.config.dynamicLineageLossPolicy, null)
        assert.equal(runPlan.config.populationAuthority, null)
        return 'The named Bacillus scenario exposes no mutation transitions, dynamic-child loss policy, or population authority; Bacillus evolution is therefore fail-closed rather than borrowed from E. coli.'
      })

      assert.deepStrictEqual(
        controls.map((control) => control.id),
        [...REQUIRED_TWO_BACTERIUM_CONTROL_IDS],
      )

      const trajectories = SEEDS.map((seed) => {
        const summary = runTrajectory(seed)
        peakRssBytes = samplePeakRss(peakRssBytes)
        return summary
      })

      const runPlan = plan(SEEDS[0])
      const snapshot = new ComposedSimulationEngine(
        runPlan.identity,
        runPlan.config,
      ).snapshot()
      const mapping = snapshot.checkpoint.composedState.lineageTaxonMap
      assert.ok(mapping !== undefined)

      const ecoli = isolatedMeasurements.find(
        (entry) => entry.founderLineageId === ECOLI_FOUNDER,
      )
      const bacillus = isolatedMeasurements.find(
        (entry) => entry.founderLineageId === BACILLUS_FOUNDER,
      )
      assert.ok(ecoli !== undefined && bacillus !== undefined)
      const sourceTargetRatioBacillusToEcoli =
        bacillus.sourceTargetPerHour / ecoli.sourceTargetPerHour
      const observedRatioBacillusToEcoli =
        bacillus.observedLogGrowthPerHour /
        ecoli.observedLogGrowthPerHour

      const failures = controls
        .filter((control) => control.status === 'failed')
        .map((control) => `control failed: ${control.id}`)
      const completedAtUtc = new Date().toISOString()

      const baseEvidence: TwoBacteriumSharedResourceValidationEvidence = {
        schemaVersion:
          TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_SCHEMA_VERSION,
        experimentId:
          TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_EXPERIMENT_ID,
        mechanismScope: TWO_BACTERIUM_MECHANISM_SCOPE,
        scenario: {
          id: runPlan.identity.scenarioId,
          version: runPlan.identity.scenarioVersion,
        },
        parameterSet: {
          id: runPlan.identity.parameterSetId,
          version: runPlan.identity.parameterSetVersion,
        },
        contentPackManifest: null,
        configurationFingerprint:
          runPlan.parameterSetBinding.configurationFingerprint,
        taxa: runPlan.taxonRegistry.taxa.map((taxon) => ({
          role: roleForTaxonId(taxon.id),
          taxonId: taxon.id,
          taxonContentVersion: taxon.contentVersion,
          scientificName: taxon.scientificName,
          background: taxon.background,
        })),
        lineageTaxonAssignments: mapping.lineageIds.map(
          (lineageId, index) => ({
            lineageId,
            taxonId: mapping.taxonIds[index]!,
            taxonContentVersion:
              mapping.taxonContentVersions[index]!,
          }),
        ),
        units: {
          resource: 'model-resource',
          biomass: 'model-biomass',
        },
        seeds: SEEDS,
        horizonTicks: HORIZON_TICKS,
        samplingCadenceTicks: SAMPLING_CADENCE_TICKS,
        controls,
        limitations: [
          ...REQUIRED_TWO_BACTERIUM_LIMITATIONS,
          UNBOUND_TWO_BACTERIUM_CONTENT_PACK_LIMITATION,
        ],
        runtime: {
          status: failures.length === 0 ? 'completed' : 'failed',
          durationSeconds: (performance.now() - startedAt) / 1000,
          peakRssBytes,
          failures,
        },
      }
      const assessment =
        assessTwoBacteriumSharedResourceValidationEvidence(baseEvidence)

      const compactEvidence: CompactTwoBacteriumEvidence = {
        ...baseEvidence,
        runMetadata: {
          classification: 'local-mechanistic-validation',
          localRunId: process.env.PETRA_LOCAL_RUN_ID ?? null,
          startedAtUtc,
          completedAtUtc,
          standaloneContentPackIssue: 992,
        },
        engineeringRunState: {
          initialResourceLevel: ENGINEERING_INITIAL_RESOURCE,
          founderBiomass: ENGINEERING_FOUNDER_BIOMASS,
          note: 'Validation initialization is engineering model-resource/model-biomass state, not glucose, gCDW, CFU, or measured inoculum density.',
        },
        measurements: {
          isolatedGrowth: isolatedMeasurements,
          sourceTargetRatioBacillusToEcoli,
          observedRatioBacillusToEcoli,
          ratioAbsoluteDistance: Math.abs(
            observedRatioBacillusToEcoli -
              sourceTargetRatioBacillusToEcoli,
          ),
          trajectories,
        },
        assessment,
      }

      writeCompactResult(compactEvidence)

      expect(assessment.structuralErrors).toEqual([])
      expect(assessment.rejectionReasons).toEqual([])
      expect(assessment.accepted).toBe(true)
    } catch (error) {
      writeCompactResult({
        schemaVersion:
          TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_SCHEMA_VERSION,
        experimentId:
          TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_EXPERIMENT_ID,
        status: 'failed-before-evidence-finalization',
        startedAtUtc,
        completedAtUtc: new Date().toISOString(),
        localRunId: process.env.PETRA_LOCAL_RUN_ID ?? null,
        controls,
        failure: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  })
})
