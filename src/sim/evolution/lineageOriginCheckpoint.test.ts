import { describe, expect, it } from "vitest";
import { LineageRegistry } from "./lineage";
import {
  appendRuntimeLineageOriginV2,
  LINEAGE_ORIGIN_CHECKPOINT_VERSION,
  migrateLineageRegistryCheckpointV1ToOriginV2,
  validateLineageOriginCheckpointV2,
  type RuntimeLineageOriginV2,
} from "./lineageOriginCheckpoint";

describe("lineage origin checkpoint v2", () => {
  it("migrates an unambiguous legacy founder + mutation history explicitly", () => {
    const legacy = new LineageRegistry();
    const founder = legacy.create({
      parentLineageId: null,
      genotypeId: "WT",
      createdAtHours: 0,
      originCellIndex: null,
      mutationClass: null,
    });
    legacy.create({
      parentLineageId: founder.lineageId,
      genotypeId: "gyrA",
      createdAtHours: 1,
      originCellIndex: 7,
      mutationClass: "target-site",
    });

    const migrated = migrateLineageRegistryCheckpointV1ToOriginV2({
      checkpoint: legacy.checkpoint(),
      configuredFounderCount: 1,
    });

    expect(migrated.version).toBe(LINEAGE_ORIGIN_CHECKPOINT_VERSION);
    expect(migrated.records.map((record) => record.originKind)).toEqual([
      "configured-founder",
      "mutation-child",
    ]);
    expect(
      migrated.events
        .filter((event) => event.kind === "lineage-created")
        .map((event) => event.originKind),
    ).toEqual(["configured-founder", "mutation-child"]);
    expect(migrated.nextId).toBe(3);
  });

  it("refuses to guess whether a legacy parentless runtime root was externally inoculated", () => {
    const legacy = new LineageRegistry();
    legacy.create({
      parentLineageId: null,
      genotypeId: "WT",
      createdAtHours: 0,
      originCellIndex: null,
      mutationClass: null,
    });
    legacy.create({
      parentLineageId: null,
      genotypeId: "OTHER",
      createdAtHours: 1,
      originCellIndex: 11,
      mutationClass: null,
    });

    expect(() =>
      migrateLineageRegistryCheckpointV1ToOriginV2({
        checkpoint: legacy.checkpoint(),
        configuredFounderCount: 1,
      }),
    ).toThrow(/explicit origin authority is required/);
  });

  it("allocates an external root without mutation ancestry and allows later mutation children", () => {
    const legacy = new LineageRegistry();
    legacy.create({
      parentLineageId: null,
      genotypeId: "WT",
      createdAtHours: 0,
      originCellIndex: null,
      mutationClass: null,
    });
    const founderOnly = migrateLineageRegistryCheckpointV1ToOriginV2({
      checkpoint: legacy.checkpoint(),
      configuredFounderCount: 1,
    });

    const external = appendRuntimeLineageOriginV2(founderOnly, {
      originKind: "external-inoculation",
      parentLineageId: null,
      genotypeId: "BS168",
      createdAtHours: 1.25,
      originCellIndex: 42,
      mutationClass: null,
    });
    expect(external.record).toMatchObject({
      lineageId: "L2",
      originKind: "external-inoculation",
      parentLineageId: null,
      genotypeId: "BS168",
      originCellIndex: 42,
      mutationClass: null,
    });

    const child = appendRuntimeLineageOriginV2(external.checkpoint, {
      originKind: "mutation-child",
      parentLineageId: "L2",
      genotypeId: "BS168-mut",
      createdAtHours: 1.5,
      originCellIndex: 43,
      mutationClass: "target-site",
    });

    expect(child.record).toMatchObject({
      lineageId: "L3",
      originKind: "mutation-child",
      parentLineageId: "L2",
    });
    expect(
      child.checkpoint.events
        .filter((event) => event.kind === "lineage-created")
        .map((event) => [event.lineageId, event.originKind]),
    ).toEqual([
      ["L1", "configured-founder"],
      ["L2", "external-inoculation"],
      ["L3", "mutation-child"],
    ]);

    expect(() =>
      appendRuntimeLineageOriginV2(
        child.checkpoint,
        {
          originKind: "configured-founder",
          parentLineageId: null,
          genotypeId: "late-founder",
          createdAtHours: 0,
          originCellIndex: null,
          mutationClass: null,
        } as unknown as RuntimeLineageOriginV2,
      ),
    ).toThrow(/genesis-only/);
  });

  it("requires explicit v2 authority instead of accepting a legacy checkpoint implicitly", () => {
    const legacy = new LineageRegistry();
    legacy.create({
      parentLineageId: null,
      genotypeId: "WT",
      createdAtHours: 0,
      originCellIndex: null,
      mutationClass: null,
    });

    expect(() =>
      validateLineageOriginCheckpointV2(legacy.checkpoint()),
    ).toThrow(/unsupported lineage origin checkpoint version/);
  });

  it("rejects record/event origin-kind disagreement and impossible external ancestry", () => {
    const legacy = new LineageRegistry();
    legacy.create({
      parentLineageId: null,
      genotypeId: "WT",
      createdAtHours: 0,
      originCellIndex: null,
      mutationClass: null,
    });
    const base = migrateLineageRegistryCheckpointV1ToOriginV2({
      checkpoint: legacy.checkpoint(),
      configuredFounderCount: 1,
    });
    const external = appendRuntimeLineageOriginV2(base, {
      originKind: "external-inoculation",
      parentLineageId: null,
      genotypeId: "OTHER",
      createdAtHours: 2,
      originCellIndex: 4,
      mutationClass: null,
    }).checkpoint;

    const mismatchedEvent = {
      ...external,
      events: external.events.map((event) =>
        event.kind === "lineage-created" && event.lineageId === "L2"
          ? { ...event, originKind: "mutation-child" }
          : event,
      ),
    };
    expect(() =>
      validateLineageOriginCheckpointV2(mismatchedEvent),
    ).toThrow(/origin kind does not match record/);

    const fakeMutationRoot = {
      ...external,
      records: external.records.map((record) =>
        record.lineageId === "L2"
          ? { ...record, originKind: "mutation-child" }
          : record,
      ),
    };
    expect(() =>
      validateLineageOriginCheckpointV2(fakeMutationRoot),
    ).toThrow(/mutation-child parent/);
  });

  it("keeps mutation creation inside the authoritative parent lifetime", () => {
    const checkpoint = validateLineageOriginCheckpointV2({
      version: 2,
      nextId: 3,
      records: [
        {
          lineageId: "L1",
          originKind: "configured-founder",
          parentLineageId: null,
          genotypeId: "WT",
          createdAtHours: 0,
          originCellIndex: null,
          mutationClass: null,
          extinctAtHours: null,
        },
        {
          lineageId: "L2",
          originKind: "external-inoculation",
          parentLineageId: null,
          genotypeId: "OTHER",
          createdAtHours: 1,
          originCellIndex: 5,
          mutationClass: null,
          extinctAtHours: 2,
        },
      ],
      events: [
        {
          kind: "lineage-created",
          lineageId: "L1",
          timeHours: 0,
          originKind: "configured-founder",
          parentLineageId: null,
          genotypeId: "WT",
          originCellIndex: null,
          mutationClass: null,
        },
        {
          kind: "lineage-created",
          lineageId: "L2",
          timeHours: 1,
          originKind: "external-inoculation",
          parentLineageId: null,
          genotypeId: "OTHER",
          originCellIndex: 5,
          mutationClass: null,
        },
        {
          kind: "lineage-extinct",
          lineageId: "L2",
          timeHours: 2,
          originKind: "external-inoculation",
        },
      ],
    });

    expect(() =>
      appendRuntimeLineageOriginV2(checkpoint, {
        originKind: "mutation-child",
        parentLineageId: "L2",
        genotypeId: "OTHER-mut",
        createdAtHours: 2.1,
        originCellIndex: 6,
        mutationClass: "target-site",
      }),
    ).toThrow(/after its parent extinction/);
  });
});
