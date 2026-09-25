import { resolveLineageVisualIdentity } from "../design/lineageIdentity";
import {
  validateRenderSnapshot,
  type DishRenderSnapshot,
  type RenderField,
  type RenderLineage,
} from "../render/model";
import type {
  ComposedSimulationSnapshot,
  SimulationSnapshot,
} from "../sim/protocol";

const BIOMASS_UNIT = "model-biomass";
const RESOURCE_UNIT = "model-resource";
const CIPROFLOXACIN_UNIT = "mg/L";

export function projectComposedDishSnapshot(
  snapshot: SimulationSnapshot | null,
  runBranchIdentity: string,
): DishRenderSnapshot | null {
  if (snapshot?.checkpoint.authority !== "composed") return null;
  return projectAuthoritativeComposedDishSnapshot(
    snapshot,
    runBranchIdentity,
  );
}

export function projectAuthoritativeComposedDishSnapshot(
  snapshot: ComposedSimulationSnapshot,
  runBranchIdentity: string,
): DishRenderSnapshot {
  const state = snapshot.checkpoint.composedState;
  const cells = state.width * state.height;

  if (
    !Number.isSafeInteger(state.width) ||
    !Number.isSafeInteger(state.height) ||
    state.width <= 0 ||
    state.height <= 0 ||
    !Number.isSafeInteger(cells)
  ) {
    throw new Error("composed dish projection requires valid grid dimensions");
  }
  if (
    typeof runBranchIdentity !== "string" ||
    runBranchIdentity.length === 0 ||
    runBranchIdentity !== runBranchIdentity.trim()
  ) {
    throw new Error(
      "composed dish projection requires a canonical runtime branch identity",
    );
  }
  if (
    state.mask.length !== cells ||
    state.resource.length !== cells ||
    state.ciprofloxacinConcentrationMgPerL.length !== cells
  ) {
    throw new Error(
      "composed dish projection fields must match authoritative grid dimensions",
    );
  }
  if (
    state.lineageIds.length !== state.lineageBiomass.length ||
    state.lineageIds.length !== state.genotypeIds.length
  ) {
    throw new Error(
      "composed dish projection requires aligned lineage/genotype/biomass channels",
    );
  }

  for (const value of state.mask) {
    if (value !== 0 && value !== 1) {
      throw new Error("composed dish projection requires a binary dish mask");
    }
  }
  const metrics = snapshot.checkpoint.metrics;
  assertMetricLineageIdentity(state.lineageIds, metrics.lineageBiomass);
  const dishMask = Uint8Array.from(state.mask);

  // Keep authoritative-number consistency checks in the same traversal that
  // creates detached presentation buffers. Float32 narrowing happens only after
  // each source value has passed the scientific cross-channel checks.
  const biomass = new Float32Array(cells);
  const sourceBiomassByCell = new Float64Array(cells);
  const lineages: RenderLineage[] = state.lineageIds.map(
    (lineageId, lineageIndex) => {
      const genotypeId = state.genotypeIds[lineageIndex]!;
      assertCanonicalSourceIdentity("lineage id", lineageId);
      assertCanonicalSourceIdentity("genotype id", genotypeId);

      const source = state.lineageBiomass[lineageIndex];
      if (source === undefined || source.length !== cells) {
        throw new Error(
          `composed dish projection lineage ${JSON.stringify(lineageId)} does not match grid dimensions`,
        );
      }

      const density = new Float32Array(cells);
      let lineageTotal = 0;
      for (let cell = 0; cell < cells; cell += 1) {
        const value = source[cell]!;
        assertFiniteNonNegativeSourceValue(
          `lineage ${JSON.stringify(lineageId)} biomass`,
          value,
        );
        if (state.mask[cell] === 0 && value !== 0) {
          throw new Error(
            `lineage ${JSON.stringify(lineageId)} biomass must be zero outside the dish mask`,
          );
        }

        density[cell] = finiteFloat32(
          `lineage ${JSON.stringify(lineageId)} biomass`,
          value,
        );
        sourceBiomassByCell[cell] += value;
        biomass[cell] = finiteFloat32(
          "aggregate model biomass",
          biomass[cell]! + density[cell]!,
        );
        if (state.mask[cell] === 1) lineageTotal += value;
      }
      assertMetricNumberAgreement(
        `lineage ${JSON.stringify(lineageId)} biomass`,
        metrics.lineageBiomass[lineageId]!,
        lineageTotal,
      );

      const identity = resolveLineageVisualIdentity(lineageId);
      return {
        id: lineageId,
        label: lineageId,
        appearanceToken: identity.appearanceToken,
        patternToken: identity.patternToken,
        density,
      };
    },
  );

  let totalBiomass = 0;
  let totalResource = 0;
  let occupiedCells = 0;
  const resource = new Float32Array(cells);
  for (let cell = 0; cell < cells; cell += 1) {
    const value = state.resource[cell]!;
    assertFiniteNonNegativeSourceValue("limiting model resource", value);
    if (state.mask[cell] === 0 && value !== 0) {
      throw new Error(
        "limiting model resource must be zero outside the dish mask",
      );
    }
    resource[cell] = finiteFloat32("limiting model resource", value);

    if (state.mask[cell] !== 1) continue;
    totalResource += value;
    const localBiomass = sourceBiomassByCell[cell]!;
    totalBiomass += localBiomass;
    if (localBiomass > 0) occupiedCells += 1;
  }
  assertMetricNumberAgreement("total biomass", metrics.totalBiomass, totalBiomass);
  assertMetricNumberAgreement("total resource", metrics.totalResource, totalResource);
  if (
    !Number.isSafeInteger(metrics.occupiedCells) ||
    metrics.occupiedCells < 0 ||
    metrics.occupiedCells !== occupiedCells
  ) {
    throw new Error(
      `composed dish projection occupied-cell metric does not match spatial state: expected ${occupiedCells}, received ${metrics.occupiedCells}`,
    );
  }

  assertSourceMaskedZero(
    "ciprofloxacin concentration",
    state.ciprofloxacinConcentrationMgPerL,
    state.mask,
  );
  const ciprofloxacin = finiteFloat32Field(
    "ciprofloxacin concentration",
    state.ciprofloxacinConcentrationMgPerL,
  );

  const fields: RenderField[] = [
    renderField(
      "authoritative-resource",
      "nutrient",
      "Limiting resource",
      RESOURCE_UNIT,
      state.width,
      state.height,
      resource,
      dishMask,
    ),
    renderField(
      "authoritative-ciprofloxacin",
      "antibiotic",
      "Ciprofloxacin",
      CIPROFLOXACIN_UNIT,
      state.width,
      state.height,
      ciprofloxacin,
      dishMask,
    ),
    renderField(
      "authoritative-biomass",
      "biomass",
      "Total biomass",
      BIOMASS_UNIT,
      state.width,
      state.height,
      biomass,
      dishMask,
    ),
  ];

  const projected: DishRenderSnapshot = {
    snapshotId: `composed-trace:${snapshot.traceHash}`,
    samplingIdentity: `runtime-branch:${runBranchIdentity}`,
    simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
    gridWidth: state.width,
    gridHeight: state.height,
    dishMask,
    biomass,
    fields,
    lineages,
    // Current protocol events do not carry authoritative dish coordinates.
    // Do not infer positions from command geometry, lineage density, or Pixi state.
    events: [],
  };

  validateRenderSnapshot(projected);
  return projected;
}

function renderField(
  id: string,
  kind: RenderField["kind"],
  label: string,
  unit: string,
  width: number,
  height: number,
  values: Float32Array,
  mask: Uint8Array,
): RenderField {
  const { minimum, maximum } = inMaskBounds(values, mask);
  return {
    id,
    kind,
    label,
    unit,
    width,
    height,
    values,
    rangeMode: "snapshot-extrema",
    minimum,
    maximum,
  };
}

function inMaskBounds(
  values: Float32Array,
  mask: Uint8Array,
): { readonly minimum: number; readonly maximum: number } {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  let found = false;

  for (let index = 0; index < values.length; index += 1) {
    if (mask[index] !== 1) continue;
    found = true;
    minimum = Math.min(minimum, values[index]!);
    maximum = Math.max(maximum, values[index]!);
  }

  if (!found) {
    throw new Error("composed dish projection requires at least one in-mask cell");
  }
  return { minimum, maximum };
}

function assertMetricLineageIdentity(
  lineageIds: readonly string[],
  lineageBiomass: Readonly<Record<string, number>>,
): void {
  const metricLineageIds = Object.keys(lineageBiomass).sort();
  const stateLineageIds = [...lineageIds].sort();
  if (
    metricLineageIds.length !== stateLineageIds.length ||
    metricLineageIds.some((id, index) => id !== stateLineageIds[index])
  ) {
    throw new Error(
      "composed dish projection metrics must exactly match authoritative lineage identity",
    );
  }
}

function assertCanonicalSourceIdentity(
  name: string,
  value: unknown,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(
      `composed dish projection ${name} must be canonical non-empty text`,
    );
  }
}

function assertFiniteNonNegativeSourceValue(
  name: string,
  value: number,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `composed dish projection ${name} must be finite and non-negative`,
    );
  }
}

function assertMetricNumberAgreement(
  name: string,
  recorded: number,
  expected: number,
): void {
  if (!Number.isFinite(recorded) || recorded < 0) {
    throw new Error(
      `composed dish projection ${name} metric must be finite and non-negative`,
    );
  }
  if (!numbersAgree(recorded, expected)) {
    throw new Error(
      `composed dish projection ${name} metric does not match spatial state: expected ${expected}, received ${recorded}`,
    );
  }
}

function numbersAgree(left: number, right: number): boolean {
  if (Object.is(left, right)) return true;
  return (
    Math.abs(left - right) <=
    1e-12 * Math.max(1, Math.abs(left), Math.abs(right))
  );
}

function finiteFloat32Field(
  name: string,
  values: readonly number[],
): Float32Array {
  const projected = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    projected[index] = finiteFloat32(name, values[index]!);
  }
  return projected;
}

function finiteFloat32(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative`);
  }
  const rounded = Math.fround(value);
  if (!Number.isFinite(rounded)) {
    throw new Error(`${name} must fit finite Float32 presentation storage`);
  }
  return rounded;
}

function assertSourceMaskedZero(
  name: string,
  values: readonly number[],
  mask: readonly number[],
): void {
  for (let index = 0; index < values.length; index += 1) {
    if (mask[index] === 0 && values[index] !== 0) {
      throw new Error(`${name} must be zero outside the dish mask`);
    }
  }
}
