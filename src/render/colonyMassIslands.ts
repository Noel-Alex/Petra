import { gridCellCenter } from "./gridGeometry";
import {
  COLONY_MASS_PRESENTATION_VERSION,
  type ColonyMassAlphaField,
} from "./colonyMassPresentation";

export const COLONY_MASS_ISLAND_POLICY_VERSION = 1 as const;

export interface ColonyMassIslandPolicy {
  readonly version: typeof COLONY_MASS_ISLAND_POLICY_VERSION;
  /**
   * Presentation-only alpha threshold for higher-level accent support.
   * The continuous alpha raster remains visible below this value.
   */
  readonly minimumAlpha: number;
  /**
   * Small support remains visible in the continuous raster but is not promoted
   * to a separate accent object.
   */
  readonly minimumCells: number;
  /** Hard output cap so accent object count cannot scale with occupancy. */
  readonly maximumIslands: number;
  readonly connectivity: "eight-neighbour";
}

export const DEFAULT_COLONY_MASS_ISLAND_POLICY: ColonyMassIslandPolicy =
  Object.freeze({
    version: COLONY_MASS_ISLAND_POLICY_VERSION,
    minimumAlpha: 0.5,
    minimumCells: 4,
    maximumIslands: 8,
    connectivity: "eight-neighbour",
  });

export interface ColonyMassAccentIsland {
  readonly firstCellIndex: number;
  readonly cellCount: number;
  readonly integratedAlpha: number;
  readonly peakAlpha: number;
  readonly centroidX: number;
  readonly centroidY: number;
  readonly minColumn: number;
  readonly maxColumn: number;
  readonly minRow: number;
  readonly maxRow: number;
}

export interface ColonyMassIslandProjection {
  readonly version: typeof COLONY_MASS_ISLAND_POLICY_VERSION;
  readonly sourcePresentationVersion: typeof COLONY_MASS_PRESENTATION_VERSION;
  readonly eligibleIslandCount: number;
  readonly islands: readonly ColonyMassAccentIsland[];
}

/**
 * Extracts a bounded number of presentation-only merged accent islands from the
 * already-projected colony mass alpha field.
 *
 * The source alpha field remains the complete colony body. This helper only
 * decides where a small number of higher-level visual accents may be placed.
 * It never rewrites source density, bridges zero-alpha gaps, infers organism
 * shape, or creates a biological colony/front/CFU concept.
 */
export function extractColonyMassAccentIslands(
  field: ColonyMassAlphaField,
  policy: ColonyMassIslandPolicy = DEFAULT_COLONY_MASS_ISLAND_POLICY,
): ColonyMassIslandProjection {
  validateField(field);
  const validatedPolicy = validatePolicy(policy);
  const support = new Uint8Array(field.alpha.length);

  for (let index = 0; index < field.alpha.length; index += 1) {
    const alpha = field.alpha[index]!;
    if (alpha >= validatedPolicy.minimumAlpha && alpha > 0) {
      support[index] = 1;
    }
  }

  const eligible = collectEligibleIslands({
    support,
    alpha: field.alpha,
    width: field.width,
    height: field.height,
    minimumCells: validatedPolicy.minimumCells,
  });

  eligible.sort(compareIslands);

  return Object.freeze({
    version: COLONY_MASS_ISLAND_POLICY_VERSION,
    sourcePresentationVersion: COLONY_MASS_PRESENTATION_VERSION,
    eligibleIslandCount: eligible.length,
    islands: Object.freeze(
      eligible
        .slice(0, validatedPolicy.maximumIslands)
        .map((island) => Object.freeze(island)),
    ),
  });
}

function collectEligibleIslands(args: {
  readonly support: Uint8Array;
  readonly alpha: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly minimumCells: number;
}): ColonyMassAccentIsland[] {
  const visited = new Uint8Array(args.support.length);
  const queue: number[] = [];
  const islands: ColonyMassAccentIsland[] = [];

  for (let start = 0; start < args.support.length; start += 1) {
    if (args.support[start] !== 1 || visited[start] === 1) continue;

    visited[start] = 1;
    queue.length = 0;
    queue.push(start);

    let cursor = 0;
    let cellCount = 0;
    let integratedAlpha = 0;
    let peakAlpha = 0;
    let weightedX = 0;
    let weightedY = 0;
    let minColumn = args.width;
    let maxColumn = -1;
    let minRow = args.height;
    let maxRow = -1;

    while (cursor < queue.length) {
      const cellIndex = queue[cursor++]!;
      const center = gridCellCenter(cellIndex, args.width, args.height);
      const alpha = args.alpha[cellIndex]!;
      cellCount += 1;
      integratedAlpha += alpha;
      peakAlpha = Math.max(peakAlpha, alpha);
      weightedX += center.x * alpha;
      weightedY += center.y * alpha;
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

    if (cellCount < args.minimumCells) continue;
    if (!(integratedAlpha > 0)) {
      throw new Error("eligible colony mass island must have positive alpha");
    }

    islands.push({
      firstCellIndex: start,
      cellCount,
      integratedAlpha,
      peakAlpha,
      centroidX: weightedX / integratedAlpha,
      centroidY: weightedY / integratedAlpha,
      minColumn,
      maxColumn,
      minRow,
      maxRow,
    });
  }

  return islands;
}

function compareIslands(
  left: ColonyMassAccentIsland,
  right: ColonyMassAccentIsland,
): number {
  return (
    right.integratedAlpha - left.integratedAlpha ||
    right.peakAlpha - left.peakAlpha ||
    right.cellCount - left.cellCount ||
    left.firstCellIndex - right.firstCellIndex
  );
}

function validateField(field: ColonyMassAlphaField): void {
  if (field.version !== COLONY_MASS_PRESENTATION_VERSION) {
    throw new RangeError("unsupported colony mass alpha field version");
  }
  if (field.meaning !== "presentation-only-density-mass") {
    throw new RangeError("unsupported colony mass alpha field meaning");
  }
  assertPositiveSafeInteger("colony mass island width", field.width);
  assertPositiveSafeInteger("colony mass island height", field.height);

  const cells = field.width * field.height;
  if (!Number.isSafeInteger(cells) || field.alpha.length !== cells) {
    throw new RangeError(
      "colony mass alpha field must match its declared grid dimensions",
    );
  }

  for (let index = 0; index < field.alpha.length; index += 1) {
    const alpha = field.alpha[index]!;
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
      throw new RangeError(
        `colony mass alpha must be finite and in [0, 1] at cell ${index}`,
      );
    }
  }
}

function validatePolicy(policy: ColonyMassIslandPolicy): ColonyMassIslandPolicy {
  if (policy.version !== COLONY_MASS_ISLAND_POLICY_VERSION) {
    throw new RangeError("unsupported colony mass island policy version");
  }
  if (
    !Number.isFinite(policy.minimumAlpha) ||
    policy.minimumAlpha <= 0 ||
    policy.minimumAlpha > 1
  ) {
    throw new RangeError(
      "colony mass island minimumAlpha must be finite and in (0, 1]",
    );
  }
  assertPositiveSafeInteger("colony mass island minimumCells", policy.minimumCells);
  assertPositiveSafeInteger(
    "colony mass island maximumIslands",
    policy.maximumIslands,
  );
  if (policy.connectivity !== "eight-neighbour") {
    throw new RangeError("unsupported colony mass island connectivity");
  }
  return policy;
}

function assertPositiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}
