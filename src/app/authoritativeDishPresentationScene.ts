import type { DishRenderSnapshot } from "../render/model";
import type { AspergillusNo10SurfaceCheckpoint } from "../sim/fungi/aspergillusNo10Surface";
import type { SimulationSnapshot } from "../sim/protocol";
import {
  projectComposedDishSnapshot,
  type ComposedDishOrganismPresentationAuthority,
} from "./composedDishProjection";
import type { RuntimeEcologyObservation } from "./experimentRuntime";
import {
  projectAspergillusNo10SurfaceFrontForRender,
  type FungalSurfaceFrontRenderProjection,
} from "./fungalSurfaceRenderProjection";

export const AUTHORITATIVE_DISH_PRESENTATION_SCENE_SCHEMA_VERSION = 1 as const;

export interface ComposedRuntimeDishPresentationSource {
  readonly snapshot: SimulationSnapshot;
  readonly runBranchIdentity: string;
  readonly ecologyObservation?: RuntimeEcologyObservation | null;
  readonly organismPresentationAuthority?: ComposedDishOrganismPresentationAuthority | null;
}

export interface AuthoritativeDishPresentationSceneInput {
  readonly composedRuntime?: ComposedRuntimeDishPresentationSource | null;
  readonly fungalSourceValidationCheckpoint?: AspergillusNo10SurfaceCheckpoint | null;
}

export interface ComposedRuntimeDishPresentationScene {
  readonly schemaVersion:
    typeof AUTHORITATIVE_DISH_PRESENTATION_SCENE_SCHEMA_VERSION;
  readonly kind: "composed-runtime";
  readonly authorityScope: "accepted-composed-runtime";
  readonly biologicalTimeHours: number;
  readonly dish: DishRenderSnapshot;
  readonly fungalFront: null;
}

export interface FungalSourceValidationDishPresentationScene {
  readonly schemaVersion:
    typeof AUTHORITATIVE_DISH_PRESENTATION_SCENE_SCHEMA_VERSION;
  readonly kind: "fungal-source-validation";
  readonly authorityScope: "source-validation-only";
  readonly biologicalTimeHours: number;
  readonly dish: null;
  readonly fungalFront: FungalSurfaceFrontRenderProjection;
}

export type AuthoritativeDishPresentationScene =
  | ComposedRuntimeDishPresentationScene
  | FungalSourceValidationDishPresentationScene;

/**
 * Projects exactly one currently-supported authoritative dish source into a
 * renderer-neutral presentation transaction.
 *
 * v1 deliberately has no mixed bacteria+fungus live mode. The current fungal
 * checkpoint is a standalone source-validation front, not state from the same
 * accepted composed runtime transaction as a bacterial DishRenderSnapshot.
 * Matching biological time is therefore never sufficient to combine them.
 *
 * This helper delegates scientific admission/projection to the existing
 * simulation/app owners. It does not perform a second full-grid clone merely
 * to wrap the resulting DishRenderSnapshot.
 */
export function projectAuthoritativeDishPresentationScene(
  input: AuthoritativeDishPresentationSceneInput,
): AuthoritativeDishPresentationScene | null {
  const composedRuntime = input.composedRuntime ?? null;
  const fungalCheckpoint = input.fungalSourceValidationCheckpoint ?? null;

  if (composedRuntime !== null && fungalCheckpoint !== null) {
    throw new Error(
      "authoritative dish presentation cannot combine composed-runtime state with a standalone fungal source-validation front; mixed live rendering requires one shared accepted runtime transaction",
    );
  }

  if (composedRuntime !== null) {
    const dish = projectComposedDishSnapshot(
      composedRuntime.snapshot,
      composedRuntime.runBranchIdentity,
      composedRuntime.ecologyObservation ?? null,
      composedRuntime.organismPresentationAuthority ?? null,
    );
    if (dish === null) {
      throw new Error(
        "composed-runtime dish presentation requires an authoritative composed simulation snapshot",
      );
    }

    return Object.freeze({
      schemaVersion: AUTHORITATIVE_DISH_PRESENTATION_SCENE_SCHEMA_VERSION,
      kind: "composed-runtime",
      authorityScope: "accepted-composed-runtime",
      biologicalTimeHours: dish.simulationTimeHours,
      dish,
      fungalFront: null,
    });
  }

  if (fungalCheckpoint !== null) {
    const fungalFront =
      projectAspergillusNo10SurfaceFrontForRender(fungalCheckpoint);

    return Object.freeze({
      schemaVersion: AUTHORITATIVE_DISH_PRESENTATION_SCENE_SCHEMA_VERSION,
      kind: "fungal-source-validation",
      authorityScope: "source-validation-only",
      biologicalTimeHours: fungalFront.biologicalTimeHours,
      dish: null,
      fungalFront,
    });
  }

  return null;
}
