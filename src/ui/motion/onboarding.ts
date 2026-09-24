import {
  resolveMotion,
  type MotionKind,
  type MotionPreference,
  type ResolvedMotion,
} from "./policy";
import { MOTION, type MotionTokenName } from "./tokens";

export type OnboardingStageId =
  | "dish"
  | "growth"
  | "pressure"
  | "selection"
  | "handoff";

export interface OnboardingStage {
  readonly id: OnboardingStageId;
  readonly eyebrow: string;
  readonly title: string;
  readonly explanation: string;
  readonly focus: "dish" | "population" | "intervention" | "lineage" | "controls";
  readonly motionKind: MotionKind;
  readonly motionToken: MotionTokenName;
}

export interface OnboardingState {
  readonly index: number;
  readonly complete: boolean;
}

export interface OnboardingTransition {
  readonly from: OnboardingStageId;
  readonly to: OnboardingStageId;
  readonly motion: ResolvedMotion;
  readonly easing: readonly [number, number, number, number];
}

export const ONBOARDING_STAGES: readonly OnboardingStage[] = [
  {
    id: "dish",
    eyebrow: "Start with the world",
    title: "A dish is an ecosystem.",
    explanation:
      "Space, resources, lineages, and interventions all meet inside one shared environment.",
    focus: "dish",
    motionKind: "navigational",
    motionToken: "cameraFocus",
  },
  {
    id: "growth",
    eyebrow: "Watch before acting",
    title: "Growth changes the landscape.",
    explanation:
      "Cells consume local resources and expand. The animation explains state; it does not create growth.",
    focus: "population",
    motionKind: "causal",
    motionToken: "selectionEmphasis",
  },
  {
    id: "pressure",
    eyebrow: "Apply a pressure",
    title: "Antibiotic changes survival, not history.",
    explanation:
      "A dose becomes a recorded intervention with numeric meaning and a visible spatial effect.",
    focus: "intervention",
    motionKind: "causal",
    motionToken: "interventionPulse",
  },
  {
    id: "selection",
    eyebrow: "Read the consequence",
    title: "Selection reveals differences that already matter.",
    explanation:
      "Lineage frequencies change because variants respond differently; the drug does not choose a useful mutation.",
    focus: "lineage",
    motionKind: "causal",
    motionToken: "selectionEmphasis",
  },
  {
    id: "handoff",
    eyebrow: "Your experiment",
    title: "Now change one thing and compare what follows.",
    explanation:
      "The controls hand scientific agency to you while the timeline preserves exactly what you changed.",
    focus: "controls",
    motionKind: "navigational",
    motionToken: "panel",
  },
] as const;

export function createOnboardingState(): OnboardingState {
  return { index: 0, complete: false };
}

export function getOnboardingStage(state: OnboardingState): OnboardingStage {
  assertIndex(state.index);
  return ONBOARDING_STAGES[state.index]!;
}

export function advanceOnboarding(state: OnboardingState): OnboardingState {
  assertIndex(state.index);

  if (state.complete) {
    return state;
  }

  const lastIndex = ONBOARDING_STAGES.length - 1;
  if (state.index >= lastIndex) {
    return { index: lastIndex, complete: true };
  }

  return { index: state.index + 1, complete: false };
}

export function retreatOnboarding(state: OnboardingState): OnboardingState {
  assertIndex(state.index);

  if (state.index === 0) {
    return { index: 0, complete: false };
  }

  return { index: state.index - 1, complete: false };
}

export function skipOnboarding(): OnboardingState {
  return { index: ONBOARDING_STAGES.length - 1, complete: true };
}

export function resolveOnboardingTransition(
  from: OnboardingState,
  to: OnboardingState,
  preference: MotionPreference,
): OnboardingTransition {
  const fromStage = getOnboardingStage(from);
  const toStage = getOnboardingStage(to);
  const token = MOTION[toStage.motionToken];

  return {
    from: fromStage.id,
    to: toStage.id,
    motion: resolveMotion(preference, {
      kind: toStage.motionKind,
      durationMs: token.durationMs,
    }),
    easing: token.easing,
  };
}

function assertIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= ONBOARDING_STAGES.length) {
    throw new RangeError("onboarding index is outside the stage sequence");
  }
}
