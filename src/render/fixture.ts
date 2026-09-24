import type { DishRenderSnapshot } from "./model";

/**
 * Renderer-only fixture used until authoritative worker snapshots are wired.
 * Values are synthetic presentation data and must never be shown as measured biology.
 */
export function createRendererFixtureSnapshot(): DishRenderSnapshot {
  const width = 32;
  const height = 32;
  const cells = width * height;
  const dishMask = new Uint8Array(cells);
  const biomass = new Float32Array(cells);
  const nutrient = new Float32Array(cells);
  const antibiotic = new Float32Array(cells);
  const susceptible = new Float32Array(cells);
  const resistant = new Float32Array(cells);

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = row * width + column;
      const x = (column + 0.5) / width;
      const y = (row + 0.5) / height;
      const dx = x - 0.5;
      const dy = y - 0.5;
      const inside = dx * dx + dy * dy <= 0.23;
      dishMask[index] = inside ? 1 : 0;
      if (!inside) continue;

      const leftColony = gaussian(x, y, 0.38, 0.48, 0.105);
      const rightColony = gaussian(x, y, 0.63, 0.44, 0.072);
      const lowerColony = gaussian(x, y, 0.54, 0.66, 0.065);

      susceptible[index] = leftColony * 0.9 + lowerColony * 0.45;
      resistant[index] = rightColony * 0.95 + lowerColony * 0.4;
      biomass[index] = susceptible[index] + resistant[index];

      nutrient[index] = Math.max(0, 1 - biomass[index] * 0.58);
      antibiotic[index] = Math.max(
        0,
        Math.min(1, 0.18 + x * 0.72 - y * 0.1),
      );
    }
  }

  return {
    snapshotId: "renderer-fixture-v1",
    simulationTimeHours: 0,
    gridWidth: width,
    gridHeight: height,
    dishMask,
    biomass,
    fields: [
      {
        id: "fixture-nutrient",
        kind: "nutrient",
        label: "Synthetic nutrient field",
        unit: "fixture intensity",
        width,
        height,
        values: nutrient,
        minimum: 0,
        maximum: 1,
      },
      {
        id: "fixture-antibiotic",
        kind: "antibiotic",
        label: "Synthetic antibiotic field",
        unit: "fixture intensity",
        width,
        height,
        values: antibiotic,
        minimum: 0,
        maximum: 1,
      },
    ],
    lineages: [
      {
        id: "fixture-susceptible",
        label: "Fixture lineage A",
        appearanceToken: "cyan",
        patternToken: "solid-round",
        density: susceptible,
      },
      {
        id: "fixture-resistant",
        label: "Fixture lineage B",
        appearanceToken: "coral",
        patternToken: "bar",
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
