import { describe, expect, it } from "vitest";
import {
  predictAggregateBaseline,
  trainConstantBaseline,
  trainRidgeBaseline,
} from "./baselines";

describe("aggregate baseline training", () => {
  const rows = [
    { features: { x: 0, z: 2 }, targets: { y: 1 } },
    { features: { x: 1, z: 2 }, targets: { y: 3 } },
    { features: { x: 2, z: 2 }, targets: { y: 5 } },
    { features: { x: 3, z: 2 }, targets: { y: 7 } },
  ] as const;

  it("trains a deterministic constant mean baseline", () => {
    const model = trainConstantBaseline({
      featureIds: ["x", "z"],
      targetIds: ["y"],
      rows,
    });
    expect(model.targetMeans.y).toBe(4);
    expect(predictAggregateBaseline(model, { x: 99, z: -3 })).toEqual({ y: 4 });
  });

  it("fits a regularized linear baseline while tolerating constant features", () => {
    const model = trainRidgeBaseline({
      featureIds: ["x", "z"],
      targetIds: ["y"],
      rows,
      lambda: 1e-6,
    });
    const low = predictAggregateBaseline(model, { x: 0, z: 2 }).y!;
    const high = predictAggregateBaseline(model, { x: 3, z: 2 }).y!;
    expect(low).toBeCloseTo(1, 4);
    expect(high).toBeCloseTo(7, 4);
    expect(model.featureScales[1]).toBe(1);
  });

  it("is independent of training row order", () => {
    const forward = trainRidgeBaseline({
      featureIds: ["x", "z"],
      targetIds: ["y"],
      rows,
      lambda: 0.25,
    });
    const reverse = trainRidgeBaseline({
      featureIds: ["x", "z"],
      targetIds: ["y"],
      rows: [...rows].reverse(),
      lambda: 0.25,
    });
    expect(reverse).toEqual(forward);
  });

  it("fails closed on schema mismatch, non-finite data, and invalid regularization", () => {
    expect(() =>
      trainConstantBaseline({
        featureIds: ["x"],
        targetIds: ["y"],
        rows: [{ features: { x: 1, extra: 2 }, targets: { y: 1 } }],
      }),
    ).toThrow(/exactly match/);

    expect(() =>
      trainRidgeBaseline({
        featureIds: ["x"],
        targetIds: ["y"],
        rows: [{ features: { x: Number.NaN }, targets: { y: 1 } }],
        lambda: 1,
      }),
    ).toThrow(/non-finite/);

    expect(() =>
      trainRidgeBaseline({
        featureIds: ["x"],
        targetIds: ["y"],
        rows: [{ features: { x: 1 }, targets: { y: 1 } }],
        lambda: 0,
      }),
    ).toThrow(/lambda/);
  });

  it("rejects prediction feature drift instead of silently ignoring fields", () => {
    const model = trainConstantBaseline({
      featureIds: ["x"],
      targetIds: ["y"],
      rows: [{ features: { x: 1 }, targets: { y: 2 } }],
    });
    expect(() => predictAggregateBaseline(model, { x: 1, other: 2 })).toThrow(
      /exactly match/,
    );
  });
});
