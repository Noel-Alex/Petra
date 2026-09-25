import type { ExperimentRuntimeState } from "./experimentRuntime";
import {
  projectAuthoritativeLineageAnalysis,
  type AuthoritativeLineageAnalysis,
  type GenotypeAnalysisEvidence,
} from "../sim/evolution/analysis";
import type { CuratedMutationGraph } from "../sim/evolution/graph";
import type { RunIdentity } from "../sim/protocol";
import { assertReplayCompatibility } from "../sim/replayCompatibility";

export const RUNTIME_LINEAGE_ANALYSIS_FRAME_SCHEMA_VERSION = 1 as const;

export interface RuntimeLineageAnalysisAuthority {
  /**
   * Exact composed run identity for which the evidence bundle was assembled.
   * A same-scenario/same-time foreign seed or parameter binding is rejected.
   */
  readonly identity: RunIdentity;
  /**
   * Exact composed configuration fingerprint for which this evidence bundle is
   * valid. This prevents evidence from being reused after config-only changes
   * that do not change biological time.
   */
  readonly configurationFingerprint: string;
  readonly evolutionGraph: CuratedMutationGraph;
  readonly genotypeEvidence: readonly GenotypeAnalysisEvidence[];
}

export interface RuntimeLineageAnalysisFrame {
  readonly schemaVersion: typeof RUNTIME_LINEAGE_ANALYSIS_FRAME_SCHEMA_VERSION;
  readonly runBranchIdentity: string;
  readonly traceHash: string;
  readonly tick: number;
  readonly commandCount: number;
  readonly simulationTimeHours: number;
  readonly analysis: AuthoritativeLineageAnalysis;
}

/**
 * Bind the existing simulation-owned lineage analysis projection to exactly the
 * currently accepted composed runtime transaction.
 *
 * This adapter owns no lineage science. It refuses synthetic authority,
 * foreign run/config evidence, and incomplete/foreign genotype evidence rather
 * than asking React to infer scientific detail from ids, labels, or visuals.
 */
export function projectRuntimeLineageAnalysis(
  runtime: Pick<ExperimentRuntimeState, "snapshot" | "runBranchIdentity">,
  authority: RuntimeLineageAnalysisAuthority,
): RuntimeLineageAnalysisFrame | null {
  const snapshot = runtime.snapshot;
  if (snapshot === null || snapshot.checkpoint.authority !== "composed") {
    return null;
  }

  assertCanonicalText("runtime runBranchIdentity", runtime.runBranchIdentity);
  assertCanonicalText(
    "lineage analysis configurationFingerprint",
    authority.configurationFingerprint,
  );

  const checkpoint = snapshot.checkpoint;
  assertReplayCompatibility({
    artifactIdentity: checkpoint.identity,
    targetIdentity: authority.identity,
    artifactAuthority: "composed",
    targetAuthority: "composed",
  });

  if (
    checkpoint.composedState.configurationFingerprint !==
    authority.configurationFingerprint
  ) {
    throw new Error(
      "runtime lineage-analysis authority does not match the accepted composed configuration fingerprint",
    );
  }

  assertGenotypeEvidenceCoverage(
    checkpoint.composedState.lineageRegistry.records.map(
      (record) => record.genotypeId,
    ),
    authority.evolutionGraph.genotypes.map((genotype) => genotype.id),
    authority.genotypeEvidence,
  );

  const analysis = projectAuthoritativeLineageAnalysis({
    checkpoint,
    lineageRegistry: checkpoint.composedState.lineageRegistry,
    evolutionGraph: authority.evolutionGraph,
    genotypeEvidence: authority.genotypeEvidence,
  });

  if (
    analysis.configurationFingerprint !==
      checkpoint.composedState.configurationFingerprint ||
    analysis.simulationTimeHours !== checkpoint.simulationTimeHours
  ) {
    throw new Error(
      "runtime lineage-analysis projection drifted from the accepted composed transaction",
    );
  }

  return Object.freeze({
    schemaVersion: RUNTIME_LINEAGE_ANALYSIS_FRAME_SCHEMA_VERSION,
    runBranchIdentity: runtime.runBranchIdentity,
    traceHash: snapshot.traceHash,
    tick: checkpoint.tick,
    commandCount: checkpoint.commandCount,
    simulationTimeHours: checkpoint.simulationTimeHours,
    analysis,
  });
}

function assertGenotypeEvidenceCoverage(
  registryGenotypeIds: readonly string[],
  graphGenotypeIds: readonly string[],
  evidence: readonly GenotypeAnalysisEvidence[],
): void {
  const required = new Set<string>();
  for (let index = 0; index < registryGenotypeIds.length; index += 1) {
    const genotypeId = registryGenotypeIds[index]!;
    assertCanonicalText(
      `lineage registry genotype id at index ${index}`,
      genotypeId,
    );
    required.add(genotypeId);
  }

  const graph = new Set<string>();
  for (let index = 0; index < graphGenotypeIds.length; index += 1) {
    const genotypeId = graphGenotypeIds[index]!;
    assertCanonicalText(
      `evolution graph genotype id at index ${index}`,
      genotypeId,
    );
    if (graph.has(genotypeId)) {
      throw new Error(`duplicate evolution graph genotype id: ${genotypeId}`);
    }
    graph.add(genotypeId);
  }

  const supplied = new Set<string>();
  for (let index = 0; index < evidence.length; index += 1) {
    if (!(index in evidence)) {
      throw new Error("runtime genotype analysis evidence must be a dense array");
    }
    const genotypeId = evidence[index]!.genotypeId;
    assertCanonicalText(
      `genotype analysis evidence id at index ${index}`,
      genotypeId,
    );
    if (supplied.has(genotypeId)) {
      throw new Error(
        `duplicate runtime genotype analysis evidence: ${genotypeId}`,
      );
    }
    if (!graph.has(genotypeId)) {
      throw new Error(
        `runtime genotype analysis evidence references genotype outside the evolution graph: ${genotypeId}`,
      );
    }
    supplied.add(genotypeId);
  }

  const missing = [...required].filter((genotypeId) => !supplied.has(genotypeId));
  if (missing.length > 0) {
    throw new Error(
      `runtime genotype analysis evidence must cover every registry genotype; missing=[${missing.join(
        ",",
      )}]`,
    );
  }
}

function assertCanonicalText(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error(`${name} must be canonical non-empty text`);
  }
}
