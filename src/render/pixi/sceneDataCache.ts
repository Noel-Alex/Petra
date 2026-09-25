import { extractFieldContourSegments } from "../fieldContours";
import { extractLineageDensityContourSegments } from "../lineageDensityContours";
import { resolveSharedLineageDensityMaximum } from "../lineageDensityPresentation";
import type { RenderField } from "../model";
import type { ScalarContourSegment } from "../scalarContours";
import type { DishVisualState } from "../visualInterpolation";

export interface PreparedContourLevel {
  readonly level: number;
  readonly segments: readonly ScalarContourSegment[];
}

export interface PreparedLineageContours {
  readonly lineageId: string;
  readonly levels: readonly PreparedContourLevel[];
}

export interface PreparedDishSceneData {
  readonly overlay: RenderField | null;
  readonly fieldContourLevels: readonly PreparedContourLevel[];
  readonly lineageDensityMaximum: number;
  readonly lineageContours: readonly PreparedLineageContours[];
}

export interface DishSceneDataCache {
  resolve(
    snapshot: DishVisualState,
    visualStateRevision: number,
    overlayId: string | null,
  ): PreparedDishSceneData;
}

/**
 * Caches data-space renderer preparation independently from camera state.
 *
 * The caller owns visualStateRevision and must advance it whenever mutable
 * presentation buffers change (including interpolation frames). Camera,
 * selection, resize and other screen-space changes intentionally do not
 * participate in this key.
 */
export function createDishSceneDataCache(): DishSceneDataCache {
  let cachedRevision = -1;
  let cachedOverlayId: string | null = null;
  let cached: PreparedDishSceneData | null = null;

  return {
    resolve(snapshot, visualStateRevision, overlayId) {
      if (
        !Number.isSafeInteger(visualStateRevision) ||
        visualStateRevision < 0
      ) {
        throw new RangeError(
          "visualStateRevision must be a non-negative safe integer",
        );
      }

      if (
        cached !== null &&
        cachedRevision === visualStateRevision &&
        cachedOverlayId === overlayId
      ) {
        return cached;
      }

      const overlay =
        overlayId === null
          ? snapshot.fields.find((field) => field.kind === "antibiotic") ?? null
          : snapshot.fields.find((field) => field.id === overlayId) ?? null;
      const lineageDensityMaximum =
        resolveSharedLineageDensityMaximum(snapshot);

      cached = Object.freeze({
        overlay,
        fieldContourLevels:
          overlay === null
            ? Object.freeze([])
            : groupContourSegments(
                extractFieldContourSegments({
                  field: overlay,
                  dishMask: snapshot.dishMask,
                  gridWidth: snapshot.gridWidth,
                  gridHeight: snapshot.gridHeight,
                }),
              ),
        lineageDensityMaximum,
        lineageContours: Object.freeze(
          snapshot.lineages.map((lineage) =>
            Object.freeze({
              lineageId: lineage.id,
              levels: groupContourSegments(
                extractLineageDensityContourSegments({
                  lineage,
                  dishMask: snapshot.dishMask,
                  gridWidth: snapshot.gridWidth,
                  gridHeight: snapshot.gridHeight,
                  sharedMaximum: lineageDensityMaximum,
                }),
              ),
            }),
          ),
        ),
      });
      cachedRevision = visualStateRevision;
      cachedOverlayId = overlayId;
      return cached;
    },
  };
}

function groupContourSegments(
  segments: readonly ScalarContourSegment[],
): readonly PreparedContourLevel[] {
  const groups: Array<{
    level: number;
    segments: ScalarContourSegment[];
  }> = [];

  for (const segment of segments) {
    const current = groups.at(-1);
    if (current?.level === segment.level) {
      current.segments.push(segment);
      continue;
    }
    groups.push({ level: segment.level, segments: [segment] });
  }

  return Object.freeze(
    groups.map((group) =>
      Object.freeze({
        level: group.level,
        segments: Object.freeze([...group.segments]),
      }),
    ),
  );
}
