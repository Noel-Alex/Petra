import {
  composedConfigurationFingerprint,
  type ComposedSimulationConfig,
} from "../sim/authoritative";
import {
  assertComposedParameterSetBinding,
  assertComposedParameterSetBindingRecord,
  type ComposedParameterSetBinding,
} from "../sim/parameterSetBinding";
import type {
  MechanisticSweepTask,
  SweepInterventionFamily,
  SweepParameterPoint,
} from "./sweep";

export const MECHANISTIC_EXECUTION_DEFINITION_SCHEMA_VERSION =
  "petra-ml-execution-definition-v1" as const;
export const MECHANISTIC_PARAMETER_IDENTITY_SCHEMA_VERSION =
  "petra-ml-parameter-execution-v2" as const;
export const MECHANISTIC_INITIAL_STATE_IDENTITY_SCHEMA_VERSION =
  "petra-ml-initial-state-v1" as const;
export const MECHANISTIC_INTERVENTION_SCHEDULE_SCHEMA_VERSION =
  "petra-ml-intervention-schedule-v1" as const;
export const NO_INTERVENTION_SCHEDULE_VERSION =
  "no-intervention-v1" as const;

export interface NoInterventionExecutionDefinition {
  readonly schemaVersion: typeof MECHANISTIC_INTERVENTION_SCHEDULE_SCHEMA_VERSION;
  readonly familyId: string;
  readonly scheduleVersion: typeof NO_INTERVENTION_SCHEDULE_VERSION;
  readonly commands: readonly [];
}

export interface MechanisticExecutionDefinition {
  readonly schemaVersion: typeof MECHANISTIC_EXECUTION_DEFINITION_SCHEMA_VERSION;
  readonly parameterSetBinding: ComposedParameterSetBinding;
  readonly intervention: NoInterventionExecutionDefinition;
}

/**
 * Exact initial run-state identity for an ML execution point.
 *
 * Composed mechanism fingerprints deliberately exclude initial fields because
 * resource/inoculum are run state, not mechanism configuration. Dataset task
 * identity still has to bind them exactly so one task+seed cannot resolve to a
 * different starting state.
 */
export function mechanisticInitialStateFingerprint(
  config: ComposedSimulationConfig,
): string {
  // Reuse composed validation before serializing initial state. The returned
  // mechanism fingerprint is intentionally ignored here.
  composedConfigurationFingerprint(config);
  return encodeIdentity(MECHANISTIC_INITIAL_STATE_IDENTITY_SCHEMA_VERSION, [
    JSON.stringify(Array.from(config.initialResource)),
    JSON.stringify(
      config.initialLineageBiomass.map((channel) => Array.from(channel)),
    ),
  ]);
}

/**
 * Exact, inspectable identity for one composed ML execution point.
 *
 * The legacy field is named parameterSetHash. V2 binds both the provenance
 * mechanism configuration and exact initial run state. The value remains a
 * collision-free length-prefixed identity rather than a lossy digest.
 */
export function mechanisticParameterSetHash(
  binding: ComposedParameterSetBinding,
  config: ComposedSimulationConfig,
): string {
  assertComposedParameterSetBindingRecord(binding);
  assertComposedParameterSetBinding(
    {
      parameterSetId: binding.parameterSetId,
      parameterSetVersion: binding.parameterSetVersion,
      parameterSetBinding: binding,
    },
    config,
  );
  return encodeIdentity(MECHANISTIC_PARAMETER_IDENTITY_SCHEMA_VERSION, [
    String(binding.schemaVersion),
    binding.authority,
    binding.parameterSetId,
    binding.parameterSetVersion,
    binding.configurationFingerprint,
    mechanisticInitialStateFingerprint(config),
  ]);
}

/**
 * Current composed authority has no typed product intervention command yet.
 * Make the empty schedule explicit instead of treating a missing schedule as a
 * fallback. Future command-bearing schedules require a new schema version.
 */
export function createNoInterventionExecutionDefinition(
  familyId: string,
): NoInterventionExecutionDefinition {
  requireCanonicalText("intervention family id", familyId);
  return Object.freeze({
    schemaVersion: MECHANISTIC_INTERVENTION_SCHEDULE_SCHEMA_VERSION,
    familyId,
    scheduleVersion: NO_INTERVENTION_SCHEDULE_VERSION,
    commands: Object.freeze([]) as readonly [],
  });
}

/**
 * Exact biological schedule identity. Presentation family ids are deliberately
 * excluded so renaming "untreated" cannot create a new biological fingerprint.
 */
export function mechanisticInterventionFingerprint(
  intervention: NoInterventionExecutionDefinition,
): string {
  validateNoInterventionExecutionDefinition(intervention);
  return encodeIdentity(MECHANISTIC_INTERVENTION_SCHEDULE_SCHEMA_VERSION, [
    intervention.scheduleVersion,
    "commands=0",
  ]);
}

export function createSweepParameterPointForBinding(
  id: string,
  binding: ComposedParameterSetBinding,
  config: ComposedSimulationConfig,
): SweepParameterPoint {
  requireCanonicalText("parameter point id", id);
  return Object.freeze({
    id,
    parameterSetHash: mechanisticParameterSetHash(binding, config),
  });
}

export function createNoInterventionSweepFamily(
  familyId: string,
): SweepInterventionFamily {
  const intervention = createNoInterventionExecutionDefinition(familyId);
  return Object.freeze({
    id: familyId,
    fingerprint: mechanisticInterventionFingerprint(intervention),
  });
}

export function createMechanisticExecutionDefinition(args: {
  readonly parameterSetBinding: ComposedParameterSetBinding;
  readonly intervention: NoInterventionExecutionDefinition;
}): MechanisticExecutionDefinition {
  assertComposedParameterSetBindingRecord(args.parameterSetBinding);
  if (args.parameterSetBinding.authority !== "provenance") {
    throw new TypeError(
      "authoritative mechanistic execution definitions require provenance parameter-set authority",
    );
  }
  validateNoInterventionExecutionDefinition(args.intervention);
  return Object.freeze({
    schemaVersion: MECHANISTIC_EXECUTION_DEFINITION_SCHEMA_VERSION,
    parameterSetBinding: Object.freeze(structuredClone(args.parameterSetBinding)),
    intervention: Object.freeze({
      ...args.intervention,
      commands: Object.freeze([]) as readonly [],
    }),
  });
}

/**
 * Fail closed before engine construction if ML task identity disagrees with the
 * exact composed configuration or intervention schedule selected by authority.
 */
export function assertTaskMatchesMechanisticExecutionDefinition(
  task: MechanisticSweepTask,
  definition: MechanisticExecutionDefinition,
  config: ComposedSimulationConfig,
): void {
  if (
    definition === null ||
    typeof definition !== "object" ||
    Array.isArray(definition) ||
    definition.schemaVersion !== MECHANISTIC_EXECUTION_DEFINITION_SCHEMA_VERSION
  ) {
    throw new TypeError("unsupported mechanistic execution definition");
  }

  if (definition.parameterSetBinding.authority !== "provenance") {
    throw new TypeError(
      "authoritative mechanistic execution definitions require provenance parameter-set authority",
    );
  }

  assertComposedParameterSetBinding(
    {
      parameterSetId: definition.parameterSetBinding.parameterSetId,
      parameterSetVersion: definition.parameterSetBinding.parameterSetVersion,
      parameterSetBinding: definition.parameterSetBinding,
    },
    config,
  );
  validateNoInterventionExecutionDefinition(definition.intervention);

  const expectedParameterSetHash = mechanisticParameterSetHash(
    definition.parameterSetBinding,
    config,
  );
  if (task.trajectory.group.parameterSetHash !== expectedParameterSetHash) {
    throw new TypeError(
      `task ${task.taskId} parameterSetHash does not match resolved composed parameter + initial-state authority`,
    );
  }

  if (task.interventionFamilyId !== definition.intervention.familyId) {
    throw new TypeError(
      `task ${task.taskId} interventionFamilyId does not match resolved execution definition`,
    );
  }

  const expectedInterventionFingerprint = mechanisticInterventionFingerprint(
    definition.intervention,
  );
  if (
    task.trajectory.interventionFingerprint !== expectedInterventionFingerprint
  ) {
    throw new TypeError(
      `task ${task.taskId} intervention fingerprint does not match resolved authoritative schedule`,
    );
  }
}

function validateNoInterventionExecutionDefinition(
  intervention: NoInterventionExecutionDefinition,
): void {
  if (
    intervention === null ||
    typeof intervention !== "object" ||
    Array.isArray(intervention)
  ) {
    throw new TypeError("intervention execution definition must be an object");
  }
  if (
    intervention.schemaVersion !==
    MECHANISTIC_INTERVENTION_SCHEDULE_SCHEMA_VERSION
  ) {
    throw new RangeError("unsupported mechanistic intervention schedule schema");
  }
  requireCanonicalText("intervention family id", intervention.familyId);
  if (intervention.scheduleVersion !== NO_INTERVENTION_SCHEDULE_VERSION) {
    throw new RangeError(
      "current composed ML execution supports only the explicit no-intervention schedule",
    );
  }
  if (!Array.isArray(intervention.commands) || intervention.commands.length !== 0) {
    throw new RangeError(
      "current composed ML execution requires an explicitly empty intervention command schedule",
    );
  }
}

function encodeIdentity(schema: string, parts: readonly string[]): string {
  return [schema, ...parts]
    .map((part) => `${part.length}:${part}`)
    .join("|");
}

function requireCanonicalText(name: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  if (value !== value.trim()) {
    throw new TypeError(`${name} must be canonical with no surrounding whitespace`);
  }
}
