import { assertReplayCompatibility } from "../sim/replayCompatibility";
import {
  DISH_SCENE_TRANSACTION_SCHEMA_VERSION,
  type DishSceneTransaction,
} from "./dishSceneTransaction";
import {
  RUNTIME_ANALYSIS_TRANSACTION_SCHEMA_VERSION,
  type RuntimeAnalysisTransaction,
} from "./runtimeAnalysisTransaction";

export const RUNTIME_LINEAGE_SELECTION_SCHEMA_VERSION = 1 as const;

export interface RuntimeLineageSelection {
  readonly schemaVersion: typeof RUNTIME_LINEAGE_SELECTION_SCHEMA_VERSION;
  readonly lineageId: string;
  readonly lineageStatus: "extant" | "extinct";
  readonly runBranchIdentity: string;
  readonly traceHash: string;
  readonly tick: number;
  readonly acceptedCommandCount: number;
  readonly biologicalTimeHours: number;
  /**
   * Extant authoritative lineages must be present in the current dish
   * projection. Historical extinct lineages remain selectable for ancestry /
   * inspector surfaces but intentionally have no current dish lineage.
   */
  readonly presentInCurrentDish: boolean;
}

/**
 * Bind one lineage selection to the exact current analysis + dish transaction.
 *
 * This is shared-selection authority, not scientific projection. It copies no
 * biomass, phenotype, MIC, fitness, or renderer geometry. Consumers keep using
 * the supplied authoritative analysis/dish records for those values.
 */
export function createRuntimeLineageSelection(args: {
  readonly lineageId: string;
  readonly analysis: RuntimeAnalysisTransaction | null;
  readonly scene: DishSceneTransaction;
}): RuntimeLineageSelection | null {
  assertCanonicalText("selected lineage id", args.lineageId);

  if (args.analysis === null || args.scene.authorityMode !== "composed-runtime") {
    return null;
  }

  if (
    args.analysis.schemaVersion !== RUNTIME_ANALYSIS_TRANSACTION_SCHEMA_VERSION
  ) {
    throw new Error("unsupported runtime analysis transaction schema");
  }
  if (args.scene.schemaVersion !== DISH_SCENE_TRANSACTION_SCHEMA_VERSION) {
    throw new Error("unsupported dish scene transaction schema");
  }

  const records = args.analysis.records;
  const accepted = args.scene.acceptedRuntime;

  assertCanonicalText("analysis run branch identity", records.identity.runIdentity);
  assertCanonicalText("analysis state identity", records.identity.stateIdentity);
  assertCanonicalText("dish run branch identity", accepted.runBranchIdentity);
  assertCanonicalText("dish trace hash", accepted.traceHash);

  if (records.identity.runIdentity !== accepted.runBranchIdentity) {
    throw new Error(
      "runtime lineage selection analysis and dish belong to different command-history generations",
    );
  }
  if (records.identity.stateIdentity !== accepted.traceHash) {
    throw new Error(
      "runtime lineage selection analysis and dish belong to different accepted traces",
    );
  }
  if (
    records.identity.simulationTimeHours !== accepted.biologicalTimeHours
  ) {
    throw new Error(
      "runtime lineage selection analysis and dish disagree on biological time",
    );
  }

  const composedRunIdentity = records.identity.composedRunIdentity;
  if (composedRunIdentity === undefined) {
    throw new Error(
      "runtime lineage selection requires exact composed run identity",
    );
  }
  assertReplayCompatibility({
    artifactIdentity: composedRunIdentity,
    targetIdentity: accepted.runIdentity,
    artifactAuthority: "composed",
    targetAuthority: "composed",
  });

  const lineageAnalysis = records.lineageAnalysis;
  if (lineageAnalysis === undefined) {
    throw new Error(
      "runtime lineage selection requires authoritative lineage analysis",
    );
  }
  if (lineageAnalysis.schemaVersion !== 1) {
    throw new Error("unsupported authoritative lineage analysis schema");
  }
  if (
    lineageAnalysis.simulationTimeHours !== accepted.biologicalTimeHours
  ) {
    throw new Error(
      "runtime lineage selection lineage analysis is not from the accepted dish time",
    );
  }
  assertReplayCompatibility({
    artifactIdentity: lineageAnalysis.identity,
    targetIdentity: accepted.runIdentity,
    artifactAuthority: "composed",
    targetAuthority: "composed",
  });

  const matchingRecords = lineageAnalysis.records.filter(
    (record) => record.lineageId === args.lineageId,
  );
  if (matchingRecords.length !== 1) {
    throw new Error(
      matchingRecords.length === 0
        ? `selected lineage is absent from authoritative analysis: ${args.lineageId}`
        : `authoritative analysis contains duplicate selected lineage: ${args.lineageId}`,
    );
  }

  const record = matchingRecords[0]!;
  const expectedStatus =
    record.extinctAtHours === null ? "extant" : "extinct";
  if (record.status !== expectedStatus) {
    throw new Error(
      `selected lineage lifecycle status disagrees with extinction time: ${args.lineageId}`,
    );
  }

  const matchingDishLineages = args.scene.dish.lineages.filter(
    (lineage) => lineage.id === args.lineageId,
  );
  if (matchingDishLineages.length > 1) {
    throw new Error(
      `current dish contains duplicate selected lineage: ${args.lineageId}`,
    );
  }

  const presentInCurrentDish = matchingDishLineages.length === 1;
  if (record.status === "extant" && !presentInCurrentDish) {
    throw new Error(
      `extant selected lineage is absent from the current dish projection: ${args.lineageId}`,
    );
  }
  if (record.status === "extinct" && presentInCurrentDish) {
    throw new Error(
      `extinct selected lineage is still present in the current dish projection: ${args.lineageId}`,
    );
  }

  return Object.freeze({
    schemaVersion: RUNTIME_LINEAGE_SELECTION_SCHEMA_VERSION,
    lineageId: args.lineageId,
    lineageStatus: record.status,
    runBranchIdentity: accepted.runBranchIdentity,
    traceHash: accepted.traceHash,
    tick: accepted.tick,
    acceptedCommandCount: accepted.acceptedCommandCount,
    biologicalTimeHours: accepted.biologicalTimeHours,
    presentInCurrentDish,
  });
}

function assertCanonicalText(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error(`${name} must be canonical non-empty text`);
  }
}
