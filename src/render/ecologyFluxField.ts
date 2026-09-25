import {
  ECOLOGY_FLUX_OBSERVATION_SCHEMA_VERSION,
  type EcologyFluxObservation,
} from "../sim/ecology/fluxObservation";
import type { RenderField } from "./model";

export const ECOLOGY_NET_GROWTH_RENDER_FIELD_ID =
  "authoritative-net-local-biomass-rate" as const;
export const ECOLOGY_DIVISION_RATE_RENDER_FIELD_ID =
  "authoritative-local-division-biomass-rate" as const;
export const ECOLOGY_DEATH_RATE_RENDER_FIELD_ID =
  "authoritative-local-death-biomass-rate" as const;

interface EcologyRateFieldProjection {
  readonly id: RenderField["id"];
  readonly kind: RenderField["kind"];
  readonly label: string;
  readonly source: readonly number[];
  readonly sourceName: string;
  readonly requireNonNegative: boolean;
}

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

function projectEcologyRateField(
  observation: EcologyFluxObservation,
  projection: EcologyRateFieldProjection,
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
  if (observation.mask.length !== cells || projection.source.length !== cells) {
    throw new RangeError(
      `ecology ${projection.sourceName} projection arrays must match grid dimensions`,
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

    const source = projection.source[index]!;
    if (!Number.isFinite(source)) {
      throw new RangeError(
        `ecology ${projection.sourceName} rate must be finite at cell ${index}`,
      );
    }
    if (projection.requireNonNegative && source < 0) {
      throw new RangeError(
        `ecology ${projection.sourceName} rate must be non-negative at cell ${index}`,
      );
    }
    if (mask === 0 && source !== 0) {
      throw new RangeError(
        `ecology ${projection.sourceName} rate must be zero outside the mask at cell ${index}`,
      );
    }

    const narrowed = Math.fround(source);
    if (!Number.isFinite(narrowed)) {
      throw new RangeError(
        `ecology ${projection.sourceName} rate must fit finite Float32 storage at cell ${index}`,
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
      `ecology ${projection.sourceName} projection requires at least one in-mask cell`,
    );
  }

  return {
    id: projection.id,
    kind: projection.kind,
    label: projection.label,
    unit: `${observation.biomassUnit}/${observation.timeUnit}`,
    width: observation.width,
    height: observation.height,
    values,
    rangeMode: "snapshot-extrema",
    minimum,
    maximum,
  };
}

/**
 * Projects the exact interval-average pre-spread division biomass production
 * ledger for the accepted ecology step. This is continuous biomass flux, not
 * a discrete division/cell-count channel.
 */
export function projectEcologyDivisionRateField(
  observation: EcologyFluxObservation,
): RenderField {
  return projectEcologyRateField(observation, {
    id: ECOLOGY_DIVISION_RATE_RENDER_FIELD_ID,
    kind: "division-rate",
    label: "Division biomass rate (pre-spread)",
    source: observation.averageDivisionBiomassRateByCell,
    sourceName: "division",
    requireNonNegative: true,
  });
}

/**
 * Projects the exact interval-average pre-spread death biomass loss ledger
 * for the accepted ecology step. Values are loss magnitudes and therefore
 * remain non-negative; sign is represented only in the net-growth field.
 */
export function projectEcologyDeathRateField(
  observation: EcologyFluxObservation,
): RenderField {
  return projectEcologyRateField(observation, {
    id: ECOLOGY_DEATH_RATE_RENDER_FIELD_ID,
    kind: "death-rate",
    label: "Death biomass rate (pre-spread)",
    source: observation.averageDeathBiomassRateByCell,
    sourceName: "death",
    requireNonNegative: true,
  });
}

/**
 * Projects the exact signed interval-average, pre-spread net local biomass
 * rate. This adapter never derives rates from endpoint snapshots, animation,
 * or representative glyph motion.
 */
export function projectEcologyNetGrowthField(
  observation: EcologyFluxObservation,
): RenderField {
  return projectEcologyRateField(observation, {
    id: ECOLOGY_NET_GROWTH_RENDER_FIELD_ID,
    kind: "net-growth",
    label: "Net local biomass rate (pre-spread)",
    source: observation.averageNetLocalBiomassRateByCell,
    sourceName: "net-growth",
    requireNonNegative: false,
  });
}

/**
 * Coherent renderer bundle for one already-authoritative ecology step.
 * Net growth remains first to preserve the established field ordering.
 */
export function projectEcologyRateFields(
  observation: EcologyFluxObservation,
): readonly RenderField[] {
  return Object.freeze([
    projectEcologyNetGrowthField(observation),
    projectEcologyDivisionRateField(observation),
    projectEcologyDeathRateField(observation),
  ]);
}
