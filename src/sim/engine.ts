import { SimulationRng } from './rng'
import type {
  RunIdentity,
  SimulationCommand,
  SimulationEvent,
  SyntheticSimulationCheckpoint,
  SyntheticSimulationSnapshot,
} from './protocol'
import { simulationTraceHash, stableStringify } from './trace'

const HOURS_PER_TICK = 1 / 60

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
      for (let index = 0; index < command.ticks; index += 1) {
        // Synthetic stochastic state exists only to prove the deterministic substrate.
        // Biology modules replace this with explicit mechanisms in later issues.
        const jitter = this.rng.nextFloat() - 0.5
        this.syntheticPopulation = Math.max(0, this.syntheticPopulation + jitter)
        this.tick += 1
      }
      this.commandCount += 1
      this.pushEvent({
        type: 'advanced',
        commandId: command.id,
        value: command.ticks,
      })
      return this.snapshot()
    }

    if (!Number.isFinite(command.magnitude)) throw new Error('synthetic-pulse.magnitude must be finite')
    this.syntheticPopulation = Math.max(0, this.syntheticPopulation + command.magnitude)
    this.commandCount += 1
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
      traceHash: simulationTraceHash({ checkpoint, events }),
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
    if (stableStringify(checkpoint.identity) !== stableStringify(this.identity)) {
      throw new Error('Cannot restore a checkpoint from a different run identity')
    }
    this.tick = checkpoint.tick
    this.syntheticPopulation = checkpoint.syntheticPopulation
    this.commandCount = checkpoint.commandCount
    this.rng = new SimulationRng(checkpoint.rngState)
    this.events.length = 0
  }
}
