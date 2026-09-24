import {
  resolveLineageVisualIdentity,
  type LineageAppearanceToken,
  type LineageContrastMode,
  type LineagePatternToken,
} from "../../design/lineageIdentity";
import type { PetraVisualColorToken } from "../../design/visualTokens";
import {
  resolveMotion,
  type MotionPreference,
  type MotionTreatment,
  type ResolvedMotion,
} from "../motion/policy";
import { resolveCausalEventChoreography } from "../motion/events";
import { MOTION } from "../motion/tokens";

export interface ScientificSeriesPoint {
  readonly timeHours: number;
  readonly value: number;
}

export interface ScientificSeriesInput {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly appearanceToken: string;
  readonly patternToken: string;
  readonly points: readonly ScientificSeriesPoint[];
}

export interface ProjectedSeriesPoint extends ScientificSeriesPoint {
  readonly x: number;
  readonly y: number;
}

export interface ScientificSeriesProjection {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly appearanceToken: string;
  readonly patternToken: string;
  readonly sourcePointCount: number;
  /** Complete authoritative samples, independent of the visual point budget. */
  readonly sourcePoints: readonly ScientificSeriesPoint[];
  /** Source-selected visual geometry; may be decimated but never interpolated. */
  readonly points: readonly ProjectedSeriesPoint[];
}

export interface ScientificChartProjection {
  readonly unit: string;
  readonly timeMinimumHours: number;
  readonly timeMaximumHours: number;
  readonly valueMinimum: number;
  readonly valueMaximum: number;
  readonly series: readonly ScientificSeriesProjection[];
  readonly interpolation: "none";
}

export interface LineageAncestryInput {
  readonly lineageId: string;
  readonly parentLineageId: string | null;
  readonly genotypeId: string;
  readonly createdAtHours: number;
  readonly extinctAtHours: number | null;
}

export interface LineageTreeNode extends LineageAncestryInput {
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  readonly status: "extant" | "extinct";
  readonly appearanceToken: LineageAppearanceToken;
  readonly colorToken: PetraVisualColorToken;
  readonly patternToken: LineagePatternToken;
  readonly contrastMode: LineageContrastMode;
  readonly strokeWidthScale: number;
  readonly ariaLabel: string;
}

export interface LineageTreeEdge {
  readonly parentLineageId: string;
  readonly childLineageId: string;
}

export interface LineageTreeLayout {
  readonly timeMinimumHours: number;
  readonly timeMaximumHours: number;
  readonly nodes: readonly LineageTreeNode[];
  readonly edges: readonly LineageTreeEdge[];
}

export interface AnalysisMotionPlan {
  readonly panel: ResolvedMotion;
  readonly panelEasing: readonly [number, number, number, number];
  readonly chart: ResolvedMotion;
  readonly chartEasing: readonly [number, number, number, number];
  readonly lineageBranch: {
    readonly treatment: MotionTreatment;
    readonly durationMs: number;
    readonly easing: readonly [number, number, number, number];
  };
}

/**
 * Builds chart geometry from authoritative samples only.
 * Decimation selects existing points; no values are interpolated or smoothed.
 */
export function buildScientificChart(
  inputs: readonly ScientificSeriesInput[],
  options: {
    readonly maxPointsPerSeries: number;
    readonly zeroBaseline?: boolean;
  },
): ScientificChartProjection {
  if (inputs.length === 0) {
    throw new RangeError("scientific chart requires at least one series");
  }
  if (!Number.isInteger(options.maxPointsPerSeries) || options.maxPointsPerSeries < 2) {
    throw new RangeError("maxPointsPerSeries must be an integer >= 2");
  }

  const unit = inputs[0]!.unit;
  assertNonEmpty("unit", unit);
  let tMin = Number.POSITIVE_INFINITY;
  let tMax = Number.NEGATIVE_INFINITY;
  let vMin = Number.POSITIVE_INFINITY;
  let vMax = Number.NEGATIVE_INFINITY;

  const seriesIds = new Set<string>();
  for (const series of inputs) {
    validateSeries(series);
    if (seriesIds.has(series.id)) {
      throw new RangeError("duplicate scientific series id: " + series.id);
    }
    seriesIds.add(series.id);
    if (series.unit !== unit) {
      throw new RangeError("series with different units must use separate scientific charts");
    }
    for (const point of series.points) {
      tMin = Math.min(tMin, point.timeHours);
      tMax = Math.max(tMax, point.timeHours);
      vMin = Math.min(vMin, point.value);
      vMax = Math.max(vMax, point.value);
    }
  }

  if (options.zeroBaseline === true) {
    vMin = Math.min(0, vMin);
    vMax = Math.max(0, vMax);
  }

  const timeDomain = expandDegenerateTimeDomain(tMin, tMax);
  const valueDomain = expandDegenerateDomain(vMin, vMax);

  return {
    unit,
    timeMinimumHours: timeDomain.minimum,
    timeMaximumHours: timeDomain.maximum,
    valueMinimum: valueDomain.minimum,
    valueMaximum: valueDomain.maximum,
    series: inputs.map((series) => {
      const sourcePoints = series.points.map((point) => ({ ...point }));
      return {
        id: series.id,
        label: series.label,
        unit: series.unit,
        appearanceToken: series.appearanceToken,
        patternToken: series.patternToken,
        sourcePointCount: sourcePoints.length,
        sourcePoints,
        points: decimateSourcePoints(
          sourcePoints,
          options.maxPointsPerSeries,
        ).map((point) => ({
          ...point,
          x: normalize(point.timeHours, timeDomain.minimum, timeDomain.maximum),
          y: 1 - normalize(point.value, valueDomain.minimum, valueDomain.maximum),
        })),
      };
    }),
    interpolation: "none",
  };
}

/**
 * Largest-triangle-three-buckets selection. Returned objects are original
 * source points in source order; averages are used only to choose which source
 * point to retain.
 */
export function decimateSourcePoints(
  points: readonly ScientificSeriesPoint[],
  maxPoints: number,
): readonly ScientificSeriesPoint[] {
  if (!Number.isInteger(maxPoints) || maxPoints < 2) {
    throw new RangeError("maxPoints must be an integer >= 2");
  }
  validatePoints(points);
  if (points.length <= maxPoints) return [...points];
  if (maxPoints === 2) return [points[0]!, points[points.length - 1]!];

  const every = (points.length - 2) / (maxPoints - 2);
  const sampled: ScientificSeriesPoint[] = [points[0]!];
  let anchorIndex = 0;

  for (let bucket = 0; bucket < maxPoints - 2; bucket += 1) {
    const averageStart = Math.min(
      points.length - 1,
      Math.floor((bucket + 1) * every) + 1,
    );
    const averageEnd = Math.min(
      points.length,
      Math.floor((bucket + 2) * every) + 1,
    );

    let averageTime = 0;
    let averageValue = 0;
    let count = 0;
    for (let index = averageStart; index < averageEnd; index += 1) {
      averageTime += points[index]!.timeHours;
      averageValue += points[index]!.value;
      count += 1;
    }
    if (count === 0) {
      const last = points[points.length - 1]!;
      averageTime = last.timeHours;
      averageValue = last.value;
      count = 1;
    }
    averageTime /= count;
    averageValue /= count;

    const rangeStart = Math.min(
      points.length - 2,
      Math.floor(bucket * every) + 1,
    );
    const rangeEnd = Math.min(
      points.length - 1,
      Math.floor((bucket + 1) * every) + 1,
    );
    const anchor = points[anchorIndex]!;
    let selectedIndex = rangeStart;
    let largestArea = -1;

    for (
      let index = rangeStart;
      index < Math.max(rangeStart + 1, rangeEnd);
      index += 1
    ) {
      const point = points[index]!;
      const area = Math.abs(
        (anchor.timeHours - averageTime) * (point.value - anchor.value) -
          (anchor.timeHours - point.timeHours) * (averageValue - anchor.value),
      );
      if (area > largestArea) {
        largestArea = area;
        selectedIndex = index;
      }
    }

    sampled.push(points[selectedIndex]!);
    anchorIndex = selectedIndex;
  }

  sampled.push(points[points.length - 1]!);
  return sampled;
}

export function buildLineageTree(
  inputs: readonly LineageAncestryInput[],
  options: { readonly contrastMode?: LineageContrastMode } = {},
): LineageTreeLayout {
  if (inputs.length === 0) {
    return { timeMinimumHours: 0, timeMaximumHours: 1, nodes: [], edges: [] };
  }

  const byId = new Map<string, LineageAncestryInput>();
  for (const lineage of inputs) {
    validateLineage(lineage);
    if (byId.has(lineage.lineageId)) {
      throw new RangeError("duplicate lineage id: " + lineage.lineageId);
    }
    byId.set(lineage.lineageId, lineage);
  }

  for (const lineage of inputs) {
    if (lineage.parentLineageId === null) continue;
    const parent = byId.get(lineage.parentLineageId);
    if (parent === undefined) {
      throw new RangeError("unknown parent lineage: " + lineage.parentLineageId);
    }
    if (lineage.createdAtHours < parent.createdAtHours) {
      throw new RangeError("lineage " + lineage.lineageId + " predates its parent");
    }
    if (
      parent.extinctAtHours !== null &&
      lineage.createdAtHours > parent.extinctAtHours
    ) {
      throw new RangeError(
        "lineage " + lineage.lineageId + " was created after its parent became extinct",
      );
    }
  }

  const depthMemo = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (lineageId: string): number => {
    const cached = depthMemo.get(lineageId);
    if (cached !== undefined) return cached;
    if (visiting.has(lineageId)) {
      throw new RangeError("lineage ancestry contains a cycle");
    }
    visiting.add(lineageId);
    const lineage = byId.get(lineageId)!;
    const depth =
      lineage.parentLineageId === null ? 0 : depthOf(lineage.parentLineageId) + 1;
    visiting.delete(lineageId);
    depthMemo.set(lineageId, depth);
    return depth;
  };
  for (const lineage of inputs) depthOf(lineage.lineageId);

  const children = new Map<string | null, LineageAncestryInput[]>();
  for (const lineage of inputs) {
    const siblings = children.get(lineage.parentLineageId) ?? [];
    siblings.push(lineage);
    children.set(lineage.parentLineageId, siblings);
  }
  for (const siblings of children.values()) siblings.sort(compareLineages);

  const ordered: LineageAncestryInput[] = [];
  const visit = (lineage: LineageAncestryInput): void => {
    ordered.push(lineage);
    for (const child of children.get(lineage.lineageId) ?? []) visit(child);
  };
  for (const root of children.get(null) ?? []) visit(root);

  if (ordered.length !== inputs.length) {
    throw new RangeError("lineage ancestry contains unreachable/cyclic records");
  }

  const times = inputs.map((lineage) => lineage.createdAtHours);
  const domain = expandDegenerateTimeDomain(Math.min(...times), Math.max(...times));
  const nodes = ordered.map((lineage, index): LineageTreeNode => {
    const visualIdentity = resolveLineageVisualIdentity(
      lineage.lineageId,
      options.contrastMode ?? "standard",
    );
    return {
    ...lineage,
    depth: depthMemo.get(lineage.lineageId)!,
    x: normalize(lineage.createdAtHours, domain.minimum, domain.maximum),
    y: ordered.length === 1 ? 0.5 : index / (ordered.length - 1),
    status: lineage.extinctAtHours === null ? "extant" : "extinct",
    appearanceToken: visualIdentity.appearanceToken,
    colorToken: visualIdentity.colorToken,
    patternToken: visualIdentity.patternToken,
    contrastMode: visualIdentity.contrastMode,
    strokeWidthScale: visualIdentity.strokeWidthScale,
    ariaLabel:
      lineage.lineageId +
      ", genotype " +
      lineage.genotypeId +
      ", created at " +
      formatHours(lineage.createdAtHours) +
      ", " +
      (lineage.extinctAtHours === null
        ? "extant"
        : "extinct at " + formatHours(lineage.extinctAtHours)),
    };
  });

  return {
    timeMinimumHours: domain.minimum,
    timeMaximumHours: domain.maximum,
    nodes,
    edges: ordered.flatMap((lineage): readonly LineageTreeEdge[] =>
      lineage.parentLineageId === null
        ? []
        : [{
            parentLineageId: lineage.parentLineageId,
            childLineageId: lineage.lineageId,
          }],
    ),
  };
}

export function resolveAnalysisMotion(
  preference: MotionPreference,
): AnalysisMotionPlan {
  const panel = resolveMotion(preference, {
    kind: "navigational",
    durationMs: MOTION.panel.durationMs,
  });
  const chart = resolveMotion(preference, {
    kind: "causal",
    durationMs: MOTION.fieldShift.durationMs,
  });
  const mutation = resolveCausalEventChoreography("mutation-observed", preference);
  const branch =
    mutation.cues.find((cue) => cue.visual === "lineage-branch") ??
    mutation.cues[0];

  if (branch === undefined) {
    throw new Error("mutation choreography must expose an essential cue");
  }

  return {
    panel,
    panelEasing: MOTION.panel.easing,
    chart,
    chartEasing: MOTION.fieldShift.easing,
    lineageBranch: {
      treatment: branch.treatment,
      durationMs: branch.durationMs,
      easing: branch.easing,
    },
  };
}

function validateSeries(series: ScientificSeriesInput): void {
  assertNonEmpty("series.id", series.id);
  assertNonEmpty("series.label", series.label);
  assertNonEmpty("series.unit", series.unit);
  assertNonEmpty("series.appearanceToken", series.appearanceToken);
  assertNonEmpty("series.patternToken", series.patternToken);
  if (series.points.length === 0) {
    throw new RangeError("series " + series.id + " requires at least one point");
  }
  validatePoints(series.points);
}

function validatePoints(points: readonly ScientificSeriesPoint[]): void {
  let previousTime = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (!Number.isFinite(point.timeHours) || point.timeHours < 0) {
      throw new RangeError("series time must be finite and non-negative");
    }
    if (!Number.isFinite(point.value)) {
      throw new RangeError("series values must be finite");
    }
    if (point.timeHours === previousTime) {
      throw new RangeError(
        "series points must have unique simulation timestamps",
      );
    }
    if (point.timeHours < previousTime) {
      throw new RangeError("series points must be ordered by simulation time");
    }
    previousTime = point.timeHours;
  }
}

function validateLineage(lineage: LineageAncestryInput): void {
  assertNonEmpty("lineageId", lineage.lineageId);
  assertNonEmpty("genotypeId", lineage.genotypeId);
  if (!Number.isFinite(lineage.createdAtHours) || lineage.createdAtHours < 0) {
    throw new RangeError("lineage creation time must be finite and non-negative");
  }
  if (
    lineage.extinctAtHours !== null &&
    (!Number.isFinite(lineage.extinctAtHours) ||
      lineage.extinctAtHours < lineage.createdAtHours)
  ) {
    throw new RangeError("lineage extinction time must be null or no earlier than creation");
  }
  if (lineage.parentLineageId === lineage.lineageId) {
    throw new RangeError("lineage cannot be its own parent");
  }
}

function compareLineages(
  left: LineageAncestryInput,
  right: LineageAncestryInput,
): number {
  return left.createdAtHours - right.createdAtHours ||
    left.lineageId.localeCompare(right.lineageId);
}

function expandDegenerateTimeDomain(
  minimum: number,
  maximum: number,
): { readonly minimum: number; readonly maximum: number } {
  if (
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum < 0 ||
    maximum < 0
  ) {
    throw new RangeError("biological time domain must be finite and non-negative");
  }
  if (maximum !== minimum) return { minimum, maximum };

  const delta = Math.max(1, minimum * 0.05);
  if (minimum < delta) {
    return { minimum: 0, maximum: minimum + delta };
  }
  return { minimum: minimum - delta, maximum: maximum + delta };
}

function expandDegenerateDomain(
  minimum: number,
  maximum: number,
): { readonly minimum: number; readonly maximum: number } {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    throw new RangeError("chart/tree domain must be finite");
  }
  if (maximum !== minimum) return { minimum, maximum };
  const delta = Math.max(1, Math.abs(minimum) * 0.05);
  return { minimum: minimum - delta, maximum: maximum + delta };
}

function normalize(value: number, minimum: number, maximum: number): number {
  return (value - minimum) / (maximum - minimum);
}

function formatHours(hours: number): string {
  return String(Number(hours.toFixed(3))) + " h";
}

function assertNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) throw new TypeError(name + " must be non-empty");
}
