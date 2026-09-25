import { gridCellCenter } from "./gridGeometry";
import {
  projectComparableLineageDensity,
} from "./lineageDensityPresentation";
import type { RenderLineage } from "./model";

export const COLONY_MASS_PRESENTATION_VERSION = 1 as const;

export interface ColonyMassPresentationPolicy {
  readonly version: typeof COLONY_MASS_PRESENTATION_VERSION;
  /**
   * Presentation-only normalized intensity threshold used to identify support
   * for bounded accent islands. This is not a biological colony boundary.
   */
  readonly accentThreshold: number;
  /**
   * Small islands remain visible in the continuous mass field; this only
   * controls whether they receive a higher-level accent summary.
   */
  readonly minimumAccentCells: number;
  /**
   * Hard presentation cap so output object count does not scale with occupancy.
   */
  readonly maximumAccentIslands: number;
  readonly connectivity: "eight-neighbour";
}

export const DEFAULT_COLONY_MASS_PRESENTATION_POLICY: ColonyMassPresentationPolicy =
  Object.freeze({
    version: COLONY_MASS_PRESENTATION_VERSION,
    accentThreshold: 0.45,
    minimumAccentCells: 3,
    maximumAccentIslands: 8,
    connectivity: "eight-neighbour",
  });

export interface ColonyMassAccentIsland {
  readonly firstCellIndex: number;
  readonly cellCount: number;
  readonly integratedIntensity: number;
  readonly peakIntensity: number;
  readonly centroidX: number;
  readonly centroidY: number;
  readonly minColumn: number;
  readonly maxColumn: number;
  readonly minRow: number;
  readonly maxRow: number;
}

export interface ColonyMassProjection {
  readonly version: typeof COLONY_MASS_PRESENTATION_VERSION;
  readonly width: number;
  readonly height: number;
  /**
   * Continuous presentation-only mass intensity in [0, 1].
   * Zero source density is represented by exact zero.
   */
  readonly alpha: Float32Array;
  readonly positiveCellCount: number;
  readonly detectedAccentIslandCount: number;
  readonly accentIslands: readonly ColonyMassAccentIsland[];
}

/**
 * Projects one lineage's already-authoritative comparable density channel into
 * a continuous colony-mass intensity plus a bounded set of merged accent
 * islands.
 *
 * The caller owns the shared snapshot-wide denominator. This function never
 * self-normalizes a lineage, changes source density, infers organism kind, or
 * creates biological colony boundaries. Eight-neighbour grouping is a
 * presentation merge rule only.
 */
export function projectColonyMassPresentation(args: {
  readonly lineage: RenderLineage;
  readonly dishMask: Uint8Array;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly sharedMaximum: number;
  readonly policy?: ColonyMassPresentationPolicy;
}): ColonyMassProjection {
  assertPositiveSafeInteger("gridWidth", args.gridWidth);
  assertPositiveSafeInteger("gridHeight", args.gridHeight);

  const cells = args.gridWidth * args.gridHeight;
  if (!Number.isSafeInteger(cells)) {
    throw new RangeError("colony mass grid cell count exceeds safe integer range");
  }
  if (
    args.lineage.density.length !== cells ||
    args.dishMask.length !== cells
  ) {
    throw new RangeError(
      "colony mass density/mask lengths must match render grid",
    );
  }
  if (!Number.isFinite(args.sharedMaximum) || args.sharedMaximum < 0) {
    throw new RangeError(
      "colony mass shared maximum must be finite and non-negative",
    );
  }

  const policy = validatePolicy(
    args.policy ?? DEFAULT_COLONY_MASS_PRESENTATION_POLICY,
  );
  const alpha = new Float32Array(cells);
  const accentSupport = new Uint8Array(cells);
  let positiveCellCount = 0;

  for (let index = 0; index < cells; index += 1) {
    const mask = args.dishMask[index];
    if (mask !== 0 && mask !== 1) {
      throw new RangeError("colony mass dish mask values must be 0 or 1");
    }

    const density = args.lineage.density[index];
    if (density === undefined || !Number.isFinite(density) || density < 0) {
      throw new RangeError(
        "colony mass lineage density must be finite and non-negative",
      );
    }
    if (mask !== 1 || density === 0) {
      alpha[index] = 0;
      continue;
    }
    if (args.sharedMaximum === 0 || density > args.sharedMaximum) {
      throw new RangeError(
        "colony mass shared maximum must cover every positive in-mask lineage density",
      );
    }

    const projected = projectComparableLineageDensity(
      density,
      args.sharedMaximum,
    ).normalized;
    const narrowed = Math.fround(projected);
    alpha[index] = narrowed;
    if (narrowed > 0) positiveCellCount += 1;
    if (narrowed >= policy.accentThreshold) {
      accentSupport[index] = 1;
    }
  }

  const components = collectAccentIslands({
    support: accentSupport,
    alpha,
    width: args.gridWidth,
    height: args.gridHeight,
    minimumAccentCells: policy.minimumAccentCells,
  });

  const ranked = components
    .sort(compareAccentIslands)
    .slice(0, policy.maximumAccentIslands)
    .map((island) => Object.freeze(island));

  return Object.freeze({
    version: COLONY_MASS_PRESENTATION_VERSION,
    width: args.gridWidth,
    height: args.gridHeight,
    alpha,
    positiveCellCount,
    detectedAccentIslandCount: components.length,
    accentIslands: Object.freeze(ranked),
  });
}

function collectAccentIslands(args: {
  readonly support: Uint8Array;
  readonly alpha: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly minimumAccentCells: number;
}): ColonyMassAccentIsland[] {
  const visited = new Uint8Array(args.support.length);
  const islands: ColonyMassAccentIsland[] = [];
  const queue: number[] = [];

  for (let start = 0; start < args.support.length; start += 1) {
    if (args.support[start] !== 1 || visited[start] === 1) continue;

    visited[start] = 1;
    queue.length = 0;
    queue.push(start);
    let cursor = 0;
    let cellCount = 0;
    let integratedIntensity = 0;
    let peakIntensity = 0;
    let weightedX = 0;
    let weightedY = 0;
    let minColumn = args.width;
    let maxColumn = -1;
    let minRow = args.height;
    let maxRow = -1;

    while (cursor < queue.length) {
      const cellIndex = queue[cursor++]!;
      const center = gridCellCenter(cellIndex, args.width, args.height);
      const intensity = args.alpha[cellIndex]!;
      cellCount += 1;
      integratedIntensity += intensity;
      peakIntensity = Math.max(peakIntensity, intensity);
      weightedX += center.x * intensity;
      weightedY += center.y * intensity;
      minColumn = Math.min(minColumn, center.column);
      maxColumn = Math.max(maxColumn, center.column);
      minRow = Math.min(minRow, center.row);
      maxRow = Math.max(maxRow, center.row);

      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
          if (rowOffset === 0 && columnOffset === 0) continue;
          const row = center.row + rowOffset;
          const column = center.column + columnOffset;
          if (
            row < 0 ||
            row >= args.height ||
            column < 0 ||
            column >= args.width
          ) {
            continue;
          }

          const neighbour = row * args.width + column;
          if (
            args.support[neighbour] === 1 &&
            visited[neighbour] !== 1
          ) {
            visited[neighbour] = 1;
            queue.push(neighbour);
          }
        }
      }
    }

    if (cellCount < args.minimumAccentCells) continue;
    if (!(integratedIntensity > 0)) {
      throw new Error("accent island must have positive integrated intensity");
    }

    islands.push({
      firstCellIndex: start,
      cellCount,
      integratedIntensity,
      peakIntensity,
      centroidX: weightedX / integratedIntensity,
      centroidY: weightedY / integratedIntensity,
      minColumn,
      maxColumn,
      minRow,
      maxRow,
    });
  }

  return islands;
}

function compareAccentIslands(
  left: ColonyMassAccentIsland,
  right: ColonyMassAccentIsland,
): number {
  return (
    right.integratedIntensity - left.integratedIntensity ||
    right.peakIntensity - left.peakIntensity ||
    right.cellCount - left.cellCount ||
    left.firstCellIndex - right.firstCellIndex
  );
}

function validatePolicy(
  policy: ColonyMassPresentationPolicy,
): ColonyMassPresentationPolicy {
  if (policy.version !== COLONY_MASS_PRESENTATION_VERSION) {
    throw new RangeError("unsupported colony mass presentation policy version");
  }
  if (
    !Number.isFinite(policy.accentThreshold) ||
    policy.accentThreshold <= 0 ||
    policy.accentThreshold > 1
  ) {
    throw new RangeError(
      "colony mass accent threshold must be finite and in (0, 1]",
    );
  }
  assertPositiveSafeInteger("minimumAccentCells", policy.minimumAccentCells);
  assertPositiveSafeInteger(
    "maximumAccentIslands",
    policy.maximumAccentIslands,
  );
  if (policy.connectivity !== "eight-neighbour") {
    throw new RangeError("unsupported colony mass presentation connectivity");
  }
  return policy;
}

function assertPositiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}
