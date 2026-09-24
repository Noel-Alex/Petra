import { SimulationEngine } from './engine'
import type {
  SimulationCheckpoint,
  SimulationCommand,
  SimulationEvent,
  SimulationSnapshot,
} from './protocol'
import { assertSimulationSnapshotTrace } from './snapshotTrace'

export const COUNTERFACTUAL_FORK_SCHEMA_VERSION = 2 as const

const INTERNAL_RESTORE_COMMAND_ID = '__petra_counterfactual_fork_restore__'

type MutableBranchCommand = Extract<
  SimulationCommand,
  { type: 'advance' | 'synthetic-pulse' }
>

export type CounterfactualBranchCommand = Readonly<MutableBranchCommand>
export type CounterfactualBranchSide = 'left' | 'right'

export interface CounterfactualForkOrigin {
  readonly sourceRunId: string
  readonly checkpointTraceHash: string
  readonly checkpoint: SimulationCheckpoint
  readonly events: readonly SimulationEvent[]
}

export interface CounterfactualReplayBranch {
  readonly branchId: string
  readonly label: string
  readonly commands: readonly CounterfactualBranchCommand[]
}

export interface CounterfactualForkReplayBundle {
  readonly kind: 'petra-counterfactual-fork'
  readonly schemaVersion: typeof COUNTERFACTUAL_FORK_SCHEMA_VERSION
  readonly origin: CounterfactualForkOrigin
  readonly branches: {
    readonly left: CounterfactualReplayBranch
    readonly right: CounterfactualReplayBranch
  }
}

export interface CounterfactualBranchSnapshot extends CounterfactualReplayBranch {
  readonly snapshot: SimulationSnapshot
}

export interface CounterfactualForkSnapshot {
  readonly origin: CounterfactualForkOrigin
  readonly branches: {
    readonly left: CounterfactualBranchSnapshot
    readonly right: CounterfactualBranchSnapshot
  }
}

interface BranchRuntime {
  readonly branchId: string
  readonly label: string
  readonly engine: SimulationEngine
  readonly commands: CounterfactualBranchCommand[]
  readonly commandIds: Set<string>
}

export class CounterfactualForkController {
  private readonly origin: CounterfactualForkOrigin
  private readonly branches: Record<CounterfactualBranchSide, BranchRuntime>

  constructor(args: {
    readonly sourceRunId: string
    readonly parentSnapshot: SimulationSnapshot
    readonly left: { readonly branchId: string; readonly label: string }
    readonly right: { readonly branchId: string; readonly label: string }
  }) {
    assertNonEmpty(args.sourceRunId, 'sourceRunId')
    assertNonEmpty(args.parentSnapshot.traceHash, 'parent checkpoint trace hash')
    validateParentSnapshotTrace(args.parentSnapshot)
    assertBranchDescriptor(args.left)
    assertBranchDescriptor(args.right)
    if (args.left.branchId === args.right.branchId) {
      throw new Error('counterfactual branch IDs must be distinct')
    }

    const checkpoint = structuredClone(args.parentSnapshot.checkpoint)
    const events = structuredClone(args.parentSnapshot.events)
    validateCheckpointForFork(checkpoint)

    this.origin = {
      sourceRunId: args.sourceRunId,
      checkpointTraceHash: args.parentSnapshot.traceHash,
      checkpoint,
      events,
    }
    this.branches = {
      left: createBranchRuntime(args.left, checkpoint),
      right: createBranchRuntime(args.right, checkpoint),
    }
  }

  execute(
    side: CounterfactualBranchSide,
    command: CounterfactualBranchCommand,
  ): SimulationSnapshot {
    const branch = this.branches[side]
    validateBranchCommand(command)
    if (branch.commandIds.has(command.id)) {
      throw new Error(`duplicate counterfactual command id on ${side} branch: ${command.id}`)
    }

    const accepted = structuredClone(command) as CounterfactualBranchCommand
    const snapshot = branch.engine.execute(accepted)
    branch.commands.push(accepted)
    branch.commandIds.add(accepted.id)
    return cloneSnapshot(snapshot)
  }

  snapshot(): CounterfactualForkSnapshot {
    return {
      origin: cloneOrigin(this.origin),
      branches: {
        left: snapshotBranch(this.branches.left),
        right: snapshotBranch(this.branches.right),
      },
    }
  }

  exportReplayBundle(): CounterfactualForkReplayBundle {
    return {
      kind: 'petra-counterfactual-fork',
      schemaVersion: COUNTERFACTUAL_FORK_SCHEMA_VERSION,
      origin: cloneOrigin(this.origin),
      branches: {
        left: replayBranch(this.branches.left),
        right: replayBranch(this.branches.right),
      },
    }
  }
}

export function replayCounterfactualFork(
  bundle: CounterfactualForkReplayBundle,
): CounterfactualForkSnapshot {
  validateCounterfactualForkReplayBundle(bundle)

  const parentSnapshot: SimulationSnapshot = {
    checkpoint: structuredClone(bundle.origin.checkpoint),
    events: structuredClone(bundle.origin.events),
    traceHash: bundle.origin.checkpointTraceHash,
  }
  const controller = new CounterfactualForkController({
    sourceRunId: bundle.origin.sourceRunId,
    parentSnapshot,
    left: {
      branchId: bundle.branches.left.branchId,
      label: bundle.branches.left.label,
    },
    right: {
      branchId: bundle.branches.right.branchId,
      label: bundle.branches.right.label,
    },
  })

  for (const command of bundle.branches.left.commands) {
    controller.execute('left', command)
  }
  for (const command of bundle.branches.right.commands) {
    controller.execute('right', command)
  }

  return controller.snapshot()
}

export function validateCounterfactualForkReplayBundle(
  bundle: CounterfactualForkReplayBundle,
): void {
  if (bundle.kind !== 'petra-counterfactual-fork') {
    throw new Error('counterfactual fork bundle kind is invalid')
  }
  if (bundle.schemaVersion !== COUNTERFACTUAL_FORK_SCHEMA_VERSION) {
    throw new Error('counterfactual fork schema version is unsupported')
  }

  assertNonEmpty(bundle.origin.sourceRunId, 'sourceRunId')
  assertNonEmpty(bundle.origin.checkpointTraceHash, 'parent checkpoint trace hash')
  validateParentSnapshotTrace({
    checkpoint: bundle.origin.checkpoint,
    events: bundle.origin.events,
    traceHash: bundle.origin.checkpointTraceHash,
  })
  validateCheckpointForFork(bundle.origin.checkpoint)
  validateReplayBranch(bundle.branches.left, 'left')
  validateReplayBranch(bundle.branches.right, 'right')
  if (bundle.branches.left.branchId === bundle.branches.right.branchId) {
    throw new Error('counterfactual branch IDs must be distinct')
  }
}

function createBranchRuntime(
  descriptor: { readonly branchId: string; readonly label: string },
  checkpoint: SimulationCheckpoint,
): BranchRuntime {
  const engine = new SimulationEngine(checkpoint.identity)
  engine.execute({
    id: INTERNAL_RESTORE_COMMAND_ID,
    type: 'restore',
    checkpoint: structuredClone(checkpoint),
  })
  return {
    branchId: descriptor.branchId,
    label: descriptor.label,
    engine,
    commands: [],
    commandIds: new Set<string>(),
  }
}

function validateReplayBranch(
  branch: CounterfactualReplayBranch,
  side: CounterfactualBranchSide,
): void {
  assertBranchDescriptor(branch)
  const seen = new Set<string>()
  for (const command of branch.commands) {
    validateBranchCommand(command)
    if (seen.has(command.id)) {
      throw new Error(`duplicate counterfactual command id on ${side} branch: ${command.id}`)
    }
    seen.add(command.id)
  }
}

function validateBranchCommand(command: CounterfactualBranchCommand): void {
  assertNonEmpty(command.id, 'counterfactual command id')
  if (command.type === 'advance') {
    if (!Number.isSafeInteger(command.ticks) || command.ticks < 0) {
      throw new RangeError('counterfactual advance.ticks must be a non-negative safe integer')
    }
    return
  }
  if (command.type === 'synthetic-pulse') {
    if (!Number.isFinite(command.magnitude)) {
      throw new RangeError('counterfactual synthetic-pulse.magnitude must be finite')
    }
    return
  }
  throw new Error('counterfactual branch commands cannot restore or snapshot')
}

function validateParentSnapshotTrace(snapshot: SimulationSnapshot): void {
  if (!Array.isArray(snapshot.events)) {
    throw new Error('counterfactual parent snapshot events must be an array')
  }
  try {
    assertSimulationSnapshotTrace(snapshot)
  } catch {
    throw new Error('counterfactual parent snapshot trace provenance mismatch')
  }
}

function validateCheckpointForFork(checkpoint: SimulationCheckpoint): void {
  if (!Number.isSafeInteger(checkpoint.tick) || checkpoint.tick < 0) {
    throw new RangeError('fork checkpoint tick must be a non-negative safe integer')
  }
  if (!Number.isFinite(checkpoint.simulationTimeHours) || checkpoint.simulationTimeHours < 0) {
    throw new RangeError('fork checkpoint simulationTimeHours must be finite and non-negative')
  }
  if (!Number.isFinite(checkpoint.syntheticPopulation) || checkpoint.syntheticPopulation < 0) {
    throw new RangeError('fork checkpoint syntheticPopulation must be finite and non-negative')
  }
  if (!Number.isSafeInteger(checkpoint.commandCount) || checkpoint.commandCount < 0) {
    throw new RangeError('fork checkpoint commandCount must be a non-negative safe integer')
  }

  const engine = new SimulationEngine(checkpoint.identity)
  const restored = engine.execute({
    id: INTERNAL_RESTORE_COMMAND_ID,
    type: 'restore',
    checkpoint: structuredClone(checkpoint),
  })
  if (!sameCheckpoint(restored.checkpoint, checkpoint)) {
    throw new Error('fork checkpoint is not canonical for the current simulation engine')
  }
}

function sameCheckpoint(
  actual: SimulationCheckpoint,
  expected: SimulationCheckpoint,
): boolean {
  return (
    actual.tick === expected.tick &&
    actual.simulationTimeHours === expected.simulationTimeHours &&
    actual.syntheticPopulation === expected.syntheticPopulation &&
    actual.commandCount === expected.commandCount &&
    actual.rngState.every((value, index) => value === expected.rngState[index]) &&
    actual.identity.engineVersion === expected.identity.engineVersion &&
    actual.identity.protocolVersion === expected.identity.protocolVersion &&
    actual.identity.scenarioId === expected.identity.scenarioId &&
    actual.identity.scenarioVersion === expected.identity.scenarioVersion &&
    actual.identity.parameterSetId === expected.identity.parameterSetId &&
    actual.identity.parameterSetVersion === expected.identity.parameterSetVersion &&
    actual.identity.seed === expected.identity.seed
  )
}

function assertBranchDescriptor(branch: {
  readonly branchId: string
  readonly label: string
}): void {
  assertNonEmpty(branch.branchId, 'branchId')
  assertNonEmpty(branch.label, 'branch label')
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new RangeError(`${label} must be non-empty`)
}

function cloneOrigin(origin: CounterfactualForkOrigin): CounterfactualForkOrigin {
  return {
    sourceRunId: origin.sourceRunId,
    checkpointTraceHash: origin.checkpointTraceHash,
    checkpoint: structuredClone(origin.checkpoint),
    events: structuredClone(origin.events),
  }
}

function cloneSnapshot(snapshot: SimulationSnapshot): SimulationSnapshot {
  return structuredClone(snapshot)
}

function replayBranch(branch: BranchRuntime): CounterfactualReplayBranch {
  return {
    branchId: branch.branchId,
    label: branch.label,
    commands: branch.commands.map((command) => structuredClone(command)),
  }
}

function snapshotBranch(branch: BranchRuntime): CounterfactualBranchSnapshot {
  return {
    ...replayBranch(branch),
    snapshot: cloneSnapshot(branch.engine.snapshot()),
  }
}
