export interface AggregateTrainingRow {
  readonly features: Readonly<Record<string, number>>;
  readonly targets: Readonly<Record<string, number>>;
}

export interface ConstantBaselineModel {
  readonly schemaVersion: "petra-constant-baseline-v1";
  readonly featureIds: readonly string[];
  readonly targetIds: readonly string[];
  readonly targetMeans: Readonly<Record<string, number>>;
}

export interface RidgeBaselineModel {
  readonly schemaVersion: "petra-ridge-baseline-v1";
  readonly featureIds: readonly string[];
  readonly targetIds: readonly string[];
  readonly lambda: number;
  readonly featureMeans: readonly number[];
  readonly featureScales: readonly number[];
  readonly intercepts: Readonly<Record<string, number>>;
  readonly coefficients: Readonly<Record<string, readonly number[]>>;
}

export type AggregateBaselineModel = ConstantBaselineModel | RidgeBaselineModel;

export function trainConstantBaseline(args: {
  readonly featureIds: readonly string[];
  readonly targetIds: readonly string[];
  readonly rows: readonly AggregateTrainingRow[];
}): ConstantBaselineModel {
  const featureIds = validateIds("feature", args.featureIds);
  const targetIds = validateIds("target", args.targetIds);
  validateRows(args.rows, featureIds, targetIds);

  const targetMeans: Record<string, number> = {};
  for (const targetId of targetIds) {
    targetMeans[targetId] = mean(args.rows.map((row) => row.targets[targetId]!));
  }

  return {
    schemaVersion: "petra-constant-baseline-v1",
    featureIds,
    targetIds,
    targetMeans,
  };
}

export function trainRidgeBaseline(args: {
  readonly featureIds: readonly string[];
  readonly targetIds: readonly string[];
  readonly rows: readonly AggregateTrainingRow[];
  readonly lambda: number;
}): RidgeBaselineModel {
  const featureIds = validateIds("feature", args.featureIds);
  const targetIds = validateIds("target", args.targetIds);
  validateRows(args.rows, featureIds, targetIds);
  if (!Number.isFinite(args.lambda) || args.lambda <= 0) {
    throw new RangeError("ridge lambda must be finite and > 0");
  }

  const featureMeans = featureIds.map((featureId) =>
    mean(args.rows.map((row) => row.features[featureId]!)),
  );
  const featureScales = featureIds.map((featureId, featureIndex) => {
    const center = featureMeans[featureIndex]!;
    const variance = mean(
      args.rows.map((row) => {
        const delta = row.features[featureId]! - center;
        return delta * delta;
      }),
    );
    const scale = Math.sqrt(variance);
    return scale > 0 ? scale : 1;
  });

  const x = args.rows.map((row) =>
    featureIds.map(
      (featureId, featureIndex) =>
        (row.features[featureId]! - featureMeans[featureIndex]!) /
        featureScales[featureIndex]!,
    ),
  );

  const coefficients: Record<string, readonly number[]> = {};
  const intercepts: Record<string, number> = {};
  for (const targetId of targetIds) {
    const y = args.rows.map((row) => row.targets[targetId]!);
    const intercept = mean(y);
    const centeredY = y.map((value) => value - intercept);
    coefficients[targetId] = solveRidge(x, centeredY, args.lambda);
    intercepts[targetId] = intercept;
  }

  return {
    schemaVersion: "petra-ridge-baseline-v1",
    featureIds,
    targetIds,
    lambda: args.lambda,
    featureMeans,
    featureScales,
    intercepts,
    coefficients,
  };
}

export function predictAggregateBaseline(
  model: AggregateBaselineModel,
  features: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  assertExactFiniteRecord(features, model.featureIds, "prediction features");
  if (model.schemaVersion === "petra-constant-baseline-v1") {
    return { ...model.targetMeans };
  }

  if (
    model.featureMeans.length !== model.featureIds.length ||
    model.featureScales.length !== model.featureIds.length
  ) {
    throw new TypeError("ridge model feature normalization shape is invalid");
  }

  const normalized = model.featureIds.map((featureId, index) => {
    const meanValue = model.featureMeans[index];
    const scale = model.featureScales[index];
    if (
      meanValue === undefined ||
      scale === undefined ||
      !Number.isFinite(meanValue) ||
      !Number.isFinite(scale) ||
      scale <= 0
    ) {
      throw new TypeError("ridge model feature normalization is invalid");
    }
    return (features[featureId]! - meanValue) / scale;
  });

  const prediction: Record<string, number> = {};
  for (const targetId of model.targetIds) {
    const intercept = model.intercepts[targetId];
    const weights = model.coefficients[targetId];
    if (
      intercept === undefined ||
      !Number.isFinite(intercept) ||
      weights === undefined ||
      weights.length !== model.featureIds.length
    ) {
      throw new TypeError(`ridge model target parameters are invalid: ${targetId}`);
    }
    let value = intercept;
    for (let index = 0; index < weights.length; index += 1) {
      const weight = weights[index]!;
      if (!Number.isFinite(weight)) {
        throw new TypeError(`ridge model coefficient is invalid: ${targetId}`);
      }
      value += weight * normalized[index]!;
    }
    if (!Number.isFinite(value)) {
      throw new RangeError(`ridge prediction is non-finite: ${targetId}`);
    }
    prediction[targetId] = value;
  }
  return prediction;
}

function solveRidge(
  x: readonly (readonly number[])[],
  y: readonly number[],
  lambda: number,
): readonly number[] {
  const width = x[0]?.length ?? 0;
  if (width === 0) return [];
  const matrix = Array.from({ length: width }, (_, row) =>
    Array.from({ length: width }, (_, column) => {
      let value = row === column ? lambda : 0;
      for (const sample of x) value += sample[row]! * sample[column]!;
      return value;
    }),
  );
  const rhs = Array.from({ length: width }, (_, column) => {
    let value = 0;
    for (let row = 0; row < x.length; row += 1) {
      value += x[row]![column]! * y[row]!;
    }
    return value;
  });
  return solveLinearSystem(matrix, rhs);
}

function solveLinearSystem(matrix: number[][], rhs: number[]): readonly number[] {
  const n = rhs.length;
  for (let pivot = 0; pivot < n; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < n; row += 1) {
      if (Math.abs(matrix[row]![pivot]!) > Math.abs(matrix[best]![pivot]!)) {
        best = row;
      }
    }
    [matrix[pivot], matrix[best]] = [matrix[best]!, matrix[pivot]!];
    [rhs[pivot], rhs[best]] = [rhs[best]!, rhs[pivot]!];

    const diagonal = matrix[pivot]![pivot]!;
    if (!Number.isFinite(diagonal) || Math.abs(diagonal) < 1e-15) {
      throw new RangeError("ridge normal equation is singular");
    }
    for (let column = pivot; column < n; column += 1) {
      matrix[pivot]![column] /= diagonal;
    }
    rhs[pivot] /= diagonal;

    for (let row = 0; row < n; row += 1) {
      if (row === pivot) continue;
      const factor = matrix[row]![pivot]!;
      if (factor === 0) continue;
      for (let column = pivot; column < n; column += 1) {
        matrix[row]![column] -= factor * matrix[pivot]![column]!;
      }
      rhs[row] -= factor * rhs[pivot]!;
    }
  }
  if (rhs.some((value) => !Number.isFinite(value))) {
    throw new RangeError("ridge solution is non-finite");
  }
  return rhs;
}

function validateRows(
  rows: readonly AggregateTrainingRow[],
  featureIds: readonly string[],
  targetIds: readonly string[],
): void {
  if (rows.length === 0) throw new RangeError("at least one training row is required");
  rows.forEach((row, index) => {
    assertExactFiniteRecord(row.features, featureIds, `training features row ${index}`);
    assertExactFiniteRecord(row.targets, targetIds, `training targets row ${index}`);
  });
}

function validateIds(kind: string, ids: readonly string[]): readonly string[] {
  if (ids.length === 0) throw new RangeError(`at least one ${kind} id is required`);
  const seen = new Set<string>();
  for (const id of ids) {
    if (id.trim().length === 0) throw new TypeError(`${kind} ids must be non-empty`);
    if (seen.has(id)) throw new TypeError(`duplicate ${kind} id: ${id}`);
    seen.add(id);
  }
  return [...ids];
}

function assertExactFiniteRecord(
  record: Readonly<Record<string, number>>,
  ids: readonly string[],
  label: string,
): void {
  const expected = [...ids].sort();
  const actual = Object.keys(record).sort();
  if (actual.join("\u0000") !== expected.join("\u0000")) {
    throw new TypeError(`${label} must exactly match declared ids`);
  }
  for (const id of ids) {
    if (!Number.isFinite(record[id])) {
      throw new RangeError(`${label} contains non-finite value for ${id}`);
    }
  }
}

function mean(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isFinite(total)) throw new RangeError("numeric accumulation overflowed");
  }
  const result = total / values.length;
  if (!Number.isFinite(result)) throw new RangeError("numeric mean is non-finite");
  return result;
}
