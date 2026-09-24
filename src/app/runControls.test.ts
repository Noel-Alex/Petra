import { describe, expect, it } from "vitest";

import { MAX_SIMULATION_SEED } from "../sim/protocol";
import { parseSeedDraft, SEED_INPUT_ERROR } from "./runControls";

describe("run-control seed draft", () => {
  it("accepts the complete canonical uint32 domain endpoints", () => {
    expect(parseSeedDraft("0")).toEqual({ seed: 0, error: null });
    expect(parseSeedDraft(String(MAX_SIMULATION_SEED))).toEqual({
      seed: MAX_SIMULATION_SEED,
      error: null,
    });
  });

  it("accepts decimal leading zeros and returns the canonical number", () => {
    expect(parseSeedDraft("00042")).toEqual({ seed: 42, error: null });
  });

  it.each(["", " ", "-1", "+1", "1.5", "1e3", "4294967296", "NaN"])(
    "rejects non-canonical seed draft %s",
    (value) => {
      expect(parseSeedDraft(value)).toEqual({
        seed: null,
        error: SEED_INPUT_ERROR,
      });
    },
  );
});
