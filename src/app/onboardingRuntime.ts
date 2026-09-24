import type { RunIdentity, SimulationEvent } from "../sim/protocol";
import {
  initialOnboardingState,
  reduceOnboarding,
  type OnboardingEvent,
  type OnboardingState,
  type ScientificGate,
} from "../ui/onboarding/story";
import type { ExperimentRuntimeState } from "./experimentRuntime";

export type OnboardingUserAction = Extract<
  OnboardingEvent,
  { readonly type: "continue" | "back" | "skip" | "reset" }
>;

export interface AuthoritativeOnboardingGateStream {
  /** Exact active simulation identity that owns these cumulative gate facts. */
  readonly runIdentity: RunIdentity;
  /**
   * Stable run/branch generation identity. A reset/reinitialize must change
   * this even when the underlying RunIdentity fields are reused.
   */
  readonly runBranchIdentity: string;
  /**
   * Cumulative scientific facts already established by authoritative runtime
   * state/events. Presentation code may consume these gates but never create
   * them from timers, animation callbacks, pixels, or generic "advanced"
   * protocol activity.
   */
  readonly gates: readonly ScientificGate[];
}

export interface OnboardingRuntimeProjection {
  readonly runIdentityKey: string | null;
  readonly hasAuthoritativeSnapshot: boolean;
  readonly gates: readonly ScientificGate[];
  readonly revisionKey: string;
}

export interface OnboardingRuntimeSession {
  readonly runIdentityKey: string | null;
  readonly hasSeenAuthoritativeSnapshot: boolean;
  readonly state: OnboardingState;
}

/**
 * Current protocol events are intentionally explicit here. None of them prove
 * Petra's causal onboarding gates: "advanced" does not prove population growth,
 * and "synthetic-pulse" is not an inoculation or antibiotic intervention.
 *
 * The satisfies clause is deliberate. Adding a new SimulationEvent type forces
 * this adapter to make an explicit gate/no-gate decision at type-check time.
 */
const ONBOARDING_GATE_BY_EVENT_TYPE = {
  initialized: null,
  advanced: null,
  "synthetic-pulse": null,
  restored: null,
} satisfies Record<SimulationEvent["type"], ScientificGate | null>;

export function projectOnboardingRuntime(
  runtime: ExperimentRuntimeState | null,
  authoritativeGateStream?: AuthoritativeOnboardingGateStream | null,
): OnboardingRuntimeProjection {
  const runIdentityKey =
    runtime === null ? null : serializeRunIdentity(runtime.controls.identity);
  const hasAuthoritativeSnapshot = runtime?.snapshot !== null && runtime?.snapshot !== undefined;
  const gates: ScientificGate[] = [];

  for (const event of runtime?.snapshot?.events ?? []) {
    const gate = ONBOARDING_GATE_BY_EVENT_TYPE[event.type];
    if (gate !== null && !gates.includes(gate)) {
      gates.push(gate);
    }
  }

  let authoritativeBranchIdentity: string | null = null;
  if (
    runtime !== null &&
    authoritativeGateStream !== null &&
    authoritativeGateStream !== undefined
  ) {
    assertRunBranchIdentity(authoritativeGateStream.runBranchIdentity);
    if (
      serializeRunIdentity(authoritativeGateStream.runIdentity) ===
      serializeRunIdentity(runtime.controls.identity)
    ) {
      authoritativeBranchIdentity =
        authoritativeGateStream.runBranchIdentity.trim();
      for (const gate of authoritativeGateStream.gates) {
        assertScientificGate(gate);
        if (!gates.includes(gate)) gates.push(gate);
      }
    }
  }

  return {
    runIdentityKey,
    hasAuthoritativeSnapshot,
    gates,
    revisionKey: JSON.stringify([
      runIdentityKey,
      hasAuthoritativeSnapshot,
      authoritativeBranchIdentity,
      gates,
    ]),
  };
}

export function createOnboardingRuntimeSession(
  projection: OnboardingRuntimeProjection,
): OnboardingRuntimeSession {
  return {
    runIdentityKey: projection.runIdentityKey,
    hasSeenAuthoritativeSnapshot: projection.hasAuthoritativeSnapshot,
    state: initialOnboardingState(),
  };
}

/**
 * Synchronizes controlled story state with runtime authority.
 *
 * - changing run identity resets the guide;
 * - dropping a previously seen authoritative snapshot resets the guide, which
 *   covers reset/replay reinitialization even when the seed/identity is reused;
 * - scientific gates can only be added by the explicit runtime projection.
 */
export function reconcileOnboardingRuntimeSession(
  session: OnboardingRuntimeSession,
  projection: OnboardingRuntimeProjection,
): OnboardingRuntimeSession {
  let state = session.state;
  let hasSeenAuthoritativeSnapshot = session.hasSeenAuthoritativeSnapshot;
  let changed = false;

  if (session.runIdentityKey !== projection.runIdentityKey) {
    state = initialOnboardingState();
    hasSeenAuthoritativeSnapshot = projection.hasAuthoritativeSnapshot;
    changed = true;
  } else if (
    session.hasSeenAuthoritativeSnapshot &&
    !projection.hasAuthoritativeSnapshot
  ) {
    state = initialOnboardingState();
    hasSeenAuthoritativeSnapshot = false;
    changed = true;
  } else if (
    !session.hasSeenAuthoritativeSnapshot &&
    projection.hasAuthoritativeSnapshot
  ) {
    hasSeenAuthoritativeSnapshot = true;
    changed = true;
  }

  for (const gate of projection.gates) {
    if (state.satisfiedGates.has(gate)) continue;
    state = reduceOnboarding(state, { type: "scientific-gate", gate });
    changed = true;
  }

  if (!changed) return session;

  return {
    runIdentityKey: projection.runIdentityKey,
    hasSeenAuthoritativeSnapshot,
    state,
  };
}

export function applyOnboardingUserAction(
  session: OnboardingRuntimeSession,
  projection: OnboardingRuntimeProjection,
  action: OnboardingUserAction,
): OnboardingRuntimeSession {
  const synchronized = reconcileOnboardingRuntimeSession(session, projection);
  return {
    ...synchronized,
    state: reduceOnboarding(synchronized.state, action),
  };
}

const SCIENTIFIC_GATES: ReadonlySet<string> = new Set([
  "inoculation-recorded",
  "population-growth-observed",
  "antibiotic-command-recorded",
  "resistant-lineage-frequency-increased",
]);

function assertScientificGate(value: unknown): asserts value is ScientificGate {
  if (typeof value !== "string" || !SCIENTIFIC_GATES.has(value)) {
    throw new TypeError("unsupported authoritative onboarding scientific gate");
  }
}

function assertRunBranchIdentity(value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(
      "authoritative onboarding runBranchIdentity must be non-empty",
    );
  }
}

function serializeRunIdentity(identity: RunIdentity): string {
  return JSON.stringify([
    identity.engineVersion,
    identity.protocolVersion,
    identity.scenarioId,
    identity.scenarioVersion,
    identity.parameterSetId,
    identity.parameterSetVersion,
    identity.seed,
  ]);
}
