import {
  isRenderFieldRangeMode,
  resolveRenderFieldRangeMode,
  validateRenderSnapshot,
  type DishRenderSnapshot,
  type RenderField,
  type RenderLineage,
} from "./model";
import {
  cubicBezierProgress,
  type MotionEasing,
} from "./motionMath";

export interface DishVisualState {
  readonly samplingIdentity: string;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly dishMask: Uint8Array;
  readonly biomass: Float32Array;
  readonly fields: readonly RenderField[];
  readonly lineages: readonly RenderLineage[];
}

export interface DishPresentationFrame extends DishVisualState {
  readonly frameKind: "interpolated-presentation";
  readonly targetSnapshotId: string;
  /**
   * Normalized presentation progress in [0, 1].
   * Live continuity derives it from wall time; replay/scrub presentation may
   * evaluate it directly from an authoritative timeline position. It is never
   * itself biological authority.
   */
  readonly progress: number;
  /** Eased presentation progress in [0, 1]. */
  readonly easedProgress: number;
}

export type DishDrawableState =
  | DishRenderSnapshot
  | DishPresentationFrame;

export interface DishVisualMotionSpec {
  readonly durationMs: number;
  readonly easing: MotionEasing;
}

export type DishVisualTransitionRefusalReason =
  | "sampling-identity-mismatch"
  | "grid-mismatch"
  | "dish-mask-mismatch"
  | "field-set-mismatch"
  | "field-metadata-mismatch"
  | "lineage-metadata-mismatch";

interface MutableRenderField extends Omit<
  RenderField,
  "values" | "minimum" | "maximum"
> {
  values: Float32Array;
  minimum: number;
  maximum: number;
}

interface FieldTransitionChannel {
  readonly from: RenderField;
  readonly to: RenderField;
  readonly output: MutableRenderField;
}

interface LineageTransitionChannel {
  readonly from: RenderLineage | null;
  readonly to: RenderLineage | null;
  readonly output: RenderLineage;
}

interface MutableDishPresentationFrame extends DishVisualState {
  readonly frameKind: "interpolated-presentation";
  readonly targetSnapshotId: string;
  progress: number;
  easedProgress: number;
}

export interface DishVisualTransition {
  readonly from: DishVisualState;
  readonly to: DishRenderSnapshot;
  readonly motion: DishVisualMotionSpec;
  readonly frame: DishPresentationFrame;
  readonly fieldChannels: readonly FieldTransitionChannel[];
  readonly lineageChannels: readonly LineageTransitionChannel[];
}

export type DishVisualTransitionPlan =
  | {
      readonly kind: "interpolate";
      readonly transition: DishVisualTransition;
    }
  | {
      readonly kind: "snap";
      readonly reason: DishVisualTransitionRefusalReason;
    };

export interface DishVisualTransitionStep {
  readonly complete: boolean;
  readonly state: DishDrawableState;
}

/**
 * Prepare a presentation-only transition from the currently rendered visual
 * state to the next authoritative snapshot.
 *
 * The plan refuses semantic incompatibilities rather than interpolating unlike
 * scientific channels. Lineage enter/exit is safe because identity metadata is
 * preserved and only the visual density channel fades to/from zero.
 */
export function planDishVisualTransition(
  from: DishVisualState,
  to: DishRenderSnapshot,
  motion: DishVisualMotionSpec,
): DishVisualTransitionPlan {
  assertVisualState(from);
  validateRenderSnapshot(to);
  const safeMotion = copyDishVisualMotionSpec(motion);

  if (from.samplingIdentity !== to.samplingIdentity) {
    return { kind: "snap", reason: "sampling-identity-mismatch" };
  }
  if (
    from.gridWidth !== to.gridWidth ||
    from.gridHeight !== to.gridHeight
  ) {
    return { kind: "snap", reason: "grid-mismatch" };
  }
  if (!arraysEqual(from.dishMask, to.dishMask)) {
    return { kind: "snap", reason: "dish-mask-mismatch" };
  }

  const fromFields = new Map(from.fields.map((field) => [field.id, field]));
  if (
    fromFields.size !== to.fields.length ||
    to.fields.some((field) => !fromFields.has(field.id))
  ) {
    return { kind: "snap", reason: "field-set-mismatch" };
  }

  const fieldChannels: FieldTransitionChannel[] = [];
  for (const targetField of to.fields) {
    const sourceField = fromFields.get(targetField.id);
    if (sourceField === undefined) {
      return { kind: "snap", reason: "field-set-mismatch" };
    }
    if (!fieldIdentityMetadataEqual(sourceField, targetField)) {
      return { kind: "snap", reason: "field-metadata-mismatch" };
    }
    fieldChannels.push({
      from: sourceField,
      to: targetField,
      output: {
        ...targetField,
        values: new Float32Array(targetField.values.length),
      },
    });
  }

  const fromLineages = new Map(
    from.lineages.map((lineage) => [lineage.id, lineage]),
  );
  const toLineages = new Map(
    to.lineages.map((lineage) => [lineage.id, lineage]),
  );

  for (const targetLineage of to.lineages) {
    const sourceLineage = fromLineages.get(targetLineage.id);
    if (
      sourceLineage !== undefined &&
      !lineageMetadataEqual(sourceLineage, targetLineage)
    ) {
      return { kind: "snap", reason: "lineage-metadata-mismatch" };
    }
  }

  const orderedLineageIds = [
    ...to.lineages.map((lineage) => lineage.id),
    ...from.lineages
      .map((lineage) => lineage.id)
      .filter((id) => !toLineages.has(id)),
  ];

  const lineageChannels: LineageTransitionChannel[] =
    orderedLineageIds.map((id) => {
      const source = fromLineages.get(id) ?? null;
      const target = toLineages.get(id) ?? null;
      const metadata = target ?? source;
      if (metadata === null) {
        throw new Error("lineage transition identity vanished unexpectedly");
      }
      return {
        from: source,
        to: target,
        output: {
          id: metadata.id,
          label: metadata.label,
          appearanceToken: metadata.appearanceToken,
          patternToken: metadata.patternToken,
          density: new Float32Array(to.gridWidth * to.gridHeight),
        },
      };
    });

  const frame: MutableDishPresentationFrame = {
    frameKind: "interpolated-presentation",
    targetSnapshotId: to.snapshotId,
    progress: 0,
    easedProgress: 0,
    samplingIdentity: to.samplingIdentity,
    gridWidth: to.gridWidth,
    gridHeight: to.gridHeight,
    dishMask: to.dishMask.slice(),
    biomass: new Float32Array(to.biomass.length),
    fields: fieldChannels.map((channel) => channel.output),
    lineages: lineageChannels.map((channel) => channel.output),
  };

  const transition: DishVisualTransition = {
    from,
    to,
    motion: safeMotion,
    frame,
    fieldChannels,
    lineageChannels,
  };
  writeFrame(transition, 0, 0);

  return { kind: "interpolate", transition };
}

/**
 * Advance a prepared transition to an absolute presentation elapsed time.
 *
 * Intermediate frames reuse preallocated buffers. Completion returns the exact
 * authoritative target snapshot so presentation state never replaces authority.
 */
export function advanceDishVisualTransition(
  transition: DishVisualTransition,
  elapsedMs: number,
): DishVisualTransitionStep {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError(
      "dish visual transition elapsed time must be finite and non-negative",
    );
  }

  const durationMs = transition.motion.durationMs;
  if (durationMs === 0) {
    return { complete: true, state: transition.to };
  }

  return evaluateDishVisualTransitionAtProgress(
    transition,
    Math.min(1, elapsedMs / durationMs),
  );
}

/**
 * Evaluate a prepared visual transition at explicit normalized presentation
 * progress. This is the replay/scrub seam: callers can deterministically
 * revisit the same visual position without depending on frame cadence or wall
 * time. Intermediate values remain presentation-only.
 */
export function evaluateDishVisualTransitionAtProgress(
  transition: DishVisualTransition,
  progress: number,
): DishVisualTransitionStep {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new RangeError(
      "dish visual transition progress must be finite and within [0, 1]",
    );
  }

  if (progress === 1) {
    return { complete: true, state: transition.to };
  }

  const easedProgress = cubicBezierProgress(
    progress,
    transition.motion.easing,
  );
  writeFrame(transition, progress, easedProgress);
  return { complete: false, state: transition.frame };
}

function writeFrame(
  transition: DishVisualTransition,
  progress: number,
  easedProgress: number,
): void {
  const frame = transition.frame as MutableDishPresentationFrame;
  frame.progress = progress;
  frame.easedProgress = easedProgress;

  mixArray(
    frame.biomass,
    transition.from.biomass,
    transition.to.biomass,
    easedProgress,
  );

  for (const channel of transition.fieldChannels) {
    mixArray(
      channel.output.values,
      channel.from.values,
      channel.to.values,
      easedProgress,
    );
    if (resolveRenderFieldRangeMode(channel.output) === "snapshot-extrema") {
      // Observed extrema are explicitly per-snapshot presentation metadata.
      // Interpolate only the transient frame; exact keyframes remain untouched.
      channel.output.minimum = mixNumber(
        channel.from.minimum,
        channel.to.minimum,
        easedProgress,
      );
      channel.output.maximum = mixNumber(
        channel.from.maximum,
        channel.to.maximum,
        easedProgress,
      );
    }
  }

  for (const channel of transition.lineageChannels) {
    mixOptionalArray(
      channel.output.density,
      channel.from?.density ?? null,
      channel.to?.density ?? null,
      easedProgress,
    );
  }
}

function mixArray(
  output: Float32Array,
  from: Float32Array,
  to: Float32Array,
  amount: number,
): void {
  for (let index = 0; index < output.length; index += 1) {
    const left = from[index] ?? 0;
    const right = to[index] ?? 0;
    output[index] = left + (right - left) * amount;
  }
}

function mixNumber(
  from: number,
  to: number,
  amount: number,
): number {
  return from + (to - from) * amount;
}

function mixOptionalArray(
  output: Float32Array,
  from: Float32Array | null,
  to: Float32Array | null,
  amount: number,
): void {
  for (let index = 0; index < output.length; index += 1) {
    const left = from?.[index] ?? 0;
    const right = to?.[index] ?? 0;
    output[index] = left + (right - left) * amount;
  }
}

function fieldIdentityMetadataEqual(
  left: RenderField,
  right: RenderField,
): boolean {
  const leftRangeMode = resolveRenderFieldRangeMode(left);
  const rightRangeMode = resolveRenderFieldRangeMode(right);
  if (
    left.id !== right.id ||
    left.kind !== right.kind ||
    left.label !== right.label ||
    left.unit !== right.unit ||
    left.width !== right.width ||
    left.height !== right.height ||
    leftRangeMode !== rightRangeMode
  ) {
    return false;
  }

  if (leftRangeMode === "snapshot-extrema") return true;

  return (
    left.minimum === right.minimum &&
    left.maximum === right.maximum
  );
}

function lineageMetadataEqual(
  left: RenderLineage,
  right: RenderLineage,
): boolean {
  return (
    left.id === right.id &&
    left.label === right.label &&
    left.appearanceToken === right.appearanceToken &&
    left.patternToken === right.patternToken
  );
}

function arraysEqual(
  left: Uint8Array,
  right: Uint8Array,
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function assertVisualState(state: DishVisualState): void {
  if (!state.samplingIdentity) {
    throw new TypeError("visual state samplingIdentity must be non-empty");
  }
  if (
    !Number.isInteger(state.gridWidth) ||
    state.gridWidth <= 0 ||
    !Number.isInteger(state.gridHeight) ||
    state.gridHeight <= 0
  ) {
    throw new RangeError("visual state grid dimensions must be positive integers");
  }

  const cells = state.gridWidth * state.gridHeight;
  if (
    state.dishMask.length !== cells ||
    state.biomass.length !== cells
  ) {
    throw new RangeError("visual state arrays must match grid cell count");
  }
  for (const value of state.dishMask) {
    if (value !== 0 && value !== 1) {
      throw new RangeError("visual state dishMask values must be 0 or 1");
    }
  }
  assertFiniteArray(state.biomass, true, "visual state biomass");

  const fieldIds = new Set<string>();
  for (const field of state.fields) {
    if (fieldIds.has(field.id)) {
      throw new RangeError("visual state field IDs must be unique");
    }
    fieldIds.add(field.id);
    if (
      field.width !== state.gridWidth ||
      field.height !== state.gridHeight ||
      field.values.length !== cells
    ) {
      throw new RangeError("visual state field geometry must match grid");
    }
    assertFiniteArray(field.values, false, "visual state field");
    if (
      field.rangeMode !== undefined &&
      !isRenderFieldRangeMode(field.rangeMode)
    ) {
      throw new RangeError("visual state field range mode is unsupported");
    }
    if (
      !Number.isFinite(field.minimum) ||
      !Number.isFinite(field.maximum)
    ) {
      throw new TypeError("visual state field bounds must be finite");
    }
    if (field.maximum < field.minimum) {
      throw new RangeError(
        "visual state field maximum must be >= minimum",
      );
    }
  }

  const lineageIds = new Set<string>();
  for (const lineage of state.lineages) {
    if (lineageIds.has(lineage.id)) {
      throw new RangeError("visual state lineage IDs must be unique");
    }
    lineageIds.add(lineage.id);
    if (lineage.density.length !== cells) {
      throw new RangeError("visual state lineage density must match grid");
    }
    assertFiniteArray(
      lineage.density,
      true,
      "visual state lineage density",
    );
  }
}

function assertFiniteArray(
  values: Float32Array,
  nonNegative: boolean,
  label: string,
): void {
  for (const value of values) {
    if (
      !Number.isFinite(value) ||
      (nonNegative && value < 0)
    ) {
      throw new RangeError(
        label +
          (nonNegative
            ? " must contain finite non-negative values"
            : " must contain finite values"),
      );
    }
  }
}

/**
 * Validate and isolate a renderer-facing motion spec at the presentation
 * boundary. Timing is supplied by the caller; this module owns no product
 * motion constant.
 */
export function copyDishVisualMotionSpec(
  spec: DishVisualMotionSpec,
): DishVisualMotionSpec {
  if (!Number.isFinite(spec.durationMs) || spec.durationMs < 0) {
    throw new RangeError(
      "dish visual motion duration must be finite and non-negative",
    );
  }
  const [x1, y1, x2, y2] = spec.easing;
  if (
    !Number.isFinite(x1) ||
    x1 < 0 ||
    x1 > 1 ||
    !Number.isFinite(x2) ||
    x2 < 0 ||
    x2 > 1 ||
    !Number.isFinite(y1) ||
    !Number.isFinite(y2)
  ) {
    throw new RangeError("dish visual motion easing is invalid");
  }
  return Object.freeze({
    durationMs: spec.durationMs,
    easing: Object.freeze([x1, y1, x2, y2]) as MotionEasing,
  });
}
