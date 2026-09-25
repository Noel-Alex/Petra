import {
  LineageRegistry,
  type LineageEvent,
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
 * Upgrade an unambiguous legacy founder + mutation history into the explicit
 * origin target schema.
 *
 * V1 cannot distinguish a later parentless external introduction from another
 * root. The caller must therefore supply the exact configured-founder prefix,
 * and every later v1 record must already be a parented mutation child.
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
    const originKind: LineageOriginKind =
      index < args.configuredFounderCount
        ? "configured-founder"
        : "mutation-child";

    if (originKind === "configured-founder") {
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
    } else if (
      record.parentLineageId === null ||
      record.originCellIndex === null ||
      record.mutationClass === null
    ) {
      throw new Error(
        `legacy lineage record ${index} cannot be classified as a mutation child; explicit origin authority is required`,
      );
    }

    return freezeRecord({ ...record, originKind });
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
 * Pure allocator for the v2 target schema.
 *
 * This changes lineage/replay authority only. It does not authorize an external
 * organism, move biomass, append taxon/growth/loss/population channels, or emit
 * a protocol command; those belong to the later atomic composed transaction.
 */
export function appendLineageOriginV2(
  checkpoint: LineageOriginCheckpointV2,
  origin: LineageOriginV2,
): AppendLineageOriginV2Result {
  const current = validateLineageOriginCheckpointV2(checkpoint);
  validateOriginFields(origin);

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
    if (
      current.records.some(
        (record) => record.originKind !== "configured-founder",
      )
    ) {
      throw new Error(
        "configured founders must remain the lineage registry genesis prefix",
      );
    }
  } else if (origin.originKind === "mutation-child") {
    const parent = current.records.find(
      (record) => record.lineageId === origin.parentLineageId,
    );
    if (parent === undefined) {
      throw new Error("mutation child requires an existing parent lineage");
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
 * V1 is intentionally rejected. The protocol migration must call the explicit
 * migration above with configured-founder authority rather than reinterpret an
 * old checkpoint implicitly.
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
  positiveSafeInteger("lineage origin checkpoint nextId", value.nextId);
  if (!Array.isArray(value.records) || !Array.isArray(value.events)) {
    throw new Error(
      "lineage origin checkpoint records and events must be arrays",
    );
  }
  assertDenseArray(value.records, "lineage origin checkpoint records");
  assertDenseArray(value.events, "lineage origin checkpoint events");

  const records = value.records.map((record, index) =>
    decodeRecord(record, index),
  );
  const events = value.events.map((event, index) =>
    decodeEvent(event, index),
  );

  // Reuse the live registry's canonical allocator/ancestry/lifetime/event
  // validation instead of creating a second replay engine for v2.
  const legacyProjection: LineageRegistryCheckpoint = {
    version: 1,
    nextId: value.nextId as number,
    records: records.map(stripOriginKind),
    events: events.map(projectLegacyEvent),
  };
  const canonical = LineageRegistry.restore(legacyProjection).checkpoint();

  let runtimeOriginSeen = false;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const canonicalRecord = canonical.records[index]!;
    if (!sameLegacyRecord(record, canonicalRecord)) {
      throw new Error(
        `lineage origin record ${index} failed canonical replay validation`,
      );
    }
    validateOriginFields(record);

    if (record.originKind === "configured-founder") {
      if (runtimeOriginSeen) {
        throw new Error(
          "configured founders must remain the lineage registry genesis prefix",
        );
      }
    } else {
      runtimeOriginSeen = true;
    }
  }

  const recordById = new Map(
    records.map((record) => [record.lineageId, record] as const),
  );
  let nextCreationIndex = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    const record = recordById.get(event.lineageId);
    if (record === undefined) {
      throw new Error(
        `lineage origin event references unknown lineage: ${event.lineageId}`,
      );
    }
    if (event.originKind !== record.originKind) {
      throw new Error(
        `lineage event origin kind does not match record: ${event.lineageId}`,
      );
    }

    if (event.kind === "lineage-created") {
      if (records[nextCreationIndex]?.lineageId !== event.lineageId) {
        throw new Error(
          "lineage-created events must preserve allocator creation order",
        );
      }
      nextCreationIndex += 1;
      if (
        event.parentLineageId !== record.parentLineageId ||
        event.genotypeId !== record.genotypeId ||
        event.originCellIndex !== record.originCellIndex ||
        event.mutationClass !== record.mutationClass
      ) {
        throw new Error(
          `lineage-created event origin metadata does not match record: ${event.lineageId}`,
        );
      }
    }
  }

  return Object.freeze({
    version: LINEAGE_ORIGIN_CHECKPOINT_VERSION,
    nextId: canonical.nextId,
    records: Object.freeze(records.map(freezeRecord)),
    events: Object.freeze(events.map(freezeEvent)),
  });
}

function decodeRecord(
  value: unknown,
  index: number,
): LineageOriginRecordV2 {
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
  const originKind = decodeOriginKind(value.originKind, `record ${index}`);
  if (
    value.parentLineageId !== null &&
    typeof value.parentLineageId !== "string"
  ) {
    throw new Error(
      `lineage origin record ${index} has invalid parentLineageId`,
    );
  }
  if (typeof value.parentLineageId === "string") {
    canonicalIdentity(
      `lineage parent id at index ${index}`,
      value.parentLineageId,
    );
  }
  canonicalIdentity(
    `lineage genotype id at index ${index}`,
    value.genotypeId,
  );
  finiteNonNegative(
    `lineage creation time at index ${index}`,
    value.createdAtHours,
  );
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
  if (typeof value.mutationClass === "string") {
    canonicalIdentity(
      `lineage mutation class at index ${index}`,
      value.mutationClass,
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

  return {
    lineageId: value.lineageId as string,
    originKind,
    parentLineageId: value.parentLineageId as string | null,
    genotypeId: value.genotypeId as string,
    createdAtHours: value.createdAtHours as number,
    originCellIndex: value.originCellIndex as number | null,
    mutationClass: value.mutationClass as string | null,
    extinctAtHours: value.extinctAtHours as number | null,
  };
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
    const originKind = decodeEventIdentity(value, index);
    if (
      value.parentLineageId !== null &&
      typeof value.parentLineageId !== "string"
    ) {
      throw new Error(
        `lineage-created event ${index} has invalid parentLineageId`,
      );
    }
    if (typeof value.parentLineageId === "string") {
      canonicalIdentity(
        `lineage-created parent id at index ${index}`,
        value.parentLineageId,
      );
    }
    canonicalIdentity(
      `lineage-created genotype id at index ${index}`,
      value.genotypeId,
    );
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
    if (typeof value.mutationClass === "string") {
      canonicalIdentity(
        `lineage-created mutation class at index ${index}`,
        value.mutationClass,
      );
    }

    return {
      kind: "lineage-created",
      lineageId: value.lineageId as string,
      timeHours: value.timeHours as number,
      originKind,
      parentLineageId: value.parentLineageId as string | null,
      genotypeId: value.genotypeId as string,
      originCellIndex: value.originCellIndex as number | null,
      mutationClass: value.mutationClass as string | null,
    };
  }

  if (value.kind === "lineage-extinct") {
    assertExactKeys(
      value,
      ["kind", "lineageId", "timeHours", "originKind"],
      `lineage-extinct event ${index}`,
    );
    return {
      kind: "lineage-extinct",
      lineageId: value.lineageId as string,
      timeHours: value.timeHours as number,
      originKind: decodeEventIdentity(value, index),
    };
  }

  throw new Error(`lineage origin event ${index} has invalid kind`);
}

function decodeEventIdentity(
  value: Record<string, unknown>,
  index: number,
): LineageOriginKind {
  canonicalIdentity(`lineage event id at index ${index}`, value.lineageId);
  finiteNonNegative(
    `lineage event time at index ${index}`,
    value.timeHours,
  );
  return decodeOriginKind(value.originKind, `event ${index}`);
}

function validateOriginFields(
  origin: Pick<
    LineageOriginRecordV2,
    | "originKind"
    | "parentLineageId"
    | "genotypeId"
    | "createdAtHours"
    | "originCellIndex"
    | "mutationClass"
  >,
): void {
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
    canonicalIdentity(
      "mutation-child parent lineage id",
      origin.parentLineageId,
    );
    nonNegativeSafeInteger(
      "mutation-child origin cell index",
      origin.originCellIndex,
    );
    canonicalIdentity("mutation-child mutation class", origin.mutationClass);
    return;
  }

  if (origin.parentLineageId !== null || origin.mutationClass !== null) {
    throw new Error(
      "external-inoculation origin requires no parent and no mutation class",
    );
  }
  nonNegativeSafeInteger(
    "external-inoculation origin cell index",
    origin.originCellIndex,
  );
}

function stripOriginKind(record: LineageOriginRecordV2): LineageRecord {
  return {
    lineageId: record.lineageId,
    parentLineageId: record.parentLineageId,
    genotypeId: record.genotypeId,
    createdAtHours: record.createdAtHours,
    originCellIndex: record.originCellIndex,
    mutationClass: record.mutationClass,
    extinctAtHours: record.extinctAtHours,
  };
}

function projectLegacyEvent(event: LineageEventV2): LineageEvent {
  if (event.kind === "lineage-extinct") {
    return {
      kind: "lineage-extinct",
      lineageId: event.lineageId,
      timeHours: event.timeHours,
    };
  }
  return {
    kind: "lineage-created",
    lineageId: event.lineageId,
    timeHours: event.timeHours,
    ...(event.parentLineageId === null
      ? {}
      : { parentLineageId: event.parentLineageId }),
    genotypeId: event.genotypeId,
  };
}

function sameLegacyRecord(
  record: LineageOriginRecordV2,
  canonical: LineageRecord,
): boolean {
  return (
    record.lineageId === canonical.lineageId &&
    record.parentLineageId === canonical.parentLineageId &&
    record.genotypeId === canonical.genotypeId &&
    record.createdAtHours === canonical.createdAtHours &&
    record.originCellIndex === canonical.originCellIndex &&
    record.mutationClass === canonical.mutationClass &&
    record.extinctAtHours === canonical.extinctAtHours
  );
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
  return event.kind === "lineage-created"
    ? Object.freeze({
        kind: "lineage-created",
        lineageId: event.lineageId,
        timeHours: event.timeHours,
        originKind: event.originKind,
        parentLineageId: event.parentLineageId,
        genotypeId: event.genotypeId,
        originCellIndex: event.originCellIndex,
        mutationClass: event.mutationClass,
      })
    : Object.freeze({
        kind: "lineage-extinct",
        lineageId: event.lineageId,
        timeHours: event.timeHours,
        originKind: event.originKind,
      });
}

function decodeOriginKind(
  value: unknown,
  name: string,
): LineageOriginKind {
  if (
    value !== "configured-founder" &&
    value !== "mutation-child" &&
    value !== "external-inoculation"
  ) {
    throw new Error(`lineage origin ${name} has invalid originKind`);
  }
  return value;
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
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
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

function positiveSafeInteger(
  name: string,
  value: unknown,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new RangeError(`${name} must be a positive safe integer`);
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
