import { isLineageAppearanceToken, type LineageAppearanceToken } from "./lineageAppearance";
import { isLineagePatternToken, type LineagePatternToken } from "./lineagePatterns";

export type SemanticZoomLevel = "dish" | "colony" | "representative-cell";

export const OVERLAY_KINDS = [
  "nutrient",
  "antibiotic",
  "net-growth",
  "lineage",
  "phage",
  "biomass",
  "event",
  "uncertainty",
] as const;

export type OverlayKind = (typeof OVERLAY_KINDS)[number];

export function isOverlayKind(value: string): value is OverlayKind {
  return (OVERLAY_KINDS as readonly string[]).includes(value);
}

export interface RenderField { readonly id: string; readonly kind: OverlayKind; readonly label: string; readonly unit: string; readonly width: number; readonly height: number; readonly values: Float32Array; readonly minimum: number; readonly maximum: number; }
export interface RenderLineage { readonly id: string; readonly label: string; readonly appearanceToken: LineageAppearanceToken; readonly patternToken: LineagePatternToken; readonly density: Float32Array; }
export interface RenderEvent { readonly id: string; readonly kind: string; readonly simulationTimeHours: number; readonly x: number; readonly y: number; readonly lineageId?: string; readonly label: string; }
export interface DishRenderSnapshot { readonly snapshotId: string; /** Stable presentation-only domain for deterministic representative-glyph sampling across related snapshots. */ readonly samplingIdentity: string; readonly simulationTimeHours: number; readonly gridWidth: number; readonly gridHeight: number; readonly dishMask: Uint8Array; readonly biomass: Float32Array; readonly fields: readonly RenderField[]; readonly lineages: readonly RenderLineage[]; readonly events: readonly RenderEvent[]; }
export interface CameraView { readonly centerX: number; readonly centerY: number; readonly zoom: number; }
export interface SemanticZoomPolicy { readonly colonyAt: number; readonly representativeCellAt: number; }

export const DEFAULT_SEMANTIC_ZOOM_POLICY: SemanticZoomPolicy = Object.freeze({ colonyAt: 2.25, representativeCellAt: 7 });

export function semanticZoomLevel(zoom: number, policy: SemanticZoomPolicy = DEFAULT_SEMANTIC_ZOOM_POLICY): SemanticZoomLevel {
  assertFinitePositive("zoom", zoom); assertFinitePositive("colonyAt", policy.colonyAt); assertFinitePositive("representativeCellAt", policy.representativeCellAt);
  if (policy.representativeCellAt <= policy.colonyAt) throw new RangeError("representativeCellAt must be greater than colonyAt");
  if (zoom >= policy.representativeCellAt) return "representative-cell";
  if (zoom >= policy.colonyAt) return "colony";
  return "dish";
}

export function validateRenderSnapshot(snapshot: DishRenderSnapshot): void {
  if (!snapshot.snapshotId) throw new TypeError("snapshotId must be non-empty");
  if (!snapshot.samplingIdentity) throw new TypeError("samplingIdentity must be non-empty");
  assertFiniteNonNegative("simulationTimeHours", snapshot.simulationTimeHours); assertPositiveInteger("gridWidth", snapshot.gridWidth); assertPositiveInteger("gridHeight", snapshot.gridHeight);
  const cells = snapshot.gridWidth * snapshot.gridHeight;
  assertLength("dishMask", snapshot.dishMask.length, cells); assertLength("biomass", snapshot.biomass.length, cells); assertFiniteNonNegativeArray("biomass", snapshot.biomass);
  for (const field of snapshot.fields) {
    if (!field.id || !field.label || !field.unit) throw new TypeError("render fields require id, label and unit metadata");
    if (!isOverlayKind(String(field.kind))) throw new RangeError(`unsupported overlay kind: ${String(field.kind)}`);
    if (field.width !== snapshot.gridWidth || field.height !== snapshot.gridHeight) throw new RangeError(`field ${field.id} dimensions must match snapshot grid`);
    assertLength(`field ${field.id}`, field.values.length, cells); assertFiniteArray(`field ${field.id}`, field.values);
    if (!Number.isFinite(field.minimum) || !Number.isFinite(field.maximum)) throw new TypeError(`field ${field.id} bounds must be finite`);
    if (field.maximum < field.minimum) throw new RangeError(`field ${field.id} maximum must be >= minimum`);
  }
  const lineageIds = new Set<string>();
  for (const lineage of snapshot.lineages) {
    if (!lineage.id || !lineage.label) throw new TypeError("render lineages require identity and presentation metadata");
    if (!isLineageAppearanceToken(lineage.appearanceToken)) throw new RangeError(`unsupported lineage appearance token: ${String(lineage.appearanceToken)}`);
    if (!isLineagePatternToken(lineage.patternToken)) throw new RangeError(`unsupported lineage pattern token: ${String(lineage.patternToken)}`);
    if (lineageIds.has(lineage.id)) throw new RangeError(`duplicate lineage id: ${lineage.id}`); lineageIds.add(lineage.id);
    assertLength(`lineage ${lineage.id}`, lineage.density.length, cells); assertFiniteNonNegativeArray(`lineage ${lineage.id}`, lineage.density);
  }
  for (const mask of snapshot.dishMask) if (mask !== 0 && mask !== 1) throw new RangeError("dishMask values must be 0 or 1");
}
function assertPositiveInteger(name: string, value: number): void { if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`); }
function assertFinitePositive(name: string, value: number): void { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and > 0`); }
function assertFiniteNonNegative(name: string, value: number): void { if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and >= 0`); }
function assertLength(name: string, actual: number, expected: number): void { if (actual !== expected) throw new RangeError(`${name} length ${actual} does not match grid cell count ${expected}`); }
function assertFiniteArray(name: string, values: Float32Array): void { for (const value of values) if (!Number.isFinite(value)) throw new RangeError(`${name} contains a non-finite value`); }
function assertFiniteNonNegativeArray(name: string, values: Float32Array): void { for (const value of values) if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} contains a non-finite or negative value`); }
