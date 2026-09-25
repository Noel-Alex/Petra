import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { performance } from 'node:perf_hooks'

import { describe, expect, it } from 'vitest'

import { ComposedSimulationEngine } from '../src/sim/composedEngine'
import {
  buildFlagshipComposedRunPlan,
  type FlagshipRunInitialization,
} from '../src/sim/flagshipComposition'
import type {
  ComposedSimulationCheckpoint,
  ComposedSimulationSnapshot,
} from '../src/sim/protocol'

const EXPERIMENT_ID = 'flagship-long-soak'
const DEFAULT_SEEDS = [0x5eed1234, 0x5eed1235, 0x5eed1236] as const
const DEFAULT_TOTAL_TICKS = 1024
const DEFAULT_CHUNK_TICKS = 64
const DEFAULT_COMMAND_STRESS_TICKS = 256
const COMMAND_STRESS_BATCH_TICKS = 64

const ENGINEERING_INITIALIZATION = Object.freeze({
  initialResourceLevel: 8,
  inocula: Object.freeze([
    Object.freeze({
      lineageId: 'founder-wt',
      x: 80,
      y: 80,
      biomass: 1,
    }),
  ]),
})

interface MemorySample {
  readonly rssBytes: number
  readonly heapUsedBytes: number
  readonly heapTotalBytes: number
  readonly externalBytes: number
  readonly arrayBuffersBytes: number
}

interface SeedSoakResult {
  readonly seed: number
  readonly scenarioId: string
  readonly scenarioVersion: string
  readonly parameterSetId: string
  readonly parameterSetVersion: string
  readonly configurationFingerprint: string
  readonly totalTicks: number
  readonly simulatedHours: number
  readonly chunkCount: number
  readonly advanceWallMs: number
  readonly experimentWallMs: number
  readonly ticksPerSecond: number | null
  readonly simulationHoursPerWallSecond: number | null
  readonly initialMemory: MemorySample
  readonly peakMemory: MemorySample
  readonly finalMemory: MemorySample
  readonly heapGrowthBytes: number
  readonly rssGrowthBytes: number
  readonly finalEventCount: number
  readonly maxEventCount: number
  readonly eventsPerAcceptedAdvanceCommand: number
  readonly replayContinuationEquivalent: boolean
  readonly finalCheckpointEvidenceSha256: string
  readonly finalTraceHash: string
  readonly finalMetrics: {
    readonly totalBiomass: number
    readonly totalResource: number
    readonly occupiedCells: number
    readonly divisionBiomass: number
    readonly deathBiomass: number
    readonly resourceConsumed: number
    readonly lineageBiomass: Readonly<Record<string, number>>
  }
}

interface CommandGranularityStressSample {
  readonly blockIndex: number
  readonly completedTicks: number
  readonly batchedCommandCount: number
  readonly fineCommandCount: number
  readonly batchedEventCount: number
  readonly fineEventCount: number
  readonly batchedEventHistoryJsonBytes: number
  readonly fineEventHistoryJsonBytes: number
  readonly batchedBlockWallMs: number
  readonly fineBlockWallMs: number
}

interface CommandGranularityStressResult {
  readonly seed: number
  readonly totalTicks: number
  readonly batchTicks: number
  readonly biologicalContinuationEquivalent: true
  readonly finalBiologicalContinuationEvidenceSha256: string
  readonly batchedAdvanceWallMs: number
  readonly fineAdvanceWallMs: number
  readonly finalBatchedCommandCount: number
  readonly finalFineCommandCount: number
  readonly finalBatchedEventCount: number
  readonly finalFineEventCount: number
  readonly finalBatchedEventHistoryJsonBytes: number
  readonly finalFineEventHistoryJsonBytes: number
  readonly samples: readonly CommandGranularityStressSample[]
}

interface RetainedMemoryDelta {
  readonly rssBytes: number
  readonly heapUsedBytes: number
  readonly externalBytes: number
  readonly arrayBuffersBytes: number
}

interface PostGcRetainedMemoryObservation {
  readonly commandGranularity: 'batched' | 'one-tick'
  readonly commandTicks: number
  readonly commandCount: number
  readonly eventCount: number
  readonly eventHistoryJsonBytes: number
  readonly biologicalContinuationEvidenceSha256: string
  readonly baselinePostGcMemory: MemorySample
  readonly retainedPostGcMemory: MemorySample
  readonly retainedMinusBaseline: RetainedMemoryDelta
}

interface PostGcRetainedMemoryProfile {
  readonly gcExposed: true
  readonly seed: number
  readonly totalTicks: number
  readonly biologicalContinuationEquivalent: true
  readonly expectedBiologicalContinuationEvidenceSha256: string
  readonly batched: PostGcRetainedMemoryObservation
  readonly oneTick: PostGcRetainedMemoryObservation
}

function parsePositiveSafeInteger(
  name: string,
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`)
  }
  return value
}

function parseSeeds(raw: string | undefined): number[] {
  if (raw === undefined || raw.trim() === '') return [...DEFAULT_SEEDS]

  const seeds = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => Number(value))

  if (seeds.length < 2) {
    throw new Error('PETRA_SOAK_SEEDS must contain at least two seeds')
  }

  for (const seed of seeds) {
    if (
      !Number.isSafeInteger(seed) ||
      seed < 0 ||
      seed > 0xffffffff
    ) {
      throw new Error(
        'PETRA_SOAK_SEEDS values must be canonical uint32 integers',
      )
    }
  }

  if (new Set(seeds).size !== seeds.length) {
    throw new Error('PETRA_SOAK_SEEDS must not contain duplicates')
  }

  return seeds
}

function memorySample(): MemorySample {
  const current = process.memoryUsage()
  return {
    rssBytes: current.rss,
    heapUsedBytes: current.heapUsed,
    heapTotalBytes: current.heapTotal,
    externalBytes: current.external,
    arrayBuffersBytes: current.arrayBuffers,
  }
}

function maxMemory(a: MemorySample, b: MemorySample): MemorySample {
  return {
    rssBytes: Math.max(a.rssBytes, b.rssBytes),
    heapUsedBytes: Math.max(a.heapUsedBytes, b.heapUsedBytes),
    heapTotalBytes: Math.max(a.heapTotalBytes, b.heapTotalBytes),
    externalBytes: Math.max(a.externalBytes, b.externalBytes),
    arrayBuffersBytes: Math.max(a.arrayBuffersBytes, b.arrayBuffersBytes),
  }
}

function requireFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative`)
  }
}

function validateSnapshot(snapshot: ComposedSimulationSnapshot): void {
  const { checkpoint, events } = snapshot
  const { composedState, metrics } = checkpoint

  if (checkpoint.authority !== 'composed') {
    throw new Error('long soak requires composed simulation authority')
  }
  if (!Number.isSafeInteger(checkpoint.tick) || checkpoint.tick < 0) {
    throw new Error('checkpoint tick must remain a non-negative safe integer')
  }
  if (
    !Number.isSafeInteger(checkpoint.commandCount) ||
    checkpoint.commandCount < 0
  ) {
    throw new Error(
      'checkpoint commandCount must remain a non-negative safe integer',
    )
  }
  requireFiniteNonNegative(
    'checkpoint simulationTimeHours',
    checkpoint.simulationTimeHours,
  )

  requireFiniteNonNegative('metrics.totalBiomass', metrics.totalBiomass)
  requireFiniteNonNegative('metrics.totalResource', metrics.totalResource)
  requireFiniteNonNegative(
    'metrics.divisionBiomass',
    metrics.divisionBiomass,
  )
  requireFiniteNonNegative('metrics.deathBiomass', metrics.deathBiomass)
  requireFiniteNonNegative(
    'metrics.resourceConsumed',
    metrics.resourceConsumed,
  )
  if (
    !Number.isSafeInteger(metrics.occupiedCells) ||
    metrics.occupiedCells < 0
  ) {
    throw new Error('metrics.occupiedCells must remain a non-negative integer')
  }
  for (const [lineageId, value] of Object.entries(metrics.lineageBiomass)) {
    requireFiniteNonNegative(
      `metrics.lineageBiomass[${JSON.stringify(lineageId)}]`,
      value,
    )
  }

  if (
    composedState.lineageIds.length !== composedState.genotypeIds.length ||
    composedState.lineageIds.length !== composedState.lineageBiomass.length
  ) {
    throw new Error('composed lineage/genotype/channel identity drifted')
  }

  for (let cell = 0; cell < composedState.mask.length; cell += 1) {
    const maskValue = composedState.mask[cell]
    if (maskValue !== 0 && maskValue !== 1) {
      throw new Error(`mask[${cell}] left the binary domain`)
    }

    const resource = composedState.resource[cell]
    if (resource === undefined) {
      throw new Error(`resource[${cell}] is missing`)
    }
    requireFiniteNonNegative(`resource[${cell}]`, resource)
    if (maskValue === 0 && resource !== 0) {
      throw new Error(`resource[${cell}] became nonzero outside the dish`)
    }

    for (
      let lineageIndex = 0;
      lineageIndex < composedState.lineageBiomass.length;
      lineageIndex += 1
    ) {
      const value = composedState.lineageBiomass[lineageIndex]?.[cell]
      if (value === undefined) {
        throw new Error(
          `lineageBiomass[${lineageIndex}][${cell}] is missing`,
        )
      }
      requireFiniteNonNegative(
        `lineageBiomass[${lineageIndex}][${cell}]`,
        value,
      )
      if (maskValue === 0 && value !== 0) {
        throw new Error(
          `lineageBiomass[${lineageIndex}][${cell}] became nonzero outside the dish`,
        )
      }
    }
  }

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    if (event === undefined || event.sequence !== index) {
      throw new Error('event sequence identity drifted')
    }
    if (!Number.isSafeInteger(event.tick) || event.tick < 0) {
      throw new Error(`event[${index}].tick became invalid`)
    }
    requireFiniteNonNegative(
      `event[${index}].simulationTimeHours`,
      event.simulationTimeHours,
    )
  }
}

function checkpointEvidenceSha256(
  checkpoint: ComposedSimulationCheckpoint,
): string {
  function canonicalize(value: unknown): unknown {
    if (ArrayBuffer.isView(value)) {
      return Array.from(value as unknown as ArrayLike<number>)
    }
    if (Array.isArray(value)) {
      return value.map(canonicalize)
    }
    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>
      return Object.fromEntries(
        Object.keys(record)
          .sort()
          .map((key) => [key, canonicalize(record[key])]),
      )
    }
    return value
  }

  return createHash('sha256')
    .update(JSON.stringify(canonicalize(checkpoint)))
    .digest('hex')
}

function biologicalContinuationEvidenceSha256(
  snapshot: ComposedSimulationSnapshot,
): string {
  function canonicalize(value: unknown): unknown {
    if (ArrayBuffer.isView(value)) {
      return Array.from(value as unknown as ArrayLike<number>)
    }
    if (Array.isArray(value)) {
      return value.map(canonicalize)
    }
    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>
      return Object.fromEntries(
        Object.keys(record)
          .sort()
          .map((key) => [key, canonicalize(record[key])]),
      )
    }
    return value
  }

  return createHash('sha256')
    .update(
      JSON.stringify(
        canonicalize({
          identity: snapshot.checkpoint.identity,
          tick: snapshot.checkpoint.tick,
          simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
          rngState: snapshot.checkpoint.rngState,
          composedState: snapshot.checkpoint.composedState,
          metrics: snapshot.checkpoint.metrics,
        }),
      ),
    )
    .digest('hex')
}

function writeCompactResult(result: unknown): void {
  const output = process.env.PETRA_LOCAL_RESULT_JSON
  if (output === undefined || output.trim() === '') return

  mkdirSync(dirname(output), { recursive: true })
  const temporary = `${output}.tmp`
  writeFileSync(
    temporary,
    JSON.stringify(result, null, 2) + '\n',
    'utf8',
  )
  renameSync(temporary, output)
}

function eventHistoryJsonBytes(
  snapshot: ComposedSimulationSnapshot,
): number {
  return Buffer.byteLength(JSON.stringify(snapshot.events), 'utf8')
}

function assertBiologicalContinuationEquivalent(
  batched: ComposedSimulationSnapshot,
  fine: ComposedSimulationSnapshot,
): void {
  assert.deepStrictEqual(
    {
      identity: batched.checkpoint.identity,
      tick: batched.checkpoint.tick,
      simulationTimeHours: batched.checkpoint.simulationTimeHours,
      rngState: batched.checkpoint.rngState,
      composedState: batched.checkpoint.composedState,
      metrics: batched.checkpoint.metrics,
    },
    {
      identity: fine.checkpoint.identity,
      tick: fine.checkpoint.tick,
      simulationTimeHours: fine.checkpoint.simulationTimeHours,
      rngState: fine.checkpoint.rngState,
      composedState: fine.checkpoint.composedState,
      metrics: fine.checkpoint.metrics,
    },
    'advance-command granularity changed biological continuation authority',
  )
}

function runCommandGranularityStress(
  seed: number,
  totalTicks: number,
  batchTicks: number,
): CommandGranularityStressResult {
  if (
    !Number.isSafeInteger(totalTicks) ||
    totalTicks <= 0 ||
    !Number.isSafeInteger(batchTicks) ||
    batchTicks <= 1 ||
    batchTicks > totalTicks
  ) {
    throw new Error(
      'command-granularity stress requires positive safe total ticks and a batch size in [2, totalTicks]',
    )
  }

  const initialization: FlagshipRunInitialization = {
    seed,
    initialResourceLevel: ENGINEERING_INITIALIZATION.initialResourceLevel,
    inocula: ENGINEERING_INITIALIZATION.inocula,
  }
  const plan = buildFlagshipComposedRunPlan(initialization)
  const batched = new ComposedSimulationEngine(plan.identity, plan.config)
  const fine = new ComposedSimulationEngine(plan.identity, plan.config)

  let completedTicks = 0
  let blockIndex = 0
  let batchedAdvanceWallMs = 0
  let fineAdvanceWallMs = 0
  let batchedSnapshot = batched.snapshot()
  let fineSnapshot = fine.snapshot()
  const samples: CommandGranularityStressSample[] = []

  while (completedTicks < totalTicks) {
    const ticksThisBlock = Math.min(batchTicks, totalTicks - completedTicks)

    const batchedStartedAt = performance.now()
    batchedSnapshot = batched.execute({
      id: `command-stress-${seed}-batched-${blockIndex}`,
      type: 'advance',
      ticks: ticksThisBlock,
    })
    const batchedBlockWallMs = performance.now() - batchedStartedAt
    batchedAdvanceWallMs += batchedBlockWallMs

    const fineStartedAt = performance.now()
    for (let localTick = 0; localTick < ticksThisBlock; localTick += 1) {
      fineSnapshot = fine.execute({
        id: `command-stress-${seed}-fine-${completedTicks + localTick}`,
        type: 'advance',
        ticks: 1,
      })
    }
    const fineBlockWallMs = performance.now() - fineStartedAt
    fineAdvanceWallMs += fineBlockWallMs
    completedTicks += ticksThisBlock

    validateSnapshot(batchedSnapshot)
    validateSnapshot(fineSnapshot)
    assertBiologicalContinuationEquivalent(batchedSnapshot, fineSnapshot)

    const expectedBatchedCommandCount = blockIndex + 1
    if (batchedSnapshot.checkpoint.commandCount !== expectedBatchedCommandCount) {
      throw new Error(
        `batched command count expected ${expectedBatchedCommandCount}, received ${batchedSnapshot.checkpoint.commandCount}`,
      )
    }
    if (fineSnapshot.checkpoint.commandCount !== completedTicks) {
      throw new Error(
        `fine command count expected ${completedTicks}, received ${fineSnapshot.checkpoint.commandCount}`,
      )
    }
    if (
      batchedSnapshot.events.length !==
      batchedSnapshot.checkpoint.commandCount + 1
    ) {
      throw new Error(
        'batched event history must retain one initialization event plus one event per accepted command',
      )
    }
    if (
      fineSnapshot.events.length !==
      fineSnapshot.checkpoint.commandCount + 1
    ) {
      throw new Error(
        'fine event history must retain one initialization event plus one event per accepted command',
      )
    }

    samples.push({
      blockIndex,
      completedTicks,
      batchedCommandCount: batchedSnapshot.checkpoint.commandCount,
      fineCommandCount: fineSnapshot.checkpoint.commandCount,
      batchedEventCount: batchedSnapshot.events.length,
      fineEventCount: fineSnapshot.events.length,
      batchedEventHistoryJsonBytes: eventHistoryJsonBytes(batchedSnapshot),
      fineEventHistoryJsonBytes: eventHistoryJsonBytes(fineSnapshot),
      batchedBlockWallMs,
      fineBlockWallMs,
    })
    blockIndex += 1
  }

  const finalBatchedEventHistoryJsonBytes =
    eventHistoryJsonBytes(batchedSnapshot)
  const finalFineEventHistoryJsonBytes = eventHistoryJsonBytes(fineSnapshot)

  return {
    seed,
    totalTicks,
    batchTicks,
    biologicalContinuationEquivalent: true,
    finalBiologicalContinuationEvidenceSha256:
      biologicalContinuationEvidenceSha256(batchedSnapshot),
    batchedAdvanceWallMs,
    fineAdvanceWallMs,
    finalBatchedCommandCount: batchedSnapshot.checkpoint.commandCount,
    finalFineCommandCount: fineSnapshot.checkpoint.commandCount,
    finalBatchedEventCount: batchedSnapshot.events.length,
    finalFineEventCount: fineSnapshot.events.length,
    finalBatchedEventHistoryJsonBytes,
    finalFineEventHistoryJsonBytes,
    samples,
  }
}

function forceDedicatedExperimentGc(): void {
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
  if (typeof gc !== 'function') {
    throw new Error(
      'flagship long-soak retained-memory profile requires Node --expose-gc',
    )
  }

  // Two explicit collections reduce ordinary short-lived allocation noise while
  // remaining only an observational experiment action. No simulator state is
  // derived from memory measurements.
  gc()
  gc()
}

function retainedMemoryDelta(
  retained: MemorySample,
  baseline: MemorySample,
): RetainedMemoryDelta {
  return {
    rssBytes: retained.rssBytes - baseline.rssBytes,
    heapUsedBytes: retained.heapUsedBytes - baseline.heapUsedBytes,
    externalBytes: retained.externalBytes - baseline.externalBytes,
    arrayBuffersBytes: retained.arrayBuffersBytes - baseline.arrayBuffersBytes,
  }
}

function runPostGcRetainedMemoryVariant(
  seed: number,
  totalTicks: number,
  commandTicks: number,
  commandGranularity: PostGcRetainedMemoryObservation['commandGranularity'],
): PostGcRetainedMemoryObservation {
  if (
    !Number.isSafeInteger(totalTicks) ||
    totalTicks <= 0 ||
    !Number.isSafeInteger(commandTicks) ||
    commandTicks <= 0 ||
    commandTicks > totalTicks
  ) {
    throw new Error(
      'post-GC retained-memory profile requires positive safe tick counts',
    )
  }

  forceDedicatedExperimentGc()
  const baselinePostGcMemory = memorySample()

  const initialization: FlagshipRunInitialization = {
    seed,
    initialResourceLevel: ENGINEERING_INITIALIZATION.initialResourceLevel,
    inocula: ENGINEERING_INITIALIZATION.inocula,
  }
  const plan = buildFlagshipComposedRunPlan(initialization)
  const engine = new ComposedSimulationEngine(plan.identity, plan.config)

  let completedTicks = 0
  let commandIndex = 0
  let finalSnapshot: ComposedSimulationSnapshot | null = engine.snapshot()

  while (completedTicks < totalTicks) {
    const ticks = Math.min(commandTicks, totalTicks - completedTicks)
    finalSnapshot = engine.execute({
      id: `retained-memory-${seed}-${commandGranularity}-${commandIndex}`,
      type: 'advance',
      ticks,
    })
    completedTicks += ticks
    commandIndex += 1
  }

  validateSnapshot(finalSnapshot)
  const biologicalContinuationEvidenceSha256 =
    biologicalContinuationEvidenceSha256(finalSnapshot)
  const commandCount = finalSnapshot.checkpoint.commandCount
  const eventCount = finalSnapshot.events.length
  const eventHistoryBytes = eventHistoryJsonBytes(finalSnapshot)

  if (eventCount !== commandCount + 1) {
    throw new Error(
      'post-GC retained-memory profile requires one initialization event plus one event per accepted command',
    )
  }

  // Drop the exported snapshot clone before measuring. The engine itself remains
  // live, so the post-GC observation reflects state/history retained by the
  // authoritative engine rather than an extra presentation/export clone.
  finalSnapshot = null
  forceDedicatedExperimentGc()
  const retainedPostGcMemory = memorySample()

  return {
    commandGranularity,
    commandTicks,
    commandCount,
    eventCount,
    eventHistoryJsonBytes: eventHistoryBytes,
    biologicalContinuationEvidenceSha256,
    baselinePostGcMemory,
    retainedPostGcMemory,
    retainedMinusBaseline: retainedMemoryDelta(
      retainedPostGcMemory,
      baselinePostGcMemory,
    ),
  }
}

function runPostGcRetainedMemoryProfile(
  seed: number,
  totalTicks: number,
  batchTicks: number,
  expectedBiologicalContinuationEvidenceSha256: string,
): PostGcRetainedMemoryProfile {
  const batched = runPostGcRetainedMemoryVariant(
    seed,
    totalTicks,
    batchTicks,
    'batched',
  )

  // The prior engine is out of scope before the second baseline is sampled.
  forceDedicatedExperimentGc()

  const oneTick = runPostGcRetainedMemoryVariant(
    seed,
    totalTicks,
    1,
    'one-tick',
  )

  if (
    batched.biologicalContinuationEvidenceSha256 !==
      oneTick.biologicalContinuationEvidenceSha256 ||
    batched.biologicalContinuationEvidenceSha256 !==
      expectedBiologicalContinuationEvidenceSha256
  ) {
    throw new Error(
      'post-GC retained-memory command granularities changed biological continuation authority',
    )
  }

  return {
    gcExposed: true,
    seed,
    totalTicks,
    biologicalContinuationEquivalent: true,
    expectedBiologicalContinuationEvidenceSha256,
    batched,
    oneTick,
  }
}

function runSeed(
  seed: number,
  totalTicks: number,
  chunkTicks: number,
): SeedSoakResult {
  const initialization: FlagshipRunInitialization = {
    seed,
    initialResourceLevel: ENGINEERING_INITIALIZATION.initialResourceLevel,
    inocula: ENGINEERING_INITIALIZATION.inocula,
  }
  const plan = buildFlagshipComposedRunPlan(initialization)
  const engine = new ComposedSimulationEngine(plan.identity, plan.config)

  const chunks: number[] = []
  for (let remaining = totalTicks; remaining > 0; ) {
    const size = Math.min(chunkTicks, remaining)
    chunks.push(size)
    remaining -= size
  }
  if (chunks.length < 2) {
    throw new Error('long soak requires at least two advance chunks')
  }

  const initialMemory = memorySample()
  let peakMemory = initialMemory
  let maxEventCount = engine.snapshot().events.length
  let advanceWallMs = 0
  let midpointCheckpoint: ComposedSimulationCheckpoint | null = null
  const midpointChunkIndex = Math.max(0, Math.floor(chunks.length / 2) - 1)

  const experimentStartedAt = performance.now()
  let finalSnapshot = engine.snapshot()

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const ticks = chunks[chunkIndex]
    if (ticks === undefined) {
      throw new Error('soak chunk plan became sparse')
    }

    const startedAt = performance.now()
    finalSnapshot = engine.execute({
      id: `soak-${seed}-advance-${chunkIndex}`,
      type: 'advance',
      ticks,
    })
    advanceWallMs += performance.now() - startedAt

    validateSnapshot(finalSnapshot)
    const expectedDirectEventCount = chunkIndex + 2
    if (finalSnapshot.events.length !== expectedDirectEventCount) {
      throw new Error(
        `uninterrupted event history expected ${expectedDirectEventCount} events after chunk ${chunkIndex}, received ${finalSnapshot.events.length}`,
      )
    }
    maxEventCount = Math.max(maxEventCount, finalSnapshot.events.length)
    peakMemory = maxMemory(peakMemory, memorySample())

    if (chunkIndex === midpointChunkIndex) {
      midpointCheckpoint = structuredClone(finalSnapshot.checkpoint)
    }
  }

  if (midpointCheckpoint === null) {
    throw new Error('soak failed to capture a replay checkpoint')
  }

  const replay = new ComposedSimulationEngine(plan.identity, plan.config)
  replay.execute({
    id: `soak-${seed}-restore-midpoint`,
    type: 'restore',
    checkpoint: midpointCheckpoint,
  })

  for (
    let chunkIndex = midpointChunkIndex + 1;
    chunkIndex < chunks.length;
    chunkIndex += 1
  ) {
    const ticks = chunks[chunkIndex]
    if (ticks === undefined) {
      throw new Error('soak replay chunk plan became sparse')
    }
    replay.execute({
      id: `soak-${seed}-advance-${chunkIndex}`,
      type: 'advance',
      ticks,
    })
    peakMemory = maxMemory(peakMemory, memorySample())
  }

  const replayFinal = replay.snapshot()
  validateSnapshot(replayFinal)
  assert.deepStrictEqual(
    replayFinal.checkpoint,
    finalSnapshot.checkpoint,
    'checkpoint restore continuation drifted from uninterrupted authority',
  )

  const finalMemory = memorySample()
  peakMemory = maxMemory(peakMemory, finalMemory)
  const experimentWallMs = performance.now() - experimentStartedAt
  const simulatedHours = finalSnapshot.checkpoint.simulationTimeHours
  const advanceWallSeconds = advanceWallMs / 1000

  return {
    seed,
    scenarioId: plan.identity.scenarioId,
    scenarioVersion: plan.identity.scenarioVersion,
    parameterSetId: plan.identity.parameterSetId,
    parameterSetVersion: plan.identity.parameterSetVersion,
    configurationFingerprint:
      plan.parameterSetBinding.configurationFingerprint,
    totalTicks,
    simulatedHours,
    chunkCount: chunks.length,
    advanceWallMs,
    experimentWallMs,
    ticksPerSecond:
      advanceWallSeconds > 0 ? totalTicks / advanceWallSeconds : null,
    simulationHoursPerWallSecond:
      advanceWallSeconds > 0 ? simulatedHours / advanceWallSeconds : null,
    initialMemory,
    peakMemory,
    finalMemory,
    heapGrowthBytes: finalMemory.heapUsedBytes - initialMemory.heapUsedBytes,
    rssGrowthBytes: finalMemory.rssBytes - initialMemory.rssBytes,
    finalEventCount: finalSnapshot.events.length,
    maxEventCount,
    eventsPerAcceptedAdvanceCommand:
      finalSnapshot.checkpoint.commandCount === 0
        ? 0
        : (finalSnapshot.events.length - 1) /
          finalSnapshot.checkpoint.commandCount,
    replayContinuationEquivalent: true,
    finalCheckpointEvidenceSha256: checkpointEvidenceSha256(
      finalSnapshot.checkpoint,
    ),
    finalTraceHash: finalSnapshot.traceHash,
    finalMetrics: {
      totalBiomass: finalSnapshot.checkpoint.metrics.totalBiomass,
      totalResource: finalSnapshot.checkpoint.metrics.totalResource,
      occupiedCells: finalSnapshot.checkpoint.metrics.occupiedCells,
      divisionBiomass: finalSnapshot.checkpoint.metrics.divisionBiomass,
      deathBiomass: finalSnapshot.checkpoint.metrics.deathBiomass,
      resourceConsumed: finalSnapshot.checkpoint.metrics.resourceConsumed,
      lineageBiomass: {
        ...finalSnapshot.checkpoint.metrics.lineageBiomass,
      },
    },
  }
}

describe.sequential('flagship long-soak local experiment', () => {
  it('records multi-seed composed-engine stability and replay evidence', () => {
    const seeds = parseSeeds(process.env.PETRA_SOAK_SEEDS)
    const totalTicks = parsePositiveSafeInteger(
      'PETRA_SOAK_TOTAL_TICKS',
      process.env.PETRA_SOAK_TOTAL_TICKS,
      DEFAULT_TOTAL_TICKS,
    )
    const chunkTicks = parsePositiveSafeInteger(
      'PETRA_SOAK_CHUNK_TICKS',
      process.env.PETRA_SOAK_CHUNK_TICKS,
      DEFAULT_CHUNK_TICKS,
    )
    if (chunkTicks >= totalTicks) {
      throw new Error(
        'PETRA_SOAK_CHUNK_TICKS must be smaller than PETRA_SOAK_TOTAL_TICKS',
      )
    }
    const commandStressTicks = parsePositiveSafeInteger(
      'PETRA_SOAK_COMMAND_STRESS_TICKS',
      process.env.PETRA_SOAK_COMMAND_STRESS_TICKS,
      DEFAULT_COMMAND_STRESS_TICKS,
    )
    if (commandStressTicks < COMMAND_STRESS_BATCH_TICKS) {
      throw new Error(
        'PETRA_SOAK_COMMAND_STRESS_TICKS must be at least COMMAND_STRESS_BATCH_TICKS',
      )
    }

    const startedAt = new Date().toISOString()
    const results: SeedSoakResult[] = []

    try {
      for (const seed of seeds) {
        results.push(runSeed(seed, totalTicks, chunkTicks))
      }

      const stressSeed = seeds[0]
      if (stressSeed === undefined) {
        throw new Error('command-granularity stress requires at least one seed')
      }
      const commandGranularityStress = runCommandGranularityStress(
        stressSeed,
        commandStressTicks,
        COMMAND_STRESS_BATCH_TICKS,
      )
      const postGcRetainedMemory = runPostGcRetainedMemoryProfile(
        stressSeed,
        commandStressTicks,
        COMMAND_STRESS_BATCH_TICKS,
        commandGranularityStress.finalBiologicalContinuationEvidenceSha256,
      )

      const totalAdvanceWallMs = results.reduce(
        (sum, result) => sum + result.advanceWallMs,
        0,
      )
      const totalExperimentWallMs = results.reduce(
        (sum, result) => sum + result.experimentWallMs,
        0,
      )
      const totalExecutedTicks = results.reduce(
        (sum, result) => sum + result.totalTicks,
        0,
      )
      const peakRssBytes = Math.max(
        ...results.map((result) => result.peakMemory.rssBytes),
      )
      const peakHeapUsedBytes = Math.max(
        ...results.map((result) => result.peakMemory.heapUsedBytes),
      )
      const maxAbsoluteHeapGrowthBytes = Math.max(
        ...results.map((result) => Math.abs(result.heapGrowthBytes)),
      )
      const maxAbsoluteRssGrowthBytes = Math.max(
        ...results.map((result) => Math.abs(result.rssGrowthBytes)),
      )

      const compactResult = {
        schema_version: 3,
        experiment_id: EXPERIMENT_ID,
        status: 'passed',
        started_at_utc: startedAt,
        completed_at_utc: new Date().toISOString(),
        local_run_id: process.env.PETRA_LOCAL_RUN_ID ?? null,
        authority: 'composed',
        execution_path:
          'direct ComposedSimulationEngine via provenance-bound flagship composition',
        profile: {
          seeds,
          total_ticks_per_seed: totalTicks,
          chunk_ticks: chunkTicks,
          command_stress_ticks: commandStressTicks,
          command_stress_batch_ticks: COMMAND_STRESS_BATCH_TICKS,
          simulated_hours_per_seed:
            results[0]?.simulatedHours ?? null,
        },
        engineering_run_state: {
          classification: 'engineering experiment initialization',
          initial_resource_level:
            ENGINEERING_INITIALIZATION.initialResourceLevel,
          inocula: ENGINEERING_INITIALIZATION.inocula,
          note:
            'Run-state values mirror the existing flagship composition regression fixture. They are not physical substrate, CFU, or measured biological constants.',
        },
        aggregate: {
          seed_count: results.length,
          total_executed_ticks: totalExecutedTicks,
          total_advance_wall_ms: totalAdvanceWallMs,
          total_experiment_wall_ms: totalExperimentWallMs,
          ticks_per_second:
            totalAdvanceWallMs > 0
              ? totalExecutedTicks / (totalAdvanceWallMs / 1000)
              : null,
          peak_rss_bytes: peakRssBytes,
          peak_heap_used_bytes: peakHeapUsedBytes,
          max_absolute_heap_growth_bytes: maxAbsoluteHeapGrowthBytes,
          max_absolute_rss_growth_bytes: maxAbsoluteRssGrowthBytes,
          all_replay_continuations_equivalent: results.every(
            (result) => result.replayContinuationEquivalent,
          ),
          max_event_count: Math.max(
            ...results.map((result) => result.maxEventCount),
          ),
          event_history_policy:
            'observed one initialization event plus one event per accepted advance command; no bounded-retention claim is made by this experiment',
          performance_tier: null,
          performance_tier_reason:
            'No device tier threshold is encoded before laptop evidence is reviewed under #558.',
        },
        seeds: results,
        command_granularity_stress: commandGranularityStress,
        post_gc_retained_memory: postGcRetainedMemory,
        limitations: [
          'This experiment measures direct authoritative composed-engine execution, not browser Worker queue latency or renderer FPS.',
          'Node process memory samples are observational snapshots, not profiler-grade retained-object attribution.',
          'The engineering flagship resource field remains model-resource and is not a physical concentration calibration.',
          'Event history growth is measured but this experiment does not claim a bounded-retention policy exists.',
          'The command-granularity comparison isolates accepted-command/snapshot-history pressure at equal biological endpoints, but its wall-time delta is not a retained-object profiler or browser Worker measurement.',
          'Serialized event-history bytes are exact UTF-8 JSON evidence for the event payload only; they are not a claim about JavaScript heap object size or structured-clone overhead.',
          'Post-GC heapUsed/external/arrayBuffers observations compare retained process memory while one authoritative engine remains live; they are not object-retainer proofs and do not choose a compaction policy.',
          'Post-GC RSS remains allocator/high-water observational evidence because garbage collection need not return pages to the operating system.',
        ],
      }

      writeCompactResult(compactResult)

      expect(results).toHaveLength(seeds.length)
      expect(
        results.every((result) => result.replayContinuationEquivalent),
      ).toBe(true)
      expect(
        results.every(
          (result) => result.eventsPerAcceptedAdvanceCommand === 1,
        ),
      ).toBe(true)
      expect(commandGranularityStress.biologicalContinuationEquivalent).toBe(
        true,
      )
      expect(commandGranularityStress.finalFineEventCount).toBe(
        commandGranularityStress.finalFineCommandCount + 1,
      )
      expect(commandGranularityStress.finalBatchedEventCount).toBe(
        commandGranularityStress.finalBatchedCommandCount + 1,
      )
      expect(
        commandGranularityStress.finalFineEventHistoryJsonBytes,
      ).toBeGreaterThan(
        commandGranularityStress.finalBatchedEventHistoryJsonBytes,
      )
      expect(postGcRetainedMemory.biologicalContinuationEquivalent).toBe(true)
      expect(
        postGcRetainedMemory.batched.biologicalContinuationEvidenceSha256,
      ).toBe(
        commandGranularityStress.finalBiologicalContinuationEvidenceSha256,
      )
      expect(
        postGcRetainedMemory.oneTick.biologicalContinuationEvidenceSha256,
      ).toBe(
        commandGranularityStress.finalBiologicalContinuationEvidenceSha256,
      )
      expect(postGcRetainedMemory.oneTick.eventCount).toBeGreaterThan(
        postGcRetainedMemory.batched.eventCount,
      )
      expect(
        postGcRetainedMemory.oneTick.eventHistoryJsonBytes,
      ).toBeGreaterThan(postGcRetainedMemory.batched.eventHistoryJsonBytes)
    } catch (error) {
      writeCompactResult({
        schema_version: 3,
        experiment_id: EXPERIMENT_ID,
        status: 'failed',
        started_at_utc: startedAt,
        completed_at_utc: new Date().toISOString(),
        local_run_id: process.env.PETRA_LOCAL_RUN_ID ?? null,
        profile: {
          seeds,
          total_ticks_per_seed: totalTicks,
          chunk_ticks: chunkTicks,
          command_stress_ticks: commandStressTicks,
          command_stress_batch_ticks: COMMAND_STRESS_BATCH_TICKS,
        },
        completed_seed_results: results,
        failure: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  })
})
