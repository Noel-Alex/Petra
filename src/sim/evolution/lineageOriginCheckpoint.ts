import {
  LineageRegistry,
  type LineageRecord,
  type LineageRegistryCheckpoint,
} from "./lineage";

export const LINEAGE_ORIGIN_CHECKPOINT_VERSION = 2 as const;

export type LineageOriginKind =
  | "configured-founder"
  | "mutation-child"
  | "external-inoculation";

export interface LineageOriginRecordV2 extends LineageRecord {
  readonly originKind: LineageOriginKind;
}

export interface LineageCreatedEventV2 {
  readonly kind: "lineage-created";
  readonly lineageId: string;
  readonly timeHours: number;
  readonly originKind: LineageOriginKind;
  readonly parentLineageId: string | null;
  readonly genotypeId: string;
  readonly originCellIndex: number | null;
  readonly mutationClass: string | null;
}

export interface LineageExtinctEventV2 {
  readonly kind: "lineage-extinct";
  readonly lineageId: string;
  readonly timeHours: number;
  readonly originKind: LineageOriginKind;
}

export type LineageEventV2 = LineageCreatedEventV2 | LineageExtinctEventV2;

export interface LineageOriginCheckpointV2 {
  readonly version: typeof LINEAGE_ORIGIN_CHECKPOINT_VERSION;
  readonly nextId: number;
  readonly records: readonly LineageOriginRecordV2[];
  readonly events: readonly LineageEventV2[];
}

export type LineageOriginV2 =
  | {
      readonly originKind: "configured-founder";
      readonly parentLineageId: null;
      readonly genotypeId: string;
      readonly createdAtHours: 0;
      readonly originCellIndex: null;
      readonly mutationClass: null;
    }
  | {
      readonly originKind: "mutation-child";
      readonly parentLineageId: string;
      readonly genotypeId: string;
      readonly createdAtHours: number;
      readonly originCellIndex: number;
      readonly mutationClass: string;
    }
  | {
      readonly originKind: "external-inoculation";
      readonly parentLineageId: null;
      readonly genotypeId: string;
      readonly createdAtHours: number;
      readonly originCellIndex: number;
      readonly mutationClass: null;
    };

export interface AppendLineageOriginV2Result {
  readonly checkpoint: LineageOriginCheckpointV2;
  readonly record: LineageOriginRecordV2;
}

/**
 * Deterministically upgrade a legacy founder + mutation-only registry into the
 * explicit-origin target schema.
 *
 * V1 has no bit capable of distinguishing a configured founder from a later
 * parentless external introduction. Therefore this migration accepts an exact
 * configured-founder prefix and requires every later record to be a mutation
 * child. A parentless runtime record is refused rather than guessed.
 */
export function migrateLineageRegistryCheckpointV1ToOriginV2(args: {
  readonly checkpoint: LineageRegistryCheckpoint;
  readonly configuredFounderCount: number;
}): LineageOriginCheckpointV2 {
  nonNegativeSafeInteger(
    "configured founder count",
    args.configuredFounderCount,
  );

  const legacy = LineageRegistry.restore(args.checkpoint).checkpoint();
  if (args.configuredFounderCount > legacy.records.length) {
    throw new Error(
      "configured founder count cannot exceed legacy lineage record count",
    );
  }

  const records = legacy.records.map((record, index) => {
    if (index < args.configuredFounderCount) {
      assertLegacyConfiguredFounder(record, index);
      return freezeRecord({
        ...record,
        originKind: "configured-founder",
      });
    }

    assertLegacyMutationChild(record, index);
    return freezeRecord({
      ...record,
      originKind: "mutation-child",
    });
  });

  const recordById = new Map(
    records.map((record) => [record.lineageId, record] as const),
  );
  const events = legacy.events.map((event) => {
    const record = recordById.get(event.lineageId);
    if (record === undefined) {
      throw new Error(
        "legacy lineage event references a record missing after migration",
      );
    }

    if (event.kind === "lineage-created") {
      return freezeEvent({
        kind: "lineage-created",
        lineageId: event.lineageId,
        timeHours: event.timeHours,
        originKind: record.originKind,
        parentLineageId: record.parentLineageId,
        genotypeId: record.genotypeId,
        originCellIndex: record.originCellIndex,
        mutationClass: record.mutationClass,
      });
    }

    return freezeEvent({
      kind: "lineage-extinct",
      lineageId: event.lineageId,
      timeHours: event.timeHours,
      originKind: record.originKind,
    });
  });

  return validateLineageOriginCheckpointV2({
    version: LINEAGE_ORIGIN_CHECKPOINT_VERSION,
    nextId: legacy.nextId,
    records,
    events,
  });
}

/**
 * Pure allocator for the v2 target schema. This is lineage/replay authority
 * only; callers still own any composed biomass/taxon/parameter transaction.
 */
export function appendLineageOriginV2(
  checkpoint: LineageOriginCheckpointV2,
  origin: LineageOriginV2,
): AppendLineageOriginV2Result {
  const current = validateLineageOriginCheckpointV2(checkpoint);
  validateOrigin(origin);

  const previousEvent = current.events.at(-1);
  if (
    previousEvent !== undefined &&
    origin.createdAtHours < previousEvent.timeHours
  ) {
    throw new Error(
      "lineage origin time cannot precede the previously emitted event",
    );
  }

  if (origin.originKind === "configured-founder") {
    if (current.records.some((record) => record.originKind !== "configured-founder")) {
      throw new Error(
        "configured founders must remain the lineage registry genesis prefix",
      );
    }
  } else if (origin.originKind === "mutation-child") {
    const parent = current.records.find(
      (record) => record.lineageId === origin.parentLineageId,
    );
    if (parent === undefined) {
      throw new Error(
        "mutation child requires an existing parent lineage",
      );
    }
    if (origin.createdAtHours < parent.createdAtHours) {
      throw new Error("mutation child cannot be created before its parent");
    }
    if (
      parent.extinctAtHours !== null &&
      origin.createdAtHours > parent.extinctAtHours
    ) {
      throw new Error(
        "mutation child cannot be created after its parent extinction",
      );
    }
  }

  const lineageId = `L${current.nextId}`;
  const record = freezeRecord({
    lineageId,
    ...origin,
    extinctAtHours: null,
  });
  const event = freezeEvent({
    kind: "lineage-created",
    lineageId,
    timeHours: origin.createdAtHours,
    originKind: origin.originKind,
    parentLineageId: origin.parentLineageId,
    genotypeId: origin.genotypeId,
    originCellIndex: origin.originCellIndex,
    mutationClass: origin.mutationClass,
  });

  const next = validateLineageOriginCheckpointV2({
    version: LINEAGE_ORIGIN_CHECKPOINT_VERSION,
    nextId: current.nextId + 1,
    records: [...current.records, record],
    events: [...current.events, event],
  });

  return Object.freeze({
    checkpoint: next,
    record: next.records[next.records.length - 1]!,
  });
}

/**
 * Strict promotion boundary for the future replay/wire schema.
 *
 * This function deliberately rejects legacy v1 values. The eventual protocol
 * migration must call the explicit v1 migration with configured-founder
 * authority; it must never reinterpret an old checkpoint implicitly.
 */
export function validateLineageOriginCheckpointV2(
  value: unknown,
): LineageOriginCheckpointV2 {
  if (!isRecord(value)) {
    throw new Error("lineage origin checkpoint must be an object");
  }
  assertExactKeys(
    value,
    ["version", "nextId", "records", "events"],
    "lineage origin checkpoint",
  );
  if (value.version !== LINEAGE_ORIGIN_CHECKPOINT_VERSION) {
    throw new Error("unsupported lineage origin checkpoint version");
  }
  if (!Number.isSafeInteger(value.nextId) || (value.nextId as number) < 1) {
    throw new Error(
      "lineage origin checkpoint nextId must be a positive safe integer",
    );
  }
  if (!Array.isArray(value.records) || !Array.isArray(value.events)) {
    throw new Error(
      "lineage origin checkpoint records and events must be arrays",
    );
  }
  assertDenseArray(value.records, "lineage origin checkpoint records");
  assertDenseArray(value.events, "lineage origin checkpoint events");

  const records: LineageOriginRecordV2[] = [];
  const byId = new Map<string, LineageOriginRecordV2>();
  let runtimeOriginSeen = false;

  value.records.forEach((rawRecord, index) => {
    const record = decodeRecord(rawRecord, index);
    const expectedLineageId = `L${index + 1}`;
    if (record.lineageId !== expectedLineageId) {
      throw new Error(
        `lineage origin records must preserve allocator order; expected ${expectedLineageId}`,
      );
    }
    if (byId.has(record.lineageId)) {
      throw new Error(
        `duplicate lineage id in origin checkpoint: ${record.lineageId}`,
      );
    }

    validateRecordOrigin(record);
    if (record.originKind === "configured-founder") {
      if (runtimeOriginSeen) {
        throw new Error(
          "configured founders must remain the lineage registry genesis prefix",
        );
      }
    } else {
      runtimeOriginSeen = true;
    }

    if (record.originKind === "mutation-child") {
      const parent = byId.get(record.parentLineageId);
      if (parent === undefined) {
        throw new Error(
          "mutation child parent must precede the child record",
        );
      }
      if (record.createdAtHours < parent.createdAtHours) {
        throw new Error(
          "mutation child cannot be created before its parent",
        );
      }
      if (
        parent.extinctAtHours !== null &&
        record.createdAtHours > parent.extinctAtHours
      ) {
        throw new Error(
          "mutation child cannot be created after its parent extinction",
        );
      }
    }

    if (
      record.extinctAtHours !== null &&
      (!Number.isFinite(record.extinctAtHours) ||
        record.extinctAtHours < record.createdAtHours)
    ) {
      throw new Error(
        `lineage ${record.lineageId} has invalid extinction time`,
      );
    }

    const cloned = freezeRecord(record);
    records.push(cloned);
    byId.set(cloned.lineageId, cloned);
  });

  const expectedNextId = records.length + 1;
  if (value.nextId !== expectedNextId) {
    throw new Error(
      `lineage origin checkpoint nextId must be ${expectedNextId}`,
    );
  }

  const created = new Set<string>();
  const extinct = new Set<string>();
  const events: LineageEventV2[] = [];
  let previousEventTime = -Infinity;
  let nextCreationIndex = 0;

  value.events.forEach((rawEvent, index) => {
    const event = decodeEvent(rawEvent, index);
    const record = byId.get(event.lineageId);
    if (record === undefined) {
      throw new Error(
        `lineage origin event references unknown lineage: ${event.lineageId}`,
      );
    }
    if (!Number.isFinite(event.timeHours) || event.timeHours < 0) {
      throw new Error(`lineage origin event ${index} has invalid time`);
    }
    if (event.timeHours < previousEventTime) {
      throw new Error(
        `lineage origin event ${index} backdates authoritative event order`,
      );
    }
    previousEventTime = event.timeHours;

    if (event.originKind !== record.originKind) {
      throw new Error(
        `lineage event origin kind does not match record: ${event.lineageId}`,
      );
    }

    if (event.kind === "lineage-created") {
      if (created.has(event.lineageId)) {
        throw new Error(
          `duplicate lineage-created event: ${event.lineageId}`,
        );
      }
      if (records[nextCreationIndex]?.lineageId !== event.lineageId) {
        throw new Error(
          "lineage-created events must preserve allocator creation order",
        );
      }
      nextCreationIndex += 1;
      if (
        event.timeHours !== record.createdAtHours ||
        event.parentLineageId !== record.parentLineageId ||
        event.genotypeId !== record.genotypeId ||
        event.originCellIndex !== record.originCellIndex ||
        event.mutationClass !== record.mutationClass
      ) {
        throw new Error(
          `lineage-created event does not match record: ${event.lineageId}`,
        );
      }
      if (
        record.originKind === "mutation-child" &&
        !created.has(record.parentLineageId)
      ) {
        throw new Error(
          `parent creation event must precede mutation child: ${record.parentLineageId}`,
        );
      }
      created.add(event.lineageId);
      events.push(freezeEvent(event));
      return;
    }

    if (!created.has(event.lineageId)) {
      throw new Error(
        `lineage-extinct event precedes creation: ${event.lineageId}`,
      );
    }
    if (extinct.has(event.lineageId)) {
      throw new Error(
        `duplicate lineage-extinct event: ${event.lineageId}`,
      );
    }
    if (
      record.extinctAtHours === null ||
      event.timeHours !== record.extinctAtHours
    ) {
      throw new Error(
        `lineage-extinct event does not match record: ${event.lineageId}`,
      );
    }
    extinct.add(event.lineageId);
    events.push(freezeEvent(event));
  });

  for (const record of records) {
    if (!created.has(record.lineageId)) {
      throw new Error(
        `lineage origin checkpoint is missing creation event: ${record.lineageId}`,
      );
    }
    if (
      record.extinctAtHours !== null &&
      !extinct.has(record.lineageId)
    ) {
      throw new Error(
        `lineage origin checkpoint is missing extinction event: ${record.lineageId}`,
      );
    }
    if (record.extinctAtHours === null && extinct.has(record.lineageId)) {
      throw new Error(
        `live lineage has an extinction event: ${record.lineageId}`,
      );
    }
  }

  return Object.freeze({
    version: LINEAGE_ORIGIN_CHECKPOINT_VERSION,
    nextId: value.nextId as number,
    records: Object.freeze(records),
    events: Object.freeze(events),
  });
}

function assertLegacyConfiguredFounder(
  record: LineageRecord,
  index: number,
): void {
  if (
    record.parentLineageId !== null ||
    record.createdAtHours !== 0 ||
    record.originCellIndex !== null ||
    record.mutationClass !== null
  ) {
    throw new Error(
      `legacy lineage record ${index} does not match configured-founder semantics`,
    );
  }
}

function assertLegacyMutationChild(
  record: LineageRecord,
  index: number,
): void {
  if (
    record.parentLineageId === null ||
    record.originCellIndex === null ||
    record.mutationClass === null
  ) {
    throw new Error(
      `legacy lineage record ${index} cannot be classified as a mutation child; explicit origin authority is required`,
    );
  }
}

function validateRecordOrigin(record: LineageOriginRecordV2): void {
  validateOrigin({
    originKind: record.originKind,
    parentLineageId: record.parentLineageId,
    genotypeId: record.genotypeId,
    createdAtHours: record.createdAtHours,
    originCellIndex: record.originCellIndex,
    mutationClass: record.mutationClass,
  } as LineageOriginV2);
}

function validateOrigin(origin: LineageOriginV2): void {
  canonicalIdentity("lineage genotype id", origin.genotypeId);
  finiteNonNegative("lineage creation time", origin.createdAtHours);

  if (origin.originKind === "configured-founder") {
    if (
      origin.parentLineageId !== null ||
      origin.createdAtHours !== 0 ||
      origin.originCellIndex !== null ||
      origin.mutationClass !== null
    ) {
      throw new Error(
        "configured-founder origin requires genesis time, no parent, no source cell, and no mutation class",
      );
    }
    return;
  }

  if (origin.originKind === "mutation-child") {
    canonicalIdentity("mutation-child parent lineage id", origin.parentLineageId);
    nonNegativeSafeInteger(
      "mutation-child origin cell index",
      origin.originCellIndex,
    );
    canonicalIdentity("mutation-child mutation class", origin.mutationClass);
    return;
  }

  if (origin.originKind === "external-inoculation") {
    if (origin.parentLineageId !== null || origin.mutationClass !== null) {
      throw new Error(
        "external-inoculation origin requires no parent and no mutation class",
      );
    }
    nonNegativeSafeInteger(
      "external-inoculation origin cell index",
      origin.originCellIndex,
    );
    return;
  }

  throw new Error("unsupported lineage origin kind");
}

function decodeRecord(value: unknown, index: number): LineageOriginRecordV2 {
  if (!isRecord(value)) {
    throw new Error(`lineage origin record ${index} must be an object`);
  }
  assertExactKeys(
    value,
    [
      "lineageId",
      "originKind",
      "parentLineageId",
      "genotypeId",
      "createdAtHours",
      "originCellIndex",
      "mutationClass",
      "extinctAtHours",
    ],
    `lineage origin record ${index}`,
  );
  canonicalIdentity(`lineage id at index ${index}`, value.lineageId);
  if (
    value.originKind !== "configured-founder" &&
    value.originKind !== "mutation-child" &&
    value.originKind !== "external-inoculation"
  ) {
    throw new Error(`lineage origin record ${index} has invalid originKind`);
  }
  if (
    value.parentLineageId !== null &&
    typeof value.parentLineageId !== "string"
  ) {
    throw new Error(
      `lineage origin record ${index} has invalid parentLineageId`,
    );
  }
  if (typeof value.genotypeId !== "string") {
    throw new Error(
      `lineage origin record ${index} has invalid genotypeId`,
    );
  }
  if (typeof value.createdAtHours !== "number") {
    throw new Error(
      `lineage origin record ${index} has invalid createdAtHours`,
    );
  }
  if (
    value.originCellIndex !== null &&
    typeof value.originCellIndex !== "number"
  ) {
    throw new Error(
      `lineage origin record ${index} has invalid originCellIndex`,
    );
  }
  if (
    value.mutationClass !== null &&
    typeof value.mutationClass !== "string"
  ) {
    throw new Error(
      `lineage origin record ${index} has invalid mutationClass`,
    );
  }
  if (
    value.extinctAtHours !== null &&
    typeof value.extinctAtHours !== "number"
  ) {
    throw new Error(
      `lineage origin record ${index} has invalid extinctAtHours`,
    );
  }

  return value as unknown as LineageOriginRecordV2;
}

function decodeEvent(value: unknown, index: number): LineageEventV2 {
  if (!isRecord(value)) {
    throw new Error(`lineage origin event ${index} must be an object`);
  }
  if (value.kind === "lineage-created") {
    assertExactKeys(
      value,
      [
        "kind",
        "lineageId",
        "timeHours",
        "originKind",
        "parentLineageId",
        "genotypeId",
        "originCellIndex",
        "mutationClass",
      ],
      `lineage-created event ${index}`,
    );
    decodeEventIdentity(value, index);
    if (
      value.parentLineageId !== null &&
      typeof value.parentLineageId !== "string"
    ) {
      throw new Error(
        `lineage-created event ${index} has invalid parentLineageId`,
      );
    }
    if (typeof value.genotypeId !== "string") {
      throw new Error(
        `lineage-created event ${index} has invalid genotypeId`,
      );
    }
    if (
      value.originCellIndex !== null &&
      typeof value.originCellIndex !== "number"
    ) {
      throw new Error(
        `lineage-created event ${index} has invalid originCellIndex`,
      );
    }
    if (
      value.mutationClass !== null &&
      typeof value.mutationClass !== "string"
    ) {
      throw new Error(
        `lineage-created event ${index} has invalid mutationClass`,
      );
    }
    return value as unknown as LineageCreatedEventV2;
  }

  if (value.kind === "lineage-extinct") {
    assertExactKeys(
      value,
      ["kind", "lineageId", "timeHours", "originKind"],
      `lineage-extinct event ${index}`,
    );
    decodeEventIdentity(value, index);
    return value as unknown as LineageExtinctEventV2;
  }

  throw new Error(`lineage origin event ${index} has invalid kind`);
}

function decodeEventIdentity(
  value: Record<string, unknown>,
  index: number,
): void {
  canonicalIdentity(`lineage event id at index ${index}`, value.lineageId);
  if (typeof value.timeHours !== "number") {
    throw new Error(`lineage origin event ${index} has invalid time`);
  }
  if (
    value.originKind !== "configured-founder" &&
    value.originKind !== "mutation-child" &&
    value.originKind !== "external-inoculation"
  ) {
    throw new Error(`lineage origin event ${index} has invalid originKind`);
  }
}

function freezeRecord(
  record: LineageOriginRecordV2,
): LineageOriginRecordV2 {
  return Object.freeze({
    lineageId: record.lineageId,
    originKind: record.originKind,
    parentLineageId: record.parentLineageId,
    genotypeId: record.genotypeId,
    createdAtHours: record.createdAtHours,
    originCellIndex: record.originCellIndex,
    mutationClass: record.mutationClass,
    extinctAtHours: record.extinctAtHours,
  });
}

function freezeEvent(event: LineageEventV2): LineageEventV2 {
  if (event.kind === "lineage-created") {
    return Object.freeze({
      kind: "lineage-created",
      lineageId: event.lineageId,
      timeHours: event.timeHours,
      originKind: event.originKind,
      parentLineageId: event.parentLineageId,
      genotypeId: event.genotypeId,
      originCellIndex: event.originCellIndex,
      mutationClass: event.mutationClass,
    });
  }
  return Object.freeze({
    kind: "lineage-extinct",
    lineageId: event.lineageId,
    timeHours: event.timeHours,
    originKind: event.originKind,
  });
}

function assertDenseArray(values: readonly unknown[], name: string): void {
  for (let index = 0; index < values.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(values, index)) {
      throw new Error(`${name} must be dense; missing index ${index}`);
    }
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  name: string,
): void {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  if (
    actual.length !== canonicalExpected.length ||
    actual.some((key, index) => key !== canonicalExpected[index])
  ) {
    throw new Error(`${name} has unsupported or missing fields`);
  }
}

function canonicalIdentity(
  name: string,
  value: unknown,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(`${name} must be a canonical non-empty string`);
  }
}

function finiteNonNegative(
  name: string,
  value: unknown,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}

function nonNegativeSafeInteger(
  name: string,
  value: unknown,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new RangeError(
      `${name} must be a non-negative safe integer`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
