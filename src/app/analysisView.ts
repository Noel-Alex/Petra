import type { AuthoritativeLineageAnalysis } from "../sim/evolution/analysis";
import type { LineageContrastMode } from "../design/lineageIdentity";
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

export type AncestryOnlyLineageInput = Omit<
  LineageAncestryInput,
  "scientificDetail"
> & {
  readonly scientificDetail?: never;
};

export interface AuthoritativeAnalysisRecords {
  readonly identity: AuthoritativeAnalysisIdentity;
  readonly series: readonly ScientificSeriesInput[];
  /** Generic ancestry-only records for callers without the #665 projection. */
  readonly lineages?: readonly AncestryOnlyLineageInput[];
  /** Full authoritative #665 lineage analysis; mutually exclusive with lineages. */
  readonly lineageAnalysis?: AuthoritativeLineageAnalysis;
}

export type AnalysisSurfaceView =
  | {
      readonly status: "unavailable";
      readonly message: string;
    }
  | {
      readonly status: "available";
      readonly identity: AuthoritativeAnalysisIdentity;
      readonly charts: readonly ScientificChartProjection[];
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
  options: { readonly contrastMode?: LineageContrastMode } = {},
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

  const lineages = resolveLineageInputs(records);
  assertRecordsDoNotExceedStateTime(records.identity, records.series, lineages);

  return {
    status: "available",
    identity: records.identity,
    charts: buildScientificChartsByUnit(records.series),
    lineageTree: buildLineageTree(lineages, {
      contrastMode: options.contrastMode ?? "standard",
    }),
  };
}

function buildScientificChartsByUnit(
  series: readonly ScientificSeriesInput[],
): readonly ScientificChartProjection[] {
  const grouped = new Map<string, ScientificSeriesInput[]>();

  for (const item of series) {
    const existing = grouped.get(item.unit);
    if (existing === undefined) {
      grouped.set(item.unit, [item]);
    } else {
      existing.push(item);
    }
  }

  return Array.from(grouped.values(), (unitSeries) =>
    buildScientificChart(unitSeries, {
      maxPointsPerSeries: ANALYSIS_MAX_POINTS_PER_SERIES,
      zeroBaseline: true,
    }),
  );
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

function resolveLineageInputs(
  records: AuthoritativeAnalysisRecords,
): readonly LineageAncestryInput[] {
  const hasLineages = records.lineages !== undefined;
  const hasLineageAnalysis = records.lineageAnalysis !== undefined;
  if (hasLineages === hasLineageAnalysis) {
    throw new Error(
      "analysis records require exactly one lineage source: lineages or lineageAnalysis",
    );
  }

  if (records.lineageAnalysis !== undefined) {
    const analysis = records.lineageAnalysis;
    if (analysis.schemaVersion !== 1) {
      throw new RangeError("unsupported authoritative lineage analysis schema");
    }
    if (analysis.simulationTimeHours !== records.identity.simulationTimeHours) {
      throw new Error(
        "authoritative lineage analysis time does not match its bound analysis state",
      );
    }

    return analysis.records.map((record) => {
      const expectedStatus =
        record.extinctAtHours === null ? "extant" : "extinct";
      if (record.status !== expectedStatus) {
        throw new Error(
          "authoritative lineage lifecycle status disagrees with extinction time for " +
            record.lineageId,
        );
      }

      return {
        lineageId: record.lineageId,
        parentLineageId: record.parentLineageId,
        genotypeId: record.genotypeId,
        createdAtHours: record.createdAtHours,
        extinctAtHours: record.extinctAtHours,
        scientificDetail: {
          genotypeLabel: record.genotypeLabel,
          originCellIndex: record.originCellIndex,
          mutationClass: record.mutationClass,
          abundanceModelBiomass: record.abundanceModelBiomass,
          relativeFitness: record.relativeFitness,
          sourceKeys: [...record.sourceKeys],
          assumptionKeys: [...record.assumptionKeys],
        },
      };
    });
  }

  const lineages = records.lineages!;
  for (const lineage of lineages) {
    if ((lineage as LineageAncestryInput).scientificDetail !== undefined) {
      throw new Error(
        "rich lineage scientific detail requires full authoritative lineageAnalysis",
      );
    }
  }
  return lineages;
}

function assertRecordsDoNotExceedStateTime(
  identity: AuthoritativeAnalysisIdentity,
  series: readonly ScientificSeriesInput[],
  lineages: readonly LineageAncestryInput[],
): void {
  const stateTime = identity.simulationTimeHours;

  for (const seriesItem of series) {
    for (const point of seriesItem.points) {
      if (point.timeHours > stateTime) {
        throw new RangeError(
          `analysis series ${seriesItem.id} contains a sample after its authoritative state time`,
        );
      }
    }
  }

  for (const lineage of lineages) {
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
