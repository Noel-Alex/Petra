import { gridCellCenter } from "./gridGeometry";
import type { CameraView, RenderLineage, SemanticZoomLevel } from "./model";
import type { DishVisualState } from "./visualInterpolation";

export const GLYPH_SAMPLING_SCHEMA_VERSION = 1 as const;

export interface GlyphSample {
  readonly lineageId: string;
  readonly cellIndex: number;
  readonly x: number;
  readonly y: number;
  readonly weight: number;
}

export interface PreparedGlyphCandidate extends GlyphSample {
  readonly score: number;
}

export interface GlyphSamplingOptions {
  readonly maxGlyphs: number;
  readonly minimumDensity: number;
}

/**
 * Camera-independent deterministic visual-proxy preparation.
 *
 * The returned ordering is the exact stable score/tie-break ordering used by
 * the public sampler. Keeping viewport filtering out of this pass lets Pixi
 * reuse the expensive grid scan across camera-only redraws without changing
 * which proxies are selected for any camera.
 */
export function prepareRepresentativeGlyphCandidates(
  snapshot: DishVisualState,
  minimumDensity: number,
): readonly PreparedGlyphCandidate[] {
  requireMinimumDensity(minimumDensity);

  const candidates: PreparedGlyphCandidate[] = [];
  for (const lineage of snapshot.lineages) {
    collectLineageCandidates(
      snapshot,
      lineage,
      minimumDensity,
      candidates,
    );
  }
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      a.lineageId.localeCompare(b.lineageId) ||
      a.cellIndex - b.cellIndex,
  );
  return candidates;
}

/**
 * Cheap camera-dependent selection from a prepared, score-ordered candidate
 * list. The visible-circle filter and budget exactly match the legacy sampler.
 */
export function selectRepresentativeGlyphs(
  candidates: readonly PreparedGlyphCandidate[],
  camera: CameraView,
  maxGlyphs: number,
): readonly GlyphSample[] {
  requireMaxGlyphs(maxGlyphs);
  if (maxGlyphs === 0) return [];

  const visibleRadius = 0.5 / Math.max(1, camera.zoom);
  const radiusSquared = visibleRadius * visibleRadius;
  const selected: GlyphSample[] = [];

  for (const candidate of candidates) {
    const dx = candidate.x - camera.centerX;
    const dy = candidate.y - camera.centerY;
    if (dx * dx + dy * dy > radiusSquared) continue;

    selected.push({
      lineageId: candidate.lineageId,
      cellIndex: candidate.cellIndex,
      x: candidate.x,
      y: candidate.y,
      weight: candidate.weight,
    });
    if (selected.length >= maxGlyphs) break;
  }

  return selected;
}

/** Deterministic visual-proxy sampling. A glyph is not one bacterium. */
export function sampleRepresentativeGlyphs(
  snapshot: DishVisualState,
  camera: CameraView,
  level: SemanticZoomLevel,
  options: GlyphSamplingOptions,
): readonly GlyphSample[] {
  requireMaxGlyphs(options.maxGlyphs);
  requireMinimumDensity(options.minimumDensity);
  if (options.maxGlyphs === 0 || level === "dish") return [];

  return selectRepresentativeGlyphs(
    prepareRepresentativeGlyphCandidates(
      snapshot,
      options.minimumDensity,
    ),
    camera,
    options.maxGlyphs,
  );
}

function collectLineageCandidates(
  snapshot: DishVisualState,
  lineage: RenderLineage,
  minimumDensity: number,
  output: PreparedGlyphCandidate[],
): void {
  for (let cellIndex = 0; cellIndex < lineage.density.length; cellIndex += 1) {
    const weight = lineage.density[cellIndex] ?? 0;
    if (
      weight < minimumDensity ||
      snapshot.dishMask[cellIndex] !== 1
    ) {
      continue;
    }

    const center = gridCellCenter(
      cellIndex,
      snapshot.gridWidth,
      snapshot.gridHeight,
    );

    output.push({
      lineageId: lineage.id,
      cellIndex,
      x: center.x,
      y: center.y,
      weight,
      score: stableScore(snapshot, lineage.id, cellIndex, weight),
    });
  }
}
function stableScore(
  snapshot: Pick<
    DishVisualState,
    "samplingIdentity" | "gridWidth" | "gridHeight"
  >,
  lineageId: string,
  cellIndex: number,
  weight: number,
): number {
  let hash = 2166136261;
  const key =
    `glyph-v${GLYPH_SAMPLING_SCHEMA_VERSION}|` +
    `${snapshot.samplingIdentity}|${snapshot.gridWidth}x${snapshot.gridHeight}|` +
    `${lineageId}|${cellIndex}`;

  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return Math.log1p(weight) + ((hash >>> 0) / 0xffffffff) * 0.15;
}

function requireMaxGlyphs(maxGlyphs: number): void {
  if (!Number.isInteger(maxGlyphs) || maxGlyphs < 0) {
    throw new RangeError("maxGlyphs must be a non-negative integer");
  }
}

function requireMinimumDensity(minimumDensity: number): void {
  if (!Number.isFinite(minimumDensity) || minimumDensity < 0) {
    throw new RangeError("minimumDensity must be finite and >= 0");
  }
}
