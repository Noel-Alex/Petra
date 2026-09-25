import type { RenderField } from "../render/model";
import {
  assertSingleActiveAntimicrobialOnly,
  type AntimicrobialFieldAuthority,
  type AntimicrobialFieldGridAuthority,
  type AntimicrobialFieldSet,
  type AntimicrobialSpatialField,
} from "../sim/pharmacodynamics/fieldSet";

export function antimicrobialRenderFieldId(
  authority: AntimicrobialFieldAuthority,
): string {
  return [
    "authoritative-antimicrobial",
    encodeURIComponent(authority.drugId),
    encodeURIComponent(authority.authorityId),
    encodeURIComponent(authority.authorityVersion),
  ].join(":");
}

/**
 * Projects already-authoritative antimicrobial concentration fields into
 * renderer-owned detached scalar overlays.
 *
 * This adapter preserves the simulation-owned drug/authority/version/unit
 * identity and current fail-closed simultaneous-exposure policy. It performs
 * no unit conversion, pharmacodynamic evaluation, cross-drug normalization,
 * product enablement, or interaction composition.
 */
export function projectAntimicrobialFieldsForRender(
  set: AntimicrobialFieldSet,
  grid: AntimicrobialFieldGridAuthority,
): readonly RenderField[] {
  // This revalidates the complete field set before inspecting it and currently
  // refuses >1 non-zero drug until a separate joint-composition authority exists.
  assertSingleActiveAntimicrobialOnly(set, grid);

  let hasInMaskCell = false;
  for (const mask of grid.dishMask) {
    if (mask === 1) {
      hasInMaskCell = true;
      break;
    }
  }
  if (!hasInMaskCell) {
    throw new Error(
      "antimicrobial render projection requires at least one authoritative in-mask cell",
    );
  }

  return Object.freeze(
    set.fields.map((field) =>
      Object.freeze(projectAntimicrobialField(field, grid)),
    ),
  );
}

function projectAntimicrobialField(
  field: AntimicrobialSpatialField,
  grid: AntimicrobialFieldGridAuthority,
): RenderField {
  const values = Float32Array.from(field.values);
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < values.length; index += 1) {
    if (grid.dishMask[index] !== 1) continue;
    const value = values[index]!;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }

  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    throw new Error(
      "antimicrobial render projection could not resolve in-mask concentration extrema",
    );
  }

  return {
    id: antimicrobialRenderFieldId(field.authority),
    kind: "antibiotic",
    label: field.authority.drugId,
    unit: field.authority.concentrationUnit,
    width: field.width,
    height: field.height,
    values,
    rangeMode: "snapshot-extrema",
    minimum,
    maximum,
  };
}
