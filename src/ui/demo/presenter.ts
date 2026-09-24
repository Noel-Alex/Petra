import {
  resolveMotion,
  type MotionPreference,
  type ResolvedMotion,
} from "../motion/policy";
import { MOTION } from "../motion/tokens";

export type DemoProfile = "90-second" | "3-minute";

export type DemoSurface =
  | "dish"
  | "controls"
  | "timeline"
  | "analysis"
  | "sources"
  | "compare";

export type DemoEvidenceGate =
  | "flagship-runtime-ready"
  | "growth-observed"
  | "intervention-recorded"
  | "selection-evidence-ready"
  | "fitness-tradeoff-ready"
  | "spatial-evidence-ready"
  | "replay-evidence-ready"
  | "provenance-ready"
  | "compare-ready";

export interface DemoCue {
  readonly id: string;
  readonly profiles: readonly DemoProfile[];
  readonly targetSeconds: number;
  readonly surface: DemoSurface;
  readonly eyebrow: string;
  readonly title: string;
  readonly presenterNote: string;
  readonly audienceTakeaway: string;
  readonly scientificBoundary: string;
  readonly gate?: DemoEvidenceGate;
  readonly causal: boolean;
}

export const DEMO_CUES: readonly DemoCue[] = [
  {
    id: "world",
    profiles: ["90-second", "3-minute"],
    targetSeconds: 12,
    surface: "dish",
    eyebrow: "0–12 s · Establish the world",
    title: "One reproducible state drives the scene.",
    presenterNote:
      "Open the flagship scenario and establish that the animation explains authoritative state rather than choosing biology.",
    audienceTakeaway:
      "The simulator owns biology; the renderer is presentation.",
    scientificBoundary:
      "Do not show placeholder scientific values as if they came from the simulator.",
    gate: "flagship-runtime-ready",
    causal: false,
  },
  {
    id: "growth",
    profiles: ["90-second", "3-minute"],
    targetSeconds: 28,
    surface: "analysis",
    eyebrow: "12–28 s · Growth",
    title: "Resources shape growth.",
    presenterNote:
      "Advance real simulation time and point to authoritative population/resource evidence.",
    audienceTakeaway:
      "Growth responds to local modeled conditions rather than a scripted animation.",
    scientificBoundary:
      "Animation wall time is not biological time and may not satisfy this cue.",
    gate: "growth-observed",
    causal: true,
  },
  {
    id: "pressure",
    profiles: ["90-second", "3-minute"],
    targetSeconds: 50,
    surface: "controls",
    eyebrow: "28–50 s · Apply pressure",
    title: "The intervention is a typed scientific command.",
    presenterNote:
      "Apply ciprofloxacin only through the real intervention path and wait for authoritative confirmation.",
    audienceTakeaway:
      "Drug pressure changes selection; it does not instruct a useful mutation.",
    scientificBoundary:
      "A visual pulse or preview is not proof that the intervention entered simulation state.",
    gate: "intervention-recorded",
    causal: true,
  },
  {
    id: "selection",
    profiles: ["90-second", "3-minute"],
    targetSeconds: 68,
    surface: "analysis",
    eyebrow: "50–68 s · Selection",
    title: "Selection changed frequency.",
    presenterNote:
      "Show lineage/trajectory evidence only if the authoritative run actually contains the relevant resistant-lineage shift.",
    audienceTakeaway:
      "The drug did not summon the useful mutation.",
    scientificBoundary:
      "Never inject a lineage or advance this cue because a presenter timer expired.",
    gate: "selection-evidence-ready",
    causal: true,
  },
  {
    id: "replay",
    profiles: ["90-second", "3-minute"],
    targetSeconds: 82,
    surface: "timeline",
    eyebrow: "68–82 s · Reproducibility",
    title: "Replay the same run identity.",
    presenterNote:
      "Show same engine/scenario/seed/ordered-command replay evidence.",
    audienceTakeaway:
      "A seeded stochastic history is reproducible under the same run identity.",
    scientificBoundary:
      "Do not call unrelated runs a controlled counterfactual.",
    gate: "replay-evidence-ready",
    causal: false,
  },
  {
    id: "honesty",
    profiles: ["90-second", "3-minute"],
    targetSeconds: 90,
    surface: "sources",
    eyebrow: "82–90 s · Scientific honesty",
    title: "Show the evidence seams.",
    presenterNote:
      "Open Sources/Assumptions and disclose measured, transferred, approximated, calibrated, engineering, and visual-only roles.",
    audienceTakeaway:
      "Petra exposes model assumptions instead of hiding them behind one confidence badge.",
    scientificBoundary:
      "Do not call the composed flagship one measured experiment or a clinical digital twin.",
    gate: "provenance-ready",
    causal: false,
  },
  {
    id: "counterfactual",
    profiles: ["3-minute"],
    targetSeconds: 125,
    surface: "compare",
    eyebrow: "90–125 s · Counterfactual",
    title: "Change one intervention from a shared origin.",
    presenterNote:
      "Use a verified fork/compare surface only when both branches share authoritative ancestry and matched biological time.",
    audienceTakeaway:
      "A controlled branch comparison separates intervention differences from seed differences.",
    scientificBoundary:
      "No causal attribution from two unrelated runs.",
    gate: "compare-ready",
    causal: false,
  },
  {
    id: "tradeoff",
    profiles: ["3-minute"],
    targetSeconds: 150,
    surface: "analysis",
    eyebrow: "125–150 s · Fitness trade-off",
    title: "Resistance is not a universal advantage.",
    presenterNote:
      "Use authoritative genotype/fitness evidence to compare performance with and without pressure.",
    audienceTakeaway:
      "Environment, resources, timing, and fitness costs can change which lineage succeeds.",
    scientificBoundary:
      "Do not infer a fitness cost from color, lineage prominence, or renderer density.",
    gate: "fitness-tradeoff-ready",
    causal: true,
  },
  {
    id: "spatial",
    profiles: ["3-minute"],
    targetSeconds: 172,
    surface: "dish",
    eyebrow: "150–172 s · Spatial contingency",
    title: "Access to the front matters.",
    presenterNote:
      "Use the live dish and authoritative state to explain spatial opportunity without treating rendered glyphs as literal cells.",
    audienceTakeaway:
      "Evolutionary outcome depends on spatial opportunity, not only on resistance magnitude.",
    scientificBoundary:
      "Renderer LOD and representative organisms are visual proxies, not population authority.",
    gate: "spatial-evidence-ready",
    causal: true,
  },
  {
    id: "close",
    profiles: ["3-minute"],
    targetSeconds: 180,
    surface: "sources",
    eyebrow: "172–180 s · Close",
    title: "Mechanistic first; acceleration is optional.",
    presenterNote:
      "Close on provenance, reproducibility, and the explicit separation between mechanistic authority and optional future emulation.",
    audienceTakeaway:
      "Petra is an inspectable mechanistic educational simulator, not an AI authority wrapper.",
    scientificBoundary:
      "Do not imply optional ML or future modules are active unless their own validation gates are satisfied.",
    gate: "provenance-ready",
    causal: false,
  },
] as const;

export interface DemoPresenterState {
  readonly profile: DemoProfile;
  readonly runIdentity: string | null;
  readonly cueIndex: number;
  readonly completed: boolean;
  readonly satisfiedGates: ReadonlySet<DemoEvidenceGate>;
}

export type DemoPresenterEvent =
  | { readonly type: "next" }
  | { readonly type: "back" }
  | { readonly type: "reset" }
  | { readonly type: "set-profile"; readonly profile: DemoProfile }
  | { readonly type: "bind-run"; readonly runIdentity: string }
  | {
      readonly type: "evidence";
      readonly gate: DemoEvidenceGate;
      readonly runIdentity: string;
    };

export interface DemoPresenterPresentation {
  readonly cue: DemoCue;
  readonly cueNumber: number;
  readonly cueCount: number;
  readonly canAdvance: boolean;
  readonly waitingFor: DemoEvidenceGate | null;
  readonly elapsedTargetSeconds: number;
  readonly remainingTargetSeconds: number;
  readonly motion: ResolvedMotion;
  readonly easing: readonly [number, number, number, number];
  readonly timingMeaning: "presenter-pacing-only";
}

export function initialDemoPresenterState(
  profile: DemoProfile = "90-second",
  runIdentity: string | null = null,
): DemoPresenterState {
  if (runIdentity !== null && runIdentity.trim().length === 0) {
    throw new TypeError("runIdentity must be null or non-empty");
  }

  return {
    profile,
    runIdentity,
    cueIndex: 0,
    completed: false,
    satisfiedGates: new Set<DemoEvidenceGate>(),
  };
}

export function cuesForProfile(profile: DemoProfile): readonly DemoCue[] {
  return DEMO_CUES.filter((cue) => cue.profiles.includes(profile));
}

export function currentDemoCue(state: DemoPresenterState): DemoCue {
  const cues = cuesForProfile(state.profile);
  return cues[Math.min(state.cueIndex, cues.length - 1)]!;
}

export function canAdvanceDemo(state: DemoPresenterState): boolean {
  if (state.completed) return false;
  const gate = currentDemoCue(state).gate;
  return gate === undefined || state.satisfiedGates.has(gate);
}

export function reduceDemoPresenter(
  state: DemoPresenterState,
  event: DemoPresenterEvent,
): DemoPresenterState {
  if (event.type === "reset") {
    return initialDemoPresenterState(state.profile, state.runIdentity);
  }

  if (event.type === "set-profile") {
    return {
      profile: event.profile,
      runIdentity: state.runIdentity,
      cueIndex: 0,
      completed: false,
      satisfiedGates: state.satisfiedGates,
    };
  }

  if (event.type === "bind-run") {
    if (event.runIdentity.trim().length === 0) {
      throw new TypeError("runIdentity must be non-empty");
    }
    if (event.runIdentity === state.runIdentity) return state;
    return initialDemoPresenterState(state.profile, event.runIdentity);
  }

  if (event.type === "evidence") {
    if (
      state.runIdentity === null ||
      event.runIdentity !== state.runIdentity
    ) {
      return state;
    }
    const satisfiedGates = new Set(state.satisfiedGates);
    satisfiedGates.add(event.gate);
    return { ...state, satisfiedGates };
  }

  if (event.type === "back") {
    if (state.completed) {
      return {
        ...state,
        completed: false,
        cueIndex: Math.max(0, cuesForProfile(state.profile).length - 1),
      };
    }
    if (state.cueIndex === 0) return state;
    return { ...state, cueIndex: state.cueIndex - 1 };
  }

  if (!canAdvanceDemo(state)) return state;

  const cues = cuesForProfile(state.profile);
  if (state.cueIndex >= cues.length - 1) {
    return { ...state, completed: true };
  }
  return { ...state, cueIndex: state.cueIndex + 1 };
}

export function resolveDemoPresenterPresentation(
  state: DemoPresenterState,
  preference: MotionPreference,
): DemoPresenterPresentation {
  const cues = cuesForProfile(state.profile);
  const cue = currentDemoCue(state);
  const token = cue.causal ? MOTION.selectionEmphasis : MOTION.panel;
  const motion = resolveMotion(preference, {
    kind: cue.causal ? "causal" : "navigational",
    durationMs: token.durationMs,
  });
  const targetTotal = state.profile === "90-second" ? 90 : 180;
  const elapsedTargetSeconds = cue.targetSeconds;

  return {
    cue,
    cueNumber: Math.min(state.cueIndex + 1, cues.length),
    cueCount: cues.length,
    canAdvance: canAdvanceDemo(state),
    waitingFor:
      cue.gate !== undefined && !state.satisfiedGates.has(cue.gate)
        ? cue.gate
        : null,
    elapsedTargetSeconds,
    remainingTargetSeconds: Math.max(0, targetTotal - elapsedTargetSeconds),
    motion,
    easing: token.easing,
    timingMeaning: "presenter-pacing-only",
  };
}
