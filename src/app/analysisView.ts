import {
  buildLineageTree,
  buildScientificChart,
  type LineageAncestryInput,
  type LineageTreeLayout,
  type ScientificChartProjection,
  type ScientificSeriesInput,
} from "../ui/analysis/model";

export const ANALYSIS_VIEW_SCHEMA_VERSION = 1 as const;
export const ANALYSIS_MAX_POINTS_PER_SERIES = 240;

export interface AuthoritativeAnalysisIdentity {
  /** Stable authoritative run/branch identity supplied by runtime authority. */
  readonly runIdentity: string;
  /** Stable snapshot/checkpoint/view identity for the records below. */
  readonly stateIdentity: string;
  readonly simulationTimeHours: number;
}

export interface AuthoritativeAnalysisRecords {
  readonly identity: AuthoritativeAnalysisIdentity;
  readonly series: readonly ScientificSeriesInput[];
  readonly lineages: readonly LineageAncestryInput[];
}

export type AnalysisSurfaceView =
  | {
      readonly status: "unavailable";
      readonly message: string;
    }
  | {
      readonly status: "available";
      readonly identity: AuthoritativeAnalysisIdentity;
      readonly chart: ScientificChartProjection;
      readonly lineageTree: LineageTreeLayout;
    };

/**
 * App-facing projection of already-authoritative analysis records.
 *
 * This function deliberately accepts no SimulationSnapshot/syntheticPopulation
 * type. #37/#42 must explicitly adapt real composed runtime records into this
 * contract when those records exist.
 */
export function projectAuthoritativeAnalysis(
  records: AuthoritativeAnalysisRecords | null | undefined,
): AnalysisSurfaceView {
  if (records === null || records === undefined) {
    return {
      status: "unavailable",
      message:
        "Authoritative analysis is not connected. Petra will not substitute synthetic or visual-demo data.",
    };
  }

  validateIdentity(records.identity);

  if (records.series.length === 0) {
    return {
      status: "unavailable",
      message:
        "Authoritative analysis records contain no scientific time series yet.",
    };
  }

  assertRecordsDoNotExceedStateTime(records);

  return {
    status: "available",
    identity: records.identity,
    chart: buildScientificChart(records.series, {
      maxPointsPerSeries: ANALYSIS_MAX_POINTS_PER_SERIES,
      zeroBaseline: true,
    }),
    lineageTree: buildLineageTree(records.lineages),
  };
}

function validateIdentity(identity: AuthoritativeAnalysisIdentity): void {
  if (identity.runIdentity.trim().length === 0) {
    throw new TypeError("analysis runIdentity must be non-empty");
  }
  if (identity.stateIdentity.trim().length === 0) {
    throw new TypeError("analysis stateIdentity must be non-empty");
  }
  if (
    !Number.isFinite(identity.simulationTimeHours) ||
    identity.simulationTimeHours < 0
  ) {
    throw new RangeError(
      "analysis simulationTimeHours must be finite and non-negative",
    );
  }
}

function assertRecordsDoNotExceedStateTime(
  records: AuthoritativeAnalysisRecords,
): void {
  const stateTime = records.identity.simulationTimeHours;

  for (const series of records.series) {
    for (const point of series.points) {
      if (point.timeHours > stateTime) {
        throw new RangeError(
          `analysis series ${series.id} contains a sample after its authoritative state time`,
        );
      }
    }
  }

  for (const lineage of records.lineages) {
    if (lineage.createdAtHours > stateTime) {
      throw new RangeError(
        `analysis lineage ${lineage.lineageId} was created after its authoritative state time`,
      );
    }
    if (
      lineage.extinctAtHours !== null &&
      lineage.extinctAtHours > stateTime
    ) {
      throw new RangeError(
        `analysis lineage ${lineage.lineageId} became extinct after its authoritative state time`,
      );
    }
  }
}
