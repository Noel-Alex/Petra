import { describe, expect, it } from "vitest";

import { keepAnalysisDataScrollKeyLocal } from "./analysisKeyboard";

describe("analysis data scroller keyboard ownership", () => {
  it.each([" ", "Spacebar"])(
    "keeps %j local without owning the browser default",
    (key) => {
      let stopped = 0;

      keepAnalysisDataScrollKeyLocal({
        key,
        stopPropagation: () => {
          stopped += 1;
        },
      });

      expect(stopped).toBe(1);
    },
  );

  it("lets unrelated App shortcuts bubble unchanged", () => {
    for (const key of [".", "1", "2", "3", "Escape", "Enter"]) {
      let stopped = 0;

      keepAnalysisDataScrollKeyLocal({
        key,
        stopPropagation: () => {
          stopped += 1;
        },
      });

      expect(stopped).toBe(0);
    }
  });
});
