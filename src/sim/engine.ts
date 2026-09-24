import { SimulationRng } from './rng'
import type {
  RunIdentity,
  SimulationCheckpoint,
  SimulationCommand,
  SimulationEvent,
  SimulationSnapshot,
} from './protocol'

const HOURS_PER_TICK = 1 / 60

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`
}

/** FNV-1a 32-bit trace checksum: a regression identity, not a security hash. */
function traceHash(value: unknown): string {
  const text = stableStringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function nextSafeNonNegativeInteger(
  name: string,
  current: number,
  increment: number,
): number {
  const next = current + increment
  if (!Number.isSafeInteger(next) || next < 0) {
    throw new RangeError(name + ' would exceed the non-negative safe integer range')
  }
  return next
}

function finiteNonNegativeResult(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(name + ' must remain finite and non-negative')
  }
  return value
}

function assertCheckpointScalarInvariants(checkpoint: SimulationCheckpoint): void {
  if (!Number.isSafeInteger(checkpoint.tick) || checkpoint.tick < 0) {
    throw new Error('checkpoint.tick must be a non-negative safe integer')
  }
  if (
    !Number.isFinite(checkpoint.simulationTimeHours) ||
    checkpoint.simulationTimeHours < 0 ||
    checkpoint.simulationTimeHours !== checkpoint.tick * HOURS_PER_TICK
  ) {
    throw new Error(
      'checkpoint.simulationTimeHours must be finite, non-negative, and exactly match checkpoint.tick',
    )
  }
  if (!Number.isFinite(checkpoint.syntheticPopulation) || checkpoint.syntheticPopulation < 0) {
    throw new Error('checkpoint.syntheticPopulation must be finite and non-negative')
  }
  if (!Number.isSafeInteger(checkpoint.commandCount) || checkpoint.commandCount < 0) {
    throw new Error('checkpoint.commandCount must be a non-negative safe integer')
  }
}

export class SimulationEngine {
  private readonly identity: RunIdentity
  private rng: SimulationRng
  private tick = 0
  private syntheticPopulation = 1_000
  private commandCount = 0
  private readonly events: SimulationEvent[] = []

  constructor(identity: RunIdentity) {
    this.identity = structuredClone(identity)
    this.rng = new SimulationRng(identity.seed)
    this.pushEvent({ type: 'initialized' })
  }

  execute(command: SimulationCommand): SimulationSnapshot {
    if (command.type === 'restore') {
      this.restore(command.checkpoint)
      this.pushEvent({ type: 'restored', commandId: command.id })
      return this.snapshot()
    }

    if (command.type === 'snapshot') return this.snapshot()

    if (command.type === 'advance') {
      if (!Number.isSafeInteger(command.ticks) || command.ticks < 0) throw new Error('advance.ticks must be a non-negative safe integer')

      // Preflight every scalar transition before consuming RNG or mutating state.
      const nextTick = nextSafeNonNegativeInteger('advance tick', this.tick, command.ticks)
      const nextCommandCount = nextSafeNonNegativeInteger('command count', this.commandCount, 1)

      for (let index = 0; index < command.ticks; index += 1) {
        // Synthetic stochastic state exists only to prove the deterministic substrate.
        // Biology modules replace this with explicit mechanisms in later issues.
        const jitter = this.rng.nextFloat() - 0.5
        this.syntheticPopulation = Math.max(0, this.syntheticPopulation + jitter)
        this.tick += 1
      }
      this.tick = nextTick
      this.commandCount = nextCommandCount
      this.pushEvent({
        type: 'advanced',
        commandId: command.id,
        value: command.ticks,
      })
      return this.snapshot()
    }

    if (!Number.isFinite(command.magnitude)) throw new Error('synthetic-pulse.magnitude must be finite')
    const nextCommandCount = nextSafeNonNegativeInteger('command count', this.commandCount, 1)
    const nextSyntheticPopulation = finiteNonNegativeResult(
      'synthetic population',
      Math.max(0, this.syntheticPopulation + command.magnitude),
    )

    this.syntheticPopulation = nextSyntheticPopulation
    this.commandCount = nextCommandCount
    this.pushEvent({
      type: 'synthetic-pulse',
      commandId: command.id,
      value: command.magnitude,
    })
    return this.snapshot()
  }

  snapshot(): SimulationSnapshot {
    const checkpoint: SimulationCheckpoint = {
      identity: structuredClone(this.identity),
      tick: this.tick,
      simulationTimeHours: this.currentSimulationTimeHours(),
      syntheticPopulation: this.syntheticPopulation,
      rngState: this.rng.snapshot(),
      commandCount: this.commandCount,
    }
    const events = this.events.map((event) => ({ ...event }))
    return { checkpoint, events, traceHash: traceHash({ checkpoint, events }) }
  }

  private currentSimulationTimeHours(): number {
    return this.tick * HOURS_PER_TICK
  }

  private pushEvent(
    event: Omit<SimulationEvent, 'sequence' | 'tick' | 'simulationTimeHours'>,
  ): void {
    this.events.push({
      sequence: this.events.length,
      tick: this.tick,
      simulationTimeHours: this.currentSimulationTimeHours(),
      ...event,
    })
  }

  private restore(checkpoint: SimulationCheckpoint): void {
    if (stableStringify(checkpoint.identity) !== stableStringify(this.identity)) {
      throw new Error('Cannot restore a checkpoint from a different run identity')
    }

    assertCheckpointScalarInvariants(checkpoint)
    const restoredRng = new SimulationRng(checkpoint.rngState)

    this.tick = checkpoint.tick
    this.syntheticPopulation = checkpoint.syntheticPopulation
    this.commandCount = checkpoint.commandCount
    this.rng = restoredRng
    this.events.length = 0
  }
}
