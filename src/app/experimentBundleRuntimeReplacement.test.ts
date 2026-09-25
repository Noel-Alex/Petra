import { describe, expect, it } from "vitest";

import { buildDefaultFlagshipRun } from "./flagshipRunPreset";
import {
  inspectExperimentBundleImport,
  planExperimentBundleReplacement,
  type ExperimentBundleReplacementPlan,
} from "./experimentBundleHandoff";
import {
  createExperimentBundleReplacementRuntimeFactory,
  IMPORTED_BUNDLE_COMMAND_ID_PREFIX,
} from "./experimentBundleRuntimeReplacement";
import {
  WorkerSession,
  type WorkerPort,
  type WorkerPortHandlers,
} from "./workerSession";
import { ComposedSimulationEngine } from "../sim/composedEngine";
import { SimulationEngine } from "../sim/engine";
import {
  createExperimentBundle,
  serializeExperimentBundle,
  type ExperimentBundle,
} from "../sim/experimentBundle";
import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  type RunIdentity,
  type WorkerRequest,
  type WorkerResponse,
} from "../sim/protocol";

function identity(): RunIdentity {
  return {
    engineVersion: ENGINE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    scenarioId: "bundle-runtime-replacement-fixture",
    scenarioVersion: "1",
    parameterSetId: "bundle-runtime-parameters",
    parameterSetVersion: "1",
    seed: 17,
  };
}

class FakePort implements WorkerPort {
  readonly posted: WorkerRequest[] = [];
  private handlers: WorkerPortHandlers | null = null;

  post(request: WorkerRequest): void {
    this.posted.push(structuredClone(request));
  }

  subscribe(handlers: WorkerPortHandlers): () => void {
    this.handlers = handlers;
    return () => {
      this.handlers = null;
    };
  }

  dispose(): void {}

  emit(response: WorkerResponse): void {
    this.handlers?.message(response);
  }
}

function confirmedPlan(
  bundle: ExperimentBundle,
): Extract<ExperimentBundleReplacementPlan, { readonly status: "replace-run" }> {
  const inspection = inspectExperimentBundleImport(
    serializeExperimentBundle(bundle),
  );
  expect(inspection.status).toBe("ready");
  if (inspection.status !== "ready") {
    throw new Error("fixture bundle did not pass canonical import inspection");
  }

  const replacement = planExperimentBundleReplacement({
    inspection,
    confirmed: true,
    confirmationKey: inspection.confirmationKey,
  });
  expect(replacement.status).toBe("replace-run");
  if (replacement.status !== "replace-run") {
    throw new Error("fixture bundle did not produce a replacement plan");
  }
  return replacement;
}

describe("experiment bundle runtime replacement", () => {
  it("returns a fresh idle runtime and replays the exact exported origin plus command suffix", () => {
    const sourceEngine = new SimulationEngine(identity());
    const bundle = createExperimentBundle({
      originCheckpoint: sourceEngine.snapshot().checkpoint,
      commands: [
        {
          id: `${IMPORTED_BUNDLE_COMMAND_ID_PREFIX}-1`,
          type: "advance",
          ticks: 2,
        },
      ],
    });

    const port = new FakePort();
    const factory = createExperimentBundleReplacementRuntimeFactory(
      confirmedPlan(bundle),
      () => new WorkerSession(port),
    );
    const runtime = factory();
    const replayEngine = new SimulationEngine(identity());

    expect(runtime.state.worker.phase).toBe("idle");
    expect(runtime.state.controls.identity).toEqual(bundle.identity);
    expect(runtime.start()).toBe(true);
    expect(port.posted[0]).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      type: "initialize",
      identity: bundle.identity,
    });

    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      snapshot: replayEngine.snapshot(),
    });

    const restoreRequest = port.posted.at(-1);
    expect(restoreRequest).toMatchObject({
      type: "command",
      command: {
        type: "restore",
        checkpoint: bundle.replay.originCheckpoint,
      },
    });
    if (
      restoreRequest?.type !== "command" ||
      restoreRequest.command.type !== "restore"
    ) {
      throw new Error("expected startup checkpoint restore request");
    }
    expect(restoreRequest.command.id).not.toBe(
      `${IMPORTED_BUNDLE_COMMAND_ID_PREFIX}-1`,
    );

    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "snapshot",
      commandId: restoreRequest.command.id,
      snapshot: replayEngine.execute(restoreRequest.command),
    });

    const importedRequest = port.posted.at(-1);
    expect(importedRequest).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      type: "command",
      command: bundle.replay.commands[0],
    });
    if (
      importedRequest?.type !== "command" ||
      importedRequest.command.type !== "advance"
    ) {
      throw new Error("expected imported replay command");
    }

    port.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "snapshot",
      commandId: importedRequest.command.id,
      snapshot: replayEngine.execute(importedRequest.command),
    });

    expect(runtime.state.worker.phase).toBe("ready");
    expect(runtime.state.controls.acceptedCommands).toEqual(
      bundle.replay.commands,
    );
    expect(runtime.state.snapshot?.checkpoint.tick).toBe(2);

    expect(runtime.dispatch({ type: "step", ticks: 1 })).toEqual({
      accepted: true,
      reason: null,
    });
    const localRequest = port.posted.at(-1);
    expect(localRequest).toMatchObject({
      type: "command",
      command: { type: "advance", ticks: 1 },
    });
    if (localRequest?.type === "command") {
      expect(localRequest.command.id).not.toBe(
        bundle.replay.commands[0]?.id,
      );
      expect(localRequest.command.id).not.toBe(
        restoreRequest.command.id,
      );
    }
  });

  it("preserves the exact composed configuration on imported runtime initialization", () => {
    const { plan } = buildDefaultFlagshipRun();
    const engine = new ComposedSimulationEngine(plan.identity, plan.config);
    const bundle = createExperimentBundle({
      originCheckpoint: engine.snapshot().checkpoint,
      commands: [],
      composedConfig: plan.config,
    });
    const port = new FakePort();
    const runtime = createExperimentBundleReplacementRuntimeFactory(
      confirmedPlan(bundle),
      () => new WorkerSession(port),
    )();

    expect(runtime.state.worker.phase).toBe("idle");
    expect(runtime.start()).toBe(true);
    expect(port.posted[0]).toMatchObject({
      type: "initialize",
      identity: plan.identity,
      composedConfig: plan.config,
    });
  });

  it("refuses an unconfirmed replacement plan before constructing a worker session", () => {
    const sourceEngine = new SimulationEngine(identity());
    const inspection = inspectExperimentBundleImport(
      serializeExperimentBundle(
        createExperimentBundle({
          originCheckpoint: sourceEngine.snapshot().checkpoint,
          commands: [],
        }),
      ),
    );
    expect(inspection.status).toBe("ready");
    if (inspection.status !== "ready") return;

    const unconfirmed = planExperimentBundleReplacement({
      inspection,
      confirmed: false,
    });
    expect(unconfirmed.status).toBe("confirmation-required");

    let sessionsCreated = 0;
    expect(() =>
      createExperimentBundleReplacementRuntimeFactory(
        unconfirmed as ExperimentBundleReplacementPlan,
        () => {
          sessionsCreated += 1;
          return new WorkerSession(new FakePort());
        },
      ),
    ).toThrow(/confirmed replace-run plan/);
    expect(sessionsCreated).toBe(0);
  });
});
