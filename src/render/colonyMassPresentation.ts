export const COLONY_MASS_PRESENTATION_VERSION = 1 as const;

export interface ColonyMassAlphaField {
  readonly version: typeof COLONY_MASS_PRESENTATION_VERSION;
  readonly meaning: "presentation-only-density-mass";
  readonly width: number;
  readonly height: number;
  readonly sharedDensityMaximum: number;
  readonly alpha: Float32Array;
}

/**
 * Continuous presentation-only density transfer for coherent colony masses.
 *
 * The cubic smoothstep has no non-zero threshold: source zero stays exactly
 * transparent, while positive source density remains ordered monotonically.
 * It intentionally suppresses very sparse coverage and strengthens dense
 * coverage so a linearly filtered raster reads as a small number of connected
 * masses instead of a field of equally prominent dots. This is not colony
 * fusion, a measured boundary, CFU/cell count, or biological state.
 */
export function projectColonyMassAlpha(
  density: number,
  sharedDensityMaximum: number,
): number {
  assertFiniteNonNegative("lineage density", density);
  assertFiniteNonNegative(
    "shared lineage density maximum",
    sharedDensityMaximum,
  );

  if (density === 0 || sharedDensityMaximum === 0) return 0;

  const normalized = Math.min(1, density / sharedDensityMaximum);
  const alpha = normalized * normalized * (3 - 2 * normalized);
  return Math.fround(alpha);
}

/**
 * Projects one lineage density channel into detached raster-ready alpha.
 *
 * The authoritative dish mask is a hard presentation clip: off-mask output is
 * always exactly zero even if a malformed presentation fixture carries density
 * there. No neighborhood blur or connected-component rewrite is performed, so
 * the renderer cannot bridge a truly zero-density gap and call that biology.
 */
export function projectColonyMassAlphaField(args: {
  readonly width: number;
  readonly height: number;
  readonly dishMask: ArrayLike<number>;
  readonly density: ArrayLike<number>;
  readonly sharedDensityMaximum: number;
}): ColonyMassAlphaField {
  assertPositiveSafeInteger("colony mass width", args.width);
  assertPositiveSafeInteger("colony mass height", args.height);
  const cells = args.width * args.height;
  if (!Number.isSafeInteger(cells)) {
    throw new RangeError("colony mass grid cell count must be a safe integer");
  }
  if (args.dishMask.length !== cells || args.density.length !== cells) {
    throw new RangeError(
      "colony mass mask and density must match grid dimensions",
    );
  }
  assertFiniteNonNegative(
    "shared lineage density maximum",
    args.sharedDensityMaximum,
  );

  const alpha = new Float32Array(cells);
  for (let index = 0; index < cells; index += 1) {
    const mask = args.dishMask[index];
    if (mask !== 0 && mask !== 1) {
      throw new RangeError(
        `colony mass dish mask must be binary at cell ${index}`,
      );
    }

    const density = args.density[index];
    if (typeof density !== "number") {
      throw new TypeError(
        `colony mass density must be numeric at cell ${index}`,
      );
    }
    assertFiniteNonNegative(`colony mass density[${index}]`, density);
    alpha[index] =
      mask === 1
        ? projectColonyMassAlpha(density, args.sharedDensityMaximum)
        : 0;
  }

  return {
    version: COLONY_MASS_PRESENTATION_VERSION,
    meaning: "presentation-only-density-mass",
    width: args.width,
    height: args.height,
    sharedDensityMaximum: args.sharedDensityMaximum,
    alpha,
  };
}

function assertPositiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}
