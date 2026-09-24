import { SimulationRng } from './rng'
import { assertReplayCompatibility } from './replayCompatibility'
import { simulationSnapshotTraceHash } from './snapshotTrace'
import type {
  RunIdentity,
  SimulationCommand,
  SimulationEvent,
  SyntheticSimulationCheckpoint,
  SyntheticSimulationSnapshot,
} from './protocol'

const HOURS_PER_TICK = 1 / 60

function nextSafeNonNegativeInteger(
  name: string,
  current: number,
  increment: number,
): number {
  const next = current + increment
  if (!Number.isSafeInteger(next) || next < 0) {
    throw new RangeError(
      name + ' would exceed the non-negative safe integer range',
    )
  }
  return next
}

function finiteNonNegativeResult(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(name + ' must remain finite and non-negative')
  }
  return value
}

function assertCheckpointScalarInvariants(checkpoint: SyntheticSimulationCheckpoint): void {
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

  execute(command: SimulationCommand): SyntheticSimulationSnapshot {
    if (command.type === 'restore') {
      if (command.checkpoint.authority === 'composed') {
        throw new Error('Cannot restore a composed checkpoint into synthetic authority')
      }
      this.restore(command.checkpoint)
      this.pushEvent({ type: 'restored', commandId: command.id })
      return this.snapshot()
    }

    if (command.type === 'snapshot') return this.snapshot()

    if (command.type === 'advance') {
      if (!Number.isSafeInteger(command.ticks) || command.ticks < 0) throw new Error('advance.ticks must be a non-negative safe integer')

      // Preflight every scalar transition before consuming RNG or mutating state.
      // A rejected command must leave replay authority exactly unchanged.
      const nextTick = nextSafeNonNegativeInteger(
        'advance tick',
        this.tick,
        command.ticks,
      )
      const nextCommandCount = nextSafeNonNegativeInteger(
        'command count',
        this.commandCount,
        1,
      )

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

    // Compute and validate the complete transition before mutating live state.
    const nextCommandCount = nextSafeNonNegativeInteger(
      'command count',
      this.commandCount,
      1,
    )
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

  snapshot(): SyntheticSimulationSnapshot {
    const checkpoint: SyntheticSimulationCheckpoint = {
      identity: structuredClone(this.identity),
      tick: this.tick,
      simulationTimeHours: this.currentSimulationTimeHours(),
      syntheticPopulation: this.syntheticPopulation,
      rngState: this.rng.snapshot(),
      commandCount: this.commandCount,
    }
    const events = this.events.map((event) => ({ ...event }))
    return {
      checkpoint,
      events,
      traceHash: simulationSnapshotTraceHash({ checkpoint, events }),
    }
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

  private restore(checkpoint: SyntheticSimulationCheckpoint): void {
    assertReplayCompatibility({
      artifactIdentity: checkpoint.identity,
      targetIdentity: this.identity,
      artifactAuthority: 'synthetic',
      targetAuthority: 'synthetic',
    })

    assertCheckpointScalarInvariants(checkpoint)
    const restoredRng = new SimulationRng(checkpoint.rngState)

    this.tick = checkpoint.tick
    this.syntheticPopulation = checkpoint.syntheticPopulation
    this.commandCount = checkpoint.commandCount
    this.rng = restoredRng
    this.events.length = 0
  }
}
