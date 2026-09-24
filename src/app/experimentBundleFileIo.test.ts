import { describe, expect, it, vi } from "vitest";

import {
  MAX_EXPERIMENT_BUNDLE_FILE_BYTES,
  createExperimentBundleBlob,
  inspectExperimentBundleFile,
} from "./experimentBundleFileIo";
import type { ExperimentBundleExportFile } from "./experimentBundleHandoff";

function prepared(): ExperimentBundleExportFile {
  return {
    filename: "petra-fixture-seed-42.petra.json",
    mimeType: "application/json",
    text: "{\"kind\":\"petra-experiment-bundle\"}",
    summary: {
      authority: "synthetic",
      scenarioId: "fixture",
      scenarioVersion: "1",
      seed: 42,
      parameterSetId: null,
      parameterSetVersion: null,
      parameterSetBinding: null,
      originTick: 0,
      originSimulationTimeHours: 0,
      originCommandCount: 0,
      replayCommandCount: 0,
      replayCompatibility: "compatible-current-runtime",
    },
  };
}

describe("experiment bundle browser file I/O", () => {
  it("creates a JSON Blob from the canonical prepared export", async () => {
    const value = prepared();
    const blob = createExperimentBundleBlob(value);
    expect(blob.type).toBe("application/json");
    expect(await blob.text()).toBe(value.text);
  });

  it("refuses oversized files before reading their contents", async () => {
    const text = vi.fn(async () => "unused");
    const result = await inspectExperimentBundleFile({
      name: "large.petra.json",
      size: MAX_EXPERIMENT_BUNDLE_FILE_BYTES + 1,
      type: "application/json",
      text,
    });
    expect(result).toMatchObject({ status: "refused", category: "file-too-large" });
    expect(text).not.toHaveBeenCalled();
  });

  it("accepts an empty browser MIME and delegates malformed content to the canonical inspector", async () => {
    const result = await inspectExperimentBundleFile({
      name: "fixture.petra.json",
      size: 8,
      type: "",
      text: async () => "not-json",
    });
    expect(result).toMatchObject({
      status: "inspected",
      filename: "fixture.petra.json",
      inspection: { status: "refused", category: "malformed-file", errorCode: "malformed-json" },
    });
  });

  it("bounds unsupported MIME and local read failures", async () => {
    const wrongType = await inspectExperimentBundleFile({
      name: "fixture.txt",
      size: 4,
      type: "text/plain",
      text: async () => "{}",
    });
    expect(wrongType).toMatchObject({ status: "refused", category: "unsupported-file-type" });

    const readFailure = await inspectExperimentBundleFile({
      name: "fixture.petra.json",
      size: 4,
      type: "application/json",
      text: async () => { throw new Error("read failed"); },
    });
    expect(readFailure).toMatchObject({ status: "refused", category: "file-read-failed" });
  });
});
