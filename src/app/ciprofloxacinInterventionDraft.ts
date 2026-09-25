import {
  parseCiprofloxacinToolAuthority,
  type CiprofloxacinToolAuthority,
  type CiprofloxacinToolGeometryKind,
} from "./ciprofloxacinToolAuthority";
import {
  createInterventionPreview,
  type InterventionDraft,
  type InterventionGeometry,
  type InterventionPreview,
} from "../ui/interventionPreview";
import type { MotionPreference } from "../ui/motion/policy";

export interface CiprofloxacinInterventionDraftInput {
  readonly intentId: string;
  /**
   * Must be an explicitly authored protocol-supported geometry. Presentation
   * point cursors are intentionally not accepted as biological geometry.
   */
  readonly geometry: InterventionGeometry;
  /**
   * Omit to use the scenario-owned neutral/default value. Explicit values are
   * carried into the existing preview validator, which owns range admission.
   */
  readonly concentrationMgPerL?: number;
}

/**
 * Build one presentation draft from versioned scenario authority without
 * inventing biological or spatial parameters in React.
 *
 * The caller must provide complete authoritative geometry. In particular, a
 * point cursor cannot be promoted into a radial intervention by borrowing a
 * presentation-only ring radius.
 */
export function buildCiprofloxacinInterventionDraft(
  authority: CiprofloxacinToolAuthority,
  input: CiprofloxacinInterventionDraftInput,
): InterventionDraft {
  const validated = parseCiprofloxacinToolAuthority(authority);
  const geometryKind = supportedGeometryKind(input.geometry);

  if (!validated.supportedGeometries.includes(geometryKind)) {
    throw new Error(
      `ciprofloxacin geometry ${JSON.stringify(geometryKind)} is not enabled by scenario authority`,
    );
  }

  const concentration =
    input.concentrationMgPerL ?? validated.parameter.defaultValue;

  return {
    intentId: input.intentId,
    tool: "antibiotic",
    geometry: structuredClone(input.geometry),
    parameters: [
      {
        key: validated.parameter.key,
        label: validated.parameter.label,
        value: concentration,
        unit: validated.parameter.unit,
        precision: validated.parameter.precision,
        min: validated.parameter.minimum,
        max: validated.parameter.maximum,
      },
    ],
  };
}

/**
 * Convenience projection through Petra's existing intervention-preview
 * validator. This keeps coordinate/range validation in one shared policy.
 */
export function createCiprofloxacinInterventionPreview(
  authority: CiprofloxacinToolAuthority,
  input: CiprofloxacinInterventionDraftInput,
  motion: MotionPreference,
): InterventionPreview {
  return createInterventionPreview(
    buildCiprofloxacinInterventionDraft(authority, input),
    motion,
  );
}

function supportedGeometryKind(
  geometry: InterventionGeometry,
): CiprofloxacinToolGeometryKind {
  if (geometry.kind === "point") {
    throw new Error(
      "point geometry is presentation-only and cannot become an authoritative ciprofloxacin intervention",
    );
  }
  return geometry.kind;
}
