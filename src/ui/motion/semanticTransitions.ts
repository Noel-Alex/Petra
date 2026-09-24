import { resolveMotion, type MotionPreference, type MotionTreatment } from "./policy";
import { MOTION } from "./tokens";

export type SemanticView = "dish" | "colony" | "representative-cell";

export interface SemanticTransitionRequest {
  readonly from: SemanticView;
  readonly to: SemanticView;
  readonly preference: MotionPreference;
  /**
   * Stable presentation-space identifier supplied by the caller.
   * It can point at a colony/region/cell-story anchor, but it is never a
   * simulator entity mutation handle.
   */
  readonly focusTargetId?: string;
}

export interface SemanticTransitionPlan {
  readonly from: SemanticView;
  readonly to: SemanticView;
  readonly treatment: MotionTreatment;
  readonly durationMs: number;
  readonly easing: readonly [number, number, number, number];
  readonly preserveFocusTarget: boolean;
  readonly focusTargetId?: string;
  readonly hide: readonly SemanticView[];
  readonly reveal: readonly SemanticView[];
  readonly representativeViewIsIllustrative: boolean;
  readonly ariaLabel: string;
}

/**
 * Plans semantic zoom as presentation only.
 *
 * The plan deliberately contains no simulation clock, population value,
 * concentration, lineage mutation, or other biological authority. Adapters
 * may interpolate camera/render state while authoritative simulation state
 * continues independently.
 */
export function planSemanticTransition(
  request: SemanticTransitionRequest,
): SemanticTransitionPlan {
  assertView(request.from);
  assertView(request.to);

  if (request.from === request.to) {
    return {
      from: request.from,
      to: request.to,
      treatment: "instant",
      durationMs: 0,
      easing: MOTION.cameraFocus.easing,
      preserveFocusTarget: Boolean(request.focusTargetId),
      ...(request.focusTargetId === undefined
        ? {}
        : { focusTargetId: request.focusTargetId }),
      hide: [],
      reveal: [],
      representativeViewIsIllustrative: request.to === "representative-cell",
      ariaLabel: labelForView(request.to),
    };
  }

  const motion = resolveMotion(request.preference, {
    kind: "navigational",
    durationMs: MOTION.cameraFocus.durationMs,
    distancePx: semanticDistance(request.from, request.to) * 360,
  });

  return {
    from: request.from,
    to: request.to,
    treatment: motion.treatment,
    durationMs: motion.durationMs,
    easing: MOTION.cameraFocus.easing,
    preserveFocusTarget: Boolean(request.focusTargetId),
    ...(request.focusTargetId === undefined
      ? {}
      : { focusTargetId: request.focusTargetId }),
    hide: [request.from],
    reveal: [request.to],
    representativeViewIsIllustrative: request.to === "representative-cell",
    ariaLabel: labelForView(request.to),
  };
}

export interface SurfaceTransitionRequest {
  readonly surface: "panel" | "overlay";
  readonly action: "show" | "hide";
  readonly preference: MotionPreference;
}

export interface SurfaceTransitionPlan {
  readonly treatment: MotionTreatment;
  readonly durationMs: number;
  readonly easing: readonly [number, number, number, number];
  readonly keepMountedDuringExit: boolean;
}

/**
 * Panels/overlays use spatial motion only when full motion is enabled.
 * Reduced/off modes settle immediately so UI chrome cannot compete with the
 * dish or create unnecessary movement.
 */
export function planSurfaceTransition(
  request: SurfaceTransitionRequest,
): SurfaceTransitionPlan {
  const motion = resolveMotion(request.preference, {
    kind: "spatial",
    durationMs: MOTION.panel.durationMs,
  });

  return {
    treatment: motion.treatment,
    durationMs: motion.durationMs,
    easing: MOTION.panel.easing,
    keepMountedDuringExit:
      request.action === "hide" && motion.treatment === "animate",
  };
}

function semanticDistance(from: SemanticView, to: SemanticView): number {
  const order: Record<SemanticView, number> = {
    dish: 0,
    colony: 1,
    "representative-cell": 2,
  };

  return Math.abs(order[to] - order[from]);
}

function labelForView(view: SemanticView): string {
  switch (view) {
    case "dish":
      return "Whole dish view";
    case "colony":
      return "Colony view";
    case "representative-cell":
      return "Representative cell explanatory view";
  }
}

function assertView(view: SemanticView): void {
  if (
    view !== "dish" &&
    view !== "colony" &&
    view !== "representative-cell"
  ) {
    throw new RangeError(`unknown semantic view: ${String(view)}`);
  }
}
