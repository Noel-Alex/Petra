export interface GridCellCenter {
  readonly cellIndex: number;
  readonly column: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Maps a row-major render-grid cell to its normalized dish-space center.
 * Presentation geometry only; this does not create biological identity.
 */
export function gridCellCenter(
  cellIndex: number,
  gridWidth: number,
  gridHeight: number,
): GridCellCenter {
  assertPositiveInteger("gridWidth", gridWidth);
  assertPositiveInteger("gridHeight", gridHeight);

  const cellCount = gridWidth * gridHeight;
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= cellCount) {
    throw new RangeError(
      `cellIndex must be an integer in [0, ${Math.max(0, cellCount - 1)}]`,
    );
  }

  const column = cellIndex % gridWidth;
  const row = Math.floor(cellIndex / gridWidth);
  return {
    cellIndex,
    column,
    row,
    x: (column + 0.5) / gridWidth,
    y: (row + 0.5) / gridHeight,
  };
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}
