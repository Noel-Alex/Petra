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
  const dishMask = Uint8Array.from(state.mask);

  const biomass = new Float32Array(cells);
  const lineages: RenderLineage[] = state.lineageIds.map(
    (lineageId, lineageIndex) => {
      const source = state.lineageBiomass[lineageIndex];
      if (source === undefined || source.length !== cells) {
        throw new Error(
          `composed dish projection lineage ${JSON.stringify(lineageId)} does not match grid dimensions`,
        );
      }

      assertSourceMaskedZero(
        `lineage ${JSON.stringify(lineageId)} biomass`,
        source,
        state.mask,
      );
      const density = finiteFloat32Field(
        `lineage ${JSON.stringify(lineageId)} biomass`,
        source,
      );
      for (let cell = 0; cell < cells; cell += 1) {
        biomass[cell] = finiteFloat32(
          "aggregate model biomass",
          biomass[cell]! + density[cell]!,
        );
      }

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

  assertSourceMaskedZero(
    "limiting model resource",
    state.resource,
    state.mask,
  );
  assertSourceMaskedZero(
    "ciprofloxacin concentration",
    state.ciprofloxacinConcentrationMgPerL,
    state.mask,
  );
  const resource = finiteFloat32Field(
    "limiting model resource",
    state.resource,
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
