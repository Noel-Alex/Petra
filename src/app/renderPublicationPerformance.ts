import type { DishRenderSnapshot } from "../render/model";
import {
  estimateDishRenderSnapshotPayload,
  type DishRenderPayloadEstimate,
} from "../render/renderPayloadEstimate";
import type { SimulationSnapshot } from "../sim/protocol";

export const RENDER_PUBLICATION_PERFORMANCE_SAMPLE_VERSION = 2 as const;

/** Correlation fields for the advance-only profiling workload. This tuple is not a globally unique accepted-response id; repeated snapshot-only responses may share it. */
export interface RenderPublicationTransactionIdentity {
  readonly runBranchIdentity: string;
  readonly traceHash: string;
  readonly tick: number;
  readonly commandCount: number;
  readonly simulationTimeHours: number;
}

export interface RuntimeSnapshotPublicationSample
  extends RenderPublicationTransactionIdentity {
  readonly version: typeof RENDER_PUBLICATION_PERFORMANCE_SAMPLE_VERSION;
  readonly phase: "runtime-snapshot-published";
  readonly observedAtMs: number;
  readonly hasEcologyObservation: boolean;
  /**
   * Exact simulator-owned aggregate load diagnostics from the accepted
   * composed checkpoint. They characterize scientific state only; they are
   * not renderer timing, physical cell counts, CFU, or visible-pixel density.
   */
  readonly totalBiomass: number;
  readonly occupiedCells: number;
}

export interface DishProjectionPublicationSample
  extends RenderPublicationTransactionIdentity {
  readonly version: typeof RENDER_PUBLICATION_PERFORMANCE_SAMPLE_VERSION;
  readonly phase: "dish-projection";
  readonly projectionStartedAtMs: number;
  readonly projectionCompletedAtMs: number;
  readonly projectionDurationMs: number;
  readonly outcome: "snapshot" | "null" | "error";
  readonly renderSnapshotId: string | null;
  readonly samplingIdentity: string | null;
  readonly fieldCount: number | null;
  readonly lineageCount: number | null;
  readonly hasNetGrowthField: boolean | null;
  /**
   * Renderer-facing application-payload sizing only. This is not Worker wire
   * framing, measured transport bytes, heap use, GPU memory, or bandwidth.
   */
  readonly payloadEstimate: DishRenderPayloadEstimate | null;
  /**
   * Profiler overhead for the payload estimate itself. It is intentionally
   * excluded from projectionDurationMs.
   */
  readonly payloadEstimateDurationMs: number | null;
}

export interface ReactRenderPublicationCommitSample
  extends RenderPublicationTransactionIdentity {
  readonly version: typeof RENDER_PUBLICATION_PERFORMANCE_SAMPLE_VERSION;
  readonly phase: "react-dish-committed";
  readonly observedAtMs: number;
  readonly renderSnapshotId: string;
  readonly samplingIdentity: string;
  readonly fieldCount: number;
  readonly lineageCount: number;
  readonly hasNetGrowthField: boolean;
}

export type RenderPublicationPerformanceSample =
  | RuntimeSnapshotPublicationSample
  | DishProjectionPublicationSample
  | ReactRenderPublicationCommitSample;

export interface RenderPublicationPerformanceProbe {
  readonly version: typeof RENDER_PUBLICATION_PERFORMANCE_SAMPLE_VERSION;
  readonly observe: (sample: RenderPublicationPerformanceSample) => void;
  readonly now?: () => number;
}

declare global {
  // Experiment-only opt-in sink installed by the local browser harness.
  // Production runs normally leave this undefined.
  var __petraRenderPublicationPerformanceProbe:
    | RenderPublicationPerformanceProbe
    | undefined;
}

export function isRenderPublicationPerformanceEnabled(): boolean {
  return activeProbe() !== null;
}

export function observeRuntimeSnapshotPublication(
  snapshot: SimulationSnapshot | null,
  runBranchIdentity: string,
): void {
  const probe = activeProbe();
  const identity = composedTransactionIdentity(snapshot, runBranchIdentity);
  if (
    probe === null ||
    identity === null ||
    snapshot?.checkpoint.authority !== "composed"
  ) {
    return;
  }
  const checkpoint = snapshot.checkpoint;

  safeObserve(probe, {
    version: RENDER_PUBLICATION_PERFORMANCE_SAMPLE_VERSION,
    phase: "runtime-snapshot-published",
    ...identity,
    observedAtMs: safeNow(probe),
    hasEcologyObservation: snapshot.ecologyObservation !== undefined,
    totalBiomass: checkpoint.metrics.totalBiomass,
    occupiedCells: checkpoint.metrics.occupiedCells,
  });
}

/**
 * Measure only the product's composed-state -> DishRenderSnapshot projection.
 * The optional payload estimate is performed after the projection timer stops,
 * so profiling metadata work is not accidentally counted as projection cost.
 */
export function measureDishProjectionPublication(
  snapshot: SimulationSnapshot | null,
  runBranchIdentity: string,
  project: () => DishRenderSnapshot | null,
): DishRenderSnapshot | null {
  const probe = activeProbe();
  const identity = composedTransactionIdentity(snapshot, runBranchIdentity);
  if (probe === null || identity === null) {
    return project();
  }

  const projectionStartedAtMs = safeNow(probe);
  let projected: DishRenderSnapshot | null;
  try {
    projected = project();
  } catch (error) {
    const projectionCompletedAtMs = safeNow(probe);
    safeObserve(probe, {
      version: RENDER_PUBLICATION_PERFORMANCE_SAMPLE_VERSION,
      phase: "dish-projection",
      ...identity,
      projectionStartedAtMs,
      projectionCompletedAtMs,
      projectionDurationMs: Math.max(
        0,
        projectionCompletedAtMs - projectionStartedAtMs,
      ),
      outcome: "error",
      renderSnapshotId: null,
      samplingIdentity: null,
      fieldCount: null,
      lineageCount: null,
      hasNetGrowthField: null,
      payloadEstimate: null,
      payloadEstimateDurationMs: null,
    });
    throw error;
  }

  const projectionCompletedAtMs = safeNow(probe);
  let payloadEstimate: DishRenderPayloadEstimate | null = null;
  let payloadEstimateDurationMs: number | null = null;

  if (projected !== null) {
    const estimateStartedAtMs = safeNow(probe);
    try {
      payloadEstimate = estimateDishRenderSnapshotPayload(projected);
    } catch {
      // Diagnostics are observational only. A profiling helper failure must
      // never alter an otherwise valid product render transaction.
      payloadEstimate = null;
    }
    const estimateCompletedAtMs = safeNow(probe);
    payloadEstimateDurationMs = Math.max(
      0,
      estimateCompletedAtMs - estimateStartedAtMs,
    );
  }

  safeObserve(probe, {
    version: RENDER_PUBLICATION_PERFORMANCE_SAMPLE_VERSION,
    phase: "dish-projection",
    ...identity,
    projectionStartedAtMs,
    projectionCompletedAtMs,
    projectionDurationMs: Math.max(
      0,
      projectionCompletedAtMs - projectionStartedAtMs,
    ),
    outcome: projected === null ? "null" : "snapshot",
    renderSnapshotId: projected?.snapshotId ?? null,
    samplingIdentity: projected?.samplingIdentity ?? null,
    fieldCount: projected?.fields.length ?? null,
    lineageCount: projected?.lineages.length ?? null,
    hasNetGrowthField:
      projected === null
        ? null
        : projected.fields.some((field) => field.kind === "net-growth"),
    payloadEstimate,
    payloadEstimateDurationMs,
  });

  return projected;
}

export function observeDishReactCommit(
  snapshot: SimulationSnapshot | null,
  runBranchIdentity: string,
  projected: DishRenderSnapshot | null,
): void {
  const probe = activeProbe();
  const identity = composedTransactionIdentity(snapshot, runBranchIdentity);
  if (probe === null || identity === null || projected === null) return;

  safeObserve(probe, {
    version: RENDER_PUBLICATION_PERFORMANCE_SAMPLE_VERSION,
    phase: "react-dish-committed",
    ...identity,
    observedAtMs: safeNow(probe),
    renderSnapshotId: projected.snapshotId,
    samplingIdentity: projected.samplingIdentity,
    fieldCount: projected.fields.length,
    lineageCount: projected.lineages.length,
    hasNetGrowthField: projected.fields.some(
      (field) => field.kind === "net-growth",
    ),
  });
}

function composedTransactionIdentity(
  snapshot: SimulationSnapshot | null,
  runBranchIdentity: string,
): RenderPublicationTransactionIdentity | null {
  if (snapshot?.checkpoint.authority !== "composed") return null;
  const checkpoint = snapshot.checkpoint;
  return {
    runBranchIdentity,
    traceHash: snapshot.traceHash,
    tick: checkpoint.tick,
    commandCount: checkpoint.commandCount,
    simulationTimeHours: checkpoint.simulationTimeHours,
  };
}

function activeProbe(): RenderPublicationPerformanceProbe | null {
  const probe = globalThis.__petraRenderPublicationPerformanceProbe;
  if (
    probe === undefined ||
    probe.version !== RENDER_PUBLICATION_PERFORMANCE_SAMPLE_VERSION ||
    typeof probe.observe !== "function"
  ) {
    return null;
  }
  return probe;
}

function safeNow(probe: RenderPublicationPerformanceProbe): number {
  try {
    const value =
      probe.now?.() ??
      globalThis.performance?.now?.() ??
      Date.now();
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function safeObserve(
  probe: RenderPublicationPerformanceProbe,
  sample: RenderPublicationPerformanceSample,
): void {
  try {
    probe.observe(sample);
  } catch {
    // Local diagnostics must never perturb authoritative/product behavior.
  }
}

