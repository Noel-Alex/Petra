import type { RunIdentity } from "../sim/protocol";
import type { OrganismPresentationIdentity } from "../render/organismPresentationIdentity";
import { resolveOrganismPresentationForRun } from "./organismPresentationBinding";
import type { DishRenderSnapshot } from "../render/model";

export type DishRenderSourceKind =
  | "authoritative-snapshot"
  | "visual-demo"
  | "awaiting-authoritative-snapshot";

export interface DishRenderSourceState {
  /** Presentation-only fixture cached for this mounted source-state lifetime. */
  readonly demoSnapshot: DishRenderSnapshot | null;
}

export interface DishRenderSource {
  readonly kind: DishRenderSourceKind;
  readonly organismPresentation: OrganismPresentationIdentity | null;
  readonly snapshot: DishRenderSnapshot | null;
}

export interface DishRenderSourceResolution {
  readonly state: DishRenderSourceState;
  readonly source: DishRenderSource;
}

export interface DishRenderSourceInput {
  readonly authoritativeSnapshot?: DishRenderSnapshot | null;
  readonly demoMode: boolean;
  readonly runIdentity?: RunIdentity | null;
}

/**
 * Presentation-only candidate factory.
 *
 * React may invoke a render resolver speculatively or more than once before a
 * candidate is committed. Production factories therefore must be deterministic
 * and side-effect free for the same explicit demo configuration. Never put
 * simulation authority, RNG progression, network work, or persistent mutation
 * behind this callback.
 */
export type DemoSnapshotFactory = () => DishRenderSnapshot;

export const INITIAL_DISH_RENDER_SOURCE_STATE: DishRenderSourceState =
  Object.freeze({ demoSnapshot: null });

/**
 * Resolves one presentation transaction for the dish shell.
 *
 * State belongs to one mounted dish surface. Reusing the returned state keeps
 * one exact visual-demo snapshot object available to both DOM controls and the
 * renderer. Source identity is explicit and independent from snapshot object
 * presence, so demo data never becomes authoritative merely because it is
 * passed through a snapshot-shaped boundary.
 *
 * This resolver is pure with respect to the supplied state: it returns a
 * candidate next state but never mutates the committed state object. React
 * callers may therefore resolve during speculative renders, then commit only
 * the accepted candidate after render. An abandoned render must not advance
 * mounted cache identity.
 */
export function resolveDishRenderSource(
  state: DishRenderSourceState,
  input: DishRenderSourceInput,
  createDemoSnapshot: DemoSnapshotFactory,
): DishRenderSourceResolution {
  const authoritativeSnapshot = input.authoritativeSnapshot ?? null;

  if (authoritativeSnapshot !== null) {
    return {
      state,
      source: {
        kind: "authoritative-snapshot",
        organismPresentation: resolveOrganismPresentationForRun(input.runIdentity ?? null),
        snapshot: authoritativeSnapshot,
      },
    };
  }

  if (!input.demoMode) {
    return {
      state,
      source: {
        kind: "awaiting-authoritative-snapshot",
        organismPresentation: null,
        snapshot: null,
      },
    };
  }

  const demoSnapshot = state.demoSnapshot ?? createDemoSnapshot();
  const nextState =
    state.demoSnapshot === null
      ? Object.freeze({ demoSnapshot })
      : state;

  return {
    state: nextState,
    source: {
      kind: "visual-demo",
      organismPresentation: null,
      snapshot: demoSnapshot,
    },
  };
}