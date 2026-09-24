import { describe, expect, it } from "vitest";

import { SimulationEngine } from "../sim/engine";
import {
  createExperimentBundle,
  serializeExperimentBundle,
} from "../sim/experimentBundle";
import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  type RunIdentity,
} from "../sim/protocol";
import {
  inspectExperimentBundleImport,
  planExperimentBundleReplacement,
  prepareExperimentBundleExport,
} from "./experimentBundleHandoff";

function identity(): RunIdentity {
  return {
    engineVersion: ENGINE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    scenarioId: "fixture/scenario unsafe",
    scenarioVersion: "1.0.0",
    parameterSetId: "fixture-parameter-set",
    parameterSetVersion: "1",
    seed: 42,
  };
}

function bundle() {
  const engine = new SimulationEngine(identity());
  const origin = engine.snapshot().checkpoint;
  return createExperimentBundle({
    originCheckpoint: origin,
    commands: [{ id: "advance-1", type: "advance", ticks: 2 }],
  });
}

describe("experiment bundle file handoff", () => {
  it("prepares export exclusively through canonical bundle serialization", () => {
    const value = bundle();
    const prepared = prepareExperimentBundleExport(value);

    expect(prepared.text).toBe(serializeExperimentBundle(value));
    expect(prepared.mimeType).toBe("application/json");
    expect(prepared.filename).toBe(
      "petra-fixture-scenario-unsafe-seed-42.petra.json",
    );
    expect(prepared.summary).toMatchObject({
      authority: "synthetic",
      scenarioId: "fixture/scenario unsafe",
      scenarioVersion: "1.0.0",
      seed: 42,
      parameterSetId: "fixture-parameter-set",
      parameterSetVersion: "1",
      originTick: 0,
      originSimulationTimeHours: 0,
      originCommandCount: 0,
      replayCommandCount: 1,
      replayCompatibility: "compatible-current-runtime",
    });
  });

  it("parses a compatible bundle before exposing replacement metadata", () => {
    const input = bundle();
    const inspection = inspectExperimentBundleImport(
      serializeExperimentBundle(input),
    );

    expect(inspection.status).toBe("ready");
    if (inspection.status !== "ready") return;

    expect(inspection.bundle).toEqual(input);
    expect(inspection.summary.scenarioId).toBe("fixture/scenario unsafe");
    expect(inspection.summary.seed).toBe(42);
    expect(inspection.confirmationKey).toContain("advance:advance-1");
  });

  it("requires explicit matching confirmation before run replacement", () => {
    const inspection = inspectExperimentBundleImport(
      serializeExperimentBundle(bundle()),
    );
    expect(inspection.status).toBe("ready");
    if (inspection.status !== "ready") return;

    expect(
      planExperimentBundleReplacement({
        inspection,
        confirmed: false,
      }),
    ).toMatchObject({ status: "confirmation-required" });

    expect(
      planExperimentBundleReplacement({
        inspection,
        confirmed: true,
        confirmationKey: "stale-other-file",
      }),
    ).toMatchObject({ status: "confirmation-required" });

    const plan = planExperimentBundleReplacement({
      inspection,
      confirmed: true,
      confirmationKey: inspection.confirmationKey,
    });
    expect(plan.status).toBe("replace-run");
    if (plan.status === "replace-run") {
      expect(plan.bundle).toBe(inspection.bundle);
      expect(plan.summary).toBe(inspection.summary);
    }
  });

  it("maps malformed input to bounded refusal text without echoing payload content", () => {
    const secret = "VERY-SENSITIVE-RAW-PAYLOAD";
    const inspection = inspectExperimentBundleImport(
      `{"not":"closed", "secret":"${secret}"`,
    );

    expect(inspection).toMatchObject({
      status: "refused",
      category: "malformed-file",
      errorCode: "malformed-json",
    });
    if (inspection.status === "refused") {
      expect(inspection.message).not.toContain(secret);
      expect(inspection.message).toContain("active run was not changed");
    }
  });

  it("maps unsupported schema to a bounded unsupported-bundle refusal", () => {
    const raw = JSON.parse(serializeExperimentBundle(bundle()));
    raw.schemaVersion = 999;

    const inspection = inspectExperimentBundleImport(JSON.stringify(raw));

    expect(inspection).toMatchObject({
      status: "refused",
      category: "unsupported-bundle",
      errorCode: "unsupported-schema",
    });
  });

  it("does not convert a refused import into a replacement plan", () => {
    const inspection = inspectExperimentBundleImport("not-json");
    const plan = planExperimentBundleReplacement({
      inspection,
      confirmed: true,
      confirmationKey: "anything",
    });

    expect(plan).toBe(inspection);
    expect(plan.status).toBe("refused");
  });
});
