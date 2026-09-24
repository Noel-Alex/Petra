import { describe, expect, it } from "vitest";

import { SimulationRng, type RngState } from "../../src/sim/rng";

describe("SimulationRng checkpoint state integrity", () => {
  it("round-trips every valid uint32 word exactly", () => {
    const state: RngState = [0, 1, 0xffff_ffff, 2];
    const restored = new SimulationRng(state);

    expect(restored.snapshot()).toEqual(state);

    const original = new SimulationRng(42);
    original.restore(state);
    expect(original.snapshot()).toEqual(state);
  });

  it("preserves the same future trajectory after snapshot restore", () => {
    const first = new SimulationRng(2026);
    first.nextUint32();
    first.nextUint32();
    const checkpoint = first.snapshot();

    const restored = new SimulationRng(checkpoint);
    const committed = new SimulationRng(1);
    committed.restore(checkpoint);

    const expected = Array.from({ length: 8 }, () => first.nextUint32());
    expect(Array.from({ length: 8 }, () => restored.nextUint32())).toEqual(
      expected,
    );
    expect(Array.from({ length: 8 }, () => committed.nextUint32())).toEqual(
      expected,
    );
  });

  it.each([
    0.5,
    -1,
    0x1_0000_0000,
    0x1_0000_0001,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("rejects malformed serialized word %s instead of coercing it", (word) => {
    const malformed = [word, 1, 2, 3] as unknown as RngState;
    expect(() => new SimulationRng(malformed)).toThrow(
      /unsigned 32-bit integer/,
    );
  });

  it("rejects malformed length and the forbidden all-zero xoshiro state", () => {
    expect(
      () => new SimulationRng([1, 2, 3] as unknown as RngState),
    ).toThrow(/exactly four/);
    expect(() => new SimulationRng([0, 0, 0, 0])).toThrow(/all zero/);
  });

  it("leaves the live stream unchanged when restore rejects corrupt state", () => {
    const rng = new SimulationRng(77);
    const before = rng.snapshot();

    expect(() =>
      rng.restore([-1, 1, 2, 3] as unknown as RngState),
    ).toThrow(/unsigned 32-bit integer/);

    expect(rng.snapshot()).toEqual(before);
  });
});
