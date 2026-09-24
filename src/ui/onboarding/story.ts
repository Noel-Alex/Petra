import {
  resolveMotion,
  type MotionPreference,
  type ResolvedMotion,
} from "../motion/policy";
import { MOTION } from "../motion/tokens";

export type OnboardingStageId =
  | "ecosystem"
  | "inoculation"
  | "growth"
  | "pressure"
  | "selection"
  | "handoff";

export type ScientificGate =
  | "inoculation-recorded"
  | "population-growth-observed"
  | "antibiotic-command-recorded"
  | "resistant-lineage-frequency-increased";

export interface OnboardingStage {
  readonly id: OnboardingStageId;
  readonly eyebrow: string;
  readonly title: string;
  readonly explanation: string;
  readonly focus: "dish" | "population" | "pressure" | "lineage" | "controls";
  readonly gate?: ScientificGate;
  readonly causal: boolean;
}

export const ONBOARDING_STAGES: readonly OnboardingStage[] = [
  {
    id: "ecosystem",
    eyebrow: "1 · Observe",
    title: "A dish is an ecosystem.",
    explanation:
      "Resources, cells and spatial conditions interact. The animation explains state; it does not create the biology.",
    focus: "dish",
    causal: false,
  },
  {
    id: "inoculation",
    eyebrow: "2 · Seed",
    title: "Start with a population.",
    explanation:
      "Place the inoculum. Petra advances only after the simulator records that intervention.",
    focus: "population",
    gate: "inoculation-recorded",
    causal: true,
  },
  {
    id: "growth",
    eyebrow: "3 · Grow",
    title: "Watch resources become biomass.",
    explanation:
      "Growth must be observed in authoritative simulation state before the story continues.",
    focus: "population",
    gate: "population-growth-observed",
    causal: true,
  },
  {
    id: "pressure",
    eyebrow: "4 · Apply pressure",
    title: "Add antibiotic as an intervention.",
    explanation:
      "The visual wave marks where the command acts. Its wall-clock animation is not the biological drug timescale.",
    focus: "pressure",
    gate: "antibiotic-command-recorded",
    causal: true,
  },
  {
    id: "selection",
    eyebrow: "5 · Explain selection",
    title: "Resistance was not summoned by the drug.",
    explanation:
      "Continue only when authoritative lineage frequencies show a resistant lineage increasing under selection.",
    focus: "lineage",
    gate: "resistant-lineage-frequency-increased",
    causal: true,
  },
  {
    id: "handoff",
    eyebrow: "6 · Experiment",
    title: "Now you control the ecosystem.",
    explanation:
      "The guided layer gets out of the way; the same simulator, controls and provenance remain available.",
    focus: "controls",
    causal: false,
  },
] as const;

export interface OnboardingState {
  readonly index: number;
  readonly completed: boolean;
  readonly skipped: boolean;
  readonly satisfiedGates: ReadonlySet<ScientificGate>;
}

export type OnboardingEvent =
  | { readonly type: "continue" }
  | { readonly type: "back" }
  | { readonly type: "scientific-gate"; readonly gate: ScientificGate }
  | { readonly type: "skip" }
  | { readonly type: "reset" };

export function initialOnboardingState(): OnboardingState {
  return {
    index: 0,
    completed: false,
    skipped: false,
    satisfiedGates: new Set<ScientificGate>(),
  };
}

export function currentStage(state: OnboardingState): OnboardingStage {
  return ONBOARDING_STAGES[Math.min(state.index, ONBOARDING_STAGES.length - 1)]!;
}

export function canContinue(state: OnboardingState): boolean {
  if (state.completed) return false;
  const gate = currentStage(state).gate;
  return gate === undefined || state.satisfiedGates.has(gate);
}

export function reduceOnboarding(
  state: OnboardingState,
  event: OnboardingEvent,
): OnboardingState {
  if (event.type === "reset") return initialOnboardingState();

  if (event.type === "skip") {
    return {
      ...state,
      completed: true,
      skipped: true,
      index: ONBOARDING_STAGES.length - 1,
    };
  }

  if (event.type === "scientific-gate") {
    const satisfiedGates = new Set(state.satisfiedGates);
    satisfiedGates.add(event.gate);
    return { ...state, satisfiedGates };
  }

  if (event.type === "back") {
    if (state.completed || state.index === 0) return state;
    return { ...state, index: state.index - 1 };
  }

  if (!canContinue(state)) return state;

  if (state.index >= ONBOARDING_STAGES.length - 1) {
    return { ...state, completed: true };
  }

  return { ...state, index: state.index + 1 };
}

export interface OnboardingPresentation {
  readonly stage: OnboardingStage;
  readonly motion: ResolvedMotion;
  readonly announceText: string;
}

/**
 * Maps story state to presentation only. Rendering adapters may animate this
 * output, but may not infer or mutate simulator state from it.
 */
export function resolveOnboardingPresentation(
  state: OnboardingState,
  preference: MotionPreference,
): OnboardingPresentation {
  const stage = currentStage(state);
  const token = stage.causal ? MOTION.selectionEmphasis : MOTION.panel;
  const motion = resolveMotion(preference, {
    kind: stage.causal ? "causal" : "navigational",
    durationMs: token.durationMs,
  });

  return {
    stage,
    motion,
    announceText: `${stage.eyebrow}. ${stage.title} ${stage.explanation}`,
  };
}
