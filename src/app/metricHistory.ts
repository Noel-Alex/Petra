import { sameComposedParameterSetBinding } from '../sim/parameterSetBinding'
import {
  extractAuthoritativeMetricSample,
  shouldSampleAuthoritativeMetrics,
  validateMetricSamplingPolicy,
  type AuthoritativeMetricSample,
  type MetricSamplingPolicy,
} from '../sim/metrics'
import type { RunIdentity, SimulationSnapshot } from '../sim/protocol'

export interface AuthoritativeMetricHistoryConfig {
  readonly samplingPolicy: MetricSamplingPolicy
  readonly resistantGenotypeIds: readonly string[]
}

export type MetricHistoryRecordResult =
  | {
      readonly status: 'recorded'
      readonly sample: AuthoritativeMetricSample
    }
  | {
      readonly status: 'not-scheduled' | 'duplicate'
      readonly sample: null
    }

interface SeenSnapshot {
  readonly tick: number
  readonly simulationTimeHours: number
  readonly traceHash: string
}

function sameRunIdentity(left: RunIdentity, right: RunIdentity): boolean {
  return (
    left.engineVersion === right.engineVersion &&
    left.protocolVersion === right.protocolVersion &&
    left.scenarioId === right.scenarioId &&
    left.scenarioVersion === right.scenarioVersion &&
    left.parameterSetId === right.parameterSetId &&
    left.parameterSetVersion === right.parameterSetVersion &&
    sameComposedParameterSetBinding(
      left.parameterSetBinding,
      right.parameterSetBinding,
    ) &&
    left.seed === right.seed
  )
}

function validateSimulationTime(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      'authoritative metric history simulation time must be finite and non-negative',
    )
  }
}

function validateTraceHash(value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error(
      'authoritative metric history trace hash must be a canonical non-empty string',
    )
  }
}

/**
 * Read-only accumulator for live composed metric history.
 *
 * This object never advances, restores, or mutates simulation authority. It
 * samples already-authoritative composed snapshots on the versioned tick
 * cadence owned by sim/metrics.ts. A reset/replay generation must construct a
 * fresh history rather than concatenating regressed ticks into one chart.
 */
export class AuthoritativeMetricHistory {
  private readonly samplingPolicy: MetricSamplingPolicy
  private readonly resistantGenotypeIds: readonly string[]
  private readonly collected: AuthoritativeMetricSample[] = []
  private identity: RunIdentity | null = null
  private latestSeen: SeenSnapshot | null = null

  constructor(config: AuthoritativeMetricHistoryConfig) {
    validateMetricSamplingPolicy(config.samplingPolicy)
    this.samplingPolicy = Object.freeze({ ...config.samplingPolicy })
    this.resistantGenotypeIds = Object.freeze([
      ...config.resistantGenotypeIds,
    ])
  }

  get samples(): readonly AuthoritativeMetricSample[] {
    return Object.freeze(
      this.collected.map((sample) => structuredClone(sample)),
    )
  }

  record(snapshot: SimulationSnapshot): MetricHistoryRecordResult {
    const checkpoint = snapshot.checkpoint
    if (checkpoint.authority !== 'composed') {
      throw new Error(
        'authoritative metric history requires composed snapshot authority',
      )
    }

    validateSimulationTime(checkpoint.simulationTimeHours)
    validateTraceHash(snapshot.traceHash)

    if (this.identity !== null && !sameRunIdentity(checkpoint.identity, this.identity)) {
      throw new Error(
        'authoritative metric history cannot mix run identities; create a fresh history for reset/replay',
      )
    }

    const previous = this.latestSeen
    if (previous !== null) {
      if (checkpoint.tick < previous.tick) {
        throw new Error(
          'authoritative metric history cannot regress ticks; create a fresh history for reset/replay',
        )
      }
      if (checkpoint.tick === previous.tick) {
        if (checkpoint.simulationTimeHours !== previous.simulationTimeHours) {
          throw new Error(
            'authoritative metric history saw conflicting biological time at one tick',
          )
        }
        if (snapshot.traceHash !== previous.traceHash) {
          throw new Error(
            'authoritative metric history saw conflicting authoritative states at one tick',
          )
        }
        return {
          status: this.collected.at(-1)?.tick === checkpoint.tick
            ? 'duplicate'
            : 'not-scheduled',
          sample: null,
        }
      }
      if (checkpoint.simulationTimeHours <= previous.simulationTimeHours) {
        throw new Error(
          'authoritative metric history biological time must strictly increase with tick',
        )
      }
    }

    const scheduled = shouldSampleAuthoritativeMetrics(
      checkpoint.tick,
      this.samplingPolicy,
    )

    if (!scheduled) {
      this.identity ??= structuredClone(checkpoint.identity)
      this.latestSeen = {
        tick: checkpoint.tick,
        simulationTimeHours: checkpoint.simulationTimeHours,
        traceHash: snapshot.traceHash,
      }
      return { status: 'not-scheduled', sample: null }
    }

    const sample = extractAuthoritativeMetricSample({
      checkpoint,
      samplingPolicy: this.samplingPolicy,
      resistantGenotypeIds: this.resistantGenotypeIds,
    })
    const stored = structuredClone(sample)

    this.identity ??= structuredClone(checkpoint.identity)
    this.latestSeen = {
      tick: checkpoint.tick,
      simulationTimeHours: checkpoint.simulationTimeHours,
      traceHash: snapshot.traceHash,
    }
    this.collected.push(stored)

    return {
      status: 'recorded',
      sample: structuredClone(stored),
    }
  }
}
