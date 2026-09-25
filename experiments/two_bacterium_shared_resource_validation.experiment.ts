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
import {
  CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
} from '../src/sim/ciprofloxacinIntervention'
import { ComposedSimulationEngine } from '../src/sim/composedEngine'
import {
  buildTwoBacteriumSharedResourceRunPlan,
  type TwoBacteriumComposedRunPlan,
  type TwoBacteriumRunInitialization,
} from '../src/sim/twoBacteriumComposition'
import type {
  ComposedSimulationSnapshot,
} from '../src/sim/protocol'
import {
  REQUIRED_TWO_BACTERIUM_CONTROL_IDS,
  REQUIRED_TWO_BACTERIUM_LIMITATIONS,
  TWO_BACTERIUM_MECHANISM_SCOPE,
  TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_EXPERIMENT_ID,
  TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_SCHEMA_VERSION,
  assessTwoBacteriumSharedResourceValidationEvidence,
  validateTwoBacteriumSharedResourceValidationEvidence,
  type TwoBacteriumControlId,
  type TwoBacteriumSharedResourceValidationEvidence,
  type TwoBacteriumValidationControl,
} from './two_bacterium_shared_resource_validation'

const SEEDS = Object.freeze([20260925, 20260926, 20260927] as const)
const HORIZON_TICKS = 64
const SAMPLING_CADENCE_TICKS = 16
const INITIAL_RESOURCE_LEVEL = 1
const INOCULUM_BIOMASS = 1
const ECOLI_FOUNDER_ID = 'ecoli-founder'
const BACILLUS_FOUNDER_ID = 'bsubtilis-founder'
const SYMMETRY_STEPS = 8
const ORDER_INVARIANCE_STEPS = 8

interface CompactSnapshotSample {
  readonly tick: number
  readonly simulationTimeHours: number
  readonly totalBiomass: number
  readonly totalResource: number
  readonly occupiedCells: number
  readonly lineageBiomass: Readonly<Record<string, number>>
}

interface IsolatedGrowthMeasurement {
  readonly founderLineageId: string
  readonly seed: number
  readonly initialBiomass: number
  readonly finalBiomass: number
  readonly initialResource: number
  readonly finalResource: number
  readonly durationHours: number
  readonly observedLogGrowthRatePerHour: number
}

interface ControlOutcome {
  readonly passed: boolean
  readonly detail: string
  readonly measurement?: unknown
}

function writeCompactResult(result: unknown): void {
  const output = process.env.PETRA_LOCAL_RESULT_JSON
  if (output === undefined || output.trim() === '') return

  mkdirSync(dirname(output), { recursive: true })
  const temporary = output + '.tmp'
  writeFileSync(temporary, JSON.stringify(result, null, 2), 'utf8')
  renameSync(temporary, output)
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const canonical = message.trim()
  return canonical.length > 0 ? canonical : 'unknown error'
}

function numbersAgree(left: number, right: number): boolean {
  if (Object.is(left, right)) return true
  return (
    Math.abs(left - right) <=
    1e-12 * Math.max(1, Math.abs(left), Math.abs(right))
  )
}

function arraysEqual(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (!Object.is(left[index], right[index])) return false
  }
  return true
}

function sum(values: ArrayLike<number>): number {
  let total = 0
  for (let index = 0; index < values.length; index += 1) {
    total += values[index]!
  }
  return total
}

function mixedInitialization(seed: number): TwoBacteriumRunInitialization {
  return {
    seed,
    initialResourceLevel: INITIAL_RESOURCE_LEVEL,
    inocula: [
      {
        lineageId: ECOLI_FOUNDER_ID,
        x: 76,
        y: 80,
        biomass: INOCULUM_BIOMASS,
      },
      {
        lineageId: BACILLUS_FOUNDER_ID,
        x: 84,
        y: 80,
        biomass: INOCULUM_BIOMASS,
      },
    ],
  }
}

function coLocatedInitialization(seed: number): TwoBacteriumRunInitialization {
  return {
    seed,
    initialResourceLevel: INITIAL_RESOURCE_LEVEL,
    inocula: [
      {
        lineageId: ECOLI_FOUNDER_ID,
        x: 80,
        y: 80,
        biomass: INOCULUM_BIOMASS,
      },
      {
        lineageId: BACILLUS_FOUNDER_ID,
        x: 80,
        y: 80,
        biomass: INOCULUM_BIOMASS,
      },
    ],
  }
}

function isolatedInitialization(
  seed: number,
  founderLineageId: string,
): TwoBacteriumRunInitialization {
  return {
    seed,
    initialResourceLevel: INITIAL_RESOURCE_LEVEL,
    inocula: [
      {
        lineageId: founderLineageId,
        x: 80,
        y: 80,
        biomass: INOCULUM_BIOMASS,
      },
    ],
  }
}

function zeroResourceInitialization(seed: number): TwoBacteriumRunInitialization {
  return {
    ...mixedInitialization(seed),
    initialResourceLevel: 0,
  }
}

function compactSample(
  snapshot: ComposedSimulationSnapshot,
): CompactSnapshotSample {
  return {
    tick: snapshot.checkpoint.tick,
    simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
    totalBiomass: snapshot.checkpoint.metrics.totalBiomass,
    totalResource: snapshot.checkpoint.metrics.totalResource,
    occupiedCells: snapshot.checkpoint.metrics.occupiedCells,
    lineageBiomass: { ...snapshot.checkpoint.metrics.lineageBiomass },
  }
}

function sampledMixedRun(seed: number): {
  readonly plan: TwoBacteriumComposedRunPlan
  readonly samples: readonly CompactSnapshotSample[]
  readonly finalSnapshot: ComposedSimulationSnapshot
} {
  const plan = buildTwoBacteriumSharedResourceRunPlan(
    mixedInitialization(seed),
  )
  const engine = new ComposedSimulationEngine(plan.identity, plan.config)
  const samples: CompactSnapshotSample[] = [compactSample(engine.snapshot())]

  for (
    let tick = SAMPLING_CADENCE_TICKS;
    tick <= HORIZON_TICKS;
    tick += SAMPLING_CADENCE_TICKS
  ) {
    const snapshot = engine.execute({
      id: 'two-bacterium-validation-advance-' + tick,
      type: 'advance',
      ticks: SAMPLING_CADENCE_TICKS,
    })
    samples.push(compactSample(snapshot))
  }

  return {
    plan,
    samples: Object.freeze(samples),
    finalSnapshot: engine.snapshot(),
  }
}

function isolatedGrowth(
  founderLineageId: string,
  seed: number,
): IsolatedGrowthMeasurement {
  const plan = buildTwoBacteriumSharedResourceRunPlan(
    isolatedInitialization(seed, founderLineageId),
  )
  const engine = new ComposedSimulationEngine(plan.identity, plan.config)
  const initial = engine.snapshot()
  const final = engine.execute({
    id: 'isolated-' + founderLineageId + '-advance',
    type: 'advance',
    ticks: HORIZON_TICKS,
  })
  const durationHours = HORIZON_TICKS * plan.config.hoursPerTick
  const initialBiomass = initial.checkpoint.metrics.totalBiomass
  const finalBiomass = final.checkpoint.metrics.totalBiomass
  const observedLogGrowthRatePerHour =
    initialBiomass > 0 && finalBiomass > 0 && durationHours > 0
      ? Math.log(finalBiomass / initialBiomass) / durationHours
      : Number.NaN

  return {
    founderLineageId,
    seed,
    initialBiomass,
    finalBiomass,
    initialResource: initial.checkpoint.metrics.totalResource,
    finalResource: final.checkpoint.metrics.totalResource,
    durationHours,
    observedLogGrowthRatePerHour,
  }
}

function reverseLineageConfig(
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

function maximumLocalBiomass(state: ComposedSimulationState): number {
  let maximum = 0
  for (let cell = 0; cell < state.mask.length; cell += 1) {
    if (state.mask[cell] !== 1) continue
    let local = 0
    for (
      let lineageIndex = 0;
      lineageIndex < state.lineageBiomass.length;
      lineageIndex += 1
    ) {
      local += state.lineageBiomass[lineageIndex]![cell]!
    }
    if (local > maximum) maximum = local
  }
  return maximum
}

function recordControl(
  controls: TwoBacteriumValidationControl[],
  measurements: Record<string, unknown>,
  id: TwoBacteriumControlId,
  evaluate: () => ControlOutcome,
): void {
  try {
    const outcome = evaluate()
    controls.push({
      id,
      status: outcome.passed ? 'passed' : 'failed',
      detail: outcome.detail.trim(),
    })
    if (outcome.measurement !== undefined) {
      measurements[id] = outcome.measurement
    }
  } catch (error) {
    const message = errorMessage(error)
    controls.push({
      id,
      status: 'failed',
      detail: 'Control raised an unexpected exception: ' + message,
    })
    measurements[id] = {
      unexpectedException: message,
    }
  }
}

function exactTaxonEvidence(
  plan: TwoBacteriumComposedRunPlan,
  founderLineageId: string,
  role: 'ecoli-mg1655' | 'bacillus-168-trp-plus-sigE-minus',
) {
  const lineage = plan.config.lineages.find(
    (candidate) => candidate.id === founderLineageId,
  )
  if (
    lineage === undefined ||
    lineage.taxonId === undefined ||
    lineage.taxonContentVersion === undefined
  ) {
    throw new Error(
      'missing exact taxon authority for founder ' + founderLineageId,
    )
  }

  const taxon = plan.taxonRegistry.taxa.find(
    (candidate) =>
      candidate.id === lineage.taxonId &&
      candidate.contentVersion === lineage.taxonContentVersion,
  )
  if (taxon === undefined) {
    throw new Error(
      'taxon registry is missing exact revision for founder ' +
        founderLineageId,
    )
  }

  return {
    role,
    taxonId: taxon.id,
    taxonContentVersion: taxon.contentVersion,
    scientificName: taxon.scientificName,
    background: taxon.background,
  } as const
}

function runtimeLineageAssignments(snapshot: ComposedSimulationSnapshot) {
  const mapping = snapshot.checkpoint.composedState.lineageTaxonMap
  return mapping.lineageIds.map((lineageId, index) => ({
    lineageId,
    taxonId: mapping.taxonIds[index]!,
    taxonContentVersion: mapping.taxonContentVersions[index]!,
  }))
}

function observedPeakRssBytes(): number | null {
  const maxRssKilobytes = process.resourceUsage().maxRSS
  if (
    !Number.isFinite(maxRssKilobytes) ||
    maxRssKilobytes < 0
  ) {
    return null
  }
  const bytes = Math.round(maxRssKilobytes * 1024)
  return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null
}

describe.sequential('two-bacterium shared-resource local validation', () => {
  it('runs the exact named scenario through all prepared mechanistic controls', () => {
    const startedAtUtc = new Date().toISOString()
    const startedAtMs = performance.now()
    const controls: TwoBacteriumValidationControl[] = []
    const measurements: Record<string, unknown> = {}

    try {
      const primaryRun = sampledMixedRun(SEEDS[0])
      const primaryPlan = primaryRun.plan
      let isolatedEcoli: IsolatedGrowthMeasurement | null = null
      let isolatedBacillus: IsolatedGrowthMeasurement | null = null

      recordControl(
        controls,
        measurements,
        'isolated-ecoli-growth',
        () => {
          isolatedEcoli = isolatedGrowth(ECOLI_FOUNDER_ID, SEEDS[0])
          const passed =
            isolatedEcoli.finalBiomass > isolatedEcoli.initialBiomass &&
            isolatedEcoli.finalResource < isolatedEcoli.initialResource &&
            Number.isFinite(isolatedEcoli.observedLogGrowthRatePerHour) &&
            isolatedEcoli.observedLogGrowthRatePerHour > 0
          return {
            passed,
            detail:
              'E. coli-only authoritative run uses the named scenario; positive model-biomass growth and model-resource use are required over the fixed engineering horizon.',
            measurement: isolatedEcoli,
          }
        },
      )

      recordControl(
        controls,
        measurements,
        'isolated-bacillus-growth',
        () => {
          isolatedBacillus = isolatedGrowth(
            BACILLUS_FOUNDER_ID,
            SEEDS[0],
          )
          const passed =
            isolatedBacillus.finalBiomass >
              isolatedBacillus.initialBiomass &&
            isolatedBacillus.finalResource <
              isolatedBacillus.initialResource &&
            Number.isFinite(
              isolatedBacillus.observedLogGrowthRatePerHour,
            ) &&
            isolatedBacillus.observedLogGrowthRatePerHour > 0
          return {
            passed,
            detail:
              'B. subtilis-only authoritative run uses the same named model-unit scenario; positive model-biomass growth and model-resource use are required without adding Bacillus-only biology.',
            measurement: isolatedBacillus,
          }
        },
      )

      recordControl(
        controls,
        measurements,
        'zero-resource-no-biomass-production',
        () => {
          const plan = buildTwoBacteriumSharedResourceRunPlan(
            zeroResourceInitialization(SEEDS[0]),
          )
          const engine = new ComposedSimulationEngine(
            plan.identity,
            plan.config,
          )
          const before = engine.snapshot()
          const after = engine.execute({
            id: 'zero-resource-control',
            type: 'advance',
            ticks: HORIZON_TICKS,
          })
          const passed =
            after.checkpoint.metrics.totalResource === 0 &&
            after.checkpoint.metrics.divisionBiomass === 0 &&
            numbersAgree(
              after.checkpoint.metrics.totalBiomass,
              before.checkpoint.metrics.totalBiomass,
            )
          return {
            passed,
            detail:
              'Zero authoritative model-resource must produce zero division biomass and preserve total biomass because this scenario has zero baseline death.',
            measurement: {
              beforeTotalBiomass:
                before.checkpoint.metrics.totalBiomass,
              afterTotalBiomass:
                after.checkpoint.metrics.totalBiomass,
              divisionBiomass:
                after.checkpoint.metrics.divisionBiomass,
              finalResource: after.checkpoint.metrics.totalResource,
            },
          }
        },
      )

      recordControl(
        controls,
        measurements,
        'identical-trait-symmetry',
        () => {
          const plan = buildTwoBacteriumSharedResourceRunPlan(
            coLocatedInitialization(SEEDS[0]),
          )
          const neutralConfig: ComposedSimulationConfig = {
            ...plan.config,
            lineages: plan.config.lineages.map((lineage) => ({
              ...lineage,
              baselineGrowthRateScale: 1,
            })),
          }
          const state = createComposedState(neutralConfig)
          for (let step = 0; step < SYMMETRY_STEPS; step += 1) {
            stepComposedStateDetailed(state, neutralConfig)
          }
          const passed =
            state.lineageBiomass.length === 2 &&
            arraysEqual(
              state.lineageBiomass[0]!,
              state.lineageBiomass[1]!,
            )
          return {
            passed,
            detail:
              'With both founder growth scales neutralized to the same engineering trait and co-located equal inocula, the generic ecology kernel must treat the two taxon identities symmetrically.',
            measurement: {
              steps: SYMMETRY_STEPS,
              lineageTotals: state.lineageBiomass.map(sum),
              fixtureBoundary:
                'Taxon identity is retained, but both baseline growth scales are intentionally set to 1 only for this generic mechanism-symmetry control.',
            },
          }
        },
      )

      recordControl(
        controls,
        measurements,
        'lineage-species-iteration-order-invariance',
        () => {
          const plan = buildTwoBacteriumSharedResourceRunPlan(
            mixedInitialization(SEEDS[0]),
          )
          const forwardState = createComposedState(plan.config)
          const reverseConfig = reverseLineageConfig(plan.config)
          const reverseState = createComposedState(reverseConfig)

          for (
            let step = 0;
            step < ORDER_INVARIANCE_STEPS;
            step += 1
          ) {
            stepComposedStateDetailed(forwardState, plan.config)
            stepComposedStateDetailed(reverseState, reverseConfig)
          }

          const passed =
            arraysEqual(forwardState.resource, reverseState.resource) &&
            arraysEqual(
              forwardState.lineageBiomass[0]!,
              reverseState.lineageBiomass[1]!,
            ) &&
            arraysEqual(
              forwardState.lineageBiomass[1]!,
              reverseState.lineageBiomass[0]!,
            )
          return {
            passed,
            detail:
              'Reversing authoritative founder iteration order must only reverse channel order; resource and per-founder biological state must remain exact.',
            measurement: {
              steps: ORDER_INVARIANCE_STEPS,
              forwardTotals: forwardState.lineageBiomass.map(sum),
              reversedTotals: reverseState.lineageBiomass.map(sum),
            },
          }
        },
      )

      recordControl(
        controls,
        measurements,
        'shared-resource-local-capacity-coherence',
        () => {
          const samples = primaryRun.samples
          const final = primaryRun.finalSnapshot
          const state = final.checkpoint.composedState
          const maximumLocal = maximumLocalBiomass(state)
          const localCapacity = primaryPlan.config.growth.localCapacity
          const yieldValue = primaryPlan.config.growth.biomassYield
          const division = final.checkpoint.metrics.divisionBiomass
          const resourceConsumed =
            final.checkpoint.metrics.resourceConsumed

          const resourceMonotone = samples.every(
            (sample, index) =>
              index === 0 ||
              sample.totalResource <=
                samples[index - 1]!.totalResource ||
              numbersAgree(
                sample.totalResource,
                samples[index - 1]!.totalResource,
              ),
          )
          const biomassMonotone = samples.every(
            (sample, index) =>
              index === 0 ||
              sample.totalBiomass >=
                samples[index - 1]!.totalBiomass ||
              numbersAgree(
                sample.totalBiomass,
                samples[index - 1]!.totalBiomass,
              ),
          )
          const capacityBound =
            maximumLocal <= localCapacity ||
            numbersAgree(maximumLocal, localCapacity)
          const yieldCoherent = numbersAgree(
            division,
            resourceConsumed * yieldValue,
          )
          const passed =
            resourceMonotone &&
            biomassMonotone &&
            capacityBound &&
            yieldCoherent &&
            samples.at(-1)!.totalResource <
              samples[0]!.totalResource &&
            samples.at(-1)!.totalBiomass >
              samples[0]!.totalBiomass

          return {
            passed,
            detail:
              'Mixed growth must consume the one shared model-resource pool, remain within the configured local-capacity authority, and preserve the configured model-unit yield relationship without adding a pairwise interaction.',
            measurement: {
              samples,
              resourceMonotone,
              biomassMonotone,
              maximumLocalBiomass: maximumLocal,
              localCapacity,
              finalStepDivisionBiomass: division,
              finalStepResourceConsumed: resourceConsumed,
              biomassYield: yieldValue,
              yieldCoherent,
            },
          }
        },
      )

      recordControl(
        controls,
        measurements,
        'same-seed-replay',
        () => {
          const results: Array<{
            seed: number
            finalTraceHash: string
          }> = []

          for (const seed of SEEDS) {
            const plan = buildTwoBacteriumSharedResourceRunPlan(
              mixedInitialization(seed),
            )
            const direct = new ComposedSimulationEngine(
              plan.identity,
              plan.config,
            )
            const replay = new ComposedSimulationEngine(
              plan.identity,
              plan.config,
            )

            assert.deepStrictEqual(replay.snapshot(), direct.snapshot())
            for (
              let tick = SAMPLING_CADENCE_TICKS;
              tick <= HORIZON_TICKS;
              tick += SAMPLING_CADENCE_TICKS
            ) {
              const command = {
                id: 'same-seed-replay-advance-' + tick,
                type: 'advance' as const,
                ticks: SAMPLING_CADENCE_TICKS,
              }
              const directSnapshot = direct.execute(command)
              const replaySnapshot = replay.execute(structuredClone(command))
              assert.deepStrictEqual(
                replaySnapshot,
                directSnapshot,
                'same seed/config/command order must replay exactly',
              )
            }

            results.push({
              seed,
              finalTraceHash: direct.snapshot().traceHash,
            })
          }

          return {
            passed: true,
            detail:
              'Every fixed seed reproduced every sampled authoritative snapshot, event list, checkpoint, and trace hash under the identical ordered command trace.',
            measurement: results,
          }
        },
      )

      recordControl(
        controls,
        measurements,
        'checkpoint-restore-continuation',
        () => {
          const plan = buildTwoBacteriumSharedResourceRunPlan(
            mixedInitialization(SEEDS[0]),
          )
          const direct = new ComposedSimulationEngine(
            plan.identity,
            plan.config,
          )
          const midpoint = direct.execute({
            id: 'checkpoint-prefix',
            type: 'advance',
            ticks: HORIZON_TICKS / 2,
          })
          const checkpoint = structuredClone(midpoint.checkpoint)
          const expected = direct.execute({
            id: 'checkpoint-suffix',
            type: 'advance',
            ticks: HORIZON_TICKS / 2,
          })

          const restored = new ComposedSimulationEngine(
            plan.identity,
            plan.config,
          )
          restored.execute({
            id: 'checkpoint-restore',
            type: 'restore',
            checkpoint,
          })
          const continued = restored.execute({
            id: 'checkpoint-suffix',
            type: 'advance',
            ticks: HORIZON_TICKS / 2,
          })
          assert.deepStrictEqual(
            continued.checkpoint,
            expected.checkpoint,
            'restored continuation must reproduce the exact authoritative checkpoint',
          )

          return {
            passed: true,
            detail:
              'Midpoint checkpoint restore followed by the identical suffix reproduces the exact mixed-species checkpoint, including taxon map and model-unit fields.',
            measurement: {
              midpointTick: midpoint.checkpoint.tick,
              finalTick: expected.checkpoint.tick,
              finalCommandCount: expected.checkpoint.commandCount,
              expectedTraceHash: expected.traceHash,
              restoredScopeTraceHash: continued.traceHash,
              note:
                'Restore begins a new event-history scope, so checkpoint equality rather than trace-hash equality is the continuation authority.',
            },
          }
        },
      )

      recordControl(
        controls,
        measurements,
        'exact-lineage-taxon-identity',
        () => {
          const snapshot = primaryRun.finalSnapshot
          const mapping =
            snapshot.checkpoint.composedState.lineageTaxonMap
          const registry = new Map(
            primaryPlan.taxonRegistry.taxa.map((taxon) => [
              taxon.id + '@' + taxon.contentVersion,
              taxon,
            ]),
          )

          const everyRuntimeLineageExact = mapping.lineageIds.every(
            (_lineageId, index) =>
              registry.has(
                mapping.taxonIds[index]! +
                  '@' +
                  mapping.taxonContentVersions[index]!,
              ),
          )
          const represented = new Set(mapping.taxonIds)
          const passed =
            everyRuntimeLineageExact &&
            represented.has('ecoli-k12-mg1655') &&
            represented.has('bsubtilis-168-trp-plus-sige-minus')

          return {
            passed,
            detail:
              'Every runtime lineage must retain an exact taxon id + contentVersion from the authoritative registry; both named founders must remain represented without name/color inference.',
            measurement: {
              assignments: runtimeLineageAssignments(snapshot),
            },
          }
        },
      )

      recordControl(
        controls,
        measurements,
        'isolated-growth-target-distance-reported',
        () => {
          if (isolatedEcoli === null || isolatedBacillus === null) {
            return {
              passed: false,
              detail:
                'Isolated growth controls did not produce measurements, so source-target distance cannot be reported.',
            }
          }

          const targets = new Map(
            primaryPlan.growthCalibration.targets.map((target) => [
              target.lineageId,
              target,
            ]),
          )
          const ecoliTarget = targets.get(ECOLI_FOUNDER_ID)
          const bacillusTarget = targets.get(BACILLUS_FOUNDER_ID)
          if (ecoliTarget === undefined || bacillusTarget === undefined) {
            return {
              passed: false,
              detail:
                'The exact composed growth-calibration record is missing one required founder target.',
            }
          }

          const targetDistances = [
            {
              founderLineageId: ECOLI_FOUNDER_ID,
              observedLogGrowthRatePerHour:
                isolatedEcoli.observedLogGrowthRatePerHour,
              sourceTargetPerHour: ecoliTarget.valuePerHour,
              absoluteDistancePerHour: Math.abs(
                isolatedEcoli.observedLogGrowthRatePerHour -
                  ecoliTarget.valuePerHour,
              ),
              citation: ecoliTarget.citation,
            },
            {
              founderLineageId: BACILLUS_FOUNDER_ID,
              observedLogGrowthRatePerHour:
                isolatedBacillus.observedLogGrowthRatePerHour,
              sourceTargetPerHour: bacillusTarget.valuePerHour,
              absoluteDistancePerHour: Math.abs(
                isolatedBacillus.observedLogGrowthRatePerHour -
                  bacillusTarget.valuePerHour,
              ),
              citation: bacillusTarget.citation,
            },
          ]
          const passed = targetDistances.every(
            (entry) =>
              Number.isFinite(entry.observedLogGrowthRatePerHour) &&
              Number.isFinite(entry.absoluteDistancePerHour),
          )

          return {
            passed,
            detail:
              'The experiment reports, but does not promotion-gate, distance between engineering model-unit isolated growth and the two cross-study source targets used only for relative calibration.',
            measurement: {
              targets: targetDistances,
              calibrationMethod:
                primaryPlan.growthCalibration.method,
              limitation:
                primaryPlan.growthCalibration.limitation,
            },
          }
        },
      )

      recordControl(
        controls,
        measurements,
        'bacillus-ciprofloxacin-refusal',
        () => {
          const plan = buildTwoBacteriumSharedResourceRunPlan(
            mixedInitialization(SEEDS[0]),
          )
          const engine = new ComposedSimulationEngine(
            plan.identity,
            plan.config,
          )
          const before = engine.snapshot()
          let refusalMessage = ''
          try {
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
            })
          } catch (error) {
            refusalMessage = errorMessage(error)
          }

          const stateUnchanged = (() => {
            try {
              assert.deepStrictEqual(engine.snapshot(), before)
              return true
            } catch {
              return false
            }
          })()
          const passed =
            /requires explicit pharmacodynamic authority/i.test(
              refusalMessage,
            ) && stateUnchanged

          return {
            passed,
            detail:
              'The Bacillus-containing scenario must refuse ciprofloxacin application because it has no explicit pharmacodynamic authority, and rejection must leave authoritative state unchanged.',
            measurement: {
              refusalMessage,
              stateUnchanged,
            },
          }
        },
      )

      recordControl(
        controls,
        measurements,
        'bacillus-evolution-refusal',
        () => {
          const plan = buildTwoBacteriumSharedResourceRunPlan(
            mixedInitialization(SEEDS[0]),
          )
          const engine = new ComposedSimulationEngine(
            plan.identity,
            plan.config,
          )
          const initial = engine.snapshot()
          const final = engine.execute({
            id: 'no-evolution-authority-advance',
            type: 'advance',
            ticks: HORIZON_TICKS,
          })

          const initialLineageCount =
            initial.checkpoint.composedState.lineageIds.length
          const finalLineageCount =
            final.checkpoint.composedState.lineageIds.length
          const passed =
            plan.config.evolutionGraph.transitions.length === 0 &&
            plan.config.populationAuthority === null &&
            initialLineageCount === 2 &&
            finalLineageCount === initialLineageCount

          return {
            passed,
            detail:
              'No mutation/evolution command exists for this scenario; its exact mutation graph is empty and population mutation authority is absent, so advance must not borrow E. coli evolution semantics or create child lineages.',
            measurement: {
              transitionCount:
                plan.config.evolutionGraph.transitions.length,
              populationAuthorityEnabled:
                plan.config.populationAuthority !== null,
              initialLineageCount,
              finalLineageCount,
              commandVocabularyBoundary:
                'unsupported evolution is structurally unavailable rather than mapped to a synthetic command',
            },
          }
        },
      )

      const emittedControlIds = controls.map((control) => control.id)
      assert.deepStrictEqual(
        emittedControlIds,
        [...REQUIRED_TWO_BACTERIUM_CONTROL_IDS],
        'experiment must emit every prepared control exactly once in canonical order',
      )

      if (
        primaryPlan.executionProfile.units.resource !==
          'model-resource' ||
        primaryPlan.executionProfile.units.biomass !==
          'model-biomass'
      ) {
        throw new Error(
          'two-bacterium validation refuses physical-unit laundering',
        )
      }

      const durationSeconds =
        (performance.now() - startedAtMs) / 1000
      const evidence: TwoBacteriumSharedResourceValidationEvidence = {
        schemaVersion:
          TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_SCHEMA_VERSION,
        experimentId:
          TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_EXPERIMENT_ID,
        mechanismScope: TWO_BACTERIUM_MECHANISM_SCOPE,
        scenario: {
          id: primaryPlan.identity.scenarioId,
          version: primaryPlan.identity.scenarioVersion,
        },
        contentPack: {
          id: primaryPlan.identity.parameterSetId,
          version: primaryPlan.identity.parameterSetVersion,
        },
        configurationFingerprint:
          primaryPlan.parameterSetBinding.configurationFingerprint,
        taxa: [
          exactTaxonEvidence(
            primaryPlan,
            ECOLI_FOUNDER_ID,
            'ecoli-mg1655',
          ),
          exactTaxonEvidence(
            primaryPlan,
            BACILLUS_FOUNDER_ID,
            'bacillus-168-trp-plus-sigE-minus',
          ),
        ],
        lineageTaxonAssignments: runtimeLineageAssignments(
          primaryRun.finalSnapshot,
        ),
        units: {
          resource: 'model-resource',
          biomass: 'model-biomass',
        },
        seeds: [...SEEDS],
        horizonTicks: HORIZON_TICKS,
        samplingCadenceTicks: SAMPLING_CADENCE_TICKS,
        controls: Object.freeze(controls),
        limitations: [
          ...REQUIRED_TWO_BACTERIUM_LIMITATIONS,
          'engineering-initialization-is-not-a-physical-inoculum-or-medium',
          'isolated-growth-distance-is-reported-not-a-biological-promotion-gate',
          'direct-composed-engine-evidence-does-not-validate-browser-rendering',
        ],
        runtime: {
          status: 'completed',
          durationSeconds,
          peakRssBytes: observedPeakRssBytes(),
          failures: [],
        },
      }

      const structuralErrors =
        validateTwoBacteriumSharedResourceValidationEvidence(evidence)
      const assessment =
        assessTwoBacteriumSharedResourceValidationEvidence(evidence)

      writeCompactResult({
        ...evidence,
        startedAtUtc,
        completedAtUtc: new Date().toISOString(),
        localRunId: process.env.PETRA_LOCAL_RUN_ID ?? null,
        assessment,
        measurements: {
          experimentSettings: {
            classification: 'engineering validation workload',
            initialResourceLevel: INITIAL_RESOURCE_LEVEL,
            inoculumBiomass: INOCULUM_BIOMASS,
            note:
              'These fixed run settings are deterministic model-unit experiment inputs, not physical glucose, CFU, gCDW, inoculum, or medium claims.',
          },
          contentPackInterpretation:
            'contentPack identifies the exact provenance-bound composed parameter-set revision carried by RunIdentity.',
          mixedSeedSamples: [
            {
              seed: SEEDS[0],
              samples: primaryRun.samples,
            },
          ],
          controls: measurements,
        },
      })

      expect(structuralErrors).toEqual([])
      expect(assessment.accepted).toBe(true)
      expect(
        controls.every((control) => control.status === 'passed'),
      ).toBe(true)
    } catch (error) {
      writeCompactResult({
        schemaVersion:
          TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_SCHEMA_VERSION,
        experimentId:
          TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_EXPERIMENT_ID,
        mechanismScope: TWO_BACTERIUM_MECHANISM_SCOPE,
        startedAtUtc,
        completedAtUtc: new Date().toISOString(),
        localRunId: process.env.PETRA_LOCAL_RUN_ID ?? null,
        status: 'failed-before-complete-evidence',
        completedControls: controls,
        measurements,
        failure: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: errorMessage(error),
        },
      })
      throw error
    }
  })
})
