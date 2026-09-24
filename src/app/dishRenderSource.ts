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
  readonly snapshot: DishRenderSnapshot | null;
}

export interface DishRenderSourceResolution {
  readonly state: DishRenderSourceState;
  readonly source: DishRenderSource;
}

export interface DishRenderSourceInput {
  readonly authoritativeSnapshot?: DishRenderSnapshot | null;
  readonly demoMode: boolean;
}

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
        snapshot: authoritativeSnapshot,
      },
    };
  }

  if (!input.demoMode) {
    return {
      state,
      source: {
        kind: "awaiting-authoritative-snapshot",
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
      snapshot: demoSnapshot,
    },
  };
}