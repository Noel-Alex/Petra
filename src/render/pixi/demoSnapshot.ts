import { gridCellCenter } from "../gridGeometry";
import type { DishRenderSnapshot } from "../model";

/**
 * Presentation-only fixture for exercising the renderer before the authoritative
 * worker composition is wired into the browser. Values are intentionally
 * dimensionless/demo data and must never be surfaced as scientific evidence.
 */
export function createRendererDemoSnapshot(size = 48): DishRenderSnapshot {
  if (!Number.isInteger(size) || size < 12) {
    throw new RangeError("demo snapshot size must be an integer >= 12");
  }

  const cells = size * size;
  const dishMask = new Uint8Array(cells);
  const biomass = new Float32Array(cells);
  const nutrient = new Float32Array(cells);
  const antibiotic = new Float32Array(cells);
  const ancestor = new Float32Array(cells);
  const resistant = new Float32Array(cells);

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const index = row * size + column;
      const center = gridCellCenter(index, size, size);
      const x = center.x;
      const y = center.y;
      const dx = x - 0.5;
      const dy = y - 0.5;
      const inside = dx * dx + dy * dy <= 0.245;

      if (!inside) continue;
      dishMask[index] = 1;

      const a = gaussian(x, y, 0.37, 0.48, 0.11);
      const b = gaussian(x, y, 0.64, 0.38, 0.075);
      const c = gaussian(x, y, 0.58, 0.67, 0.09);
      ancestor[index] = a + 0.72 * c;
      resistant[index] = 0.8 * b;
      biomass[index] = ancestor[index] + resistant[index];

      const radial = Math.sqrt(dx * dx + dy * dy) / 0.5;
      nutrient[index] = Math.max(0, 1 - radial * 0.65 - biomass[index] * 0.18);
      antibiotic[index] = Math.max(0, Math.min(1, (x - 0.34) * 1.65));
    }
  }

  return {
    snapshotId: "renderer-demo-v1",
    samplingIdentity: "renderer-demo-v1",
    simulationTimeHours: 0,
    gridWidth: size,
    gridHeight: size,
    dishMask,
    biomass,
    fields: [
      {
        id: "demo-nutrient",
        kind: "nutrient",
        label: "Nutrient",
        unit: "demo normalized",
        width: size,
        height: size,
        values: nutrient,
        minimum: 0,
        maximum: 1,
      },
      {
        id: "demo-antibiotic",
        kind: "antibiotic",
        label: "Antibiotic",
        unit: "demo normalized",
        width: size,
        height: size,
        values: antibiotic,
        minimum: 0,
        maximum: 1,
      },
    ],
    lineages: [
      {
        id: "demo-ancestor",
        label: "Ancestor",
        appearanceToken: "lineage-cyan",
        patternToken: "solid-ring",
        density: ancestor,
      },
      {
        id: "demo-resistant",
        label: "Resistant example",
        appearanceToken: "lineage-coral",
        patternToken: "double-ring",
        density: resistant,
      },
    ],
    events: [],
  };
}

function gaussian(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  sigma: number,
): number {
  const dx = x - centerX;
  const dy = y - centerY;
  return Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
}
