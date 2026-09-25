import {
  ECOLOGY_FLUX_OBSERVATION_SCHEMA_VERSION,
  type EcologyFluxObservation,
} from "../sim/ecology/fluxObservation";
import type { RenderField } from "./model";

export const ECOLOGY_NET_GROWTH_RENDER_FIELD_ID =
  "authoritative-net-local-biomass-rate" as const;

function canonicalUnit(name: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  if (value !== value.trim()) {
    throw new RangeError(`${name} must be canonical with no surrounding whitespace`);
  }
}

function positiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

/**
 * Projects an already-authoritative ecology step observation into the signed
 * renderer field used for the net-growth overlay.
 *
 * The source quantity is the interval-average, pre-spread net local biomass
 * rate. This adapter only narrows/copies it for presentation; it never derives
 * rates from endpoint snapshots, animation, or glyph motion.
 */
export function projectEcologyNetGrowthField(
  observation: EcologyFluxObservation,
): RenderField {
  if (
    observation.schemaVersion !== ECOLOGY_FLUX_OBSERVATION_SCHEMA_VERSION
  ) {
    throw new RangeError(
      `unsupported ecology flux observation schema: ${String(observation.schemaVersion)}`,
    );
  }

  positiveSafeInteger("ecology flux width", observation.width);
  positiveSafeInteger("ecology flux height", observation.height);
  const cells = observation.width * observation.height;
  if (!Number.isSafeInteger(cells)) {
    throw new RangeError("ecology flux grid cell count must be a safe integer");
  }
  if (
    observation.mask.length !== cells ||
    observation.averageNetLocalBiomassRateByCell.length !== cells
  ) {
    throw new RangeError(
      "ecology net-growth projection arrays must match grid dimensions",
    );
  }

  canonicalUnit("ecology flux biomassUnit", observation.biomassUnit);
  canonicalUnit("ecology flux timeUnit", observation.timeUnit);
  if (!Number.isFinite(observation.stepDuration) || observation.stepDuration <= 0) {
    throw new RangeError("ecology flux stepDuration must be finite and positive");
  }

  const values = new Float32Array(cells);
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  let inMaskCells = 0;

  for (let index = 0; index < cells; index += 1) {
    const mask = observation.mask[index]!;
    if (mask !== 0 && mask !== 1) {
      throw new RangeError(
        `ecology flux mask must be binary 0 or 1 at cell ${index}`,
      );
    }

    const source = observation.averageNetLocalBiomassRateByCell[index]!;
    if (!Number.isFinite(source)) {
      throw new RangeError(
        `ecology net-growth rate must be finite at cell ${index}`,
      );
    }
    if (mask === 0 && source !== 0) {
      throw new RangeError(
        `ecology net-growth rate must be zero outside the mask at cell ${index}`,
      );
    }

    const narrowed = Math.fround(source);
    if (!Number.isFinite(narrowed)) {
      throw new RangeError(
        `ecology net-growth rate must fit finite Float32 storage at cell ${index}`,
      );
    }
    values[index] = narrowed;

    if (mask === 1) {
      inMaskCells += 1;
      minimum = Math.min(minimum, narrowed);
      maximum = Math.max(maximum, narrowed);
    }
  }

  if (inMaskCells === 0) {
    throw new RangeError(
      "ecology net-growth projection requires at least one in-mask cell",
    );
  }

  return {
    id: ECOLOGY_NET_GROWTH_RENDER_FIELD_ID,
    kind: "net-growth",
    label: "Net local biomass rate (pre-spread)",
    unit: `${observation.biomassUnit}/${observation.timeUnit}`,
    width: observation.width,
    height: observation.height,
    values,
    rangeMode: "snapshot-extrema",
    minimum,
    maximum,
  };
}
