import { gridCellCenter } from "../render/gridGeometry";
import type { RenderEvent } from "../render/model";
import {
  LineageRegistry,
  type LineageRegistryCheckpoint,
} from "../sim/evolution/lineage";

export interface LineageOriginRenderEventProjectionInput {
  readonly lineageRegistry: LineageRegistryCheckpoint;
  /** Exact current lineage identity from the enclosing render snapshot. */
  readonly activeLineageIds: readonly string[];
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly dishMask: readonly number[] | Uint8Array;
  readonly snapshotSimulationTimeHours: number;
}

/**
 * Projects replay-critical child-lineage origin cells into renderer point events.
 *
 * This is a presentation projection only. It does not create lineage authority,
 * infer a mutation location from density, or invent a point for records whose
 * authoritative originCellIndex is null.
 *
 * The lineage registry is historical and may retain extinct children after the
 * current composed/render lineage arrays have dropped them. Those historical
 * origins are still validated here, but only currently active lineage identities
 * may become structured RenderEvent lineage references.
 */
export function projectLineageOriginRenderEvents(
  input: LineageOriginRenderEventProjectionInput,
): readonly RenderEvent[] {
  assertGrid(input.gridWidth, input.gridHeight);
  const cells = input.gridWidth * input.gridHeight;
  if (input.dishMask.length !== cells) {
    throw new RangeError(
      "lineage origin render projection mask must match the authoritative grid",
    );
  }
  for (const value of input.dishMask) {
    if (value !== 0 && value !== 1) {
      throw new RangeError(
        "lineage origin render projection requires a binary dish mask",
      );
    }
  }
  if (
    !Number.isFinite(input.snapshotSimulationTimeHours) ||
    input.snapshotSimulationTimeHours < 0
  ) {
    throw new RangeError(
      "lineage origin render projection requires a finite non-negative snapshot time",
    );
  }

  // Restore through the canonical authority boundary before reading records or
  // event order. This rejects reordered/corrupt lineage history rather than
  // normalizing it in presentation code.
  const registry = LineageRegistry.restore(input.lineageRegistry);
  const records = new Map(
    registry.list().map((record) => [record.lineageId, record] as const),
  );
  const activeLineageIds = validateActiveLineageIds(
    input.activeLineageIds,
    records,
  );

  const projected: RenderEvent[] = [];
  for (const event of registry.eventLog()) {
    if (event.kind !== "lineage-created") continue;

    const record = records.get(event.lineageId);
    if (record === undefined) {
      throw new Error(
        `lineage origin render projection event references unknown lineage: ${event.lineageId}`,
      );
    }

    // Runtime mutation children have a parent and an exact origin cell.
    // Founders intentionally have neither a single source cell nor a point
    // marker. A future root inoculation contract must be reviewed separately.
    if (record.parentLineageId === null || record.originCellIndex === null) {
      continue;
    }
    if (event.timeHours > input.snapshotSimulationTimeHours) {
      throw new RangeError(
        `lineage origin render event ${event.lineageId} cannot occur after the snapshot time`,
      );
    }

    const originCellIndex = record.originCellIndex;
    if (originCellIndex >= cells) {
      throw new RangeError(
        `lineage ${record.lineageId} originCellIndex is outside the authoritative grid`,
      );
    }
    if (input.dishMask[originCellIndex] !== 1) {
      throw new RangeError(
        `lineage ${record.lineageId} originCellIndex must be inside the authoritative dish mask`,
      );
    }

    // RenderEvent.lineageId is same-snapshot identity, not a historical foreign
    // key. Extinct children remain in replay-critical registry history, but once
    // absent from the enclosing active lineage set their old point marker is not
    // carried into the current dish snapshot.
    if (!activeLineageIds.has(record.lineageId)) continue;

    const center = gridCellCenter(
      originCellIndex,
      input.gridWidth,
      input.gridHeight,
    );
    projected.push(
      Object.freeze({
        id: `lineage-origin:${record.lineageId}`,
        kind: "lineage-created",
        simulationTimeHours: event.timeHours,
        x: center.x,
        y: center.y,
        lineageId: record.lineageId,
        label:
          record.mutationClass === null
            ? `Lineage ${record.lineageId} originated`
            : `Lineage ${record.lineageId} originated: ${record.mutationClass}`,
      }),
    );
  }

  return Object.freeze(projected);
}

function validateActiveLineageIds(
  lineageIds: readonly string[],
  records: ReadonlyMap<string, unknown>,
): ReadonlySet<string> {
  const active = new Set<string>();
  for (const lineageId of lineageIds) {
    if (
      typeof lineageId !== "string" ||
      lineageId.length === 0 ||
      lineageId !== lineageId.trim()
    ) {
      throw new TypeError(
        "lineage origin render projection active lineage ids must be canonical non-empty strings",
      );
    }
    if (active.has(lineageId)) {
      throw new RangeError(
        `lineage origin render projection active lineage ids must be unique: ${lineageId}`,
      );
    }
    if (!records.has(lineageId)) {
      throw new RangeError(
        `lineage origin render projection active lineage is absent from registry: ${lineageId}`,
      );
    }
    active.add(lineageId);
  }
  return active;
}

function assertGrid(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isSafeInteger(width * height)
  ) {
    throw new RangeError(
      "lineage origin render projection requires positive safe-integer grid dimensions",
    );
  }
}
