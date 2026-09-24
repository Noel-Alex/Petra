import {
  validateRenderHyphalPaths,
  type RenderHyphalPath,
  type RenderPoint,
} from "./model";

export interface HyphalPathDrawable {
  readonly path: RenderHyphalPath;
  readonly visibleLength: number;
}

interface MutableHyphalPathDrawable {
  readonly path: RenderHyphalPath;
  visibleLength: number;
}

interface HyphalPathTransitionChannel {
  readonly target: RenderHyphalPath;
  readonly fromVisibleLength: number;
  readonly targetLength: number;
  readonly output: MutableHyphalPathDrawable;
}

export interface HyphalPathTransition {
  readonly channels: readonly HyphalPathTransitionChannel[];
  readonly frame: readonly HyphalPathDrawable[];
  readonly targetState: readonly HyphalPathDrawable[];
}

export type HyphalPathTransitionRefusalReason =
  | "path-removal"
  | "path-metadata-mismatch"
  | "path-topology-mismatch";

export type HyphalPathTransitionPlan =
  | {
      readonly kind: "interpolate";
      readonly transition: HyphalPathTransition;
    }
  | {
      readonly kind: "snap";
      readonly reason: HyphalPathTransitionRefusalReason;
    };

export interface HyphalPathTransitionStep {
  readonly complete: boolean;
  readonly state: readonly HyphalPathDrawable[];
}

/**
 * Convert authoritative path geometry into a fully visible presentation state.
 *
 * This helper does not infer fungal identity. It only accepts the explicit
 * render channel already validated by the snapshot boundary.
 */
export function fullyRevealHyphalPaths(
  paths: readonly RenderHyphalPath[],
): readonly HyphalPathDrawable[] {
  validateRenderHyphalPaths(paths);
  return paths.map((path) => ({
    path,
    visibleLength: hyphalPathLength(path.points),
  }));
}

/**
 * Plan path-length-only growth. Existing source geometry must remain an exact
 * prefix of the next authoritative path; new branches may grow from zero.
 *
 * Shortening/removal and non-prefix topology changes snap instead of morphing,
 * because a renderer cannot invent biological retraction or branch movement.
 */
export function planHyphalPathTransition(
  from: readonly HyphalPathDrawable[],
  to: readonly RenderHyphalPath[],
): HyphalPathTransitionPlan {
  validateRenderHyphalPaths(from.map((entry) => entry.path));
  validateRenderHyphalPaths(to);

  const fromById = new Map(from.map((entry) => [entry.path.id, entry]));
  const toIds = new Set(to.map((path) => path.id));

  if (from.some((entry) => !toIds.has(entry.path.id))) {
    return { kind: "snap", reason: "path-removal" };
  }

  const channels: HyphalPathTransitionChannel[] = [];
  for (const target of to) {
    const source = fromById.get(target.id);
    const targetLength = hyphalPathLength(target.points);
    let fromVisibleLength = 0;

    if (source !== undefined) {
      if (source.path.organismKind !== target.organismKind) {
        return { kind: "snap", reason: "path-metadata-mismatch" };
      }
      if (!pointSequenceIsPrefix(source.path.points, target.points)) {
        return { kind: "snap", reason: "path-topology-mismatch" };
      }

      const sourceLength = hyphalPathLength(source.path.points);
      assertVisibleLength(source.visibleLength, sourceLength, source.path.id);
      fromVisibleLength = source.visibleLength;
    }

    const output: MutableHyphalPathDrawable = {
      path: target,
      visibleLength: fromVisibleLength,
    };
    channels.push({
      target,
      fromVisibleLength,
      targetLength,
      output,
    });
  }

  const targetState = to.map((path) => ({
    path,
    visibleLength: hyphalPathLength(path.points),
  }));
  const transition: HyphalPathTransition = {
    channels,
    frame: channels.map((channel) => channel.output),
    targetState,
  };
  writeHyphalFrame(transition, 0);
  return { kind: "interpolate", transition };
}

/**
 * Evaluate a prepared hyphal growth transition at normalized presentation
 * progress. Intermediate lengths are visual-only; exact completion returns the
 * fully revealed target geometry.
 */
export function evaluateHyphalPathTransitionAtProgress(
  transition: HyphalPathTransition,
  progress: number,
): HyphalPathTransitionStep {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new RangeError(
      "hyphal path transition progress must be finite and within [0, 1]",
    );
  }
  if (progress === 1) {
    return { complete: true, state: transition.targetState };
  }

  writeHyphalFrame(transition, progress);
  return { complete: false, state: transition.frame };
}

export function hyphalPathLength(points: readonly RenderPoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    length += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return length;
}

function writeHyphalFrame(
  transition: HyphalPathTransition,
  progress: number,
): void {
  for (const channel of transition.channels) {
    channel.output.visibleLength =
      channel.fromVisibleLength +
      (channel.targetLength - channel.fromVisibleLength) * progress;
  }
}

function pointSequenceIsPrefix(
  prefix: readonly RenderPoint[],
  candidate: readonly RenderPoint[],
): boolean {
  if (prefix.length > candidate.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    const left = prefix[index]!;
    const right = candidate[index]!;
    if (left.x !== right.x || left.y !== right.y) return false;
  }
  return true;
}

function assertVisibleLength(
  visibleLength: number,
  totalLength: number,
  pathId: string,
): void {
  if (
    !Number.isFinite(visibleLength) ||
    visibleLength < 0 ||
    visibleLength > totalLength + Number.EPSILON * 16
  ) {
    throw new RangeError(
      `hyphal path ${pathId} visible length must be finite and within its geometry length`,
    );
  }
}
